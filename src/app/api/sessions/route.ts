import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  isRoomSort,
  sortSessions,
  summarizeRoom,
  type SessionSummary,
} from "@/lib/sessionSummary";

// Re-exported so existing importers keep working; the type lives in the lib
// now, alongside the one function that builds it.
export type { SessionSummary };

/**
 * Every room that has been scanned.
 *
 * Without this there is no way into the editor except knowing a session UUID by
 * heart: rooms existed in the database but nothing in the app could reach them.
 *
 *   GET /api/sessions?sort=recent|budget
 */
export async function GET(req: Request) {
  const sortParam = new URL(req.url).searchParams.get("sort") ?? undefined;
  const sort = isRoomSort(sortParam) ? sortParam : "recent";

  const { data, error } = await supabaseAdmin()
    .from("rooms")
    .select("session_id, layout, updated_at")
    .order("updated_at", { ascending: false })
    .limit(60);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sorted in TypeScript rather than SQL: cost comes from walking each
  // layout's bindings through the shopping list, which Postgres cannot do
  // without reaching into jsonb. At 60 rows that is not a tradeoff worth
  // thinking about.
  const sessions = (data ?? [])
    .map(summarizeRoom)
    .filter((s): s is SessionSummary => s !== null);

  return NextResponse.json({ sessions: sortSessions(sessions, sort), sort });
}
