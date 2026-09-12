import type { RoomLayout } from "./roomLayoutSchema";
import { CATALOG_BY_ID } from "./catalog";

/**
 * What someone would actually have to buy to make the room on screen real.
 *
 * Only things being bought appear: furniture the scan already found is
 * excluded, because it is already in the room and has no price.
 */
export type LineItem = {
  /** Groups identical things together — the same desk placed twice is one line, qty 2. */
  key: string;
  name: string;
  quantity: number;
  /** Null for something with no known price, which is shown as "price?" rather than $0. */
  unitPriceCents: number | null;
  url: string | null;
  /** Every object this line stands for, so a corrected price can be written back to all of them. */
  objectIds: string[];
  /** True when the price came from the catalog rather than being typed in. */
  fromCatalog: boolean;
};

type Obj = RoomLayout["objects"][number];

export function buildShoppingList(objects: Obj[]): LineItem[] {
  const lines = new Map<string, LineItem>();

  for (const obj of objects) {
    if (obj.binding.source === "owned") continue;

    let key: string;
    let name: string;
    let unitPriceCents: number | null;
    let url: string | null;
    let fromCatalog = false;

    if (obj.binding.source === "catalog") {
      const item = CATALOG_BY_ID.get(obj.binding.catalogItemId);
      key = obj.binding.catalogItemId;
      name = item?.name ?? obj.category;
      // The binding's price wins over the catalog's: it is what was snapshotted
      // when this was placed, and it is what a correction edits.
      unitPriceCents = obj.binding.priceCents;
      url = obj.binding.url;
      fromCatalog = true;
    } else {
      key = obj.binding.label;
      name = obj.binding.label;
      unitPriceCents = obj.binding.priceCents;
      url = obj.binding.url;
    }

    const existing = lines.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.objectIds.push(obj.id);
    } else {
      lines.set(key, { key, name, quantity: 1, unitPriceCents, url, objectIds: [obj.id], fromCatalog });
    }
  }

  // Priced things first and dearest at the top, since that is the order someone
  // scanning a budget cares about; unpriced lines sink to the bottom where they
  // read as work still to do.
  return [...lines.values()].sort((a, b) => {
    const av = a.unitPriceCents == null ? -1 : a.unitPriceCents * a.quantity;
    const bv = b.unitPriceCents == null ? -1 : b.unitPriceCents * b.quantity;
    return bv - av;
  });
}

export function lineTotal(line: LineItem): number | null {
  return line.unitPriceCents == null ? null : line.unitPriceCents * line.quantity;
}

/** Total of everything with a known price. */
export function listTotal(lines: LineItem[]): number {
  return lines.reduce((sum, l) => sum + (lineTotal(l) ?? 0), 0);
}

/** How many lines still have no price, so the total can say it is incomplete. */
export function unpricedCount(lines: LineItem[]): number {
  return lines.filter((l) => l.unitPriceCents == null).length;
}

/**
 * Parse a typed price into cents.
 *
 * Accepts "24", "24.99", "$24.99", "  24.99  ". Returns null for anything that
 * isn't a sensible price, so a typo leaves the old value alone rather than
 * silently zeroing it.
 */
export function parsePrice(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned) * 100);
  return Number.isFinite(cents) && cents >= 0 ? cents : null;
}
