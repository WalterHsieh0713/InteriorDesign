"use client";

import { useEffect, useRef, useState } from "react";
import { ROOM_TYPES, STYLE_SUGGESTIONS } from "@/lib/postMetadata";

/**
 * Filters, behind one button.
 *
 * They used to sit inline across the top of the feed: two selects, seven
 * style chips and a clear link, wrapping onto three rows on a phone and
 * crowding the plans they were meant to help you find. Collapsed to a
 * single control with a count, the feed header is one line and there is
 * room to add facets later without re-cramming it.
 */

export const AREA_BANDS = [
  { id: "s", label: "Under 20 m²", min: undefined, max: 20 },
  { id: "m", label: "20–50 m²", min: 20, max: 50 },
  { id: "l", label: "50–80 m²", min: 50, max: 80 },
  { id: "xl", label: "Over 80 m²", min: 80, max: undefined },
] as const;

export function FilterPanel({
  roomType,
  band,
  styles,
  onRoomType,
  onBand,
  onToggleStyle,
  onClear,
}: {
  roomType: string;
  band: string;
  styles: string[];
  onRoomType: (value: string) => void;
  onBand: (value: string) => void;
  onToggleStyle: (tag: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  const activeCount = (roomType ? 1 : 0) + (band ? 1 : 0) + styles.length;

  // Light dismiss: click anywhere outside, or press Escape.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`tb flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] uppercase tracking-wider transition-colors ${
          activeCount > 0 || open
            ? "border-[var(--amber)] bg-[var(--amber)] text-[var(--on-amber)]"
            : "border-[var(--rule)] bg-[var(--sheet)] text-[var(--ink)] hover:border-[var(--ink)]"
        }`}
      >
        Filters
        {activeCount > 0 && (
          <span
            className="rounded-full bg-[var(--ground)] px-1.5 text-[10px] text-[var(--fg)]"
            aria-label={`${activeCount} active`}
          >
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Filter plans"
          /* Anchored under the button on desktop; a bottom sheet on a phone,
             where a floating panel would sit off the edge of the screen. */
          className="fixed inset-x-0 bottom-0 z-50 max-h-[75vh] overflow-y-auto border-t border-[var(--rule)] bg-[var(--sheet)] p-4 shadow-[0_-8px_30px_-12px_rgb(18_32_58/0.35)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 sm:w-80 sm:rounded-2xl sm:border sm:shadow-[0_10px_30px_-12px_rgb(18_32_58/0.35)]"
        >
          <div className="mb-4 flex items-center justify-between sm:hidden">
            <span className="tb text-[12px] uppercase tracking-wider">Filters</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="tb text-[12px] text-[var(--pencil)]"
            >
              Done
            </button>
          </div>

          <label className="tb block text-[11px] uppercase tracking-wider text-[var(--pencil)]">
            Room
          </label>
          <select
            value={roomType}
            onChange={(e) => onRoomType(e.target.value)}
            className="tb mt-1 w-full rounded-lg border border-[var(--rule)] bg-[var(--ground)] px-3 py-2.5 text-[12px] text-[var(--fg)]"
          >
            <option value="">Any room</option>
            {ROOM_TYPES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          <label className="tb mt-4 block text-[11px] uppercase tracking-wider text-[var(--pencil)]">
            Size
          </label>
          <select
            value={band}
            onChange={(e) => onBand(e.target.value)}
            className="tb mt-1 w-full rounded-lg border border-[var(--rule)] bg-[var(--ground)] px-3 py-2.5 text-[12px] text-[var(--fg)]"
          >
            <option value="">Any size</option>
            {AREA_BANDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>

          <span className="tb mt-4 block text-[11px] uppercase tracking-wider text-[var(--pencil)]">
            Style
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {STYLE_SUGGESTIONS.map((s) => {
              const on = styles.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onToggleStyle(s)}
                  aria-pressed={on}
                  className={`tb rounded-full border px-3 py-1 text-[12px] transition-colors ${
                    on
                      ? "border-[var(--amber)] bg-[var(--amber)] text-[var(--on-amber)]"
                      : "border-[var(--rule)] bg-[var(--sheet)] text-[var(--pencil)] hover:text-[var(--ink)]"
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>

          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="tb mt-4 text-[12px] text-[var(--blueline)] underline underline-offset-4"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
