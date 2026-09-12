# Editor + catalog — integration brief and revision journal

**Audience: the Claude Code agents working on the scanner and on the social
feed.** You do not need to read our code to work with us. This file says what we
built, the changes that touch you, and which files are ours so you can avoid
them.

It is also the running journal for this workstream. Newest entry at the bottom.

**Scanner people: read [SCANNER_CONTRACT.md](./SCANNER_CONTRACT.md) instead.**
It is the standalone brief for what the editor needs from a scan — units,
coordinate space, categories, what not to send. This file is about the seams
between our three workstreams.

---

## What we built

The middle of the product: you scan a room, **we let you furnish it**. Select a
piece of furniture, drag it, rotate it, delete it, swap it for a real product you
can buy, hang posters, run LED strips, place a projector and see how big its
picture lands — then snapshot the result and get a costed shopping list.

40 catalog items and 57 3D models. Live at `/room?session=<id>`, and every
scanned room is now browsable at `/rooms`.

---

## What touches you

### 1. `binding` on every object (landed v1)

```ts
binding: ItemBindingSchema.default({ source: "owned" })
```

Three arms: `owned` (the scan found it), `catalog` (a real product, carries
`catalogItemId` / `priceCents` / `url`), `custom`. The `.default()` means every
layout saved before it still parses. **The scanner must not emit this** — its
answer is always "owned", and the default does that for you.

For the feed: `total_budget_cents` stops being null the moment someone swaps a
product in, so **the budget filter can come out of hiding**.

### 2. `preset` on an object (optional, additive)

A string like `"poster:comic:a2"` or `"led:ceiling"`, describing decor whose
variant is not a separate product. A scan never sets it. Anything that does not
recognise a preset can ignore the object.

### 3. `room.wallFeatures` (optional, additive)

Columns, boxed-in pipework and alcoves. Real rooms are not four flat rectangles,
and furniture that ignores a pillar ends up modelled inside it. Shape is in
SCANNER_CONTRACT.md. Absent means a plain rectangular room.

### 4. `/api/layout` now normalises on read AND write

This one matters most, and it is a **relaxation**, not a new requirement.

The route used to return the raw JSONB and validate strictly on save. Pointed at
the live database that was fatal twice over: every room saved before `binding`
existed came back without it and crashed the editor, and the scanner's real
output carries RoomPlan category names (`washerDryer`, `oven`) that the enum
rejects — so a room could be opened but never saved.

Both directions now go through `normalizeLayout()`, which maps unknown
categories (`television` → `tv`, `storage` → `shelf`/`dresser` by height,
appliances → `other`) and parses so defaults apply. **You can send RoomPlan's
own category names and we will cope**, though mapping them yourself is still
better — see SCANNER_CONTRACT.md. Anything unrecognised becomes `other` and
renders as a plain box.

### 5. The share button you asked for is in

`/room` links to `/share?session=<id>`. That was the social workstream's whole
integration ask; it is done.

---

## File ownership

### Ours — please do not edit

```
src/lib/catalogItem.ts          the CatalogItem schema, toDimensions, toBinding
src/lib/catalog.ts              merges the three catalog sources, query helpers
src/lib/catalog.generated.ts    MACHINE OUTPUT — the build overwrites it
src/lib/catalog.manual.ts       MACHINE OUTPUT of add-verified.mjs; hand-measured
src/lib/catalog.accessories.ts  diffuser + projector, hand-entered
src/lib/models.generated.ts     MACHINE OUTPUT — 57 models and their real sizes
src/lib/placement.ts            elevation, wall snapping, footprints, clamping
src/lib/posters.ts              poster sizes and generated artwork
src/lib/ledPresets.ts           LED runs, and which roll a run needs
src/lib/projection.ts           projector throw maths
src/lib/shoppingList.ts         grouping, totals, price parsing
src/lib/normalizeLayout.ts      schema drift + RoomPlan category mapping
src/components/ProductMesh.tsx  glTF scaled to a product's real size
src/components/PosterMesh.tsx   framed poster, artwork drawn at runtime
src/components/LedStrips.tsx    glowing runs + their invisible pick sleeves
src/components/AccessoryMesh.tsx diffuser, projector, projected image
src/components/MirrorMesh.tsx   reflective mirror
src/components/WallFeatures.tsx pillars, bumps, recesses
src/components/CatalogPanel.tsx the right-hand rail and drawer
src/components/RoomPanel.tsx    room dimensions and wall features
src/components/ShoppingList.tsx the costed list, with editable prices
src/app/rooms/page.tsx          the scanned-room index
src/app/api/sessions/route.ts   that index's data
scripts/*.mjs                   catalog + model build pipeline
public/models/                  57 .glb files
public/draco/                   Draco decoder
```

