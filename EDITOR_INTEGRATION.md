# Editor + catalog — integration brief and revision journal

**Audience: the Claude Code agents working on the scanner and on the social
feed.** You do not need to read our code to work with us. This file says what we
built, the one change that touches you, and which files are ours so you can
avoid them.

It is also the running journal for this workstream. Newest entry at the bottom.

---

## What we built

The middle of the product: you scan a room, **we let you furnish it**. Select a
piece of furniture, drag it, rotate it, delete it, or swap it for a real product
you can buy — then snapshot the result and hand off to the feed.

Catalog is 31 live IKEA US products and 57 3D models.

---

## The one thing that touches you

**`src/lib/roomLayoutSchema.ts` gained a `binding` field on every object.**

```ts
binding: ItemBindingSchema.default({ source: "owned" })
```

Three arms: `owned` (the scan found it — someone already has it), `catalog` (a
real product, carries `catalogItemId`, `priceCents`, `url`), and `custom`.

**This is safe to land under you.** The `.default()` means every layout saved
before this change still parses and comes back as `owned`, which is exactly what
a scanned object is. Nothing you write needs to change, and **the layout
producer must not emit `binding`** — it is written client-side when a person
swaps something in.

Rebase onto this commit before building anything new on the schema.

For the feed: `total_budget_cents` stops being null the moment a person swaps in
a product, so **the budget filter can come out of hiding**. `priceCents` is
deliberately copied onto the binding rather than looked up from the catalog, so
a post keeps the price it had when it was shared.

**And the share button you asked for is in.** `/room` now has a Share link to
`/share?session=<id>`. That was your whole integration ask; it is done.

---

## File ownership

### Ours — please do not edit

```
src/lib/catalogItem.ts          the CatalogItem schema, toDimensions, toBinding
src/lib/catalog.ts              merges generated + manual, query helpers
src/lib/catalog.generated.ts    MACHINE OUTPUT — never edit, the build overwrites it
src/lib/catalog.manual.ts       hand-verified items; the build never touches this
src/lib/models.generated.ts     MACHINE OUTPUT — the 57 models and their real sizes
src/components/ProductMesh.tsx  loads a glTF model, scales it to real dimensions
src/components/CatalogPanel.tsx the furniture picker
scripts/build-catalog.mjs       IKEA live search -> catalog.generated.ts
scripts/build-abo.mjs           downloads + compresses ABO models
scripts/abo-survey.mjs          surveys what ABO has, without downloading geometry
scripts/add-manual.mjs          writes hand-measured items into catalog.manual.ts
public/models/                  57 .glb files
public/draco/                   Draco decoder
```

### Shared — we edited, carefully

- **`src/lib/roomLayoutSchema.ts`** — added `ItemBindingSchema`, the `binding`
  field, and an exported `ObjectCategory` type. Nothing existing was changed.
- **`src/components/RoomScene.tsx`** — selection, rotate, delete, add/swap, and
  the snapshot. The drag maths, the `Walls` component, the projective-texture
  path and the WebGL-context-loss recovery are untouched.
- **`next.config.ts`** — added `images.remotePatterns` for `www.ikea.com`, since
  catalog thumbnails are IKEA's own product photography.

### Yours — we have not touched any of these

`src/app/capture/`, `src/app/page.tsx`, `src/components/CaptureFlow.tsx`,
`FurnitureMesh.tsx`, `textures.ts`, `projectiveTexture.ts`, every API route, and
the whole social layer (`src/app/feed/`, `src/app/share/`, `src/app/p/`,
`src/components/social/`, `src/lib/{floorPlan,postMetadata,device,retry}.ts`).

---

## How the catalog works

Two sources, merged in `catalog.ts`, **manual wins on id collision**:

| File | What it is | Trust |
|---|---|---|
| `catalog.generated.ts` | Built from IKEA's live US search API | Prices/links/photos real; **most dimensions partly estimated** |
| `catalog.manual.ts` | Hand-measured off the product page | Fully trustworthy |

```bash
node scripts/build-catalog.mjs   # refresh prices, links, photos from IKEA
node scripts/add-manual.mjs      # write hand-measured items (edit its table first)
```

**Re-running `build-catalog.mjs` before the demo is the verification pass.** It
is cheap, it catches anything that went out of stock or changed price, and it
**cannot clobber a hand-measured item** — those live in `catalog.manual.ts`,
which the build never writes.

### `measuredAxes` is the honesty mechanism

IKEA publishes measurements unevenly. Every item records which axes were
actually read off the storefront; anything absent was inferred. The catalog
panel shows `measured` or `est.` from this field. **Do not fill this in unless
a human actually read the number.**

Current state: **4 of 31 fully verified.** The rest carry at least one inferred
axis. See "Still open" below.

---

## Things we learned the hard way

- **IKEA's two-number measurement is ambiguous and the payload does not say
  which.** `itemMeasureReferenceText` is the only measurement field that exists.
  Three numbers are always width × depth × height. Two numbers are width ×
  **height** for upright storage and mirrors, and width × **depth** for surfaces
  and seating. Reading a bookcase's `74 3/4"` as depth gives you a shelf 5cm
  tall and 1.9m deep.
