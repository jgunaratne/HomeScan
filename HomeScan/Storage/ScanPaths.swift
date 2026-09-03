import Foundation

/// The on-disk layout from SPEC §5.1. Everything lives under `Documents/` so the
/// Files app can reach it without a cable.
///
///     Documents/Scans/<scan-uuid>/
///       manifest.json
///       measurements.json
///       measurements.csv
///       tape-checks.json
///       worldmap.arworldmap                (optional, per segment below)
///       segments/<segment-uuid>/
///         structure.json
///         structure.usdz
///         worldmap.arworldmap
///         rooms/<room-uuid>/
///           raw.capturedroomdata
///           room.json
///           room-parametric.usdz
///           room-mesh.usdz
///           thumbnail.png
enum ScanPaths {
    static var documents: URL {
        // Documents always exists for an iOS app container.
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    static var scansRoot: URL { documents.appending(path: "Scans", directoryHint: .isDirectory) }

    static func scan(_ id: UUID) -> URL {
        scansRoot.appending(path: id.uuidString, directoryHint: .isDirectory)
    }

    static func manifest(_ scanID: UUID) -> URL { scan(scanID).appending(path: "manifest.json") }
    static func measurementsJSON(_ scanID: UUID) -> URL { scan(scanID).appending(path: "measurements.json") }
    static func measurementsCSV(_ scanID: UUID) -> URL { scan(scanID).appending(path: "measurements.csv") }
    static func tapeChecks(_ scanID: UUID) -> URL { scan(scanID).appending(path: "tape-checks.json") }

    static func segments(_ scanID: UUID) -> URL {
        scan(scanID).appending(path: "segments", directoryHint: .isDirectory)
    }

    static func segment(_ scanID: UUID, _ segmentID: UUID) -> URL {
        segments(scanID).appending(path: segmentID.uuidString, directoryHint: .isDirectory)
    }

    static func structureJSON(_ scanID: UUID, _ segmentID: UUID) -> URL {
        segment(scanID, segmentID).appending(path: "structure.json")
    }

    static func structureUSDZ(_ scanID: UUID, _ segmentID: UUID) -> URL {
        segment(scanID, segmentID).appending(path: "structure.usdz")
    }

    static func worldMap(_ scanID: UUID, _ segmentID: UUID) -> URL {
        segment(scanID, segmentID).appending(path: "worldmap.arworldmap")
    }

    static func rooms(_ scanID: UUID, _ segmentID: UUID) -> URL {
        segment(scanID, segmentID).appending(path: "rooms", directoryHint: .isDirectory)
    }

    static func room(_ scanID: UUID, _ segmentID: UUID, _ roomID: UUID) -> URL {
        rooms(scanID, segmentID).appending(path: roomID.uuidString, directoryHint: .isDirectory)
    }

    enum RoomFile: String {
        /// The archived `CapturedRoomData`. SPEC §5.3 — this is the master asset;
        /// everything else in the folder is derived from it.
        case raw = "raw.capturedroomdata"
        case json = "room.json"
        case parametricUSDZ = "room-parametric.usdz"
        case meshUSDZ = "room-mesh.usdz"
        case thumbnail = "thumbnail.png"
    }

    static func roomFile(_ scanID: UUID, _ segmentID: UUID, _ roomID: UUID, _ file: RoomFile) -> URL {
        room(scanID, segmentID, roomID).appending(path: file.rawValue)
    }
}
