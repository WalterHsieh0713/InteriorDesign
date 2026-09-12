import * as THREE from "three";
import type { CameraFrame, RoomLayout } from "./roomLayoutSchema";

// Turning a 2D detection in one photo into a 3D object in the room.
//
// The premise: every captured frame carries the camera pose that took it (see
// cameraFrames in roomLayoutSchema.ts), and the room's geometry is already
// measured. So a box drawn around a thermostat in a photo defines a ray from
// that camera through the room, and wherever that ray first hits a real
// surface is where the thermostat is. No depth estimation, no guessing —
// the depth comes from geometry we already trust.
//
// Accepted limitations, documented rather than silently wrong:
// - A detection whose ray hits nothing inside the room is dropped, not
//   clamped to some arbitrary distance.
// - Size comes from the box's angular extent at the hit distance, which is
//   correct for something flat against the surface it's mounted on and
//   over-estimates for anything standing well proud of it.
// - Objects are treated as boxes for the ray test, which is all the layout
//   ever knew about them anyway.

/** A detection as the model reports it: normalized 0..1 image coordinates,
 * origin top-left. */
export type Detection2D = {
  category: string;
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  confidence: number;
};

export type PlacedObject = {
  category: string;
  position: [number, number, number];
  rotationY: number;
  dimensions: [number, number, number];
  confidence: number;
};

type SurfaceHit = {
  distance: number;
  point: THREE.Vector3;
  /** Outward normal of whatever was hit, pointing back toward the camera. */
  normal: THREE.Vector3;
  /** Yaw of the object that was hit, when it was an object rather than a wall
   * or the floor. A keyboard should line up with the desk it's lying on. */
  hostRotationY?: number;
};

/** Things that stand on top of something — a desk, a shelf, the floor — as
 * opposed to being fixed to a wall. These are placed from the bottom edge of
 * their box rather than its centre, because the bottom edge is the one part
 * of them that touches a surface the room's geometry actually knows about. */
const RESTS_ON_SURFACE = new Set(["monitor", "keyboard", "speaker", "books", "plant"]);

/** Of those, the ones that lie down flat. Their box's vertical extent in the
 * image is depth across the desk, not height off it. */
const LIES_FLAT = new Set(["keyboard", "books"]);

function rayFromPixel(
  frame: CameraFrame,
  u: number,
  v: number
): { origin: THREE.Vector3; direction: THREE.Vector3; matrix: THREE.Matrix4 } {
  const matrix = new THREE.Matrix4().fromArray(frame.transform);
  const origin = new THREE.Vector3().setFromMatrixPosition(matrix);

  // Same convention as projectiveTexture.ts's perspective build: camera looks
  // down -Z, +X right, +Y up, with v measured downward from the top of the
  // image. Diverge from that here and every placement lands mirrored.
  const tanHalfY = Math.tan(frame.fovY / 2);
  const aspect = frame.width / frame.height;
  const direction = new THREE.Vector3(
    (2 * u - 1) * tanHalfY * aspect,
    (1 - 2 * v) * tanHalfY,
    -1
  );

  // Rotation only — a direction must not pick up the camera's translation.
  const rotation = new THREE.Matrix4().extractRotation(matrix);
  direction.applyMatrix4(rotation).normalize();

  return { origin, direction, matrix };
}

/** Nearest intersection with a finite, axis-aligned-in-its-own-frame wall. */
function hitWall(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  wall: NonNullable<RoomLayout["walls"]>[number]
): SurfaceHit | null {
  const [width, height] = wall.dimensions;
  const center = new THREE.Vector3(...wall.position);

  const cos = Math.cos(wall.rotationY);
  const sin = Math.sin(wall.rotationY);
  // rotateY((0,0,1)) and rotateY((1,0,0)) respectively, matching the
  // convention in projectiveTexture.ts.
  const normal = new THREE.Vector3(sin, 0, cos);
  const along = new THREE.Vector3(cos, 0, -sin);

  const denominator = normal.dot(direction);
  if (Math.abs(denominator) < 1e-6) return null;

  const distance = normal.dot(center.clone().sub(origin)) / denominator;
  if (distance <= 0.05) return null;

  const point = origin.clone().addScaledVector(direction, distance);
  const offset = point.clone().sub(center);
  if (Math.abs(offset.dot(along)) > width / 2) return null;
  if (Math.abs(offset.y) > height / 2) return null;

  // Face the camera, so a thermostat mounted on this wall ends up pointing
  // into the room rather than into the plaster.
  if (denominator > 0) normal.negate();
  return { distance, point, normal };
}

