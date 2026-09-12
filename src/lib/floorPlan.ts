import type { RoomLayout } from "./roomLayoutSchema";

/**
 * Renders a layout as a top-down floor plan SVG.
 *
 * Used for feed thumbnails. A shrunken 3D render is mush at 200px; a plan
 * view stays legible and actually tells you something about the room.
 *
 * Pure string building on purpose — no three.js, no canvas, no DOM. It runs
 * on the server, in a script, or in a test with equal ease.
 *
 * Coordinate mapping: the layout is Y-up with the origin at the centre of
 * the floor, so the floor plane is (x, z). Screen x comes from world x and
 * screen y from world z, which means looking straight down from +Y.
 */

/** Matches the palette in RoomScene so a plan and the 3D view agree. */
export const CATEGORY_COLORS: Record<string, string> = {
  bed: "#b9bec7",
  desk: "#a97a5a",
  chair: "#c8a06a",
  sofa: "#8b8f98",
  table: "#b08a5e",
  shelf: "#9c7b55",
  dresser: "#8f6b4a",
  tv: "#1b1d20",
  lamp: "#e8dcc4",
  rug: "#9a938a",
  door: "#7a5638",
  window: "#aecbd8",
  other: "#b0aca6",
};

/** Drawn as openings in the wall line rather than as furniture. */
const ARCHITECTURE = new Set(["door", "window"]);

/**
 * Draw order. Rugs sit under everything, architecture on top of the wall
 * line. Without this a rug covers the furniture standing on it.
 */
function drawOrder(category: string): number {
  if (category === "rug") return 0;
  if (ARCHITECTURE.has(category)) return 2;
  return 1;
}

/**
 * The plan's own palette, kept in step with the tokens in globals.css.
 *
 * These are duplicated as literals rather than read from CSS because the
 * SVG is generated on the server and served as image/svg+xml, so it never
 * sees a stylesheet or a custom property.
 */
const INK = {
  ground: "#141110",
  floor: "#1e1a15",
  line: "#f3ede4",
  accent: "#e9b36a",
} as const;

/**
 * Colours reach here from the database, and the output is served as
 * image/svg+xml — which executes markup if opened directly. The schema
 * already constrains these to #RRGGBB, but re-checking at the boundary
 * costs nothing and means a bad row can't inject into the document.
 */
function safeColor(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

const round = (n: number) => Math.round(n * 100) / 100;

export type FloorPlanOptions = {
  /** Long edge of the viewport, in px. The short edge follows the room. */
  size?: number;
};

/**
 * How wide a plan is drawn relative to how tall, as width / height.
 *
 * The plan used to be square regardless of the room, which threw away the
 * one fact this product is sure of. A 7.2 x 3.9 m living room and a
 * 2.6 x 4.2 m box room are different shapes, and in a masonry grid that
 * difference is what makes the page readable at a glance.
 *
 * Clamped, though. A scan can report a 1.2 x 8 m hallway, and an unclamped
 * card for it would be a sliver tall enough to push a whole column off the
 * screen. Beyond the clamp the plan simply letterboxes inside the card, so
 * the drawing stays true even where the card shape stops tracking it.
 *
 * Callers rendering a thumbnail should set this same ratio on the element
 * so the grid reserves the right space before the image loads.
 */
export function planAspect(width: number, length: number): number {
  if (!(width > 0) || !(length > 0)) return 1;
  return Math.min(1.7, Math.max(0.58, width / length));
}

export function floorPlanSvg(layout: RoomLayout, options: FloorPlanOptions = {}): string {
  const base = options.size ?? 512;
  const { room, objects } = layout;

  // The canvas takes the room's proportion, so a wide room yields a wide
  // card and a long room a tall one.
  const aspect = planAspect(room.width, room.length);
  const width = aspect >= 1 ? base : Math.round(base * aspect);
  const height = aspect >= 1 ? Math.round(base / aspect) : base;

  const pad = Math.round(Math.min(width, height) * 0.06);

  // One scale for both axes, letterboxed. A per-axis scale would make a long
  // room look square and quietly lie about its proportions.
  const scale = Math.min((width - pad * 2) / room.width, (height - pad * 2) / room.length);
  const planW = room.width * scale;
  const planL = room.length * scale;
  const originX = (width - planW) / 2;
  const originY = (height - planL) / 2;

  const px = (x: number) => round(originX + (x + room.width / 2) * scale);
  const py = (z: number) => round(originY + (z + room.length / 2) * scale);

  // The plan is drawn as a drawing, not as a colour swatch.
  //
  // It used to paint the sampled floor and wall colours straight onto a
  // near-white page. Against the app's dark ground that turns every
  // thumbnail into a bright white rectangle, which is the single loudest
  // thing on the feed and fights the rooms it is meant to show. So the page
  // and floor are fixed to the palette, and the colour a scan actually
  // measured survives as a low-opacity tint on each object below.
  const floor = INK.floor;
  const wall = INK.line;

  const parts: string[] = [];

  parts.push(
    `<rect width="${width}" height="${height}" fill="${INK.ground}"/>`,
    `<rect x="${round(originX)}" y="${round(originY)}" width="${round(planW)}" height="${round(planL)}" fill="${floor}" stroke="${wall}" stroke-width="3" stroke-opacity="0.55"/>`
  );

  const sorted = [...objects].sort((a, b) => drawOrder(a.category) - drawOrder(b.category));

  for (const obj of sorted) {
    const [x, , z] = obj.position;
    const [w, , d] = obj.dimensions;
    if (!(w > 0) || !(d > 0)) continue;

    const cx = px(x);
    const cy = py(z);
    const rw = round(w * scale);
    const rd = round(d * scale);

    // SVG rotates clockwise with y pointing down; a positive rotation about
    // world +Y reads counter-clockwise from above. Hence the negation.
    const deg = round((-obj.rotationY * 180) / Math.PI);

    const fill = safeColor(obj.color, CATEGORY_COLORS[obj.category] ?? CATEGORY_COLORS.other);
    const isArch = ARCHITECTURE.has(obj.category);

    // The outline carries the footprint, the fill only tints it. Doors and
    // windows are picked out in amber because they are the constraints that
    // decide a layout, and they are what someone reading the plan at card
    // size is actually looking for.
    parts.push(
      `<g transform="translate(${cx} ${cy}) rotate(${deg})">` +
        `<rect x="${round(-rw / 2)}" y="${round(-rd / 2)}" width="${rw}" height="${rd}" ` +
        `fill="${fill}" fill-opacity="${obj.category === "rug" ? 0.1 : 0.18}" ` +
        `stroke="${isArch ? INK.accent : INK.line}" stroke-opacity="${isArch ? 0.95 : 0.5}" ` +
        `stroke-width="${isArch ? 2 : 1.25}" rx="1"/>` +
        `</g>`
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" ` +
    `role="img" aria-label="Floor plan, ${round(room.width)} by ${round(room.length)} metres, ${objects.length} objects">` +
    parts.join("") +
    `</svg>`
  );
}
