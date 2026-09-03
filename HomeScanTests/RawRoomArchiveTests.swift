import Foundation
import Testing
@testable import HomeScan

/// `CapturedRoomData` cannot be constructed outside a capture, so these cover the
/// two things about the archive that do not depend on RoomPlan: that an archive
/// written in either format is read back with the coder that wrote it, and that
/// the property-list fallback tolerates the same geometry the JSON one does.
struct RawRoomArchiveTests {

    private struct Geometry: Codable, Equatable {
        var width: Float
        var height: Double
    }

    @Test("A binary property list is recognised by its header")
    func detectsPropertyList() throws {
        let encoder = PropertyListEncoder()
        encoder.outputFormat = .binary
        let data = try encoder.encode(Geometry(width: 1, height: 2))
        #expect(RawRoomArchive.Format.detected(in: data) == .binaryPropertyList)
    }

    @Test("JSON is the assumed format, which is what every archive written so far is")
    func detectsJSON() throws {
        let data = try ScanJSON.encoder(prettyPrinted: false).encode(Geometry(width: 1, height: 2))
        #expect(RawRoomArchive.Format.detected(in: data) == .json)
    }

    @Test("An empty or truncated archive is not mistaken for a property list")
    func detectsShortData() {
        #expect(RawRoomArchive.Format.detected(in: Data()) == .json)
        #expect(RawRoomArchive.Format.detected(in: Data("bpli".utf8)) == .json)
    }

    @Test("The fallback format carries NaN and infinity, which JSON only survives by convention")
    func propertyListCarriesNonConformingFloats() throws {
        let encoder = PropertyListEncoder()
        encoder.outputFormat = .binary
        let data = try encoder.encode(Geometry(width: .nan, height: .infinity))
        let decoded = try PropertyListDecoder().decode(Geometry.self, from: data)
        #expect(decoded.width.isNaN)
        #expect(decoded.height == .infinity)
    }
}