### Shared — we edited, carefully

- **`src/lib/roomLayoutSchema.ts`** — added `ItemBindingSchema`, `binding`,
  `preset`, `WallFeatureSchema`, `room.wallFeatures`, and an exported
  `ObjectCategory` / `WALL_SIDES`. Nothing existing was changed or removed.
- **`src/app/api/layout/route.ts`** — normalises on read and write (see above).
  The Supabase calls and the response shapes are untouched.
- **`src/components/RoomScene.tsx`** — the editor. The drag maths, projective
  textures and WebGL-context-loss recovery are the original ones.
- **`src/app/page.tsx`** — added a nav to `/rooms` and `/feed`. The QR flow,
  polling and inference trigger are untouched.
- **`next.config.ts`** — `images.remotePatterns` for `www.ikea.com`.

### Yours — we have not touched any of these

`src/app/capture/`, `src/components/CaptureFlow.tsx`, `FurnitureMesh.tsx`,
`textures.ts`, `projectiveTexture.ts`, every other API route, and the whole
social layer (`src/app/feed/`, `src/app/share/`, `src/app/p/`,
`src/components/social/`, `src/lib/{floorPlan,postMetadata,device,retry}.ts`).

---

## How the catalog works

Three sources, merged in `catalog.ts`. **Hand-authored wins on id collision.**

| File | What it is | Trust |
|---|---|---|
| `catalog.generated.ts` | IKEA's live US search API | Prices/links/photos real; some dimensions estimated |
| `catalog.manual.ts` | Hand-measured off product pages | Fully trustworthy |
| `catalog.accessories.ts` | Amazon accessories, hand-entered | Fully trustworthy |

```bash
node scripts/build-catalog.mjs   # refresh prices, links, photos from IKEA
node scripts/add-verified.mjs    # rewrite hand-measured items (edit its tables first)
```

**Re-running `build-catalog.mjs` before a demo is the verification pass.** It is
cheap, catches anything that changed price or went out of stock, and **cannot
clobber a hand-measured item** — those live in files the build never writes.

### `measuredAxes` is the honesty mechanism

Every item records which axes a retailer actually stated. Anything absent was
inferred and the UI marks it "est." rather than passing it off as measured.
**Do not fill this in unless a human read the number off the page.**

Current state: **37 of 40 fully measured.** The three left are LACK (height),
LINDBYN Mirror (depth) and ALEX on casters (depth) — all axes IKEA does not
publish on a listing card.

---

## Things we learned the hard way

- **A zod default only applies to something that was PARSED.** Returning stored
  JSONB straight from a route skips every default, so a field added last week is
  simply missing on every older row. This crashed the editor on all 20 existing
  rooms before `normalizeLayout` existed.
- **IKEA's two-number measurement is ambiguous and nothing in the payload says
  which.** Three numbers are width × depth × height. Two are width × **height**
  for upright storage and mirrors, width × **depth** for surfaces and seating.
  Reading a bookcase's `74 3/4"` as depth gives a shelf 5cm tall and 1.9m deep.
  Confirmed later from ALEX and MICKE listing cards.
- **Never infer a height by scaling a stand-in model.** Furniture height is
  standardised per category; a narrow desk is still ~75cm tall.
- **A category is too coarse for height on its own.** A floor lamp and a table
  lamp are both `lamp` and differ by a metre. Read the product type.
- **Footprints must account for facing.** `dimensions` are in an object's local
  frame, so a bookcase turned 90° occupies its DEPTH along X. Ignoring that held
  a rotated shelf 26cm off the wall it was pointed at.
- **`preserveDrawingBuffer: true` is mandatory for snapshots.** Without it
  `toBlob`/`toDataURL` return a blank image **and report no error**.
