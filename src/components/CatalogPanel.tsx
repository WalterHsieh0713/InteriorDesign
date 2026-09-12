"use client";

import { memo, useMemo, useState } from "react";
import Image from "next/image";
import { CATALOG, formatPrice, populatedCategories, searchCatalog } from "@/lib/catalog";
import { ATTRIBUTION, REPRESENTATIVE_MODEL_NOTE, type CatalogItem } from "@/lib/catalogItem";
import type { ObjectCategory } from "@/lib/roomLayoutSchema";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Non-null when a room object is selected — picking then swaps it. */
  swapTargetLabel: string | null;
  onPick: (item: CatalogItem) => void;
};

function CatalogPanel({ open, onClose, swapTargetLabel, onPick }: Props) {
  const [category, setCategory] = useState<ObjectCategory | "all">("all");
  const [query, setQuery] = useState("");
  const categories = useMemo(() => populatedCategories(), []);

  const items = useMemo(() => {
    const base = query.trim() ? searchCatalog(query) : CATALOG;
    return category === "all" ? base : base.filter((i) => i.category === category);
  }, [category, query]);

  if (!open) return null;

  return (
    <aside className="absolute right-0 top-0 z-20 flex h-full w-full max-w-sm flex-col border-l border-black/10 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-neutral-900/95">
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

      <footer className="border-t border-black/10 p-3 text-[11px] leading-relaxed text-neutral-500 dark:border-white/10">
        <p>{REPRESENTATIVE_MODEL_NOTE}</p>
        <p className="mt-1">{ATTRIBUTION}</p>
        <p className="mt-1">Prices and links from IKEA US at build time.</p>
      </footer>
    </aside>
  );
}

export default memo(CatalogPanel);
