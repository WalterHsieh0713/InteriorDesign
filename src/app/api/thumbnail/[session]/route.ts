import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { RoomLayoutSchema } from "@/lib/roomLayoutSchema";
import { floorPlanSvg } from "@/lib/floorPlan";
import { withRetry } from "@/lib/retry";

/**
 * Top-down floor plan for a design, as an SVG image.
 *
 * Generated per request rather than baked at publish time. An SVG plan is a
 * few KB of string building, so there is nothing to gain from storing it,
 * and a live plan keeps matching the design after the owner rearranges it.
 * `posts.thumbnail_url` still holds a URL, so a real 3D capture can replace
 * this later without touching the feed.
 */

export async function GET(_req: Request, ctx: RouteContext<"/api/thumbnail/[session]">) {
  const { session } = await ctx.params;

  const { data, error } = await withRetry(() =>
    supabaseAdmin().from("rooms").select("layout").eq("session_id", session).maybeSingle()
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "No layout for this session" }, { status: 404 });
  }

  const parsed = RoomLayoutSchema.safeParse(data.layout);
  if (!parsed.success) {
    return NextResponse.json({ error: "Stored layout failed validation" }, { status: 422 });
  }

  return new NextResponse(floorPlanSvg(parsed.data), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Short cache: the plan tracks a layout that can change at any time,
      // but a feed scroll shouldn't re-render the same plan forty times.
      "Cache-Control": "public, max-age=60, stale-while-revalidate=600",
    },
  });
}