/** Nearest intersection with an object's oriented bounding box. */
function hitBox(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  object: RoomLayout["objects"][number]
): SurfaceHit | null {
  const center = new THREE.Vector3(...object.position);
  const rotation = new THREE.Matrix4().makeRotationY(-object.rotationY);

  const localOrigin = origin.clone().sub(center).applyMatrix4(rotation);
  const localDirection = direction.clone().applyMatrix4(rotation);

  const half = object.dimensions.map((d) => Math.max(d, 0.01) / 2) as [number, number, number];

  let near = -Infinity;
  let far = Infinity;
  let axis = 0;

  for (let i = 0; i < 3; i++) {
    const o = localOrigin.getComponent(i);
    const d = localDirection.getComponent(i);
    if (Math.abs(d) < 1e-6) {
      if (Math.abs(o) > half[i]) return null;
      continue;
    }
    let t1 = (-half[i] - o) / d;
    let t2 = (half[i] - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > near) {
      near = t1;
      axis = i;
    }
    far = Math.min(far, t2);
    if (near > far) return null;
  }

  if (near <= 0.05 || near === -Infinity) return null;

  const localNormal = new THREE.Vector3();
  localNormal.setComponent(axis, localDirection.getComponent(axis) > 0 ? -1 : 1);
  const normal = localNormal.applyMatrix4(new THREE.Matrix4().makeRotationY(object.rotationY));

  return {
    distance: near,
    point: origin.clone().addScaledVector(direction, near),
    normal,
    hostRotationY: object.rotationY,
  };
}

/** Floor at y=0 and ceiling at y=height, so a smoke alarm has something to
 * land on. */
function hitHorizontal(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  y: number,
  facingUp: boolean
): SurfaceHit | null {
  if (Math.abs(direction.y) < 1e-6) return null;
  const distance = (y - origin.y) / direction.y;
  if (distance <= 0.05) return null;
  return {
    distance,
    point: origin.clone().addScaledVector(direction, distance),
    normal: new THREE.Vector3(0, facingUp ? 1 : -1, 0),
  };
}

/**
 * Projects one 2D detection onto the nearest real surface along its ray.
 *
 * "Nearest" is what makes this work without any depth cue: a monitor on a
 * desk hits the desk's box before the wall behind it, and a thermostat with
 * nothing in front of it hits the wall directly.
 */
