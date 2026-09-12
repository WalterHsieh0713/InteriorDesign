// Writes verified hand-measured items into src/lib/catalog.manual.ts.
//
// Each entry starts from the generated row (so the live price, link and photo
// carry over untouched) and replaces only the dimensions with numbers read off
// the product page by a person. It then re-picks the stand-in model now that
// all three axes are known, which usually beats the build's guess.
import { readFileSync, writeFileSync } from "node:fs";

const IN = 0.0254;
const inches = (n) => +(n * IN).toFixed(3);
const cm = (n) => +(n / 100).toFixed(3);

// [width, height, depth] in metres. Height is the MIDDLE value.
const MEASURED = {
  "ikea-30515917": { // HOVET Mirror — 30 3/4" x 77 1/8" x 2 3/8"
    dimensions: [inches(30.75), inches(77.125), inches(2.375)],
  },
  "ikea-70489011": { // GLOSTAD Loveseat — 147 x 77 x 79 cm
    dimensions: [cm(147), cm(77), cm(79)],
  },
  "ikea-19445469": { // LOBERGET / MALSKÄR Swivel chair — 26 3/8" x 35 3/8" x 26 3/8"
    dimensions: [inches(26.375), inches(35.375), inches(26.375)],
  },
  "ikea-60416925": { // KYRRE Stool — 16 1/2" x 17 3/4" x 18 7/8"
    dimensions: [inches(16.5), inches(17.75), inches(18.875)],
  },
};

const rd = (p, re) => JSON.parse(readFileSync(p, "utf8").match(re)[1]);
const generated = rd("src/lib/catalog.generated.ts", /= (\[[\s\S]*\]);/);
const models = rd("src/lib/models.generated.ts", /CATALOG_MODELS: CatalogModel\[\] = (\[[\s\S]*?\n\]);/);

function bestModel(category, dims) {
  const pool = models.filter((m) => m.category === category);
  if (!pool.length) return null;
  let best = null, score = Infinity;
  for (const m of pool) {
    const r = dims.map((d, i) => d / m.dimensions[i]);
    const s = Math.max(...r) / Math.min(...r);
    if (s < score) { score = s; best = m; }
  }
  return { model: best, score };
}

const out = [];
for (const [id, override] of Object.entries(MEASURED)) {
  const base = generated.find((g) => g.id === id);
  if (!base) { console.error(`! ${id} not in generated catalog — skipped`); continue; }
  const dims = override.dimensions;
  const fit = bestModel(base.category, dims);
  out.push({
    ...base, ...override,
    modelId: fit?.model?.id ?? null,
    measuredAxes: ["width", "height", "depth"],
    verified: true,
  });
  console.log(`${base.name.slice(0, 28).padEnd(28)} ${dims.join(" x ").padEnd(22)} -> ${fit?.model?.id ?? "no model"} (${fit ? fit.score.toFixed(2) : "-"}x)`);
}

const body = `import type { CatalogItem } from "./catalogItem";

// Hand-authored catalog items, measured off the live IKEA product page by a
// person. The build NEVER touches this file, and an entry here overrides the
// generated row with the same id — so re-running scripts/build-catalog.mjs to
// refresh prices and links cannot undo a correction made here.
//
// Every item below has all three axes read from the page's Measurements tab,
// so measuredAxes lists all three and verified is true. Dimensions are
// [width, height, depth] in METRES, height in the middle.
//
// To add more: run scripts/add-manual.mjs after filling in its MEASURED table.
export const MANUAL_ITEMS: CatalogItem[] = ${JSON.stringify(out, null, 2)};
`;
writeFileSync("src/lib/catalog.manual.ts", body);
console.log(`\nwrote ${out.length} verified items -> src/lib/catalog.manual.ts`);
