import ARKit
import Foundation
import Observation

/// Quality of the shared ARKit world frame that multi-room continuity depends on.
enum TrackingQuality: Equatable, Sendable {
    case initializing
    case good
    /// Degraded but recoverable — the frame is still the same one.
    case limited(reason: String)
    /// The frame is gone. Anything captured after this cannot be trusted to merge
    /// with what came before (SPEC §4.2).
    case lost

    var isUsable: Bool {
        switch self {
        case .good, .limited: true
        case .initializing, .lost: false
        }
    }

    var displayName: String {
        switch self {
        case .initializing: "Starting up"
        case .good: "Tracking good"
        case .limited(let reason): "Limited — \(reason)"
        case .lost: "Tracking lost"
        }
    }
}

/// Watches the ARSession's camera tracking state.
///
/// This *polls* `currentFrame` rather than installing itself as the session's
/// `ARSessionDelegate`. RoomPlan drives the same ARSession, and stealing the
/// delegate is the kind of thing that works until it silently doesn't. Polling at
/// 5 Hz costs nothing, cannot interfere with RoomPlan, and tracking state changes
/// far more slowly than that.
@MainActor
@Observable
final class TrackingMonitor {
    private(set) var quality: TrackingQuality = .initializing
    /// Set once tracking has been lost during the current segment. Sticky: a frame
    /// that broke and then relocalized somewhere else is still a broken frame.
    private(set) var didLoseTracking = false

    @ObservationIgnored private weak var session: ARSession?
    @ObservationIgnored private var timer: Timer?

    func start(session: ARSession) {
        self.session = session
        quality = .initializing
        didLoseTracking = false
        timer?.invalidate()
        let timer = Timer(timeInterval: 0.2, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.sample() }
        }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        session = nil
    }

    /// Called when the user accepts a new segment: the old frame is abandoned, so
    /// the loss flag no longer applies.
    func resetLossFlag() {
        didLoseTracking = false
    }

    private func sample() {
        guard let state = session?.currentFrame?.camera.trackingState else { return }
        let newQuality: TrackingQuality
        switch state {
        case .normal:
            newQuality = .good
        case .notAvailable:
            newQuality = .initializing
        case .limited(let reason):
            switch reason {
            case .initializing:
                newQuality = .initializing
            case .relocalizing:
                // ARKit is trying to recover a frame it lost. Until it succeeds the
                // world origin is not trustworthy.
                newQuality = .lost
            case .excessiveMotion:
                newQuality = .limited(reason: "moving too fast")
            case .insufficientFeatures:
                newQuality = .limited(reason: "not enough detail to track")
            @unknown default:
                newQuality = .limited(reason: "reduced quality")
            }
        }

        if newQuality == .lost { didLoseTracking = true }
        if newQuality != quality { quality = newQuality }
    }
}
