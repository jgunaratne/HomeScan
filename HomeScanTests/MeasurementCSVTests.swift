import Foundation
import Testing
@testable import HomeScan

struct MeasurementCSVTests {

    @Test("Fields with commas and quotes are escaped per RFC 4180")
    func escaping() {
        #expect(MeasurementCSV.escape("Kitchen") == "Kitchen")
        #expect(MeasurementCSV.escape("Kitchen, Main") == "\"Kitchen, Main\"")
        #expect(MeasurementCSV.escape("Bob's \"Den\"") == "\"Bob's \"\"Den\"\"\"")
        #expect(MeasurementCSV.escape("two\nlines") == "\"two\nlines\"")
    }

    @Test("A room label with a comma cannot shift the columns")
    func rowIntegrity() {
        let row = MeasurementCSV.row(["Kitchen, Main", "18.42", "198.3"])
        #expect(row == "\"Kitchen, Main\",18.42,198.3")
    }

    @Test("The rendered sheet has a header, a row per room, and a labelled total")
    func render() {
        let schedule = MeasurementSchedule(rooms: [
            RoomMeasurement(
                id: UUID(), label: "Kitchen", floorArea: 18.42, areaMethod: .floorPolygon,
                ceilingHeight: HeightStats(median: 2.44, min: 2.41, max: 2.47),
                perimeter: 17.8, perimeterMethod: .floorPolygon,
                walls: [WallMeasurement(id: UUID(), length: 4.2, height: 2.44, confidence: .high)],
                openings: [OpeningMeasurement(id: UUID(), type: .door, width: 0.81, height: 2.03, confidence: .high)],
                confidence: .high, footprint: .init(width: 4.2, depth: 4.4)
            )
        ])

        let csv = MeasurementCSV.render(schedule)
        let lines = csv.split(separator: "\n", omittingEmptySubsequences: false)

        #expect(lines[0] == MeasurementCSV.row(MeasurementCSV.columns))
        #expect(lines[1].hasPrefix("Kitchen,18.42,"))
        // Both unit systems are emitted so downstream conversion cannot go wrong.
        #expect(lines[1].contains("198.3"))
        #expect(lines[2].hasPrefix("TOTAL (net interior),18.42,"))
        // The convention travels with the numbers, even in CSV.
        #expect(csv.contains("net-interior"))
        #expect(csv.contains("Not gross/assessor square footage"))
    }
}
