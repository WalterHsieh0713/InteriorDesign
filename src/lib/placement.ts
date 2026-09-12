import type { RoomLayout, Wall } from "./roomLayoutSchema";
import { CATALOG_BY_ID } from "./catalog";

export type Mount = "floor" | "wall" | "tabletop" | "ceiling";

/**
 * How a room object installs.
 *
 * Only catalog products know this about themselves; a scanned object is
 * whatever the scan found and is treated as standing on the floor, which is
 * true of essentially everything a room scan can detect.
 */
export function mountOf(obj: RoomLayout["objects"][number]): Mount {
  // A poster is defined by its preset rather than by a catalog product, and it
  // only ever hangs on a wall.
  if (obj.preset?.startsWith("poster:")) return "wall";
  if (obj.binding.source !== "catalog") return "floor";
  return CATALOG_BY_ID.get(obj.binding.catalogItemId)?.mount ?? "floor";
}

type Obj = RoomLayout["objects"][number];

const topOf = (o: Obj) => o.position[1] + o.dimensions[1] / 2;

/**
 * How much room an object takes along the world X and Z axes, given its facing.
 *
 * Its `dimensions` are in its own local frame, so a bookcase turned to face a
 * side wall occupies its DEPTH along X, not its width. Ignoring that is what
 * stops a rotated shelf from reaching the wall it is turned towards: it gets
 * held off by half its width when only half its depth is in the way.
 */
export function extentsOf(dimensions: [number, number, number], rotationY: number) {
  const c = Math.abs(Math.cos(rotationY));
  const s = Math.abs(Math.sin(rotationY));
  return {
    x: dimensions[0] * c + dimensions[2] * s,
    z: dimensions[0] * s + dimensions[2] * c,
  };
}

const extentsFor = (o: Obj) => extentsOf(o.dimensions, o.rotationY);

// --- Real measured walls --------------------------------------------------
//
// Everything below here is the one thing neither the scanning-quality work
// nor the catalog editor built on its own: placement that actually knows the
// room isn't a rectangle when `room.walls` says so. Every function takes an
// optional `walls` argument and falls back to the existing box math when it's
// absent (no measured walls, or the Gemini photo path, which only ever
// estimates a bounding box) — this is additive, not a replacement.

export type Point2 = [number, number];

/// Walks the wall segments into a single closed outline. Greedy
/// nearest-endpoint chaining rather than anything cleverer: scanned walls are
/// a loop in practice but rarely a *tidy* one — they overshoot at corners, and
/// RoomPlan gives no ordering or adjacency. Walking to whichever unused
/// endpoint is nearest reconstructs a sane perimeter for rectangles and
/// L-shapes alike, and degrades to "slightly wrong polygon" rather than
/// throwing when a scan is messy.
///
/// The rotation convention matches rotateY in projectiveTexture.ts exactly
/// (x' = x·cosθ + z·sinθ, z' = -x·sinθ + z·cosθ) — this has to agree with how
/// the walls are actually rendered, or the outline used for placement would
/// describe a different room than the one on screen.
export function wallOutlinePolygon(walls: readonly Wall[]): Point2[] | null {
  if (walls.length < 3) return null;

  const segments = walls.map((w) => {
    const half = w.dimensions[0] / 2;
    const c = Math.cos(w.rotationY);
    const s = Math.sin(w.rotationY);
    const dirX = c;
    const dirZ = -s;
    const cx = w.position[0];
    const cz = w.position[2];
    return {
      a: [cx - dirX * half, cz - dirZ * half] as Point2,
      b: [cx + dirX * half, cz + dirZ * half] as Point2,
    };
  });

  const used = new Array(segments.length).fill(false);
  used[0] = true;
  const points: Point2[] = [segments[0].a, segments[0].b];

  for (let step = 1; step < segments.length; step++) {
    const tail = points[points.length - 1];
    let bestIndex = -1;
    let bestDistance = Infinity;
    let bestFar: Point2 | null = null;

    for (let i = 0; i < segments.length; i++) {
      if (used[i]) continue;
      const { a, b } = segments[i];
      const da = Math.hypot(tail[0] - a[0], tail[1] - a[1]);
      const db = Math.hypot(tail[0] - b[0], tail[1] - b[1]);
      const near = Math.min(da, db);
      if (near < bestDistance) {
        bestDistance = near;
        bestIndex = i;
        bestFar = da <= db ? b : a;
      }
    }

    if (bestIndex < 0 || !bestFar) break;
    used[bestIndex] = true;
    points.push(bestFar);
  }

  return points.length >= 3 ? points : null;
}

