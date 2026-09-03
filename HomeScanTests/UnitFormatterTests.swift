import Foundation
import Testing
@testable import HomeScan

/// SPEC §6.5: a room is «12'4" × 14'2", 175 sq ft», never 175.3847.
struct UnitFormatterTests {

    @Test("Feet and inches round to the nearest inch")
    func feetAndInches() {
        #expect(UnitFormatter.feetAndInches(3.7592) == "12'4\"")   // 12 ft 4 in
        #expect(UnitFormatter.feetAndInches(4.3180) == "14'2\"")   // 14 ft 2 in
        #expect(UnitFormatter.feetAndInches(0) == "0'0\"")
    }

    @Test("A length just under the next foot rolls over, and never reads 9'12\"")
    func inchRollover() {
        // 3.03784 m = 9 ft 11.6 in. Rounding the total inch count gives 120 in,
        // which must format as 10'0" — the naive split would say 9'12".
        let rolledOver = UnitFormatter.feetAndInches(3.03784)
        #expect(rolledOver == "10'0\"")
        #expect(!rolledOver.contains("12\""))

        // 3.03276 m = 9 ft 11.4 in, which stays at 9'11".
        #expect(UnitFormatter.feetAndInches(3.03276) == "9'11\"")
    }

    @Test("Negative lengths keep their sign")
    func negativeLength() {
        #expect(UnitFormatter.feetAndInches(-0.3048) == "-1'0\"")
    }

    @Test("Areas are shown to a precision the scan can support")
    func areaPrecision() {
        // 16.3 m² is about 175 sq ft — an integer, not 175.4562.
        #expect(UnitFormatter.area(16.2838, system: .imperial) == "175 sq ft")
        #expect(UnitFormatter.area(16.2838, system: .metric) == "16.3 m²")
        // Small areas keep one decimal so a closet is not rounded to nothing.
        #expect(UnitFormatter.area(0.5, system: .imperial) == "5.4 sq ft")
    }

    @Test("Metric lengths use two decimals")
    func metricLength() {
        #expect(UnitFormatter.length(2.4384, system: .metric) == "2.44 m")
    }

    @Test("Tape-check deltas need sub-foot precision")
    func preciseLength() {
        #expect(UnitFormatter.preciseLength(0.025, system: .metric) == "25 mm")
        #expect(UnitFormatter.preciseLength(0.0254, system: .imperial) == "1.0 in")
        #expect(UnitFormatter.preciseLength(1.5, system: .metric) == "1.500 m")
    }

    @Test("Conversions round-trip")
    func conversionRoundTrip() {
        let meters = 3.7592
        #expect(abs(UnitConvert.feetToMeters(UnitConvert.metersToFeet(meters)) - meters) < 1e-12)
        #expect(abs(UnitConvert.inchesToMeters(1) - 0.0254) < 1e-12)
        #expect(abs(UnitConvert.squareMetersToSquareFeet(1) - 10.7639104167) < 1e-9)
    }

    @Test("Dimensions read as a room, not a data dump")
    func dimensions() {
        #expect(UnitFormatter.dimensions(width: 3.7592, depth: 4.3180, system: .imperial) == "12'4\" × 14'2\"")
    }
}
