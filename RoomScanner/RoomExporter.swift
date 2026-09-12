import Foundation
import RoomPlan
import simd

enum RoomExporter {

    // MARK: - CapturedRoom -> RoomLayoutJSON

    /// Returns the layout plus a human-readable diagnostic summary. The
    /// summary is shown in the app itself rather than logged, because
    /// scanning means walking around the room — which means unplugging from
    /// the Mac, which kills the debug session and takes `print` output with
    /// it. Temporary; drop it once the coordinate frame is settled.
    static func buildLayout(from room: CapturedRoom) -> (layout: RoomLayoutJSON, diagnostics: String) {
        let frame = alignmentFrame(for: room.walls)

        var objects = room.objects.map { objectJSON(from: $0, in: frame) }
        objects += room.doors.map { surfaceJSON(from: $0, category: "door", in: frame) }
        objects += room.windows.map { surfaceJSON(from: $0, category: "window", in: frame) }
        // Openings stay excluded — the schema has no category for them.
        // Walls are now sent individually *as well as* summarised into the
        // bounding box below: the box alone can't express an angled corner,
        // a bay or a partition wall, so furniture standing against any wall
        // that isn't axis-aligned ends up rendered adrift in open floor.
        let walls = room.walls.map { wallJSON(from: $0, in: frame) }

        var layout = RoomLayoutJSON(
            room: RoomDimensionsJSON(width: frame.width, length: frame.length, height: frame.height),
            objects: objects
        )
        layout.walls = walls

        var lines: [String] = []
        func f(_ v: Float) -> String { String(format: "%.2f", v) }

        lines.append("walls=\(room.walls.count) objects=\(room.objects.count) doors=\(room.doors.count) windows=\(room.windows.count)")
        lines.append("yaw=\(f(frame.yaw)) center=(\(f(frame.centerX)), \(f(frame.centerZ))) floorY=\(f(frame.floorY))")
        lines.append("size=\(f(frame.width)) x \(f(frame.length)) x \(f(frame.height))")

        if let wall = room.walls.first {
            lines.append("wall[0] center_y=\(f(wall.transform.columns.3.y)) height=\(f(wall.dimensions.y))")
        }
        if let sample = room.objects.first {
            let t = sample.transform.columns.3
            let placed = place(sample.transform, in: frame)
            lines.append("obj[0] raw=(\(f(t.x)), \(f(t.y)), \(f(t.z)))")
            lines.append("obj[0] placed=(\(f(placed.position[0])), \(f(placed.position[1])), \(f(placed.position[2])))")
            lines.append("obj[0] h=\(f(sample.dimensions.y)) base_y=\(f(placed.position[1] - sample.dimensions.y / 2))")
        }

        let diagnostics = lines.joined(separator: "\n")
        print("[RoomExporter]\n" + diagnostics)
        return (layout, diagnostics)
    }

    // MARK: - ARKit world space -> room space

    /// The same change of frame `place(_:in:)` applies to object positions,
    /// but as a matrix you can apply to *any* ARKit world-space pose —
    /// specifically the camera poses in `CapturedFrame`, which have to land
    /// in the same frame as the exported objects or the projected photos end
    /// up somewhere else entirely.
    ///
    /// Order matters: rotate about Y by `-yaw` first, *then* translate, since
    /// the centre offsets were themselves measured after that rotation (see
    /// `alignmentFrame`).
    static func alignmentMatrix(for room: CapturedRoom) -> simd_float4x4 {
        let frame = alignmentFrame(for: room.walls)
        let angle = -frame.yaw
        let c = cosf(angle)
        let s = sinf(angle)

        // Column-major, and matching `rotatedAboutY` exactly:
        //   x' =  x*cos + z*sin
        //   z' = -x*sin + z*cos
        let rotation = simd_float4x4(
            simd_float4(c, 0, -s, 0),
            simd_float4(0, 1, 0, 0),
            simd_float4(s, 0, c, 0),
            simd_float4(0, 0, 0, 1)
        )

        var translation = matrix_identity_float4x4
        translation.columns.3 = simd_float4(-frame.centerX, -frame.floorY, -frame.centerZ, 1)

        return translation * rotation
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

    /// Walls go through exactly the same `place()` conversion as objects, so
    /// a wall and the desk pushed against it stay in agreement — which is the
    /// entire point of sending them.
    private static func wallJSON(from wall: CapturedRoom.Surface, in frame: AlignmentFrame) -> WallJSON {
        let (position, rotationY) = place(wall.transform, in: frame)
        return WallJSON(
            position: position,
            rotationY: rotationY,
            dimensions: [wall.dimensions.x, wall.dimensions.y, wall.dimensions.z]
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
        // Everything below used to fall through to "other", which is why a
        // scanned kitchen or bathroom came back as a room full of anonymous
        // grey boxes. RoomPlan detects all of these natively, and the web
        // schema now has a real category for each.
        case .refrigerator: return "refrigerator"
        case .oven: return "oven"
        case .stove: return "stove"
        case .dishwasher: return "dishwasher"
        case .washerDryer: return "washerDryer"
        case .sink: return "sink"
        case .toilet: return "toilet"
        case .bathtub: return "bathtub"
        case .fireplace: return "fireplace"
        case .stairs: return "stairs"
        default: return "other"
        }
    }
}