/** Standard ray-cast point-in-polygon test. */
export function pointInPolygon(x: number, z: number, polygon: Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    const crosses = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Twice the polygon's signed area (shoelace formula) — its sign says which
 *  way the vertices wind, which is what tells inwardEdges which perpendicular
 *  of each edge actually points into the room. */
function signedArea2(polygon: Point2[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, z1] = polygon[i];
    const [x2, z2] = polygon[(i + 1) % polygon.length];
    sum += x1 * z2 - x2 * z1;
  }
  return sum;
}

type InwardEdge = { ax: number; az: number; nx: number; nz: number };

/** Each edge's start point and its inward-facing unit normal, computed once
 *  so callers that walk every edge (clamping, containment checks) don't each
 *  re-derive the winding direction.
 *
 * The inward side is derived from the polygon's overall winding (its signed
 * area), not from "whichever perpendicular points toward the centroid" —
 * the average of a concave polygon's vertices isn't reliably inside it, and
 * even where it is, it's the wrong reference for an edge near a concave
 * notch. Winding is a global property of the whole outline, so it gives the
 * right answer for every edge at once, convex or not — confirmed against a
 * real 17-point scanned outline where the centroid version silently left
 * points still outside the eroded polygon after clamping.
 */
function inwardEdges(polygon: Point2[]): InwardEdge[] {
  const ccw = signedArea2(polygon) > 0;
  return polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const edgeDx = b[0] - a[0];
    const edgeDz = b[1] - a[1];
    const len = Math.hypot(edgeDx, edgeDz) || 1;
    // For a CCW polygon in this (x, z) frame, rotating the edge direction
    // -90° (dz, -dx) points outward and +90° (-dz, dx) points inward; a CW
    // polygon has it the other way around.
    const nx = (ccw ? -edgeDz : edgeDz) / len;
    const nz = (ccw ? edgeDx : -edgeDx) / len;
    return { ax: a[0], az: a[1], nx, nz };
  });
}

/** True when a point is at least `margin` inside every edge of the polygon —
 *  i.e. already clear, with no need to push it. */
export function isClearOfPolygonEdges(x: number, z: number, margin: number, polygon: Point2[]): boolean {
  return inwardEdges(polygon).every((e) => (x - e.ax) * e.nx + (z - e.az) * e.nz >= margin);
}

/**
 * Push a point back inside a polygon, at least `margin` from every edge.
 *
 * A few iterations of half-plane projection: for each edge whose inward
 * half-plane the point violates, push it back across that edge by exactly
 * the violation. Exact for a convex room (true erosion), an honest
 * approximation for a concave one (an L-shaped dorm can, at the inside
 * corner, be slightly more conservative than the true eroded shape) — that
 * degrades to "furniture stops a little early near a reflex corner," not to
 * anything worse.
 */
export function clampPointToPolygon(x: number, z: number, margin: number, polygon: Point2[]): Point2 {
  const edges = inwardEdges(polygon);
  let cx = x;
  let cz = z;

  // A real scanned room can be a complex, many-cornered concave shape (an
  // L-shape with a couple of jogs is common), where pushing clear of one
  // edge can re-violate another — 4 iterations converged for a simple box
  // but visibly failed to fully resolve a 17-point outline in testing
  // against a real scan. Each iteration is a cheap O(edges) loop, so paying
  // for enough of them to actually converge costs nothing noticeable even
  // called every pointer-move frame during a drag.
  for (let iter = 0; iter < 16; iter++) {
    let violated = false;
    for (const e of edges) {
      const dist = (cx - e.ax) * e.nx + (cz - e.az) * e.nz;
      if (dist < margin) {
        cx += (margin - dist) * e.nx;
        cz += (margin - dist) * e.nz;
        violated = true;
      }
    }
    if (!violated) break;
  }
  return [cx, cz];
}

