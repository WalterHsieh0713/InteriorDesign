"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { PlansShell } from "@/components/social/PlansShell";

/**
 * The capture session id, as an external store.
 *
 * One id per page load, created lazily the first time the client asks for
 * it. The snapshot has to be cached: useSyncExternalStore compares by
 * identity, so minting a fresh UUID per call would re-render forever.
 */
let cachedSessionId: string | null = null;

function subscribeSession(): () => void {
  return () => {};
}

function getSessionId(): string {
  if (!cachedSessionId) cachedSessionId = crypto.randomUUID();
  return cachedSessionId;
}

function getServerSessionId(): string | null {
  return null;
}

export default function Home() {
  const router = useRouter();
  // LiDAR is the only capture path now, so there's nothing left to pick —
  // this just gates the hero screen before showing the QR.
  const [scanning, setScanning] = useState(false);

  // Same lazy-external-store pattern as the rest of this app uses for
  // client-only ids — a UUID picked during SSR would never match the one
  // the client re-generates on hydration, and this sidesteps needing a
  // setState-in-effect to reconcile them.
  const sessionId = useSyncExternalStore(subscribeSession, getSessionId, getServerSessionId);

  // The iOS app uploads a fully-formed, already-validated layout straight to
  // /api/layout under this same session id (see the roomscanner:// deep link
  // below), so as soon as GET succeeds the room is ready.
  useEffect(() => {
    if (!scanning) return;

    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/layout?session=${sessionId}`);
        if (res.ok && !cancelled) {
          router.push(`/room?session=${sessionId}`);
        }
      } catch {
        // transient network hiccup — next poll will retry
      }
    }

    poll();
    const interval = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [scanning, sessionId, router]);

  const lidarDeepLink = `roomscanner://scan?session=${sessionId}`;

  return (
    <PlansShell
      action={
        <div className="flex items-center gap-4">
          <Link href="/rooms" className="tb text-[12px] uppercase tracking-wider text-[var(--blueline)]">
            Scanned rooms
          </Link>
          <Link href="/feed" className="tb text-[12px] uppercase tracking-wider text-[var(--blueline)]">
            View the feed →
          </Link>
        </div>
      }
    >
      {!scanning ? (
        <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Plans</h1>
          <p className="tb mt-3 max-w-sm text-[13px] text-[var(--pencil)]">
            Measure a real room, then see what everyone else did with theirs.
          </p>
          <button
            type="button"
            onClick={() => setScanning(true)}
            className="tb mt-8 rounded-[2px] bg-[var(--ink)] px-6 py-3 text-[13px] uppercase tracking-wider text-white"
          >
            Scan a room
          </button>
          <Link href="/feed" className="tb mt-4 text-[12px] text-[var(--blueline)] underline underline-offset-4">
            Or browse plans
          </Link>
        </div>
      ) : (
        <div className="mx-auto max-w-lg">
          <h1 className="text-xl font-semibold tracking-tight">Scan a room</h1>
          <p className="tb mt-1 text-[12px] text-[var(--pencil)]">
            Measure it, then share it to Plans when you&apos;re happy with it.
          </p>

          <div className="mt-6">
            <p className="tb mb-3 text-[12px] text-[var(--pencil)]">
              Scan this QR code with your phone&apos;s camera — it opens the RoomScanner app straight into a scan
              for this session.
            </p>

            <div className="sheet flex w-fit items-center justify-center rounded-[2px] p-4">
              <QRCodeSVG value={lidarDeepLink} size={208} />
            </div>

            <p className="tb mt-3 break-all text-[11px] text-[var(--pencil)]">session: {sessionId}</p>
            <button
              type="button"
              onClick={() => setScanning(false)}
              className="tb mt-2 text-[12px] text-[var(--blueline)] underline underline-offset-4"
            >
              Back
            </button>

            <p className="tb mt-4 text-[12px] text-[var(--pencil)]">Waiting for the scan to finish on your phone…</p>
          </div>
        </div>
      )}
    </PlansShell>
  );
}
