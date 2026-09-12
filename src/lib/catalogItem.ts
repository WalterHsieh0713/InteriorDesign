import { z } from "zod";
import { OBJECT_CATEGORIES, type ItemBinding } from "./roomLayoutSchema";
import { MODELS_BY_ID, type ModelMount } from "./models.generated";

// A catalog item is a *real, buyable product*. That is the whole contract:
// if it has no working link and no current price, it does not belong here.
// The 3D model attached to it is a separate concern — see `modelId`.
export const CatalogItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  brand: z.string(),
  category: z.enum(OBJECT_CATEGORIES),
  priceCents: z.number().int().positive(),
  productUrl: z.url(),
  imageUrl: z.url().nullable(),

  // The product's own real-world size in metres, [width, height, depth].
  // This — not the model's size — is what the object becomes in the room.
  dimensions: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]),

  // Which mesh in public/models/ stands in for this product, or null to fall
  // back to the procedural FurnitureMesh. The model is chosen to *look like*
  // the product, not to be it; it is scaled to `dimensions` at render time.
  // The UI must label these as representative — see REPRESENTATIVE_MODEL_NOTE.
  modelId: z.string().nullable(),

  mount: z.enum(["floor", "wall", "tabletop"]),
  dominantHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  styleTags: z.array(z.string()),

  // Which axes came from the retailer vs. were inferred from the stand-in
  // model's proportions. IKEA publishes measurements unevenly — a bookcase
  // gives width/depth/height, a sofa gives nothing — and pretending an
  // inferred depth is a measured one is how a catalog starts lying.
  measuredAxes: z.array(z.enum(["width", "height", "depth"])),
  verified: z.boolean(),
});

export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export const REPRESENTATIVE_MODEL_NOTE =
  "3D model is representative, not the exact product.";

export const ATTRIBUTION =
  "3D models from Amazon Berkeley Objects (CC BY 4.0).";

// The layout schema stores dimensions as [x, y, z] — height in the MIDDLE.
// Catalog items are authored width/height/depth in that same order, so this
// is a pass-through today; it exists so every call site goes through one
// place if that ever stops being true.
export function toDimensions(item: CatalogItem): [number, number, number] {
  return [item.dimensions[0], item.dimensions[1], item.dimensions[2]];
}

// The binding written onto a room object when this product is placed.
// Price is copied, not referenced: the feed snapshots totals at publish time.
export function toBinding(item: CatalogItem): ItemBinding {
  return {
    source: "catalog",
    catalogItemId: item.id,
    priceCents: item.priceCents,
    url: item.productUrl,
  };
}

export function modelUrlFor(item: CatalogItem): string | null {
  return item.modelId ? (MODELS_BY_ID.get(item.modelId)?.modelUrl ?? null) : null;
}

export function modelMountFor(item: CatalogItem): ModelMount {
  return item.mount;
}
