import CoreGraphics
import Foundation
import RoomPlan
import UIKit

/// A plain top-down plan drawing of a scan: filled floor polygons, wall lines, and
/// gaps marked for doors and windows.
///
/// This is the thumbnail generator, not the floor-plan feature of SPEC §10 — no
/// dimensioning, no labels, no symbols. It is deliberately small and lives entirely
/// off the main actor so it can run inside the store's save path.
enum FloorPlanRenderer {

    /// Fixed colours rather than dynamic system ones: rendering happens off the
    /// main actor, where resolving a dynamic `UIColor` against the current trait
    /// collection is not safe. The thumbnail is drawn on a transparent background
    /// and tinted by the view that displays it.
    struct Style: Sendable {
        var background = UIColor.clear
        var floorFill = UIColor(white: 0.5, alpha: 0.22)
        var wall = UIColor(white: 0.35, alpha: 1.0)
        var door = UIColor(red: 0.0, green: 0.48, blue: 1.0, alpha: 1.0)
        var window = UIColor(red: 0.19, green: 0.69, blue: 0.78, alpha: 1.0)
        var wallWidth: CGFloat = 3
        var openingWidth: CGFloat = 4
        var padding: CGFloat = 16
    }

    static func pngData(for rooms: [CapturedRoom], size: CGSize, style: Style = Style()) -> Data? {
        image(for: rooms, size: size, style: style)?.pngData()
    }

    static func image(for rooms: [CapturedRoom], size: CGSize, style: Style = Style()) -> UIImage? {
        let geometry = collect(rooms)
        guard let extent = Geometry.bounds(of: geometry.allPoints), !geometry.allPoints.isEmpty else { return nil }

        let worldWidth = max(extent.max.x - extent.min.x, 0.001)
        let worldDepth = max(extent.max.y - extent.min.y, 0.001)
        let drawable = CGSize(
            width: max(size.width - style.padding * 2, 1),
            height: max(size.height - style.padding * 2, 1)
        )
        let scale = min(drawable.width / worldWidth, drawable.height / worldDepth)
        let offsetX = (size.width - worldWidth * scale) / 2
        let offsetY = (size.height - worldDepth * scale) / 2

        // World is Y-up and we are drawing a plan view, so world Z maps to screen Y.
        // Flip it so the plan is not mirrored front-to-back.
        func point(_ p: Geometry.PlanPoint) -> CGPoint {
            CGPoint(
                x: offsetX + (p.x - extent.min.x) * scale,
                y: offsetY + (worldDepth - (p.y - extent.min.y)) * scale
            )
        }

        let format = UIGraphicsImageRendererFormat()
        format.opaque = false
        format.scale = 2
        let renderer = UIGraphicsImageRenderer(size: size, format: format)

        return renderer.image { context in
            let cg = context.cgContext

            if style.background != UIColor.clear {
                cg.setFillColor(style.background.cgColor)
                cg.fill(CGRect(origin: .zero, size: size))
            }

            cg.setFillColor(style.floorFill.cgColor)
            for polygon in geometry.floors where polygon.count >= 3 {
                cg.beginPath()
                cg.move(to: point(polygon[0]))
                for p in polygon.dropFirst() { cg.addLine(to: point(p)) }
                cg.closePath()
                cg.fillPath()
            }

            cg.setLineCap(.round)

            func stroke(_ segments: [(Geometry.PlanPoint, Geometry.PlanPoint)], color: UIColor, width: CGFloat) {
                cg.setStrokeColor(color.cgColor)
                cg.setLineWidth(width)
                for (a, b) in segments {
                    cg.beginPath()
                    cg.move(to: point(a))
                    cg.addLine(to: point(b))
                    cg.strokePath()
                }
            }

            stroke(geometry.walls, color: style.wall, width: style.wallWidth)
            stroke(geometry.windows, color: style.window, width: style.openingWidth)
            stroke(geometry.doors, color: style.door, width: style.openingWidth)
        }
    }

    // MARK: - Geometry collection

    private struct PlanGeometry {
        var floors: [[Geometry.PlanPoint]] = []
        var walls: [(Geometry.PlanPoint, Geometry.PlanPoint)] = []
        var doors: [(Geometry.PlanPoint, Geometry.PlanPoint)] = []
        var windows: [(Geometry.PlanPoint, Geometry.PlanPoint)] = []

        var allPoints: [Geometry.PlanPoint] {
            floors.flatMap { $0 }
                + walls.flatMap { [$0.0, $0.1] }
                + doors.flatMap { [$0.0, $0.1] }
                + windows.flatMap { [$0.0, $0.1] }
        }
    }

    private static func collect(_ rooms: [CapturedRoom]) -> PlanGeometry {
        var geometry = PlanGeometry()
        for room in rooms {
            for floor in room.floors where floor.polygonCorners.count >= 3 {
                geometry.floors.append(floor.polygonCorners.map { Geometry.planProject($0, by: floor.transform) })
            }
            for wall in room.walls {
                geometry.walls.append(Geometry.wallEndpoints(length: wall.dimensions.x, transform: wall.transform))
            }
            for door in room.doors {
                geometry.doors.append(Geometry.wallEndpoints(length: door.dimensions.x, transform: door.transform))
            }
            for window in room.windows {
                geometry.windows.append(Geometry.wallEndpoints(length: window.dimensions.x, transform: window.transform))
            }
        }
        return geometry
    }
}
