import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { RoomLayoutSchema } from "@/lib/roomLayoutSchema";
import { ROOM_TYPES, buildPostMetadata, normalizeStyleTags } from "@/lib/postMetadata";
import { withRetry } from "@/lib/retry";

/** Publish a design to the feed. */

const BodySchema = z.object({
  session: z.string().min(1),
  authorHandle: z.string().trim().min(1).max(24),
  caption: z.string().trim().max(280).optional(),
  roomType: z.enum(ROOM_TYPES),
  styleTags: z.array(z.string()).max(6).default([]),
});

export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { session, authorHandle, caption, roomType, styleTags } = parsed.data;
  const supabase = supabaseAdmin();

  // The design must exist and still be valid. Publishing a post that points
  // at a missing or malformed layout produces a card with a broken
  // thumbnail and no way to open it.
  const { data: room, error: roomError } = await withRetry(() =>
    supabase.from("rooms").select("layout").eq("session_id", session).maybeSingle()
  );

  if (roomError) {
    return NextResponse.json({ error: roomError.message }, { status: 500 });
  }
  if (!room) {
    return NextResponse.json(
      { error: "No design found for this session" },
      { status: 404 }
    );
  }

  const layout = RoomLayoutSchema.safeParse(room.layout);
  if (!layout.success) {
    return NextResponse.json(
      { error: "That design's layout failed validation and can't be posted" },
      { status: 422 }
    );
  }

  const meta = buildPostMetadata(layout.data, roomType, normalizeStyleTags(styleTags));

  const { data, error } = await withRetry(() =>
    supabase.from("posts").insert({
      session_id: session,
      author_handle: authorHandle,
      caption: caption || null,
      thumbnail_url: `/api/thumbnail/${encodeURIComponent(session)}`,
      room_type: meta.roomType,
      width_m: meta.widthM,
      length_m: meta.lengthM,
      area_m2: meta.areaM2,
      style_tags: meta.styleTags,
      total_budget_cents: meta.totalBudgetCents,
      object_count: meta.objectCount,
    })
      .select("id")
      .single()
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
