// Downloads selected Amazon Berkeley Objects models and compresses them into
// public/models/, then regenerates the model manifest.
//
//   node scripts/build-abo.mjs B073WH6N3R B07QD6V1VT ...
//
// Originals carry 4K PBR textures and run 25-40MB each, which is unusable in a
// browser; gltf-transform takes them to roughly 1-2MB with no visible loss at
// the sizes furniture is rendered. Models already present are skipped, so this
// is safe to re-run.
//
// ABO models are CC BY 4.0 — attribution is required wherever they appear.
import { existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const OUT = "public/models";
const TMP = join(process.env.TEMP || "/tmp", "abo-raw");
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

const asins = process.argv.slice(2).map((a) => a.toUpperCase());
if (!asins.length) { console.error("usage: node scripts/build-abo.mjs <ASIN>..."); process.exit(1); }

const mb = (p) => (statSync(p).size / 1048576).toFixed(2);
let done = 0, skipped = 0, failed = [];

for (const asin of asins) {
  const dest = join(OUT, `abo-${asin.toLowerCase()}.glb`);
  if (existsSync(dest)) { console.log(`= ${asin} already present`); skipped++; continue; }

  const raw = join(TMP, `${asin}.glb`);
  try {
    if (!existsSync(raw)) {
      // Individual files are public; the folder is the ASIN's last character.
      const url = `https://amazon-berkeley-objects.s3.amazonaws.com/3dmodels/original/${asin.slice(-1)}/${asin}.glb`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download HTTP ${res.status}`);
      writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
    }
    execFileSync("npx", ["--yes", "@gltf-transform/cli", "optimize", raw, dest,
      "--texture-size", "1024", "--compress", "draco"],
      { stdio: "pipe", shell: process.platform === "win32" });
    console.log(`+ ${asin}  ${mb(raw)}MB -> ${mb(dest)}MB`);
    done++;
  } catch (e) {
    failed.push(`${asin}: ${e.message.split("\n")[0]}`);
    console.error(`! ${asin} failed: ${e.message.split("\n")[0]}`);
  }
}

console.log(`\n${done} added, ${skipped} already present, ${failed.length} failed`);
if (failed.length) for (const f of failed) console.error("  " + f);
console.log("Now re-run the manifest generator to pick up the new files.");
