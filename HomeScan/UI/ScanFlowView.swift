import SwiftUI

/// The scanning screen. Ruthlessly minimal on purpose: the user is holding a phone
/// at eye level, walking backward around furniture (SPEC §8).
struct ScanFlowView: View {
    let scanName: String

    @Environment(\.dismiss) private var dismiss
    @State private var coordinator = CaptureCoordinator()
    @State private var isConfirmingCancel = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let captureView = coordinator.captureView {
                RoomCaptureViewRepresentable(captureView: captureView)
                    .ignoresSafeArea()
                    .id(coordinator.currentSegmentID)
            }

            switch coordinator.phase {
            case .idle:
                ProgressView().tint(.white)
            case .failed(let message):
                failure(message)
            case .finished(let scanID):
                CaptureSummaryView(scanID: scanID) { dismiss() }
            default:
                overlay
            }
        }
        .preferredColorScheme(.dark)
        .task {
            if coordinator.phase == .idle { await coordinator.begin(name: scanName) }
        }
        .onChange(of: coordinator.tracking.didLoseTracking) { _, lost in
            // Warn the moment the frame breaks, not at the next room boundary —
            // by then the user has already walked somewhere untrackable.
            if lost { coordinator.noteTrackingLossIfNeeded() }
        }
        .sheet(item: $coordinator.pendingLabelRoom) { pending in
            RoomLabelPromptView(suggestion: pending.suggestion) { label in
                await coordinator.commitPendingRoom(label: label)
            }
            .interactiveDismissDisabled()
        }
        .alert("Tracking lost", isPresented: $coordinator.trackingLossNeedsDecision) {
            Button("Start a new segment") { coordinator.startNewSegment() }
            Button("Continue anyway", role: .destructive) { coordinator.dismissTrackingLoss() }
        } message: {
            Text("ARKit lost the shared coordinate frame, so rooms scanned from here will not line up with the ones before. Starting a new segment keeps them separate and merges each part correctly. Continuing risks a badly merged house.")
        }
        .confirmationDialog(
            "Discard this scan?",
            isPresented: $isConfirmingCancel,
            titleVisibility: .visible
        ) {
            Button("Discard", role: .destructive) {
                Task {
                    await coordinator.cancel()
                    dismiss()
                }
            }
            Button("Keep scanning", role: .cancel) {}
        } message: {
            Text(coordinator.roomCount > 0
                 ? "\(coordinator.roomCount) captured room\(coordinator.roomCount == 1 ? " stays" : "s stay") on disk; the house will not be merged."
                 : "Nothing has been captured yet.")
        }
    }

    // MARK: - Overlay

    private var overlay: some View {
        VStack {
            statusBar
            Spacer()
            if coordinator.phase == .ready, coordinator.roomCount > 0 {
                walkPrompt
            }
            controls
        }
        .padding()
    }

    private var statusBar: some View {
        HStack(spacing: 10) {
            Button { isConfirmingCancel = true } label: {
                Image(systemName: "xmark")
                    .font(.headline)
                    .padding(9)
                    .background(.ultraThinMaterial, in: Circle())
            }
            .accessibilityLabel("Cancel scan")

            pill(
                text: "\(coordinator.roomCount) room\(coordinator.roomCount == 1 ? "" : "s")"
                    + (coordinator.segmentCount > 1 ? " · segment \(coordinator.segmentCount)" : ""),
                systemImage: "square.split.bottomrightquarter"
            )

            Spacer()

            pill(text: coordinator.tracking.quality.displayName, systemImage: trackingIcon)
                .foregroundStyle(trackingColor)
        }
    }

    private var walkPrompt: some View {
        Text("Walk to the next room — keep the phone up and pointed ahead.")
            .font(.callout.weight(.medium))
            .multilineTextAlignment(.center)
            .padding(12)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
            .padding(.bottom, 8)
    }

    @ViewBuilder
    private var controls: some View {
        switch coordinator.phase {
        case .ready:
            HStack(spacing: 12) {
                Button {
                    coordinator.startRoomCapture()
                } label: {
                    Label(coordinator.roomCount == 0 ? "Start House Scan" : "Scan Next Room",
                          systemImage: "viewfinder")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                if coordinator.canFinishHouse {
                    Button("Finish House") {
                        Task { await coordinator.finishHouse() }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                }
            }

        case .scanningRoom:
            HStack(spacing: 12) {
                Button {
                    Task { await coordinator.finishRoom() }
                } label: {
                    Label("Done with this Room", systemImage: "checkmark")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)

                Button("Finish House") {
                    Task { await coordinator.finishHouse() }
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }

        case .processingRoom:
            progress("Building room…")

        case .finishing:
            progress("Merging the house…")

        default:
            EmptyView()
        }
    }

    private func progress(_ title: String) -> some View {
        HStack(spacing: 10) {
            ProgressView().tint(.white)
            Text(title)
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14))
    }

    private func pill(text: String, systemImage: String) -> some View {
        Label(text, systemImage: systemImage)
            .font(.footnote.weight(.medium))
            .padding(.horizontal, 11)
            .padding(.vertical, 7)
            .background(.ultraThinMaterial, in: Capsule())
    }

    private func failure(_ message: String) -> some View {
        ContentUnavailableView {
            Label("Capture Unavailable", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        } actions: {
            Button("Close") { dismiss() }
                .buttonStyle(.borderedProminent)
        }
    }

    private var trackingIcon: String {
        switch coordinator.tracking.quality {
        case .good: "dot.radiowaves.left.and.right"
        case .initializing: "hourglass"
        case .limited: "exclamationmark.triangle"
        case .lost: "xmark.octagon"
        }
    }

    private var trackingColor: Color {
        switch coordinator.tracking.quality {
        case .good: .green
        case .initializing: .secondary
        case .limited: .orange
        case .lost: .red
        }
    }
}

/// Shown once the house is merged and the schedule has been derived.
private struct CaptureSummaryView: View {
    let scanID: UUID
    let onDone: () -> Void

    @Environment(AppSettings.self) private var settings
    @State private var schedule: MeasurementSchedule?

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 52))
                .foregroundStyle(.green)
            Text("House Scan Complete")
                .font(.title2.bold())

            if let schedule {
                VStack(spacing: 4) {
                    Text(UnitFormatter.area(schedule.total.floorArea, system: settings.unitSystem))
                        .font(.largeTitle.bold())
                        .monospacedDigit()
                    Text("net interior · \(schedule.total.roomCount) rooms")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    if !schedule.total.verified {
                        Text("\(schedule.total.excludedRoomCount) room\(schedule.total.excludedRoomCount == 1 ? "" : "s") excluded from the verified total")
                            .font(.caption)
                            .foregroundStyle(.orange)
                            .multilineTextAlignment(.center)
                    }
                }
            } else {
                ProgressView()
            }

            AccuracyDisclaimer(compact: true)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            Button("Done", action: onDone)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
        }
        .padding(28)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20))
        .padding()
        .task {
            schedule = await ScanStore.shared.loadMeasurements(scanID: scanID)
        }
    }
}
