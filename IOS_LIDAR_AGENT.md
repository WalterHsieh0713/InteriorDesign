# Agent 4 — iOS LiDAR scanning path (Mac-only)

Standalone brief for whichever Claude Code session picks this up on the
Mac. You have no memory of how this project got built — everything you
need is here. This is the **only** part of the project that needs macOS/
Xcode; everything else (the web app) runs fine on any teammate's PC in
parallel — see `PARALLEL_AGENTS.md` on `main` for that side.

## What this is

The project is a hackathon web app: photograph a room from your phone,
Gemini infers a 3D layout, you get an editable 3D room you can drag
furniture in and share by link. That whole pipeline is built and working
on `main` — but it's pure AI-vision guessing from 2D photos, which turned
out to have serious real-world accuracy problems (a real dorm room got
estimated at 9.5m × 14.5m — off by roughly 3-4x). LiDAR gives real
measured depth data instead of a guess, which is a fundamentally different
accuracy tier.

There's already a **complete, working iOS app for this** — it was the
original plan before the team pivoted to web (nobody had a Mac at the
time). It's fully preserved on the **`archive/swift-roomplan`** branch.
You should be on that branch right now, or check it out:

```
git checkout archive/swift-roomplan
```

## Your job, in two parts

### Part 1 — get it building and running (mechanical, should be quick)

Everything is documented in `README.md` **on this branch** (not on
`main` — it was removed there during the pivot, this is the only copy).
Follow it exactly: new Xcode project, add the files in `RoomScanner/`,
link `RoomPlan.framework`, add the one `NSCameraUsageDescription`
Info.plist key, iOS 17 deployment target, free-Apple-ID signing, run on
the physical LiDAR device (iPhone 12 Pro+ or iPad Pro 2020+ — **the
Simulator cannot do any of this**, RoomPlan requires real hardware).

At this point the app scans a room and exports JSON via a share sheet —
that JSON schema is now **stale** and needs to change. That's Part 2.

### Part 2 — fix the JSON schema mismatch (the actual work)

The archived app's export (`RoomScanner/Models.swift` +
`RoomScanner/RoomExporter.swift`) produces a shape from *before* the web
app existed. The web app now expects a different, fixed contract —
`src/lib/roomLayoutSchema.ts` on `main` (also copied below). **Nothing
downstream can change — the web editor, the zod validation, the 3D
renderer all depend on this exact shape.** Your job is to make the iOS
export match it, not the other way around.

**Old shape (what's currently exported):**
```
{ roomId, createdAt,
  walls: [{id, dimensions:[w,h,d], transform:[16 floats]}],
  doors: [ same ], windows: [ same ], openings: [ same ],
  objects: [{id, category, confidence:"high"|"medium"|"low",
             dimensions:[w,h,d], transform:[16 floats]}] }
```

**Target shape (what the web app needs):**
```json
{
  "room": {"width": meters, "length": meters, "height": meters},
  "objects": [{"id","category","position":[x,y,z],"rotationY":radians,
               "dimensions":[w,h,d],"confidence":0..1}]
}
```
`category` must be one of exactly: `bed, desk, chair, sofa, table, shelf,
dresser, tv, lamp, rug, door, window, other`. Y-up, floor at y=0, origin
at room center — same convention the app already uses internally, no
coordinate conversion needed there.

**Concrete conversion work:**

1. **Room dimensions have no direct source — compute them from the
   walls.** `CapturedRoom` has no single "room size" property. For each
   wall, transform its two edge-midpoints (local `(-width/2, 0, 0)` and
   `(width/2, 0, 0)`) by the wall's full `transform` into world space,
   collect all these points across every wall, and take the min/max X and
   min/max Z — that span is `room.width`/`room.length`. `room.height` =
   the tallest wall's `dimensions.y`. Verify this against a real scan;
   the exact endpoint convention may need adjusting once you see real
   wall transforms.

2. **`transform` (4×4 matrix) → `position` + `rotationY` (the new schema
   has no matrix field at all).**
   - `position` is just the translation column: `[transform.columns.3.x,
     transform.columns.3.y, transform.columns.3.z]`.
   - `rotationY` needs extracting from the rotation part. A starting
     point: `atan2(-transform.columns.0.z, transform.columns.0.x)` (this
     assumes RoomPlan's objects only rotate about the vertical axis,
     which should hold for furniture resting on a floor — but **verify
     the sign convention against a real scan**, e.g. rotate a known
     object ~90° between scans and confirm the sign comes out right. I
     can't verify this without a device in hand — treat this formula as
     a starting guess, not gospel).

3. **`confidence`: string → number.** Old schema kept Apple's
   `high`/`medium`/`low` as strings; new schema wants `0..1`. Reasonable
   default mapping: high→0.9, medium→0.6, low→0.3 — adjust if it doesn't
   feel right.

4. **Category enum doesn't match at all — needs a full remap.** Apple's
   `CapturedRoom.Object.Category` (what the old exporter already produces
   as strings) → the new fixed enum:

   | Apple's category | → new category |
   |---|---|
   | bed | bed |
   | table | table |
   | sofa | sofa |
   | chair | chair |
   | television | tv |
   | storage | shelf |
   | refrigerator, stove, sink, washerdryer, toilet, bathtub, oven, dishwasher, fireplace, stairs | other |

5. **Fold `doors` and `windows` into `objects`** (the new schema has no
   separate arrays for them) — map each using the same
   position/rotationY/dimensions/confidence extraction as furniture,
   with `category: "door"` or `category: "window"` respectively. **Drop
   `walls` and `openings`** from the objects list — walls only feed the
   room-dimension calculation above; treat `openings` as `door` if you
   want them represented, or drop them, your call.

6. **Rewrite `RoomJSON`/`ObjectJSON` in `Models.swift`** to match the
   target shape exactly (field names matter — the web app's zod schema
   will reject anything that doesn't match `room.width/length/height` and
   `objects[].position/rotationY/dimensions/confidence/category/id`
   precisely).

## Part 3 — ship straight to the live web app instead of a JSON file

Currently the app exports to a share sheet as a local file. Replace that
with a direct HTTP call so a scan becomes an immediately-shareable link:

1. Generate a session UUID for the scan (`UUID().uuidString`).
2. `PUT` the converted JSON to `<deployed-vercel-url>/api/layout` with
   body `{"session": "<uuid>", "layout": {...}}` — **ask the project
   owner for the exact deployed URL, it's not recorded in this repo.**
   This is the same endpoint the web editor already uses to persist
   drag-and-drop edits, so it already validates your JSON against the
   real zod schema server-side — a malformed conversion comes back as a
   clear 400 with the specific field that's wrong, which is the fastest
   way to debug your Part 2 math.
3. On success, share `<deployed-vercel-url>/room?session=<uuid>` (a real
   URL, not a file) via the share sheet — that opens directly into the
   3D editor on whatever device you AirDrop/send it to.
4. No photos, no Gemini call needed for this path at all — it bypasses
   `/api/infer-layout` entirely, since RoomPlan already gives structured
   data instead of something that needs AI-vision guessing.

## Do not touch

- `src/lib/roomLayoutSchema.ts` on `main` — that's the contract, fix your
  export to match it, don't propose changing it without checking with
  whoever's working on the web side (three other people may be relying on
  it staying stable right now, see `PARALLEL_AGENTS.md`).
- Don't push directly to `main` from this work — commit to
  `archive/swift-roomplan` (extending it, since that's where the Swift
  source already lives) or a new branch off it, and coordinate before
  merging anywhere shared.
