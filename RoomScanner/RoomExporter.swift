import Foundation
import RoomPlan
import simd

enum RoomExporter {

    // MARK: - CapturedRoom -> RoomLayoutJSON

    static func buildLayout(from room: CapturedRoom) -> RoomLayoutJSON {
        let dims = roomDimensions(from: room.walls)

        var objects = room.objects.map(objectFromObject)
        objects += room.doors.map { objectFromSurface($0, category: "door") }
        objects += room.windows.map { objectFromSurface($0, category: "window") }
        // room.walls and room.openings intentionally excluded from `objects` —
        // walls only feed the room-dimension calculation above; the new
        // schema has no "wall"/"opening" category to put them in.

        return RoomLayoutJSON(
            room: RoomDimensionsJSON(width: dims.width, length: dims.length, height: dims.height),
            objects: objects
        )
    }

    // MARK: - Room bounding box

    /// CapturedRoom has no single "room size" property — it's implied by
    /// the walls. For each wall, project its two edge-midpoints into world
    /// space and take the min/max span across every wall. Height is the
    /// tallest wall. Unverified against a real scan yet — if a captured
    /// room comes back with an oddly shaped/non-rectangular footprint,
    /// this bounding-box approach will still produce *a* width/length
    /// (the extent of the whole floor plan), just not a tight fit to an
    /// irregular shape. That's an acceptable simplification for now.
    private static func roomDimensions(from walls: [CapturedRoom.Surface]) -> (width: Float, length: Float, height: Float) {
        guard !walls.isEmpty else { return (0, 0, 0) }

        var minX = Float.greatestFiniteMagnitude
        var maxX = -Float.greatestFiniteMagnitude
        var minZ = Float.greatestFiniteMagnitude
        var maxZ = -Float.greatestFiniteMagnitude
        var maxHeight: Float = 0

        for wall in walls {
            let halfWidth = wall.dimensions.x / 2
            let localEdges: [simd_float4] = [
                simd_float4(-halfWidth, 0, 0, 1),
                simd_float4(halfWidth, 0, 0, 1),
            ]
            for edge in localEdges {
                let world = wall.transform * edge
                minX = min(minX, world.x)
                maxX = max(maxX, world.x)
                minZ = min(minZ, world.z)
                maxZ = max(maxZ, world.z)
            }
            maxHeight = max(maxHeight, wall.dimensions.y)
        }

        return (maxX - minX, maxZ - minZ, maxHeight)
    }

    // MARK: - Transform -> position + rotationY

    /// Assumes objects only rotate about the vertical axis (true for
    /// furniture resting on a floor). Derived from the standard right-handed
    /// Y-axis rotation matrix, but UNVERIFIED against real RoomPlan output —
    /// test by rotating a known object between scans and confirming the
    /// sign comes out right before trusting this for anything precise.
    private static func positionAndRotationY(from transform: simd_float4x4) -> (position: [Float], rotationY: Float) {
        let position = [transform.columns.3.x, transform.columns.3.y, transform.columns.3.z]
        let rotationY = atan2f(-transform.columns.0.z, transform.columns.0.x)
        return (position, rotationY)
    }

    // MARK: - Per-item conversion

    private static func objectFromObject(_ object: CapturedRoom.Object) -> ObjectJSON {
        let (position, rotationY) = positionAndRotationY(from: object.transform)
        return ObjectJSON(
            id: object.identifier.uuidString,
            category: mappedCategory(object.category),
            position: position,
            rotationY: rotationY,
            dimensions: [object.dimensions.x, object.dimensions.y, object.dimensions.z],
            confidence: confidenceValue(object.confidence)
        )
    }

    private static func objectFromSurface(_ surface: CapturedRoom.Surface, category: String) -> ObjectJSON {
        let (position, rotationY) = positionAndRotationY(from: surface.transform)
        return ObjectJSON(
            id: surface.identifier.uuidString,
            category: category,
            position: position,
            rotationY: rotationY,
            dimensions: [surface.dimensions.x, surface.dimensions.y, surface.dimensions.z],
            confidence: confidenceValue(surface.confidence)
        )
    }

    private static func confidenceValue(_ confidence: CapturedRoom.Confidence) -> Double {
        switch confidence {
        case .high: return 0.9
        case .medium: return 0.6
        case .low: return 0.3
        @unknown default: return 0.5
        }
    }

    /// Apple's CapturedRoom.Object.Category collapses down to the web app's
    /// fixed enum (bed, desk, chair, sofa, table, shelf, dresser, tv, lamp,
    /// rug, door, window, other) — most of Apple's categories have no clean
    /// equivalent and fall back to "other".
    private static func mappedCategory(_ category: CapturedRoom.Object.Category) -> String {
        switch category {
        case .bed: return "bed"
        case .table: return "table"
        case .sofa: return "sofa"
        case .chair: return "chair"
        case .television: return "tv"
        case .storage: return "shelf"
        default: return "other"
        }
    }
}
