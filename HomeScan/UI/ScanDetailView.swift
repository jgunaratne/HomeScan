import RoomPlan
import SwiftUI

/// Scan detail (SPEC §8): USDZ preview of the merged structure, per-room list with
/// confidence, and the export / sync / re-derive actions.
struct ScanDetailView: View {
    let scanID: UUID

    @Environment(AppSettings.self) private var settings
    @Environment(SyncService.self) private var sync

    @State private var manifest: ScanManifest?
    @State private var schedule: MeasurementSchedule?
    @State private var previewURL: URL?
    @State private var sizeOnDisk: Int64 = 0
    @State private var isPresentingPreview = false
    @State private var shareItems: [Any]?
    @State private var busyMessage: String?
    @State private var message: String?

    private let store = ScanStore.shared

    var body: some View {
        List {
            if let manifest {
                previewSection(manifest)
                totalSection
                roomsSection(manifest)
                actionsSection(manifest)
                detailsSection(manifest)
            } else {
                ProgressView()
            }
        }
        .navigationTitle(manifest?.name ?? "Scan")
        .navigationBarTitleDisplayMode(.inline)
        .task { await reload() }
        .overlay {
            if let busyMessage {
                ProgressView(busyMessage)
                    .padding(20)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
            }
        }
        .sheet(isPresented: $isPresentingPreview) {
            if let previewURL {
                NavigationStack {
                    QuickLookView(url: previewURL)
                        .ignoresSafeArea()
                        .navigationTitle("3D Preview")
                        .navigationBarTitleDisplayMode(.inline)
                }
            }
        }
        .sheet(isPresented: Binding(get: { shareItems != nil }, set: { if !$0 { shareItems = nil } })) {
            if let shareItems {
                ShareSheet(items: shareItems)
            }
        }
        .alert("HomeScan", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("OK") { message = nil }
        } message: {
            Text(message ?? "")
        }
    }

    // MARK: - Sections

    @ViewBuilder
    private func previewSection(_ manifest: ScanManifest) -> some View {
        Section {
            if previewURL != nil {
                Button {
                    isPresentingPreview = true
                } label: {
                    Label("Open 3D Preview", systemImage: "cube.transparent")
                }
            } else {
                Label("No USDZ export available", systemImage: "cube.transparent")
                    .foregroundStyle(.secondary)
            }

            NavigationLink {
                RoomScheduleView(scanID: scanID)
            } label: {
                Label("Room Schedule", systemImage: "tablecells")
            }

            NavigationLink {
                TapeCheckView(scanID: scanID)
            } label: {
                Label("Tape Check", systemImage: "ruler")
            }
        }
    }

