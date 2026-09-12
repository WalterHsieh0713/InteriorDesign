import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Post } from "@/lib/postMetadata";
import { withRetry } from "@/lib/retry";
import { rankSimilar, type SimilarityTarget } from "@/lib/similarity";

/**
 * The feed. One table, no joins — everything it sorts and filters on was
 * snapshotted onto the post row at publish time.
 *
 *   GET /api/feed?tab=week&roomType=dorm&minArea=10&maxArea=40&style=cozy
 *
 * tab: foryou | today | week | month | all
 *   foryou   — filters applied, newest first
 *   the rest — most-liked within a time window
 */

export const TABS = ["foryou", "today", "week", "month", "all"] as const;
export type Tab = (typeof TABS)[number];

const WINDOW_HOURS: Record<Exclude<Tab, "foryou" | "all">, number> = {
  today: 24,
  week: 24 * 7,
  month: 24 * 30,
};

const PAGE_SIZE = 24;
const MAX_PAGE = 200;

function num(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const tabParam = sp.get("tab") ?? "foryou";
  const tab = (TABS as readonly string[]).includes(tabParam) ? (tabParam as Tab) : "foryou";

  const page = Math.min(Math.max(num(sp.get("page")) ?? 0, 0), MAX_PAGE);

  let query = supabaseAdmin()
    .from("posts")
    .select("*", { count: "exact" });

  // --- time window -----------------------------------------------------
  if (tab !== "foryou" && tab !== "all") {
    const since = new Date(Date.now() - WINDOW_HOURS[tab] * 3600_000).toISOString();
    query = query.gte("created_at", since);
  }

  // --- filters ---------------------------------------------------------
  const roomType = sp.get("roomType");
  if (roomType) query = query.eq("room_type", roomType);

  const minArea = num(sp.get("minArea"));
  if (minArea !== null) query = query.gte("area_m2", minArea);

  const maxArea = num(sp.get("maxArea"));
  if (maxArea !== null) query = query.lte("area_m2", maxArea);

  // Repeatable: ?style=cozy&style=minimal means "has all of these".
  const styles = sp.getAll("style").filter(Boolean);
  if (styles.length > 0) query = query.contains("style_tags", styles);

  const maxBudget = num(sp.get("maxBudget"));
  if (maxBudget !== null) query = query.lte("total_budget_cents", maxBudget);

  // --- ordering --------------------------------------------------------
  // For You is chronological; every other tab is a leaderboard. `id` breaks
  // ties so paging can't show the same row twice or skip one.
  if (tab === "foryou") {
    query = query.order("created_at", { ascending: false }).order("id", { ascending: false });
  } else {
    query = query.order("like_count", { ascending: false }).order("id", { ascending: false });
  }

  // Offset paging rather than a keyset cursor. A cursor on created_at can't
  // page a like_count ordering, and maintaining two paging modes for a feed
  // this size buys nothing. Revisit if it ever grows past a few thousand rows.
  const from = page * PAGE_SIZE;
  query = query.range(from, from + PAGE_SIZE - 1);

  const { data, error, count } = await withRetry(() => query);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let posts = (data ?? []) as Post[];
  const total = count ?? 0;

  // For You means "rooms like yours" when we know which room is yours —
  // the browser sends the session it published. We rank the page that was
  // already fetched rather than re-querying: reordering 24 rows the visitor
  // was going to see anyway costs nothing, where scoring the whole table
  // would. Anyone who has only browsed has no session and keeps recency.
  const mySession = sp.get("mySession");
  if (tab === "foryou" && mySession && posts.length > 1) {
    const { data: mine } = await withRetry(() =>
      supabaseAdmin()
        .from("posts")
        .select("room_type, area_m2, style_tags, object_count")
        .eq("session_id", mySession)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    );

    if (mine) {
      posts = rankSimilar(mine as SimilarityTarget, posts, posts.length);
    }
  }

  return NextResponse.json({
    posts,
    page,
    pageSize: PAGE_SIZE,
    total,
    hasMore: from + posts.length < total,
  });
}