export function placeDetection(
  detection: Detection2D,
  frame: CameraFrame,
  layout: RoomLayout
): PlacedObject | null {
  const resting = RESTS_ON_SURFACE.has(detection.category);

  const u = (detection.xmin + detection.xmax) / 2;
  // For anything standing on a surface, aim at the BOTTOM edge of the box
  // rather than its centre. A monitor isn't part of the scanned geometry, so
  // a ray through its middle passes straight through it and lands on the wall
  // behind — which is why monitors ended up pinned to the wall, hovering over
  // the desk they're really sitting on. The bottom edge is the one part of
  // the object touching something the room does know about, so that ray stops
  // on the desktop, at the object's base.
  const v = resting ? detection.ymax : (detection.ymin + detection.ymax) / 2;
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;

  const { origin, direction, matrix } = rayFromPixel(frame, u, v);

  const candidates: (SurfaceHit | null)[] = [
    ...(layout.walls ?? []).map((w) => hitWall(origin, direction, w)),
    // Only sizeable furniture is worth occluding against; testing against
    // other small detections would just stack them on each other.
    ...layout.objects
      .filter((o) => Math.max(...o.dimensions) > 0.35)
      .map((o) => hitBox(origin, direction, o)),
    hitHorizontal(origin, direction, 0, true),
    hitHorizontal(origin, direction, layout.room.height, false),
  ];

  let best: SurfaceHit | null = null;
  for (const hit of candidates) {
    if (!hit) continue;
    if (!best || hit.distance < best.distance) best = hit;
  }
  if (!best) return null;

  // Depth along the camera's view axis, not the ray length — the angular-size
  // formula below is in terms of the former.
  const view = new THREE.Matrix4().copy(matrix).invert();
  const depth = -best.point.clone().applyMatrix4(view).z;
  if (!(depth > 0.05) || depth > 12) return null;

  const tanHalfY = Math.tan(frame.fovY / 2);
  const aspect = frame.width / frame.height;
  // Angular extent of the box, converted to metres at the hit distance.
  const spanV = 2 * depth * tanHalfY * Math.abs(detection.ymax - detection.ymin);
  const spanH = 2 * depth * tanHalfY * aspect * Math.abs(detection.xmax - detection.xmin);
  if (!(spanH > 0.01) || !(spanV > 0.01)) return null;

  if (resting) {
    const lying = LIES_FLAT.has(detection.category);
    // A keyboard's vertical extent in the photo is how far it reaches ACROSS
    // the desk, not how tall it is. Reading it as height is what stood every
    // keyboard on its end like a gravestone.
    const dimensions: [number, number, number] = lying
      ? [spanH, Math.max(0.02, Math.min(spanH, spanV) * 0.08), spanV]
      : [spanH, spanV, Math.max(0.03, Math.min(spanH, spanV) * 0.3)];

    // Built up from the base that the bottom-edge ray just found, so the
    // object sits ON the surface instead of floating over it.
    const position = best.point.clone();
    position.y += dimensions[1] / 2;

    return {
      category: detection.category,
      position: [position.x, position.y, position.z],
      // Line up with whatever it's standing on — a keyboard is square to its
      // desk. With no host (it's on the floor), face the camera instead,
      // since a horizontal surface normal gives no usable yaw.
      rotationY:
        best.hostRotationY ??
        Math.atan2(origin.x - position.x, origin.z - position.z),
      dimensions,
      confidence: detection.confidence,
    };
  }

  // Wall-mounted: flat against the surface it was found on, facing outward.
  const thickness = Math.max(0.03, Math.min(spanH, spanV) * 0.25);
  const position = best.point.clone().addScaledVector(best.normal, thickness / 2);

  return {
    category: detection.category,
    position: [position.x, position.y, position.z],
    // Face the way the surface faces. atan2(x, z) is the inverse of the
    // rotateY convention used everywhere else here.
    rotationY: Math.atan2(best.normal.x, best.normal.z),
    dimensions: [spanH, spanV, thickness],
    confidence: detection.confidence,
  };
}

/**
 * Collapses the same physical object seen from many frames into one entry,
 * and drops anything that only ever appeared once at low confidence.
 *
 * Without this, a smoke alarm visible in thirty frames becomes thirty smoke
 * alarms in a neat little arc.
 */
export function mergeDetections(placed: PlacedObject[], minSupport = 2): PlacedObject[] {
  type Cluster = { object: PlacedObject; sum: THREE.Vector3; support: number };
  const clusters: Cluster[] = [];

  for (const item of placed) {
    const point = new THREE.Vector3(...item.position);
    // Tolerance scales with the object: two outlets 30cm apart are genuinely
    // two outlets, but one large artwork seen from opposite corners can
    // easily land half a metre apart between frames.
    const tolerance = Math.max(0.3, Math.max(item.dimensions[0], item.dimensions[1]) * 0.6);

    const match = clusters.find(
      (c) =>
        c.object.category === item.category &&
        new THREE.Vector3(...c.object.position).distanceTo(point) <= tolerance
    );

    if (match) {
      match.support += 1;
      match.sum.add(point);
      const averaged = match.sum.clone().divideScalar(match.support);
      match.object.position = [averaged.x, averaged.y, averaged.z];
      // Keep the most confident frame's view of size and facing — that's
      // usually the one that saw it straight on.
      if (item.confidence > match.object.confidence) {
        match.object.confidence = item.confidence;
        match.object.dimensions = item.dimensions;
        match.object.rotationY = item.rotationY;
      }
    } else {
      clusters.push({ object: { ...item }, sum: point.clone(), support: 1 });
    }
  }

  return clusters
    .filter((c) => c.support >= minSupport || c.object.confidence >= 0.7)
    .map((c) => c.object);
}

/** Drops anything that's really just an object the scan already knows about. */
export function rejectDuplicates(
  candidates: PlacedObject[],
  existing: RoomLayout["objects"]
): PlacedObject[] {
  return candidates.filter((candidate) => {
    const point = new THREE.Vector3(...candidate.position);
    return !existing.some((object) => {
      if (object.category !== candidate.category) return false;
      return new THREE.Vector3(...object.position).distanceTo(point) < 0.5;
    });
  });
}
