import Foundation
import RoomPlan

/// Which USDZ flavours to write. Mirrors `CapturedRoom.USDExportOptions` but is
/// `Codable`/`Sendable` so it can live in Settings.
struct ExportOptionSet: OptionSet, Codable, Sendable, Hashable {
    let rawValue: Int

    static let parametric = ExportOptionSet(rawValue: 1 << 0)
    static let mesh = ExportOptionSet(rawValue: 1 << 1)
    static let model = ExportOptionSet(rawValue: 1 << 2)

    /// SPEC §5.4 — both by default.
    static let `default`: ExportOptionSet = [.parametric, .mesh]

    var usdExportOptions: CapturedRoom.USDExportOptions {
        var options: CapturedRoom.USDExportOptions = []
        if contains(.parametric) { options.insert(.parametric) }
        if contains(.mesh) { options.insert(.mesh) }
        if contains(.model) { options.insert(.model) }
        return options
    }

    var displayName: String {
        var parts: [String] = []
        if contains(.parametric) { parts.append("Parametric") }
        if contains(.mesh) { parts.append("Mesh") }
        if contains(.model) { parts.append("Model") }
        return parts.isEmpty ? "None" : parts.joined(separator: " + ")
    }
}
