import Foundation
import RoomPlan

enum RoomExporter {

    static func export(_ room: CapturedRoom) throws -> URL {
        let json = RoomJSON(
            roomId: UUID().uuidString,
            createdAt: ISO8601DateFormatter().string(from: Date()),
            walls: room.walls.map(surfaceJSON),
            doors: room.doors.map(surfaceJSON),
            windows: room.windows.map(surfaceJSON),
            openings: room.openings.map(surfaceJSON),
            objects: room.objects.map(objectJSON)
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted]
        let data = try encoder.encode(json)

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("room-\(json.roomId).json")
        try data.write(to: url, options: .atomic)
        return url
    }

    private static func surfaceJSON(_ surface: CapturedRoom.Surface) -> SurfaceJSON {
        SurfaceJSON(
            id: surface.identifier.uuidString,
            dimensions: [surface.dimensions.x, surface.dimensions.y, surface.dimensions.z],
            transform: surface.transform.columnMajorArray
        )
    }

    private static func objectJSON(_ object: CapturedRoom.Object) -> ObjectJSON {
        ObjectJSON(
            id: object.identifier.uuidString,
            category: categoryString(object.category),
            confidence: confidenceString(object.confidence),
            dimensions: [object.dimensions.x, object.dimensions.y, object.dimensions.z],
            transform: object.transform.columnMajorArray
        )
    }

    private static func confidenceString(_ confidence: CapturedRoom.Confidence) -> String {
        switch confidence {
        case .high: return "high"
        case .medium: return "medium"
        case .low: return "low"
        @unknown default: return "unknown"
        }
    }

    private static func categoryString(_ category: CapturedRoom.Object.Category) -> String {
        switch category {
        case .storage: return "storage"
        case .refrigerator: return "refrigerator"
        case .stove: return "stove"
        case .bed: return "bed"
        case .sink: return "sink"
        case .washerDryer: return "washerdryer"
        case .toilet: return "toilet"
        case .bathtub: return "bathtub"
        case .oven: return "oven"
        case .dishwasher: return "dishwasher"
        case .table: return "table"
        case .sofa: return "sofa"
        case .chair: return "chair"
        case .fireplace: return "fireplace"
        case .television: return "television"
        case .stairs: return "stairs"
        @unknown default: return "unknown"
        }
    }
}
