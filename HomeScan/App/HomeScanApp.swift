import SwiftUI
import UIKit

@main
struct HomeScanApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var settings = AppSettings.shared
    @State private var sync = SyncService.shared

    var body: some Scene {
        WindowGroup {
            LibraryView()
                .environment(settings)
                .environment(sync)
                .task { await sync.restoreInFlightTransfers() }
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    /// The system relaunches the app here when a background upload finishes while
    /// the app is not running. Recreating `SyncService` rebinds the background
    /// session so its delegate callbacks can be delivered.
    func application(
        _ application: UIApplication,
        handleEventsForBackgroundURLSession identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        let handler = UncheckedSendableBox(completionHandler)
        MainActor.assumeIsolated {
            SyncService.shared.registerBackgroundCompletion(handler.value, for: identifier)
        }
    }
}

/// UIKit hands over a non-`Sendable` completion handler; it is only ever called on
/// the main actor, which the box makes explicit rather than silent.
struct UncheckedSendableBox<T>: @unchecked Sendable {
    let value: T
    init(_ value: T) { self.value = value }
}
