// Adds IKEA products to the catalog from their product-page URLs.
//
//   node scripts/add-ikea-products.mjs                 # reads data/ikea-picks.txt
//   node scripts/add-ikea-products.mjs <url> [<url>…]  # or straight from the CLI
//
// Paste a URL, get a complete catalog item: real name, real price, real photo,
// IKEA's own 3D model, and dimensions MEASURED FROM THAT MODEL.
//
// That last part is the point. IKEA does not publish width/depth/height in the
// page HTML — only a two-number summary in the title, which is ambiguous about
// which axes it means and has caused real mistakes here. But when IKEA ships a
// model, the model IS the product at its real size, so its bounding box is a
// better source than any text on the page. Nothing is estimated.
//
// A line may name a category if the guess would be wrong:
//   https://www.ikea.com/us/en/p/…/    desk

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const PICKS = "data/ikea-picks.txt";
const CACHE = join(tmpdir(), "ikea-glb-cache");

// Words in a product's name that place it in our enum. First match wins, so
// order matters: "drawer unit" before "unit", "coffee table" before "table".
const CATEGORY_WORDS = [
  ["bookcase", "shelf"], ["shelf", "shelf"], ["shelving", "shelf"],
  ["drawer unit", "dresser"], ["chest of drawers", "dresser"], ["dresser", "dresser"],
  ["nightstand", "nightstand"], ["bedside", "nightstand"],
  ["bed frame", "bed"], ["headboard", "bed"],
  ["desk", "desk"], ["workstation", "desk"],
  ["coffee table", "table"], ["side table", "table"], ["console table", "table"], ["table", "table"],
  ["armchair", "chair"], ["office chair", "chair"], ["swivel chair", "chair"], ["chair", "chair"],
  ["loveseat", "sofa"], ["sofa", "sofa"], ["sleeper", "sofa"],
  ["ottoman", "ottoman"], ["footstool", "ottoman"],
  ["stool", "stool"], ["bench", "stool"],
  ["floor lamp", "lamp"], ["table lamp", "lamp"], ["work lamp", "lamp"], ["lamp", "lamp"],
  ["mirror", "mirror"],
  ["rug", "rug"], ["carpet", "rug"],
  ["plant", "plant"], ["vase", "plant"],
];

const MOUNT = { mirror: "wall", lamp: "floor", rug: "floor" };

const FINISH = { white:"#F2F2F0", black:"#2B2B2D", "black-brown":"#3B2F2A", "dark gray":"#4A4E52",
  "dark grey":"#4A4E52", gray:"#8A8D8F", grey:"#8A8D8F", beige:"#C9C6BE", oak:"#C8A87C",
  birch:"#DFCCA8", pine:"#D6BC8E", walnut:"#6B4A2F", blue:"#3E5C76", green:"#4A5D4E",
  red:"#8C3A3A", pink:"#D6A8A8", natural:"#C9B79C", anthracite:"#37393B" };

function categoryFor(name, override) {
  if (override) return override;
  const n = name.toLowerCase();
  for (const [word, cat] of CATEGORY_WORDS) if (n.includes(word)) return cat;
  return "other";
}

function hexFor(color, name) {
  const hay = `${color ?? ""} ${name ?? ""}`.toLowerCase();
  for (const key of Object.keys(FINISH)) if (hay.includes(key)) return FINISH[key];
  return "#C9C6BE";
}

/** Bounding box of a .glb, in metres. Draco keeps accessor min/max, so the JSON chunk is enough. */
function boundingBox(buf) {
  const g = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString("utf8"));
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const mesh of g.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const a = g.accessors?.[prim.attributes?.POSITION];
      if (!a?.min || !a?.max) continue;
      for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], a.min[i]); mx[i] = Math.max(mx[i], a.max[i]); }
    }
  }
  if (!Number.isFinite(mn[0])) return null;
  const s = (g.nodes ?? []).find((n) => n.scale)?.scale ?? [1, 1, 1];
  return [0, 1, 2].map((i) => +Math.abs((mx[i] - mn[i]) * s[i]).toFixed(3));
}

function productFromHtml(html) {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    let parsed;
    try { parsed = JSON.parse(m[1]); } catch { continue; }
    for (const o of Array.isArray(parsed) ? parsed : [parsed]) {
      if (o["@type"] !== "Product") continue;
      const img = Array.isArray(o.image) ? o.image[0] : o.image;
      return {
        // JSON-LD names look like: MICKE Desk - white 41 3/8x19 5/8 "
        // Keep "MICKE Desk": the colour is captured separately and the trailing
        // measurements are the ambiguous two-number summary we do not trust.
        name: String(o.name ?? "").split(" - ")[0].trim(),
        itemNo: String(o.sku ?? "").replace(/\D/g, ""),
        price: Math.round(parseFloat(o.offers?.price ?? "0") * 100),
        image: typeof img === "string" ? img : img?.url ?? img?.contentUrl ?? null,
        color: o.color ?? null,
        inStock: String(o.offers?.availability ?? "").includes("InStock"),
      };
    }
  }
  return null;
}

