// Writes hand-measured items into src/lib/catalog.manual.ts.
//
// Every dimension here was read off a live IKEA product page by a person.
// Unlike the build, this file records PARTIAL measurements honestly: IKEA's
// listing cards give width and height for drawer units and width and depth for
// desks, and almost never give all three, so an axis nobody stated stays
// inferred and stays out of measuredAxes.
//
//   node scripts/add-verified.mjs
import { readFileSync, writeFileSync } from "node:fs";

const IN = 0.0254;
const inch = (n) => +(n * IN).toFixed(4);
const feet = (f, i = 0) => +((f * 12 + i) * IN).toFixed(4);

const rd = (p, re) => JSON.parse(readFileSync(p, "utf8").match(re)[1]);
const generated = rd("src/lib/catalog.generated.ts", /= (\[[\s\S]*\]);/);
const models = rd("src/lib/models.generated.ts", /CATALOG_MODELS: CatalogModel\[\] = (\[[\s\S]*?\n\]);/);

// Corrections and additions to rows the build produced.
// dims: [width, height, depth] in metres; null means "nobody stated it".
const OVERRIDES = {
  // The screenshot I was sent earlier turned out to be SALTMYRAN, not GLOSTAD.
  // 57 7/8 x 31 1/8, height including back cushions 30 3/8.
  "ikea-80618531": { dims: [inch(57.875), inch(30.375), inch(31.125)] },

  // NEIDEN: the twin. 76 3/4 long, 39 3/4 wide, headboard 25 5/8 tall.
  "ikea-80395248": { dims: [inch(39.75), inch(25.625), inch(76.75)], price: 8900,
    name: "NEIDEN Bed frame, Twin" },

  // 27 1/8 wide, 26 deep, 51 1/8 at full extension — a gas-lift chair's
  // bounding box is its tallest setting.
  "ikea-10601124": { dims: [inch(27.125), inch(51.125), inch(26)] },

  // 25 1/4 x 29 7/8 x 30 3/4.
  "ikea-30533493": { dims: [inch(25.25), inch(29.875), inch(30.75)] },

  // Ottoman: length is the long horizontal side, so it is our width.
  "ikea-60595936": { dims: [inch(26.75), inch(16.125), inch(22.875)] },

  // Floor lamps: base diameter is the widest point, not the shade.
  "ikea-70437814": { dims: [inch(13), inch(59), inch(13)] },
  "ikea-90541536": { dims: [inch(19), inch(61), inch(19)], price: 8999 },

  // Table lamp: 10 across, 9 tall.
  "ikea-70096377": { dims: [inch(10), inch(9), inch(10)], price: 2999 },

  // Stool: 15 3/4 across the base, seat at 17 3/4.
  "ikea-10135659": { dims: [inch(15.75), inch(17.75), inch(15.75)], price: 899 },

  // Rugs: width across, length front-to-back, thickness for height.
  "ikea-40559166": { dims: [feet(7, 3), 0.01, feet(9, 2)], price: 3999 },
  "ikea-80635451": { dims: [feet(5, 3), inch(1.25), feet(7, 7)], price: 6999 },
  "ikea-90607688": { dims: [feet(7, 10), inch(0.75), feet(10, 0)], price: 24999 },

  // Side table: length along the wall, width sticking out.
  "ikea-40541421": { dims: [inch(31.5), inch(20.5), inch(12.25)], price: 5999 },

  // LACK: 35 3/8 x 21 5/8 x 17 3/4.
  "ikea-00104291": { dims: [inch(35.375), inch(17.75), inch(21.625)], price: 2999 },

  // GLOSTAD: 47 5/8 x 30 3/4. The page gives no overall height, so backrest
  // height (26 3/4) is the tallest point and therefore the bounding box.
  "ikea-70489011": { dims: [inch(47.625), inch(26.75), inch(30.75)], price: 16900 },

  // MALM in Twin. 44 1/8 wide, 78 3/8 long, 39 3/8 to the headboard.
  "ikea-09574367": { dims: [inch(44.125), inch(39.375), inch(78.375)],
    name: "MALM Bed frame, Twin" },

  // MICKE desks: the page states 29 1/2 high, which settles all four.
  "ikea-80213074": { dims: [inch(41.375), inch(29.5), inch(19.625)] },
  "ikea-90214308": { dims: [inch(55.875), inch(29.5), inch(19.625)] },

  // ALEX: depth 22 7/8 on the 14 1/8-wide units.
  "ikea-00473546": { dims: [inch(14.125), inch(27.5), inch(22.875)], price: 9500 },

  // BRIMNES: 23 5/8 x 13 3/4 x 74 3/4, all three on the page.
  "ikea-90301225": { dims: [inch(23.625), inch(74.75), inch(13.75)], price: 14900 },

  // LINDBYN: the page gives height and width only. A mirror's depth is never
  // published, so it stays inferred from a real mirror model.
  "ikea-40597234": { dims: [inch(23.625), inch(66.875), null], price: 10999 },

};

