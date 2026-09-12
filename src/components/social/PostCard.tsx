"use client";

import Link from "next/link";
import type { Post } from "@/lib/postMetadata";
import { planAspect } from "@/lib/floorPlan";

/**
 * One plan in the grid, drawn as a sheet from a drawing set: the floor plan
 * on paper, a title block beneath it carrying the measured facts.
 *
 * The thumbnail is an SVG served by /api/thumbnail, so it is rendered with
 * a plain <img> rather than next/image — there is nothing to optimize about
 * vector output, and next/image would only add a resizing hop.
 */

export function formatArea(m2: number): string {
  return `${Math.round(m2)} m²`;
}

export function formatBudget(cents: number | null): string | null {
  if (cents === null) return null;
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function PostCard({
  post,
  liked,
  onToggleLike,
}: {
  post: Post;
  liked: boolean;
  onToggleLike: (post: Post) => void;
}) {
  const budget = formatBudget(post.total_budget_cents);

  return (
    <article className="mb-4 flex break-inside-avoid flex-col sm:mb-5">
      <Link
        href={`/p/${post.id}`}
        className="sheet block overflow-hidden rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blueline)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={post.render_url ?? post.thumbnail_url}
          alt={`Floor plan of a ${post.room_type}, ${formatArea(post.area_m2)}`}
          // The ratio is set here as well as inside the SVG so the column
          // reserves the right height before the image arrives. Without it
          // every card jumps as the grid settles.
          style={{ aspectRatio: planAspect(post.width_m, post.length_m) }}
          className="w-full bg-[var(--ground)] object-cover"
          loading="lazy"
        />
        <div className="border-t border-[var(--line-soft)] px-3.5 py-2.5">
          <div className="tb flex items-baseline justify-between gap-2 text-[11px] text-[var(--pencil)]">
            <span className="uppercase tracking-wider text-[var(--blueline)]">
              {post.room_type}
            </span>
            <span>{formatArea(post.area_m2)}</span>
          </div>
          <div className="tb mt-0.5 text-[11px] text-[var(--pencil)]">
            {post.width_m.toFixed(2)} × {post.length_m.toFixed(2)} m · {post.object_count} obj
            {budget ? ` · ${budget}` : ""}
          </div>
        </div>
      </Link>

      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          {post.caption && (
            <p className="truncate text-sm leading-snug">{post.caption}</p>
          )}
          <p className="tb text-[11px] text-[var(--pencil)]">
            <Link
              href={`/u/${encodeURIComponent(post.author_handle)}`}
              className="hover:text-[var(--blueline)] hover:underline"
            >
              @{post.author_handle}
            </Link>
            {post.comment_count > 0 && (
              <span> · {post.comment_count} {post.comment_count === 1 ? "comment" : "comments"}</span>
            )}
          </p>
        </div>

        {/* Drawing sets get stamped when they're approved. A red rubber
            stamp is the positive mark in this world — a redline is a
            correction, which is the opposite of what a like means. */}
        <button
          type="button"
          onClick={() => onToggleLike(post)}
          aria-pressed={liked}
          aria-label={liked ? "Remove your stamp" : "Stamp this plan"}
          title={liked ? "Remove your stamp" : "Stamp this plan"}
          className={`tb shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--stamp)] ${
            liked
              ? "border-[var(--stamp)] bg-[var(--stamp)] text-[var(--on-amber)]"
              : "border-[var(--rule)] bg-[var(--sheet)] text-[var(--pencil)] hover:border-[var(--stamp)] hover:text-[var(--stamp)]"
          }`}
        >
          ✓ {post.like_count}
        </button>
      </div>
    </article>
  );
}
