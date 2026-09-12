# Social layer — build plan

> **Status: shipped.** All phases below are built, verified and on `main`.
> This file is kept as the design rationale — why the feed snapshots instead
> of joining, what the seam is, how the tables are shaped.
>
> For current status, the integration contract, and the revision journal,
> read **[SOCIAL_INTEGRATION.md](SOCIAL_INTEGRATION.md)** instead. That is
> the living document; this one is the original reasoning.

Share a finished room design, browse other people's designs in a filterable
feed, like the good ones.

This is a **parallel workstream**. The design half of the app (LiDAR scan,
room editor, catalog swap) is owned by other people and is being built at
the same time. This plan is deliberately structured so that essentially all
of it can be built and demoed *before* that half is finished — see
[What needs teammates](#what-needs-teammates) for the short list of things
that don't.

Read `PLAN.md` for the project as a whole and `PARALLEL_AGENTS.md` for the
other workstreams.

---

## User flow, end to end

| # | Step | Owner |
|---|------|-------|
| 1 | Scan a room with LiDAR | Teammates |
| 2 | Edit the layout, swap in catalog furniture | Teammates |
| 3 | Tap **"Share this design"** in the editor | Teammates add the button, hands off here |
| 4 | Composer: thumbnail preview, caption, room type, style tags | **This plan** |
| 5 | Publish | **This plan** |
| 6 | Land on the post page, copy the link | **This plan** |
| 7 | Others browse `/feed`, filter, swipe tabs, like | **This plan** |
| 8 | Tap a post → "Open in 3D" → the live room | Hands back to teammates |

Steps 4–7 are the whole social product and touch none of the other
workstreams' files.

---

## Features

### Publishing

1. **Share composer** — from a finished design: caption, room type, up to
   three style tags, publish.
2. **Handle** — on first post you type a display name. Stored on your
   device. No password, no email, no login screen.
3. **Thumbnail** — auto-generated top-down floor plan of the design.

### Browsing

4. **Feed grid** — two columns on phone, four on desktop. Each card shows
   the thumbnail, room type, budget (when known) and like count.
5. **Time tabs** — For You · Today · Week · Month · All Time, swipeable
   sideways.
6. **Filters** — room type, room size, dimensions, style tags, budget.
   Filter state lives in the URL, so a filtered feed is a shareable link.
7. **Likes** — one per device per post.
8. **Post detail** — full thumbnail, caption, author, and an "Open in 3D"
   button through to the actual room.

---

## Why this can be built alone

Two decisions do the work:

**The feed snapshots, it doesn't join.** When a design is published, the
data the feed needs (dimensions, area, room type, style tags, budget) is
*copied* onto the post row. From then on the feed queries one table. It
never reads `rooms`, never imports `roomLayoutSchema`, and doesn't break
when the design half changes shape. This is also just how feeds are built —
ranking and filtering can't join into JSONB layouts, and a post should show
what the design looked like when it was posted.

**Seed data replaces the scan.** A script inserts fake designs and posts
directly. With a populated feed there is no point in the build where a real
LiDAR scan is required to make progress.

The result: one file reads the other workstream's data, and nothing writes
to their tables.

---

## The seam

```ts
// src/lib/postMetadata.ts — the ONLY file that reads the design half's data

export type PostMetadata = {
  roomType: string;         // author-selected in the composer
  widthM: number;           // from RoomLayout.room.width
  lengthM: number;          // from RoomLayout.room.length
  areaM2: number;           // width * length
  styleTags: string[];      // author-entered, later unioned with catalog tags
  totalBudgetCents: number | null;  // null until catalog bindings are saved
  objectCount: number;      // RoomLayout.objects.length
};

export function buildPostMetadata(
  layout: RoomLayout,
  roomType: string,
  styleTags: string[]
): PostMetadata;
```

Four of the six fields come straight out of `RoomLayout` as it exists
today. Only `styleTags` (partly) and `totalBudgetCents` wait on catalog
bindings, and both degrade to a clean empty value.

---

## Data model

Two tables, both owned by this workstream. Full DDL in
`scripts/create-social-tables.sql`.

**`posts`** — `id`, `session_id` (the seam), `author_handle`, `caption`,
`thumbnail_url`, `created_at`, plus the publish-time snapshot
(`room_type`, `width_m`, `length_m`, `area_m2`, `style_tags`,
`total_budget_cents`, `object_count`) and a denormalized `like_count`.

**`post_likes`** — `(post_id, device_id)` as a composite primary key, so
duplicate likes are a constraint violation rather than application logic.

RLS is enabled with zero policies on both, matching `rooms`: all access
goes through API routes on the service-role key.

---

## Build order — all shipped

Each phase landed in the order below.

| Phase | What | Status |
|---|---|---|
| 0 | `.env.local`, `posts` + `post_likes` tables, seed from real layouts | shipped |
| 1 | Floor-plan SVG generator (`src/lib/floorPlan.ts`) | shipped |
| 2 | Feed grid + `GET /api/feed` | shipped |
| 3 | Tabs and ranking | shipped |
| 4 | Filters | shipped |
| 5 | Stamps (likes) | shipped |
| 6 | Composer + `POST /api/posts` | shipped |
| 7 | Post detail page | shipped |

Two things changed during the build and are worth recording here, since the
sections above describe the original intent:

- **Thumbnails are generated per request, not stored.** An SVG plan is a few
  KB of string building, so there was nothing to gain from baking and
  uploading one, and a live plan keeps matching the design after the owner
  rearranges the room. The `thumbnail_url` column stayed, so a 3D capture can
  replace it later without touching the feed.
- **Paging is offset, not a keyset cursor.** Four of the five tabs sort by
  stamp count, which a `created_at` cursor cannot page. Revisit past a few
  thousand rows.

## What needs teammates

Only the first two need an answer soon.

1. **A "Share this design" button** in the room editor, navigating to
   `/share?session=<sessionId>`. One button, one link — that is the entire
   integration. *Blocking for the real flow; seed data covers it until
   then.*

2. **Confirm the design identifier.** Everything is keyed by `session_id`
   today. If a `designs` table with its own id is coming, say so now: it is
   a one-line change today and a migration once there are rows.

3. **Save catalog bindings onto the layout** when a product is swapped in
   (the `toBinding()` shape in `catalogItem.ts`). Unlocks the budget filter
   and product-derived style tags. *Not blocking — degrades cleanly.*

4. **Optional: a 3D thumbnail** at save time — `gl.domElement.toBlob()`,
   square, 1024×1024, uploaded like a photo. An upgrade over the SVG floor
   plan, not a dependency.

---

## Out of scope

Real accounts and passwords, following/followers, comments, notifications,
direct messages, an algorithmic recommender ("For You" is filters, not a
model), moderation tooling, and editing or deleting a post after publishing.
