import Foundation
import Testing
@testable import HomeScan

/// `CapturedRoomData` encodes itself opaquely, so the only thing HomeScan can
/// assert about archiving it is that the shared coder tolerates the float values
/// RoomPlan geometry actually contains. Stock `JSONEncoder` does not: it throws on
/// NaN and infinity, which is what silently cost scans their master asset.
struct ScanJSONTests {

    private struct Geometry: Codable, Equatable {
        var width: Float
        var height: Double
    }

    @Test("NaN survives a round trip through the shared coder")
    func nan() throws {
        let data = try ScanJSON.encoder().encode(Geometry(width: .nan, height: 3))
        let decoded = try ScanJSON.decoder().decode(Geometry.self, from: data)
        #expect(decoded.width.isNaN)
        #expect(decoded.height == 3)
    }

    @Test("Both infinities survive a round trip and keep their sign")
    func infinities() throws {
        let original = Geometry(width: .infinity, height: -.infinity)
        let data = try ScanJSON.encoder().encode(original)
        let decoded = try ScanJSON.decoder().decode(Geometry.self, from: data)
        #expect(decoded == original)
    }

    @Test("Ordinary values are unaffected")
    func finite() throws {
        let original = Geometry(width: 2.5, height: -0.75)
        let data = try ScanJSON.encoder().encode(original)
        #expect(try ScanJSON.decoder().decode(Geometry.self, from: data) == original)
    }

    @Test("An encoding failure is reported with its value and key path, not the stock text")
    func diagnostic() {
        let context = EncodingError.Context(
            codingPath: [Key(stringValue: "rooms"), Key(stringValue: "extent")],
            debugDescription: "Unable to encode Float.nan directly in JSON."
        )
        let message = ScanStore.diagnostic(for: EncodingError.invalidValue(Float.nan, context))
        #expect(message == "Unable to encode Float.nan directly in JSON. (at rooms.extent)")
    }

    @Test("A non-coding error keeps its own description")
    func passthrough() {
        let error = CocoaError(.fileNoSuchFile)
        #expect(ScanStore.diagnostic(for: error) == error.localizedDescription)
    }

    private struct Key: CodingKey {
        var stringValue: String
        var intValue: Int? { nil }
        init(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { nil }
    }
}
