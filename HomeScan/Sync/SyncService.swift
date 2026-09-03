import Foundation
import Observation
import UIKit

enum SyncState: Equatable, Sendable {
    case idle
    case preparing
    case uploading(fraction: Double)
    case synced(Date)
    case failed(String)

    var isActive: Bool {
        switch self {
        case .preparing, .uploading: true
        case .idle, .synced, .failed: false
        }
    }
}

enum SyncError: LocalizedError {
    case notConfigured
    case badStatus(Int)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            "No sync endpoint is configured. Set one in Settings."
        case .badStatus(let code):
            "The server rejected the upload (HTTP \(code))."
        }
    }
}

/// Push-to-server sync (SPEC §7).
///
/// Zips the scan directory and uploads it with a *background* `URLSession`, so a
/// whole-house scan survives the app being backgrounded or the user locking the
/// phone. The endpoint and bearer token are configuration; nothing here assumes a
/// cloud provider or the public internet.
///
/// Local data is never deleted on success — the manifest just gains a `syncedAt`.
@MainActor
@Observable
final class SyncService: NSObject, URLSessionDelegate, URLSessionTaskDelegate {

    static let shared = SyncService()

    static let backgroundSessionIdentifier = "com.homescan.sync.background"

    private(set) var states: [UUID: SyncState] = [:]

    @ObservationIgnored private var session: URLSession!
    @ObservationIgnored private var backgroundCompletionHandler: (() -> Void)?
    @ObservationIgnored private let store = ScanStore.shared

    private override init() {
        super.init()
        let configuration = URLSessionConfiguration.background(withIdentifier: Self.backgroundSessionIdentifier)
        configuration.isDiscretionary = false
        configuration.sessionSendsLaunchEvents = true
        // A house scan is hundreds of megabytes; give the transfer room to finish.
        configuration.timeoutIntervalForResource = 60 * 60 * 6
        self.session = URLSession(configuration: configuration, delegate: self, delegateQueue: .main)
    }

    func state(for scanID: UUID) -> SyncState { states[scanID] ?? .idle }

    /// Picks up transfers that were still running when the app was last killed.
    func restoreInFlightTransfers() async {
        let tasks = await session.allTasks
        for task in tasks {
            guard let description = task.taskDescription, let scanID = UUID(uuidString: description) else { continue }
            states[scanID] = .uploading(fraction: progress(of: task))
        }
    }

    func upload(scanID: UUID, configuration: SyncConfiguration?) async {
        guard let configuration else {
            states[scanID] = .failed(SyncError.notConfigured.localizedDescription)
            return
        }

        states[scanID] = .preparing
        let destination = DirectoryZipper.stagingURL(for: scanID)
        let source = ScanPaths.scan(scanID)

        do {
            try await Task.detached(priority: .utility) {
                try DirectoryZipper.zip(directory: source, to: destination)
            }.value
        } catch {
            states[scanID] = .failed(error.localizedDescription)
            return
        }

        var request = URLRequest(url: configuration.endpoint)
        request.httpMethod = "POST"
        request.setValue("application/zip", forHTTPHeaderField: "Content-Type")
        request.setValue(scanID.uuidString, forHTTPHeaderField: "X-HomeScan-Scan-Id")
        request.setValue(DeviceInfo.modelIdentifier, forHTTPHeaderField: "X-HomeScan-Device")
        if let token = configuration.bearerToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.allowsCellularAccess = configuration.allowsCellular

        let task = session.uploadTask(with: request, fromFile: destination)
        // taskDescription survives a background relaunch, which a local dictionary
        // would not — it is how a completion that arrives after the app was killed
        // still finds its scan.
        task.taskDescription = scanID.uuidString
        states[scanID] = .uploading(fraction: 0)
        task.resume()
    }

    func registerBackgroundCompletion(_ handler: @escaping () -> Void, for identifier: String) {
        guard identifier == Self.backgroundSessionIdentifier else {
            handler()
            return
        }
        backgroundCompletionHandler = handler
    }

    private func progress(of task: URLSessionTask) -> Double {
        guard task.countOfBytesExpectedToSend > 0 else { return 0 }
        return Double(task.countOfBytesSent) / Double(task.countOfBytesExpectedToSend)
    }

    // MARK: - URLSessionTaskDelegate
    // The session's delegate queue is the main queue, so these run main-thread.

    nonisolated func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didSendBodyData bytesSent: Int64,
        totalBytesSent: Int64,
        totalBytesExpectedToSend: Int64
    ) {
        MainActor.assumeIsolated {
            guard let description = task.taskDescription,
                  let scanID = UUID(uuidString: description),
                  totalBytesExpectedToSend > 0
            else { return }
            states[scanID] = .uploading(fraction: Double(totalBytesSent) / Double(totalBytesExpectedToSend))
        }
    }

    nonisolated func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: (any Error)?
    ) {
        MainActor.assumeIsolated {
            guard let description = task.taskDescription, let scanID = UUID(uuidString: description) else { return }
            let statusCode = (task.response as? HTTPURLResponse)?.statusCode
            finish(scanID: scanID, error: error, statusCode: statusCode)
        }
    }

    nonisolated func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        MainActor.assumeIsolated {
            backgroundCompletionHandler?()
            backgroundCompletionHandler = nil
        }
    }

    private func finish(scanID: UUID, error: (any Error)?, statusCode: Int?) {
        try? FileManager.default.removeItem(at: DirectoryZipper.stagingURL(for: scanID))

        if let error {
            states[scanID] = .failed(error.localizedDescription)
            return
        }
        guard let statusCode, (200..<300).contains(statusCode) else {
            states[scanID] = .failed(SyncError.badStatus(statusCode ?? 0).localizedDescription)
            return
        }

        let syncedAt = Date()
        states[scanID] = .synced(syncedAt)
        Task { [store] in
            try? await store.markSynced(scanID: scanID, at: syncedAt)
        }
    }
}
