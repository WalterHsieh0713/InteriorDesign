This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

> **This branch (`test-merge`) is a throwaway combination of the web app
> (`claude-wip`) and the iOS LiDAR app (`archive/swift-roomplan`) for
> testing the QR/session handoff between them together. It's not meant to
> land on `main` as-is — the two normally live on separate branches because
> one is a Next.js project and the other is Swift source files meant to be
> dragged into an Xcode project (see "iOS LiDAR app" below).**

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## iOS LiDAR app (`RoomScanner/`)

Scan a room with RoomPlan, convert it to the web app's JSON layout schema,
and upload it straight to the deployed web app's `/api/layout` endpoint —
the app then shares a real `/room?session=<id>` link that opens directly
into the 3D editor. See `IOS_LIDAR_AGENT.md` on this branch for the full
story of why this exists and what the conversion logic does.

```
InteriorDesignTest/
  RoomScanner/                  <- source files, added to your existing Xcode project
    RoomScannerApp.swift        <- @main entry point + roomscanner:// deep-link handler
    ContentView.swift           <- launch screen + LiDAR support check + upload/share
    RoomScanView.swift          <- full-screen live scan UI (RoomCaptureView + Done/Cancel)
    RoomCaptureModel.swift      <- owns RoomCaptureSession, RoomCaptureViewDelegate
    RoomExporter.swift          <- CapturedRoom -> RoomLayoutJSON (matches the web app's schema)
    LayoutUploader.swift        <- PUTs the layout to the web app, builds the share link
    Models.swift                <- Codable structs matching src/lib/roomLayoutSchema.ts
    ShareSheet.swift            <- UIActivityViewController wrapper
    Info-additions.plist        <- reference only — Info.plist keys to add by hand in Xcode
  viewer/
    viewer.html                 <- superseded by the real web app; kept only as a fallback
                                    static viewer if the deployed URL is ever unreachable
```

### Where the backend URL is set

`RoomScanner/LayoutUploader.swift` has one line to change:

```swift
static let baseURL = URL(string: "https://room-scanner-1v3.vercel.app")!
```

- It currently points at the **production alias**, which always serves
  whatever's on `main` — leave it alone for real demos.
- For testing this branch specifically (before it's merged to `main`),
  point it at this branch's own Vercel **preview deployment** URL instead —
  check the Vercel dashboard or the GitHub commit's status checks for the
  `test-merge` push to find it. It'll look like
  `room-scanner-<hash>-1v3.vercel.app`.
- **Never leave it pointed at a preview URL long-term** — those are pinned
  forever to the exact commit that produced them. Every scan taken with it
  set that way opens against a frozen copy of the web app, and later web
  fixes silently never reach you. Switch back to the production alias
  above once you're done testing this branch. (This has bitten this
  project before — see the git history on `archive/swift-roomplan` if you
  want the story.)
- For fastest iteration against a local `npm run dev` instead of any
  Vercel deployment: point `baseURL` at your PC's LAN IP
  (`http://<pc-ip>:3000`, not `localhost` — the phone isn't the PC), make
  sure `npm run dev` is reachable from other devices on the network, and
  that your PC's firewall allows inbound connections on port 3000. More
  fragile for a live demo than a real deployment, but nothing to redeploy
  between edits.

### The `roomscanner://` URL scheme (required for the web app's QR handoff)

The web app's "Scan with LiDAR" button shows a QR code encoding
`roomscanner://scan?session=<id>` instead of a normal link, so scanning it
launches this app directly into that session
(`DeepLinkSession` in `RoomScannerApp.swift`). This has to be registered by
hand — there's no checked-in Info.plist to do it from a file:

Target **RoomScanner** > **Info** tab > **URL Types** section > **+**:

| Field | Value |
|---|---|
| Identifier | anything, e.g. your bundle ID |
| URL Schemes | `roomscanner` |

Without this, scanning that QR code does nothing (no error, no reaction —
iOS just has nothing registered to open it).

### Required Info.plist key

Target **RoomScanner** > **Info** tab > **Custom iOS Target Properties** >
hover any row > **+**:

| Key | Value |
|---|---|
| Privacy - Camera Usage Description (`NSCameraUsageDescription`) | `This app uses the camera and LiDAR to scan your room.` |

Without this key, the app crashes the instant `RoomCaptureSession.run()` is
called. (See `Info-additions.plist` for the raw XML if you'd rather paste it.)

### Running on a physical LiDAR device

RoomPlan and `RoomCaptureSession.isSupported` **always fail in the
Simulator** — build and iterate with the Simulator, but actually scanning
needs a real device:
- iPhone 12 Pro / 12 Pro Max or any later **Pro** model, or
- iPad Pro 2020 (4th gen) or later.

### Using the app

1. Either tap **Scan Room** directly in the app, or scan the web app's
   "Scan with LiDAR" QR code (auto-opens the scanner for you).
2. Full-screen `RoomCaptureView` with Apple's live camera feed and
   built-in coaching overlay. Walk the room slowly, cover all walls.
3. Tap **Done**. `RoomCaptureView` shows its own built-in static 3D review
   render for a moment while it post-processes — expected, not a hang.
4. The app converts the result to the web app's JSON schema
   (`RoomExporter.buildLayout`) and `PUT`s it to `<baseURL>/api/layout`,
   under the QR's session id if you scanned one, or a fresh one otherwise.
5. **If you came in from the QR code:** nothing further to do — the
   browser that showed it is already polling and will jump to the 3D room
   on its own. You'll see a green "Sent to your computer" confirmation.
   **Otherwise:** the share sheet opens with a real link,
   `<baseURL>/room?session=<id>` — AirDrop/Messages/copy it.
6. If upload fails, you'll see the server's actual error message (this
   endpoint validates against the same zod schema the web app's own drag
   edits go through, so a malformed conversion shows up as a specific field
   error, not a silent failure).
7. If the scan barely covered anything, `objects` may come back
   near-empty — that's a scan-quality issue, not a bug; do a slower second
   pass.

### JSON schema produced (matches `src/lib/roomLayoutSchema.ts`)

```json
{
  "room": {"width": meters, "length": meters, "height": meters},
  "objects": [{"id","category","position":[x,y,z],"rotationY":radians,
               "dimensions":[w,h,d],"confidence":0..1}]
}
```

See the mapping table and room-bounding-box / rotation-extraction math in
`RoomExporter.swift` and `IOS_LIDAR_AGENT.md`.

### Coordinate system notes (ARKit ↔ three.js)

**ARKit's world space and three.js/WebGL are both right-handed, Y-up, with
-Z as "forward"** — no axis flip, no handedness conversion needed anywhere
in this pipeline. Things that *can* still bite you, none of which are
axis-convention bugs:

1. **Column-major, not row-major.** `simd_float4x4.columns` is stored
   column-major.
2. **Units are meters on both sides.** ARKit reports in meters; three.js is
   unitless. The viewer treats 1 unit = 1 meter with no scaling.
3. **Pivot is centered, not corner-anchored.** `CapturedRoom`'s `transform`
   places the origin at the center of each surface/object's bounding box,
   and `dimensions` is the *full* width/height/depth — matches
   `PlaneGeometry`/`BoxGeometry`'s default centered pivot.
4. **Each scan session has its own independent world origin.** RoomPlan
   resets ARKit's world coordinate space at the start of every capture
   session — `RoomExporter`'s `alignmentFrame`/`alignmentTransform` correct
   this into the room-centered, floor-at-zero frame the web schema expects.
