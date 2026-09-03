import SwiftUI

/// The measurement table (SPEC §8): area, dimensions and ceiling height per room,
/// the home total with its convention labelled, and estimated / low-confidence
/// rooms visibly marked.
struct RoomScheduleView: View {
    let scanID: UUID

    @Environment(AppSettings.self) private var settings
    @State private var schedule: MeasurementSchedule?
    @State private var shareItems: [Any]?
    @State private var expanded: Set<UUID> = []

    private let store = ScanStore.shared

    var body: some View {
        List {
            if let schedule {
                totalSection(schedule)
                ForEach(schedule.rooms) { room in
                    roomSection(room)
                }
                exportSection
            } else {
                ContentUnavailableView(
                    "No Measurements",
                    systemImage: "ruler",
                    description: Text("Finish a house scan to derive the room schedule.")
                )
            }
        }
        .navigationTitle("Room Schedule")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await recompute() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .accessibilityLabel("Recompute")
            }
        }
        .task { await load() }
        .sheet(isPresented: Binding(get: { shareItems != nil }, set: { if !$0 { shareItems = nil } })) {
            if let shareItems { ShareSheet(items: shareItems) }
        }
    }

    // MARK: - Sections

    private func totalSection(_ schedule: MeasurementSchedule) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text(UnitFormatter.area(schedule.total.floorArea, system: settings.unitSystem))
                        .font(.system(.largeTitle, design: .rounded).bold())
                        .monospacedDigit()
                    Spacer()
                    Text("\(schedule.total.roomCount) rooms")
                        .foregroundStyle(.secondary)
                }
                ConventionNote()

                if schedule.total.verified {
                    Label("Every room measured from a floor polygon at medium or better confidence.",
                          systemImage: "checkmark.seal")
                        .font(.caption)
                        .foregroundStyle(.green)
                } else {
                    Label(
                        "Verified total \(UnitFormatter.area(schedule.total.verifiedFloorArea, system: settings.unitSystem)) — \(schedule.total.excludedRoomCount) room\(schedule.total.excludedRoomCount == 1 ? " is" : "s are") estimated or low confidence.",
                        systemImage: "exclamationmark.triangle"
                    )
                    .font(.caption)
                    .foregroundStyle(.orange)
                }
            }
            .padding(.vertical, 4)
        } header: {
            Text("Whole home")
        } footer: {
            AccuracyDisclaimer()
        }
    }

    private func roomSection(_ room: RoomMeasurement) -> some View {
        Section {
            LabeledContent("Floor area") {
                HStack(spacing: 6) {
                    Text(UnitFormatter.area(room.floorArea, system: settings.unitSystem))
                        .monospacedDigit()
                    if room.isEstimated { EstimatedBadge() }
                }
            }

            if let footprint = room.footprint {
                LabeledContent("Dimensions") {
                    Text(UnitFormatter.dimensions(
                        width: footprint.width,
                        depth: footprint.depth,
                        system: settings.unitSystem
                    ))
                    .monospacedDigit()
                }
            }

            LabeledContent("Ceiling height") {
                VStack(alignment: .trailing, spacing: 1) {
                    Text(UnitFormatter.length(room.ceilingHeight.median, system: settings.unitSystem))
                        .monospacedDigit()
                    if room.ceilingHeight.spread > 0.05 {
                        Text("spread \(UnitFormatter.preciseLength(room.ceilingHeight.spread, system: settings.unitSystem))")
                            .font(.caption2)
                            .foregroundStyle(room.ceilingHeight.spread > 0.3 ? .orange : .secondary)
                    }
                }
            }

            LabeledContent("Perimeter") {
                Text(UnitFormatter.length(room.perimeter, system: settings.unitSystem))
                    .monospacedDigit()
            }

            LabeledContent("Openings") {
                Text("\(room.doors.count) door\(room.doors.count == 1 ? "" : "s"), \(room.windows.count) window\(room.windows.count == 1 ? "" : "s")")
            }

            DisclosureGroup(
                isExpanded: Binding(
                    get: { expanded.contains(room.id) },
                    set: { isExpanded in
                        if isExpanded { expanded.insert(room.id) } else { expanded.remove(room.id) }
                    }
                )
            ) {
                ForEach(room.walls) { wall in
                    HStack {
                        Text(UnitFormatter.length(wall.length, system: settings.unitSystem))
                            .monospacedDigit()
                        Text("×")
                            .foregroundStyle(.tertiary)
                        Text(UnitFormatter.length(wall.height, system: settings.unitSystem))
                            .monospacedDigit()
                        Spacer()
                        ConfidenceBadge(confidence: wall.confidence)
                    }
                    .font(.subheadline)
                }
                ForEach(room.openings) { opening in
                    HStack {
                        Text(opening.type.displayName)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text(UnitFormatter.dimensions(
                            width: opening.width,
                            depth: opening.height,
                            system: settings.unitSystem
                        ))
                        .monospacedDigit()
                    }
                    .font(.subheadline)
                }
            } label: {
                Text("\(room.walls.count) wall\(room.walls.count == 1 ? "" : "s") and openings")
                    .font(.subheadline)
            }
        } header: {
            HStack {
                Text(room.label)
                Spacer()
                ConfidenceBadge(confidence: room.confidence)
            }
        } footer: {
            Text("Area from \(room.areaMethod.displayName.lowercased()).")
        }
    }

    private var exportSection: some View {
        Section {
            Button {
                shareItems = [ScanPaths.measurementsCSV(scanID)]
            } label: {
                Label("Export CSV", systemImage: "square.and.arrow.up")
            }
            Button {
                shareItems = [ScanPaths.measurementsJSON(scanID)]
            } label: {
                Label("Export JSON", systemImage: "curlybraces")
            }
        } footer: {
            Text("CSV carries both metric and imperial columns regardless of the display setting.")
        }
    }

    /// Uses the persisted schedule when there is one, and derives it on first view
    /// otherwise — a scan restored from disk may never have had one written.
    private func load() async {
        if let stored = await store.loadMeasurements(scanID: scanID) {
            schedule = stored
        } else {
            await recompute()
        }
    }

    private func recompute() async {
        schedule = try? await store.deriveMeasurements(scanID: scanID)
    }
}
