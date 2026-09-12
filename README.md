# RoomScanner — LiDAR room scan → live 3D web editor

Scan a room with RoomPlan, convert it to the web app's JSON layout schema,
and upload it straight to the deployed web app's `/api/layout` endpoint —
the app then shares a real `/room?session=<id>` link that opens directly
into the 3D editor. See `IOS_LIDAR_AGENT.md` on this branch for the full
story of why this exists and what the conversion logic does.

## Folder contents

```
InteriorDesignTest/
  RoomScanner/                  <- source files to add to a new Xcode project
    RoomScannerApp.swift        <- @main entry point
    ContentView.swift           <- launch screen + LiDAR support check + upload/share
    RoomScanView.swift          <- full-screen live scan UI (RoomCaptureView + Done/Cancel)
    RoomCaptureModel.swift      <- owns RoomCaptureSession, RoomCaptureViewDelegate
    RoomExporter.swift          <- CapturedRoom -> RoomLayoutJSON (matches the web app's schema)
    LayoutUploader.swift        <- PUTs the layout to the live web app, builds the share link
    Models.swift                <- Codable structs matching src/lib/roomLayoutSchema.ts
    ShareSheet.swift            <- UIActivityViewController wrapper
    Info-additions.plist        <- reference only, shows the one Info.plist key to add
  viewer/
    viewer.html                 <- superseded by the real web app; kept only as a fallback
                                    static viewer if the deployed URL is ever unreachable
```

## 0. Deployed URL (already set)

`RoomScanner/LayoutUploader.swift` points at the production alias
`https://room-scanner-1v3.vercel.app`, which always serves the latest
deploy. You shouldn't need to change it.

If you ever do change it, take the URL from Vercel's **Production**
deployment, not from a specific build. Per-build preview URLs look like
`room-scanner-4bc23qbk8-1v3.vercel.app` (note the hash) and are pinned
forever to the commit that produced them — point the app at one and every
scan opens against a frozen copy of the web app, so shipped web fixes
never reach you.

## 1. Create the Xcode project

1. Xcode > File > New > Project > **iOS > App**.
2. Product Name: `RoomScanner`. Interface: **SwiftUI**. Language: **Swift**.
   Uncheck "Use Core Data" and "Include Tests" (not needed).
3. Save it anywhere (e.g. next to this folder, or right inside
   `InteriorDesignTest/`).
4. Xcode generates `RoomScannerApp.swift` and `ContentView.swift` for you —
   **delete both** (Move to Trash), then drag the 8 `.swift` files from
   `InteriorDesignTest/RoomScanner/` into the project navigator
   (check "Copy items if needed").

## 2. Link the RoomPlan framework

