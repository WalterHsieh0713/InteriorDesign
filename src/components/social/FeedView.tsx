"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Post } from "@/lib/postMetadata";
import { ROOM_TYPES, STYLE_SUGGESTIONS } from "@/lib/postMetadata";
import {
  getDeviceId,
  getLikedServerSnapshot,
  getLikedSnapshot,
  setLikedId,
  subscribeLiked,
} from "@/lib/device";
import { PostCard } from "./PostCard";

const TABS = [
  { id: "foryou", label: "For you" },
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "all", label: "All time" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const AREA_BANDS = [
  { id: "s", label: "Under 20 m²", min: undefined, max: 20 },
  { id: "m", label: "20–50 m²", min: 20, max: 50 },
  { id: "l", label: "50–80 m²", min: 50, max: 80 },
  { id: "xl", label: "Over 80 m²", min: 80, max: undefined },
] as const;

type FeedResponse = { posts: Post[]; page: number; total: number; hasMore: boolean };

/** Results, tagged with the query that produced them. */
type Loaded = { key: string; posts: Post[]; total: number; hasMore: boolean; page: number };

export function FeedView() {
  const router = useRouter();
  const params = useSearchParams();
  const key = params.toString();

  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "foryou") as TabId;
  const roomType = params.get("roomType") ?? "";
  const band = params.get("area") ?? "";
  const styles = params.getAll("style");

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const liked = useSyncExternalStore(subscribeLiked, getLikedSnapshot, getLikedServerSnapshot);

  // Derived rather than stored: results carry the query that produced them,
  // so "still loading" is just "what I have doesn't match what I asked for".
  // Storing it would mean calling setState from an effect body on every
  // query change, which cascades a render.
  const fresh = loaded?.key === key ? loaded : null;
  const loading = fresh === null;
  const error = failure?.key === key ? failure.message : null;

  const setParam = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      router.replace(next.toString() ? `/feed?${next}` : "/feed", { scroll: false });
    },
    [params, router]
  );

  const buildQuery = useCallback(
    (pageIndex: number) => {
      const q = new URLSearchParams();
      q.set("tab", tab);
      q.set("page", String(pageIndex));
      if (roomType) q.set("roomType", roomType);
      const chosen = AREA_BANDS.find((b) => b.id === band);
      if (chosen?.min !== undefined) q.set("minArea", String(chosen.min));
      if (chosen?.max !== undefined) q.set("maxArea", String(chosen.max));
      for (const s of styles) q.append("style", s);
      return q;
    },
    [tab, roomType, band, styles]
  );

  useEffect(() => {
    let cancelled = false;

    // Every setState below runs in an async callback, never synchronously in
    // the effect body.
    fetch(`/api/feed?${buildQuery(0)}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Couldn't load the feed");
        return body as FeedResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setLoaded({ key, posts: data.posts, total: data.total, hasMore: data.hasMore, page: 0 });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFailure({ key, message: err instanceof Error ? err.message : "Couldn't load the feed" });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function loadMore() {
    if (!fresh) return;
    const next = fresh.page + 1;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/feed?${buildQuery(next)}`);
      const data: FeedResponse = await res.json();
      if (!res.ok) throw new Error("Couldn't load more plans");
      setLoaded((prev) =>
        prev && prev.key === key
          ? { ...prev, posts: [...prev.posts, ...data.posts], hasMore: data.hasMore, page: next }
          : prev
      );
    } catch (err) {
      setFailure({ key, message: err instanceof Error ? err.message : "Couldn't load more plans" });
    } finally {
      setLoadingMore(false);
    }
  }

  function patchPost(id: string, patch: Partial<Post>) {
    setLoaded((prev) =>
      prev ? { ...prev, posts: prev.posts.map((p) => (p.id === id ? { ...p, ...patch } : p)) } : prev
    );
  }

  async function toggleLike(post: Post) {
    const isLiked = liked.has(post.id);

    // Optimistic: the count moves now, the server reconciles after.
    patchPost(post.id, { like_count: Math.max(0, post.like_count + (isLiked ? -1 : 1)) });
    setLikedId(post.id, !isLiked);

    try {
      const res = await fetch(`/api/posts/${post.id}/like`, {
        method: isLiked ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: getDeviceId() }),
      });
      const body = await res.json();
      if (res.ok && typeof body.likeCount === "number") {
        patchPost(post.id, { like_count: body.likeCount });
      }
    } catch {
      // Keep the optimistic value. The next load corrects it, and snapping
      // the number back mid-scroll reads worse than being briefly off.
    }
  }

  // --- swipe between tabs ---------------------------------------------
  const touch = useRef<{ x: number; y: number } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: React.TouchEvent) {
    const start = touch.current;
    touch.current = null;
    if (!start) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Horizontal intent only, or a vertical scroll would flip the tab.
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    const i = TABS.findIndex((x) => x.id === tab);
    const nextIndex = dx < 0 ? i + 1 : i - 1;
    if (nextIndex < 0 || nextIndex >= TABS.length) return;
    setParam((p) => p.set("tab", TABS[nextIndex].id));
  }

  const filtersActive = Boolean(roomType || band || styles.length);
  const posts = fresh?.posts ?? [];

  function clearFilters() {
    setParam((p) => {
      p.delete("roomType");
      p.delete("area");
      p.delete("style");
    });
  }

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="tabstrip -mx-4 mb-4 flex gap-1 overflow-x-auto px-4">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setParam((p) => p.set("tab", t.id))}
              aria-current={active ? "page" : undefined}
              className={`tb shrink-0 scroll-ml-4 whitespace-nowrap border-b-2 px-3 py-2 text-[12px] uppercase tracking-wider transition-colors ${
                active
                  ? "border-[var(--blueline)] text-[var(--ink)]"
                  : "border-transparent text-[var(--pencil)] hover:text-[var(--ink)]"
              }`}
              style={{ scrollSnapAlign: "start" }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <select
          value={roomType}
          onChange={(e) =>
            setParam((p) =>
              e.target.value ? p.set("roomType", e.target.value) : p.delete("roomType")
            )
          }
          aria-label="Room type"
          className="tb rounded-[2px] border border-[var(--rule)] bg-[var(--sheet)] px-2 py-1.5 text-[12px]"
        >
          <option value="">Any room</option>
          {ROOM_TYPES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <select
          value={band}
          onChange={(e) =>
            setParam((p) => (e.target.value ? p.set("area", e.target.value) : p.delete("area")))
          }
          aria-label="Room size"
          className="tb rounded-[2px] border border-[var(--rule)] bg-[var(--sheet)] px-2 py-1.5 text-[12px]"
        >
          <option value="">Any size</option>
          {AREA_BANDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>

        {STYLE_SUGGESTIONS.map((s) => {
          const on = styles.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() =>
                setParam((p) => {
                  const rest = styles.filter((x) => x !== s);
                  p.delete("style");
                  for (const x of on ? rest : [...rest, s]) p.append("style", x);
                })
              }
              aria-pressed={on}
              className={`tb rounded-full border px-3 py-1 text-[12px] transition-colors ${
                on
                  ? "border-[var(--blueline)] bg-[var(--blueline)] text-white"
                  : "border-[var(--rule)] bg-[var(--sheet)] text-[var(--pencil)] hover:text-[var(--ink)]"
              }`}
            >
              {s}
            </button>
          );
        })}

        {filtersActive && (
          <button
            type="button"
            onClick={clearFilters}
            className="tb px-2 py-1 text-[12px] text-[var(--blueline)] underline underline-offset-4"
          >
            Clear filters
          </button>
        )}

        {fresh && (
          <span className="tb ml-auto text-[11px] text-[var(--pencil)]">
            {fresh.total} {fresh.total === 1 ? "plan" : "plans"}
          </span>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-[2px] border border-[var(--stamp)] bg-white px-3 py-2 text-sm text-[var(--stamp)]">
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="sheet aspect-square animate-pulse rounded-[2px]" />
          ))}
        </div>
      ) : posts.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 lg:grid-cols-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              liked={liked.has(post.id)}
              onToggleLike={toggleLike}
            />
          ))}
        </div>
      ) : (
        <div className="sheet rounded-[2px] px-6 py-16 text-center">
          <p className="text-sm">
            {filtersActive
              ? "No plans match these filters."
              : tab === "foryou"
                ? "No plans yet. Scan a room and share it to start the set."
                : "Nothing posted in this window yet."}
          </p>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="tb mt-3 text-[12px] text-[var(--blueline)] underline underline-offset-4"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {fresh?.hasMore && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="tb rounded-[2px] border border-[var(--ink)] px-5 py-2 text-[12px] uppercase tracking-wider disabled:opacity-40"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