type MeasuredWallHit = {
  wall: Wall;
  /** Signed distance from the wall's own line, positive = into the room. */
  perp: number;
  /** The room-facing normal, i.e. the direction snapping moves the object along. */
  normalX: number;
  normalZ: number;
};

/**
 * Which real wall a point is nearest to, and how far from its surface.
 *
 * Picked by perpendicular distance alone, with no check against the wall
 * segment's actual length — walls tile the room's perimeter contiguously (see
 * wallOutlinePolygon), so "nearest by distance" and "nearest by adjacency"
 * agree almost everywhere, and dragging past a corner naturally hands off to
 * the next wall the same way the four-wall box version already did.
 */
function nearestMeasuredWall(x: number, z: number, walls: readonly Wall[]): MeasuredWallHit | null {
  let best: MeasuredWallHit | null = null;
  for (const w of walls) {
    const c = Math.cos(w.rotationY);
    const s = Math.sin(w.rotationY);
    // One of the two perpendiculars to the wall's own length direction —
    // oriented into the room the same way MeasuredWalls (RoomScene.tsx)
    // orients the rendered mesh, so placement and rendering never disagree
    // about which side is "in".
    let normalX = s;
    let normalZ = c;
    const towardOriginX = -w.position[0];
    const towardOriginZ = -w.position[2];
    if (normalX * towardOriginX + normalZ * towardOriginZ < 0) {
      normalX = -normalX;
      normalZ = -normalZ;
    }
    const relX = x - w.position[0];
    const relZ = z - w.position[2];
    const perp = relX * normalX + relZ * normalZ;
    const dist = Math.abs(perp);
    if (!best || dist < Math.abs(best.perp)) {
      best = { wall: w, perp, normalX, normalZ };
    }
  }
  return best;
}

/**
 * Snap flush against whichever real wall is nearest, at the clearance an
 * object of this depth needs, facing into the room.
 *
 * The facing math (`atan2(normalX, normalZ)`) matches the box version
 * exactly: a rotationY of 0 always means "local +Z, the front of a scanned
 * object, points along +Z" — check it against snapToWall's four fixed cases
 * before changing either one.
 */
function snapToMeasuredWall(
  item: Obj,
  x: number,
  z: number,
  walls: readonly Wall[]
): { position: [number, number]; rotationY: number; distance: number; normal: [number, number] } | null {
  const hit = nearestMeasuredWall(x, z, walls);
  if (!hit) return null;

  const rotationY = Math.atan2(hit.normalX, hit.normalZ);
  const clearance = Math.max(item.dimensions[2] / 2, 0.02);
  // Project onto the wall's own line, then stand off from it by clearance.
  const surfaceX = x - hit.normalX * hit.perp;
  const surfaceZ = z - hit.normalZ * hit.perp;
  return {
    position: [surfaceX + hit.normalX * clearance, surfaceZ + hit.normalZ * clearance],
    rotationY,
    distance: hit.perp,
    normal: [hit.normalX, hit.normalZ],
  };
}

/** Do two objects' floor footprints overlap, treating (x,z) as the first one's centre? */
function footprintsOverlap(a: Obj, x: number, z: number, b: Obj): boolean {
  const ea = extentsFor(a);
  const eb = extentsFor(b);
  const gapX = Math.abs(b.position[0] - x) - (ea.x + eb.x) / 2;
  const gapZ = Math.abs(b.position[2] - z) - (ea.z + eb.z) / 2;
  return gapX < 0 && gapZ < 0;
}

