# Verify the iOS build before rescanning

Paste into Claude Code, run on the Mac, in the RoomScanner Xcode project's
git checkout.

---

Check that this iOS project is actually up to date and correctly wired
before I rescan. Run `git status` and `git log -1 --oneline` in this repo —
confirm the branch is `archive/swift-roomplan` and the top commit is
`3d5dec7` or later (the recent commits should include "Report why detail
detection found nothing", "Call /api/detect-details after colorize", "Export
every measured wall", and "Capture and upload camera poses"). If it's
behind, pull it.

Then check that the actual Xcode project's file references point at these
git-tracked files and not stale local copies — earlier in this project the
Xcode project was set up with "Copy items if needed" checked, which
silently duplicates files instead of referencing the repo, so `git pull`
wouldn't change what actually gets built.

Confirm `ContentView.swift` (in Xcode's Project Navigator) has the
`detectDetails` call right after `colorize`, and that
`RoomCaptureModel.swift` / `RoomExporter.swift` actually capture and align
camera poses per frame — if what's open in Xcode doesn't match what's in
git, tell me exactly what's different so I know whether to fix the Xcode
references or just rebuild.

---

## Why this exists

A scan tested against `three-combined-initial` (web branch) came back with
zero camera frames, no measured walls, and only the old basic object
categories — none of the recent scanning work. That's not a web-side bug:
the web app's schema, rendering, and `/api/detect-details` route were all
verified directly against the live database and are correctly merged. The
scan itself came from a stale build — missing not just the newest wall/detail
commits, but camera-pose capture, which predates those. This checklist is
the fast way to confirm the Mac is actually building current code before
spending another scan cycle debugging the wrong end.
