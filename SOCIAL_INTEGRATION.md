# Social layer — integration brief and revision journal

**Audience: the Claude Code agents working on the LiDAR scan and the room
editor.** You do not need to read our code to work with us. This file tells
you what we built, the one change we need from you, and which files are ours
so you can avoid them.

It is also the running journal for this workstream. Every revision gets an
entry at the bottom; read the latest one to see what changed since you last
looked.

---

## What we built

A public feed of scanned rooms at `/feed`. Someone finishes a design, taps
share, adds a caption and a room type, and it appears in a grid other people
can filter, sort and stamp (our word for like). Each card shows a top-down
floor plan generated from the layout JSON.

It is live and working against the shared Supabase project, seeded from the
real layouts already in `rooms` — so the post count grows as you add scans.

---

## The one thing we need from you

**Add a share button in the room editor that navigates to
`/share?session=<sessionId>`.**

That is the entire integration. One link. Everything after it is ours.

```tsx
<Link href={`/share?session=${sessionId}`}>Share this design</Link>
```

Put it wherever it fits in your UI. We do not care how it looks and will not
touch your styling to change it.

### And one question we need answered

**Is a design permanently identified by `rooms.session_id`?**

We store `session_id` on every post as the link back to the design. If you
are planning a `designs` table with its own primary key, tell us now — it is
a one-line change today and a data migration once the feed has real posts in
it. If the answer is "session_id forever", just say so and we will stop
asking.

---

## What we read from your data, exactly

One file reads your side of the app and nothing else does:
**`src/lib/postMetadata.ts`**. If you change the layout shape, that is the
only place it can hurt us.

At publish time we read a validated `RoomLayout` and copy these onto the post
row:

| We store | We read it from |
|---|---|
| `width_m` | `layout.room.width` |
| `length_m` | `layout.room.length` |
| `area_m2` | `width × length` |
| `object_count` | `layout.objects.length` |
| `total_budget_cents` | sum of `objects[].binding.priceCents`, or null |
| `room_type` | **the author**, in our composer — not from the layout |
| `style_tags` | **the author**, in our composer |

We also render `layout.objects[]` (`position`, `dimensions`, `rotationY`,
`category`, `color`) and `layout.room.floorColor` / `wallColor` into the
floor-plan SVG.

**We snapshot, we do not join.** Once a post exists, the feed queries only
our tables. Rearranging a room does not rewrite its posts — that is
deliberate, so a post keeps describing what was actually shared. The floor
plan is the exception: it is generated live, so it always matches the current
layout.

**We never write to `rooms`.** Ever. If a row in `rooms` changes, it was not
us.

---

## File ownership

### Ours — please do not edit

```
src/lib/postMetadata.ts              the seam; the only file that reads your data
src/lib/floorPlan.ts                 layout JSON -> top-down SVG
src/lib/device.ts                    per-browser handle + stamp identity
src/lib/retry.ts                     retry Supabase through transient gateway errors
src/app/api/feed/route.ts            the feed query
src/app/api/posts/route.ts           publish
src/app/api/posts/[id]/like/route.ts stamp / unstamp
src/app/api/posts/[id]/comments/    comment thread
src/app/api/thumbnail/[session]/     floor plan as an image
src/app/feed/                        the grid
src/app/share/                       the composer
src/app/p/[id]/                      a single post
src/app/u/[handle]/                  one person's plans
src/lib/similarity.ts                ranking rooms by resemblance
src/components/social/               all of our UI
scripts/create-social-tables.sql     posts + post_likes
scripts/create-comments-table.sql    post_comments + comment_count + render_url
scripts/seed-social.mjs              seed from real layouts
```

### Yours — we have not touched any of these

`src/app/page.tsx`, `src/app/capture/`, `src/app/room/`,
`src/components/RoomScene.tsx`, `FurnitureMesh.tsx`, `CaptureFlow.tsx`,
`textures.ts`, `src/lib/roomLayoutSchema.ts`, `src/lib/supabaseAdmin.ts`,
`src/app/api/{layout,photos,upload,infer-layout,colorize}/`.

### Shared — we appended, we did not rewrite

`src/app/globals.css`. Our styles live at the bottom under a
`/* --- Social layer ("plans") --- */` header and are **all scoped inside
`.plans`**, so nothing can leak into the scanner or the room view. If you
need to change our block, that is fine, just keep the scoping.

