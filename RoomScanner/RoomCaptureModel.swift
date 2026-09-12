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

    /// Shown live during the scan so it's visible that colour capture is
    /// actually happening — colours silently not being collected is the
    /// kind of thing you only discover after the scan is over.
    @Published private(set) var capturedFrameCount = 0

    /// Every frame sampled during the scan. RoomPlan's CapturedRoom carries
    /// no imagery at all, so without these the web app has no idea what
    /// anything in the room looks like and falls back to a generic palette.
    private var frameBuffer: [Data] = []

    private var sampleTimer: Timer?
    private let ciContext = CIContext()
    private let encodeQueue = DispatchQueue(label: "room-scanner.frame-encode", qos: .utility)

    private let sampleInterval: TimeInterval = 2.5
    /// ~100s of scanning. Past this we stop rather than grow without bound;
    /// most room scans finish well inside it.
    private let bufferLimit = 40
    private let framesToUpload = 6

    /// Six frames spread evenly across the whole scan, not the first six.
    /// Sampling only at the start would hand back six photos of whichever
    /// corner you happened to begin in, leaving the rest of the room with
    /// no colour information.
    var sampledFrames: [Data] {
        guard frameBuffer.count > framesToUpload else { return frameBuffer }
        let step = Double(frameBuffer.count - 1) / Double(framesToUpload - 1)
        return (0..<framesToUpload).map { frameBuffer[Int((Double($0) * step).rounded())] }
    }

    override init() {
        captureView = RoomCaptureView(frame: .zero)
        super.init()
        captureView.delegate = self
    }

    func startSession() {
        finishedRoom = nil
        captureError = nil
        frameBuffer = []
        capturedFrameCount = 0
        captureView.captureSession.run(configuration: sessionConfig)

        // Sampled on a timer rather than every frame: colours only need
        // enough coverage to read walls, floor and furniture, and holding
        // 60fps of camera buffers would be pointless.
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
        guard frameBuffer.count < bufferLimit else {
            sampleTimer?.invalidate()
            sampleTimer = nil
            return
        }
        // NOTE: assumes RoomCaptureSession exposes its underlying ARSession.
        // If this doesn't compile against the current SDK, the frames can
        // also be pulled by setting an ARSessionDelegate on that session.
        guard let frame = captureView.captureSession.arSession.currentFrame else { return }

        // Encode off the main thread — JPEG-ing a full camera frame takes
        // long enough to visibly hitch the AR session otherwise.
        encodeQueue.async { [weak self] in
            guard let self else { return }
            let image = CIImage(cvPixelBuffer: frame.capturedImage)
            guard let cgImage = self.ciContext.createCGImage(image, from: image.extent),
                  let jpeg = UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.5)
            else { return }

            DispatchQueue.main.async {
                self.frameBuffer.append(jpeg)
                self.capturedFrameCount = self.frameBuffer.count
            }
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
