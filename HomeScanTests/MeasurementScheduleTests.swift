import Foundation
import Testing
@testable import HomeScan

/// The verification rules and totals from SPEC §6.4 and §6.6.
struct MeasurementScheduleTests {

    private func room(
        label: String,
        area: Double,
        method: AreaMethod = .floorPolygon,
        confidence: ConfidenceLevel = .high
    ) -> RoomMeasurement {
        RoomMeasurement(
            id: UUID(),
            label: label,
            floorArea: area,
            areaMethod: method,
            ceilingHeight: HeightStats(median: 2.44, min: 2.41, max: 2.47),
            perimeter: 17.8,
            perimeterMethod: .floorPolygon,
            walls: [WallMeasurement(id: UUID(), length: 4.2, height: 2.44, confidence: confidence)],
            openings: [OpeningMeasurement(id: UUID(), type: .door, width: 0.81, height: 2.03, confidence: .high)],
            confidence: confidence,
            footprint: .init(width: 4.2, depth: 4.4)
        )
    }

    @Test("A clean scan produces a verified total")
    func verifiedTotal() {
        let schedule = MeasurementSchedule(rooms: [
            room(label: "Kitchen", area: 18.42),
            room(label: "Living Room", area: 24.1),
        ])
        #expect(schedule.total.roomCount == 2)
        #expect(abs(schedule.total.floorArea - 42.52) < 1e-9)
        #expect(schedule.total.verified)
        #expect(schedule.total.excludedRoomCount == 0)
        #expect(schedule.total.verifiedFloorArea == schedule.total.floorArea)
    }

    @Test("A low-confidence room is excluded from the verified total but still counted")
    func lowConfidenceExcluded() {
        let schedule = MeasurementSchedule(rooms: [
            room(label: "Kitchen", area: 18.0),
            room(label: "Garage", area: 30.0, confidence: .low),
        ])
        #expect(!schedule.total.verified)
        #expect(schedule.total.excludedRoomCount == 1)
        #expect(abs(schedule.total.floorArea - 48.0) < 1e-9)
        #expect(abs(schedule.total.verifiedFloorArea - 18.0) < 1e-9)
    }

    @Test("An estimated area is excluded even at high confidence")
    func estimatedExcluded() {
        let estimated = room(label: "Attic", area: 12.0, method: .wallFootprint)
        #expect(estimated.isEstimated)
        #expect(!estimated.countsTowardVerifiedTotal)

        let schedule = MeasurementSchedule(rooms: [room(label: "Kitchen", area: 18.0), estimated])
        #expect(!schedule.total.verified)
        #expect(schedule.total.excludedRoomCount == 1)
    }

    @Test("An empty scan is never verified")
    func emptyIsNotVerified() {
        let schedule = MeasurementSchedule(rooms: [])
        #expect(!schedule.total.verified)
        #expect(schedule.total.floorArea == 0)
    }

    @Test("The convention is stated in the file, not assumed by the reader")
    func conventionIsPersisted() throws {
        // Whole-second date: ISO8601 encoding drops sub-second precision, so a
        // `Date()` would not survive the round trip byte for byte.
        let schedule = MeasurementSchedule(
            generatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            rooms: [room(label: "Kitchen", area: 18.42)]
        )
        let data = try ScanJSON.encoder().encode(schedule)
        let json = String(decoding: data, as: UTF8.self)
        #expect(json.contains("\"convention\" : \"net-interior\""))
        #expect(json.contains("\"units\" : \"meters\""))
        #expect(json.contains("\"areaMethod\" : \"floor-polygon\""))

        let decoded = try ScanJSON.decoder().decode(MeasurementSchedule.self, from: data)
        #expect(decoded == schedule)
    }

    @Test("Confidence orders low < medium < high so `min` picks the worst")
    func confidenceOrdering() {
        #expect(ConfidenceLevel.low < .medium)
        #expect(ConfidenceLevel.medium < .high)
        #expect([ConfidenceLevel.high, .low, .medium].min() == .low)
    }

    @Test("Tape check verdicts")
    func tapeCheckVerdicts() {
        func check(scanned: Double, measured: Double) -> TapeCheck {
            TapeCheck(roomID: UUID(), roomLabel: "Kitchen", wallID: UUID(),
                      scannedLength: scanned, measuredLength: measured)
        }
        // 4.20 scanned against 4.19 measured — a quarter inch out.
        #expect(check(scanned: 4.20, measured: 4.19).verdict == .good)
        // 2% out: usable, but do not quote it to two decimals.
        #expect(check(scanned: 4.284, measured: 4.20).verdict == .acceptable)
        // 5% out: something in this environment is wrong.
        #expect(check(scanned: 4.41, measured: 4.20).verdict == .poor)
        // Under-reads are judged the same as over-reads.
        #expect(check(scanned: 3.99, measured: 4.20).verdict == .poor)
        #expect(abs(check(scanned: 4.41, measured: 4.20).deltaMeters - 0.21) < 1e-9)
    }
}
