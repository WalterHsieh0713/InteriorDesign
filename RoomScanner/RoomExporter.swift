import Foundation
import RoomPlan
import simd

enum RoomExporter {

    // MARK: - CapturedRoom -> RoomLayoutJSON

    static func buildLayout(from room: CapturedRoom) -> RoomLayoutJSON {
        let frame = alignmentFrame(for: room.walls)

        // Temporary diagnostics — uploaded layouts were still landing
        // off-center and below the floor after the alignment fix, and the
        // stored JSON alone can't distinguish "frame computed wrong" from
        // "frame never applied". Remove once that's settled.
        print("""
        [RoomExporter] walls=\(room.walls.count) objects=\(room.objects.count)
          yaw=\(frame.yaw) center=(\(frame.centerX), \(frame.centerZ)) floorY=\(frame.floorY)
          size=\(frame.width) x \(frame.length) x \(frame.height)
        """)
        if let sample = room.objects.first {
            let t = sample.transform.columns.3
            let placed = place(sample.transform, in: frame)
            print("""
            [RoomExporter] sample \(sample.category)
              raw=(\(t.x), \(t.y), \(t.z)) dims=\(sample.dimensions)
              placed=\(placed.position) base_y=\(placed.position[1] - sample.dimensions.y / 2)
            """)
        }
        if let wall = room.walls.first {
            let t = wall.transform.columns.3
            print("[RoomExporter] sample wall center_y=\(t.y) height=\(wall.dimensions.y)")
        }

        var objects = room.objects.map { objectJSON(from: $0, in: frame) }
        objects += room.doors.map { surfaceJSON(from: $0, category: "door", in: frame) }
        objects += room.windows.map { surfaceJSON(from: $0, category: "window", in: frame) }
        // walls and openings intentionally excluded — walls define the room
        // box itself, and the schema has no category for either.

        return RoomLayoutJSON(
            room: RoomDimensionsJSON(width: frame.width, length: frame.length, height: frame.height),
            objects: objects
        )
    }

    // MARK: - Alignment

    /// RoomPlan reports everything in ARKit world space, whose origin is
    /// wherever the scan happened to start, at whatever rotation the device
    /// was facing — the room itself sits at an arbitrary offset and angle
    /// from it. The web schema promises "origin at room center, floor at
    /// y = 0, axis-aligned", so every position and rotation has to be moved
    /// into that frame before upload. Without this, objects render outside
    /// the wall box and the walls line up with nothing.
    private struct AlignmentFrame {
        let yaw: Float
        let centerX: Float
        let centerZ: Float
        let floorY: Float
        let width: Float
        let length: Float
        let height: Float
    }

    private static func alignmentFrame(for walls: [CapturedRoom.Surface]) -> AlignmentFrame {
        guard let dominant = walls.max(by: { $0.dimensions.x < $1.dimensions.x }) else {
            return AlignmentFrame(yaw: 0, centerX: 0, centerZ: 0, floorY: 0, width: 0, length: 0, height: 0)
        }

        // Align to the longest wall — in any roughly rectangular room that's
        // one of the major axes.
        let yaw = yawOf(dominant.transform)

        var minX = Float.greatestFiniteMagnitude
        var maxX = -Float.greatestFiniteMagnitude
        var minZ = Float.greatestFiniteMagnitude
        var maxZ = -Float.greatestFiniteMagnitude
        var floorY = Float.greatestFiniteMagnitude
        var maxHeight: Float = 0

        for wall in walls {
            let halfWidth = wall.dimensions.x / 2
            for localX in [-halfWidth, halfWidth] {
                let world = wall.transform * simd_float4(localX, 0, 0, 1)
                let (x, z) = rotatedAboutY(x: world.x, z: world.z, by: -yaw)
                minX = min(minX, x)
                maxX = max(maxX, x)
                minZ = min(minZ, z)
                maxZ = max(maxZ, z)
            }
            floorY = min(floorY, wall.transform.columns.3.y - wall.dimensions.y / 2)
            maxHeight = max(maxHeight, wall.dimensions.y)
        }

        return AlignmentFrame(
            yaw: yaw,
            centerX: (minX + maxX) / 2,
            centerZ: (minZ + maxZ) / 2,
            floorY: floorY,
            width: maxX - minX,
            length: maxZ - minZ,
            height: maxHeight
        )
    }

    /// Standard right-handed Y-axis rotation applied to a point on the floor
    /// plane. Verify the sign against a real scan before trusting it for
    /// anything precise.
    private static func rotatedAboutY(x: Float, z: Float, by angle: Float) -> (Float, Float) {
        let c = cosf(angle)
        let s = sinf(angle)
        return (x * c + z * s, -x * s + z * c)
    }

    /// Assumes rotation about the vertical axis only, which holds for
    /// furniture resting on a floor and for walls.
    private static func yawOf(_ transform: simd_float4x4) -> Float {
        atan2f(-transform.columns.0.z, transform.columns.0.x)
    }

    /// Moves a RoomPlan transform into the room-centered, axis-aligned,
    /// floor-at-zero frame the web app expects.
    private static func place(_ transform: simd_float4x4, in frame: AlignmentFrame) -> (position: [Float], rotationY: Float) {
        let translation = transform.columns.3
        let (x, z) = rotatedAboutY(x: translation.x, z: translation.z, by: -frame.yaw)
        return (
            [x - frame.centerX, translation.y - frame.floorY, z - frame.centerZ],
            yawOf(transform) - frame.yaw
        )
    }

    // MARK: - Per-item conversion

    private static func objectJSON(from object: CapturedRoom.Object, in frame: AlignmentFrame) -> ObjectJSON {
        let (position, rotationY) = place(object.transform, in: frame)
        return ObjectJSON(
            id: object.identifier.uuidString,
            category: mappedCategory(object.category),
            position: position,
            rotationY: rotationY,
            dimensions: [object.dimensions.x, object.dimensions.y, object.dimensions.z],
            confidence: confidenceValue(object.confidence)
        )
    }

    private static func surfaceJSON(from surface: CapturedRoom.Surface, category: String, in frame: AlignmentFrame) -> ObjectJSON {
        let (position, rotationY) = place(surface.transform, in: frame)
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
    /// fixed enum — most of Apple's categories have no clean equivalent and
    /// fall back to "other".
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
