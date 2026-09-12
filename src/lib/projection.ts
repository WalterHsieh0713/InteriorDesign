import type { RoomLayout } from "./roomLayoutSchema";

/**
 * What a projector throws onto the wall it faces.
 *
 * Throw ratio is derived from the listing's own projection table, which is the
 * one number that makes this useful: it answers "how far back do I have to put
 * this to fill that wall", which is the whole reason to place a projector in a
 * room plan rather than just buy one.
 *
 *   50"  diagonal at 4.92 ft   72"  at 7.22 ft
 *   100" at 9.84 ft            200" at 17 ft
 *
 * A 100" 16:9 image is 2.214 m wide and sits 3.0 m back, giving 3.0 / 2.214 =
 * 1.355. The 50" and 72" rows agree to within a centimetre; the 200" row is
 * the usual optimistic round number and is ignored.
 */
export const THROW_RATIO = 1.355;

/** 16:9, the aspect every one of these projectors outputs. */
export const IMAGE_ASPECT = 16 / 9;

export type WallFace = "north" | "south" | "east" | "west";

export type Projection = {
  face: WallFace;
  /** Distance from the lens to that wall, in metres. */
  distance: number;
  width: number;
  height: number;
  /** Diagonal in inches, which is how projector screens are always described. */
  diagonalInches: number;
  /** Centre of the projected rectangle, in room space. */
  center: [number, number, number];
  /** Y rotation that lays the image flat against that wall. */
  rotationY: number;
  /** False when the image would spill past the wall's edges. */
  fits: boolean;
};

/**
 * Where a projector aimed along its own rotationY lands its image.
 *
 * Returns null when it is pointed at a wall it is already against — a lens
 * 10cm from plasterboard has nothing meaningful to show.
 */
export function projectionFor(
  projector: RoomLayout["objects"][number],
  room: RoomLayout["room"]
): Projection | null {
  const [px, py, pz] = projector.position;
  // rotationY 0 faces -Z (into the back wall), matching how objects are placed.
  const dirX = -Math.sin(projector.rotationY);
  const dirZ = -Math.cos(projector.rotationY);

  const hw = room.width / 2;
  const hl = room.length / 2;

  // Which wall the beam reaches first.
  const candidates: { face: WallFace; t: number }[] = [];
  if (dirZ < -1e-4) candidates.push({ face: "north", t: (-hl - pz) / dirZ });
  if (dirZ > 1e-4) candidates.push({ face: "south", t: (hl - pz) / dirZ });
  if (dirX < -1e-4) candidates.push({ face: "west", t: (-hw - px) / dirX });
  if (dirX > 1e-4) candidates.push({ face: "east", t: (hw - px) / dirX });

  const hit = candidates.filter((c) => c.t > 0).sort((a, b) => a.t - b.t)[0];
  if (!hit || hit.t < 0.35) return null;

  const distance = hit.t;
  const width = distance / THROW_RATIO;
  const height = width / IMAGE_ASPECT;
  const diagonalInches = (Math.hypot(width, height) / 0.0254);

  const hitX = px + dirX * distance;
  const hitZ = pz + dirZ * distance;
  // Image centre sits at lens height, nudged up the way these throw slightly high.
  const centerY = Math.min(Math.max(py + height * 0.15, height / 2), room.height - height / 2);

  const inset = 0.015;
  let center: [number, number, number];
  let rotationY: number;
  let fits: boolean;

  if (hit.face === "north" || hit.face === "south") {
    const z = hit.face === "north" ? -hl + inset : hl - inset;
    center = [hitX, centerY, z];
    rotationY = hit.face === "north" ? 0 : Math.PI;
    fits = Math.abs(hitX) + width / 2 <= hw && height <= room.height;
  } else {
    const x = hit.face === "west" ? -hw + inset : hw - inset;
    center = [x, centerY, hitZ];
    rotationY = hit.face === "west" ? Math.PI / 2 : -Math.PI / 2;
    fits = Math.abs(hitZ) + width / 2 <= hl && height <= room.height;
  }

  return { face: hit.face, distance, width, height, diagonalInches, center, rotationY, fits };
}

/** How far back this projector must sit for a given screen diagonal. */
export function distanceForDiagonal(diagonalInches: number): number {
  const diagonalM = diagonalInches * 0.0254;
  const width = diagonalM * (IMAGE_ASPECT / Math.hypot(IMAGE_ASPECT, 1));
  return width * THROW_RATIO;
}
