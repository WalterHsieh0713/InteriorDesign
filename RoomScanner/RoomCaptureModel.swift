import Foundation
import Combine
import RoomPlan
import ARKit
import CoreImage
import UIKit

/// Owns the single RoomCaptureView instance and its session lifecycle.
/// Kept as one object (not split into a UIViewRepresentable Coordinator) so
/// the SwiftUI "Done" button drawn outside the representable can drive the
/// same session it points at.
final class RoomCaptureModel: NSObject, ObservableObject, RoomCaptureViewDelegate {

    let captureView: RoomCaptureView
    private let sessionConfig = RoomCaptureSession.Configuration()

    @Published var finishedRoom: CapturedRoom?
    @Published var captureError: String?

    /// JPEG frames sampled during the scan. RoomPlan's CapturedRoom carries
    /// no imagery at all, so without these the web app has no way to know
    /// what anything in the room actually looks like and falls back to a
    /// generic palette. Uploaded alongside the layout and fed to
    /// /api/colorize.
    private(set) var sampledFrames: [Data] = []

    private var sampleTimer: Timer?
    private let ciContext = CIContext()
    private let maxFrames = 6
    private let sampleInterval: TimeInterval = 2.5

    override init() {
        captureView = RoomCaptureView(frame: .zero)
        super.init()
        captureView.delegate = self
    }

    func startSession() {
        finishedRoom = nil
        captureError = nil
        sampledFrames = []
        captureView.captureSession.run(configuration: sessionConfig)

        // Sampled on a timer rather than every frame: we only need enough
        // coverage to read colors off the walls, floor and furniture, and
        // holding on to 60fps of camera buffers would be wasteful.
        sampleTimer = Timer.scheduledTimer(withTimeInterval: sampleInterval, repeats: true) { [weak self] _ in
            self?.sampleCurrentFrame()
        }
    }

    func stopSession() {
        sampleTimer?.invalidate()
        sampleTimer = nil
        captureView.captureSession.stop()
    }

    private func sampleCurrentFrame() {
        guard sampledFrames.count < maxFrames else {
            sampleTimer?.invalidate()
            sampleTimer = nil
            return
        }
        // NOTE: assumes RoomCaptureSession exposes its underlying ARSession.
        // If this doesn't compile against the current SDK, the frames can
        // also be pulled by setting an ARSessionDelegate on that session.
        guard let frame = captureView.captureSession.arSession.currentFrame else { return }

        let image = CIImage(cvPixelBuffer: frame.capturedImage)
        guard let cgImage = ciContext.createCGImage(image, from: image.extent) else { return }
        if let jpeg = UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.5) {
            sampledFrames.append(jpeg)
        }
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