### Database

We added `posts`, `post_likes` and `post_comments`. We did not alter `rooms`. Both new tables
have RLS enabled with zero policies, matching how `rooms` is set up: all
access goes through API routes on the service-role key.

---

## Two things we would like later, neither blocking

**1. Persist catalog bindings onto layout objects.** When someone swaps in a
catalog product, write the `toBinding()` shape from `catalogItem.ts` onto the
object:

```ts
obj.binding = { source: "catalog", catalogItemId, priceCents, url }
```

We already read `binding.priceCents` defensively, so the budget filter starts
working the moment you begin writing it — no coordinated deploy, no change on
our side. Until then `total_budget_cents` is null everywhere and we keep the
budget filter hidden, because a filter that always returns nothing reads as
broken.

**2. A 3D thumbnail at save time.** `gl.domElement.toBlob()`, square,
1024×1024, uploaded like a photo. Write the URL to `posts.render_url` and it
takes over immediately — the card and the post page already resolve
`render_url ?? thumbnail_url`, so the floor plan becomes the fallback with no
change on our side. Genuinely optional: the SVG plans look good and are
arguably more legible at card size.

---

## Things we learned the hard way

Worth knowing regardless of which half you work on.

- **`params` and `searchParams` are Promises** in this Next version. `const
  { id } = await ctx.params`. There is also a generated `RouteContext<'/path'>`
  and `PageProps<'/path'>` helper available globally.
- **`@supabase/supabase-js` 2.116 needs Node 22+** for native WebSocket. The
  Next app is fine because Next supplies one, but a standalone
  `node scripts/foo.mjs` throws on Node 20. Our seed script talks to the REST
  API with plain `fetch` to sidestep this. `scripts/setup-storage.mjs` (yours)
  will throw on Node 20 for this reason.
- **Supabase's gateway returns transient 502/503/504.** We hit it three times
  in one afternoon, once mid-publish, which surfaced to the user as a failed
  post for a perfectly valid request. `src/lib/retry.ts` wraps our calls.
  Consider it for yours — `/api/layout` writes on every drag.
- **`npm run build` does not run lint** — run `npm run lint` separately. It
  is at zero errors now, including the two `react-hooks/set-state-in-effect`
  ones that used to sit in `page.tsx` and `RoomScene.tsx`. Please keep it
  there: a permanently-red lint means nobody reads it and new problems hide.
  The two patterns that fixed those: read external state (localStorage, a
  lazily-created id) through `useSyncExternalStore` rather than copying it
  into state in an effect, and adjust state during render instead of in an
  effect when it derives from a prop.

---

## Revision journal

Newest entries at the bottom. Add one per meaningful revision — what
changed, and anything the other half needs to know.

### v1 — 2026-09-12 — first working version

Shipped in commits `a673bd0` (tables, plan, seed) and `12c42c1` (everything
else).

**Built:** floor-plan thumbnails; the feed grid with For You / Today / Week /
Month / All-time tabs; filters for room type, size band and style tags with
state in the URL; stamps deduplicated per browser; the publish composer; and
a post detail page linking back to `/room?session=`.

**Verified against the live database:** all five tabs return distinct sets
with distinct rankings; every filter narrows correctly; offset paging has no
overlap; a duplicate stamp does not double-count; publishing rejects unknown
sessions and invalid room types; and the whole publish flow was clicked
through in a real browser, not just curled.

**Decisions worth knowing:**

- Thumbnails are generated per request rather than stored. An SVG plan is a
  few KB of string building, and a live plan keeps matching the design.
- Paging is offset, not a keyset cursor. Four of the five tabs sort by stamp
  count, which a `created_at` cursor cannot page.
- Stamps, not likes or redlines. A redline is a correction in drafting, which
  is the opposite of approval — drawing sets get *stamped*.
- Room type is asked, never inferred. No scan can tell a dorm from a studio.

**Known gaps:** the share button does not exist yet, so `/share?session=<id>`
has to be visited by hand. The budget filter is hidden pending bindings. Seed
data assigns plausible room types to LiDAR scans that give nothing to infer
from — that is fabrication, acceptable only because it exists to exercise the
filters.

