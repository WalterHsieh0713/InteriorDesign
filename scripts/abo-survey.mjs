// Surveys Amazon Berkeley Objects for models we could add, WITHOUT downloading
// any geometry. Joins the 3D-model index (which ASINs have a mesh) against the
// product listings (what each ASIN actually is), then reports what is available
// per category so the download step can be selective.
//
//   node scripts/abo-survey.mjs > abo-candidates.json
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";

const BASE = "https://amazon-berkeley-objects.s3.amazonaws.com";
const log = (...a) => process.stderr.write(a.join(" ") + "\n");

async function* gzLines(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  yield* createInterface({ input: Readable.fromWeb(res.body).pipe(createGunzip()) });
}

// 1. Which ASINs ship a glTF model.
log("fetching 3D model index...");
const withModel = new Set();
let header = null;
for await (const line of gzLines(`${BASE}/3dmodels/metadata/3dmodels.csv.gz`)) {
  if (!header) { header = line.split(","); continue; }
  const cols = line.split(",");
  const asin = cols[header.indexOf("item_id")] ?? cols[0];
  if (asin) withModel.add(asin.replace(/"/g, "").trim().toUpperCase());
}
log(`  ${withModel.size} ASINs have a model`);

// 2. What those ASINs are. Only US listings — a European wardrobe's metadata
//    is fine but its sizing conventions and availability are not ours.
const pick = (a) => Array.isArray(a) ? (a.find(x => x.language_tag?.startsWith("en"))?.value ?? a[0]?.value) : undefined;
const byType = {};
for (let i = 0; i < 10; i++) {
  log(`fetching listings_${i}...`);
  for await (const line of gzLines(`${BASE}/listings/metadata/listings_${i}.json.gz`)) {
    if (!line.trim()) continue;
    let r; try { r = JSON.parse(line); } catch { continue; }
    const asin = r.item_id?.toUpperCase();
    if (!asin || !withModel.has(asin)) continue;
    if (r.country && r.country !== "US") continue;
    const type = pick(r.product_type) ?? r.product_type?.[0]?.value;
    if (!type) continue;
    (byType[type] ??= []).push({
      asin, name: pick(r.item_name), brand: pick(r.brand), color: pick(r.color),
    });
  }
}

const counts = Object.entries(byType).map(([t, v]) => [t, v.length]).sort((a, b) => b[1] - a[1]);
log(`\n${counts.length} product types with US models:`);
for (const [t, n] of counts.slice(0, 30)) log(`  ${String(n).padStart(5)}  ${t}`);
writeFileSync("abo-candidates.json", JSON.stringify(byType, null, 1));
log(`\nfull candidate list -> abo-candidates.json`);
