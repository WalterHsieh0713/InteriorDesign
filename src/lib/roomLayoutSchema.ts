import { z } from "zod";

export const OBJECT_CATEGORIES = [
  "bed",
  "desk",
  "chair",
  "stool",
  "sofa",
  "table",
  "shelf",
  "dresser",
  "nightstand",
  "ottoman",
  "tv",
  "monitor",
  "lamp",
  "mirror",
  "plant",
  "rug",
  "door",
  "window",
  "other",
] as const;

export type ObjectCategory = (typeof OBJECT_CATEGORIES)[number];

export const SURFACE_MATERIALS = [
  "carpet",
  "wood",
  "tile",
  "concrete",
  "vinyl",
  "other",
] as const;

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

// One entry per photo the LiDAR app captured *with a known camera pose* —
// used to project real pixels onto the room's surfaces instead of a flat
// sampled color. Web-only (Gemini photo) sessions never have this, since a
// phone snapshot from the browser carries no ARKit pose; that path keeps
// rendering flat colors exactly as before. `transform` is the camera's full
// 4x4 world matrix (16 numbers, column-major, already in the same
// room-aligned space as object positions) and `fovY` is its vertical field
// of view in radians — together with `width`/`height` that's everything
// needed to reproduce what that camera saw.
const cameraFrame = z.object({
  url: z.string(),
  transform: z.array(z.number()).length(16),
  fovY: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
});

// What a given object in the room *is*, commercially. The scan can only ever
// report "owned" — it sees furniture the person already has and knows nothing
// about where it came from. The other two arms are written client-side in the
// editor when someone swaps in or places a product.
//
// `priceCents` is deliberately denormalized onto the binding rather than looked
// up from the catalog at read time: the feed snapshots a design's total at
// publish time, and a post should keep describing what was actually shared even
// after a catalog price changes.
export const ItemBindingSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("owned") }),
  z.object({
    source: z.literal("catalog"),
    catalogItemId: z.string(),
    priceCents: z.number().int().nonnegative(),
    url: z.url(),
  }),
  z.object({
    source: z.literal("custom"),
    label: z.string(),
    priceCents: z.number().int().nonnegative().nullable(),
    url: z.url().nullable(),
  }),
]);

export type ItemBinding = z.infer<typeof ItemBindingSchema>;

export const WALL_SIDES = ["north", "south", "east", "west"] as const;
export type WallSide = (typeof WALL_SIDES)[number];

// Real rooms are not four flat rectangles. Dorms have boxed-in structural
// columns, chimney breasts, radiator housings and service risers, and a piece
// of furniture that ignores them ends up modelled inside a concrete pillar.
//
// A feature is a box attached to one wall: `offset` places it along that wall
// from the wall's centre, `depth` is how far it intrudes into the room, and
// `baseY` is how high off the floor it starts (a boxed pipe run near the
// ceiling starts high). A "recess" is the same box cut inward instead.
//
// Optional and additive: a scan that reports nothing still produces a plain
// rectangular room, exactly as before.
export const WallFeatureSchema = z.object({
  id: z.string(),
  wall: z.enum(WALL_SIDES),
  kind: z.enum(["pillar", "bump", "recess"]),
  offset: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  depth: z.number().positive(),
  baseY: z.number().min(0).default(0),
});

export type WallFeature = z.infer<typeof WallFeatureSchema>;

// Colors and materials are optional throughout: the LiDAR path has no camera
// imagery to sample them from, and layouts captured before this existed must
// keep validating. Anything missing falls back to the category palette.
export const RoomLayoutSchema = z.object({
  room: z.object({
    width: z.number().positive(),
    length: z.number().positive(),
    height: z.number().positive(),
    wallColor: hexColor.optional(),
    floorColor: hexColor.optional(),
    ceilingColor: hexColor.optional(),
    floorMaterial: z.enum(SURFACE_MATERIALS).optional(),
    // Tint for the scene's lights — a warm incandescent room and a cool
    // daylight one should not be lit identically. Defaults to neutral white
    // when absent.
    lightColor: hexColor.optional(),
    // Columns, boxed-in pipework and alcoves the scan found. Absent means a
    // plain rectangular room, which is what every layout saved so far is.
    wallFeatures: z.array(WallFeatureSchema).optional(),
  }),
  objects: z.array(
    z.object({
      id: z.string(),
      category: z.enum(OBJECT_CATEGORIES),
      position: vec3,
      rotationY: z.number(),
      dimensions: vec3,
      confidence: z.number().min(0).max(1),
      color: hexColor.optional(),
      // `.default()` is what makes this change safe to land mid-flight: every
      // layout saved before bindings existed still parses, and comes back as
      // "owned" — which is exactly what a scanned object is.
      binding: ItemBindingSchema.default({ source: "owned" }),
      // How a decorative object is configured, when the choice is not a
      // separate product: "poster:comic:a2", "led:ceiling". Optional and
      // additive — a scan never sets it, and anything that doesn't understand
      // a given preset can ignore the object entirely.
      preset: z.string().optional(),
    })
  ),
  cameraFrames: z.array(cameraFrame).optional(),
});

export type CameraFrame = z.infer<typeof cameraFrame>;

export type RoomLayout = z.infer<typeof RoomLayoutSchema>;
