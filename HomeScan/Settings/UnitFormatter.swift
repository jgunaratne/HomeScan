import Foundation

enum UnitSystem: String, Codable, Sendable, CaseIterable, Identifiable {
    case imperial, metric

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .imperial: "Imperial (ft / sq ft)"
        case .metric: "Metric (m / m²)"
        }
    }
}

/// Conversion constants in one place. Storage is metric always (SPEC §6.5);
/// these are used only at the display and export boundary.
enum UnitConvert {
    static let metersPerFoot = 0.3048
    static let inchesPerMeter = 39.37007874015748
    static let squareFeetPerSquareMeter = 10.763910416709722

    static func metersToFeet(_ m: Double) -> Double { m / metersPerFoot }
    static func squareMetersToSquareFeet(_ sqm: Double) -> Double { sqm * squareFeetPerSquareMeter }
    static func feetToMeters(_ ft: Double) -> Double { ft * metersPerFoot }
    static func inchesToMeters(_ inches: Double) -> Double { inches / inchesPerMeter }
}

/// Display formatting. A room is «12'4" × 14'2", 175 sq ft», never 175.3847 —
/// the extra digits are noise the scan cannot support (SPEC §6.5).
enum UnitFormatter {

    // MARK: - Lengths

    static func length(_ meters: Double, system: UnitSystem) -> String {
        switch system {
        case .metric:
            return String(format: "%.2f m", meters)
        case .imperial:
            return feetAndInches(meters)
        }
    }

    /// Rounds to the nearest inch, then splits into feet and inches.
    ///
    /// The order matters: rounding the *total* inch count before dividing means
    /// 9 ft 11.6 in becomes 120 in and formats as 10'0". Rounding the remainder
    /// instead would produce 9'12".
    static func feetAndInches(_ meters: Double) -> String {
        let sign = meters < 0 ? "-" : ""
        let totalInches = Int((abs(meters) * UnitConvert.inchesPerMeter).rounded())
        return "\(sign)\(totalInches / 12)'\(totalInches % 12)\""
    }

    /// Sub-foot precision, for tape-check deltas where inches are the whole point.
    static func preciseLength(_ meters: Double, system: UnitSystem) -> String {
        switch system {
        case .metric:
            return abs(meters) < 1 ? String(format: "%.0f mm", meters * 1000) : String(format: "%.3f m", meters)
        case .imperial:
            let inches = meters * UnitConvert.inchesPerMeter
            return abs(inches) < 12 ? String(format: "%.1f in", inches) : feetAndInches(meters)
        }
    }

    // MARK: - Areas

    static func area(_ squareMeters: Double, system: UnitSystem) -> String {
        switch system {
        case .metric:
            return String(format: squareMeters < 10 ? "%.2f m²" : "%.1f m²", squareMeters)
        case .imperial:
            let sqft = UnitConvert.squareMetersToSquareFeet(squareMeters)
            return sqft < 10
                ? String(format: "%.1f sq ft", sqft)
                : "\(Int(sqft.rounded())) sq ft"
        }
    }

    // MARK: - Composites

    static func dimensions(width: Double, depth: Double, system: UnitSystem) -> String {
        "\(length(width, system: system)) × \(length(depth, system: system))"
    }

    static func roomSummary(_ room: RoomMeasurement, system: UnitSystem) -> String {
        var parts: [String] = []
        if let footprint = room.footprint {
            parts.append(dimensions(width: footprint.width, depth: footprint.depth, system: system))
        }
        parts.append(area(room.floorArea, system: system))
        return parts.joined(separator: ", ")
    }

    static func percent(_ value: Double) -> String {
        String(format: "%+.1f%%", value)
    }

    static func bytes(_ count: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: count, countStyle: .file)
    }
}
