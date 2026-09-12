import { z } from "zod";
import type { RoomLayout } from "./roomLayoutSchema";

/**
 * THE SEAM.
 *
 * This is the only file in the social layer that reads the design half's
 * data. Everything downstream — feed, filters, ranking, cards — works off
 * the flat snapshot produced here and never touches RoomLayout again.
 *
 * The snapshot is written onto the post row at publish time and never
 * recomputed. That keeps ranking and filtering in plain SQL instead of
 * joining into jsonb, and it means a post keeps describing what was
 * actually shared even after the owner rearranges the room.
 *
 * If the design half changes shape, this file is where it hurts, and
 * nowhere else.
 */

/** Author-selected in the composer: no scan can tell a dorm from a bedroom. */
export const ROOM_TYPES = [
  "dorm",
  "bedroom",
  "living room",
  "office",
  "studio",
  "kitchen",
  "lounge",
  "other",
] as const;

export type RoomType = (typeof ROOM_TYPES)[number];

/**
 * Offered in the composer and as filter chips. Not a closed set — style_tags
 * is free text — but a shared shortlist keeps the vocabulary from
 * fragmenting into "cosy", "cozy" and "COZY", which would make the filter
 * useless.
 */
export const STYLE_SUGGESTIONS = [
  "minimal",
  "cozy",
  "warm",
  "bright",
  "industrial",
  "scandi",
  "plants",
] as const;

export const PostMetadataSchema = z.object({
  roomType: z.enum(ROOM_TYPES),
  widthM: z.number().positive(),
  lengthM: z.number().positive(),
  areaM2: z.number().positive(),
  styleTags: z.array(z.string()).max(3),
  totalBudgetCents: z.number().int().nonnegative().nullable(),
  objectCount: z.number().int().nonnegative(),
});

export type PostMetadata = z.infer<typeof PostMetadataSchema>;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Lowercase, trimmed, de-duplicated, capped at three. */
export function normalizeStyleTags(raw: string[]): string[] {
  const seen = new Set<string>();
  for (const tag of raw) {
    const clean = tag.trim().toLowerCase();
    if (clean) seen.add(clean);
    if (seen.size === 3) break;
  }
  return [...seen];
}

/**
 * Sums the price of every catalog item bound to an object.
 *
 * Returns null when nothing is bound, which is the current state of the
 * world: the catalog swap doesn't persist bindings yet. Null means "not
 * known", and the budget filter stays hidden while every row is null —
 * distinct from 0, which would claim a free room.
 */
function totalBudgetCents(layout: RoomLayout): number | null {
  let total = 0;
  let found = false;

  for (const obj of layout.objects) {
    // Bindings aren't in RoomLayoutSchema yet. Read defensively so this
    // starts working the moment the design half begins writing them,
    // without a coordinated deploy.
    const binding = (obj as { binding?: { priceCents?: unknown } }).binding;
    const price = binding?.priceCents;
    if (typeof price === "number" && Number.isFinite(price) && price >= 0) {
      total += price;
      found = true;
    }
  }

  return found ? Math.round(total) : null;
}

export function buildPostMetadata(
  layout: RoomLayout,
  roomType: RoomType,
  styleTags: string[]
): PostMetadata {
  const { width, length } = layout.room;

  return {
    roomType,
    widthM: round2(width),
    lengthM: round2(length),
    areaM2: round2(width * length),
    styleTags: normalizeStyleTags(styleTags),
    totalBudgetCents: totalBudgetCents(layout),
    objectCount: layout.objects.length,
  };
}

/** A post row as the feed consumes it. Mirrors the `posts` table. */
export type Post = {
  id: string;
  session_id: string;
  author_handle: string;
  caption: string | null;
  thumbnail_url: string;
  created_at: string;
  room_type: string;
  width_m: number;
  length_m: number;
  area_m2: number;
  style_tags: string[];
  total_budget_cents: number | null;
  object_count: number;
  like_count: number;
  comment_count: number;
  /** A 3D capture when the editor produces one; null falls back to the plan. */
  render_url: string | null;
};
