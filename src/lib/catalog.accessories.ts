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
    // Listing states a "compact size of 8*4*4 inches". The two 4" figures are
    // unambiguous; the 8" is read as depth, since that is the axis a projector
    // is long along — body plus lens barrel, pointing at the wall.
    dimensions: [0.102, 0.102, 0.203],
    modelId: null,
    mount: "tabletop",
    dominantHex: "#F2F2F0",
    styleTags: ["projector", "movies", "tech"],
    measuredAxes: ["width", "height", "depth"],
    verified: true,
  },
];
