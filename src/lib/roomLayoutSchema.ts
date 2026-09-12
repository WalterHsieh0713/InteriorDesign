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
  "door",
  "window",
  "other",
] as const;

/// Categories that describe the room's structure rather than its contents.
/// These are measured in place and dragging them is always a mistake — a door
/// halfway across the floor is nonsense, and moving one silently corrupts the
/// only record of where the real opening was.
export const FIXED_CATEGORIES: readonly string[] = ["door", "window", "stairs", "fireplace"];

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
    })
  ),
  walls: z.array(wall).optional(),
  cameraFrames: z.array(cameraFrame).optional(),
});

export type Wall = z.infer<typeof wall>;

export type CameraFrame = z.infer<typeof cameraFrame>;

export type RoomLayout = z.infer<typeof RoomLayoutSchema>;