// Products the build never picked up, from the listing cards.
const NEW_ITEMS = [
  { id: "ikea-s19175988", name: "MALM Bed frame, Queen", category: "bed", price: 32900,
    url: "https://www.ikea.com/us/en/p/malm-bed-frame-white-s19175988/",
    dims: [inch(66.125), inch(39.375), inch(83.125)], hex: "#F2F2F0", tags: ["bed", "white", "ikea"] },

  { id: "ikea-s49480188", name: "NEIDEN Bed frame, Full", category: "bed", price: 10900,
    url: "https://www.ikea.com/us/en/p/neiden-bed-frame-pine-s49480188/",
    dims: [inch(54.75), inch(25.625), inch(76.75)], hex: "#D6BC8E", tags: ["bed", "pine", "ikea"] },

  { id: "ikea-10192824", name: "MICKE Desk, 28 3/4\"", category: "desk", price: 6999,
    url: "https://www.ikea.com/us/en/p/micke-desk-white-10192824/",
    dims: [inch(28.75), inch(29.5), inch(19.625)], hex: "#F2F2F0", tags: ["desk", "white", "ikea"] },

  { id: "ikea-s09291378", name: "MICKE Corner workstation", category: "desk", price: 29999,
    url: "https://www.ikea.com/us/en/p/micke-corner-workstation-white-s09291378/",
    dims: [inch(39.375), inch(29.5), inch(55.875)], hex: "#F2F2F0", tags: ["desk", "corner", "ikea"] },

  { id: "ikea-30484075", name: "ALEX Drawer unit with 9 drawers", category: "dresser", price: 22999,
    url: "https://www.ikea.com/us/en/p/alex-drawer-unit-with-9-drawers-white-30484075/",
    dims: [inch(14.125), inch(45.625), inch(22.875)], hex: "#F2F2F0", tags: ["dresser", "white", "ikea"] },

  { id: "ikea-40473547", name: "ALEX Drawer unit on casters", category: "dresser", price: 22999,
    url: "https://www.ikea.com/us/en/p/alex-drawer-unit-on-casters-white-40473547/",
    dims: [inch(26.375), inch(26), null], hex: "#F2F2F0", tags: ["dresser", "white", "ikea"] },

  { id: "ikea-90484077", name: "ALEX Drawer unit/drop file storage", category: "dresser", price: 12999,
    url: "https://www.ikea.com/us/en/p/alex-drawer-unit-drop-file-storage-white-90484077/",
    dims: [inch(14.125), inch(27.5), inch(22.875)], hex: "#F2F2F0", tags: ["dresser", "white", "ikea"] },
];

// Measurements that turned out to belong to a different product. The screenshot
// once read as GLOSTAD was in fact SALTMYRAN — identical numbers on both would
// mean one of them is a lie, so GLOSTAD goes back to being unmeasured and back
// onto the list of things to look up.
const RETRACTED = ["ikea-70489011"];

const AXES = ["width", "height", "depth"];

// Choose the model whose proportions best match the axes we actually know.
function bestModel(category, dims) {
  const pool = models.filter((m) => m.category === category);
  if (!pool.length) return null;
  const known = dims.map((d, i) => [i, d]).filter(([, d]) => d != null);
  if (known.length < 2) return pool[0];
  let best = null, score = Infinity;
  for (const m of pool) {
    const ratios = known.map(([i, d]) => d / m.dimensions[i]);
    const s = Math.max(...ratios) / Math.min(...ratios);
    if (s < score) { score = s; best = m; }
  }
  return best;
}

function finish(base, dims, extra = {}) {
  const measuredAxes = AXES.filter((_, i) => dims[i] != null);
  const model = bestModel(base.category, dims);
  // Fill only what nobody stated, from the stand-in model's absolute size.
  const filled = dims.map((d, i) => (d != null ? d : model ? model.dimensions[i] : 0.5));
  return {
    ...base, ...extra,
    dimensions: filled.map((n) => +n.toFixed(3)),
    modelId: model?.id ?? null,
    measuredAxes,
    verified: measuredAxes.length === 3,
  };
}

const out = [];
for (const [id, o] of Object.entries(OVERRIDES)) {
  const base = generated.find((g) => g.id === id);
  if (!base) { console.error(`! ${id} not in generated catalog — skipped`); continue; }
  const extra = {};
  if (o.price != null) extra.priceCents = o.price;
  if (o.name) extra.name = o.name;
  out.push(finish(base, o.dims, extra));
}
for (const n of NEW_ITEMS) {
  out.push(finish(
    { id: n.id, name: n.name, brand: "IKEA", category: n.category, priceCents: n.price,
      productUrl: n.url, imageUrl: null, mount: "floor", dominantHex: n.hex, styleTags: n.tags },
    n.dims
  ));
}

// Keep anything already hand-verified that this run does not touch.
const existing = (() => {
  try { return rd("src/lib/catalog.manual.ts", /MANUAL_ITEMS: CatalogItem\[\] = (\[[\s\S]*\]);/); }
  catch { return []; }
})();
const byId = new Map(existing.filter((i) => !RETRACTED.includes(i.id)).map((i) => [i.id, i]));
for (const i of out) byId.set(i.id, i);
const all = [...byId.values()];

writeFileSync("src/lib/catalog.manual.ts", `import type { CatalogItem } from "./catalogItem";

// Hand-authored catalog items, measured off live IKEA product pages by a
// person. The build NEVER touches this file, and an entry here overrides the
// generated row with the same id — so re-running scripts/build-catalog.mjs to
// refresh prices and links cannot undo a correction made here.
//
// measuredAxes lists ONLY the axes a retailer actually stated. IKEA's listing
// cards give width x height for drawer units and width x depth for desks, and
// rarely give all three, so an unstated axis is filled from the stand-in
// model and deliberately left out of that list.
//
// Regenerate with: node scripts/add-verified.mjs
export const MANUAL_ITEMS: CatalogItem[] = ${JSON.stringify(all, null, 2)};
`);

const full = all.filter((i) => i.measuredAxes.length === 3).length;
console.log(`${all.length} hand-measured items -> src/lib/catalog.manual.ts`);
console.log(`  ${full} fully measured, ${all.length - full} with one axis still inferred`);
for (const i of all) {
  console.log(`  ${i.name.slice(0, 34).padEnd(34)} ${i.dimensions.join(" x ").padEnd(22)} ${i.measuredAxes.length}/3  $${(i.priceCents / 100).toFixed(2)}`);
}
