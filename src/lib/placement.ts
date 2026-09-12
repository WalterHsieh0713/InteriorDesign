import type { RoomLayout } from "./roomLayoutSchema";
import { CATALOG_BY_ID } from "./catalog";

export type Mount = "floor" | "wall" | "tabletop";

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

/** Do two objects' floor footprints overlap, treating (x,z) as the first one's centre? */
function footprintsOverlap(a: Obj, x: number, z: number, b: Obj): boolean {
  const gapX = Math.abs(b.position[0] - x) - (a.dimensions[0] + b.dimensions[0]) / 2;
  const gapZ = Math.abs(b.position[2] - z) - (a.dimensions[2] + b.dimensions[2]) / 2;
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
      const spanX = Math.max(0, room.width / 2 - item.dimensions[0] / 2);
      const spanZ = Math.max(0, room.length / 2 - item.dimensions[2] / 2);
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
  const [w, h, d] = item.dimensions;

  // Distance from each wall to the item's nearest face, not its centre.
  const gaps = {
    north: z - d / 2 - -halfL,
    south: halfL - (z + d / 2),
    west: x - w / 2 - -halfW,
    east: halfW - (x + w / 2),
  };
  const side = (Object.keys(gaps) as (keyof typeof gaps)[]).reduce((a, b) =>
    gaps[a] <= gaps[b] ? a : b
  );
  if (gaps[side] > threshold) return null;

  const clampX = Math.min(halfW - w / 2, Math.max(-halfW + w / 2, x));
  const clampZ = Math.min(halfL - d / 2, Math.max(-halfL + d / 2, z));

  switch (side) {
    case "north":
      return { position: [clampX, h / 2, -halfL + d / 2], rotationY: 0 };
    case "south":
      return { position: [clampX, h / 2, halfL - d / 2], rotationY: Math.PI };
    case "west":
      return { position: [-halfW + w / 2, h / 2, clampZ], rotationY: Math.PI / 2 };
    default:
      return { position: [halfW - w / 2, h / 2, clampZ], rotationY: -Math.PI / 2 };
  }
}