- **The Draco decoder is self-hosted at `/draco/gltf/`.** drei defaults to
  Google's CDN, which makes every furniture model a live network dependency at
  demo time.
- **Catalog thumbnails must be flat images.** Browsers cap simultaneous WebGL
  contexts around 8–16; a grid of live 3D previews crashes the tab.
- **Thin geometry needs a fat invisible pick target.** An 18mm LED strip cannot
  be clicked; a 90mm invisible sleeve around it can.
- **OrbitControls' `dollyIn`/`dollyOut` are named after the camera's radius,**
  not the apparent size of the room. "Zoom in" calls `dollyOut`.

---

## Attribution — required

3D models are **Amazon Berkeley Objects, CC BY 4.0**. Credit must appear
wherever the models are displayed; it is currently in the catalog panel footer.
If you surface models anywhere else, carry the credit with them.

The models are lookalikes, not the products beside them. The UI says
"representative model" and should keep saying so. Poster artwork is original
work generated at runtime, deliberately not real cars, athletes or comic
characters, because this app publishes rooms to a public feed.

---

## Where the 3D models come from

Two sources, in priority order.

**1. IKEA's own glTF — 28 of 38 IKEA products.** IKEA ships these to power the
"View in 3D" button; they are the exact assets behind its AR app, so they are
the product, at the product's real size. A MICKE desk measures
`1.050 × 0.754 × 0.501` against a product page stating `1.051 × 0.749 × 0.498`.
They are already Draco-compressed and a fraction of the size of a stand-in.

`scripts/fetch-ikea-models.mjs` records their **URLs**; it does not download
geometry. `/api/ikea-model?id=<catalog id>` fetches the bytes server-side at
request time. Two reasons it has to work that way:

- `web-api.ikea.com` returns **403 to any request carrying an `Origin` header**,
  so a browser cannot load these cross-origin however permissive the
  `Access-Control-Allow-Origin: *` on the response looks.
- **No IKEA asset ends up in this repository.** This repo is public and the app
  is publicly deployed, so committing IKEA's models would be redistributing
  someone else's copyrighted work, which is a different thing from a browser
  loading them to display a product. Proxying keeps us on the right side of
  that line. The route takes a catalog **id**, never a URL, so it cannot be
  pointed at an arbitrary host.

**2. Amazon Berkeley Objects stand-ins — everything else.** CC BY 4.0, and
*not* the product they sit beside, so they are stretched to the product's real
footprint and the UI says "representative model". This is the path that made a
swivel chair render as a plain chair; it is now the fallback rather than the
default.

Anything with neither renders as a procedural `FurnitureMesh` shape.

**Re-run `fetch-ikea-models.mjs` if a product stops rendering** — the URLs carry
a content hash and change when IKEA updates a model.

---

## Still open

1. **Three catalog items still carry one estimated axis** (above).
2. **The snapshot downloads; it does not upload.** `/api/upload` writes to the
   scanner's photo bucket that `/api/photos` polls, so putting snapshots there
   would make them appear as captured photos on the desktop page. Wiring the
   snapshot to `posts.thumbnail_url` needs its own small endpoint.
3. **`public/models/` is 63MB in git.** Works, and Vercel serves it fine, but it
   is permanent in history. Supabase Storage is the alternative.
4. **The scans in the database are 8.8 × 7.2m** — apartment-sized. The catalog
   is curated for dorms, so a 1.05m desk reads small in them.
5. **One pre-existing lint error**, `set-state-in-effect` in `RoomScene.tsx`,
   predates this branch.
6. **Supabase keys were shared in plain text** during setup and this repo is
   public. Nothing leaked — `.env.local` is gitignored — but rotate them.

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

### v2 — 2026-09-12 — elevation, decor, real data, and the scanner contract

Eighteen commits. The editor went from "move furniture on a floor" to something
that survives a real scan and produces something you can act on.

**Elevation.** Three placement rules by mount: floor pieces slide as before;
tabletop pieces come to rest on whatever is under them, so a desk lamp rises
onto a nightstand and drops onto a lower desk with nobody typing a height; wall
pieces snap to the nearest wall and then move freely up and down it. Rugs are
excluded as surfaces — you stand on the floor a rug covers.

