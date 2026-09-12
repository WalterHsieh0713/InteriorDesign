"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/catalog";
import {
  lineTotal,
  listTotal,
  parsePrice,
  unpricedCount,
  type LineItem,
} from "@/lib/shoppingList";

/**
 * The shopping list that comes out of a finished design.
 *
 * Prices are editable because catalog prices go stale and some things arrive
 * with no price at all. A correction writes back to every object on that line,
 * so the room's running total and anything published afterwards agree with what
 * the person actually saw.
 */
export default function ShoppingList({
  lines,
  onPriceChange,
}: {
  lines: LineItem[];
  onPriceChange: (line: LineItem, cents: number) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [bad, setBad] = useState(false);

  const total = listTotal(lines);
  const missing = unpricedCount(lines);

  function begin(line: LineItem) {
    setEditing(line.key);
    setDraft(line.unitPriceCents == null ? "" : (line.unitPriceCents / 100).toFixed(2));
    setBad(false);
  }
  function commit(line: LineItem) {
    const cents = parsePrice(draft);
    if (cents == null) {
      setBad(true);
      return;
    }
    onPriceChange(line, cents);
    setEditing(null);
    setBad(false);
  }

  if (lines.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-sm text-neutral-500">
        Nothing added yet — everything in this room came from the scan.
      </p>
    );
  }

  return (
    <div>
      <ul className="flex flex-col divide-y divide-black/10 dark:divide-white/10">
        {lines.map((line) => {
          const isEditing = editing === line.key;
          const lt = lineTotal(line);
          return (
            <li key={line.key} className="flex items-center gap-3 py-2">
              <span className="w-7 shrink-0 text-center text-xs font-medium tabular-nums text-neutral-500">
                {line.quantity}&times;
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm" title={line.name}>
                  {line.name}
                </span>
                {line.url ? (
                  <a
                    href={line.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                  >
                    View product
                  </a>
                ) : (
                  <span className="text-xs text-neutral-400">No link</span>
                )}
              </span>

              {isEditing ? (
                <span className="flex shrink-0 items-center gap-1">
                  <input
                    id={`price-${line.key}`}
                    autoFocus
                    inputMode="decimal"
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setBad(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commit(line);
                      if (e.key === "Escape") setEditing(null);
                    }}
                    aria-label={`Price for ${line.name}`}
                    aria-invalid={bad}
                    className={`w-20 rounded border bg-transparent px-1.5 py-1 text-right text-sm tabular-nums outline-none ${
                      bad ? "border-red-500" : "border-blue-500"
                    }`}
                  />
                  <button
                    onClick={() => commit(line)}
                    className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white"
                  >
                    Save
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => begin(line)}
                  title="Click to correct this price"
                  className="shrink-0 rounded px-2 py-1 text-right text-sm tabular-nums hover:bg-black/5 dark:hover:bg-white/10"
                >
                  {lt == null ? (
                    <span className="text-amber-600 dark:text-amber-500">Add price</span>
                  ) : (
                    <>
                      <span className="font-medium">{formatPrice(lt)}</span>
                      {line.quantity > 1 && (
                        <span className="block text-[10px] text-neutral-500">
                          {formatPrice(line.unitPriceCents!)} each
                        </span>
                      )}
                    </>
                  )}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {bad && (
        <p className="pt-1 text-xs text-red-600">
          That is not a price. Use digits and at most two decimals, like 24.99.
        </p>
      )}

      <div className="mt-2 flex items-baseline justify-between border-t-2 border-black/15 pt-2 dark:border-white/15">
        <span className="text-sm font-medium">Total</span>
        <span className="text-lg font-semibold tabular-nums">{formatPrice(total)}</span>
      </div>
      {missing > 0 && (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-500">
          {missing === 1 ? "One item has" : `${missing} items have`} no price yet, so this total is
          low. Click <b>Add price</b> to fill them in.
        </p>
      )}
    </div>
  );
}
