import Foundation
import simd

/// Pure geometry helpers, deliberately free of any RoomPlan types so the maths
/// that produces the numbers users care about can be unit tested off-device.
///
/// Everything here is metric (SPEC §6.5). Conversion happens at the display layer.
enum Geometry {

    // MARK: - Plan-view projection

    /// A point in the world XZ plane — the plan view. RoomPlan's world frame is
    /// Y-up, so the floor plan lives in XZ.
    typealias PlanPoint = SIMD2<Double>

    /// Transforms a point from a surface's local frame into the world frame and
    /// projects it onto the XZ (plan) plane.
    static func planProject(_ local: SIMD3<Float>, by transform: simd_float4x4) -> PlanPoint {
        let world = transform * SIMD4<Float>(local, 1)
        return PlanPoint(Double(world.x), Double(world.z))
    }

    static func translation(of transform: simd_float4x4) -> SIMD3<Double> {
        let c = transform.columns.3
        return SIMD3<Double>(Double(c.x), Double(c.y), Double(c.z))
    }

    // MARK: - Area

    /// Signed area of a polygon by the shoelace formula. Sign encodes winding order;
    /// callers that only want magnitude should use ``area(of:)``.
    static func signedArea(of polygon: [PlanPoint]) -> Double {
        guard polygon.count >= 3 else { return 0 }
        var sum = 0.0
        for i in polygon.indices {
            let a = polygon[i]
            let b = polygon[(i + 1) % polygon.count]
            sum += (a.x * b.y) - (b.x * a.y)
        }
        return sum / 2
    }

    /// Absolute polygon area in square metres.
    static func area(of polygon: [PlanPoint]) -> Double {
        abs(signedArea(of: polygon))
    }

    static func perimeter(of polygon: [PlanPoint]) -> Double {
        guard polygon.count >= 2 else { return 0 }
        var sum = 0.0
        for i in polygon.indices {
            let a = polygon[i]
            let b = polygon[(i + 1) % polygon.count]
            sum += distance(a, b)
        }
        return sum
    }

    static func distance(_ a: PlanPoint, _ b: PlanPoint) -> Double {
        let dx = a.x - b.x
        let dy = a.y - b.y
        return (dx * dx + dy * dy).squareRoot()
    }

    static func centroid(of points: [PlanPoint]) -> PlanPoint? {
        guard !points.isEmpty else { return nil }
        let sum = points.reduce(PlanPoint.zero, +)
        return sum / Double(points.count)
    }

    /// Axis-aligned extent of a point set: (width along X, depth along Z).
    static func bounds(of points: [PlanPoint]) -> (min: PlanPoint, max: PlanPoint)? {
        guard let first = points.first else { return nil }
        var lo = first, hi = first
        for p in points.dropFirst() {
            lo.x = Swift.min(lo.x, p.x); lo.y = Swift.min(lo.y, p.y)
            hi.x = Swift.max(hi.x, p.x); hi.y = Swift.max(hi.y, p.y)
        }
        return (lo, hi)
    }

    // MARK: - Convex hull

    /// Andrew's monotone chain. Used only for the wall-footprint *fallback* area:
    /// it over-estimates any non-convex (L-shaped) room, which is exactly why
    /// rooms measured this way are flagged estimated rather than trusted.
    static func convexHull(_ points: [PlanPoint]) -> [PlanPoint] {
        guard points.count >= 3 else { return points }
        let sorted = points.sorted { $0.x == $1.x ? $0.y < $1.y : $0.x < $1.x }

        func cross(_ o: PlanPoint, _ a: PlanPoint, _ b: PlanPoint) -> Double {
            (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
        }

        func build(_ pts: [PlanPoint]) -> [PlanPoint] {
            var chain: [PlanPoint] = []
            for p in pts {
                while chain.count >= 2, cross(chain[chain.count - 2], chain[chain.count - 1], p) <= 0 {
                    chain.removeLast()
                }
                chain.append(p)
            }
            chain.removeLast()
            return chain
        }

        let hull = build(sorted) + build(sorted.reversed())
        return hull.count >= 3 ? hull : points
    }

    // MARK: - Statistics

    /// SPEC §6.3: the median resists a single mis-detected wall running up a
    /// stairwell, which the max does not.
    static func median(_ values: [Double]) -> Double? {
        guard !values.isEmpty else { return nil }
        let sorted = values.sorted()
        let mid = sorted.count / 2
        if sorted.count.isMultiple(of: 2) {
            return (sorted[mid - 1] + sorted[mid]) / 2
        }
        return sorted[mid]
    }

    static func stats(_ values: [Double]) -> HeightStats? {
        guard let median = median(values), let lo = values.min(), let hi = values.max() else { return nil }
        return HeightStats(median: median, min: lo, max: hi)
    }

    // MARK: - Wall endpoints

    /// A RoomPlan wall is a plane, not a solid: `dimensions.x` runs along the wall
    /// and the local origin sits at its centre. These are its two ends in plan view.
    static func wallEndpoints(length: Float, transform: simd_float4x4) -> (PlanPoint, PlanPoint) {
        let half = length / 2
        return (
            planProject(SIMD3<Float>(-half, 0, 0), by: transform),
            planProject(SIMD3<Float>(half, 0, 0), by: transform)
        )
    }
}
