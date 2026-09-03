import ARKit
import Foundation
import Observation
import RoomPlan

/// Drives a whole-house scan: one ARKit world frame held across many rooms.
///
/// The important behaviour is in ``finishRoom()``: the RoomPlan capture session is
/// stopped with `pauseARSession: false`, which ends the room without tearing down
/// ARKit world tracking. The user then walks through a doorway and starts the next
/// room *in the same coordinate frame*, which is what makes the merge in
/// ``finishHouse()`` meaningful rather than guesswork (SPEC §4.2).
///
/// When tracking is lost that frame is gone, and continuing silently would corrupt
/// every later room. The coordinator surfaces the loss and offers a new *segment*:
/// a fresh ARSession with its own origin, merged independently.
@MainActor
@Observable
final class CaptureCoordinator {

    enum Phase: Equatable {
        case idle
        /// Between rooms — ARSession live, RoomPlan capture stopped.
        case ready
        case scanningRoom
        case processingRoom
        case finishing
        case finished(scanID: UUID)
        case failed(String)
    }

    struct DraftRoom: Identifiable, Sendable {
        let id: UUID
        var label: String
        let segmentID: UUID
        let room: CapturedRoom
    }

    // MARK: - Observable state

    private(set) var phase: Phase = .idle
    private(set) var scanID: UUID?
    private(set) var scanName: String = ""
    private(set) var draftRooms: [DraftRoom] = []
    private(set) var segmentIDs: [UUID] = []
    private(set) var currentSegmentID = UUID()
    /// Set when a room has been captured and is waiting for its label. The prompt
    /// goes up immediately, while the user is still standing in the room — labelling
    /// retroactively from a wireframe is painful (SPEC §5.2).
    var pendingLabelRoom: PendingLabel?
    /// Raised once when the world frame breaks, so the UI can offer a new segment.
    var trackingLossNeedsDecision = false
    /// The last failure, held until the user acknowledges it. A capture failure that
    /// only gets logged reads to the user as "the app silently lost my room", so
    /// every one of them has to reach the screen.
    var failure: Failure?
    private(set) var lastError: String?

    struct Failure: Identifiable, Sendable {
        let id = UUID()
        var title: String
        var message: String
    }

    let tracking = TrackingMonitor()

    struct PendingLabel: Identifiable, Sendable {
        let id: UUID
        let segmentID: UUID
        var suggestion: String
    }

    // MARK: - Capture plumbing

    @ObservationIgnored private(set) var captureView: RoomCaptureView?
    @ObservationIgnored private var arSession: ARSession?
    @ObservationIgnored private var proxy: RoomCaptureViewProxy?
    @ObservationIgnored private var dataContinuation: CheckedContinuation<CapturedRoomData, any Error>?
    /// Rooms held in memory for the merge, keyed by segment.
    @ObservationIgnored private var capturedRooms: [UUID: [CapturedRoom]] = [:]
    @ObservationIgnored private var pendingRoomData: CapturedRoomData?
    @ObservationIgnored private var pendingRoom: CapturedRoom?
    /// Set when the user tapped Finish House mid-room: the house is finished once
    /// the label for that last room has been given.
    @ObservationIgnored private var shouldFinishAfterLabel = false

    private let store = ScanStore.shared
    private let settings: AppSettings

    init(settings: AppSettings = .shared) {
        self.settings = settings
    }

    var roomCount: Int { draftRooms.count }
    var segmentCount: Int { max(segmentIDs.count, 1) }
    var isSupported: Bool { RoomCaptureSession.isSupported }

    var canFinishHouse: Bool {
        switch phase {
        case .ready: !draftRooms.isEmpty
        case .scanningRoom: true
        default: false
        }
    }

    // MARK: - Lifecycle

    func begin(name: String) async {
        guard isSupported else {
            phase = .failed("This device does not support RoomPlan. A LiDAR iPhone is required.")
            return
        }
        do {
            let manifest = try await store.createScan(name: name)
            scanID = manifest.id
            scanName = manifest.name
            draftRooms = []
            capturedRooms = [:]
            segmentIDs = []
            lastError = nil
            startNewSegment(isFirst: true)
            ScanLog.capture.info("Started scan \(manifest.id, privacy: .public)")
        } catch {
            ScanLog.capture.error("Could not create the scan: \(error.localizedDescription, privacy: .public)")
            phase = .failed(error.localizedDescription)
        }
    }

