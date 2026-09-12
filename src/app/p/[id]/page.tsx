import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Post } from "@/lib/postMetadata";
import { PlansShell } from "@/components/social/PlansShell";
import { CommentThread } from "@/components/social/CommentThread";
import { SimilarRooms } from "@/components/social/SimilarRooms";

async function loadPost(id: string): Promise<Post | null> {
  // A malformed uuid makes Postgres raise rather than return no rows, so a
  // bad URL would 500 instead of 404 without this guard.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  const { data } = await supabaseAdmin().from("posts").select("*").eq("id", id).maybeSingle();
  return (data as Post | null) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/p/[id]">): Promise<Metadata> {
  const { id } = await params;
  const post = await loadPost(id);
  if (!post) return { title: "Plan not found" };

  return {
    title: `${post.room_type} · ${Math.round(post.area_m2)} m² — Plans`,
    description: post.caption ?? `A ${post.room_type} scanned and shared by @${post.author_handle}.`,
  };
}

export default async function PostPage({ params }: PageProps<"/p/[id]">) {
  const { id } = await params;
  const post = await loadPost(id);
  if (!post) notFound();

  const budget =
    post.total_budget_cents === null
      ? null
      : `$${(post.total_budget_cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  const facts: [string, string][] = [
    ["Room", post.room_type],
    ["Footprint", `${post.width_m.toFixed(2)} × ${post.length_m.toFixed(2)} m`],
    ["Area", `${Math.round(post.area_m2)} m²`],
    ["Objects", String(post.object_count)],
    ...(budget ? ([["Furnishings", budget]] as [string, string][]) : []),
  ];

  return (
    <PlansShell
      action={
        <Link
          href="/feed"
          className="tb text-[12px] uppercase tracking-wider text-[var(--blueline)]"
        >
          ← All plans
        </Link>
      }
    >
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_260px]">
        {/* Capped: an unbounded square plan eats the whole viewport height on
            a wide screen and pushes the title block out of view. */}
        <div className="sheet mx-auto w-full max-w-[560px] rounded-[2px] p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.render_url ?? post.thumbnail_url}
            alt={`Floor plan of a ${post.room_type}, ${Math.round(post.area_m2)} square metres`}
            className="aspect-square w-full bg-[var(--paper)] object-contain"
          />
        </div>

        <aside className="flex flex-col gap-6">
          <div>
            {post.caption && <p className="text-base leading-snug">{post.caption}</p>}
            <p className="tb mt-2 text-[12px] text-[var(--pencil)]">
              <Link
                href={`/u/${encodeURIComponent(post.author_handle)}`}
                className="hover:text-[var(--blueline)] hover:underline"
              >
                @{post.author_handle}
              </Link>{" "}
              ·{" "}
              {new Date(post.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>

          {/* Title block: the measured facts, set like a drawing sheet. */}
          <dl className="sheet rounded-[2px] divide-y divide-[var(--rule)]">
            {facts.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 px-3 py-2">
                <dt className="tb text-[11px] uppercase tracking-wider text-[var(--pencil)]">
                  {label}
                </dt>
                <dd className="tb text-[12px]">{value}</dd>
              </div>
            ))}
          </dl>

          {post.style_tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {post.style_tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/feed?style=${encodeURIComponent(tag)}`}
                  className="tb rounded-full border border-[var(--rule)] bg-[var(--sheet)] px-3 py-1 text-[12px] text-[var(--pencil)] hover:text-[var(--ink)]"
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Link
              href={`/room?session=${encodeURIComponent(post.session_id)}`}
              className="tb rounded-[2px] bg-[var(--ink)] px-4 py-2.5 text-center text-[12px] uppercase tracking-wider text-white"
            >
              Open in 3D
            </Link>
            <span className="tb text-[11px] text-[var(--pencil)]">
              {post.like_count} {post.like_count === 1 ? "stamp" : "stamps"}
            </span>
          </div>
        </aside>
      </div>

      <SimilarRooms post={post} />

      <CommentThread postId={post.id} initialCount={post.comment_count ?? 0} />
    </PlansShell>
  );
}