### v2 — 2026-09-12 — filters, tabs, comments

**Filters** collapsed behind one button with an active count — a popover on
desktop, a bottom sheet on phones. They previously sat inline and wrapped
onto three rows on a small screen, crowding the plans they existed to help
you find.

**Tabs** cut from five to three: For You · This month · All time. Today and
This week held too few plans to rank meaningfully. `/api/feed` still accepts
both values, so an existing link keeps working.

**Comments** shipped. `post_comments`, plus `comment_count` and `render_url`
on `posts` — see `scripts/create-comments-table.sql`. Threads live on the
post page, attribution reuses the same pseudonymous handle as the composer,
and `device_id` lets someone delete their own comment without an account.
`device_id` is never returned to the client; it is collapsed to a `mine`
boolean, or anyone could delete anyone's comment. A delete from the wrong
device matches no rows and reports success rather than revealing that the
comment exists.

**`render_url` is the hook for your 3D thumbnails.** Both the card and the
post page already resolve `render_url ?? thumbnail_url`, so the moment you
start writing a capture URL there, it takes over and the floor plan becomes
the fallback. Nothing on our side needs to change.

**Known limits.** Anyone can type any handle, so comments carry no real
attribution — that is the accepted ceiling of the no-accounts decision, and
the fix is real accounts rather than a patch. There is no moderation UI; the
`hidden` column exists so a row can be suppressed by hand in the SQL editor.

**Not built, deliberately:** similarity-ranked "For You", `/u/[handle]`
profiles, saves, and auto-tagging. Auto-tagging looks feasible from layout
data alone (object density, colour variance, area) but not from imagery —
LiDAR sessions upload no photos at all, so a vision approach would tag half
the feed and silently skip the rest.

### v3 — IN PROGRESS — discovery: similarity, profiles, affinity feed

**If you are picking this up cold, read this section first.** It is written
to be resumable: each step below is independently useful, independently
committed, and safe to stop after. Tick the boxes as you land them.

The goal is the use case the product is uniquely able to serve and currently
serves worst: *"I have a room this size — what did other people do with
theirs?"* Nobody else can answer that, because nobody else has real measured
rooms. Today it is buried in an area-band dropdown.

- [x] **3a — DONE.** `src/lib/similarity.ts` + `SimilarRooms` on the post page.
      One scorer, reused everywhere. Same `room_type` scores highest, then
      closeness in `area_m2`, then overlapping `style_tags`, then similar
      object density. Candidates are pre-filtered in SQL to a generous area
      band and scored in TypeScript — at this volume that is simpler and far
      easier to tune than pushing weights into Postgres.
- [x] **3b — DONE.** `/u/[handle]` profile page, linked from every byline. `author_handle` is already on
      every post, so this is one query. It turns a wall of plans into a set
      of people, which is the part of "community" that is currently missing
      entirely. Link it from the card byline and the post page.
- [x] **3c — DONE.** `session_id` persisted to `localStorage` on publish
      (`setMySession` in `device.ts`), sent as `mySession` on the For You
      tab, and used to re-rank the page already fetched — see the v3c entry
      below for what was fixed and verified.

**Deliberately not in v3:** saves/collections, auto-tagging, and real
accounts. Auto-tagging is feasible from layout data alone (object density,
colour variance, area) but not from imagery, because LiDAR sessions upload no
photos — a vision approach would tag half the feed and silently skip the rest.

**Constraint worth knowing:** the identity ceiling still applies. Profiles
are keyed on a self-declared handle stored in one browser, so two people can
claim the same name and one person on two devices is two people. That is the
accepted cost of no accounts, and it is the thing to fix first if this feed
ever matters.

### v3c — 2026-09-12 — finished and verified against the live database

Picked up from "Unfinished Claude Phase 3 Update" (`244ec1d`) — the wiring
(`device.ts`, `ShareComposer.tsx`, `FeedView.tsx`, `api/feed/route.ts`) was
already there and needed one fix, not a rebuild.

**Bug fixed:** `rankSimilar()` is documented to exclude the target's own
post (`candidates.filter(c => c.id !== target.id)`), but the `mine` query in
`api/feed/route.ts` never selected `id` — so `target.id` was `undefined` and
nothing was ever excluded. A post scores maximally similar to itself, so
publishing a room could pin it at #1 of your own "rooms like yours" feed.
Fixed by selecting `id` alongside the other columns.

