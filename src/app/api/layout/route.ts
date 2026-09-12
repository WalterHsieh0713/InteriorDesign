import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { normalizeLayout } from "@/lib/normalizeLayout";

export async function GET(req: NextRequest) {
  const session = req.nextUrl.searchParams.get("session");
  if (!session) {
    return NextResponse.json({ error: "Missing session" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("rooms")
    .select("layout")
    .eq("session_id", session)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "No layout for this session" }, { status: 404 });
  }

  // Never hand back the raw JSONB. Rows predate fields that now have defaults,
  // and a zod default only applies to something that was parsed — so returning
  // the stored object straight through gives the editor objects with no
  // `binding` at all, and every reader of `obj.binding.source` throws.
  const normalized = normalizeLayout(data.layout);
  if (!normalized.ok) {
    return NextResponse.json(
      { error: "Stored layout does not match the schema", details: normalized.issues },
      { status: 422 }
    );
  }
  if (normalized.changed.length > 0) {
    // Worth seeing in logs: it means the scanner is off-contract, even though
    // we accepted it. See SCANNER_CONTRACT.md.
    console.warn(`layout ${session}: normalized ${normalized.changed.length} field(s)`, normalized.changed.slice(0, 8));
  }

  return NextResponse.json(normalized.layout);
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const session = body?.session;

  if (typeof session !== "string" || !session) {
    return NextResponse.json({ error: "Missing session" }, { status: 400 });
  }

  // Normalise on the way in as well, so a room the editor could open is a room
  // the editor can save. Validating more strictly on write than on read would
  // mean dragging a chair in a real scanned room failed with a 400.
  const result = normalizeLayout(body?.layout);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Invalid layout", details: result.issues },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin()
    .from("rooms")
    .upsert({ session_id: session, layout: result.layout, updated_at: new Date().toISOString() });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Delete a scanned room.
 *
 *   DELETE /api/layout?session=<id>
 *
 * Removes the `rooms` row and nothing else, deliberately:
 *
 * - **Photos stay.** Anything uploaded under `room-photos/<session>/` is left
 *   in Storage. Other layouts' `cameraFrames` can hold URLs into that folder,
 *   and orphaned bytes are a cheaper problem than a layout that renders grey
 *   because its projection source vanished.
 * - **Posts stay.** `posts.session_id` is deliberately not a foreign key —
 *   posts outlive designs (see SOCIAL_PLAN.md), so deleting a room must not
 *   cascade away someone's stamps and comments. The cost is that a post for a
 *   deleted room keeps its row while `/api/thumbnail/<session>` starts 404ing
 *   and "Open in 3D" lands on the editor's not-found state. `/rooms` marks
 *   published rooms and says so before you confirm.
 *
 * There is no auth on this route, which matches every other route in this app
 * — but this is the first one that destroys data, so see the note in
 * EDITOR_INTEGRATION.md before this is exposed anywhere that matters.
 */
export async function DELETE(req: NextRequest) {
  const session = req.nextUrl.searchParams.get("session");

  if (!session) {
    return NextResponse.json({ error: "Missing session" }, { status: 400 });
  }

  // `count: "exact"` is what separates "deleted it" from "it was never there",
  // which a bare delete cannot tell you — Postgres reports success either way.
  const { error, count } = await supabaseAdmin()
    .from("rooms")
    .delete({ count: "exact" })
    .eq("session_id", session);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "No layout for this session" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, session });
}
