import Foundation
import RoomPlan
import simd

/// Turns RoomPlan geometry into the room schedule (SPEC §6).
///
/// RoomPlan hands you metres and transforms; it does not hand you a floor plan
/// schedule. This is that derivation layer, and every convention it applies is
/// recorded in the output rather than left implicit.
enum MeasurementEngine {

    /// One room's worth of input: RoomPlan's geometry plus HomeScan's identity for it.
    struct Input: Sendable {
        var id: UUID
        var label: String
        var room: CapturedRoom
    }

    static func schedule(for inputs: [Input], generatedAt: Date = Date()) -> MeasurementSchedule {
        MeasurementSchedule(
            generatedAt: generatedAt,
            rooms: inputs.map { measure(room: $0.room, id: $0.id, label: $0.label) }
        )
    }

    // MARK: - Per room

    static func measure(room: CapturedRoom, id: UUID, label: String) -> RoomMeasurement {
        let walls = room.walls.map {
            WallMeasurement(
                id: $0.identifier,
                length: Double($0.dimensions.x),
                height: Double($0.dimensions.y),
                confidence: $0.confidence.level
            )
        }

        let openings =
            room.doors.map { opening($0, kind: .door) }
            + room.windows.map { opening($0, kind: .window) }
            + room.openings.map { opening($0, kind: .opening) }

        let (area, areaMethod, footprintPolygon) = floorArea(of: room)

        // Perimeter follows the same source as the area so the two numbers always
        // describe the same outline.
        let perimeter: Double
        let perimeterMethod: PerimeterMethod
        if areaMethod == .floorPolygon, let polygon = footprintPolygon, polygon.count >= 3 {
            perimeter = Geometry.perimeter(of: polygon)
            perimeterMethod = .floorPolygon
        } else {
            perimeter = walls.reduce(0) { $0 + $1.length }
            perimeterMethod = .wallLengths
        }

        let ceiling = Geometry.stats(walls.map(\.height)) ?? HeightStats(median: 0, min: 0, max: 0)

        // SPEC §6.6: the room inherits the *worst* confidence of the surfaces that
        // define its shape. Furniture confidence does not affect the measurements.
        let shapeConfidences = room.walls.map(\.confidence.level) + room.floors.map(\.confidence.level)
        let confidence = shapeConfidences.min() ?? .low

        var footprint: RoomMeasurement.Footprint?
        if let polygon = footprintPolygon, let extent = Geometry.bounds(of: polygon) {
            footprint = .init(width: extent.max.x - extent.min.x, depth: extent.max.y - extent.min.y)
        }

        return RoomMeasurement(
            id: id,
            label: label,
            floorArea: area,
            areaMethod: areaMethod,
            ceilingHeight: ceiling,
            perimeter: perimeter,
            perimeterMethod: perimeterMethod,
            walls: walls,
            openings: openings,
            confidence: confidence,
            footprint: footprint
        )
    }

    private static func opening(_ surface: CapturedRoom.Surface, kind: OpeningKind) -> OpeningMeasurement {
        OpeningMeasurement(
            id: surface.identifier,
            type: kind,
            width: Double(surface.dimensions.x),
            height: Double(surface.dimensions.y),
            confidence: surface.confidence.level
        )
    }

    // MARK: - Floor area (SPEC §6.2)

    /// Returns the area, how it was obtained, and the plan-view outline it came from.
    ///
    /// Order of preference:
    /// 1. Shoelace over each floor surface's `polygonCorners` — handles L-shaped and
    ///    bay-windowed rooms correctly.
    /// 2. The floor surface's bounding rectangle, when RoomPlan gave a floor but no
    ///    polygon. Flagged estimated.
    /// 3. Convex hull of the wall endpoints, when there is no floor surface at all —
    ///    it happens on cluttered or poorly-lit scans. Flagged estimated.
    static func floorArea(of room: CapturedRoom) -> (Double, AreaMethod, [Geometry.PlanPoint]?) {
        var polygonArea = 0.0
        var largestOutline: [Geometry.PlanPoint]?
        var largestOutlineArea = 0.0

        for floor in room.floors {
            let corners = floor.polygonCorners
            guard corners.count >= 3 else { continue }
            let plan = corners.map { Geometry.planProject($0, by: floor.transform) }
            let area = Geometry.area(of: plan)
            guard area > 0 else { continue }
            polygonArea += area
            if area > largestOutlineArea {
                largestOutlineArea = area
                largestOutline = plan
            }
        }

        if polygonArea > 0 {
            return (polygonArea, .floorPolygon, largestOutline)
        }

        // A floor surface exists but carried no usable polygon.
        if !room.floors.isEmpty {
            var boundsArea = 0.0
            var outline: [Geometry.PlanPoint]?
            for floor in room.floors {
                let w = floor.dimensions.x, d = floor.dimensions.y
                guard w > 0, d > 0 else { continue }
                boundsArea += Double(w * d)
                if outline == nil {
                    let hw = w / 2, hd = d / 2
                    outline = [
                        SIMD3<Float>(-hw, -hd, 0), SIMD3<Float>(hw, -hd, 0),
                        SIMD3<Float>(hw, hd, 0), SIMD3<Float>(-hw, hd, 0),
                    ].map { Geometry.planProject($0, by: floor.transform) }
                }
            }
            if boundsArea > 0 {
                return (boundsArea, .floorBounds, outline)
            }
        }

        // No floor at all: fall back to the walls and say so.
        let endpoints = room.walls.flatMap { wall -> [Geometry.PlanPoint] in
            let (a, b) = Geometry.wallEndpoints(length: wall.dimensions.x, transform: wall.transform)
            return [a, b]
        }
        guard endpoints.count >= 3 else { return (0, .wallFootprint, nil) }
        let hull = Geometry.convexHull(endpoints)
        return (Geometry.area(of: hull), .wallFootprint, hull)
    }

    /// Plan-view outline used for drawing and for matching merged rooms back to
    /// their pre-merge labels.
    static func planOutline(of room: CapturedRoom) -> [Geometry.PlanPoint]? {
        floorArea(of: room).2
    }
}

extension CapturedRoom.Confidence {
    var level: ConfidenceLevel {
        switch self {
        case .high: .high
        case .medium: .medium
        case .low: .low
        @unknown default: .low
        }
    }
}