**Decor and tech.** Posters (4 designs × 4 print sizes, artwork generated at
runtime, no price so they cannot pollute a budget). LED runs stored as a *rule*
rather than geometry, so moving the desk moves the strip above it; only runs the
room can hold are offered, and the run's length picks which roll you buy. An
ASAKUKI diffuser and a mini projector, both hand-measured from their listings.
The projector draws its **real** picture on the wall it faces — throw ratio
1.355 derived from the listing's own distance table, reproducing its 50″ and 72″
rows to within 4cm — and the rectangle turns red when it no longer fits.

**Shopping list.** A snapshot now returns the picture *and* what it would cost.
Identical items collapse to one line with a quantity, scanned furniture is
excluded, prices are editable and write back to every object on that line, and
an unpriced line says so rather than counting as free.

**The room itself.** All four walls render, each hiding only while the camera is
outside it — which let wall opacity go from 40% to 88%, so rooms stopped looking
like ghosts. `room.wallFeatures` describes pillars, bumps and alcoves. Room
dimensions are editable behind a deliberate unlock, because a scan's size is a
measurement rather than a preference.

**Real data, and two bugs it found.** Pointed at the live Supabase project, the
editor would have crashed on all 20 existing rooms (`binding` absent from
unparsed JSONB) and then refused to save the ones it could open (RoomPlan
categories rejected). `normalizeLayout` fixes both, on read and write.

**A bug reported from a screenshot.** A shelf turned to face a side wall could
not be pushed against it: footprints ignored facing, so a 0.80 × 0.28 bookcase
turned 90° was treated as 0.80 wide along X and held 26cm short. `extentsOf`
rotates the footprint before measuring; everything that positions an object goes
through it.

**Measurements.** 37 of 40 items fully measured, up from 12. Six product
variants added from listing cards the search API never surfaced (NEIDEN Full,
two more MICKE desks, three more ALEX units). **One retraction:** a screenshot
read earlier as GLOSTAD turned out to be SALTMYRAN — two sofas cannot share one
set of numbers, so GLOSTAD's were withdrawn and re-measured later.

**Connective tissue.** 23 scanned rooms sat in the database with no way to reach
any of them; `/rooms` lists them all and opens the editor on one. Undo, redo and
reset, with Ctrl/Cmd+Z. The catalog moved from one button in the toolbar to a
permanent right-hand rail. Zoom was inverted and is now not.

**Written:** [SCANNER_CONTRACT.md](./SCANNER_CONTRACT.md), the standalone brief
for the scanner. Every payload in it is executed against the real schema.

**Verified against the live project:** a 28-object, 124-camera-frame LiDAR scan
loads with every binding present and no invalid categories, and a moved chair
round-trips through PUT and back with the frames intact. `npx next build`,
TypeScript and lint all pass, bar the pre-existing error noted above.

### v3 — 2026-09-12 — the real IKEA models

The stand-in approach had a visible failure: pick a swivel chair from the
catalog and a plain chair appears in the room, because the mesh was never that
product — it was whichever Amazon Berkeley Objects chair had the closest
proportions, stretched to fit.

IKEA publishes its own glTF for most products, behind the "View in 3D" button.
Verified on MICKE: `1.050 × 0.754 × 0.501` against a product page stating
`1.051 × 0.749 × 0.498` — within 7mm on every axis, correct axis order, already
Draco-compressed, and smaller than the stand-in it replaces. **28 of 38 IKEA
products have one.**

These are used **unscaled**. The mesh is the product; our recorded dimensions
are a transcription of the same thing, so rescaling could only ever make it less
accurate. Stretching now applies only to the ABO stand-ins that genuinely are
not the product.

Nothing is downloaded into the repo. `fetch-ikea-models.mjs` records URLs and
`/api/ikea-model` proxies the bytes, which is necessary anyway —
`web-api.ikea.com` 403s any request with an `Origin` header — and avoids
redistributing IKEA's assets from a public repo. The route takes a catalog id,
not a URL, so it is not an open proxy.

The 10 IKEA products with no published model, plus both Amazon accessories, keep
their stand-ins or procedural shapes.

**One thing to be clear about:** these are IKEA's copyrighted assets. Proxying
them the way a browser would is a reasonable footing for a hackathon demo, and
materially better than committing copies. It is not a licence. Anything beyond
a demo needs IKEA's permission.
