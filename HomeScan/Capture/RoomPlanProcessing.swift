import Foundation
import RoomPlan

/// The two RoomPlan build steps, wrapped so they run off the main actor.
///
/// `RoomBuilder` and `StructureBuilder` are non-`Sendable` classes; creating and
/// consuming each one inside a `nonisolated` async function keeps it in a single
/// isolation region and keeps the work — which is slow enough to jank the UI
/// (SPEC §11) — off the main thread.
enum RoomPlanProcessing {

    /// Re-derives a `CapturedRoom` from the archived intermediate. This is the whole
    /// point of keeping `raw.capturedroomdata` (SPEC §5.3): different options, or a
    /// newer OS, without re-walking the house.
    nonisolated static func buildRoom(
        from data: CapturedRoomData,
        options: RoomBuilder.ConfigurationOptions = [.beautifyObjects]
    ) async throws -> CapturedRoom {
        let builder = RoomBuilder(options: options)
        return try await builder.capturedRoom(from: data)
    }

    /// Merges a segment's rooms into one structure. Throws `.insufficientInput` for
    /// a single room, which callers treat as "nothing to merge", not as a failure.
    nonisolated static func buildStructure(
        from rooms: [CapturedRoom],
        options: StructureBuilder.ConfigurationOptions = [.beautifyObjects]
    ) async throws -> CapturedStructure {
        let builder = StructureBuilder(options: options)
        return try await builder.capturedStructure(from: rooms)
    }
}
