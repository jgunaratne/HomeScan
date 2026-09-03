import Foundation
import RoomPlan

/// `StructureBuilder` re-identifies rooms during the merge, so the `CapturedRoom`s
/// coming out of a `CapturedStructure` do not carry the identifiers — or therefore
/// the user's labels — of the rooms that went in.
///
/// SPEC §6.4 requires de-duplicating on the merged structure rather than the
/// pre-merge rooms, so the merged rooms are what gets measured, and the labels
/// have to be carried across. Matching is by plan-view centroid: rooms do not move
/// during a merge, they are only reconciled with each other.
enum RoomLabelMatcher {

    struct Source: Sendable {
        var id: UUID
        var label: String
        var room: CapturedRoom
    }

    struct Match: Sendable {
        var id: UUID
        var label: String
    }

    /// Rooms further apart than this are never considered the same room. A merged
    /// room that matches nothing gets a generic label rather than a wrong one.
    static let maxMatchDistanceMeters = 4.0

    static func centroid(of room: CapturedRoom) -> Geometry.PlanPoint? {
        if let outline = MeasurementEngine.planOutline(of: room), let c = Geometry.centroid(of: outline) {
            return c
        }
        let wallCenters = room.walls.map { wall in
            let t = Geometry.translation(of: wall.transform)
            return Geometry.PlanPoint(t.x, t.z)
        }
        return Geometry.centroid(of: wallCenters)
    }

    /// Greedy nearest-pair assignment: closest pair first, each side used once.
    /// Returns a map keyed by the merged room's RoomPlan identifier.
    static func match(merged: [CapturedRoom], sources: [Source]) -> [UUID: Match] {
        let mergedCentroids = merged.map { centroid(of: $0) }
        let sourceCentroids = sources.map { centroid(of: $0.room) }

        struct Pair {
            let mergedIndex: Int
            let sourceIndex: Int
            let distance: Double
        }

        var pairs: [Pair] = []
        for (m, mc) in mergedCentroids.enumerated() {
            guard let mc else { continue }
            for (s, sc) in sourceCentroids.enumerated() {
                guard let sc else { continue }
                let d = Geometry.distance(mc, sc)
                guard d <= maxMatchDistanceMeters else { continue }
                pairs.append(Pair(mergedIndex: m, sourceIndex: s, distance: d))
            }
        }
        pairs.sort { $0.distance < $1.distance }

        var result: [UUID: Match] = [:]
        var usedMerged = Set<Int>()
        var usedSource = Set<Int>()
        for pair in pairs {
            guard !usedMerged.contains(pair.mergedIndex), !usedSource.contains(pair.sourceIndex) else { continue }
            usedMerged.insert(pair.mergedIndex)
            usedSource.insert(pair.sourceIndex)
            let source = sources[pair.sourceIndex]
            result[merged[pair.mergedIndex].identifier] = Match(id: source.id, label: source.label)
        }
        return result
    }

    /// Builds measurement inputs for a merged structure, carrying user labels across
    /// and naming anything unmatched honestly.
    static func inputs(forMerged merged: [CapturedRoom], sources: [Source]) -> [MeasurementEngine.Input] {
        let matches = match(merged: merged, sources: sources)
        var unmatchedIndex = 0
        return merged.map { room in
            if let match = matches[room.identifier] {
                return MeasurementEngine.Input(id: match.id, label: match.label, room: room)
            }
            unmatchedIndex += 1
            return MeasurementEngine.Input(
                id: room.identifier,
                label: "Unlabelled room \(unmatchedIndex)",
                room: room
            )
        }
    }
}
