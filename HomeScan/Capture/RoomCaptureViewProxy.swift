import Foundation
import RoomPlan

/// Bridges `RoomCaptureViewDelegate` — an `NSCoding`-constrained, non-isolated
/// Objective-C-style protocol — into Swift concurrency.
///
/// HomeScan takes the `CapturedRoomData` out of `captureView(shouldPresent:error:)`
/// and returns `false`, skipping Apple's post-scan result view so the app can run
/// `RoomBuilder` itself and go straight to the label prompt.
///
/// Note that this leaves `RoomCaptureView` as the sole delegate of its own
/// `RoomCaptureSession`. Reaching in to set `captureSession.delegate` would fight
/// the view for its coaching UI; taking the data from the view's own delegate does
/// not.
final class RoomCaptureViewProxy: NSObject, RoomCaptureViewDelegate, @unchecked Sendable {

    /// Whether to let RoomPlan present its built-in post-scan result view. The M0
    /// smoke test wants it; the real capture flow does not.
    private let presentsResultView: Bool
    private let onCapturedData: @Sendable (CapturedRoomData, (any Error)?) -> Void
    private let onProcessedRoom: @Sendable (CapturedRoom, (any Error)?) -> Void

    init(
        presentsResultView: Bool,
        onCapturedData: @escaping @Sendable (CapturedRoomData, (any Error)?) -> Void,
        onProcessedRoom: @escaping @Sendable (CapturedRoom, (any Error)?) -> Void = { _, _ in }
    ) {
        self.presentsResultView = presentsResultView
        self.onCapturedData = onCapturedData
        self.onProcessedRoom = onProcessedRoom
        super.init()
    }

    // MARK: - NSCoding
    // Required by RoomCaptureViewDelegate. This proxy holds closures and is never
    // archived, so decoding it is not meaningful.

    init?(coder: NSCoder) { nil }

    func encode(with coder: NSCoder) {}

    // MARK: - RoomCaptureViewDelegate

    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: (any Error)?) -> Bool {
        onCapturedData(roomDataForProcessing, error)
        return presentsResultView
    }

    func captureView(didPresent processedResult: CapturedRoom, error: (any Error)?) {
        onProcessedRoom(processedResult, error)
    }
}