- **Never infer a height by scaling a stand-in model.** Furniture height is
  standardised by category — a narrow desk is still ~75cm tall. Scaling a
  1.35m-wide model's height down to a 1.05m-wide product invents a 58cm desk.
  `TYPICAL_HEIGHT` in the build script exists for this.
- **Pair models by proportion, not by arrival order.** Round-robin pairing gave
  a 1.9m bookcase a 5cm wall-shelf mesh, which then stretched 36×. Scoring
  candidates on the axes actually measured took the worst case to 3.8×.
- **`preserveDrawingBuffer: true` is mandatory for snapshots.** Without it
  `toBlob`/`toDataURL` return a blank image **and report no error** — a working
  button that silently produces nothing.
- **The Draco decoder is self-hosted at `/draco/gltf/`.** drei defaults to
  fetching it from Google's CDN, which makes every furniture model a live
  network dependency at demo time.
- **Catalog thumbnails must be flat images.** Browsers cap simultaneous WebGL
  contexts around 8–16; a grid of live 3D previews crashes the tab.
- **ABO model dimensions come from each mesh's own bounding box**, not from
  `item_dimensions` (absent on ~70% of rows, often packaging sizes). Verified
  every one of the 57 files is a single flat node with no matrices or nested
  scales, so the measurement is exact.

---

## Attribution — required

3D models are **Amazon Berkeley Objects, CC BY 4.0**. Credit must appear
wherever the models are displayed. It is currently in the catalog panel footer.
If you surface models anywhere else, carry the credit with them.

The models are lookalikes, not the products they sit next to. The UI says
"representative model" and should keep saying so.

---

## Still open

1. **Dimension validation — the biggest one.** 27 of 31 items carry at least one
   inferred axis. Worst offenders: ALEX 3.8×, LINDBYN Mirror 3.0×, BARLAST Floor
   lamp 2.9×, LACK Coffee table 2.6×, MARIUS Stool 2.4×. Every item measured by
   hand so far landed under 2× — real numbers fix the size *and* let the pairing
   algorithm find a better mesh.
2. **NEIDEN and MALM bed sizes are unknown.** The IKEA API carries no size field
   and the URL slug omits it. Twin vs Queen is a 50cm error on the largest
   object in the room. Someone has to read the size selector on the page.
3. **SALTMYRAN Loveseat is 3.47m wide** — it inherited a sectional model's
   width. Left in deliberately as a visible example of the problem.
4. **Snapshot downloads locally, it does not upload.** `/api/upload` writes to
   the scanner's photo bucket that `/api/photos` polls, so pushing snapshots
   there would make them appear as captured photos on the desktop page. Wiring
   the snapshot to `posts.thumbnail_url` needs its own small endpoint.
5. **`public/models/` is 63MB in git.** Works, and Vercel serves it fine, but it
   is permanent in history. Moving it to Supabase Storage is the alternative.
6. **Not yet verified in a browser.** Build and types pass; drag feel, model
   orientation (especially wall art standing up) and how the lookalike scaling
   actually looks still need a human.

---

## Revision journal

### v1 — 2026-09-12 — editor, catalog, and 57 models

**Schema:** added `ItemBindingSchema` and the `binding` field, with a default
that keeps every pre-existing layout parsing.

**Catalog:** built `catalog.generated.ts` from IKEA's live US search API — 31
products, $8.99–$299, all with working `/p/` links and product photos. Added
`catalog.manual.ts` with 4 hand-measured items (HOVET Mirror, GLOSTAD Loveseat,
LOBERGET Swivel chair, KYRRE Stool).

**Models:** recovered the identity of the original 33 ABO meshes from ABO's
public metadata after the source folder was deleted, then surveyed ABO and added
24 more — 57 total, 63MB. Mirror coverage went 0 → 4, desk 3 → 6, table 3 → 7,
chair 2 → 5. All 31 catalog items now pair with a model; 26 of 31 pair under 2×
distortion.

**Editor:** click-to-select vs drag-to-move, rotate ±22.5°, delete, add from
catalog, swap selected. Catalog products render from glTF via `ProductMesh`;
everything else keeps the procedural `FurnitureMesh`. Running "new spend" total
in the HUD. Snapshot, and the Share link the social layer asked for.

**Verified:** legacy layouts parse and default to `owned`; catalog bindings
round-trip through the schema; malformed bindings reject. BILLY and MICKE
dimensions match the real IKEA products exactly. `npx next build` passes;
TypeScript clean; lint clean except one pre-existing `set-state-in-effect` error
in `RoomScene.tsx` that predates this branch.

**Removed:** `PARALLEL_AGENTS.md`, per the project owner — its three-agent
breakdown described the pre-LiDAR workstreams and was causing confusion. Note it
was also the only pointer to `IOS_LIDAR_AGENT.md` on the
`archive/swift-roomplan` branch, and the only written record of the
"never push to main, branch as agent-N" convention. Recoverable with
`git show 8f6863f:PARALLEL_AGENTS.md`.