**Verified against the live database**, not just curled locally against
seed data: `GET /api/feed?tab=foryou` with a real `mySession` (a published
`office`, 0.59 m² post) re-ranks the page toward other `office` posts ahead
of larger rooms that were more recent, and the `mySession` post itself is
now absent from its own results. Without `mySession`, ordering is untouched
(plain recency), matching "fall back to newest when we do not know the
visitor's room."

**Confirms the existing design trade-off is working as intended, not a
bug:** this re-ranks only the already-fetched page (`PAGE_SIZE = 24`), not
the whole table — a well-matched post sitting on page 5 won't surface
early. That's the documented cost of not scoring the entire table per
request, unchanged here.
### v4 - 2026-09-12 - one visual world across the whole app

**This entry matters to you even if you only work on the scan and the
editor, because this revision crossed into shared files for the first time.**
The project owner asked for the scanner and the feed to stop looking like two
different products. Nothing about how anything works was changed: this was a
restyle, and the owner was explicit that functionality and user flow stay
exactly as they were.

**Files we touched that are not in our column above:**

- `src/app/layout.tsx` - the three fonts now load once at the root instead of
  per area. Familjen Grotesk for titles, Hanken Grotesk for body, DM Mono for
  measurements. The old `--font-geist-sans` and `--font-geist-mono` variables
  are gone; if anything of yours referenced them it now falls back, so use
  `--font-ui`, `--font-display` and `--font-mono-rs` instead.
- `src/app/page.tsx` - restyled. **Every piece of behaviour is unchanged:** the
  lazily minted session id through `useSyncExternalStore`, the 1.5s photo
  poll, `generateLayout` posting to `/api/infer-layout` and pushing to
  `/room?session=`, and the QR pointing at `/capture?session=`. What is new is
  presentation plus two additive sections, a horizontal rail of recent posts
  and a how-it-works block. The rail reads `/api/feed` and renders nothing at
  all if that call fails, so it cannot break the capture flow.

  > **Superseded by v6.** That description was written against the
  > Gemini photo-capture landing page, which this branch had already
  > replaced with the LiDAR deep-link flow. The restyle was re-applied to
  > the LiDAR page instead — see the v6 entry for what the page does now.
- `src/app/globals.css` - the palette is now defined at `:root` for the whole
  app rather than only inside `.plans`, because the landing page needed it
  too. Tokens are `--ground`, `--raised`, `--line`, `--fg`, `--fg-2`, `--fg-3`
  and `--amber`. The app is deliberately single-theme dark now; the owner
  compared both and picked dark.

**How the feed got restyled without touching most of its components.** The old
`.plans` variables (`--paper`, `--sheet`, `--ink`, `--pencil`, `--blueline`,
`--stamp`, `--rule`) are now aliases pointing at the new tokens. Every social
component was already written against those names, so remapping them in one
place restyled the whole feed. The names now say where a colour is used
rather than what it looks like: `--blueline` is the accent, and the accent is
amber. Keep using them.

**`src/lib/floorPlan.ts` now draws on a dark ground.** Plans used to paint the
sampled floor and wall colours onto a near-white page, which against the dark
UI made every thumbnail a glaring white rectangle. The page and floor are
fixed to the palette, the measured colour survives as a low-opacity tint on
each object, and doors and windows are picked out in amber because they are
the constraints that decide a layout. If you are generating your own 3D
thumbnails for `render_url`, matching that dark ground will keep the grid
even.

**Still open, unchanged by this pass:** the share button in the editor, and
the `session_id` question at the top of this file. Also worth knowing: card
thumbnails are still square, so the grid is a fixed grid rather than a true
masonry. Making it masonry means teaching `floorPlanSvg` to emit each room's
real aspect ratio, which is a behaviour change and was deliberately left out
of a restyle.

### v5 - 2026-09-12 - plans are no longer square, and the grid is masonry

The last entry said the square thumbnail and the fixed grid were left alone
because changing them was behaviour rather than styling. The owner asked for
the staggered layout, so that is now done.

