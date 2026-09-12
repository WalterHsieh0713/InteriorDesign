import simd

struct RoomJSON: Codable {
    let roomId: String
    let createdAt: String
    let walls: [SurfaceJSON]
    let doors: [SurfaceJSON]
    let windows: [SurfaceJSON]
    let openings: [SurfaceJSON]
    let objects: [ObjectJSON]
}

struct SurfaceJSON: Codable {
    let id: String
    let dimensions: [Float]
    let transform: [Float]
}

struct ObjectJSON: Codable {
    let id: String
    let category: String
    let confidence: String
    let dimensions: [Float]
    let transform: [Float]
}

extension simd_float4x4 {
    /// Flattens column-major (simd's native storage order), which is exactly
    /// what three.js's Matrix4.fromArray() expects. Do not iterate
    /// row-by-row here or every transform will come out transposed.
    var columnMajorArray: [Float] {
        [
            columns.0.x, columns.0.y, columns.0.z, columns.0.w,
            columns.1.x, columns.1.y, columns.1.z, columns.1.w,
            columns.2.x, columns.2.y, columns.2.z, columns.2.w,
            columns.3.x, columns.3.y, columns.3.z, columns.3.w
        ]
    }
}
