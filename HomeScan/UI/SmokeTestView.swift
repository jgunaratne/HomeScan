import OSLog
import RoomPlan
import SwiftUI

/// M0 — the feasibility smoke test (SPEC §9).
///
/// A bare `RoomCaptureView` with Apple's stock coaching *and* post-scan result view,
/// scanning one room and dumping the `CapturedRoom` JSON to the console. Nothing in
/// HomeScan's own capture path is involved, so a failure here isolates the problem
/// to RoomPlan on this device and OS build rather than to this app.
///
/// It stays in the shipping build under Settings ▸ Diagnostics: RoomPlan has had no
/// substantive updates in recent OS releases, and this is the cheapest way to check
/// a new one before trusting a whole house to it.
struct SmokeTestView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var host = SmokeTestHost()
    @State private var summary: String?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if RoomCaptureSession.isSupported {
                RoomCaptureViewRepresentable(captureView: host.captureView)
                    .ignoresSafeArea()
            } else {
                UnsupportedDeviceView()
            }

            VStack {
                HStack {
                    Button("Close") { dismiss() }
                        .buttonStyle(.borderedProminent)
                    Spacer()
                    if !host.isRunning {
                        Button("Start") { host.start() }
                            .buttonStyle(.borderedProminent)
                    } else {
                        Button("Stop") { host.stop() }
                            .buttonStyle(.bordered)
                    }
                }
                Spacer()
                if let summary {
                    Text(summary)
                        .font(.footnote.monospaced())
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
            }
            .padding()
        }
        .preferredColorScheme(.dark)
        .onChange(of: host.summary) { _, new in summary = new }
    }
}

@MainActor
@Observable
final class SmokeTestHost {
    private(set) var isRunning = false
    private(set) var summary: String?

    @ObservationIgnored let captureView = RoomCaptureView(frame: .zero)
    @ObservationIgnored private var proxy: RoomCaptureViewProxy?
    @ObservationIgnored private let log = Logger(subsystem: "com.homescan", category: "smoketest")

    init() {
        let proxy = RoomCaptureViewProxy(
            // Let RoomPlan present its own result view — the point of M0 is to
            // exercise Apple's stock path end to end.
            presentsResultView: true,
            onCapturedData: { _, error in
                if let error {
                    Task { @MainActor [weak self] in self?.report(error: error) }
                }
            },
            onProcessedRoom: { room, error in
                Task { @MainActor [weak self] in self?.report(room: room, error: error) }
            }
        )
        captureView.delegate = proxy
        self.proxy = proxy
    }

    func start() {
        var configuration = RoomCaptureSession.Configuration()
        configuration.isCoachingEnabled = true
        captureView.captureSession.run(configuration: configuration)
        isRunning = true
        summary = nil
    }

    func stop() {
        captureView.captureSession.stop()
        isRunning = false
    }

    private func report(error: any Error) {
        isRunning = false
        summary = "Capture error: \(error.localizedDescription)"
        log.error("Smoke test capture failed: \(error.localizedDescription, privacy: .public)")
    }

    private func report(room: CapturedRoom, error: (any Error)?) {
        isRunning = false
        if let error {
            report(error: error)
            return
        }

        let (area, method, _) = MeasurementEngine.floorArea(of: room)
        summary = """
        walls: \(room.walls.count)  doors: \(room.doors.count)  windows: \(room.windows.count)
        openings: \(room.openings.count)  objects: \(room.objects.count)  floors: \(room.floors.count)
        area: \(String(format: "%.2f", area)) m² via \(method.rawValue)
        JSON dumped to the console.
        """

        // SPEC M0: dump the CapturedRoom JSON so the geometry can be eyeballed.
        do {
            let data = try ScanJSON.encoder().encode(room)
            let json = String(decoding: data, as: UTF8.self)
            log.info("CapturedRoom JSON (\(data.count, privacy: .public) bytes)")
            // Logger truncates long messages, so chunk it — the whole point is to
            // be able to read the geometry back.
            for chunk in json.chunked(into: 3000) {
                log.info("\(chunk, privacy: .public)")
            }
        } catch {
            log.error("Failed to encode CapturedRoom: \(error.localizedDescription, privacy: .public)")
        }
    }
}

extension String {
    func chunked(into size: Int) -> [String] {
        guard size > 0, !isEmpty else { return [self] }
        var result: [String] = []
        var index = startIndex
        while index < endIndex {
            let end = self.index(index, offsetBy: size, limitedBy: endIndex) ?? endIndex
            result.append(String(self[index..<end]))
            index = end
        }
        return result
    }
}
