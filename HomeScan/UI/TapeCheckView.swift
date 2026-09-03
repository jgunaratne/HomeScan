import SwiftUI

/// The tape-measure check (SPEC §6.6).
///
/// Pick a wall, enter what a real tape says, and see the delta. Two minutes, and it
/// is the only way to know whether an environment is producing trustworthy geometry
/// *before* a whole house is captured on top of it.
struct TapeCheckView: View {
    let scanID: UUID

    @Environment(AppSettings.self) private var settings

    @State private var schedule: MeasurementSchedule?
    @State private var history: [TapeCheck] = []
    @State private var selectedRoomID: UUID?
    @State private var selectedWallID: UUID?
    @State private var measuredText = ""
    @State private var result: TapeCheck?
    @State private var message: String?

    private let store = ScanStore.shared

    var body: some View {
        Form {
            Section {
                Text("Pick a wall you can reach, measure it with a tape, and enter the number. Run this once on the first scan in any new house.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if let schedule, !schedule.rooms.isEmpty {
                Section("Wall") {
                    Picker("Room", selection: $selectedRoomID) {
                        Text("Select…").tag(UUID?.none)
                        ForEach(schedule.rooms) { room in
                            Text(room.label).tag(UUID?.some(room.id))
                        }
                    }

                    if let walls = selectedRoom?.walls, !walls.isEmpty {
                        Picker("Wall", selection: $selectedWallID) {
                            Text("Select…").tag(UUID?.none)
                            ForEach(Array(walls.enumerated()), id: \.element.id) { index, wall in
                                Text("Wall \(index + 1) — \(UnitFormatter.length(wall.length, system: settings.unitSystem))")
                                    .tag(UUID?.some(wall.id))
                            }
                        }
                    } else if selectedRoomID != nil {
                        Text("That room has no walls recorded.")
                            .foregroundStyle(.secondary)
                    }
                }

                if let wall = selectedWall {
                    Section("Measurement") {
                        LabeledContent("Scanned") {
                            Text(UnitFormatter.length(wall.length, system: settings.unitSystem))
                                .monospacedDigit()
                        }
                        HStack {
                            Text(measuredFieldLabel)
                            Spacer()
                            TextField("0", text: $measuredText)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                                .monospacedDigit()
                                .frame(maxWidth: 120)
                        }
                        Button("Check") { check(wall: wall) }
                            .disabled(measuredMeters == nil)
                    }
                }

                if let result {
                    Section("Result") {
                        LabeledContent("Delta") {
                            Text(UnitFormatter.preciseLength(result.deltaMeters, system: settings.unitSystem))
                                .monospacedDigit()
                                .foregroundStyle(verdictColor(result.verdict))
                        }
                        LabeledContent("Error") {
                            Text(UnitFormatter.percent(result.percentError))
                                .monospacedDigit()
                                .foregroundStyle(verdictColor(result.verdict))
                        }
                        LabeledContent("Verdict") {
                            Text(result.verdict.displayName)
                                .foregroundStyle(verdictColor(result.verdict))
                        }
                        Text(advice(for: result.verdict))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            } else {
                Section {
                    ContentUnavailableView(
                        "No Walls to Check",
                        systemImage: "ruler",
                        description: Text("Finish a scan first — the tape check works against the derived room schedule.")
                    )
                }
            }

            if !history.isEmpty {
                Section("Previous checks") {
                    ForEach(history.reversed()) { check in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Text(check.roomLabel)
                                Spacer()
                                Text(UnitFormatter.percent(check.percentError))
                                    .monospacedDigit()
                                    .foregroundStyle(verdictColor(check.verdict))
                            }
                            Text(check.performedAt.formatted(date: .abbreviated, time: .shortened))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Tape Check")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            schedule = await store.loadMeasurements(scanID: scanID)
            history = await store.tapeChecks(scanID: scanID)
        }
        .alert("Tape check", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("OK") { message = nil }
        } message: {
            Text(message ?? "")
        }
    }

    // MARK: - Derived

    private var selectedRoom: RoomMeasurement? {
        guard let selectedRoomID else { return nil }
        return schedule?.rooms.first { $0.id == selectedRoomID }
    }

    private var selectedWall: WallMeasurement? {
        guard let selectedWallID else { return nil }
        return selectedRoom?.walls.first { $0.id == selectedWallID }
    }

    private var measuredFieldLabel: String {
        settings.unitSystem == .metric ? "Measured (m)" : "Measured (inches)"
    }

    /// The text field takes plain metres or plain inches — no foot-inch parsing.
    /// One number, one unit, no ambiguity while standing on a stepladder.
    private var measuredMeters: Double? {
        guard let value = Double(measuredText.replacingOccurrences(of: ",", with: ".")), value > 0 else { return nil }
        return settings.unitSystem == .metric ? value : UnitConvert.inchesToMeters(value)
    }

    private func verdictColor(_ verdict: TapeCheck.Verdict) -> Color {
        switch verdict {
        case .good: .green
        case .acceptable: .orange
        case .poor: .red
        }
    }

    private func advice(for verdict: TapeCheck.Verdict) -> String {
        switch verdict {
        case .good:
            "This environment is scanning well. Carry on with the rest of the house."
        case .acceptable:
            "Usable for space planning, but do not quote these numbers to two decimal places."
        case .poor:
            "Something here is wrong — poor lighting, blank walls, or too much glass. Improve the conditions and re-scan this room before capturing the rest of the house on top of it."
        }
    }

    private func check(wall: WallMeasurement) {
        guard let measuredMeters, let room = selectedRoom else { return }
        let check = TapeCheck(
            roomID: room.id,
            roomLabel: room.label,
            wallID: wall.id,
            scannedLength: wall.length,
            measuredLength: measuredMeters
        )
        result = check
        Task {
            do {
                try await store.appendTapeCheck(check, scanID: scanID)
                history = await store.tapeChecks(scanID: scanID)
            } catch {
                message = error.localizedDescription
            }
        }
    }
}
