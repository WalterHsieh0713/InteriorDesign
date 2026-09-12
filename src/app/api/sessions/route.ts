import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeLayout } from "@/lib/normalizeLayout";

export type SessionSummary = {
  sessionId: string;
  width: number;
  length: number;
  height: number;
  areaM2: number;
  objectCount: number;
  /** True when the scan carried ARKit camera poses, so the room renders real photographed surfaces. */
  hasPhotos: boolean;
  updatedAt: string | null;
};

/**
 * Every room that has been scanned.
 *
 * Without this there is no way into the editor except knowing a session UUID by
 * heart: rooms existed in the database but nothing in the app could reach them.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from("rooms")
    .select("session_id, layout, updated_at")
    .order("updated_at", { ascending: false })
    .limit(60);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sessions: SessionSummary[] = [];
  for (const row of data ?? []) {
    // A room that cannot be parsed cannot be opened either, so leaving it out
    // of the list is honest rather than offering a link that lands on an error.
    const parsed = normalizeLayout(row.layout);
    if (!parsed.ok) continue;
    const { room, objects, cameraFrames } = parsed.layout;
    sessions.push({
      sessionId: row.session_id,
      width: room.width,
      length: room.length,
      height: room.height,
      areaM2: +(room.width * room.length).toFixed(1),
      objectCount: objects.length,
      hasPhotos: (cameraFrames?.length ?? 0) > 0,
      updatedAt: row.updated_at ?? null,
    });
  }

  return NextResponse.json({ sessions });
}
