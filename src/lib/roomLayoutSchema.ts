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

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const RoomLayoutSchema = z.object({
  room: z.object({
    width: z.number().positive(),
    length: z.number().positive(),
    height: z.number().positive(),
  }),
  objects: z.array(
    z.object({
      id: z.string(),
      category: z.enum(OBJECT_CATEGORIES),
      position: vec3,
      rotationY: z.number(),
      dimensions: vec3,
      confidence: z.number().min(0).max(1),
    })
  ),
});

export type RoomLayout = z.infer<typeof RoomLayoutSchema>;
