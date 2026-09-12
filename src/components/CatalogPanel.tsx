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

type Props = {
  open: boolean;
  onClose: () => void;
  /** Non-null when a room object is selected — picking then swaps it. */
  swapTargetLabel: string | null;
  onPick: (item: CatalogItem) => void;
  onAddPoster: (art: PosterArt, size: PosterSize) => void;
  onAddLed: (preset: LedPreset) => void;
  /** Only the runs this room can actually hold — see availablePresets. */
  ledPresets: LedPreset[];
};

function CatalogPanel({ open, onClose, swapTargetLabel, onPick, onAddPoster, onAddLed, ledPresets }: Props) {
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
  return (
    <aside
      aria-hidden={!open}
      inert={!open ? true : undefined}
      className={`absolute right-0 top-0 z-20 flex h-full w-full max-w-sm flex-col border-l border-black/10 bg-white/95 backdrop-blur transition-transform duration-200 ease-out motion-reduce:transition-none dark:border-white/10 dark:bg-neutral-900/95 ${
        open ? "translate-x-0 shadow-2xl" : "pointer-events-none translate-x-full"
      }`}
    >
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

      <div className="flex gap-1 border-b border-black/10 px-3 pt-3 dark:border-white/10">
        {(["furniture", "decor"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`flex-1 rounded-t px-3 py-1.5 text-xs capitalize ${
              tab === t
                ? "border-b-2 border-blue-600 font-medium text-blue-700 dark:text-blue-400"
                : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

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
          <ul className="mt-3 grid grid-cols-2 gap-3">
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
          <ul className="grid grid-cols-2 gap-3">
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
  );
}

export default memo(CatalogPanel);
