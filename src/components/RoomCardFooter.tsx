"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The footer of one room card on /rooms: its id, its age, and the control that
 * deletes it.
 *
 * It owns the whole footer rather than just the button because confirming
 * takes the row over — a warning worth reading does not fit beside a truncated
 * UUID, and the id and timestamp are not what you are looking at in the moment
 * you are deciding to delete something.
 *
 * Two-step rather than a modal: this sits in a grid of up to 60 cards, and
 * interrupting the page to confirm one row costs more attention than the action
 * is worth.
 *
 * Deleting removes the `rooms` row and nothing else — see the DELETE handler in
 * /api/layout for what deliberately survives.
 */

function IconTrash({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.9 4.4h10.2" />
      <path d="M6.4 4.4V3.1a.9.9 0 0 1 .9-.9h1.4a.9.9 0 0 1 .9.9v1.3" />
      <path d="M4.2 4.4l.5 8a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.5-8" />
      <path d="M6.8 6.9v3.8M9.2 6.9v3.8" />
    </svg>
  );
}

export function RoomCardFooter({
  session,
  published,
  age,
}: {
  session: string;
  /** Whether this room has a post on the feed, which deletion will break. */
  published: boolean;
  /** Pre-formatted on the server, so the client never re-derives "now". */
  age: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/layout?session=${encodeURIComponent(session)}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Could not delete this room");
      // The list is a server component, so this re-runs its query rather than
      // patching a local copy — no chance of the grid disagreeing with the
      // database about what still exists.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this room");
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <div className="flex items-center gap-3 border-t border-[var(--line-soft)] py-2 pl-5 pr-3.5">
        <span className="tb text-[11px] text-[var(--fg-2)]">{session.slice(0, 8)}</span>
        <span className="tb ml-auto text-[11px] text-[var(--fg-2)]">{age}</span>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete room ${session.slice(0, 8)}`}
          title="Delete this room"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--fg-2)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] hover:text-[var(--danger)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--danger)]"
        >
          <IconTrash className="h-[15px] w-[15px]" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--line-soft)] py-2.5 pl-5 pr-3.5">
      <p className="tb min-w-0 flex-1 basis-full text-[11px] leading-relaxed sm:basis-auto">
        {error ? (
          <span className="text-[var(--danger)]">{error}</span>
        ) : published ? (
          <span className="text-[var(--fg-2)]">
            Delete? Its feed post stays, but loses its plan and 3D link.
          </span>
        ) : (
          <span className="text-[var(--fg-2)]">Delete this room?</span>
        )}
      </p>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={busy}
          className="tb rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--fg-2)] transition-colors hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber)] disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="tb rounded-full bg-[var(--danger)] px-3.5 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--ground)] transition-transform hover:-translate-y-px active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--danger)] disabled:translate-y-0 disabled:opacity-50"
        >
          {busy ? "Deleting…" : error ? "Retry" : "Delete"}
        </button>
      </div>
    </div>
  );
}