    @ViewBuilder
    private var totalSection: some View {
        if let schedule {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(UnitFormatter.area(schedule.total.floorArea, system: settings.unitSystem))
                        .font(.system(.largeTitle, design: .rounded).bold())
                        .monospacedDigit()
                    ConventionNote()
                    if !schedule.total.verified {
                        Label(
                            "\(schedule.total.excludedRoomCount) room\(schedule.total.excludedRoomCount == 1 ? "" : "s") estimated or low confidence — verified total is \(UnitFormatter.area(schedule.total.verifiedFloorArea, system: settings.unitSystem)).",
                            systemImage: "exclamationmark.triangle"
                        )
                        .font(.caption)
                        .foregroundStyle(.orange)
                    }
                }
                .padding(.vertical, 4)
            } footer: {
                AccuracyDisclaimer()
            }
        }
    }

    private func roomsSection(_ manifest: ScanManifest) -> some View {
        ForEach(Array(manifest.segments.enumerated()), id: \.element.id) { index, segment in
            Section {
                ForEach(segment.rooms) { room in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(room.label)
                            Text("\(UnitFormatter.area(room.floorAreaSqM, system: settings.unitSystem)) · \(room.objectCount) object\(room.objectCount == 1 ? "" : "s")")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if !room.hasArchive {
                            // Re-derive cannot help this room; say so where the room is,
                            // not only where the button is.
                            Image(systemName: "archivebox.badge.xmark")
                                .foregroundStyle(.orange)
                                .accessibilityLabel("Raw capture data missing")
                        }
                        if measurement(for: room.id)?.isEstimated == true {
                            EstimatedBadge()
                        }
                        ConfidenceBadge(confidence: room.confidence)
                    }
                }
            } header: {
                if manifest.segments.count > 1 {
                    Text("Segment \(index + 1)\(segment.hasStructure ? " · merged" : "")")
                } else {
                    Text("Rooms\(segment.hasStructure ? " · merged" : "")")
                }
            } footer: {
                VStack(alignment: .leading, spacing: 4) {
                    if manifest.segments.count > 1, index == manifest.segments.count - 1 {
                        Text("Segments were captured in separate ARKit frames — after tracking was lost — and are merged independently.")
                    }
                    if segment.rooms.contains(where: { !$0.hasArchive }) {
                        Label("A room here has no archived capture data, so it cannot be re-derived.", systemImage: "archivebox.badge.xmark")
                            .foregroundStyle(.orange)
                    }
                }
            }
        }
    }

    private func actionsSection(_ manifest: ScanManifest) -> some View {
        Section("Sync & Export") {
            HStack {
                SyncStateLabel(state: sync.state(for: scanID), syncedAt: manifest.syncedAt)
                Spacer()
                Button("Upload") {
                    Task {
                        await sync.upload(scanID: scanID, configuration: settings.syncConfiguration)
                        await reload()
                    }
                }
                .disabled(sync.state(for: scanID).isActive || settings.syncEndpointURL == nil)
            }

            if settings.syncEndpointURL == nil {
                Text("Set a sync endpoint in Settings to push scans to your server.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Button {
                shareScanArchive()
            } label: {
                Label("Share Scan Archive (.zip)", systemImage: "square.and.arrow.up")
            }

            Button {
                shareItems = [ScanPaths.measurementsCSV(scanID)]
            } label: {
                Label("Share measurements.csv", systemImage: "tablecells")
            }

            Button {
                Task { await rederive() }
            } label: {
                Label("Re-derive from Archived Capture", systemImage: "arrow.triangle.2.circlepath")
            }
        }
    }

    private func detailsSection(_ manifest: ScanManifest) -> some View {
        Section("Details") {
            LabeledContent("Captured", value: manifest.createdAt.formatted(date: .abbreviated, time: .shortened))
            LabeledContent("Device", value: manifest.deviceModel)
            LabeledContent("iOS", value: manifest.osVersion)
            LabeledContent("Segments", value: "\(manifest.segments.count)")
            LabeledContent("On disk", value: UnitFormatter.bytes(sizeOnDisk))
        }
    }

    // MARK: - Actions

    private func measurement(for roomID: UUID) -> RoomMeasurement? {
        schedule?.rooms.first { $0.id == roomID }
    }

    private func reload() async {
        manifest = try? await store.manifest(for: scanID)
        schedule = await store.loadMeasurements(scanID: scanID)
        previewURL = await store.previewURL(scanID: scanID)
        sizeOnDisk = await store.sizeOnDisk(scanID: scanID)
    }

    /// Re-runs `RoomBuilder` over every archived `raw.capturedroomdata`, rewrites the
    /// derived artefacts, and regenerates the schedule. This is what archiving the
    /// intermediate buys: new options or a newer OS without re-walking the house
    /// (SPEC §5.3).
    private func rederive() async {
        busyMessage = "Re-deriving…"
        defer { busyMessage = nil }
        do {
            guard let manifest else { return }
            let exportOptions = settings.exportOptions
            for segment in manifest.segments {
                for record in segment.rooms {
                    let data = try await store.loadRawRoomData(
                        scanID: scanID, segmentID: segment.id, roomID: record.id
                    )
                    let room = try await RoomPlanProcessing.buildRoom(from: data)
                    _ = try await store.saveRoom(
                        scanID: scanID,
                        segmentID: segment.id,
                        roomID: record.id,
                        label: record.label,
                        rawData: data,
                        room: room,
                        exportOptions: exportOptions,
                        bumpsVersion: false
                    )
                }
            }
            _ = try await store.deriveMeasurements(scanID: scanID)
            await reload()
            message = "Re-derived \(manifest.roomCount) room\(manifest.roomCount == 1 ? "" : "s") from the archived capture data."
        } catch {
            message = error.localizedDescription
        }
    }

    private func shareScanArchive() {
        busyMessage = "Packaging…"
        Task {
            defer { busyMessage = nil }
            let destination = DirectoryZipper.stagingURL(for: scanID)
            let source = ScanPaths.scan(scanID)
            do {
                try await Task.detached(priority: .userInitiated) {
                    try DirectoryZipper.zip(directory: source, to: destination)
                }.value
                shareItems = [destination]
            } catch {
                message = error.localizedDescription
            }
        }
    }
}
