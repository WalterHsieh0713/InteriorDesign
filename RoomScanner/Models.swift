import Foundation

// Matches src/lib/roomLayoutSchema.ts in the web app exactly — field names
// and shapes here are a contract, not a style choice. If you change one
// side, change the other.

struct RoomLayoutJSON: Codable {
    let room: RoomDimensionsJSON
    let objects: [ObjectJSON]
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
