import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { withRetry } from "@/lib/retry";

/**
 * Comments on a plan.
 *
 *   GET    /api/posts/<id>/comments
 *   POST   /api/posts/<id>/comments   { authorHandle, body, deviceId }
 *   DELETE /api/posts/<id>/comments   { commentId, deviceId }
 *
 * Attribution is the same pseudonymous handle the rest of the social layer
 * uses. It is not an identity check and is not treated as one — anyone can
 * type any name. `device_id` is only used so a person can delete what they
 * wrote without an account.
 */

export type Comment = {
  id: string;
  author_handle: string;
  body: string;
  created_at: string;
  /** True when this browser wrote it, so the UI can offer a delete. */
  mine?: boolean;
};

const PostSchema = z.object({
  authorHandle: z.string().trim().min(1).max(24),
  body: z.string().trim().min(1).max(500),
  deviceId: z.string().trim().min(1).max(64),
});

const DeleteSchema = z.object({
  commentId: z.string().uuid(),
  deviceId: z.string().trim().min(1).max(64),
});

/** Recount rather than increment, so the counter can't drift from reality. */
async function syncCount(postId: string): Promise<number | null> {
  const supabase = supabaseAdmin();

  const { count, error } = await withRetry(() =>
    supabase
      .from("post_comments")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId)
      .eq("hidden", false)
  );

  if (error || count === null) return null;

  await withRetry(() => supabase.from("posts").update({ comment_count: count }).eq("id", postId));
  return count;
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/posts/[id]/comments">) {
  const { id } = await ctx.params;
  const deviceId = req.nextUrl.searchParams.get("deviceId");

  const { data, error } = await withRetry(() =>
    supabaseAdmin()
      .from("post_comments")
      .select("id, author_handle, body, created_at, device_id")
      .eq("post_id", id)
      .eq("hidden", false)
      .order("created_at", { ascending: true })
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // device_id never leaves the server — it would let anyone delete anyone
  // else's comment. It is collapsed to a boolean for the caller instead.
  const comments: Comment[] = (data ?? []).map((row) => ({
    id: row.id,
    author_handle: row.author_handle,
    body: row.body,
    created_at: row.created_at,
    mine: Boolean(deviceId) && row.device_id === deviceId,
  }));

  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/posts/[id]/comments">) {
  const { id } = await ctx.params;

  const parsed = PostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "A comment needs a name and some text.", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { authorHandle, body, deviceId } = parsed.data;

  const { data, error } = await withRetry(() =>
    supabaseAdmin()
      .from("post_comments")
      .insert({ post_id: id, author_handle: authorHandle, device_id: deviceId, body })
      .select("id, author_handle, body, created_at")
      .single()
  );

  if (error) {
    // 23503 is foreign_key_violation: the post is gone.
    const status = error.code === "23503" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  const commentCount = await syncCount(id);
  return NextResponse.json({ comment: { ...data, mine: true }, commentCount }, { status: 201 });
}

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/posts/[id]/comments">) {
  const { id } = await ctx.params;

  const parsed = DeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing commentId or deviceId" }, { status: 400 });
  }

  const { commentId, deviceId } = parsed.data;

  // Matching on device_id is what makes this "delete your own": a request
  // carrying someone else's comment id simply matches no rows.
  const { error } = await withRetry(() =>
    supabaseAdmin()
      .from("post_comments")
      .delete()
      .eq("id", commentId)
      .eq("post_id", id)
      .eq("device_id", deviceId)
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const commentCount = await syncCount(id);
  return NextResponse.json({ ok: true, commentCount });
}
