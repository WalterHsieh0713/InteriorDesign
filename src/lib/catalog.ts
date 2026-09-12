import { CatalogItemSchema, type CatalogItem } from "./catalogItem";
import { GENERATED_ITEMS } from "./catalog.generated";
import { ACCESSORY_ITEMS } from "./catalog.accessories";
import { IKEA_ITEMS } from "./catalog.ikea";
import { IKEA_MODEL_URLS } from "./ikeaModels.generated";
import { MANUAL_ITEMS } from "./catalog.manual";
import type { ObjectCategory } from "./roomLayoutSchema";

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
  return [...byId.values()];
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
export const CATALOG: CatalogItem[] = merge().filter(rendersAsItself).map((item, i) => {
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