Target **RoomScanner** > **General** tab > **Frameworks, Libraries, and
Embedded Content** > **+** > search `RoomPlan` > add `RoomPlan.framework`.
Embed setting: "Do Not Embed" (it's a system framework).

## 3. Info.plist — one required key

Target **RoomScanner** > **Info** tab > **Custom iOS Target Properties** >
hover any row > **+**:

| Key | Value |
|---|---|
| Privacy - Camera Usage Description (`NSCameraUsageDescription`) | `This app uses the camera and LiDAR to scan your room.` |

Without this key, the app crashes the instant `RoomCaptureSession.run()` is
called. (See `Info-additions.plist` for the raw XML if you'd rather paste it.)

Nothing else is needed — no ARKit entitlement, no background modes, no
network permissions.

## 4. Deployment target

Target **RoomScanner** > **General** > **Minimum Deployments** > **iOS 17.0**.

## 5. Signing (free Apple ID is fine)

1. Target **RoomScanner** > **Signing & Capabilities**.
2. Check **Automatically manage signing**.
3. **Team**: pick your Apple ID. If it's not listed, add it via
   **Xcode > Settings > Accounts > +** first — a free personal team works,
   no paid Developer Program needed for local device testing.
4. **Bundle Identifier**: change it to something globally unique, e.g.
   `com.<yourname>.RoomScanner` (a free account can't reuse a bundle ID
   someone else's account has already provisioned).

## 6. Run on a physical LiDAR device

RoomPlan and `RoomCaptureSession.isSupported` **always fail in the
Simulator** — this app can only be built and iterated on with the Simulator,
but actually scanning requires a real device:
- iPhone 12 Pro / 12 Pro Max or any later **Pro** model, or
- iPad Pro 2020 (4th gen) or later.

Steps:
1. Connect the device via cable (fastest first run) or have it on the same
   Wi-Fi for wireless run.
2. Select it as the run destination in Xcode's scheme toolbar.
3. **First run on a free account**: Xcode will need to register the device
   and create a provisioning profile — it does this automatically when you
   hit Run, but the first install will fail with a trust prompt. On the
   device: **Settings > General > VPN & Device Management** > tap your
   developer profile > **Trust**.
4. On iOS 16+, also confirm **Developer Mode** is on: **Settings > Privacy &
   Security > Developer Mode** > toggle on > device restarts and asks you to
   confirm. Xcode will prompt you to do this automatically the first time if
   it's off.
5. Cmd+R. On first tap of "Scan Room" you'll get the camera-permission
   system prompt — accept it.

## 7. Using the app

1. Launch screen shows "Scan Room" if LiDAR is supported, or a clear
   unsupported message if not.
2. Tap it → full-screen `RoomCaptureView` with Apple's live camera feed and
   built-in coaching overlay ("move around the room", "point at the floor",
   etc.). Walk the room slowly, cover all walls.
3. Tap **Done**. `RoomCaptureView` swaps into its own built-in static 3D
   review render for a moment while it post-processes the scan — that's
   expected, not a hang.
4. As soon as the processed `CapturedRoom` is ready, the app converts it to
   the web app's JSON schema (`RoomExporter.buildLayout`), generates a new
   session ID, and `PUT`s it to `<baseURL>/api/layout` — shows "Uploading to
   room…" while that's in flight.
5. On success, the share sheet opens with a real link:
   `<baseURL>/room?session=<id>` — AirDrop/Messages/copy it, opening it
   drops straight into the live 3D editor with your scanned room.
6. If upload fails, you'll see the server's actual error message (this
   endpoint validates against the same zod schema the web app's own drag
   edits go through, so a malformed conversion shows up as a specific field
   error, not a silent failure).
7. If the scan barely covered anything, `objects` may come back
   near-empty — that's a scan-quality issue, not a bug; do a slower second
   pass.

## JSON schema produced (matches `src/lib/roomLayoutSchema.ts` on `main`)

```json
{
  "room": {"width": meters, "length": meters, "height": meters},
  "objects": [{"id","category","position":[x,y,z],"rotationY":radians,
               "dimensions":[w,h,d],"confidence":0..1}]
}
```

`category` is one of exactly: `bed, desk, chair, sofa, table, shelf,
dresser, tv, lamp, rug, door, window, other` — see the mapping table and
the room-bounding-box / rotation-extraction math in `RoomExporter.swift`
and `IOS_LIDAR_AGENT.md`. **The rotation-extraction formula in particular
is unverified against a real device** — it's a reasonable derivation, not
tested output, since none of this could be compiled or run without Xcode.
Treat the first real scan as the actual test of that math, not this code
review.

## Coordinate system notes (ARKit ↔ three.js)

Your assumption is correct: **ARKit's world space and three.js/WebGL are
both right-handed, Y-up, with -Z as "forward"** — no axis flip, no
handedness conversion, no extra rotation needed anywhere in this pipeline.
Four things that *can* still bite you, none of which are axis-convention
bugs:

1. **Column-major, not row-major.** `simd_float4x4.columns` is stored
   column-major. `RoomExporter.swift` no longer ships the raw matrix (the
   web schema only wants `position` + `rotationY`), but the extraction math
   still reads `columns.3` for translation and `columns.0` for the rotation
   component — get the column indices backwards and positions will be
   right but rotations silently wrong (correct at identity, wrong
   everywhere else — the classic version of this bug).
2. **Units are meters on both sides.** ARKit reports in meters; three.js is
   unitless. The viewer treats 1 unit = 1 meter and does no scaling — if you
   add your own geometry later, keep it in meters or scale explicitly.
3. **Pivot is centered, not corner-anchored.** `CapturedRoom`'s
   `transform` places the origin at the center of each surface/object's
   bounding box, and `dimensions` is the *full* width/height/depth. That's
   exactly `PlaneGeometry`/`BoxGeometry`'s default centered pivot, which is
   why the viewer can apply the transform directly with no half-dimension
   offset. If you swap in geometry with a corner-origin convention, you'll
   need to translate by `-dimensions/2` first.
4. **Each scan session has its own independent world origin.** RoomPlan
   resets ARKit's world coordinate space at the start of every capture
   session. Fine for viewing one room's JSON in isolation (which is all this
   does), but if you later try to merge multiple room scans into one shared
   three.js scene expecting a common frame, their transforms won't line up
   — you'd need your own manual alignment step.
