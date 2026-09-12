import type { CatalogItem } from "./catalogItem";

/**
 * Dorm accessories — things that are not furniture but that people actually
 * buy for a room. Hand-entered from live Amazon listings, like catalog.manual,
 * and likewise never touched by scripts/build-catalog.mjs.
 *
 * These have no Amazon Berkeley Objects model, so `modelId` is null and each
 * renders as a purpose-built procedural shape (see AccessoryMesh).
 */
export const ACCESSORY_ITEMS: CatalogItem[] = [
  {
    id: "amzn-B01MR4Y0CZ",
    name: "ASAKUKI Essential Oil Diffuser, 500ml",
    brand: "ASAKUKI",
    category: "other",
    priceCents: 1999,
    productUrl: "https://www.amazon.com/dp/B01MR4Y0CZ",
    imageUrl: null,
    // Listing states 6.62"L x 6.62"W x 4.93"H. Round base, so width and depth
    // are the same 6.62".
    dimensions: [0.168, 0.125, 0.168],
    modelId: null,
    mount: "tabletop",
    dominantHex: "#D8D2C8",
    styleTags: ["diffuser", "scent", "wellness"],
    measuredAxes: ["width", "height", "depth"],
    verified: true,
  },
  {
    id: "amzn-B0F7RR3YC6",
    name: "Mini Projector, 1080p Auto-Keystone",
    brand: "Amazon",
    category: "other",
    priceCents: 8399,
    productUrl: "https://www.amazon.com/dp/B0F7RR3YC6",
    imageUrl: null,
    // The listing does not publish a body size, so this is a typical mini
    // projector's footprint and is flagged as estimated. The numbers that
    // matter for this product — its throw ratio — come from the listing's own
    // projection-distance table and are exact. See projection.ts.
    dimensions: [0.145, 0.12, 0.145],
    modelId: null,
    mount: "tabletop",
    dominantHex: "#F2F2F0",
    styleTags: ["projector", "movies", "tech"],
    measuredAxes: [],
    verified: false,
  },
];
