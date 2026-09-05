import QuickLook
import SwiftUI
import UIKit

/// QuickLook preview of an exported USDZ (SPEC §8, Scan detail).
struct QuickLookView: UIViewControllerRepresentable {
    let url: URL
    /// Shown in QuickLook's own title bar. Without it every merged segment
    /// previews as "structure.usdz", which tells the user nothing about which
    /// floor they are looking at.
    var title: String?

    func makeCoordinator() -> Coordinator { Coordinator(url: url, title: title) }

    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: QLPreviewController, context: Context) {
        context.coordinator.update(url: url, title: title)
        controller.reloadData()
    }

    @MainActor
    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        private var item: Item

        init(url: URL, title: String?) {
            item = Item(url: url, title: title)
        }

        func update(url: URL, title: String?) {
            item = Item(url: url, title: title)
        }

        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> any QLPreviewItem {
            item
        }

        /// `QLPreviewItem` needs an `NSObject`; a `URL` alone cannot carry a title.
        private final class Item: NSObject, QLPreviewItem {
            let previewItemURL: URL?
            let previewItemTitle: String?

            init(url: URL, title: String?) {
                previewItemURL = url
                previewItemTitle = title
            }
        }
    }
}