    /// Fresh ARSession and capture view — a new world origin, and therefore a new
    /// segment that will be merged independently of the ones before it.
    func startNewSegment(isFirst: Bool = false) {
        teardownSession(pauseAR: true)

        let segmentID = isFirst ? currentSegmentID : UUID()
        currentSegmentID = segmentID
        segmentIDs.append(segmentID)

        let session = ARSession()
        // RoomPlan configures and runs this ARSession itself; there is no API to
        // supply an ARWorldTrackingConfiguration to RoomCaptureSession, and running
        // one here would be replaced (or rejected as .invalidARConfiguration).
        // Owning the session object is what matters: it is how HomeScan reads
        // tracking state, retrieves the ARWorldMap, and could add further data
        // streams to the same walkthrough later.
        let view = RoomCaptureView(frame: .zero, arSession: session)
        let proxy = RoomCaptureViewProxy(
            presentsResultView: false,
            onCapturedData: { [weak self] data, error in
                Task { @MainActor in self?.receive(data: data, error: error) }
            }
        )
        view.delegate = proxy

        arSession = session
        captureView = view
        self.proxy = proxy
        tracking.start(session: session)
        trackingLossNeedsDecision = false
        phase = .ready
    }

    /// Called when the user chooses to carry on despite a tracking warning.
    func dismissTrackingLoss() {
        trackingLossNeedsDecision = false
        tracking.resetLossFlag()
    }

    func noteTrackingLossIfNeeded() {
        if tracking.didLoseTracking, !trackingLossNeedsDecision, pendingLabelRoom == nil {
            trackingLossNeedsDecision = true
        }
    }

    // MARK: - Rooms

    func startRoomCapture() {
        guard phase == .ready, let captureView else { return }
        var configuration = RoomCaptureSession.Configuration()
        configuration.isCoachingEnabled = true
        captureView.captureSession.run(configuration: configuration)
        phase = .scanningRoom
    }

    /// How long to wait for RoomPlan to hand the capture back after `stop`. Generous:
    /// the handoff is normally immediate, and the slow part (`RoomBuilder`) happens
    /// after it.
    private static let handoffTimeout: Duration = .seconds(60)

    /// Ends the current room *without* pausing ARKit, then builds it.
    func finishRoom() async {
        guard phase == .scanningRoom, let captureView else { return }
        phase = .processingRoom
        do {
            let data = try await withCheckedThrowingContinuation { continuation in
                dataContinuation = continuation
                // The crux of multi-room continuity: stop the room, keep the frame.
                captureView.captureSession.stop(pauseARSession: false)
                // If the delegate callback never arrives, the screen would sit on
                // "Building room…" indefinitely — which reads as a silent failure.
                // Time it out into an error the user can actually act on.
                Task { @MainActor [weak self] in
                    try? await Task.sleep(for: Self.handoffTimeout)
                    self?.timeOutHandoff()
                }
            }
            let room = try await RoomPlanProcessing.buildRoom(from: data)
            pendingRoomData = data
            pendingRoom = room
            pendingLabelRoom = PendingLabel(
                id: UUID(),
                segmentID: currentSegmentID,
                suggestion: suggestedLabel(for: room)
            )
            phase = .ready
        } catch {
            report("Could not build that room", error)
            phase = .ready
        }
    }

    /// Persists the just-captured room under the label the user gave it.
    func commitPendingRoom(label: String) async {
        guard let pending = pendingLabelRoom,
              let room = pendingRoom,
              let data = pendingRoomData,
              let scanID
        else {
            clearPending()
            return
        }

        let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
        let finalLabel = trimmed.isEmpty ? "Room \(draftRooms.count + 1)" : trimmed
        let exportOptions = settings.exportOptions

        do {
            let record = try await store.saveRoom(
                scanID: scanID,
                segmentID: pending.segmentID,
                roomID: pending.id,
                label: finalLabel,
                rawData: data,
                room: room,
                exportOptions: exportOptions
            )
            draftRooms.append(
                DraftRoom(id: record.id, label: record.label, segmentID: pending.segmentID, room: room)
            )
            capturedRooms[pending.segmentID, default: []].append(room)
            if let archiveError = record.archiveError {
                // The room is saved and measurable, but it can never be re-derived.
                // Worth interrupting for: the archive is the master asset.
                failure = Failure(
                    title: "Saved without its archive",
                    message: "\(record.label) was saved and measured, but the raw capture data could not be archived, so it cannot be re-processed later. \(archiveError)"
                )
            }
        } catch {
            report("Could not save that room", error)
        }
        clearPending()

        if shouldFinishAfterLabel {
            shouldFinishAfterLabel = false
            await finishHouse()
            return
        }
        noteTrackingLossIfNeeded()
    }

    func discardPendingRoom() {
        shouldFinishAfterLabel = false
        clearPending()
    }

    private func report(_ title: String, _ error: any Error) {
        let message = error.localizedDescription
        lastError = message
        failure = Failure(title: title, message: message)
        ScanLog.capture.error("\(title, privacy: .public): \(message, privacy: .public)")
    }

    private func clearPending() {
        pendingLabelRoom = nil
        pendingRoom = nil
        pendingRoomData = nil
    }

