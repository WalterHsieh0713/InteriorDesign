"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Comment } from "@/app/api/posts/[id]/comments/route";
import {
  getDeviceId,
  getHandleServerSnapshot,
  getHandleSnapshot,
  setHandle as persistHandle,
  subscribeHandle,
} from "@/lib/device";

/**
 * The conversation under a plan.
 *
 * A stamp says a plan is good; a comment says why, or asks how. That is the
 * difference between a gallery and somewhere people come back to.
 *
 * Attribution reuses the same handle the composer stores, so someone who has
 * posted before never retypes their name.
 */

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CommentThread({ postId, initialCount }: { postId: string; initialCount: number }) {
  const savedHandle = useSyncExternalStore(
    subscribeHandle,
    getHandleSnapshot,
    getHandleServerSnapshot
  );
  const [draftHandle, setDraftHandle] = useState<string | null>(null);
  const handle = draftHandle ?? savedHandle;

  const [comments, setComments] = useState<Comment[] | null>(null);
  const [body, setBody] = useState("");
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // setState only inside async callbacks, never in the effect body.
    fetch(`/api/posts/${postId}/comments?deviceId=${encodeURIComponent(getDeviceId())}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.comments)) setComments(data.comments);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      });

    return () => {
      cancelled = true;
    };
  }, [postId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!handle.trim()) {
      setError("Add a name so people know who is talking.");
      return;
    }
    if (!body.trim()) return;

    setBusy(true);
    setError(null);
    persistHandle(handle);

    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorHandle: handle.trim(),
          body: body.trim(),
          deviceId: getDeviceId(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't post that comment");

      setComments((prev) => [...(prev ?? []), data.comment]);
      if (typeof data.commentCount === "number") setCount(data.commentCount);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post that comment");
    } finally {
      setBusy(false);
    }
  }

  async function remove(commentId: string) {
    const previous = comments;
    setComments((prev) => (prev ?? []).filter((c) => c.id !== commentId));
    setCount((n) => Math.max(0, n - 1));

    try {
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId, deviceId: getDeviceId() }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (typeof data.commentCount === "number") setCount(data.commentCount);
    } catch {
      // Put it back rather than silently losing someone's words.
      setComments(previous);
      setCount((n) => n + 1);
      setError("Couldn't delete that comment");
    }
  }

  return (
    <section className="mt-10 border-t border-[var(--rule)] pt-6">
      <h2 className="tb text-[11px] uppercase tracking-wider text-[var(--pencil)]">
        {count === 0 ? "No comments yet" : `${count} ${count === 1 ? "comment" : "comments"}`}
      </h2>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start">
        <input
          value={handle}
          onChange={(e) => setDraftHandle(e.target.value)}
          placeholder="your name"
          maxLength={24}
          aria-label="Your name"
          className="w-full rounded-[2px] border border-[var(--rule)] bg-[var(--sheet)] px-3 py-2 text-sm sm:w-40 sm:shrink-0"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Ask how they fit it in, or say what works."
          maxLength={500}
          rows={2}
          aria-label="Your comment"
          className="w-full rounded-[2px] border border-[var(--rule)] bg-[var(--sheet)] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy || !body.trim()}
          className="tb shrink-0 rounded-full bg-[var(--amber)] px-5 py-2.5 text-[12px] uppercase tracking-wider text-[var(--on-amber)] transition-transform hover:-translate-y-px active:translate-y-0 disabled:translate-y-0 disabled:opacity-40"
        >
          {busy ? "Posting…" : "Post"}
        </button>
      </form>

      {error && (
        <p className="mt-2 text-sm text-[var(--stamp)]">{error}</p>
      )}

      <ul className="mt-6 flex flex-col gap-5">
        {comments === null ? (
          <li className="tb text-[12px] text-[var(--pencil)]">Loading comments…</li>
        ) : comments.length === 0 ? (
          <li className="text-sm text-[var(--pencil)]">
            Be the first to say something about this room.
          </li>
        ) : (
          comments.map((c) => (
            <li key={c.id}>
              <div className="tb flex items-baseline gap-2 text-[11px] text-[var(--pencil)]">
                <span className="text-[var(--ink)]">@{c.author_handle}</span>
                <span>{timeAgo(c.created_at)}</span>
                {c.mine && (
                  <button
                    type="button"
                    onClick={() => remove(c.id)}
                    className="ml-auto text-[var(--stamp)] underline underline-offset-2"
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{c.body}</p>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
