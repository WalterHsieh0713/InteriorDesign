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

## Status: the conversion code is written. Your job is Xcode + verification.

A prior session (no Xcode access, working blind from source review only)
already rewrote the export pipeline to match the web app's schema and to
upload directly instead of sharing a local file:

- `Models.swift` — `RoomLayoutJSON`/`ObjectJSON` now match
  `src/lib/roomLayoutSchema.ts` on `main` exactly (`room.width/length/
  height`, `objects[].id/category/position/rotationY/dimensions/
  confidence`).
- `RoomExporter.swift` — `buildLayout(from:)` computes room dimensions
  from the walls' bounding box, decomposes each object/door/window's
  `transform` into `position` + `rotationY`, maps Apple's confidence enum
  to a `0..1` double, and remaps Apple's object categories down to the
  web app's fixed enum (full mapping table and reasoning is in the code
  comments there).
- `LayoutUploader.swift` (new file) — `PUT`s the converted layout straight
  to `<baseURL>/api/layout` and builds the shareable
  `<baseURL>/room?session=<id>` link.
- `ContentView.swift` — now uploads on scan completion instead of writing
  a local file, shows an "Uploading to room…" state, shares the real link
  on success.

**None of this has ever been compiled.** There was no Xcode/macOS access
to verify any of it against the real SDK. Treat your first build as the
actual test, not a formality — expect to fix real compile errors,
possibly API-signature mismatches against whatever the current RoomPlan
SDK actually looks like.

### What's actually left for you to do

1. **Set the base URL.** `RoomScanner/LayoutUploader.swift` has a
   placeholder (`https://YOUR-DEPLOYED-URL.vercel.app`) — ask the project
   owner for the real deployed Vercel URL and set it before building.
2. **Follow `README.md` on this branch** for the mechanical Xcode setup:
   new project, add the 8 `.swift` files, link `RoomPlan.framework`, the
   one `NSCameraUsageDescription` Info.plist key, iOS 17 deployment
   target, free-Apple-ID signing, run on a **physical** LiDAR device
   (iPhone 12 Pro+ or iPad Pro 2020+ — the Simulator can't do any of
   this).
3. **Fix whatever doesn't compile.** Genuinely unknown scope — could be
   nothing, could be real API mismatches.
4. **Verify the rotation math against a real scan** — this is the one
   piece of logic that's a best-effort derivation, not something that
   could be checked without a device: `RoomExporter.swift`'s
   `positionAndRotationY` extracts a yaw angle via
   `atan2(-transform.columns.0.z, transform.columns.0.x)`, assuming
   objects only rotate about the vertical axis. Scan a room with an
   object rotated a known amount (e.g. a chair turned ~90° from another),
   check the sign/magnitude comes out right in the uploaded layout. If
   it's flipped or off, that's a one-line fix once you can see real
   numbers — I couldn't get further than "this is the standard formula
   for this scenario" without a device to confirm against.
5. **Verify the room-bounding-box calculation** the same way — scan an
   actual room you know the rough dimensions of, sanity-check the
   `room.width/length/height` that lands in the `rooms` table isn't
   wildly off (the whole reason this path exists is that Gemini's guess
   was off by 3-4x — confirm this one is actually better before assuming
   it is).
6. **End-to-end test:** scan → upload succeeds (or gives a clear 400 you
   can debug) → open `<baseURL>/room?session=<id>` in a browser → your
   real room renders with real dimensions.

## Do not touch

- `src/lib/roomLayoutSchema.ts` on `main` — that's the contract, fix your
  export to match it, don't propose changing it without checking with
  whoever's working on the web side (three other people may be relying on
  it staying stable right now, see `PARALLEL_AGENTS.md`).
- Don't push directly to `main` from this work — commit to
  `archive/swift-roomplan` (extending it, since that's where the Swift
  source already lives) or a new branch off it, and coordinate before
  merging anywhere shared.
