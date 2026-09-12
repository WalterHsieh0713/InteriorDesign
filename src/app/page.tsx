"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { PlansShell } from "@/components/social/PlansShell";

type Photo = { name: string; url: string; createdAt: string | null };
type Mode = "photos" | "lidar";

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
  const [mode, setMode] = useState<Mode | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [inferring, setInferring] = useState(false);
  const [inferError, setInferError] = useState<string | null>(null);

  // Same lazy-external-store pattern as the rest of this app uses for
  // client-only ids — a UUID picked during SSR would never match the one
  // the client re-generates on hydration, and this sidesteps needing a
  // setState-in-effect to reconcile them.
  const sessionId = useSyncExternalStore(subscribeSession, getSessionId, getServerSessionId);

  // Photos path: deliberately dumb polling for now — Supabase Realtime
  // replaces this later.
  useEffect(() => {
    if (mode !== "photos") return;

    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/photos?session=${sessionId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setPhotos(data.photos ?? []);
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
  }, [mode, sessionId]);

  // LiDAR path: the iOS app uploads a fully-formed, already-validated layout
  // straight to /api/layout under this same session id (see the roomscanner://
  // deep link below) — there's no separate "generate" step the way the photo
  // path needs Gemini, so as soon as GET succeeds the room is ready.
  useEffect(() => {
    if (mode !== "lidar") return;

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
  }, [mode, sessionId, router]);

  async function generateLayout() {
    setInferring(true);
    setInferError(null);
    try {
      const res = await fetch("/api/infer-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: sessionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Layout inference failed");
      }
      router.push(`/room?session=${sessionId}`);
    } catch (err) {
      setInferError(err instanceof Error ? err.message : "Layout inference failed");
      setInferring(false);
    }
  }

  const captureUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/capture?session=${sessionId}`;
  const lidarDeepLink = `roomscanner://scan?session=${sessionId}`;

  return (
    <PlansShell
      action={
        <Link href="/feed" className="tb text-[12px] uppercase tracking-wider text-[var(--blueline)]">
          View the feed →
        </Link>
      }
    >
      <div className="mx-auto max-w-lg">
        <h1 className="text-xl font-semibold tracking-tight">Scan a room</h1>
        <p className="tb mt-1 text-[12px] text-[var(--pencil)]">
          Measure it, then share it to Plans when you&apos;re happy with it.
        </p>

        {!mode && (
          <div className="mt-6 grid gap-3">
            <button
              type="button"
              onClick={() => setMode("photos")}
              className="sheet rounded-[2px] p-4 text-left transition-colors hover:border-[var(--blueline)]"
            >
              <div className="text-sm font-medium">📷 Take 4 photos</div>
              <div className="tb mt-1 text-[11px] text-[var(--pencil)]">
                Any phone — an estimated layout, inferred from the photos.
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode("lidar")}
              className="sheet rounded-[2px] p-4 text-left transition-colors hover:border-[var(--blueline)]"
            >
              <div className="text-sm font-medium">📡 Scan with LiDAR</div>
              <div className="tb mt-1 text-[11px] text-[var(--pencil)]">
                iPhone/iPad Pro with the RoomScanner app — measured, not estimated.
              </div>
            </button>
          </div>
        )}

        {mode && (
          <div className="mt-6">
            <p className="tb mb-3 text-[12px] text-[var(--pencil)]">
              {mode === "photos"
                ? "Scan this QR code on your phone to start photographing the room."
                : "Scan this QR code with your phone's camera — it opens the RoomScanner app straight into a scan for this session."}
            </p>

            <div className="sheet flex w-fit items-center justify-center rounded-[2px] p-4">
              <QRCodeSVG value={mode === "photos" ? captureUrl : lidarDeepLink} size={208} />
            </div>

            <p className="tb mt-3 break-all text-[11px] text-[var(--pencil)]">session: {sessionId}</p>
            <button
              type="button"
              onClick={() => {
                setMode(null);
                setPhotos([]);
                setInferError(null);
              }}
              className="tb mt-2 text-[12px] text-[var(--blueline)] underline underline-offset-4"
            >
              Choose a different capture method
            </button>

            {mode === "lidar" && (
              <p className="tb mt-4 text-[12px] text-[var(--pencil)]">Waiting for the scan to finish on your phone…</p>
            )}

            {mode === "photos" && photos.length > 0 && (
              <div className="mt-6 grid grid-cols-2 gap-3">
                {photos.map((photo) => (
                  <div key={photo.name} className="sheet overflow-hidden rounded-[2px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt="" className="h-32 w-full object-cover" />
                  </div>
                ))}
              </div>
            )}

            {mode === "photos" && photos.length > 0 && (
              <button
                type="button"
                onClick={generateLayout}
                disabled={inferring}
                className="tb mt-4 rounded-[2px] bg-[var(--ink)] px-5 py-2.5 text-[12px] uppercase tracking-wider text-white disabled:opacity-40"
              >
                {inferring ? "Generating layout…" : "Generate 3D layout"}
              </button>
            )}

            {inferError && (
              <p className="mt-4 rounded-[2px] border border-[var(--stamp)] bg-white px-3 py-2 text-sm text-[var(--stamp)]">
                {inferError}
              </p>
            )}
          </div>
        )}
      </div>
    </PlansShell>
  );
}
