# Roomii

Roomii turns a phone scan of a bedroom, dorm room, or studio into an accurate, editable 3D floor plan. From there you drag furniture around, swap pieces for real IKEA products while the total cost updates as you go, and publish the finished layout to a feed where people browse by actual room dimensions instead of vibes.

## Table of contents

1. [What problem this solves](#what-problem-this-solves)
2. [Who it's for, and how it helps](#who-its-for-and-how-it-helps)
3. [What it actually does](#what-it-actually-does)
4. [How it works, end to end](#how-it-works-end-to-end)
5. [Architecture and stack](#architecture-and-stack)
6. [Project structure](#project-structure)
7. [Data model](#data-model)
8. [Running it yourself](#running-it-yourself)
9. [Using the app](#using-the-app)
10. [What's real vs. illustrative](#whats-real-vs-illustrative)
11. [Known limitations and explicit non-goals](#known-limitations-and-explicit-non-goals)
12. [Further reading in this repo](#further-reading-in-this-repo)
13. [Credits](#credits)

## What problem this solves

Furnishing a small room runs into the same problem over and over: you can't tell if something fits until it's already sitting there. Most people solve this with a tape measure, a rough mental picture, and eventually some furniture that gets returned once the mental picture turns out to be wrong. The tools that exist to help either live entirely in your head, require CAD skills nobody untrained picks up in an afternoon, or are inspiration boards like Pinterest that show a beautiful room with no way to tell if it would fit yours, because a photo carries no dimensions.

None of the popular room-planning apps start from a scan of your actual room. They start from a blank canvas you drag boxes onto by eye, which just reintroduces the guesswork they're supposed to remove. Meanwhile, most phones sold in the last several years carry a LiDAR depth sensor whose main job today is Face ID and portrait-mode blur, a genuinely underused piece of hardware for exactly this problem.

Roomii starts from the room's real geometry instead of a guess, so the "does this actually fit" question doesn't get quietly skipped.

## Who it's for, and how it helps

Someone moving into a dorm or a small rental who wants to know, before buying anything, whether a desk and a wardrobe and a beanbag chair can coexist in a 3.2 by 4.0 meter room, and wants a real, priced shopping list at the end rather than a mood board.

Someone who already has furniture and just wants to see if a rearrangement works, without moving a 40 kg dresser three times to find out.

Someone looking for inspiration who wants to see other real rooms close to their own size, because a wide-open loft's layout is useless advice for a 12 square meter dorm.

The measurement-first approach is the whole point: every distance in the app is a real, stored number in meters, taken from an actual scan rather than an artist's impression. That's also what makes the feed different from an ordinary Pinterest board: designs can be filtered and compared by dimension, so someone furnishing a small room only sees layouts that could plausibly work in a room their size, and can then see what other people actually thought of it in the comments underneath, not just how many stamps it collected.

## What it actually does

- Scans a room with a phone's LiDAR sensor, through a companion iOS app, and reconstructs real wall positions, room dimensions, doors, windows, and whatever furniture Apple's on-device model already recognizes.
- Renders the room in interactive 3D in the browser: walk around it, select any object, drag it to a new spot, rotate it, or delete it.
- Swaps scanned furniture for real, buyable products from a catalog of roughly fifty IKEA-sourced items, each with a real price, a real product link, and a 3D model scaled to that product's actual measured size, so a couch picked in the app is the exact couch that shows up at the door.
- Adds decor a LiDAR scan can't see on its own: posters, LED strip lighting, a desk lamp, a projector that shows exactly how large its projected image will be on your actual wall, and a mirror with a real reflection.
- Builds a running, itemized shopping list with a live total, generated from whatever is currently placed in the room.
- Infers the room's real appearance where geometry alone can't show it, sampling wall, floor, and object colors from the scan's photos, or a plausible guess from Gemini when a scan carries no imagery, and projecting the photographed textures back onto the 3D model where it can.
- Publishes finished designs to a public feed (`/feed`) that others can filter by room type, size, style tags, and budget, and can "stamp" (the app's word for a like).
- Lets people comment on a published design, so a plan gets an actual conversation under it instead of just a like count.
- Surfaces similar rooms under any published design, ranked by how closely their real dimensions and layout resemble it, because "rooms that look nice" is a much weaker filter than "rooms shaped like mine."
- Gives every scanned room a permanent page (`/rooms`) whether or not it's ever published, and every post its own link (`/p/[id]`) and a per-author profile (`/u/[handle]`).

## How it works, end to end

```
   Phone (LiDAR)                Roomii web app                          Feed
┌──────────────────┐      ┌────────────────────────────┐      ┌──────────────────────┐
│  Companion iOS    │ scan │ /  → QR code → deep link    │      │                      │
│  app walks the    ├─────►│ roomscanner://scan?session  │      │  Public feed of       │
│  room with        │      │                              │      │  published designs   │
│  ARKit RoomPlan   │      │ Uploads a validated          │      │  filterable by room   │
└──────────────────┘      │ RoomLayout JSON straight to  │      │  size, type, style,   │
                           │ PUT /api/layout              │      │  budget               │
                           │                              │      │                       │
                           │ /room?session=<id>           │ share│  /feed  /p/[id]       │
                           │  ┌─────────────────────────┐ │─────►│  /u/[handle]         │
                           │  │ 3D editor (r3f + three) │ │      │  /leaderboard         │
                           │  │ - drag / rotate / delete│ │      └──────────────────────┘
                           │  │ - swap in IKEA catalog   │ │
                           │  │ - posters, LEDs, lamps,  │ │
                           │  │   mirrors, a projector   │ │
                           │  │ - live shopping list     │ │
                           │  └─────────────────────────┘ │
                           └────────────────────────────────┘
                                          ▲
                                          │ vision + structured JSON
                                          │ (color inference, small-object
                                          │  detection, the original
                                          │  photo-based layout inference)
                                   ┌─────────────┐
                                   │ Gemini API  │
                                   └─────────────┘
                                          ▲
                                          │ storage + Postgres
                                   ┌─────────────┐
                                   │  Supabase   │
                                   └─────────────┘
```

1. **Scan.** A visitor to the site scans a QR code with their phone, which opens a companion iOS app straight into a capture session (`roomscanner://scan?session=<id>`). Walking the room once with the phone's LiDAR sensor (Apple's RoomPlan framework) produces an accurate 3D reconstruction of the walls, doors, windows, and any furniture Apple's on-device model can already recognize.
2. **Upload.** The app uploads that reconstruction as a single validated JSON payload directly to `PUT /api/layout`. The browser tab that showed the QR code polls in the background and redirects itself to the finished room the moment the layout lands, no page reload, no manual step.
3. **Enrich.** Two things the LiDAR sensor can't capture on its own get filled in afterward by Gemini, working from the photos taken during the scan: real wall, floor, and object colors (`/api/colorize`), and small fixtures RoomPlan's fixed category list doesn't cover, things like a thermostat, an outlet, a light switch, or a wall clock, found in the photos and back-projected onto the already-scanned geometry (`/api/detect-details`).
4. **Arrange.** The room opens in an interactive 3D editor built on react-three-fiber. Every object can be selected, dragged (constrained to sensible surfaces, so a wall-mounted TV slides at its own height and a desk lamp stays on the desk), rotated, or deleted. A catalog panel on the right lets any object get swapped for a real IKEA product, with the real product photo projected onto its 3D model and the real price flowing into a live shopping list.
5. **Share.** One button snapshots the arranged room and publishes it, with a caption and room type, to the public feed. The feed doesn't query the design tables directly; it stores a snapshot of the metadata that matters (dimensions, area, style, budget) at publish time, so browsing the feed never has to touch or understand the editor's live JSONB layout format.
6. **Browse.** Other visitors filter `/feed` by room type, size, dimensions, style, or budget, stamp the ones they like, leave a comment, and open any post to see the full 3D room or find dimensionally similar rooms underneath it.

## Architecture and stack

| Layer | Choice | Role |
|---|---|---|
| Framework | Next.js 16 (App Router) + TypeScript, single deployment | Pages, API routes, and the whole app in one Vercel deployment |
| 3D rendering | three.js + react-three-fiber + @react-three/drei | The interactive room editor: geometry, materials, drag/rotate, camera controls |
| Room capture | Apple RoomPlan (ARKit), in a companion iOS app | LiDAR-based real-world room reconstruction, the source of truth for geometry |
| AI inference | Google Gemini (`@google/genai`), structured JSON output | Color/material inference, small-object detection from photos, and the original photo-based layout inference path |
| Schema validation | Zod | A single `RoomLayout` schema is the contract every producer (LiDAR app, Gemini, the editor) must satisfy; anything that doesn't parse fails loudly instead of rendering as a broken room |
| Data & storage | Supabase (Postgres + Storage) | `rooms`, `posts`, `post_comments`, `post_likes` tables; a public Storage bucket for photos, renders, and thumbnails |
| Styling | Tailwind CSS v4 | Utility-first styling across both the editor and the social feed |
| Product catalog | IKEA's public storefront, hand-measured supplementary data, and the Amazon Berkeley Objects dataset | Real, buyable furniture with accurate dimensions and 3D models |
| Identity | None, a `localStorage` device id and a chosen display name | No accounts, no passwords, no login screen anywhere in the product |

It's one Next.js project instead of a split frontend and backend: the same deployment serves the 3D editor pages and the API routes that talk to Supabase and Gemini, so there's nothing extra to host, and API routes give a clean, typed boundary for anything, whether that's the iOS app or a browser tab, that needs to read or write a room.

Room capture happens in a native iOS app rather than the browser because depth-accurate geometry needs a LiDAR sensor, and no browser API exposes depth (`getUserMedia` gives you pixels, not depth). Apple's RoomPlan framework is built for exactly this, it's the same technology behind the Measure app's room-scanning mode, so the scanning step had to live outside the browser. The two sides only ever share a session id: the web page shows a QR code containing a `roomscanner://` deep link, the iOS app opens straight into a scan for that session, and the finished layout gets written back through the same `/api/layout` endpoint the browser also uses. Neither side needs to know anything about the other's internals.

Gemini covers what's left of the vision work once real geometry exists. Once you have geometry, questions like "what color is this wall" or "is there a thermostat in this photo" are small, structured, multimodal reasoning tasks rather than something that needs a bespoke computer-vision pipeline. It was picked specifically because it accepts multiple images alongside a JSON response schema, so one call can be constrained to return exactly the shape the app needs, and a malformed response becomes a validation error instead of a silent bug. (The project's early build notes explain why other providers were considered and ruled out for this; see [`PLAN.md`](PLAN.md).) The same structured-JSON approach also powers the original capture path, from before the LiDAR app existed: a handful of phone photos sent to Gemini with a forced JSON schema, described in [`SCANNER_CONTRACT.md`](SCANNER_CONTRACT.md). That path is still in the codebase and still works end to end.

Supabase covers Postgres and object storage from one provider, reachable from Next.js API routes with a single server-side key. That meant no separate auth service, no separate file host, and no ops surface to maintain during a short build window. Row-level security is on with zero policies on every table: the anon key can't touch anything, and all reads and writes go through server API routes using the service-role key, so every access rule lives in application code that can be reviewed in one place instead of scattered across database policies.

Zod is the contract between the three things that can produce a room layout: the iOS LiDAR app, the legacy Gemini photo-inference path, and a person dragging furniture around in the editor. Rather than trust all three to agree by convention, one schema (`src/lib/roomLayoutSchema.ts`) defines what a valid room looks like, and every read and write normalizes through it, including mapping Apple's own RoomPlan category names onto the app's furniture categories automatically, so the LiDAR app never has to know the web app's internal vocabulary.

The catalog is built from real products instead of generic 3D primitives, because a shopping list is only honest if the prices and dimensions are real. It merges IKEA's live product search (current prices, links, photos) with hand-measured entries where precision mattered more than automation, plus a small set of Amazon Berkeley Objects models and a couple of hand-entered accessories (a diffuser, a projector) IKEA doesn't sell. Wherever a scanned object gets swapped for a catalog item, the 3D model is scaled to that product's actual measured size instead of a fixed-proportion stock asset, so what shows up in the editor is what would actually arrive.

There are no accounts. The core loop, scan a room, arrange it, see if it fits, needs to work for a first-time visitor in under a minute, and a login wall in front of that would be pure friction for no real benefit at this stage. A display name typed once plus a device id in `localStorage` is enough to attribute posts, comments, and likes, and to stop the same browser from stamping a post twice, which is all the social layer actually needs.

## Project structure

```
src/
  app/
    page.tsx                  Landing page: QR handoff to the iOS scan, recent-plans rail
    capture/                  Legacy browser photo-capture flow (superseded by the LiDAR app)
    room/                     The 3D editor, the heart of the product
    rooms/                    Index of every scanned room (owner's view)
    feed/                     The public, filterable social feed
    p/[id]/                   A single published post's detail page
    share/                    The share composer (caption, room type, style tags → publish)
    u/[handle]/               A per-author profile page
    leaderboard/              Illustrative ranking page (see "What's real vs. illustrative")
    api/
      layout/                 GET/PUT a room's layout, the seam every capture path writes through
      upload/, photos/        Legacy photo-capture upload + polling endpoints
      infer-layout/           Legacy Gemini photo → layout inference
      colorize/               Gemini: infer real colors for a LiDAR scan (no photos → no color)
      detect-details/         Gemini: find small fixtures in photos, place them in 3D
      rooms/[session]/render/ Stores a 3D snapshot of a room for use as its thumbnail
      posts/[id]/comments/    Post, read, and delete comments on a published design
      feed/, posts/, sessions/, thumbnail/  Social layer + room-index endpoints
  components/
    RoomScene.tsx              The 3D editor scene: drag, rotate, materials, lighting
    CatalogPanel.tsx           The IKEA/catalog swap panel and shopping-list rail
    ShoppingList.tsx           Costed, editable list of everything currently placed
    ProductMesh.tsx, PosterMesh.tsx, LedStrips.tsx, AccessoryMesh.tsx, MirrorMesh.tsx, WallFeatures.tsx
                                Rendering for catalog products, posters, LEDs, the projector/diffuser, mirrors, and structural wall features
    social/                    Feed, filters, share composer, post cards, comment thread, similar-rooms rail
  lib/
    roomLayoutSchema.ts         The single source of truth for what a valid room is
    normalizeLayout.ts          Reconciles RoomPlan's category names with the app's own
    catalog.ts, catalogItem.ts  Merges the three catalog sources; product → 3D-model mapping
    placement.ts, projection.ts, backproject.ts
                                Wall-snapping/elevation math, projector throw math, photo back-projection
    postMetadata.ts             The one file that reads the design half's data, for the feed
    floorPlan.ts, similarity.ts Floor-plan SVG generation; "rooms like this one" ranking, shared by the similar-rooms rail and the For You tab
scripts/                        One-off setup + catalog-build scripts (see below)
landing/                        A separate static marketing/pitch page (index.html)
```

## Data model

Four Postgres tables, all behind Supabase Storage for images, all access through server-side API routes since row-level security is on with zero policies (the public anon key can't touch any of them directly):

- **`rooms`**: `session_id` as the primary key, the full `layout` as JSONB, an optional 3D `render_url` snapshot, and `updated_at`. One row per scanned room, whether or not it's ever published.
- **`posts`**: a published design. Points back at `rooms.session_id`, deliberately not a foreign key, so deleting a design never deletes its post, plus a snapshot taken at publish time: room type, width/length/area in meters, style tags, total budget, object count, and denormalized `like_count` and `comment_count`. The feed only ever queries this table, never joining into `rooms.layout`, so ranking and filtering stay fast and the design side of the app is free to change shape without breaking the feed.
- **`post_likes`**: a composite key on `(post_id, device_id)`, so a duplicate "stamp" from the same browser is a database constraint violation rather than application logic that has to get it right.
- **`post_comments`**: one row per comment, holding `post_id`, `author_handle`, `device_id`, and `body`. A `hidden` boolean lets a comment get suppressed without deleting it (there's no moderation UI behind it yet, so this is currently a manual database edit), and `posts.comment_count` is recounted on every write rather than incremented, so it can't drift from what's actually there.

Full DDL, with the reasoning for each choice, lives in [`scripts/create-rooms-table.sql`](scripts/create-rooms-table.sql), [`scripts/create-social-tables.sql`](scripts/create-social-tables.sql), and [`scripts/create-comments-table.sql`](scripts/create-comments-table.sql).

## Running it yourself

```bash
git clone <this repo>
cd InteriorDesign
cp .env.example .env.local     # fill in real Supabase + Gemini keys, see below
npm install
npm run setup:storage          # one-time: creates the room-photos Storage bucket
# then run, in order, in the Supabase dashboard's SQL Editor:
#   scripts/create-rooms-table.sql
#   scripts/create-social-tables.sql
#   scripts/create-comments-table.sql
npm run dev
```

Open `http://localhost:3000`. Note that the LiDAR scan step needs a real HTTPS URL (a phone's camera/AR APIs refuse to run over `http://` or a bare LAN IP), so a full end-to-end scan test needs either a deployed URL or a tunneling tool. `localhost` is fine for everything except the live scan handoff itself.

### Environment variables

All documented in [`.env.example`](.env.example):

| Variable | Where to get it | Used for |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API | Client + server Supabase access |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page | Public client key |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page ("service_role" secret) | Server-only key used in API routes to bypass RLS, never exposed to the browser |
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Color inference, small-object detection, legacy photo-based layout inference |

### Useful scripts

```bash
npm run dev              # local dev server
npm run build             # production build
npm run lint              # eslint
node scripts/seed-social.mjs        # seed the feed from whatever real layouts already exist
node scripts/build-catalog.mjs      # refresh prices/links/photos from IKEA's live storefront
node scripts/add-verified.mjs       # rewrite the hand-measured catalog entries
```

## Using the app

Open the deployed site on a laptop or desktop, since it needs a second screen: the phone does the scanning, the browser shows the result. Click **Scan your room**, then scan the QR code with an iPhone that has the companion Roomii scanning app installed, and walk the room once while the LiDAR sensor does the measuring. The browser tab updates itself automatically the moment the scan lands, no refresh needed.

In the 3D editor, click any object to select it, drag to move it, use the on-screen controls to rotate or delete it, and open the catalog panel to swap it for a real product. Add posters, LED runs, a lamp, a mirror, or a projector from the same panel, and everything shows up in the shopping list on the right with a running total.

Click **Share this design**, add a caption and pick a room type, and publish. Then browse `/feed` to see everyone else's published rooms: filter by room type, size, style, or budget, stamp the ones worth remembering, and leave a comment on anything you have thoughts about.

## What's real vs. illustrative

Everything described here runs against the real Supabase project and the real Gemini API, with one deliberate exception: `/leaderboard` is illustrative, hand-authored sample data, built to demonstrate a ranking concept for a pitch. It isn't wired to the real `posts`/`post_likes` tables yet, and the page says so directly. Everything else in this README, the scan, the editor, the catalog, the shopping list, the feed, filters, stamps, comments, similar-rooms ranking, and per-author pages, is fully functional against real data.

## Known limitations and explicit non-goals

- **Not photorealistic reconstruction.** This pipeline (LiDAR geometry, inferred colors, real product photos) was never meant to be Street View-level photogrammetry. That would need dozens of calibrated photos and a full NeRF or photogrammetry pipeline; this app trades that for something that works from one roughly 40-second phone walkthrough.
- **No accounts, no auth**, by design (see above). There's accordingly no way to edit or delete a post after publishing, no following or followers, and comment moderation is a hidden flag on each row with no admin UI behind it yet.
- **The leaderboard is a mockup**, not a live ranking (see above).
- **Feed pagination is offset-based**, not a keyset cursor. That's a deliberate tradeoff since most of the feed's sort orders rank by stamp count, which a plain `created_at` cursor can't page through. Fine at the current scale, worth revisiting well before the feed reaches a few thousand posts.
- **"For You" is a hand-tuned score, not a learned model.** When you've published a room this session, the For You tab re-ranks the fetched page of recent posts by a similarity score against your own most recently published room (room type, area, shared style tags, object density), the same scoring function that drives the similar-rooms rail on a post page. It doesn't use click or like history and there's no embeddings behind it, so it's closer to "rooms shaped like yours" than to a personalized recommender. If you haven't published a room yet, the tab just falls back to chronological order.

## Further reading in this repo

The team kept detailed, dated engineering journals alongside the code, written for future contributors rather than as throwaway notes. Worth reading if you want the full reasoning behind a specific piece:

- [`PLAN.md`](PLAN.md): the original build plan and the reasoning for the initial stack choices, including why Gemini specifically over other AI providers considered.
- [`SCANNER_CONTRACT.md`](SCANNER_CONTRACT.md): the exact contract any capture source (LiDAR app or otherwise) must satisfy to hand a room off to the editor: units, coordinate space, categories, common mistakes.
- [`EDITOR_INTEGRATION.md`](EDITOR_INTEGRATION.md): how the 3D editor and catalog were built, file-by-file ownership, and how the catalog is assembled from its three sources.
- [`SOCIAL_PLAN.md`](SOCIAL_PLAN.md) and [`SOCIAL_INTEGRATION.md`](SOCIAL_INTEGRATION.md): the design rationale for the feed (why it snapshots instead of joining live data) and a running revision journal of everything that changed in that workstream over time, comments included.

## Credits

Built as a team project. Room geometry via Apple's RoomPlan/ARKit. AI inference via Google's Gemini API. Data and storage via Supabase. Furniture data and imagery sourced from IKEA's public storefront and the Amazon Berkeley Objects dataset, used for accurate, real-world product dimensions.
