import Link from "next/link";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { withRetry } from "@/lib/retry";
import type { Post } from "@/lib/postMetadata";
import { PlansShell } from "@/components/social/PlansShell";

/**
 * Everything one person has shared.
 *
 * A feed of plans is a wall of rooms; this is what makes it a set of people,
 * which is the part of "community" the feed was missing. It costs one query,
 * because `author_handle` was already on every post.
 *
 * The handle is self-declared and stored in one browser. Two people can
 * claim the same name, and one person on two devices reads as two people.
 * That is the accepted ceiling of having no accounts, and this page is the
 * place it will be felt first.
 */

async function loadPosts(handle: string): Promise<Post[]> {
  const { data } = await withRetry(() =>
    supabaseAdmin()
      .from("posts")
      .select("*")
      .eq("author_handle", handle)
      .order("created_at", { ascending: false })
      .limit(60)
  );
  return (data ?? []) as Post[];
}

export async function generateMetadata({ params }: PageProps<"/u/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  return { title: `@${decodeURIComponent(handle)} — Plans` };
}

export default async function ProfilePage({ params }: PageProps<"/u/[handle]">) {
  const { handle: raw } = await params;
  const handle = decodeURIComponent(raw);
  const posts = await loadPosts(handle);

  const totalArea = posts.reduce((sum, p) => sum + p.area_m2, 0);
  const stamps = posts.reduce((sum, p) => sum + p.like_count, 0);

  return (
    <PlansShell
      action={
        <Link href="/feed" className="tb text-[12px] uppercase tracking-wider text-[var(--blueline)]">
          ← All plans
        </Link>
      }
    >
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">@{handle}</h1>
        {posts.length > 0 && (
          <p className="tb mt-1 text-[12px] text-[var(--pencil)]">
            {posts.length} {posts.length === 1 ? "plan" : "plans"} · {Math.round(totalArea)} m²
            scanned · {stamps} {stamps === 1 ? "stamp" : "stamps"}
          </p>
        )}
      </header>

      {posts.length === 0 ? (
        <div className="sheet rounded-[2px] px-6 py-16 text-center">
          <p className="text-sm">Nobody has posted under this name.</p>
          <Link
            href="/feed"
            className="tb mt-3 inline-block text-[12px] text-[var(--blueline)] underline underline-offset-4"
          >
            Browse all plans
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 lg:grid-cols-4">
          {posts.map((post) => (
            <li key={post.id}>
              <Link href={`/p/${post.id}`} className="sheet block overflow-hidden rounded-[2px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.render_url ?? post.thumbnail_url}
                  alt={`Floor plan of a ${post.room_type}, ${Math.round(post.area_m2)} square metres`}
                  className="aspect-square w-full bg-[var(--paper)] object-cover"
                  loading="lazy"
                />
                <div className="border-t border-[var(--rule)] px-3 py-2">
                  <div className="tb flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="truncate uppercase tracking-wider text-[var(--blueline)]">
                      {post.room_type}
                    </span>
                    <span className="text-[var(--pencil)]">{Math.round(post.area_m2)} m²</span>
                  </div>
                </div>
              </Link>
              {post.caption && (
                <p className="mt-2 truncate text-sm leading-snug">{post.caption}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </PlansShell>
  );
}
