import Foundation

// Matches src/lib/roomLayoutSchema.ts in the web app exactly — field names
// and shapes here are a contract, not a style choice. If you change one
// side, change the other.

struct RoomLayoutJSON: Codable {
    let room: RoomDimensionsJSON
    let objects: [ObjectJSON]
    /// Only ever set on the LiDAR path — this is what lets the web app
    /// project real photo pixels onto the room instead of falling back to
    /// flat sampled colours. Left nil (and, being Optional, omitted from the
    /// encoded JSON entirely) when no poses were captured, which is exactly
    /// what the web schema's `.optional()` expects.
    var cameraFrames: [CameraFrameJSON]? = nil
    /// Every wall RoomPlan measured, individually. The `room` box above is
    /// only a bounding box — real rooms have angled corners, bays and
    /// partition walls, and collapsing them to that box strands furniture
    /// standing against a non-axis-aligned wall out in open floor. Nil on
    /// layouts from before this existed; the web app falls back to the box.
    var walls: [WallJSON]? = nil
}

/// One measured wall, in the same room-aligned frame as `objects`.
/// `dimensions` is [width, height, thickness].
struct WallJSON: Codable {
    let position: [Float]
    let rotationY: Float
    let dimensions: [Float]
}

/// One captured photo paired with the camera pose that took it. Mirrors the
/// `cameraFrame` object in src/lib/roomLayoutSchema.ts.
struct CameraFrameJSON: Codable {
    let url: String
    /// The camera's full 4x4 world matrix, **column-major, 16 numbers**, and
    /// already converted into room space via `RoomExporter.alignmentMatrix`.
    /// three.js reads this straight into `Matrix4.fromArray`, which is also
    /// column-major — get the order wrong and every projection lands subtly,
    /// silently misplaced.
    let transform: [Float]
    let fovY: Float
    let width: Int
    let height: Int
}

struct RoomDimensionsJSON: Codable {
    let width: Float
    let length: Float
    let height: Float
}

struct ObjectJSON: Codable {
    let id: String
    let category: String
    let position: [Float]
    let rotationY: Float
    let dimensions: [Float]
    let confidence: Double
}

struct LayoutUploadRequest: Codable {
    let session: String
    let layout: RoomLayoutJSON
}