/**
 * The height of whatever surface a tabletop item would come to rest on at
 * (x, z) — the top of the tallest thing under it, or the floor.
 *
 * This is what makes a desk lamp rise when you slide it onto a nightstand and
 * drop when you slide it onto a lower desk, without anyone typing a height.
 *
 * Rugs and other near-flat things are ignored as supports: nothing sits "on"
 * a rug, it sits on the floor the rug covers, and treating a 1cm rug as a
 * surface makes every object it touches hover.
 */
export function supportHeightAt(item: Obj, x: number, z: number, all: Obj[]): number {
  let top = 0;
  for (const other of all) {
    if (other.id === item.id) continue;
    if (other.dimensions[1] < 0.05) continue;
    if (mountOf(other) === "wall") continue;
    if (!footprintsOverlap(item, x, z, other)) continue;
    top = Math.max(top, topOf(other));
  }
  return top;
}

export type WallSide = "north" | "south" | "east" | "west";

export type WallSnap = {
  side: WallSide;
  /** Centre position the object should take, keeping the height it was given. */
  position: [number, number, number];
  /** Facing, so the front of a poster looks into the room rather than through the wall. */
  rotationY: number;
  /** The room-facing normal actually used — the box's four sides only ever
   *  take one of four values, but a real measured wall can be at any angle,
   *  so callers that need the true direction (e.g. setting up a drag plane)
   *  should read this rather than switching on `side`. */
  normal: [number, number];
};

/**
 * Snap a wall-mounted object to whichever wall it is nearest, keeping its
 * height. Posters and mirrors move freely up and down but never leave the wall,
 * which is the one degree of freedom that actually matters for them.
 *
 * Uses the room's real measured walls when it has them — at any angle, not
 * just the four cardinal sides — and falls back to the bounding-box's four
 * walls otherwise.
 */
export function snapToWall(
  item: Obj,
  x: number,
  y: number,
  z: number,
  room: RoomLayout["room"],
  walls?: readonly Wall[]
): WallSnap {
  const halfH = item.dimensions[1] / 2;
  const clampY = Math.min(Math.max(y, halfH), room.height - halfH);

  if (walls && walls.length >= 3) {
    const snapped = snapToMeasuredWall(item, x, z, walls);
    if (snapped) {
      const side = nominalSide(snapped.normal[0], snapped.normal[1]);
      return {
        side,
        position: [snapped.position[0], clampY, snapped.position[1]],
        rotationY: snapped.rotationY,
        normal: snapped.normal,
      };
    }
  }

  const halfW = room.width / 2;
  const halfL = room.length / 2;
  // Depth is the axis pointing out of the wall once installed.
  const clearance = Math.max(item.dimensions[2] / 2, 0.02);

  const distances: Record<WallSide, number> = {
    north: Math.abs(z + halfL),
    south: Math.abs(halfL - z),
    west: Math.abs(x + halfW),
    east: Math.abs(halfW - x),
  };
  const side = (Object.keys(distances) as WallSide[]).reduce((a, b) =>
    distances[a] <= distances[b] ? a : b
  );

  const spanX = Math.max(0, halfW - item.dimensions[0] / 2);
  const spanZ = Math.max(0, halfL - item.dimensions[0] / 2);

  switch (side) {
    case "north":
      return { side, position: [clamp(x, spanX), clampY, -halfL + clearance], rotationY: 0, normal: [0, 1] };
    case "south":
      return { side, position: [clamp(x, spanX), clampY, halfL - clearance], rotationY: Math.PI, normal: [0, -1] };
    case "west":
      return {
        side,
        position: [-halfW + clearance, clampY, clamp(z, spanZ)],
        rotationY: Math.PI / 2,
        normal: [1, 0],
      };
    case "east":
      return {
        side,
        position: [halfW - clearance, clampY, clamp(z, spanZ)],
        rotationY: -Math.PI / 2,
        normal: [-1, 0],
      };
  }
}

/** The closest of the four cardinal labels to an arbitrary normal — a real
 *  wall doesn't have one of "the" four sides, but callers that just want a
 *  label for a tooltip or a key still need something to show. */
