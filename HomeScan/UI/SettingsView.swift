import RoomPlan
import SwiftUI

/// Settings (SPEC §8): sync endpoint and token, export defaults, storage used.
struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppSettings.self) private var settings

    @State private var storageUsed: Int64 = 0
    @State private var isPresentingSmokeTest = false

    var body: some View {
        @Bindable var settings = settings

        NavigationStack {
            Form {
                Section {
                    Picker("Units", selection: $settings.unitSystem) {
                        ForEach(UnitSystem.allCases) { system in
                            Text(system.displayName).tag(system)
                        }
                    }
                } header: {
                    Text("Display")
                } footer: {
                    Text("Measurements are always stored in metres. This only changes how they are shown.")
                }

                Section {
                    TextField("https://scans.local/upload", text: $settings.syncEndpoint)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    SecureField("Bearer token (optional)", text: $settings.syncToken)
                    Toggle("Allow cellular", isOn: $settings.allowsCellularSync)
                } header: {
                    Text("Sync")
                } footer: {
                    if settings.syncEndpoint.isEmpty {
                        Text("Scans are zipped and POSTed to this endpoint using a background upload, so a large house survives the app being backgrounded. Assumed to be a server on your own network. The token is stored in the keychain.")
                    } else if settings.syncEndpointURL == nil {
                        Label("That does not look like a valid URL.", systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.orange)
                    } else {
                        Text("Uploads POST a zip of the whole scan directory. Local data is never deleted on a successful upload.")
                    }
                }

                Section {
                    Toggle("Parametric USDZ", isOn: exportBinding(.parametric))
                    Toggle("Mesh USDZ", isOn: exportBinding(.mesh))
                    Toggle("Model USDZ", isOn: exportBinding(.model))
                } header: {
                    Text("Export")
                } footer: {
                    Text("Parametric and mesh are both written by default: they feed different downstream tools and the storage cost is trivial next to re-scanning.")
                }

                Section {
                    Toggle("Archive ARWorldMap per segment", isOn: $settings.persistWorldMap)
                } header: {
                    Text("Capture")
                } footer: {
                    Text("Lets a later visit relocalize into the same space and extend a scan instead of restarting it. Off by default: the maps are large, and identical-layout spaces — adjacent units with the same floor plan — confuse relocalization.")
                }

                Section("Storage") {
                    LabeledContent("Scans on disk", value: UnitFormatter.bytes(storageUsed))
                    Text("Scans live in the app's Documents folder: Files ▸ Browse ▸ On My iPhone ▸ HomeScan ▸ Scans ▸ <scan id>. The folder only appears there once a scan has actually been written. The archived capture data is the master asset — everything else can be re-derived from it.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section {
                    Button("Run Capture Smoke Test") { isPresentingSmokeTest = true }
                        .disabled(!RoomCaptureSession.isSupported)
                    LabeledContent("RoomPlan supported", value: RoomCaptureSession.isSupported ? "Yes" : "No")
                    LabeledContent("Device", value: DeviceInfo.modelIdentifier)
                    LabeledContent("iOS", value: DeviceInfo.osVersion)
                } header: {
                    Text("Diagnostics")
                } footer: {
                    Text("The smoke test scans a single room with Apple's stock UI and dumps the CapturedRoom JSON to the console. Run it first on any new OS build, before trusting a whole-house capture.")
                }

                Section {
                    AccuracyDisclaimer()
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task { storageUsed = await ScanStore.shared.totalSizeOnDisk() }
            .fullScreenCover(isPresented: $isPresentingSmokeTest) {
                SmokeTestView()
            }
        }
    }

    private func exportBinding(_ option: ExportOptionSet) -> Binding<Bool> {
        Binding(
            get: { settings.exportOptions.contains(option) },
            set: { isOn in
                var options = settings.exportOptions
                if isOn { options.insert(option) } else { options.remove(option) }
                settings.exportOptions = options
            }
        )
    }
}
