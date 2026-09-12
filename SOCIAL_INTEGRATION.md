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

It is live and working against the shared Supabase project, seeded with 14
posts built from the real layouts already in `rooms`.

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
src/app/api/thumbnail/[session]/     floor plan as an image
src/app/feed/                        the grid
src/app/share/                       the composer
src/app/p/[id]/                      a single post
src/components/social/               all of our UI
scripts/create-social-tables.sql     posts + post_likes
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

We added `posts` and `post_likes`. We did not alter `rooms`. Both new tables
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
1024×1024, uploaded like a photo. Give us the URL and we will store it in
`posts.thumbnail_url` instead of the floor-plan route. Genuinely optional —
the SVG plans look good and are arguably more legible in a small card.

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
- **`npm run build` does not run lint.** `npm run lint` reports two
  pre-existing `react-hooks/set-state-in-effect` errors in `page.tsx:21` and
  `RoomScene.tsx:187`, both in your files. They are not ours and we have not
  touched them, but they will keep failing lint until someone does. The fix
  pattern that worked for us: read external state with `useSyncExternalStore`,
  and derive loading flags instead of storing them.

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
