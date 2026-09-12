import type { RoomLayout } from "./roomLayoutSchema";

/**
 * LED strip runs.
 *
 * A strip is not a piece of furniture and has no mesh worth downloading — it is
 * a line of light following an edge of the room or a piece of furniture. So a
 * preset is stored as the rule for where it runs, and the geometry is derived
 * from the room at render time. That is also why a strip survives someone
 * dragging the desk it sits above: the run is recomputed, not baked.
 */

export type LedPresetId = "ceiling" | "bed" | "headboard";

export type LedSegment = {
  /** Both ends in room space, metres. */
  from: [number, number, number];
  to: [number, number, number];
};

export type LedPreset = {
  id: LedPresetId;
  label: string;
  description: string;
};

export const LED_PRESETS: LedPreset[] = [
  {
    id: "ceiling",
    label: "Ceiling perimeter",
    description: "Around the top of all four walls",
  },
  {
    id: "bed",
    label: "Under the bed",
    description: "Uplight along the bed's base",
  },
  {
    id: "headboard",
    label: "Headboard accent",
    description: "Vertical runs framing the bed wall",
  },
];

type Obj = RoomLayout["objects"][number];

const findCategory = (objects: Obj[], category: string) =>
  objects.find((o) => o.category === category);

/**
 * Which presets this particular room can actually offer.
 *
 * Offering "under the bed" in a room with no bed produces a strip glowing in
 * mid-air, so the option simply is not shown until there is something to
 * attach it to.
 */
export function availablePresets(objects: Obj[]): LedPreset[] {
  const hasBed = !!findCategory(objects, "bed");
  return LED_PRESETS.filter((p) => {
    if (p.id === "bed" || p.id === "headboard") return hasBed;
    return true;
  });
}

/** Which wall a piece of furniture has its back to, and how far along that wall it sits. */
function backWall(obj: Obj, room: RoomLayout["room"]) {
  const [x, , z] = obj.position;
  const d = {
    north: Math.abs(z + room.length / 2),
    south: Math.abs(room.length / 2 - z),
    west: Math.abs(x + room.width / 2),
    east: Math.abs(room.width / 2 - x),
  };
  return (Object.keys(d) as (keyof typeof d)[]).reduce((a, b) => (d[a] <= d[b] ? a : b));
}

export function segmentsFor(
  preset: LedPresetId,
  room: RoomLayout["room"],
  objects: Obj[]
): LedSegment[] {
  const hw = room.width / 2;
  const hl = room.length / 2;
  // Held just below the ceiling and just off the wall, the way a strip on
  // adhesive backing actually sits.
  const ch = room.height - 0.06;
  const off = 0.04;

  if (preset === "ceiling") {
    return [
      { from: [-hw + off, ch, -hl + off], to: [hw - off, ch, -hl + off] },
      { from: [hw - off, ch, -hl + off], to: [hw - off, ch, hl - off] },
      { from: [hw - off, ch, hl - off], to: [-hw + off, ch, hl - off] },
      { from: [-hw + off, ch, hl - off], to: [-hw + off, ch, -hl + off] },
    ];
  }

  const bed = findCategory(objects, "bed");
  if (!bed) return [];
  const [bx, , bz] = bed.position;
  const [bw, , bd] = bed.dimensions;

  if (preset === "bed") {
    // A rectangle just above the floor, tracing the bed's base.
    const y = 0.07;
    const x0 = bx - bw / 2, x1 = bx + bw / 2;
    const z0 = bz - bd / 2, z1 = bz + bd / 2;
    return [
      { from: [x0, y, z0], to: [x1, y, z0] },
      { from: [x1, y, z0], to: [x1, y, z1] },
      { from: [x1, y, z1], to: [x0, y, z1] },
      { from: [x0, y, z1], to: [x0, y, z0] },
    ];
  }

  // headboard: two vertical runs on the wall the bed backs onto
  const side = backWall(bed, room);
  const top = Math.min(room.height - 0.1, 2.0);
  const half = bw / 2 + 0.1;
  if (side === "north" || side === "south") {
    const z = side === "north" ? -hl + off : hl - off;
    return [
      { from: [bx - half, 0.1, z], to: [bx - half, top, z] },
      { from: [bx + half, 0.1, z], to: [bx + half, top, z] },
    ];
  }
  const x = side === "west" ? -hw + off : hw - off;
  return [
    { from: [x, 0.1, bz - half], to: [x, top, bz - half] },
    { from: [x, 0.1, bz + half], to: [x, top, bz + half] },
  ];
}

/** Total run in metres — what decides how many metres of strip someone has to buy. */
export function runLength(segments: LedSegment[]): number {
  return segments.reduce((total, s) => {
    const dx = s.to[0] - s.from[0];
    const dy = s.to[1] - s.from[1];
    const dz = s.to[2] - s.from[2];
    return total + Math.hypot(dx, dy, dz);
  }, 0);
}

/**
 * The actual strip you have to buy to install a run.
 *
 * Both rolls cost the same, so the only question a run has to answer is
 * whether 50 feet is enough. A ceiling perimeter in a typical dorm comes to
 * about 14m, which it is — just.
 */
export type LedProduct = {
  id: string;
  name: string;
  brand: string;
  priceCents: number;
  productUrl: string;
  /** Strip on the roll, in metres. */
  lengthM: number;
};

export const LED_PRODUCTS: LedProduct[] = [
  {
    id: "amzn-B0FN43F8G2",
    name: "KSIPZE LED Strip Lights, 50 ft",
    brand: "KSIPZE",
    priceCents: 1499,
    productUrl: "https://www.amazon.com/dp/B0FN43F8G2",
    lengthM: 15.24,
  },
  {
    id: "amzn-B09V366BDY",
    name: "KSIPZE LED Strip Lights, 100 ft",
    brand: "KSIPZE",
    priceCents: 1499,
    productUrl: "https://www.amazon.com/dp/B09V366BDY",
    lengthM: 30.48,
  },
];

/** The shortest roll that covers a run, or the longest one if nothing does. */
export function rollFor(runMetres: number): LedProduct {
  const sorted = [...LED_PRODUCTS].sort((a, b) => a.lengthM - b.lengthM);
  return sorted.find((p) => p.lengthM >= runMetres) ?? sorted[sorted.length - 1];
}
