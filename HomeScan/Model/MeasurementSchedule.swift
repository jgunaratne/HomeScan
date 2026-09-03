import Foundation

/// How a room's floor area was derived. Only `.floorPolygon` is trusted; the
/// others are estimates and are flagged as such everywhere they surface.
enum AreaMethod: String, Codable, Sendable {
    /// Shoelace over the floor surface's `polygonCorners`. The authoritative method.
    case floorPolygon = "floor-polygon"
    /// A floor surface exists but exposed no polygon, so its bounding rectangle was used.
    case floorBounds = "floor-bounds"
    /// No floor surface at all — convex hull of the wall endpoints. Always an estimate,
    /// and an over-estimate for any non-convex room.
    case wallFootprint = "wall-footprint"

    var isAuthoritative: Bool { self == .floorPolygon }

    var displayName: String {
        switch self {
        case .floorPolygon: "Floor polygon"
        case .floorBounds: "Floor bounds (estimated)"
        case .wallFootprint: "Wall footprint (estimated)"
        }
    }
}

enum PerimeterMethod: String, Codable, Sendable {
    case floorPolygon = "floor-polygon"
    case wallLengths = "wall-lengths"
}

enum OpeningKind: String, Codable, Sendable, CaseIterable {
    case door, window, opening

    var displayName: String {
        switch self {
        case .door: "Door"
        case .window: "Window"
        case .opening: "Opening"
        }
    }
}

struct HeightStats: Codable, Sendable, Equatable {
    var median: Double
    var min: Double
    var max: Double

    /// A wide spread is real signal — either a sloped ceiling or a bad scan.
    var spread: Double { max - min }
}

struct WallMeasurement: Codable, Sendable, Identifiable, Equatable {
    var id: UUID
    var length: Double
    var height: Double
    var confidence: ConfidenceLevel

    private enum CodingKeys: String, CodingKey { case id, length, height, confidence }
}

struct OpeningMeasurement: Codable, Sendable, Identifiable, Equatable {
    var id: UUID
    var type: OpeningKind
    var width: Double
    var height: Double
    var confidence: ConfidenceLevel

    private enum CodingKeys: String, CodingKey { case id, type, width, height, confidence }
}

struct RoomMeasurement: Codable, Sendable, Identifiable, Equatable {
    var id: UUID
    var label: String
    /// Net interior floor area, square metres. See SPEC §6.4 for the convention.
    var floorArea: Double
    var areaMethod: AreaMethod
    var ceilingHeight: HeightStats
    var perimeter: Double
    var perimeterMethod: PerimeterMethod
    var walls: [WallMeasurement]
    var openings: [OpeningMeasurement]
    var confidence: ConfidenceLevel

    /// Extent of the room's axis-aligned footprint — the "12'4" × 14'2"" figure.
    var footprint: Footprint?

    struct Footprint: Codable, Sendable, Equatable {
        var width: Double
        var depth: Double
    }

    /// True when the area did not come from a floor polygon. Estimated rooms are
    /// marked in the UI and excluded from the verified total.
    var isEstimated: Bool { !areaMethod.isAuthoritative }

    /// SPEC §6.6: a room with any low-confidence surface, or an estimated area,
    /// does not count toward the verified home total.
    var countsTowardVerifiedTotal: Bool { confidence != .low && !isEstimated }

    var doors: [OpeningMeasurement] { openings.filter { $0.type == .door } }
    var windows: [OpeningMeasurement] { openings.filter { $0.type == .window } }
}

struct HomeTotal: Codable, Sendable, Equatable {
    /// Net interior area of every room, square metres.
    var floorArea: Double
    var roomCount: Int
    /// True only when every room is high/medium confidence *and* every area came
    /// from a floor polygon.
    var verified: Bool
    /// Area restricted to rooms that pass the verification bar.
    var verifiedFloorArea: Double
    var excludedRoomCount: Int
}

/// `measurements.json` — the flat, human-readable room schedule (SPEC §6.7).
/// Deliberately parseable without touching USDZ or Apple's types.
struct MeasurementSchedule: Codable, Sendable, Equatable {
    /// Always "net-interior". Stored explicitly so a consumer can never mistake
    /// this for gross/assessor square footage. See SPEC §6.4.
    var convention: String
    var units: String
    var generatedAt: Date
    var rooms: [RoomMeasurement]
    var total: HomeTotal

    static let netInterior = "net-interior"
    static let meters = "meters"

    init(generatedAt: Date = Date(), rooms: [RoomMeasurement]) {
        self.convention = Self.netInterior
        self.units = Self.meters
        self.generatedAt = generatedAt
        self.rooms = rooms

        let verifiedRooms = rooms.filter(\.countsTowardVerifiedTotal)
        self.total = HomeTotal(
            floorArea: rooms.reduce(0) { $0 + $1.floorArea },
            roomCount: rooms.count,
            verified: !rooms.isEmpty && verifiedRooms.count == rooms.count,
            verifiedFloorArea: verifiedRooms.reduce(0) { $0 + $1.floorArea },
            excludedRoomCount: rooms.count - verifiedRooms.count
        )
    }
}

/// A single tape-measure validation run (SPEC §6.6). Persisted next to the scan
/// so the trustworthiness of an environment is recorded, not just glanced at.
struct TapeCheck: Codable, Sendable, Identifiable, Equatable {
    var id: UUID = UUID()
    var roomID: UUID
    var roomLabel: String
    var wallID: UUID
    /// Metres, as scanned.
    var scannedLength: Double
    /// Metres, as measured with a real tape.
    var measuredLength: Double
    var performedAt: Date = Date()

    var deltaMeters: Double { scannedLength - measuredLength }

    var percentError: Double {
        guard measuredLength > 0 else { return 0 }
        return (deltaMeters / measuredLength) * 100
    }

    /// Under 1% is about as good as a LiDAR phone gets; over 3% means something
    /// in this environment is wrong and the house should not be scanned on top of it.
    var verdict: Verdict {
        switch abs(percentError) {
        case ..<1: .good
        case ..<3: .acceptable
        default: .poor
        }
    }

    enum Verdict: String, Codable, Sendable {
        case good, acceptable, poor

        var displayName: String {
            switch self {
            case .good: "Good"
            case .acceptable: "Acceptable"
            case .poor: "Poor — re-scan"
            }
        }
    }
}
