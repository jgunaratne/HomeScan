import RoomPlan
import SwiftUI

/// Hosts the `RoomCaptureView` the coordinator owns.
///
/// The view is created by the coordinator, not here, because its lifetime is tied
/// to an ARSession that has to outlive individual rooms. SwiftUI just displays it.
struct RoomCaptureViewRepresentable: UIViewRepresentable {
    let captureView: RoomCaptureView

    func makeUIView(context: Context) -> RoomCaptureView { captureView }

    func updateUIView(_ uiView: RoomCaptureView, context: Context) {}
}