function nominalSide(normalX: number, normalZ: number): WallSide {
  return Math.abs(normalX) >= Math.abs(normalZ)
    ? normalX >= 0
      ? "west"
      : "east"
    : normalZ >= 0
      ? "north"
      : "south";
}

const clamp = (v: number, span: number) => Math.min(span, Math.max(-span, v));

/**
 * Where a newly added object should land.
 *
 * Stacking every addition at the room's exact centre buries each one inside the
 * last, so floor pieces spiral outward until they find clear floor.
 */
export function initialPlacement(
  item: Obj,
  room: RoomLayout["room"],
  existing: Obj[],
  walls?: readonly Wall[]
): [number, number, number] {
  const mount = mountOf(item);
  const halfH = item.dimensions[1] / 2;
  const polygon = walls && walls.length >= 3 ? wallOutlinePolygon(walls) : null;

  if (mount === "ceiling") {
    // Straight over the middle of the room, which is where a light usually
    // wants to be anyway.
    return hangFromCeiling(item, 0, 0, room);
  }

  if (mount === "wall") {
    const snap = snapToWall(item, 0, Math.min(1.5, room.height - halfH), -room.length / 2, room, walls);
    return snap.position;
  }

  for (let ring = 0; ring < 8; ring++) {
    const steps = ring === 0 ? 1 : 8;
    for (let step = 0; step < steps; step++) {
      const angle = (step / steps) * Math.PI * 2;
      const x = ring === 0 ? 0 : Math.cos(angle) * ring * 0.5;
      const z = ring === 0 ? 0 : Math.sin(angle) * ring * 0.5;
      const e = extentsFor(item);
      if (polygon) {
        const margin = Math.max(e.x, e.z) / 2;
        if (!isClearOfPolygonEdges(x, z, margin, polygon)) continue;
      } else {
        const spanX = Math.max(0, room.width / 2 - e.x / 2);
        const spanZ = Math.max(0, room.length / 2 - e.z / 2);
        if (Math.abs(x) > spanX || Math.abs(z) > spanZ) continue;
      }

      if (mount === "tabletop") {
        // A tabletop item wants a surface, so the first ring that lands it on
        // something other than the floor wins.
        const support = supportHeightAt(item, x, z, existing);
        if (support > 0.1 || ring === 7) return [x, support + halfH, z];
        continue;
      }

      const clashes = existing.some(
        (o) => o.dimensions[1] >= 0.05 && mountOf(o) !== "wall" && footprintsOverlap(item, x, z, o)
      );
      if (!clashes) return [x, halfH, z];
    }
  }
  return [0, halfH, 0];
}

/**
 * Hang something from the ceiling.
 *
 * A pendant has one degree of freedom that matters — where over the floor it
 * hangs — and one that must never change: it is fixed to the ceiling. Letting a
 * chandelier be dragged down to knee height would be a bug, not a feature, so
 * the height is not a free parameter at all.
 */
export function hangFromCeiling(
  item: Obj,
  x: number,
  z: number,
  room: RoomLayout["room"]
): [number, number, number] {
  const [cx, cz] = clampToRoom(item, x, z, room);
  return [cx, room.height - item.dimensions[1] / 2, cz];
}

/** How close a floor item must come to a wall before it jumps flush against it. */
export const WALL_SNAP_DISTANCE = 0.28;

/**
 * Pull a floor-standing item flush against a wall it is being dragged near,
 * and turn it to face into the room.
 *
 * Most furniture in a real dorm lives against a wall, and getting a bookcase
 * *exactly* flush by hand is fiddly in a 3D view. Returns null when the item
 * is nowhere near a wall, so free placement is still the default in open floor.
 */
