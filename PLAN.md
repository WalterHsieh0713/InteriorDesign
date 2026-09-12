# Room Scanner — hackathon build plan

Photograph a room from your phone → AI infers a 3D layout → editable 3D room,
shareable by link. 24-hour hackathon, core spine only.

## Stack (locked)

- Next.js (App Router) + TypeScript, single project, deployed to Vercel
- react-three-fiber + @react-three/drei for 3D
- Supabase free tier — Storage for photos, Postgres for layouts
- Gemini API (`gemini-3.6-flash`) for vision-based layout inference

Repo: [github.com/WalterHsieh0713/room-scanner](https://github.com/WalterHsieh0713/room-scanner) (private).
Original Swift/RoomPlan iOS prototype preserved on branch `archive/swift-roomplan` — abandoned because no one on the team has a Mac.

## Provider history (why Gemini, not Claude or Grok)

The spec originally locked Anthropic/Claude. Swapped to xAI Grok when the user
had Grok credits. Considered IFM's `K2-Horizon-375B-A23B` (MLH/other
credits) — ruled out, confirmed text-only via its Hugging Face card, no
image input. Considered ElevenLabs/Solana/Auth0/MongoDB Atlas (MLH sponsor
tracks) — none fit (audio, blockchain, explicitly-excluded auth, and
DB+storage already covered by Supabase in one place). Landed on Gemini,
which natively does multimodal input + structured JSON output.

## Stages

### Stage 1 — deployed skeleton ✅
Desktop `/` generates a session ID client-side, renders a QR to
`/capture?session=<id>`. `/capture` displays the session ID. Deployed to a
real Vercel HTTPS URL (required — phone camera APIs fail over http/LAN IPs).

### Stage 2 — capture and handoff ✅
`/capture` prompts for 4 corner photos via
`<input type="file" accept="image/*" capture="environment">` (not
`getUserMedia`). Each photo is resized client-side (canvas, max 1600px,
JPEG q0.82) before upload — Vercel's Hobby-tier serverless functions cap
request bodies at **4.5MB**, and full-res phone photos routinely exceed
that. Uploaded via `/api/upload` to a public Supabase Storage bucket
(`room-photos`), keyed by session ID as the folder name. Desktop polls
`/api/photos` every 1.5s (deliberately dumb — Realtime would replace this,
out of scope for now) and renders them as they land.

### Stage 3 — layout inference ✅
`/api/infer-layout` fetches a session's photos, sends them to Gemini with a
`responseSchema` forcing structured JSON output, matching this contract:

```json
{
  "room": {"width": meters, "length": meters, "height": meters},
  "objects": [{"id","category","position":[x,y,z],"rotationY":radians,
               "dimensions":[w,h,d],"confidence":0..1}]
}
```

Meters, Y-up, origin at room center, floor at y=0. `category` is one of a
fixed enum (`src/lib/roomLayoutSchema.ts`). Validated server-side against a
matching zod schema — a non-conforming response is a clear error, not
silently-broken JSON. Retries 3x with backoff on transient Gemini 503/429
(hit this for real during hackathon-wide load testing). Result is saved to
a new `rooms` table (`session_id`, `layout jsonb`) — the first thing in
this project to need a real DB table; Stage 2 got by on Storage alone.

**Known gotcha:** `gemini-2.5-flash` is closed to new API keys as of Sept
2026 — using `gemini-3.6-flash`. If this ages out too, check
`ai.google.dev/gemini-api/docs/models` before assuming the code broke.

### Stage 4 — 3D room ✅ (furniture quality in progress)
`/room?session=<id>` loads the saved layout and renders: floor + 4
semi-transparent walls sized to the inferred room dimensions, each object
as a piece of furniture (see below). OrbitControls to look around.
Drag-and-drop: pointerdown on an object starts a drag; a global
pointermove raycasts against a horizontal plane fixed at that object's own
Y (so wall-mounted things like a TV slide at their own height, not the
floor); pointerup ends the drag and PUTs the updated layout to
`/api/layout`, so a reload restores the arrangement.

**Furniture rendering:** started as plain colored boxes (fastest way to
prove positions/rotations/dimensions were correct). Currently being
upgraded to procedurally-built shapes per category (legs + seat + backrest
for a chair, base + backrest + armrests for a sofa, frame + shelves for a
shelf, pole + shade for a lamp, etc.) — built directly from each object's
inferred `[w,h,d]` bounding box, so nothing gets stretched the way a
fixed-proportion downloaded 3D model would. True photorealistic
reconstruction (actual Street-View-level) is **not achievable** with this
pipeline — that needs dozens of calibrated photos and a
photogrammetry/NeRF pipeline, not 4 phone photos and an AI position guess.

## Explicitly out of scope for this pass

Auth, multiplayer, an AI critic, lighting controls, a gallery, styling
polish beyond what's needed to see what's happening. USDZ export (that was
a leftover from the abandoned iOS plan). These come after the spine works,
if at all.

## Local setup

```
cp .env.example .env.local   # fill in real keys
npm install
npm run setup:storage        # one-time: creates the room-photos bucket
# then run scripts/create-rooms-table.sql once in the Supabase SQL Editor
npm run dev
```
