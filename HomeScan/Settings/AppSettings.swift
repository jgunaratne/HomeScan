import Foundation
import Observation

/// User settings. The sync endpoint and token are configuration, never hardcoded
/// (SPEC §7); the bearer token lives in the keychain rather than UserDefaults.
@MainActor
@Observable
final class AppSettings {
    static let shared = AppSettings()

    private enum Key {
        static let syncEndpoint = "sync.endpoint"
        static let unitSystem = "display.unitSystem"
        static let exportOptions = "export.options"
        static let persistWorldMap = "capture.persistWorldMap"
        static let allowsCellularSync = "sync.allowsCellular"
    }

    private let defaults: UserDefaults

    var syncEndpoint: String {
        didSet { defaults.set(syncEndpoint, forKey: Key.syncEndpoint) }
    }

    /// Stored in the keychain, not UserDefaults — a bearer token is a credential.
    var syncToken: String {
        didSet { Keychain.set(syncToken, for: Keychain.syncTokenAccount) }
    }

    var unitSystem: UnitSystem {
        didSet { defaults.set(unitSystem.rawValue, forKey: Key.unitSystem) }
    }

    var exportOptions: ExportOptionSet {
        didSet { defaults.set(exportOptions.rawValue, forKey: Key.exportOptions) }
    }

    /// SPEC §5.3 — a stretch goal, and off by default: relocalization is confused
    /// by identical-layout spaces, and the maps are large.
    var persistWorldMap: Bool {
        didSet { defaults.set(persistWorldMap, forKey: Key.persistWorldMap) }
    }

    var allowsCellularSync: Bool {
        didSet { defaults.set(allowsCellularSync, forKey: Key.allowsCellularSync) }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.syncEndpoint = defaults.string(forKey: Key.syncEndpoint) ?? ""
        self.syncToken = Keychain.get(Keychain.syncTokenAccount) ?? ""
        self.unitSystem = defaults.string(forKey: Key.unitSystem)
            .flatMap(UnitSystem.init(rawValue:)) ?? .imperial
        self.exportOptions = defaults.object(forKey: Key.exportOptions)
            .flatMap { $0 as? Int }
            .map { ExportOptionSet(rawValue: $0) } ?? .default
        self.persistWorldMap = defaults.bool(forKey: Key.persistWorldMap)
        self.allowsCellularSync = defaults.object(forKey: Key.allowsCellularSync) as? Bool ?? true
    }

    /// A configured, syntactically valid HTTPS endpoint, or nil.
    var syncEndpointURL: URL? {
        guard let url = URL(string: syncEndpoint.trimmingCharacters(in: .whitespacesAndNewlines)),
              url.scheme?.lowercased() == "https" || url.scheme?.lowercased() == "http",
              url.host() != nil
        else { return nil }
        return url
    }

    /// Snapshot for handing to non-MainActor code.
    var syncConfiguration: SyncConfiguration? {
        guard let url = syncEndpointURL else { return nil }
        let token = syncToken.trimmingCharacters(in: .whitespacesAndNewlines)
        return SyncConfiguration(
            endpoint: url,
            bearerToken: token.isEmpty ? nil : token,
            allowsCellular: allowsCellularSync
        )
    }
}

struct SyncConfiguration: Sendable, Equatable {
    var endpoint: URL
    var bearerToken: String?
    var allowsCellular: Bool
}

/// Minimal keychain wrapper for the one secret this app holds.
enum Keychain {
    static let syncTokenAccount = "com.homescan.sync.bearerToken"

    private static func query(_ account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "HomeScan",
            kSecAttrAccount as String: account,
        ]
    }

    static func get(_ account: String) -> String? {
        var query = query(account)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data
        else { return nil }
        return String(data: data, encoding: .utf8)
    }

    @discardableResult
    static func set(_ value: String, for account: String) -> Bool {
        let query = query(account)
        if value.isEmpty {
            SecItemDelete(query as CFDictionary)
            return true
        }
        let data = Data(value.utf8)
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var insert = query
            insert.merge(attributes) { current, _ in current }
            return SecItemAdd(insert as CFDictionary, nil) == errSecSuccess
        }
        return status == errSecSuccess
    }
}
