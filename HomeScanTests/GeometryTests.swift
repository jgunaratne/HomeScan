import Foundation
import Testing
import simd
@testable import HomeScan

/// The geometry is the app: everything the user reads is derived from these
/// functions, and none of it can be checked on a simulator with a real scan.
struct GeometryTests {

    @Test("Shoelace area of a unit square")
    func unitSquare() {
        let square: [Geometry.PlanPoint] = [[0, 0], [1, 0], [1, 1], [0, 1]]
        #expect(abs(Geometry.area(of: square) - 1.0) < 1e-12)
    }

    @Test("Winding order flips the sign but not the area")
    func windingOrder() {
        let ccw: [Geometry.PlanPoint] = [[0, 0], [2, 0], [2, 3], [0, 3]]
        let cw = Array(ccw.reversed())
        #expect(Geometry.signedArea(of: ccw) == -Geometry.signedArea(of: cw))
        #expect(Geometry.area(of: ccw) == Geometry.area(of: cw))
        #expect(abs(Geometry.area(of: ccw) - 6) < 1e-12)
    }

    @Test("L-shaped room: the whole reason to use the polygon and not a bounding box")
    func lShapedRoom() {
        // 6×4 with a 2×2 bite taken out of one corner: 24 - 4 = 20 m².
        let lShape: [Geometry.PlanPoint] = [
            [0, 0], [6, 0], [6, 2], [4, 2], [4, 4], [0, 4],
        ]
        #expect(abs(Geometry.area(of: lShape) - 20) < 1e-9)

        // A bounding box would have said 24 — 20% high.
        let bounds = Geometry.bounds(of: lShape)!
        let boxArea = (bounds.max.x - bounds.min.x) * (bounds.max.y - bounds.min.y)
        #expect(abs(boxArea - 24) < 1e-9)
    }

    @Test("Degenerate polygons have no area")
    func degenerate() {
        #expect(Geometry.area(of: []) == 0)
        #expect(Geometry.area(of: [[0, 0]]) == 0)
        #expect(Geometry.area(of: [[0, 0], [1, 1]]) == 0)
        #expect(Geometry.area(of: [[0, 0], [1, 0], [2, 0]]) == 0)
    }

    @Test("Perimeter closes the loop")
    func perimeter() {
        let rect: [Geometry.PlanPoint] = [[0, 0], [3, 0], [3, 2], [0, 2]]
        #expect(abs(Geometry.perimeter(of: rect) - 10) < 1e-12)
    }

    @Test("Median resists a single wall running up a stairwell")
    func medianIsRobust() {
        // Four normal walls plus one that RoomPlan extended into a vaulted section.
        let heights = [2.44, 2.45, 2.43, 2.44, 5.20]
        #expect(Geometry.median(heights)! == 2.44)
        #expect(heights.max()! == 5.20)  // what the naive implementation would report
    }

    @Test("Median of an even count averages the middle pair")
    func medianEven() {
        #expect(Geometry.median([1, 2, 3, 4])! == 2.5)
        #expect(Geometry.median([]) == nil)
        #expect(Geometry.median([7])! == 7)
    }

    @Test("Height stats carry the spread")
    func heightStats() {
        let stats = Geometry.stats([2.4, 2.5, 2.6])!
        #expect(stats.median == 2.5)
        #expect(stats.min == 2.4)
        #expect(stats.max == 2.6)
        #expect(abs(stats.spread - 0.2) < 1e-9)
    }

    @Test("Convex hull of a point cloud is its outline")
    func convexHull() {
        let points: [Geometry.PlanPoint] = [
            [0, 0], [4, 0], [4, 4], [0, 4],
            [2, 2], [1, 3], [3, 1],  // interior points that must be dropped
        ]
        let hull = Geometry.convexHull(points)
        #expect(hull.count == 4)
        #expect(abs(Geometry.area(of: hull) - 16) < 1e-9)
    }

    @Test("Transforming a floor polygon into the world frame and projecting to XZ")
    func planProjection() {
        // A floor surface's local XY plane is mapped onto the world XZ plane, then
        // translated. This is exactly what MeasurementEngine does per corner.
        var transform = matrix_identity_float4x4
        // Rotate local +Y onto world +Z (i.e. -90° about X).
        transform.columns.1 = SIMD4<Float>(0, 0, 1, 0)
        transform.columns.2 = SIMD4<Float>(0, -1, 0, 0)
        transform.columns.3 = SIMD4<Float>(10, 0, 5, 1)

        let corners: [SIMD3<Float>] = [[-1, -2, 0], [1, -2, 0], [1, 2, 0], [-1, 2, 0]]
        let plan = corners.map { Geometry.planProject($0, by: transform) }

        #expect(abs(Geometry.area(of: plan) - 8) < 1e-5)
        let centroid = Geometry.centroid(of: plan)!
        #expect(abs(centroid.x - 10) < 1e-5)
        #expect(abs(centroid.y - 5) < 1e-5)
    }

    @Test("Wall endpoints straddle the wall's centre")
    func wallEndpoints() {
        var transform = matrix_identity_float4x4
        transform.columns.3 = SIMD4<Float>(2, 0, 3, 1)
        let (a, b) = Geometry.wallEndpoints(length: 4, transform: transform)
        #expect(abs(Geometry.distance(a, b) - 4) < 1e-5)
        let centre = Geometry.centroid(of: [a, b])!
        #expect(abs(centre.x - 2) < 1e-5)
        #expect(abs(centre.y - 3) < 1e-5)
    }
}
