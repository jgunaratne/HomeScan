import Foundation

/// CSV of the room schedule — what anyone actually pastes into a spreadsheet when
/// pricing flooring (SPEC §6.7).
///
/// Both metric and imperial columns are emitted regardless of the display setting:
/// a spreadsheet is a different consumer from a phone screen, and re-deriving the
/// conversion downstream is where errors creep in.
enum MeasurementCSV {

    static let columns = [
        "Room",
        "Floor Area (m2)",
        "Floor Area (sq ft)",
        "Area Method",
        "Estimated",
        "Width (m)",
        "Depth (m)",
        "Ceiling Median (m)",
        "Ceiling Min (m)",
        "Ceiling Max (m)",
        "Perimeter (m)",
        "Walls",
        "Doors",
        "Windows",
        "Openings",
        "Confidence",
    ]

    static func render(_ schedule: MeasurementSchedule) -> String {
        var lines: [String] = []

        // A header comment would break naive parsers, so the convention goes in a
        // trailing metadata block instead — but never nowhere (SPEC §6.4).
        lines.append(row(columns))

        for room in schedule.rooms {
            lines.append(row([
                room.label,
                number(room.floorArea, places: 2),
                number(UnitConvert.squareMetersToSquareFeet(room.floorArea), places: 1),
                room.areaMethod.rawValue,
                room.isEstimated ? "yes" : "no",
                room.footprint.map { number($0.width, places: 2) } ?? "",
                room.footprint.map { number($0.depth, places: 2) } ?? "",
                number(room.ceilingHeight.median, places: 3),
                number(room.ceilingHeight.min, places: 3),
                number(room.ceilingHeight.max, places: 3),
                number(room.perimeter, places: 2),
                String(room.walls.count),
                String(room.doors.count),
                String(room.windows.count),
                String(room.openings.filter { $0.type == .opening }.count),
                room.confidence.rawValue,
            ]))
        }

        lines.append(row([
            "TOTAL (net interior)",
            number(schedule.total.floorArea, places: 2),
            number(UnitConvert.squareMetersToSquareFeet(schedule.total.floorArea), places: 1),
            schedule.convention,
            schedule.total.verified ? "no" : "yes",
            "", "", "", "", "", "",
            String(schedule.rooms.reduce(0) { $0 + $1.walls.count }),
            String(schedule.rooms.reduce(0) { $0 + $1.doors.count }),
            String(schedule.rooms.reduce(0) { $0 + $1.windows.count }),
            String(schedule.rooms.reduce(0) { $0 + $1.openings.filter { $0.type == .opening }.count }),
            schedule.total.verified ? "verified" : "unverified",
        ]))

        lines.append("")
        lines.append(row(["# convention", schedule.convention]))
        lines.append(row(["# note", "Net interior area, wall face to wall face. Not gross/assessor square footage."]))
        lines.append(row(["# rooms excluded from verified total", String(schedule.total.excludedRoomCount)]))
        lines.append(row(["# verified area (m2)", number(schedule.total.verifiedFloorArea, places: 2)]))
        lines.append(row(["# generated", ISO8601DateFormatter().string(from: schedule.generatedAt)]))

        return lines.joined(separator: "\n") + "\n"
    }

    static func row(_ fields: [String]) -> String {
        fields.map(escape).joined(separator: ",")
    }

    /// RFC 4180 quoting: quote when the field contains a comma, quote or newline,
    /// and double any embedded quotes.
    static func escape(_ field: String) -> String {
        guard field.contains(where: { $0 == "," || $0 == "\"" || $0 == "\n" || $0 == "\r" }) else {
            return field
        }
        return "\"" + field.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }

    static func number(_ value: Double, places: Int) -> String {
        String(format: "%.\(places)f", value)
    }
}
