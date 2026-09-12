// Builds src/lib/catalog.generated.ts from IKEA's live US search API.
//
// Everything here is fetched, never transcribed: prices, links and photos come
// off the live storefront on every run, so re-running this before a demo IS
// the verification pass. It is cheap and it catches anything that went out of
// stock or changed price since the last build.
//
//   node scripts/build-catalog.mjs
//
// What it will NOT do is invent a dimension. IKEA publishes measurements
// unevenly (a bookcase gives all three axes, a sofa gives none). Any axis the
// storefront doesn't state is inferred from the stand-in model's proportions
// and deliberately left out of `measuredAxes`, so the UI and any later audit
// can tell measured from inferred.

import { writeFileSync, readFileSync } from "node:fs";

const API = "https://sik.search.blue.cdtapps.com/us/en/search-result-page";
const IN_TO_M = 0.0254;

// query -> our category. Dorm-relevant only; deliberately small.
const QUERIES = [
  ["desk", "desk", 3], ["desk chair", "chair", 2], ["armchair", "chair", 1],
  ["bookcase", "shelf", 3], ["chest of drawers", "dresser", 2],
  ["nightstand", "nightstand", 2], ["bed frame", "bed", 2],
  ["loveseat", "sofa", 2], ["coffee table", "table", 2], ["side table", "table", 1],
  ["floor lamp", "lamp", 2], ["table lamp", "lamp", 1], ["rug", "rug", 3],
  ["mirror", "mirror", 2], ["stool", "stool", 2], ["ottoman", "ottoman", 1],
];

// Categories where IKEA's two-number measurement is width x HEIGHT.
const SECOND_IS_HEIGHT = new Set(["shelf", "dresser", "mirror"]);

// Physically possible heights in metres, used only to reject a misparse.
const HEIGHT_RANGE = {
  desk: [0.6, 0.85], table: [0.25, 0.85], shelf: [0.5, 2.6], dresser: [0.4, 1.6],
  nightstand: [0.3, 0.8], bed: [0.15, 1.6], sofa: [0.5, 1.1], chair: [0.6, 1.3],
  stool: [0.35, 1.1], mirror: [0.25, 2.1], lamp: [0.2, 2.0], rug: [0.001, 0.06],
  ottoman: [0.25, 0.6],
};

// Typical height in metres per category, used ONLY when the storefront does
// not state one. Heights are standardised enough per category that this beats
// borrowing the stand-in model's height: the one ABO stool is a 0.98m counter
// stool, and stamping that onto a 0.45m step stool is simply wrong. Every
// value here is inferred, never measured, and is excluded from measuredAxes
// so the distinction survives into the UI.
const TYPICAL_HEIGHT = {
  desk: 0.75, table: 0.45, shelf: 1.06, dresser: 0.8, nightstand: 0.55,
  bed: 0.95, sofa: 0.85, chair: 0.85, stool: 0.45, mirror: 1.6,
  lamp: 0.5, rug: 0.01, ottoman: 0.42,
};

// A category is too coarse for height on its own: a floor lamp and a table
// lamp are both "lamp" and differ by a metre. IKEA states the distinction in
// the product type, so read it rather than averaging the two into something
// that is wrong for both.
function typicalHeight(category, label) {
  const n = (label || "").toLowerCase();
  if (category === "lamp") {
    if (/floor lamp/.test(n)) return 1.5;
    if (/table lamp|desk lamp|work lamp|wall lamp/.test(n)) return 0.45;
  }
  if (category === "stool") {
    if (/bar stool|counter/.test(n)) return 0.75;
    if (/step stool/.test(n)) return 0.5;
  }
  return TYPICAL_HEIGHT[category];
}

// Footprints to fall back on when the storefront states no measurement at all.
// Borrowing the stand-in model's footprint put 2.65m rugs into a 3.2m room;
// these are ordinary dorm sizes. Inferred, so they stay out of measuredAxes.
const TYPICAL_FOOTPRINT = { rug: [1.7, 2.4] };

const FINISH = { white:"#F2F2F0", black:"#2B2B2D", "black-brown":"#3B2F2A",
  "dark grey":"#4A4E52", grey:"#8A8D8F", gray:"#8A8D8F", beige:"#C9C6BE",
  oak:"#C8A87C", birch:"#DFCCA8", pine:"#D6BC8E", walnut:"#6B4A2F",
  blue:"#3E5C76", green:"#4A5D4E", red:"#8C3A3A", pink:"#D6A8A8",
  natural:"#C9B79C", pastel:"#D9CDBA", pastelyellow:"#E8D9A0", anthracite:"#37393B" };

