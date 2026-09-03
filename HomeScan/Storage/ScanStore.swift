import Foundation
import RoomPlan

enum ScanStoreError: LocalizedError {
    case scanNotFound(UUID)
    case roomDataMissing(UUID)
    case noRoomsCaptured

    var errorDescription: String? {
        switch self {
        case .scanNotFound(let id): "No scan found with id \(id.uuidString)."
        case .roomDataMissing(let id): "The archived capture data for room \(id.uuidString) is missing."
        case .noRoomsCaptured: "No rooms were captured."
        }
    }
}

/// All scan file I/O, off the main actor (SPEC §11).
///
/// The store owns the invariant that matters: the archived `CapturedRoomData` is
/// written *first* and is never deleted to save space. JSON, USDZ, thumbnails and
/// measurements are all derived and can be regenerated from it.
actor ScanStore {
    static let shared = ScanStore()

    private let fileManager = FileManager.default

    private init() {}

    // MARK: - Scans

    func createScan(name: String) throws -> ScanManifest {
        let manifest = ScanManifest(name: name)
        try fileManager.createDirectory(at: ScanPaths.segments(manifest.id), withIntermediateDirectories: true)
        try write(manifest: manifest)
        return manifest
    }

    func listScans() throws -> [ScanManifest] {
        guard fileManager.fileExists(atPath: ScanPaths.scansRoot.path(percentEncoded: false)) else { return [] }
        let entries = try fileManager.contentsOfDirectory(
            at: ScanPaths.scansRoot,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        )
        let manifests = entries.compactMap { url -> ScanManifest? in
            let manifestURL = url.appending(path: "manifest.json")
            guard let data = try? Data(contentsOf: manifestURL) else { return nil }
            return try? ScanJSON.decoder().decode(ScanManifest.self, from: data)
        }
        return manifests.sorted { $0.createdAt > $1.createdAt }
    }

    func manifest(for scanID: UUID) throws -> ScanManifest {
        let url = ScanPaths.manifest(scanID)
        guard let data = try? Data(contentsOf: url) else { throw ScanStoreError.scanNotFound(scanID) }
        return try ScanJSON.decoder().decode(ScanManifest.self, from: data)
    }

    func write(manifest: ScanManifest) throws {
        let data = try ScanJSON.encoder().encode(manifest)
        try fileManager.createDirectory(at: ScanPaths.scan(manifest.id), withIntermediateDirectories: true)
        try data.write(to: ScanPaths.manifest(manifest.id), options: .atomic)
    }

    /// Read-modify-write under the actor so concurrent writers cannot clobber
    /// each other's manifest updates.
    @discardableResult
    func updateManifest(_ scanID: UUID, _ mutate: @Sendable (inout ScanManifest) -> Void) throws -> ScanManifest {
        var manifest = try manifest(for: scanID)
        mutate(&manifest)
        try write(manifest: manifest)
        return manifest
    }

    func rename(scanID: UUID, to name: String) throws {
        try updateManifest(scanID) { $0.name = name }
    }

    func delete(scanID: UUID) throws {
        try fileManager.removeItem(at: ScanPaths.scan(scanID))
    }

    func markSynced(scanID: UUID, at date: Date) throws {
        try updateManifest(scanID) { $0.syncedAt = date }
    }

    // MARK: - Rooms

    /// Persists one captured room. The raw intermediate lands first; the derived
    /// artefacts are best-effort so a USDZ export failure never costs the capture.
    func saveRoom(
        scanID: UUID,
        segmentID: UUID,
        roomID: UUID,
        label: String,
        rawData: CapturedRoomData,
        room: CapturedRoom,
        exportOptions: ExportOptionSet,
        /// False when rewriting derived artefacts for a room that was not re-scanned,
        /// e.g. a re-derive from the archived intermediate.
        bumpsVersion: Bool = true
    ) throws -> RoomRecord {
        let roomDir = ScanPaths.room(scanID, segmentID, roomID)
        try fileManager.createDirectory(at: roomDir, withIntermediateDirectories: true)

        // 1. The master asset. If this fails, the whole save fails.
        let raw = try ScanJSON.encoder(prettyPrinted: false).encode(rawData)
        try raw.write(to: ScanPaths.roomFile(scanID, segmentID, roomID, .raw), options: .atomic)

        // 2. Derived artefacts.
        let roomJSON = try ScanJSON.encoder().encode(room)
        try roomJSON.write(to: ScanPaths.roomFile(scanID, segmentID, roomID, .json), options: .atomic)

        exportUSDZ(room: room, scanID: scanID, segmentID: segmentID, roomID: roomID, options: exportOptions)

        if let png = FloorPlanRenderer.pngData(for: [room], size: CGSize(width: 512, height: 512)) {
            try? png.write(to: ScanPaths.roomFile(scanID, segmentID, roomID, .thumbnail), options: .atomic)
        }

        let measurement = MeasurementEngine.measure(room: room, id: roomID, label: label)
        let record = RoomRecord(
            id: roomID,
            label: label,
            confidence: measurement.confidence,
            floorAreaSqM: measurement.floorArea,
            objectCount: room.objects.count,
            capturedRoomIdentifier: room.identifier
        )

        try updateManifest(scanID) { manifest in
            if let segmentIndex = manifest.segments.firstIndex(where: { $0.id == segmentID }) {
                if let roomIndex = manifest.segments[segmentIndex].rooms.firstIndex(where: { $0.id == roomID }) {
                    let existing = manifest.segments[segmentIndex].rooms[roomIndex]
                    var updated = record
                    updated.version = existing.version + (bumpsVersion ? 1 : 0)
                    if !bumpsVersion { updated.capturedAt = existing.capturedAt }
                    manifest.segments[segmentIndex].rooms[roomIndex] = updated
                } else {
                    manifest.segments[segmentIndex].rooms.append(record)
                }
            } else {
                manifest.segments.append(SegmentRecord(id: segmentID, rooms: [record]))
            }
        }

        return record
    }

    private func exportUSDZ(
        room: CapturedRoom,
        scanID: UUID,
        segmentID: UUID,
        roomID: UUID,
        options: ExportOptionSet
    ) {
        // Both parametric and mesh by default: they feed different downstream tools
        // and the storage cost is trivial next to re-walking the house (SPEC §5.4).
        if options.contains(.parametric) {
            try? room.export(
                to: ScanPaths.roomFile(scanID, segmentID, roomID, .parametricUSDZ),
                exportOptions: .parametric
            )
        }
        if options.contains(.mesh) {
            try? room.export(
                to: ScanPaths.roomFile(scanID, segmentID, roomID, .meshUSDZ),
                exportOptions: .mesh
            )
        }
    }

    func loadRoom(scanID: UUID, segmentID: UUID, roomID: UUID) throws -> CapturedRoom {
        let url = ScanPaths.roomFile(scanID, segmentID, roomID, .json)
        let data = try Data(contentsOf: url)
        return try ScanJSON.decoder().decode(CapturedRoom.self, from: data)
    }

    func loadRawRoomData(scanID: UUID, segmentID: UUID, roomID: UUID) throws -> CapturedRoomData {
        let url = ScanPaths.roomFile(scanID, segmentID, roomID, .raw)
        guard let data = try? Data(contentsOf: url) else { throw ScanStoreError.roomDataMissing(roomID) }
        return try ScanJSON.decoder().decode(CapturedRoomData.self, from: data)
    }

    /// Every room of a scan, in manifest order, skipping any whose JSON is missing.
    func loadAllRooms(scanID: UUID) throws -> [(segmentID: UUID, record: RoomRecord, room: CapturedRoom)] {
        let manifest = try manifest(for: scanID)
        var result: [(UUID, RoomRecord, CapturedRoom)] = []
        for segment in manifest.segments {
            for record in segment.rooms {
                guard let room = try? loadRoom(scanID: scanID, segmentID: segment.id, roomID: record.id) else { continue }
                result.append((segment.id, record, room))
            }
        }
        return result
    }

    // MARK: - Structures

    func saveStructure(_ structure: CapturedStructure, scanID: UUID, segmentID: UUID) throws {
        try fileManager.createDirectory(at: ScanPaths.segment(scanID, segmentID), withIntermediateDirectories: true)
        let data = try ScanJSON.encoder().encode(structure)
        try data.write(to: ScanPaths.structureJSON(scanID, segmentID), options: .atomic)
        try? structure.export(to: ScanPaths.structureUSDZ(scanID, segmentID), exportOptions: .parametric)

        try updateManifest(scanID) { manifest in
            if let index = manifest.segments.firstIndex(where: { $0.id == segmentID }) {
                manifest.segments[index].hasStructure = true
            }
        }
    }

    func loadStructure(scanID: UUID, segmentID: UUID) -> CapturedStructure? {
        guard let data = try? Data(contentsOf: ScanPaths.structureJSON(scanID, segmentID)) else { return nil }
        return try? ScanJSON.decoder().decode(CapturedStructure.self, from: data)
    }

    func saveWorldMapData(_ data: Data, scanID: UUID, segmentID: UUID) throws {
        try fileManager.createDirectory(at: ScanPaths.segment(scanID, segmentID), withIntermediateDirectories: true)
        try data.write(to: ScanPaths.worldMap(scanID, segmentID), options: .atomic)
    }

    // MARK: - Measurements

    /// Re-derives the whole schedule from what is on disk. Cheap, and it means the
    /// numbers can be regenerated after a re-scan, a re-derive, or an OS upgrade
    /// without re-walking the house.
    ///
    /// SPEC §6.4: de-duplicate on the merged structure's rooms, never on the
    /// pre-merge captures, or overlapping captures get counted twice.
    func deriveMeasurements(scanID: UUID) throws -> MeasurementSchedule {
        let manifest = try manifest(for: scanID)
        var inputs: [MeasurementEngine.Input] = []

        for segment in manifest.segments {
            let sources: [RoomLabelMatcher.Source] = segment.rooms.compactMap { record in
                guard let room = try? loadRoom(scanID: scanID, segmentID: segment.id, roomID: record.id) else { return nil }
                return RoomLabelMatcher.Source(id: record.id, label: record.label, room: room)
            }
            guard !sources.isEmpty else { continue }

            if let structure = loadStructure(scanID: scanID, segmentID: segment.id), !structure.rooms.isEmpty {
                inputs += RoomLabelMatcher.inputs(forMerged: structure.rooms, sources: sources)
            } else {
                // No merge for this segment (single room, or the merge failed).
                inputs += sources.map { MeasurementEngine.Input(id: $0.id, label: $0.label, room: $0.room) }
            }
        }

        let schedule = MeasurementEngine.schedule(for: inputs)
        try writeMeasurements(schedule, scanID: scanID)
        return schedule
    }

    func writeMeasurements(_ schedule: MeasurementSchedule, scanID: UUID) throws {
        let json = try ScanJSON.encoder().encode(schedule)
        try json.write(to: ScanPaths.measurementsJSON(scanID), options: .atomic)
        let csv = MeasurementCSV.render(schedule)
        try Data(csv.utf8).write(to: ScanPaths.measurementsCSV(scanID), options: .atomic)
    }

    func loadMeasurements(scanID: UUID) -> MeasurementSchedule? {
        guard let data = try? Data(contentsOf: ScanPaths.measurementsJSON(scanID)) else { return nil }
        return try? ScanJSON.decoder().decode(MeasurementSchedule.self, from: data)
    }

    // MARK: - Tape checks

    func tapeChecks(scanID: UUID) -> [TapeCheck] {
        guard let data = try? Data(contentsOf: ScanPaths.tapeChecks(scanID)) else { return [] }
        return (try? ScanJSON.decoder().decode([TapeCheck].self, from: data)) ?? []
    }

    func appendTapeCheck(_ check: TapeCheck, scanID: UUID) throws {
        var checks = tapeChecks(scanID: scanID)
        checks.append(check)
        let data = try ScanJSON.encoder().encode(checks)
        try data.write(to: ScanPaths.tapeChecks(scanID), options: .atomic)
    }

    // MARK: - Housekeeping

    func thumbnailData(scanID: UUID) -> Data? {
        guard let manifest = try? manifest(for: scanID) else { return nil }
        for segment in manifest.segments {
            for room in segment.rooms {
                let url = ScanPaths.roomFile(scanID, segment.id, room.id, .thumbnail)
                if let data = try? Data(contentsOf: url) { return data }
            }
        }
        return nil
    }

    /// Best USDZ to preview for a scan: the merged structure if there is one,
    /// otherwise the first room's parametric export.
    func previewURL(scanID: UUID) -> URL? {
        guard let manifest = try? manifest(for: scanID) else { return nil }
        for segment in manifest.segments where segment.hasStructure {
            let url = ScanPaths.structureUSDZ(scanID, segment.id)
            if fileManager.fileExists(atPath: url.path(percentEncoded: false)) { return url }
        }
        for segment in manifest.segments {
            for room in segment.rooms {
                for file in [ScanPaths.RoomFile.parametricUSDZ, .meshUSDZ] {
                    let url = ScanPaths.roomFile(scanID, segment.id, room.id, file)
                    if fileManager.fileExists(atPath: url.path(percentEncoded: false)) { return url }
                }
            }
        }
        return nil
    }

    func sizeOnDisk(scanID: UUID) -> Int64 {
        Self.directorySize(ScanPaths.scan(scanID))
    }

    func totalSizeOnDisk() -> Int64 {
        Self.directorySize(ScanPaths.scansRoot)
    }

    nonisolated static func directorySize(_ url: URL) -> Int64 {
        let fm = FileManager.default
        guard let enumerator = fm.enumerator(
            at: url,
            includingPropertiesForKeys: [.totalFileAllocatedSizeKey, .fileAllocatedSizeKey],
            options: []
        ) else { return 0 }
        var total: Int64 = 0
        for case let fileURL as URL in enumerator {
            let values = try? fileURL.resourceValues(forKeys: [.totalFileAllocatedSizeKey, .fileAllocatedSizeKey])
            total += Int64(values?.totalFileAllocatedSize ?? values?.fileAllocatedSize ?? 0)
        }
        return total
    }
}
