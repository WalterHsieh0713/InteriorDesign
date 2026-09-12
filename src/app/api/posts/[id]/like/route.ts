import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Like or unlike a post.
 *
 *   POST   /api/posts/<id>/like   { deviceId }
 *   DELETE /api/posts/<id>/like   { deviceId }
 *
 * `post_likes` has a composite primary key on (post_id, device_id), so a
 * duplicate like is a database constraint violation rather than something
 * this handler has to check for. `posts.like_count` is a denormalized
 * counter kept in step here.
 */

async function readDeviceId(req: NextRequest): Promise<string | null> {
  const body = await req.json().catch(() => null);
  const id = body?.deviceId;
  return typeof id === "string" && id.trim() ? id.trim().slice(0, 64) : null;
}

/** Recount from post_likes rather than incrementing, so the counter can't drift. */
async function syncCount(postId: string): Promise<number | null> {
  const supabase = supabaseAdmin();

  const { count, error } = await supabase
    .from("post_likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", postId);

  if (error || count === null) return null;

  await supabase.from("posts").update({ like_count: count }).eq("id", postId);
  return count;
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/posts/[id]/like">) {
  const { id } = await ctx.params;
  const deviceId = await readDeviceId(req);

  if (!deviceId) {
    return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });
  }

  const { error } = await supabaseAdmin()
    .from("post_likes")
    .insert({ post_id: id, device_id: deviceId });

  // 23505 is unique_violation: this device already liked this post. That's
  // the desired end state, so report success rather than an error.
  if (error && error.code !== "23505") {
    const status = error.code === "23503" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  const likeCount = await syncCount(id);
  return NextResponse.json({ liked: true, likeCount });
}

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/posts/[id]/like">) {
  const { id } = await ctx.params;
  const deviceId = await readDeviceId(req);

  if (!deviceId) {
    return NextResponse.json({ error: "Missing deviceId" }, { status: 400 });
  }

  const { error } = await supabaseAdmin()
    .from("post_likes")
    .delete()
    .eq("post_id", id)
    .eq("device_id", deviceId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const likeCount = await syncCount(id);
  return NextResponse.json({ liked: false, likeCount });
}