// "41 3/8x19 5/8 \"" -> [41.375, 19.625]   "31 1/2x11x79 1/2\"" -> 3 values
function parseInches(text) {
  if (!text) return null;
  const cleaned = text.replace(/["”]/g, "").trim();
  if (!/^[\d\s/x.]+$/i.test(cleaned)) return null;      // "Queen", "" etc.
  const parts = cleaned.split(/x/i).map((s) => s.trim()).filter(Boolean);
  const nums = parts.map((p) => {
    const m = p.match(/^(\d+)?\s*(?:(\d+)\/(\d+))?$/);
    if (!m) return NaN;
    return (m[1] ? +m[1] : 0) + (m[2] ? +m[2] / +m[3] : 0);
  });
  return nums.every((n) => Number.isFinite(n) && n > 0) ? nums : null;
}

function colorFromUrl(url, name) {
  const slug = (url || "").toLowerCase();
  for (const key of Object.keys(FINISH)) if (slug.includes(key.replace(/\s/g, "-"))) return key;
  const n = (name || "").toLowerCase();
  for (const key of Object.keys(FINISH)) if (n.includes(key)) return key;
  return null;
}

async function search(q, size) {
  const res = await fetch(`${API}?q=${encodeURIComponent(q)}&size=${size}`, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`IKEA ${q}: HTTP ${res.status}`);
  const j = await res.json();
  return (j?.searchResultPage?.products?.main?.items ?? []).map((i) => i.product ?? i);
}

// Pair each product with a stand-in model of the same category, cycling so two
// desks don't both get the same mesh.
const models = JSON.parse(
  readFileSync(new URL("../src/lib/models.generated.ts", import.meta.url), "utf8")
    .match(/export const CATALOG_MODELS: CatalogModel\[\] = (\[[\s\S]*?\n\]);/)[1]
);
const byCat = {};
for (const m of models) (byCat[m.category] ??= []).push(m);
const used = {};
// Pick the model whose PROPORTIONS best match the axes we actually measured.
// Round-robin was assigning a 5cm-deep wall shelf to a 1.9m bookcase purely by
// arrival order, which the renderer then stretched 36x. Fit is scored on the
// known axes only — an axis we are about to copy off the model can't also be
// evidence about which model to use.
// Categories with no models of their own borrow from a physically similar
// one. A nightstand is a small table; using a table mesh scaled to the
// nightstand's real size beats falling back to a plain box.
const MODEL_FALLBACK = { nightstand: "table", stool: "chair", plant: "other" };

function pickModel(cat, known) {
  const pool = byCat[cat] ?? byCat[MODEL_FALLBACK[cat]];
  if (!pool?.length) return null;
  const axes = Object.keys(known);
  if (axes.length < 2) {
    // Nothing to score on: spread across the pool so two products of the same
    // category don't silently become the same mesh at the same size.
    const i = (used[cat] = (used[cat] ?? -1) + 1) % pool.length;
    return pool[i];
  }
  const idx = { width: 0, height: 1, depth: 2 };
  let best = null, bestScore = Infinity;
  for (const m of pool) {
    const ratios = axes.map((a) => known[a] / m.dimensions[idx[a]]);
    const score = Math.max(...ratios) / Math.min(...ratios); // 1.0 = same shape
    if (score < bestScore) { bestScore = score; best = m; }
  }
  return best;
}

const items = [];
const skipped = [];

for (const [q, category, want] of QUERIES) {
  let products;
  try { products = await search(q, want * 4); }
  catch (e) { console.error(`  ! ${q}: ${e.message}`); continue; }

  let taken = 0;
  for (const p of products) {
    if (taken >= want) break;
    const price = p.salesPrice?.numeral;
    const url = p.pipUrl;
    if (!p.onlineSellable || !price || !url?.includes("/p/")) { skipped.push(`${q}: ${p.name} (not sellable/linkable)`); continue; }
    if (items.some((it) => it.id === `ikea-${p.itemNo}`)) continue;

    const inches = parseInches(p.itemMeasureReferenceText);
    const measuredAxes = [];
    let w, h, d;

    // Three numbers are always width x depth x height (verified against BILLY,
    // 31 1/2x11x79 1/2 = 80x28x202cm). Two numbers are ambiguous, and IKEA
    // resolves it by product type, not by any flag in the payload: upright
    // storage and mirrors publish width x HEIGHT, while surfaces and seating
    // publish width x DEPTH. Reading a bookcase's 74 3/4" as depth gives you a
    // shelf 5cm tall and 1.9m deep, which is how this bug announces itself.
    if (inches?.length === 3) {
      [w, d, h] = inches.map((n) => n * IN_TO_M);
      measuredAxes.push("width", "depth", "height");
    } else if (inches?.length === 2) {
      const [a, b] = inches.map((n) => n * IN_TO_M);
      w = a;
      measuredAxes.push("width");
      if (SECOND_IS_HEIGHT.has(category)) { h = b; measuredAxes.push("height"); }
      else { d = b; measuredAxes.push("depth"); }
    }

    // Fill whatever the storefront didn't state from the stand-in model's
    // proportions, scaled to whichever axis we DO know.
    const model = pickModel(category, Object.fromEntries(
      [["width", w], ["height", h], ["depth", d]].filter(([, v]) => v != null)
    ));

    // Missing axes take the stand-in model's ABSOLUTE size, never a version
    // of it scaled to the width we know. Furniture height is standardised by
    // category — a narrow desk is still ~75cm tall — so scaling a 1.35m-wide
    // model's height down to a 1.05m-wide product invents a 58cm desk and the
    // plausibility guard then throws away a perfectly real product.
    // Unstated height comes from the category, not the model (see
    // TYPICAL_HEIGHT). Unstated width/depth fall back to the stand-in model's
    // absolute footprint, which is a fair proxy — footprints vary far less
    // within a category than heights do.
    h ??= typicalHeight(category, `${p.name} ${p.typeName ?? ""}`);
    const fp = TYPICAL_FOOTPRINT[category];
    if (fp) { w ??= fp[0]; d ??= fp[1]; }
    if (model) {
      const [mw, mh, md] = model.dimensions;
      w ??= mw; h ??= mh; d ??= md;
    }
    w ??= 0.6; h ??= 0.7; d ??= 0.6;

    // Last line of defence: a height outside anything this category could
    // physically be means an axis got misread, and a wrong number is worse
    // than a missing product.
    const range = HEIGHT_RANGE[category];
    if (range && (h < range[0] || h > range[1])) {
      skipped.push(`${q}: ${p.name} (height ${h.toFixed(2)}m outside ${range[0]}-${range[1]}m for ${category})`);
      continue;
    }
    if (!(w > 0 && h > 0 && d > 0)) { skipped.push(`${q}: ${p.name} (no usable dimensions)`); continue; }

    const colorName = colorFromUrl(url, p.name);
    items.push({
      id: `ikea-${p.itemNo}`,
      name: `${p.name} ${p.typeName ?? ""}`.trim(),
      brand: "IKEA",
      category,
      priceCents: Math.round(price * 100),
      productUrl: url,
      imageUrl: p.mainImageUrl ?? null,
      dimensions: [w, h, d].map((n) => +n.toFixed(3)),
      modelId: model?.id ?? null,
      mount: model?.mount ?? (category === "mirror" ? "wall" : "floor"),
      dominantHex: FINISH[colorName] ?? "#C9C6BE",
      styleTags: [category, colorName, "ikea"].filter(Boolean),
      measuredAxes,
      verified: false,
    });
    taken++;
  }
  console.log(`  ${q.padEnd(18)} -> ${taken}/${want}`);
}

const out = `// GENERATED by scripts/build-catalog.mjs — do not edit by hand.
// Built ${new Date().toISOString().slice(0, 10)} from IKEA's live US storefront.
// Prices and links were real at build time; re-run before a demo to re-verify.
// Hand-authored items belong in catalog.manual.ts, which the build never touches.

import type { CatalogItem } from "./catalogItem";

export const GENERATED_ITEMS: CatalogItem[] = ${JSON.stringify(items, null, 2)};
`;
const dest = new URL("../src/lib/catalog.generated.ts", import.meta.url);
writeFileSync(dest, out);

const full = items.filter((i) => i.measuredAxes.length === 3).length;
console.log(`\n${items.length} items -> src/lib/catalog.generated.ts`);
console.log(`  ${full} fully measured, ${items.length - full} with at least one inferred axis`);
console.log(`  ${items.filter((i) => i.modelId).length} paired with a 3D model`);
if (skipped.length) { console.log(`  ${skipped.length} skipped:`); for (const s of skipped) console.log(`    - ${s}`); }
