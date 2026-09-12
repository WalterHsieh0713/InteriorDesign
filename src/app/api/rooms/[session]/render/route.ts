import { NextRequest, NextResponse } from "next/server";
import { PHOTOS_BUCKET, supabaseAdmin } from "@/lib/supabaseAdmin";
import { withRetry } from "@/lib/retry";

/**
 * Stores the editor's isometric snapshot for a room, taken from the same
 * fixed camera angle every time (see `initialCameraPosition` in
 * RoomScene.tsx). Called right before the Share link navigates, so the
 * resulting URL is ready by the time /api/posts reads `rooms.render_url`.
 */

const DATA_URL_PREFIX = "data:image/png;base64,";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/rooms/[session]/render">) {
  const { session } = await ctx.params;
  const body = await req.json().catch(() => null);
  const dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : null;

  if (!dataUrl || !dataUrl.startsWith(DATA_URL_PREFIX)) {
    return NextResponse.json({ error: "Expected a PNG data URL" }, { status: 400 });
  }

  const bytes = Buffer.from(dataUrl.slice(DATA_URL_PREFIX.length), "base64");
  const path = `renders/${encodeURIComponent(session)}.png`;

  const supabase = supabaseAdmin();
  const { error: uploadError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(path, bytes, { contentType: "image/png", upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: pub } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
  // Cache-bust: the path is stable across re-shares, but the pixels change
  // every time, and a public URL with no query string sticks in the CDN/
  // browser cache and shows the previous angle after a re-share.
  const url = `${pub.publicUrl}?t=${Date.now()}`;

  const { error: dbError } = await withRetry(() =>
    supabase.from("rooms").update({ render_url: url }).eq("session_id", session)
  );

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ url });
}
