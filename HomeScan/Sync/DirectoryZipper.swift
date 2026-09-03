import Foundation

enum ZipError: LocalizedError {
    case coordinationFailed(String)

    var errorDescription: String? {
        switch self {
        case .coordinationFailed(let message): "Could not package the scan: \(message)"
        }
    }
}

/// Zips a scan directory using `NSFileCoordinator`'s `.forUploading` reading
/// intent — the system's own directory-to-archive path, with no third-party
/// dependency and no cloud-provider coupling (SPEC §7).
///
/// The coordinator's archive is only valid inside the accessor block, so it is
/// copied out to a caller-owned URL before returning.
enum DirectoryZipper {

    static func zip(directory: URL, to destination: URL) throws {
        let coordinator = NSFileCoordinator()
        var coordinationError: NSError?
        var copyError: (any Error)?

        coordinator.coordinate(
            readingItemAt: directory,
            options: [.forUploading],
            error: &coordinationError
        ) { temporaryURL in
            do {
                if FileManager.default.fileExists(atPath: destination.path(percentEncoded: false)) {
                    try FileManager.default.removeItem(at: destination)
                }
                try FileManager.default.createDirectory(
                    at: destination.deletingLastPathComponent(),
                    withIntermediateDirectories: true
                )
                try FileManager.default.copyItem(at: temporaryURL, to: destination)
            } catch {
                copyError = error
            }
        }

        if let coordinationError {
            throw ZipError.coordinationFailed(coordinationError.localizedDescription)
        }
        if let copyError { throw copyError }
    }

    /// A scratch location for an upload payload. Caches, not Documents: it is
    /// derived data and must not appear in the Files app next to real scans.
    static func stagingURL(for scanID: UUID) -> URL {
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return caches
            .appending(path: "SyncStaging", directoryHint: .isDirectory)
            .appending(path: "\(scanID.uuidString).zip")
    }
}
