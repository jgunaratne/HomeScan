import SwiftUI

/// SPEC §2: a LiDAR iPhone is a sketch-grade capture tool, and the app should say
/// so in the UI, next to the numbers — not buried in an about screen.
struct AccuracyDisclaimer: View {
    var compact = false

    var body: some View {
        Label {
            Text(compact
                 ? "Sketch-grade. Verify before anyone bids on it."
                 : "Sketch-grade measurements. Good for space planning, furniture fit, flooring and paint estimates — not for permits, structural work, or anything a contractor will bid against without verifying.")
        } icon: {
            Image(systemName: "exclamationmark.triangle")
        }
        .font(.footnote)
        .foregroundStyle(.secondary)
    }
}

/// SPEC §6.4: never let a net interior figure be mistaken for listing or assessor
/// square footage. The label travels with the number.
struct ConventionNote: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Net interior area")
                .font(.footnote.weight(.semibold))
            Text("Measured wall face to wall face. Listing and assessor figures are gross area — measured to the outside of exterior walls and including partitions — and typically read 10–15% higher. This total reading low against those is expected.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

struct ConfidenceBadge: View {
    let confidence: ConfidenceLevel

    var body: some View {
        Text(confidence.displayName)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(color.opacity(0.18), in: Capsule())
            .foregroundStyle(color)
    }

    private var color: Color {
        switch confidence {
        case .high: .green
        case .medium: .orange
        case .low: .red
        }
    }
}

struct EstimatedBadge: View {
    var body: some View {
        Text("Estimated")
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(Color.orange.opacity(0.18), in: Capsule())
            .foregroundStyle(.orange)
    }
}

struct SyncStateLabel: View {
    let state: SyncState
    let syncedAt: Date?

    var body: some View {
        switch state {
        case .idle:
            if let syncedAt {
                Label(syncedAt.formatted(date: .abbreviated, time: .shortened), systemImage: "checkmark.icloud")
                    .foregroundStyle(.secondary)
            } else {
                Label("Not synced", systemImage: "icloud.slash")
                    .foregroundStyle(.secondary)
            }
        case .preparing:
            Label("Packaging…", systemImage: "shippingbox")
        case .uploading(let fraction):
            Label("Uploading \(Int(fraction * 100))%", systemImage: "arrow.up.circle")
        case .synced(let date):
            Label(date.formatted(date: .abbreviated, time: .shortened), systemImage: "checkmark.icloud")
                .foregroundStyle(.green)
        case .failed(let message):
            Label(message, systemImage: "exclamationmark.icloud")
                .foregroundStyle(.red)
        }
    }
}

/// Renders a stored thumbnail, or the plan drawn live from a room.
struct FloorPlanThumbnail: View {
    let data: Data?
    var size: CGFloat = 56

    var body: some View {
        Group {
            if let data, let image = UIImage(data: data) {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
            } else {
                Image(systemName: "square.dashed")
                    .font(.title3)
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(width: size, height: size)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 8))
    }
}

struct UnsupportedDeviceView: View {
    var body: some View {
        ContentUnavailableView(
            "RoomPlan Not Available",
            systemImage: "iphone.slash",
            description: Text("HomeScan needs a LiDAR-equipped iPhone. RoomPlan does not run in the Simulator or on devices without a LiDAR scanner.")
        )
    }
}

/// UIActivityViewController wrapper for the share-sheet export fallback (SPEC §7).
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
