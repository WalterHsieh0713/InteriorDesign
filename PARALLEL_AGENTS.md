# Parallel work breakdown — read this first

This is a standalone brief for whichever Claude Code session picks it up.
You have no memory of how this project got built — everything you need is
here and in `PLAN.md` (read that too, it has the full stage-by-stage
history and known gotchas).

## What this project is

A hackathon web app: photograph a room from your phone, Gemini infers a 3D
layout, you get an editable 3D room you can drag furniture around in and
share by link. The core spine (QR handoff → 4-photo capture/upload → Gemini
layout inference → 3D render with drag + persistence) is **done and
working end-to-end**. What's left is everything that was deliberately
deferred until the spine worked: polish, reliability, and new features.

Stack: Next.js (App Router) + TypeScript, react-three-fiber + drei,
Supabase (Storage + Postgres), Gemini API (`gemini-3.6-flash`). Deployed
to Vercel — check the Vercel dashboard for the current URL, it's not
recorded here.

**There's a 4th workstream too, Mac-only:** a real LiDAR scanning path
using the original archived RoomPlan iOS app (`archive/swift-roomplan`
branch) instead of Gemini's photo-based guessing — significantly more
accurate, but needs a physical Mac + a LiDAR device to build/run. If
you're on a Mac, `git checkout archive/swift-roomplan` and read
`IOS_LIDAR_AGENT.md` **on that branch** (it doesn't exist on `main`) for
the full standalone brief.

## Before you start

1. Read `PLAN.md` in full.
2. `git fetch --all && git branch -r` — check which `agent-N-*` branches
   already exist. That tells you which slots are taken. If all three
   exist, talk to your teammates instead of guessing.
3. `cp .env.example .env.local` and get the real key values from whoever
   owns the Supabase/Gemini accounts — **out of band (Slack/in person),
   never through a file you commit or paste into a chat log.** The
   Supabase bucket (`room-photos`) and `rooms` table already exist; you do
   not need to re-run `npm run setup:storage` or the SQL setup script.
4. `npm install && npm run build` — confirm you're starting from a clean,
   working baseline before changing anything.

## Git workflow — read carefully, this is what prevents you from clobbering each other

- **Never push directly to `main`.** Three people building in parallel on
  the same branch will stomp on each other within the hour.
- Create your own branch: `git checkout -b agent-N-<short-name>` (N = your
  number, e.g. `agent-1-polish`).
- Commit and push to your own branch as you go.
- When done (or when you want it merged), open a PR into `main`, or tell
  the project owner to merge it manually — don't merge into `main`
  yourself unless explicitly told to.
- Pull `main` and rebase/merge it into your branch periodically so you're
  not diverging for the whole hackathon.

## Do not touch, regardless of which agent you are

- `src/lib/roomLayoutSchema.ts` — the JSON contract every stage depends
  on. Changing field names/shapes breaks the other two workstreams.
- The Supabase bucket/table structure (`room-photos` bucket, `rooms`
  table schema) — coordinate with the group first if you think you need
  a schema change.
- Existing route paths (`/capture`, `/room`, `/api/upload`,
  `/api/photos`, `/api/infer-layout`, `/api/layout`) — renaming these
  breaks whoever's mid-work on another branch.
- Don't force-push anything, ever, without asking the project owner
  first.

Run `npm run build` before every commit. A broken build blocks everyone
merging after you.

---

## Agent 1 — Visual polish & UX

**Goal:** make it look and feel like a real product instead of a working
prototype. Currently: bare Tailwind utility classes, no loading
skeletons, minimal error states, default browser file-picker UI on
mobile.

**Scope (styling/UX only — don't touch data flow, API calls, or the drag
logic itself):**
- `src/app/page.tsx` — desktop landing page. Real layout, not just
  centered flex-column text. Nicer QR presentation, a proper photo grid,
  loading/empty states.
- `src/app/capture/page.tsx` + `src/components/CaptureFlow.tsx` — this is
  what a stranger sees on their phone with no context. Make the 4-photo
  flow feel guided and obviously mobile-first (large tap targets, clear
  progress, a visible "done" state).
- `src/components/RoomScene.tsx` — **only the HUD overlay** (the
  dimensions/object-count/saving-indicator box in the top-left), not the
  `Scene`/`DraggableObject`/drag-handling logic. Feel free to add a
  category legend, a "reset view" button, etc.
- `src/app/globals.css` — shared tokens/utilities if you want them.

**Explicitly not your job:** the furniture geometry in
`src/components/FurnitureMesh.tsx` (that's finished — category-accurate
procedural shapes, not boxes), any API route, the polling/Realtime
mechanism (Agent 2's job).

## Agent 2 — Reliability & the Realtime upgrade

**Goal:** the spine works on the happy path; this is about what happens
when it doesn't, plus a known, explicitly-flagged follow-up.

**Scope:**
- **Swap polling for Supabase Realtime.** `src/app/page.tsx` currently
  polls `/api/photos` every 1.5s (see the comment in that file — this was
  called out from the start as "deliberately dumb for now"). Replace it
  with a Supabase Realtime subscription on the storage bucket (or a
  broadcast/postgres-changes channel if you add a lightweight `photos`
  table — your call on approach, just document it).
- **Edge cases across the pipeline:**
  - `/api/infer-layout`: what happens with 1 photo instead of 4? A room
    Gemini can't parse? Extremely large object counts?
  - `/api/upload`: no file-type/size validation exists client-side beyond
    the resize step — add real validation and clear error messages.
  - Session cleanup: nothing ever deletes old sessions' photos or rows.
    Not urgent for a 24hr hackathon, but worth at least a documented plan
    or a simple TTL-based cleanup script.
- Consider basic automated coverage for the zod schema validation and the
  retry logic in `/api/infer-layout` (the 503/429 backoff — see
  `isRetryableGeminiError` in that file).

**Explicitly not your job:** visual styling (Agent 1), new features
(Agent 3). If you touch `page.tsx` for the Realtime swap, keep your diff
scoped to the data-fetching logic, not the surrounding JSX styling — Agent
1 is working in the same file.

## Agent 3 — New feature (previously out of scope, now unlocked)

The original brief said "DO NOT BUILD: auth, multiplayer, the AI critic,
lighting controls, a gallery, or any styling beyond what's needed... those
come after the spine works." The spine works. Pick one:

**Default recommendation: an AI critic.** A new Gemini call
(`src/app/api/critic/route.ts`) that takes the saved layout JSON and
returns structured feedback — blocked walkways, furniture too close to
doors/windows, awkward TV sightlines, whatever a reasonable interior
designer would flag. Surface it as a panel in `/room`. This is a clean,
almost entirely net-new set of files (low collision risk with Agents 1/2),
and it's a second, more interesting use of the same Gemini dependency
already in the project.

**Alternatives, if you'd rather:**
- **A gallery** — a page listing past sessions/rooms (needs a way to
  browse the `rooms` table; keep it read-only and simple).
- **Lighting controls** — time-of-day or warm/cool lighting presets in
  `RoomScene.tsx`'s `<Canvas>` — note this one *does* touch a file Agent 1
  is also in, so coordinate on that specifically if you pick it.

**Still out of scope, don't build these:** auth, multiplayer (live
simultaneous multi-user editing — the link is already shareable and
editable by anyone who has it, just not simultaneously-synced), USDZ
export (leftover from the abandoned iOS plan).

**Explicitly not your job:** don't restyle existing pages beyond what's
needed to surface your new feature (Agent 1's job), don't touch the
polling/Realtime mechanism (Agent 2's job).
