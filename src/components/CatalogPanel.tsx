"use client";

import { memo, useMemo, useState } from "react";
import Image from "next/image";
import { useEffect, useRef } from "react";
import { CATALOG, formatPrice, populatedCategories, searchCatalog } from "@/lib/catalog";
import { ATTRIBUTION, REPRESENTATIVE_MODEL_NOTE, type CatalogItem } from "@/lib/catalogItem";
import { drawPoster, POSTER_ART, POSTER_SIZES, type PosterArt, type PosterSize } from "@/lib/posters";
import type { LedPreset } from "@/lib/ledPresets";
import type { ObjectCategory } from "@/lib/roomLayoutSchema";

/**
 * Draws the real poster artwork at thumbnail scale.
 *
 * Same generator the 3D mesh uses, so what someone picks is exactly what lands
 * on the wall — a preview that disagrees with the result is worse than none.
 */
function PosterThumb({ art, size }: { art: PosterArt; size: PosterSize }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const canvas = drawPoster(art, size.width / size.height, 190);
    canvas.style.width = "100%";
    canvas.style.height = "auto";
    canvas.style.display = "block";
    canvas.style.borderRadius = "3px";
    el.replaceChildren(canvas);
  }, [art, size]);
  return <div ref={host} className="overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800" />;
}

// The rail is wide enough to read as a section switcher rather than an icon.
const RAIL_PX = 80;
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 260;
const MAX_WIDTH = 620;

type Props = {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  /** Non-null when a room object is selected — picking then swaps it. */
  swapTargetLabel: string | null;
  onPick: (item: CatalogItem) => void;
  onAddPoster: (art: PosterArt, size: PosterSize) => void;
  onAddLed: (preset: LedPreset) => void;
  /** Only the runs this room can actually hold — see availablePresets. */
  ledPresets: LedPreset[];
};

