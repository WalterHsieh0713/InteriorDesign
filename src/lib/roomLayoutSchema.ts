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
  // Appliances and fixtures. RoomPlan detects every one of these natively —
  // the exporter used to collapse them all into "other", which is why a
  // scanned kitchen or bathroom came back as anonymous grey boxes.
  "refrigerator",
  "oven",
  "stove",
  "dishwasher",
  "washerDryer",
  "sink",
  "toilet",
  "bathtub",
  "fireplace",
  "stairs",
  // Small items. LiDAR cannot see any of these — CapturedRoom.Object.Category
  // is a fixed 16-value Apple enum with no concept of a thermostat — so they
  // come from /api/detect-details instead, which finds them in the captured
  // photos and back-projects them onto the already-scanned geometry.
  "keyboard",
  "speaker",
  "clock",
  "artwork",
  "thermostat",
  "smokeAlarm",
  "outlet",
  "lightSwitch",
  "vent",
  "books",
  "door",
  "window",
  "other",
] as const;

export type ObjectCategory = (typeof OBJECT_CATEGORIES)[number];

/// Categories that describe the room's structure rather than its contents.
/// These are measured in place and dragging them is always a mistake — a door
/// halfway across the floor is nonsense, and moving one silently corrupts the
/// only record of where the real opening was. The small wall-mounted fittings
/// are here for the same reason: a light switch is part of the wall.
export const FIXED_CATEGORIES: readonly string[] = [
  "door",
  "window",
  "stairs",
  "fireplace",
  "thermostat",
  "smokeAlarm",
  "outlet",
  "lightSwitch",
  "vent",
];

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

// One measured wall segment. Real rooms are not rectangles — they have bays,
// angled corners, partition walls, sloped ceilings — and collapsing them to a
// width×length box puts anything standing against a non-axis-aligned wall
// somewhere it isn't, usually floating in open floor. RoomPlan measures each
// wall individually, so when we have that, render it.
//
// `position` is the wall's center and `rotationY` its yaw, in exactly the same
// room-aligned frame as `objects`. `dimensions` is [width, height, thickness].
// Absent on the Gemini photo path (which only ever estimates a bounding box),
// and on every layout captured before this existed — both keep falling back to
// the four-wall box built from room.width/length/height.
const wall = z.object({
  position: vec3,
  rotationY: z.number(),
  dimensions: vec3,
});

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
      // A human correction, displayed instead of the category. Detection gets
      // things wrong — a bin read as a stool, a radiator as a shelf — but the
      // category has to stay inside the enum because the renderer picks the
      // object's geometry from it. So a free-text correction lives here, and
      // the category can be re-pointed separately when the shape is wrong too.
      label: z.string().max(60).optional(),
    })
  ),
  walls: z.array(wall).optional(),
  cameraFrames: z.array(cameraFrame).optional(),
});

export type Wall = z.infer<typeof wall>;

export type CameraFrame = z.infer<typeof cameraFrame>;

export type RoomLayout = z.infer<typeof RoomLayoutSchema>;
