import Foundation
import RoomPlan

/// Owns the single RoomCaptureView instance and its session lifecycle.
/// Kept as one object (not split into a UIViewRepresentable Coordinator) so
/// the SwiftUI "Done" button drawn outside the representable can drive the
/// same session it points at.
final class RoomCaptureModel: NSObject, ObservableObject, RoomCaptureViewDelegate {

    let captureView: RoomCaptureView
    private let sessionConfig = RoomCaptureSession.Configuration()

    @Published var finishedRoom: CapturedRoom?
    @Published var captureError: String?

    override init() {
        captureView = RoomCaptureView(frame: .zero)
        super.init()
        captureView.delegate = self
    }

    func startSession() {
        finishedRoom = nil
        captureError = nil
        captureView.captureSession.run(configuration: sessionConfig)
    }

    func stopSession() {
        captureView.captureSession.stop()
    }

    // MARK: - RoomCaptureViewDelegate

    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
        // Let RoomCaptureView run its own post-processing and show its
        // built-in static review render before handing us the result.
        return true
    }

    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        if let error {
            captureError = error.localizedDescription
            return
        }
        finishedRoom = processedResult
    }
}