    /// RoomPlan's own section labels are a decent first guess for the text field.
    private func suggestedLabel(for room: CapturedRoom) -> String {
        guard let section = room.sections.first else { return "" }
        switch section.label {
        case .livingRoom: return "Living Room"
        case .bedroom: return "Bedroom"
        case .bathroom: return "Bathroom"
        case .kitchen: return "Kitchen"
        case .diningRoom: return "Dining Room"
        case .unidentified: return ""
        @unknown default: return ""
        }
    }

    // MARK: - Finishing

    func finishHouse() async {
        guard let scanID else { return }
        if phase == .scanningRoom {
            // The room in progress still needs a label; commitPendingRoom() picks
            // the finish back up once it has one.
            shouldFinishAfterLabel = true
            await finishRoom()
            if pendingLabelRoom != nil { return }
            shouldFinishAfterLabel = false
        }
        phase = .finishing
        // The world map has to be grabbed while the session is still alive.
        await persistWorldMapIfEnabled()
        teardownSession(pauseAR: true)

        // Merge each segment on its own. Segments have unrelated world origins by
        // construction, so merging across them would be meaningless (SPEC §4.3).
        for segmentID in segmentIDs {
            guard let rooms = capturedRooms[segmentID], rooms.count > 1 else { continue }
            do {
                let structure = try await RoomPlanProcessing.buildStructure(from: rooms)
                try await store.saveStructure(structure, scanID: scanID, segmentID: segmentID)
            } catch {
                // A failed merge is not a failed scan: the individual rooms and their
                // archived intermediates are already on disk, and the schedule falls
                // back to measuring them directly.
                lastError = "Merge failed for one segment: \(error.localizedDescription)"
                ScanLog.capture.error("Merge failed for segment \(segmentID, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }

        do {
            _ = try await store.deriveMeasurements(scanID: scanID)
        } catch {
            report("Could not derive the measurements", error)
        }

        phase = .finished(scanID: scanID)
    }

    /// Abandons an in-progress scan and removes anything already written for it.
    func cancel() async {
        teardownSession(pauseAR: true)
        // Only an empty scan that failed at nothing is safe to throw away. If a save
        // errored, whatever did land on disk is the only evidence of what went wrong.
        if let scanID, draftRooms.isEmpty, lastError == nil {
            try? await store.delete(scanID: scanID)
        }
        clearPending()
        shouldFinishAfterLabel = false
        phase = .idle
        failure = nil
        lastError = nil
        scanID = nil
        draftRooms = []
        capturedRooms = [:]
        segmentIDs = []
    }

    // MARK: - World map (SPEC §5.3, stretch)

    /// Archives the segment's ARWorldMap so a later visit can relocalize into the
    /// same physical space and extend the scan instead of restarting it. Off by
    /// default: identical-layout spaces confuse relocalization, and the maps are big.
    func persistWorldMapIfEnabled() async {
        guard settings.persistWorldMap, let arSession, let scanID else { return }
        let segmentID = currentSegmentID
        // ARWorldMap is not Sendable, so archive it inside the callback and carry
        // the Data across the isolation boundary instead of the map itself.
        let data: Data? = await withCheckedContinuation { continuation in
            arSession.getCurrentWorldMap { map, _ in
                guard let map else {
                    continuation.resume(returning: nil)
                    return
                }
                continuation.resume(
                    returning: try? NSKeyedArchiver.archivedData(withRootObject: map, requiringSecureCoding: true)
                )
            }
        }
        guard let data else { return }
        try? await store.saveWorldMapData(data, scanID: scanID, segmentID: segmentID)
    }

    // MARK: - Internals

    /// Fails a handoff that never completed. No-op once the data has arrived, since
    /// ``receive(data:error:)`` clears the continuation as it resumes it.
    private func timeOutHandoff() {
        guard let continuation = dataContinuation else { return }
        dataContinuation = nil
        continuation.resume(throwing: HandoffError.timedOut)
    }

    enum HandoffError: LocalizedError {
        case timedOut

        var errorDescription: String? {
            switch self {
            case .timedOut:
                "RoomPlan did not return the captured room after the session was stopped. Nothing was saved for this room. If this keeps happening, run Settings ▸ Diagnostics ▸ Capture Smoke Test to check RoomPlan itself on this OS build."
            }
        }
    }

    private func receive(data: CapturedRoomData, error: (any Error)?) {
        guard let continuation = dataContinuation else { return }
        dataContinuation = nil
        if let error {
            continuation.resume(throwing: error)
        } else {
            continuation.resume(returning: data)
        }
    }

    private func teardownSession(pauseAR: Bool) {
        if let captureView, captureView.captureSession != nil {
            captureView.captureSession.stop(pauseARSession: pauseAR)
        }
        if pauseAR {
            arSession?.pause()
            tracking.stop()
            captureView?.delegate = nil
            captureView = nil
            arSession = nil
            proxy = nil
        }
    }
}
