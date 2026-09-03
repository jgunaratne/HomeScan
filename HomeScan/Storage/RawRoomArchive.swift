import Foundation
import RoomPlan

/// The archived `CapturedRoomData` — HomeScan's master asset (SPEC §5.3) — in the
/// form that goes to disk, or the reason there is none.
///
/// Encoding is deliberately separate from writing. The bytes are produced the
/// moment RoomPlan hands the intermediate over; the write happens later, once the
/// user has given the room a label. Only the encode has ever failed, and it is the
/// step that cannot be retried after the capture session has moved on.
enum RawRoomArchive: Sendable {
    case encoded(Data)
    /// Every format refused the payload. The room is still saved and measurable —
    /// it just cannot be re-derived. This string is what the user is shown.
    case failed(String)

    /// Disk formats, in the order they are tried.
    ///
    /// JSON first: it is what `raw.capturedroomdata` has always been and what every
    /// other file HomeScan writes. A binary property list is the fallback because
    /// `CapturedRoomData`'s `Codable` conformance is entirely RoomPlan's own — it
    /// has been seen to reject its own payload through `JSONEncoder` with nothing
    /// but "Invalid data." — and an archive in a second format beats no archive.
    enum Format: CaseIterable, Sendable {
        case json
        case binaryPropertyList

        var name: String {
            switch self {
            case .json: "JSON"
            case .binaryPropertyList: "binary property list"
            }
        }

        func encode(_ raw: CapturedRoomData) throws -> Data {
            switch self {
            case .json:
                return try ScanJSON.encoder(prettyPrinted: false).encode(raw)
            case .binaryPropertyList:
                let encoder = PropertyListEncoder()
                encoder.outputFormat = .binary
                return try encoder.encode(raw)
            }
        }

        /// Which format wrote these bytes. The two are trivially told apart: a
        /// binary property list starts with `bplist`, JSON never does.
        static func detected(in data: Data) -> Format {
            data.starts(with: Array("bplist".utf8)) ? .binaryPropertyList : .json
        }

        func decode(_ data: Data) throws -> CapturedRoomData {
            switch self {
            case .json:
                return try ScanJSON.decoder().decode(CapturedRoomData.self, from: data)
            case .binaryPropertyList:
                return try PropertyListDecoder().decode(CapturedRoomData.self, from: data)
            }
        }
    }

    /// Encodes the intermediate, verifying each candidate by decoding it back
    /// before accepting it.
    static func make(from raw: CapturedRoomData) -> RawRoomArchive {
        var rejections: [String] = []
        for format in Format.allCases {
            do {
                let data = try format.encode(raw)
                // An archive that writes but cannot be read back is worse than a
                // recorded failure: nothing would notice until a re-derive, long
                // after the room could have been re-scanned.
                _ = try format.decode(data)
                if !rejections.isEmpty {
                    ScanLog.store.notice("Raw capture data archived as \(format.name, privacy: .public) after \(rejections.count, privacy: .public) format(s) refused it")
                }
                return .encoded(data)
            } catch {
                let rejection = "\(format.name): \(ScanStore.diagnostic(for: error))"
                ScanLog.store.error("Archiving raw capture data failed — \(rejection, privacy: .public)")
                rejections.append(rejection)
            }
        }
        return .failed(rejections.joined(separator: " "))
    }

    /// Decodes an archive written in either format.
    static func decode(_ data: Data) throws -> CapturedRoomData {
        try Format.detected(in: data).decode(data)
    }
}
