"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ROOM_TYPES, STYLE_SUGGESTIONS, type RoomType } from "@/lib/postMetadata";
import {
  getHandleServerSnapshot,
  getHandleSnapshot,
  setHandle as persistHandle,
  setMySession,
  subscribeHandle,
} from "@/lib/device";

/**
 * Publish a scanned design to the feed.
 *
 * Room type is asked rather than inferred: no scan can tell a dorm from a
 * studio, and it is the filter people actually reach for first.
 */
export function ShareComposer({ session }: { session: string }) {
  const router = useRouter();

  // The saved handle comes from localStorage through an external store, and
  // `draft` holds edits made this visit. Copying storage into state inside
  // an effect would cascade a render on mount for no benefit.
  const savedHandle = useSyncExternalStore(
    subscribeHandle,
    getHandleSnapshot,
    getHandleServerSnapshot
  );
  const [draftHandle, setDraftHandle] = useState<string | null>(null);
  const handle = draftHandle ?? savedHandle;

  const [caption, setCaption] = useState("");
  const [roomType, setRoomType] = useState<RoomType>("bedroom");
  const [styles, setStyles] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleStyle(tag: string) {
    setStyles((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : prev.length < 3 ? [...prev, tag] : prev
    );
  }

  async function publish() {
    if (!handle.trim()) {
      setError("Pick a name to post under.");
      return;
    }

    setSubmitting(true);
    setError(null);
    persistHandle(handle);
    // Remember whose room this is, so For You can rank by resemblance to it.
    setMySession(session);

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session,
          authorHandle: handle.trim(),
          caption: caption.trim() || undefined,
          roomType,
          styleTags: styles,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't publish this plan");
      router.push(`/p/${body.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't publish this plan");
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,320px)_1fr]">
      <div>
        <div className="sheet rounded-[2px] p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/thumbnail/${encodeURIComponent(session)}`}
            alt="Floor plan of the design you're about to share"
            className="aspect-square w-full bg-[var(--paper)] object-contain"
          />
        </div>
        <p className="tb mt-2 text-[11px] text-[var(--pencil)]">
          Plan generated from your scan. It updates if you rearrange the room.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <div>
          <label htmlFor="handle" className="tb block text-[11px] uppercase tracking-wider text-[var(--pencil)]">
            Post as
          </label>
          <input
            id="handle"
            value={handle}
            onChange={(e) => setDraftHandle(e.target.value)}
            placeholder="your name"
            maxLength={24}
            className="mt-1 w-full max-w-xs rounded-[2px] border border-[var(--rule)] bg-[var(--sheet)] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="caption" className="tb block text-[11px] uppercase tracking-wider text-[var(--pencil)]">
            Caption
          </label>
          <textarea
            id="caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="What should people notice about this room?"
            maxLength={280}
            rows={3}
            className="mt-1 w-full rounded-[2px] border border-[var(--rule)] bg-[var(--sheet)] px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="roomType" className="tb block text-[11px] uppercase tracking-wider text-[var(--pencil)]">
            Room type
          </label>
          <select
            id="roomType"
            value={roomType}
            onChange={(e) => setRoomType(e.target.value as RoomType)}
            className="tb mt-1 rounded-[2px] border border-[var(--rule)] bg-[var(--sheet)] px-2 py-2 text-[13px]"
          >
            {ROOM_TYPES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="tb block text-[11px] uppercase tracking-wider text-[var(--pencil)]">
            Style — up to 3
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {STYLE_SUGGESTIONS.map((tag) => {
              const on = styles.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleStyle(tag)}
                  aria-pressed={on}
                  className={`tb rounded-full border px-3 py-1 text-[12px] transition-colors ${
                    on
                      ? "border-[var(--amber)] bg-[var(--amber)] text-[var(--on-amber)]"
                      : "border-[var(--rule)] bg-[var(--sheet)] text-[var(--pencil)] hover:text-[var(--ink)]"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <p className="rounded-xl border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={publish}
            disabled={submitting}
            className="tb rounded-full bg-[var(--amber)] px-6 py-3 text-[12px] uppercase tracking-wider text-[var(--on-amber)] transition-transform hover:-translate-y-px active:translate-y-0 disabled:translate-y-0 disabled:opacity-40"
          >
            {submitting ? "Publishing…" : "Publish to feed"}
          </button>
          <Link href="/feed" className="tb text-[12px] text-[var(--blueline)] underline underline-offset-4">
            Browse plans instead
          </Link>
        </div>
      </div>
    </div>
  );
}
