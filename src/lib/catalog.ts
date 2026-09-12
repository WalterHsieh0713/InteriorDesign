import { CatalogItemSchema, type CatalogItem } from "./catalogItem";
import { GENERATED_ITEMS } from "./catalog.generated";
import { ACCESSORY_ITEMS } from "./catalog.accessories";
import { IKEA_ITEMS } from "./catalog.ikea";
import { IKEA_MODEL_URLS } from "./ikeaModels.generated";
import { MANUAL_ITEMS } from "./catalog.manual";
import type { ItemBinding, ObjectCategory } from "./roomLayoutSchema";

// Hand-authored items win over generated ones with the same id — that is how a
// bad auto-built row gets corrected without editing generated output.
/**
 * Later sources overwrite earlier ones, so this order is a trust ranking.
 *
 * `IKEA_ITEMS` beat the search-API rows because their dimensions are measured
 * from IKEA's own 3D model rather than inferred from an ambiguous two-number
 * summary. `MANUAL_ITEMS` beat even those: a number a person read off the
 * Measurements tab is IKEA stating the product's size, where a bounding box can
 * include an overhanging cushion or a splayed leg.
 */
function merge(): CatalogItem[] {
  const byId = new Map<string, CatalogItem>();
  for (const item of GENERATED_ITEMS) byId.set(item.id, item);
  for (const item of IKEA_ITEMS) byId.set(item.id, item);
  for (const item of ACCESSORY_ITEMS) byId.set(item.id, item);
  for (const item of MANUAL_ITEMS) byId.set(item.id, item);

  // One field does NOT follow that ranking. A hand-entered row inherited its
  // mount from whichever stand-in mesh it was paired with, which is how a
  // floor lamp ended up marked "tabletop". The IKEA importer derives mount
  // from the product name instead, so where both exist the importer wins on
  // mount and category while the hand-read dimensions still win on size.
  for (const fresh of IKEA_ITEMS) {
    const merged = byId.get(fresh.id);
    if (merged && merged !== fresh) {
      byId.set(fresh.id, { ...merged, mount: fresh.mount, category: fresh.category });
    }
  }

  return [...byId.values()];
}

/**
 * Correct mount and category from the product's own name, at load.
 *
 * The importer already does this for anything added by URL, but rows that
 * predate it inherited a mount from whichever stand-in mesh they were paired
 * with — which is how a 1.55m floor lamp ended up marked "tabletop" and an ALEX
 * drawer unit ended up filed under desks. Applying the rule here fixes every
 * row rather than only the ones someone happened to re-import.
 */
function correctPlacement(item: CatalogItem): CatalogItem {
  const n = item.name.toLowerCase();
  const [w, h, d] = item.dimensions;

  let category = item.category;
  if (/\blamp\b/.test(n)) category = "lamp";
  else if (/drawer unit|chest of drawers/.test(n)) category = "dresser";
  else if (/decoration|ornament|hourglass|figure/.test(n)) category = "other";

  let mount = item.mount;
  if (/pendant|chandelier|ceiling lamp|hanging lamp/.test(n)) mount = "ceiling";
  else if (/wall lamp|sconce|wall shelf|wall art|mirror/.test(n)) mount = "wall";
  else if (/floor lamp|bin\b|trash|hamper|basket/.test(n)) mount = "floor";
  else if (/table lamp|desk lamp|work lamp/.test(n)) mount = "tabletop";
  else if (h < 0.45 && w < 0.5 && d < 0.5 && ["other", "plant", "lamp"].includes(category)) {
    // Small enough to belong on a surface rather than marooned mid-floor.
    mount = "tabletop";
  }

  return category === item.category && mount === item.mount ? item : { ...item, category, mount };
}

/**
 * Keep only products we can render as themselves.
 *
 * An Amazon Berkeley Objects stand-in gets the footprint right and the object
 * wrong — pick a swivel chair and a plain chair appears. That was acceptable
 * when it was the only option; now that IKEA's own models cover most of the
 * catalog, a lookalike beside a real one just looks like a mistake.
 *
 * The two Amazon accessories are exempt. They have no model either, but their
 * procedural shapes were built from the actual product photos to their measured
 * sizes, so they are that product rather than a near-miss.
 */
function rendersAsItself(item: CatalogItem): boolean {
  if (IKEA_MODEL_URLS[item.id]) return true;
  return item.styleTags.includes("diffuser") || item.styleTags.includes("projector");
}

// Validated once at module load. A malformed hand-edit should fail loudly here
// rather than render as a chair 140 metres wide somewhere deep in the scene.
export const CATALOG: CatalogItem[] = merge().filter(rendersAsItself).map(correctPlacement).map((item, i) => {
  const parsed = CatalogItemSchema.safeParse(item);
  if (!parsed.success) {
    throw new Error(
      `Invalid catalog item at index ${i} (${item?.id ?? "no id"}): ${parsed.error.message}`
    );
  }
  return parsed.data;
});

export const CATALOG_BY_ID = new Map(CATALOG.map((i) => [i.id, i]));

export function itemsForCategory(category: ObjectCategory): CatalogItem[] {
  return CATALOG.filter((i) => i.category === category);
}

// Categories that actually have something to offer, in display order, so the
// panel never renders an empty tab.
export function populatedCategories(): ObjectCategory[] {
  const seen = new Set(CATALOG.map((i) => i.category));
  return [...seen].sort() as ObjectCategory[];
}

export function searchCatalog(query: string): CatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return CATALOG;
  return CATALOG.filter(
    (i) =>
      i.name.toLowerCase().includes(q) ||
      i.category.includes(q) ||
      i.styleTags.some((t) => t.includes(q))
  );
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
}

/** Just the parts of a room object that say what it is. */
type IdentifiableObject = {
  category: string;
  label?: string;
  binding: ItemBinding;
};

/**
 * What to call an object in the UI.
 *
 * A human correction wins over everything else: `label` exists precisely
 * because detection gets things wrong — a bin read as a stool, a radiator as
 * a shelf — so once somebody has said what a thing is, the category is not
 * allowed to argue. After that the product's real name, then whatever a
 * custom item was called, and finally the bare category, which is all a
 * scanned object ever has.
 */
export function objectDisplayName(obj: IdentifiableObject): string {
  if (obj.label?.trim()) return obj.label.trim();

  if (obj.binding.source === "catalog") {
    const item = CATALOG_BY_ID.get(obj.binding.catalogItemId);
    if (item) return item.name;
  } else if (obj.binding.source === "custom" && obj.binding.label.trim()) {
    return obj.binding.label.trim();
  }

  return obj.category;
}

/**
 * What this object costs, or null when it has no price.
 *
 * Null covers two different situations the caller has to tell apart: scanned
 * furniture, which was never bought here, and a custom item nobody has priced
 * yet. Both are null rather than 0, because 0 claims something is free.
 * The binding's own price is used rather than the catalog's current one, since
 * the binding is what was snapshotted when the item was placed and what a
 * correction in the shopping list edits.
 */
export function objectPriceCents(obj: IdentifiableObject): number | null {
  if (obj.binding.source === "owned") return null;
  return obj.binding.priceCents;
}
