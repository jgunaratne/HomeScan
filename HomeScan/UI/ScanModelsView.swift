import SwiftUI

/// Every 3D model a scan holds, grouped by segment (SPEC §8).
///
/// The scan detail screen opens one model — the first merged structure. That is
/// the wrong answer for a house walked in more than one segment: an upstairs
/// captured after tracking was lost is merged separately and is only reachable
/// from here.
struct ScanModelsView: View {
    let items: [ScanPreviewItem]

    @State private var selection: ScanPreviewItem?

    var body: some View {
        List {
            ForEach(groups, id: \.segmentID) { group in
                Section {
                    ForEach(group.items) { item in
                        Button {
                            selection = item
                        } label: {
                            row(item)
                        }
                        .buttonStyle(.plain)
                    }
                } header: {
                    Text(group.title)
                }
            }
        }
        .navigationTitle("3D Models")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $selection) { item in
            NavigationStack {
                QuickLookView(url: item.url, title: item.title)
                    .ignoresSafeArea()
                    .navigationTitle(item.title)
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
        .overlay {
            if items.isEmpty {
                ContentUnavailableView(
                    "No 3D Models",
                    systemImage: "cube.transparent",
                    description: Text("This scan has no USDZ exports on disk.")
                )
            }
        }
    }

    private func row(_ item: ScanPreviewItem) -> some View {
        HStack(spacing: 12) {
            Image(systemName: item.kind == .structure ? "square.stack.3d.up" : "cube")
                .foregroundStyle(item.kind == .structure ? Color.accentColor : .secondary)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                // The section header already names the segment, so the merged
                // model does not repeat it here.
                Text(item.kind == .structure ? "Merged model" : item.title)
                if let subtitle = item.subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .contentShape(Rectangle())
    }

    // MARK: - Grouping

    private struct Group {
        var segmentID: UUID
        var title: String
        var items: [ScanPreviewItem]
    }

    /// Segments in the order `previewItems` produced them, which is manifest order.
    private var groups: [Group] {
        var groups: [Group] = []
        for item in items {
            if let index = groups.firstIndex(where: { $0.segmentID == item.segmentID }) {
                groups[index].items.append(item)
            } else {
                groups.append(Group(segmentID: item.segmentID, title: item.segmentTitle, items: [item]))
            }
        }
        return groups
    }
}
