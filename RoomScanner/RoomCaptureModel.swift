import Foundation
import Combine
import RoomPlan
import ARKit
import CoreImage
import UIKit
import simd

/// Owns the single RoomCaptureView instance and its session lifecycle.
/// Kept as one object (not split into a UIViewRepresentable Coordinator) so
/// the SwiftUI "Done" button drawn outside the representable can drive the
/// same session it points at.
final class RoomCaptureModel: NSObject, ObservableObject, RoomCaptureViewDelegate {

    private struct Sample {
        let jpeg: Data
        /// Where the camera was standing. Used to pick a spatially spread
        /// subset later — see `sampledFrames`.
        let position: SIMD3<Float>
    }

    let captureView: RoomCaptureView
    private let sessionConfig = RoomCaptureSession.Configuration()

    @Published var finishedRoom: CapturedRoom?
    @Published var captureError: String?

    /// Shown live during the scan so it's visible that colour capture is
    /// actually happening — colours silently not being collected is the
    /// kind of thing you only discover after the scan is over.
    @Published private(set) var capturedFrameCount = 0

    /// Everything sampled during the scan. RoomPlan's CapturedRoom carries
    /// no imagery at all, so without these the web app has no idea what
    /// anything in the room looks like and falls back to a generic palette.
    private var samples: [Sample] = []

    private var sampleTimer: Timer?
    private let ciContext = CIContext()
    private let encodeQueue = DispatchQueue(label: "room-scanner.frame-encode", qos: .utility)

    private static let maxFrameDimension: CGFloat = 768
    private let sampleInterval: TimeInterval = 1.0
    /// ~4 minutes at one per second. Each frame is a 768px JPEG (~60-80KB),
    /// so a full buffer is roughly 20MB — comfortable on any device that
    /// has a LiDAR sensor in the first place.
    private let bufferLimit = 240
    private let framesToUpload = 6

    /// Picks frames by *where the camera was*, not by when. Spacing purely
    /// on time means standing still for thirty seconds yields six near
    /// identical photos of one wall; spacing on position gives coverage of
    /// wherever you actually walked. Farthest-point selection: repeatedly
    /// take the frame furthest from everything already chosen.
    var sampledFrames: [Data] {
        guard samples.count > framesToUpload else { return samples.map(\.jpeg) }

        var chosen = [0]
        while chosen.count < framesToUpload {
            var bestIndex = -1
            var bestDistance: Float = -1

            for (index, sample) in samples.enumerated() where !chosen.contains(index) {
                let nearest = chosen
                    .map { simd_distance(samples[$0].position, sample.position) }
                    .min() ?? 0
                if nearest > bestDistance {
                    bestDistance = nearest
                    bestIndex = index
                }
            }

            guard bestIndex >= 0 else { break }
            chosen.append(bestIndex)
        }

        return chosen.sorted().map { samples[$0].jpeg }
    }

    override init() {
        captureView = RoomCaptureView(frame: .zero)
        super.init()
        captureView.delegate = self
    }

    func startSession() {
        finishedRoom = nil
        captureError = nil
        samples = []
        capturedFrameCount = 0
        captureView.captureSession.run(configuration: sessionConfig)

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
        guard samples.count < bufferLimit else {
            sampleTimer?.invalidate()
            sampleTimer = nil
            return
        }
        // NOTE: assumes RoomCaptureSession exposes its underlying ARSession.
        // If this doesn't compile against the current SDK, the frames can
        // also be pulled by setting an ARSessionDelegate on that session.
        guard let frame = captureView.captureSession.arSession.currentFrame else { return }

        let cameraTransform = frame.camera.transform
        let position = SIMD3<Float>(
            cameraTransform.columns.3.x,
            cameraTransform.columns.3.y,
            cameraTransform.columns.3.z
        )

        // Encode off the main thread — doing this inline would compete with
        // ARKit for the main thread every second, and degrading tracking to
        // get better colours would be a bad trade: the geometry is the part
        // LiDAR is actually good at.
        encodeQueue.async { [weak self] in
            guard let self else { return }
            let full = CIImage(cvPixelBuffer: frame.capturedImage)

            // Downscale hard before encoding. These are only ever used to
            // read colours off surfaces, where a 768px frame is
            // indistinguishable from a full 1920px one.
            let longestSide = max(full.extent.width, full.extent.height)
            let scale = longestSide > 0 ? min(1, Self.maxFrameDimension / longestSide) : 1
            let image = scale < 1 ? full.transformed(by: CGAffineTransform(scaleX: scale, y: scale)) : full

            guard let cgImage = self.ciContext.createCGImage(image, from: image.extent),
                  let jpeg = UIImage(cgImage: cgImage).jpegData(compressionQuality: 0.6)
            else { return }

            DispatchQueue.main.async {
                self.samples.append(Sample(jpeg: jpeg, position: position))
                self.capturedFrameCount = self.samples.count
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
