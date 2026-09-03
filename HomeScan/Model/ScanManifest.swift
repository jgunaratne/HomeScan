import Foundation

/// Confidence, mirrored out of RoomPlan so the persisted schema does not depend
/// on Apple's enum staying `Codable`-stable across OS versions.
enum ConfidenceLevel: String, Codable, Sendable, CaseIterable, Comparable {
    case low, medium, high

    private var rank: Int {
        switch self {
        case .low: 0
        case .medium: 1
        case .high: 2
        }
    }

    static func < (lhs: ConfidenceLevel, rhs: ConfidenceLevel) -> Bool { lhs.rank < rhs.rank }

    var displayName: String {
        switch self {
        case .low: "Low"
        case .medium: "Medium"
        case .high: "High"
        }
    }
}

/// `manifest.json` — HomeScan's own metadata and the source of truth for the
/// library UI. Deliberately *not* Apple's schema: it survives RoomPlan changes.
struct ScanManifest: Codable, Sendable, Identifiable, Equatable {
    var id: UUID
    var name: String
    var createdAt: Date
    var deviceModel: String
    var osVersion: String
    var segments: [SegmentRecord]
    var syncedAt: Date?

    init(
        id: UUID = UUID(),
        name: String,
        createdAt: Date = Date(),
        deviceModel: String = DeviceInfo.modelIdentifier,
        osVersion: String = DeviceInfo.osVersion,
        segments: [SegmentRecord] = [],
        syncedAt: Date? = nil
    ) {
        self.id = id
        self.name = name
        self.createdAt = createdAt
        self.deviceModel = deviceModel
        self.osVersion = osVersion
        self.segments = segments
        self.syncedAt = syncedAt
    }

    var allRooms: [RoomRecord] { segments.flatMap(\.rooms) }
    var roomCount: Int { allRooms.count }
    var roomsMissingArchive: [RoomRecord] { allRooms.filter { !$0.hasArchive } }

    /// Net interior floor area across every room, in square metres.
    var totalFloorAreaSqM: Double { allRooms.reduce(0) { $0 + $1.floorAreaSqM } }

    var lowestConfidence: ConfidenceLevel { allRooms.map(\.confidence).min() ?? .high }
}

struct SegmentRecord: Codable, Sendable, Identifiable, Equatable {
    var id: UUID
    var rooms: [RoomRecord]
    /// True once `StructureBuilder` has produced `structure.json` for this segment.
    var hasStructure: Bool

    init(id: UUID = UUID(), rooms: [RoomRecord] = [], hasStructure: Bool = false) {
        self.id = id
        self.rooms = rooms
        self.hasStructure = hasStructure
    }
}

struct RoomRecord: Codable, Sendable, Identifiable, Equatable {
    var id: UUID
    var label: String
    var confidence: ConfidenceLevel
    var floorAreaSqM: Double
    var objectCount: Int
    /// RoomPlan's own identifier for the `CapturedRoom`. Kept separately because
    /// `StructureBuilder` re-identifies rooms during the merge (see RoomLabelMatcher).
    var capturedRoomIdentifier: UUID?
    var capturedAt: Date
    /// Bumped when a room is re-scanned in place. Archived intermediates make
    /// versioning cheap; see SPEC §10.
    var version: Int
    /// Set when `raw.capturedroomdata` could not be written. The room is still
    /// saved and usable — but it cannot be re-derived, so the failure is recorded
    /// rather than swallowed. Optional so manifests written before this existed
    /// still decode.
    var archiveError: String?

    var hasArchive: Bool { archiveError == nil }

    init(
        id: UUID = UUID(),
        label: String,
        confidence: ConfidenceLevel,
        floorAreaSqM: Double,
        objectCount: Int,
        capturedRoomIdentifier: UUID? = nil,
        capturedAt: Date = Date(),
        version: Int = 1,
        archiveError: String? = nil
    ) {
        self.id = id
        self.label = label
        self.confidence = confidence
        // JSONEncoder throws on NaN/infinity; a single bad surface must not be able
        // to take the manifest write - and with it the room - down.
        self.floorAreaSqM = floorAreaSqM.isFinite ? floorAreaSqM : 0
        self.objectCount = objectCount
        self.capturedRoomIdentifier = capturedRoomIdentifier
        self.capturedAt = capturedAt
        self.version = version
        self.archiveError = archiveError
    }
}

enum DeviceInfo {
    /// e.g. "iPhone17,2". `utsname` rather than `UIDevice.model`, which only ever
    /// says "iPhone" and is useless for correlating scan quality with hardware.
    static let modelIdentifier: String = {
        var info = utsname()
        uname(&info)
        let mirror = Mirror(reflecting: info.machine)
        let identifier = mirror.children.reduce(into: "") { partial, element in
            guard let value = element.value as? Int8, value != 0 else { return }
            partial.append(Character(UnicodeScalar(UInt8(value))))
        }
        return identifier.isEmpty ? "unknown" : identifier
    }()

    static let osVersion: String = {
        let v = ProcessInfo.processInfo.operatingSystemVersion
        return "\(v.majorVersion).\(v.minorVersion).\(v.patchVersion)"
    }()
}

/// One shared JSON configuration so every file HomeScan writes is ISO8601-dated
/// and diffable.
enum ScanJSON {
    static func encoder(prettyPrinted: Bool = true) -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        if prettyPrinted {
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        }
        return encoder
    }

    static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