**`floorPlanSvg` emits a non-square canvas.** The viewBox takes the room's own
proportion instead of always being a square that the plan is letterboxed
into. `options.size` now means the **long** edge, not the square edge. If you
call this anywhere, that is the one change that could surprise you.

**There is a new export, `planAspect(width, length)`,** returning width over
height for a room. It is the single source of that ratio, and anything
rendering a plan thumbnail should set it on the element so the grid reserves
the right height before the image loads. `PostCard` does this with an inline
`aspect-ratio`; without it the whole feed jumps around as plans stream in.

**The ratio is clamped to 0.58 - 1.70.** Real scans produce nonsense at the
edges. There is a row in `rooms` right now measuring 2.71 x 0.22 m, a ratio
of 12.3, and an unclamped card for it would be a sliver tall enough to push a
column off the screen. Past the clamp the plan letterboxes inside the card,
so the drawing stays true even where the card shape stops tracking it.

**If you build 3D thumbnails for `render_url`,** match the post's
`planAspect(width_m, length_m)` and the dark ground, or your renders will be
the only ones in the grid that crop or letterboxed oddly.

**Everywhere else that draws a plan in a fixed square box now uses
`object-contain`** rather than `object-cover`: the landing rail,
`/u/[handle]`, `SimilarRooms` and `ShareComposer`. The SVG ground is the same
colour as the card ground, so the letterboxing is invisible. If you add a new
plan thumbnail somewhere, do the same or it will crop.

One honest caveat on how this looks today: most seeded rooms came from the
same few real scans and cluster around 8.8 x 7.2 m, so the stagger is subtle.
That is the data, not the layout, and it gets more varied as real scans land.

### v6 - 2026-09-12 - the restyle lands on the combined branch

v4 and v5 were built on `main`, which at that point still had the Gemini
photo-capture landing page and none of the editor or catalog work. The real
workspace had moved to `three-combined-initial` — scanner, editor, catalog
and feed merged together — so the two restyle commits were stranded on a
branch nobody was building from.

This merge brings them across. **The combined branch is the base of truth;
only the visual work was taken from `main`.** No editor, catalog, scanner or
schema behaviour was changed by this pass.

**Applied unchanged from `main`:** `floorPlan.ts` (dark ground, non-square
viewBox, `planAspect`), `PostCard`, `FeedView`, `FilterPanel`, `PlansShell`,
`ShareComposer`, `SimilarRooms`, `CommentThread`, `layout.tsx` (the three
root fonts), and the `feed` / `p` / `share` / `u` pages. Thirteen files, no
conflicts — the social layer had not been touched on this branch since the
merge base, so v4 and v5 applied exactly as written.

**`globals.css` merged cleanly:** main's `:root` palette wholesale, plus this
branch's `button:not(:disabled) { cursor: pointer }` rule, which main never
had. Nothing of the old light drafting palette survives.

**`src/app/page.tsx` was rewritten rather than taken from either side.** The
two versions were different products: main's is the photo-capture flow
(`/api/photos` polling, `generateLayout`, a QR to `/capture?session=`), and
this branch's is LiDAR-only (a `roomscanner://scan?session=` deep link and a
poll on `/api/layout`). The LiDAR behaviour is kept exactly as it was,
including the gate that stops an idle tab polling forever; main's visual
language is what was ported onto it — the pill nav, the amber-wash hero, the
QR panel, the recent-plans rail and the how-it-works block.

Two deliberate departures from a literal port, both because the page is now
describing a different capture path:

- **The nav carries `/rooms`**, the editor's scanned-room index. It does not
  exist on `main`, so main's nav had nowhere to link it.
- **The "Scan" and "Arrange" copy was rewritten.** Main's said "photograph
  the room from a few angles", which is the Gemini path. It now describes
  walking the room with the LiDAR app, and mentions swapping in catalog
  products, which is what the editor actually does here.

**The rail came across with the restyle.** It is display-only, reads
`/api/feed`, and renders nothing at all if that call fails, so it cannot
affect the capture flow.

**Verified:** `npx tsc --noEmit` clean, `npx eslint` clean, `npx next build`
passes. The two stale-doc items called out before this merge
(`SCANNER_CONTRACT.md`'s category table, and `walls` / `label` being
undocumented) are **still open** — they predate this merge and were left
alone deliberately, since this pass was scoped to the restyle.
