import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { withRetry } from "@/lib/retry";
import type { Post } from "@/lib/postMetadata";
import { candidateAreaRange, rankSimilar } from "@/lib/similarity";

/**
 * "Rooms about this size" under a post.
 *
 * The answer to the question this product exists to answer, put where
 * someone is already looking at a room they like. Server-rendered, so it
 * costs the visitor nothing and needs no client state.
 */
export async function SimilarRooms({ post }: { post: Post }) {
  const { min, max } = candidateAreaRange(post.area_m2);

  // Cast a wide net in SQL, then score in TypeScript. Ordering by area
  // proximity is impossible in PostgREST without an RPC, and at this volume
  // the difference is a few dozen rows.
  const { data, error } = await withRetry(() =>
    supabaseAdmin()
      .from("posts")
      .select("*")
      .gte("area_m2", min)
      .lte("area_m2", max)
      .neq("id", post.id)
      .limit(60)
  );

  if (error || !data?.length) return null;

  const similar = rankSimilar(post, data as Post[], 4);
  if (similar.length === 0) return null;

  return (
    <section className="mt-10 border-t border-[var(--rule)] pt-6">
      <h2 className="tb text-[11px] uppercase tracking-wider text-[var(--pencil)]">
        Rooms about this size
      </h2>

      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {similar.map((other) => (
          <li key={other.id}>
            <Link href={`/p/${other.id}`} className="sheet block overflow-hidden rounded-[2px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={other.render_url ?? other.thumbnail_url}
                alt={`Floor plan of a ${other.room_type}, ${Math.round(other.area_m2)} square metres`}
                className="aspect-square w-full bg-[var(--paper)] object-contain"
                loading="lazy"
              />
              <div className="border-t border-[var(--rule)] px-2 py-1.5">
                <div className="tb truncate text-[11px] uppercase tracking-wider text-[var(--blueline)]">
                  {other.room_type}
                </div>
                <div className="tb text-[11px] text-[var(--pencil)]">
                  {Math.round(other.area_m2)} m²
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
