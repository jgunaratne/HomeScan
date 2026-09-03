import SwiftUI

/// The scan library (SPEC §8): thumbnail, room count, sync state, swipe to delete.
struct LibraryView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(SyncService.self) private var sync

    @State private var scans: [ScanManifest] = []
    @State private var thumbnails: [UUID: Data] = [:]
    @State private var isPresentingNewScan = false
    @State private var isPresentingSettings = false
    @State private var newScanName = ""
    @State private var activeScan: NewScanRequest?
    @State private var loadError: String?

    private let store = ScanStore.shared

    var body: some View {
        NavigationStack {
            Group {
                if scans.isEmpty {
                    ContentUnavailableView {
                        Label("No Scans Yet", systemImage: "house")
                    } description: {
                        Text("Scan a house room by room. HomeScan keeps every room in one coordinate frame and derives a measured room schedule.")
                    } actions: {
                        Button("Start a House Scan") { presentNewScan() }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    List {
                        Section {
                            ForEach(scans) { scan in
                                NavigationLink(value: scan.id) {
                                    ScanRow(scan: scan, thumbnail: thumbnails[scan.id], state: sync.state(for: scan.id))
                                }
                            }
                            .onDelete(perform: delete)
                        } footer: {
                            AccuracyDisclaimer(compact: true)
                        }
                    }
                    .navigationDestination(for: UUID.self) { scanID in
                        ScanDetailView(scanID: scanID)
                    }
                }
            }
            .navigationTitle("HomeScan")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { isPresentingSettings = true } label: {
                        Image(systemName: "gearshape")
                    }
                    .accessibilityLabel("Settings")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { presentNewScan() } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("New scan")
                }
            }
            .task { await reload() }
            .refreshable { await reload() }
        }
        .sheet(isPresented: $isPresentingSettings) {
            SettingsView()
        }
        .alert("New House Scan", isPresented: $isPresentingNewScan) {
            TextField("Name", text: $newScanName)
            Button("Cancel", role: .cancel) {}
            Button("Start") { start() }
        } message: {
            Text("Name this scan — one per floor. RoomPlan cannot stitch floors together.")
        }
        .fullScreenCover(item: $activeScan, onDismiss: { Task { await reload() } }) { request in
            ScanFlowView(scanName: request.name)
        }
        .alert("Could not load scans", isPresented: Binding(
            get: { loadError != nil },
            set: { if !$0 { loadError = nil } }
        )) {
            Button("OK") { loadError = nil }
        } message: {
            Text(loadError ?? "")
        }
    }

    private func presentNewScan() {
        newScanName = defaultScanName()
        isPresentingNewScan = true
    }

    private func defaultScanName() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "d MMM"
        return "Home — \(formatter.string(from: Date()))"
    }

    private func start() {
        let name = newScanName.trimmingCharacters(in: .whitespacesAndNewlines)
        activeScan = NewScanRequest(name: name.isEmpty ? defaultScanName() : name)
    }

    private func reload() async {
        do {
            let loaded = try await store.listScans()
            scans = loaded
            var images: [UUID: Data] = [:]
            for scan in loaded {
                images[scan.id] = await store.thumbnailData(scanID: scan.id)
            }
            thumbnails = images
        } catch {
            loadError = error.localizedDescription
        }
    }

    private func delete(at offsets: IndexSet) {
        let doomed = offsets.map { scans[$0] }
        scans.remove(atOffsets: offsets)
        Task {
            for scan in doomed {
                try? await store.delete(scanID: scan.id)
            }
        }
    }
}

/// Identifies a not-yet-created scan so `fullScreenCover(item:)` can present the
/// capture flow. The real manifest is created by the coordinator once capture starts.
private struct NewScanRequest: Identifiable {
    let id = UUID()
    let name: String
}

private struct ScanRow: View {
    @Environment(AppSettings.self) private var settings
    let scan: ScanManifest
    let thumbnail: Data?
    let state: SyncState

    var body: some View {
        HStack(spacing: 12) {
            FloorPlanThumbnail(data: thumbnail)
            VStack(alignment: .leading, spacing: 3) {
                Text(scan.name)
                    .font(.headline)
                Text("\(scan.roomCount) room\(scan.roomCount == 1 ? "" : "s") · \(UnitFormatter.area(scan.totalFloorAreaSqM, system: settings.unitSystem))")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                SyncStateLabel(state: state, syncedAt: scan.syncedAt)
                    .font(.caption)
                    .labelStyle(.titleAndIcon)
            }
            Spacer(minLength: 0)
            if scan.lowestConfidence == .low {
                ConfidenceBadge(confidence: .low)
            }
        }
        .padding(.vertical, 2)
    }
}
