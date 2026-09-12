import Foundation
import Combine
import RoomPlan
import ARKit
import CoreImage
import UIKit
import simd

/// One sampled frame plus everything needed to reproject its pixels back
/// onto the scanned geometry later: where the camera was, which way it was
/// pointing, and how wide its lens was. Without the pose a frame is only
/// good for reading average colours off; with it, the web app can project
/// the actual photo onto the walls and furniture that frame shows.
struct CapturedFrame {
    let jpeg: Data
    /// Camera pose in **ARKit world space**. Must be converted into the
    /// room-aligned frame (`RoomExporter.alignmentMatrix`) before upload —
    /// ARKit's origin is wherever the scan happened to start, which is not
    /// the frame the exported object positions are measured in.
    let transform: simd_float4x4
    /// Vertical field of view, in radians.
    let fovY: Float
    /// Dimensions of `jpeg` itself, so the far end knows which aspect ratio
    /// `fovY` pairs with.
    let pixelWidth: Int
    let pixelHeight: Int
}

/// Owns the single RoomCaptureView instance and its session lifecycle.
/// Kept as one object (not split into a UIViewRepresentable Coordinator) so
/// the SwiftUI "Done" button drawn outside the representable can drive the
/// same session it points at.
final class RoomCaptureModel: NSObject, ObservableObject, RoomCaptureViewDelegate {

    private struct Sample {
        let jpeg: Data
        /// Where the camera was standing. Used to pick a spatially spread
        /// subset later — see `sampledCaptures`.
        let position: SIMD3<Float>
        let transform: simd_float4x4
        let fovY: Float
        let pixelWidth: Int
        let pixelHeight: Int
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
    /// Send every frame we sampled. 6 was far too sparse, 16 still was, and a
    /// cap is simply the wrong knob now that frames are *projected* onto
    /// surfaces rather than averaged into a palette: a surface that no
    /// retained frame happened to face falls back to flat colour, so each
    /// dropped frame is a potential flat patch on a wall.
    ///
    /// Both costs this used to guard against are handled elsewhere now —
    /// colorize samples its own bounded subset before calling Gemini, and the
    /// uploads run through a bounded-concurrency pool instead of firing all at
    /// once. What remains is upload time for at most `bufferLimit` frames of
    /// ~80KB: a few MB, and the scan is already over by then.
    private var framesToUpload: Int { bufferLimit }

    /// Picks frames by *where the camera was*, not by when. Spacing purely
    /// on time means standing still for thirty seconds yields six near
    /// identical photos of one wall; spacing on position gives coverage of
    /// wherever you actually walked. Farthest-point selection: repeatedly
    /// take the frame furthest from everything already chosen.
    var sampledCaptures: [CapturedFrame] {
        let selected: [Sample]
        if samples.count <= framesToUpload {
            selected = samples
        } else {
            selected = farthestPointSubset().map { samples[$0] }
        }
        return selected.map {
            CapturedFrame(
                jpeg: $0.jpeg,
                transform: $0.transform,
                fovY: $0.fovY,
                pixelWidth: $0.pixelWidth,
                pixelHeight: $0.pixelHeight
            )
        }
    }

    private func farthestPointSubset() -> [Int] {

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

        return chosen.sorted()
    }

    override init() {
        captureView = RoomCaptureView(frame: .zero)
        super.init()
        captureView.delegate = self
    }

    // MARK: - NSCoding

    // RoomPlan declares `RoomCaptureViewDelegate: NSCoding, NSObjectProtocol`,
    // so anything acting as its delegate has to satisfy NSCoding too — even
    // though this object is always constructed directly and never archived.
    // These two stubs exist purely to satisfy that inherited requirement.
    // No `required` keyword: the class is `final`, so it isn't needed.
    func encode(with coder: NSCoder) {}

    init?(coder: NSCoder) { nil }

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

        // Vertical FOV from the pinhole intrinsics: fy is the focal length in
        // pixels, so the half-angle is atan((h/2) / fy). Both intrinsics and
        // imageResolution describe the camera's native *landscape* sensor
        // buffer, which is also exactly what `capturedImage` hands back — so
        // as long as the JPEG below is encoded from that buffer without any
        // rotation applied, the pose, the FOV and the pixels all agree.
        // Rotate the image anywhere in this path and the projection silently
        // lands sideways.
        let intrinsics = frame.camera.intrinsics
        let resolution = frame.camera.imageResolution
        let focalY = intrinsics.columns.1.y
        let fovY = focalY > 0
            ? 2 * atanf(Float(resolution.height) / (2 * focalY))
            : 60 * Float.pi / 180

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
                self.samples.append(
                    Sample(
                        jpeg: jpeg,
                        position: position,
                        transform: cameraTransform,
                        fovY: fovY,
                        // The encoded size, not the sensor's — downscaling is
                        // uniform so it doesn't change fovY, but the far end
                        // pairs these numbers with the image it actually
                        // fetches.
                        pixelWidth: cgImage.width,
                        pixelHeight: cgImage.height
                    )
                )
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