function CatalogPanel({ open, onClose, onOpen, swapTargetLabel, onPick, onAddPoster, onAddLed, ledPresets }: Props) {
  const [tab, setTab] = useState<"furniture" | "decor">("furniture");
  const [category, setCategory] = useState<ObjectCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [posterSize, setPosterSize] = useState<PosterSize>(POSTER_SIZES[1]);
  const categories = useMemo(() => populatedCategories(), []);

  const items = useMemo(() => {
    const base = query.trim() ? searchCatalog(query) : CATALOG;
    return category === "all" ? base : base.filter((i) => i.category === category);
  }, [category, query]);

  // Stays mounted so it can slide rather than blink into existence, and so a
  // half-typed search and a chosen category survive closing and reopening it.
  // Width is remembered per browser: someone who widens the catalog once
  // usually wants it that way next time too.
  // Read once at mount rather than in an effect, which would render the default
  // first and then jump. Safe from hydration mismatch because RoomScene renders
  // a loading state until the layout arrives, so this panel is never in the
  // server-rendered HTML.
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTH;
    try {
      const saved = Number(localStorage.getItem("catalogWidth"));
      if (Number.isFinite(saved) && saved >= MIN_WIDTH) return Math.min(saved, MAX_WIDTH);
    } catch {
      // Private windows and blocked storage both throw; the default is fine.
    }
    return DEFAULT_WIDTH;
  });
  const [dragging, setDragging] = useState(false);

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    setDragging(true);

    // Dragging left widens the panel, since it grows from the right edge.
    function onMove(ev: PointerEvent) {
      const next = Math.round(startWidth + (startX - ev.clientX));
      setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, next)));
    }
    function onUp() {
      setDragging(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setWidth((w) => {
        try { localStorage.setItem("catalogWidth", String(w)); } catch {}
        return w;
      });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Clicking the rail's current section closes the drawer; clicking the other
  // one switches to it without making you close and reopen.
  function railClick(next: "furniture" | "decor") {
    if (open && tab === next) onClose();
    else {
      setTab(next);
      if (!open) onOpen();
    }
  }

  return (
    <>
      {/* A permanent rail down the right edge, rather than one button lost in
          the middle of the bottom toolbar. The catalog is the thing people use
          most, so it gets a fixed, obvious home — and enough size to read as
          one. */}
      <div
        style={{ width: RAIL_PX }}
        className="absolute right-0 top-0 z-30 flex h-full flex-col items-center gap-3 border-l border-black/10 bg-white/95 py-4 backdrop-blur dark:border-white/10 dark:bg-neutral-900/95"
      >
        {([
          { id: "furniture" as const, glyph: "🛋", label: "Furniture" },
          { id: "decor" as const, glyph: "✦", label: "Decor" },
        ]).map((r) => {
          const active = open && tab === r.id;
          return (
            <button
              key={r.id}
              onClick={() => railClick(r.id)}
              aria-pressed={active}
              title={r.label}
              className={`flex w-[4.25rem] flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-[11px] font-semibold leading-tight transition ${
                active
                  ? "bg-blue-600 text-white shadow-md"
                  : "text-neutral-700 hover:bg-black/5 dark:text-neutral-200 dark:hover:bg-white/10"
              }`}
            >
              <span aria-hidden className="text-[26px] leading-none">{r.glyph}</span>
              {r.label}
            </button>
          );
        })}
      </div>

      <aside
        aria-hidden={!open}
        inert={!open ? true : undefined}
        style={{
          width,
          right: RAIL_PX,
          // Slide the panel AND the rail's width clear, so nothing peeks out.
          transform: open ? "translateX(0)" : `translateX(${width + RAIL_PX}px)`,
          // Dragging the handle should track the pointer exactly, not ease
          // behind it a fifth of a second late.
          transition: dragging ? "none" : undefined,
        }}
        className="absolute top-0 z-20 flex h-full max-w-[calc(100%-5rem)] flex-col border-l border-black/10 bg-white/95 shadow-2xl backdrop-blur transition-transform duration-200 ease-out motion-reduce:transition-none dark:border-white/10 dark:bg-neutral-900/95"
      >
        {/* Grab the edge to widen it. The panel covers the room it is meant to
            help you arrange, so how much room it takes has to be yours. */}
        <div
          onPointerDown={startResize}
          onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize catalog. Double-click to reset."
          title="Drag to resize · double-click to reset"
          className="group absolute left-0 top-0 z-10 h-full w-2 -translate-x-1/2 cursor-col-resize"
        >
          <span className="absolute left-1/2 top-1/2 h-16 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/15 transition group-hover:bg-blue-500 dark:bg-white/20" />
        </div>

      <header className="flex items-start justify-between gap-3 border-b border-black/10 p-4 dark:border-white/10">
        <div>
          <h2 className="text-sm font-semibold">Catalog</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            {swapTargetLabel ? `Replacing ${swapTargetLabel}` : "Adds to the middle of the room"}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close catalog"
          className="rounded px-2 py-1 text-lg leading-none text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10"
        >
          ×
        </button>
      </header>

      {tab === "decor" ? (
        <div className="flex-1 overflow-y-auto p-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Posters</h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            Goes on the nearest wall. Drag it up or down to hang it where you want.
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {POSTER_SIZES.map((s) => (
              <button
                key={s.id}
                onClick={() => setPosterSize(s)}
                aria-pressed={posterSize.id === s.id}
                className={`rounded-full px-2.5 py-0.5 text-[11px] ${
                  posterSize.id === s.id
                    ? "bg-blue-600 text-white"
                    : "bg-black/5 text-neutral-600 hover:bg-black/10 dark:bg-white/10 dark:text-neutral-300"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <ul className="mt-3 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
            {POSTER_ART.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => onAddPoster(a.id, posterSize)}
                  className="group w-full rounded-lg border border-black/10 p-2 text-left hover:border-blue-500 dark:border-white/10"
                >
                  <PosterThumb art={a.id} size={posterSize} />
                  <p className="mt-1.5 text-xs font-medium">{a.label}</p>
                  <p className="text-[10px] text-neutral-500">
                    {(posterSize.width * 100).toFixed(0)} × {(posterSize.height * 100).toFixed(0)} cm
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            LED strips
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            Each run follows the room. Move the desk and its strip follows.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {ledPresets.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => onAddLed(p)}
                  className="w-full rounded-lg border border-black/10 p-2.5 text-left hover:border-blue-500 dark:border-white/10"
                >
                  <p className="text-xs font-medium">{p.label}</p>
                  <p className="text-[11px] text-neutral-500">{p.description}</p>
                </button>
              </li>
            ))}
          </ul>
          {ledPresets.length < 4 && (
            <p className="mt-2 text-[10px] leading-relaxed text-neutral-400">
              Runs that need a desk or a bed appear once the room has one.
            </p>
          )}
        </div>
      ) : (
      <>
      <div className="border-b border-black/10 p-3 dark:border-white/10">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search furniture…"
          className="w-full rounded border border-black/15 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-white/15"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {(["all", ...categories] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c as ObjectCategory | "all")}
              className={`rounded-full px-2.5 py-0.5 text-xs capitalize ${
                category === c
                  ? "bg-blue-600 text-white"
                  : "bg-black/5 text-neutral-600 hover:bg-black/10 dark:bg-white/10 dark:text-neutral-300"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <p className="p-4 text-center text-sm text-neutral-500">Nothing matches that.</p>
        ) : (
          <ul className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
            {items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => onPick(item)}
                  className="group w-full rounded-lg border border-black/10 p-2 text-left transition hover:border-blue-500 hover:shadow-sm dark:border-white/10"
                >
                  <div
                    className="mb-2 flex aspect-square items-center justify-center overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800"
                    style={item.imageUrl ? undefined : { background: item.dominantHex }}
                  >
                    {/* Flat product photos on purpose: browsers cap live WebGL
                        contexts around 8-16, and a grid of 3D previews takes
                        the whole tab down mid-demo. */}
                    {item.imageUrl && (
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        width={160}
                        height={160}
                        className="h-full w-full object-contain transition group-hover:scale-105"
                      />
                    )}
                  </div>
                  <p className="truncate text-xs font-medium" title={item.name}>
                    {item.name}
                  </p>
                  <p className="mt-0.5 flex items-center justify-between text-xs text-neutral-500">
                    <span>{formatPrice(item.priceCents)}</span>
                    {!item.modelId && <span title="No 3D model — shown as a simple shape">▢</span>}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      </>
      )}

      <footer className="border-t border-black/10 p-3 text-[11px] leading-relaxed text-neutral-500 dark:border-white/10">
        <p>{REPRESENTATIVE_MODEL_NOTE}</p>
        <p className="mt-1">{ATTRIBUTION}</p>
        <p className="mt-1">Prices and links from IKEA US at build time.</p>
      </footer>
      </aside>
    </>
  );
}

export default memo(CatalogPanel);
