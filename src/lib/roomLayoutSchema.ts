import { z } from "zod";

export const OBJECT_CATEGORIES = [
  "bed",
  "desk",
  "chair",
  "sofa",
  "table",
  "shelf",
  "dresser",
  "tv",
  "lamp",
  "rug",
  "door",
  "window",
  "other",
] as const;

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
});

export type RoomLayout = z.infer<typeof RoomLayoutSchema>;
