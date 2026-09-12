import type { RoomLayout } from "./roomLayoutSchema";
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
};

/**
 * Snap a wall-mounted object to whichever wall it is nearest, keeping its
 * height. Posters and mirrors move freely up and down but never leave the wall,
 * which is the one degree of freedom that actually matters for them.
 */
export function snapToWall(
  item: Obj,
  x: number,
  y: number,
  z: number,
  room: RoomLayout["room"]
): WallSnap {
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

  // Keep the piece fully on the wall it is on, and off the floor and ceiling.
  const halfH = item.dimensions[1] / 2;
  const clampY = Math.min(Math.max(y, halfH), room.height - halfH);
  const spanX = Math.max(0, halfW - item.dimensions[0] / 2);
  const spanZ = Math.max(0, halfL - item.dimensions[0] / 2);

  switch (side) {
    case "north":
      return { side, position: [clamp(x, spanX), clampY, -halfL + clearance], rotationY: 0 };
    case "south":
      return { side, position: [clamp(x, spanX), clampY, halfL - clearance], rotationY: Math.PI };
    case "west":
      return { side, position: [-halfW + clearance, clampY, clamp(z, spanZ)], rotationY: Math.PI / 2 };
    case "east":
      return { side, position: [halfW - clearance, clampY, clamp(z, spanZ)], rotationY: -Math.PI / 2 };
  }
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
  existing: Obj[]
): [number, number, number] {
  const mount = mountOf(item);
  const halfH = item.dimensions[1] / 2;

  if (mount === "ceiling") {
    // Straight over the middle of the room, which is where a light usually
    // wants to be anyway.
    return hangFromCeiling(item, 0, 0, room);
  }

  if (mount === "wall") {
    const snap = snapToWall(item, 0, Math.min(1.5, room.height - halfH), -room.length / 2, room);
    return snap.position;
  }

  for (let ring = 0; ring < 8; ring++) {
    const steps = ring === 0 ? 1 : 8;
    for (let step = 0; step < steps; step++) {
      const angle = (step / steps) * Math.PI * 2;
      const x = ring === 0 ? 0 : Math.cos(angle) * ring * 0.5;
      const z = ring === 0 ? 0 : Math.sin(angle) * ring * 0.5;
      const e = extentsFor(item);
      const spanX = Math.max(0, room.width / 2 - e.x / 2);
      const spanZ = Math.max(0, room.length / 2 - e.z / 2);
      if (Math.abs(x) > spanX || Math.abs(z) > spanZ) continue;

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
  threshold = WALL_SNAP_DISTANCE
): { position: [number, number, number]; rotationY: number } | null {
  const halfW = room.width / 2;
  const halfL = room.length / 2;
  const h = item.dimensions[1];
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

/** Keep an object inside the room, accounting for which way it is facing. */
export function clampToRoom(
  item: Obj,
  x: number,
  z: number,
  room: RoomLayout["room"]
): [number, number] {
  const e = extentsFor(item);
  const spanX = Math.max(0, room.width / 2 - e.x / 2);
  const spanZ = Math.max(0, room.length / 2 - e.z / 2);
  return [Math.min(spanX, Math.max(-spanX, x)), Math.min(spanZ, Math.max(-spanZ, z))];
}