const args = process.argv.slice(2);
const lines = args.length
  ? args.map((a) => ({ url: a, category: null }))
  : (existsSync(PICKS) ? readFileSync(PICKS, "utf8") : "")
      .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const [url, category] = l.split(/\s+/);
        return { url, category: category ?? null };
      });

if (!lines.length) {
  console.error(`Nothing to do. Pass URLs, or list them one per line in ${PICKS}`);
  process.exit(1);
}

mkdirSync(CACHE, { recursive: true });
const items = [];
const models = {};
const skipped = [];

for (const { url, category: override } of lines) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) { skipped.push(`${url} (page HTTP ${res.status})`); continue; }
    const html = await res.text();

    const p = productFromHtml(html);
    if (!p?.itemNo || !p.price) { skipped.push(`${url} (no product data on the page)`); continue; }
    if (!p.inStock) skipped.push(`NOTE ${p.name} is listed out of stock — added anyway`);

    // Draco build if there is one: same geometry, far fewer bytes.
    const urls = [...html.matchAll(/https?:\/\/web-api\.ikea\.com\/[^"'\\ ]+\.glb/g)].map((m) => m[0]);
    const glb = urls.find((u) => u.includes("/glb_draco/")) ?? urls[0];
    if (!glb) { skipped.push(`${p.name} (no 3D model — add it by hand if you want it)`); continue; }

    // Downloaded to a temp cache only, to measure it. Never into the repo.
    const cached = join(CACHE, `${p.itemNo}.glb`);
    let buf;
    if (existsSync(cached)) buf = readFileSync(cached);
    else {
      const mr = await fetch(glb, { headers: { "User-Agent": UA } });
      if (!mr.ok) { skipped.push(`${p.name} (model HTTP ${mr.status})`); continue; }
      buf = Buffer.from(await mr.arrayBuffer());
      writeFileSync(cached, buf);
    }

    const dims = boundingBox(buf);
    if (!dims) { skipped.push(`${p.name} (model has no measurable geometry)`); continue; }

    const id = `ikea-${p.itemNo}`;
    const cat = categoryFor(p.name, override);
    items.push({
      id, name: p.name, brand: "IKEA", category: cat,
      priceCents: p.price, productUrl: url, imageUrl: p.image,
      dimensions: dims,
      // The IKEA model is used unscaled, so modelId (the ABO stand-in) is null.
      modelId: null,
      mount: MOUNT[cat] ?? "floor",
      dominantHex: hexFor(p.color, p.name),
      styleTags: [cat, p.color, "ikea"].filter(Boolean).map((s) => String(s).toLowerCase()),
      // Measured off IKEA's own mesh, which is the product. Not a transcription.
      measuredAxes: ["width", "height", "depth"],
      verified: true,
    });
    models[id] = glb;
    console.log(`+ ${p.name.slice(0, 32).padEnd(32)} ${cat.padEnd(10)} $${(p.price / 100).toFixed(2).padStart(7)}  ${dims.join(" x ")}`);
  } catch (e) {
    skipped.push(`${url} (${e.message.split("\n")[0]})`);
  }
}

// Merge with whatever is already recorded, so this is additive across runs.
const readGen = (path, re, fallback) => {
  try { return JSON.parse(readFileSync(path, "utf8").match(re)[1]); } catch { return fallback; }
};
const existingItems = readGen("src/lib/catalog.ikea.ts", /IKEA_ITEMS: CatalogItem\[\] = (\[[\s\S]*\]);/, []);
const existingModels = readGen("src/lib/ikeaModels.generated.ts", /IKEA_MODEL_URLS: Record<string, string> = (\{[\s\S]*\});/, {});

const mergedItems = new Map(existingItems.map((i) => [i.id, i]));
for (const i of items) mergedItems.set(i.id, i);
const mergedModels = { ...existingModels, ...models };

writeFileSync("src/lib/catalog.ikea.ts", `import type { CatalogItem } from "./catalogItem";

// GENERATED by scripts/add-ikea-products.mjs — do not edit by hand.
//
// Products added from their IKEA product pages. Every dimension here was
// measured from IKEA's own 3D model rather than read off the page, because the
// page states only an ambiguous two-number summary while the model is the
// product at its real size. That is why every row is verified.
export const IKEA_ITEMS: CatalogItem[] = ${JSON.stringify([...mergedItems.values()], null, 2)};
`);

writeFileSync("src/lib/ikeaModels.generated.ts", `// GENERATED — do not edit by hand.
//
// IKEA's own glTF for each product, by catalog id. URLs, not files: nothing is
// downloaded into this repo, and /api/ikea-model fetches the bytes server-side
// because web-api.ikea.com rejects any request carrying a browser Origin header.
//
// URLs contain a content hash and change when IKEA updates a model, so re-run
// the script if a product stops rendering.

export const IKEA_MODEL_URLS: Record<string, string> = ${JSON.stringify(mergedModels, null, 2)};
`);

console.log(`\n${items.length} added this run, ${mergedItems.size} total in catalog.ikea.ts`);
if (skipped.length) {
  console.log(`${skipped.length} skipped or noted:`);
  for (const s of skipped) console.log(`  - ${s}`);
}