export function snapFloorNearWall(
  item: Obj,
  x: number,
  z: number,
  room: RoomLayout["room"],
  threshold = WALL_SNAP_DISTANCE,
  walls?: readonly Wall[]
): { position: [number, number, number]; rotationY: number } | null {
  const h = item.dimensions[1];

  if (walls && walls.length >= 3) {
    const hit = snapToMeasuredWall(item, x, z, walls);
    // Gap to the item's own centre, not its nearest face — close enough for
    // a snap threshold, and finding "nearest face to an arbitrarily angled
    // wall" isn't worth the extra complexity the box version needs it for
    // (there, the wall is always axis-aligned, so face-distance is cheap).
    if (hit && Math.abs(hit.distance) <= threshold) {
      return { position: [hit.position[0], h / 2, hit.position[1]], rotationY: hit.rotationY };
    }
    if (hit) return null;
  }

  const halfW = room.width / 2;
  const halfL = room.length / 2;
  // Measured against the object as it currently sits, not as it was authored.
  const e = extentsFor(item);

  // Distance from each wall to the item's nearest face, not its centre.
  const gaps = {
    north: z - e.z / 2 + halfL,
    south: halfL - (z + e.z / 2),
    west: x - e.x / 2 + halfW,
    east: halfW - (x + e.x / 2),
  };
  const side = (Object.keys(gaps) as (keyof typeof gaps)[]).reduce((a, b) =>
    gaps[a] <= gaps[b] ? a : b
  );
  if (gaps[side] > threshold) return null;

  // Snapping turns the piece to face the room, which changes its extents — so
  // the flush position has to be computed from the size it will have AFTER the
  // turn, not the size it had before.
  const facing = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 }[side];
  const after = extentsOf(item.dimensions, facing);
  const clampX = Math.min(halfW - after.x / 2, Math.max(-halfW + after.x / 2, x));
  const clampZ = Math.min(halfL - after.z / 2, Math.max(-halfL + after.z / 2, z));

  switch (side) {
    case "north":
      return { position: [clampX, h / 2, -halfL + after.z / 2], rotationY: facing };
    case "south":
      return { position: [clampX, h / 2, halfL - after.z / 2], rotationY: facing };
    case "west":
      return { position: [-halfW + after.x / 2, h / 2, clampZ], rotationY: facing };
    default:
      return { position: [halfW - after.x / 2, h / 2, clampZ], rotationY: facing };
  }
}

/** Keep an object inside the room, accounting for which way it is facing.
 *  Clamps to the real measured wall outline when the room has one, treating
 *  the object's footprint as a circle of its own largest half-extent for the
 *  margin — an approximation (a true polygon offset of a rotated rectangle
 *  is a lot more geometry for a case that's rarely visibly wrong), but a
 *  conservative one: it never lets a corner poke through a wall, at the cost
 *  of occasionally stopping a hair earlier than the exact footprint would
 *  need to.
 *
 *  Falls back to the room's bounding box if the polygon clamp can't actually
 *  reach a clear point. RoomPlan doesn't distinguish an outer perimeter wall
 *  from an interior partition, so `wallOutlinePolygon`'s single-loop
 *  reconstruction isn't guaranteed to produce a simple (non-self-crossing)
 *  outline for a real multi-room scan — confirmed against a real 16-wall
 *  apartment scan, where it doesn't. A half-plane erosion has no consistent
 *  answer against a self-intersecting shape, so this falls back rather than
 *  hand back a point that's still against some edge it couldn't resolve. */
export function clampToRoom(
  item: Obj,
  x: number,
  z: number,
  room: RoomLayout["room"],
  walls?: readonly Wall[]
): [number, number] {
  const e = extentsFor(item);

  if (walls && walls.length >= 3) {
    const polygon = wallOutlinePolygon(walls);
    if (polygon) {
      const margin = Math.max(e.x, e.z) / 2;
      const clamped = clampPointToPolygon(x, z, margin, polygon);
      if (isClearOfPolygonEdges(clamped[0], clamped[1], margin - 1e-3, polygon)) {
        return clamped;
      }
      // Fall through to the box clamp below.
    }
  }

  const spanX = Math.max(0, room.width / 2 - e.x / 2);
  const spanZ = Math.max(0, room.length / 2 - e.z / 2);
  return [Math.min(spanX, Math.max(-spanX, x)), Math.min(spanZ, Math.max(-spanZ, z))];
}
