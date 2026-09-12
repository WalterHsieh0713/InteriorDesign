import type { Post } from "./postMetadata";

/**
 * Ranking rooms by how much they resemble one another.
 *
 * This is the mechanic the product is uniquely able to offer: everyone has
 * measured dimensions, so "what did other people do with a room this size"
 * is answerable here and nowhere else. It backs three surfaces — "Similar
 * rooms" on a post, an affinity-ranked For You, and anywhere else that wants
 * "more like this" — from one scorer, so they can never disagree.
 *
 * No embeddings and no model. The snapshot columns already carry everything
 * a useful answer needs, and a transparent score can be explained to a user
 * and tuned by hand when it gets something wrong.
 */

export type SimilarityTarget = Pick<
  Post,
  "room_type" | "area_m2" | "style_tags" | "object_count"
>;

/** How wide a net to cast before scoring. Generous on purpose: the score
 *  sorts, the filter only stops us loading the entire table. */
export const CANDIDATE_AREA_FACTOR = 0.5;

const WEIGHTS = {
  roomType: 3,
  area: 2.5,
  styleTag: 1,
  density: 1,
} as const;

/** 1 when identical, falling to 0 as the values diverge by `tolerance`. */
function closeness(a: number, b: number, tolerance: number): number {
  if (!(tolerance > 0)) return a === b ? 1 : 0;
  return Math.max(0, 1 - Math.abs(a - b) / tolerance);
}

export function similarityScore(target: SimilarityTarget, other: SimilarityTarget): number {
  let score = 0;

  if (target.room_type === other.room_type) score += WEIGHTS.roomType;

  // Proportional, not absolute: two metres apart matters enormously in a
  // 12 m² dorm and barely at all in a 90 m² loft.
  score += WEIGHTS.area * closeness(target.area_m2, other.area_m2, Math.max(target.area_m2, 1) * 0.5);

  const targetTags = new Set(target.style_tags ?? []);
  const shared = (other.style_tags ?? []).filter((tag) => targetTags.has(tag)).length;
  score += WEIGHTS.styleTag * Math.min(shared, 3);

  // Objects per square metre: separates a sparse room from a crowded one of
  // the same size, which is most of what "feels similar" means in practice.
  const densityOf = (p: SimilarityTarget) => p.object_count / Math.max(p.area_m2, 1);
  score += WEIGHTS.density * closeness(densityOf(target), densityOf(other), 0.5);

  return score;
}

/**
 * Best matches first, excluding the target itself.
 *
 * Ties break toward the newer plan, so a stale room does not permanently own
 * a slot just because it was posted first.
 */
export function rankSimilar(
  target: SimilarityTarget & { id?: string },
  candidates: Post[],
  limit = 6
): Post[] {
  return candidates
    .filter((c) => c.id !== target.id)
    .map((c) => ({ post: c, score: similarityScore(target, c) }))
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : Date.parse(b.post.created_at) - Date.parse(a.post.created_at)
    )
    .slice(0, limit)
    .map((scored) => scored.post);
}

/** Inclusive area bounds for the candidate pre-filter. */
export function candidateAreaRange(areaM2: number): { min: number; max: number } {
  return {
    min: areaM2 * (1 - CANDIDATE_AREA_FACTOR),
    max: areaM2 * (1 + CANDIDATE_AREA_FACTOR),
  };
}
