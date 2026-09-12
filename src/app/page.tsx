"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

type Photo = { name: string; url: string; createdAt: string | null };
type Mode = "photos" | "lidar";

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [inferring, setInferring] = useState(false);
  const [inferError, setInferError] = useState<string | null>(null);
  const [lidarWaiting, setLidarWaiting] = useState(false);

  // A fresh session per mode choice — generated client-side only, after
  // mount, since a UUID picked during SSR would never match the one the
  // client re-generates on hydration.
  useEffect(() => {
    if (!mode) return;
    setSessionId(crypto.randomUUID());
  }, [mode]);

  // Photos path: deliberately dumb polling for now — Supabase Realtime
  // replaces this later. Unchanged from before the LiDAR path existed.
  useEffect(() => {
    if (mode !== "photos" || !sessionId) return;

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
  // straight to /api/layout under this same session id (see the deep-link
  // handoff below) — there's no separate "generate" step the way the photo
  // path needs Gemini, so as soon as GET succeeds the room is ready.
  useEffect(() => {
    if (mode !== "lidar" || !sessionId) return;

    let cancelled = false;
    setLidarWaiting(true);

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
    if (!sessionId) return;
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

  if (!mode) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 text-center">
        <h1 className="text-2xl font-bold">Room Scanner</h1>
        <p className="text-gray-500 max-w-sm">How do you want to capture the room?</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => setMode("photos")}
            className="px-4 py-3 rounded-lg border text-sm font-medium hover:bg-gray-50"
          >
            📷 Take 4 Photos
            <div className="text-xs text-gray-400 font-normal mt-0.5">Any phone — Gemini estimates the layout</div>
          </button>
          <button
            onClick={() => setMode("lidar")}
            className="px-4 py-3 rounded-lg border text-sm font-medium hover:bg-gray-50"
          >
            📡 Scan with LiDAR
            <div className="text-xs text-gray-400 font-normal mt-0.5">
              iPhone/iPad Pro with the RoomScanner app installed
            </div>
          </button>
        </div>
      </main>
    );
  }

  const captureUrl = sessionId ? `${typeof window !== "undefined" ? window.location.origin : ""}/capture?session=${sessionId}` : null;
  const lidarDeepLink = sessionId ? `roomscanner://scan?session=${sessionId}` : null;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-bold">Room Scanner</h1>
      <p className="text-gray-500 max-w-sm">
        {mode === "photos"
          ? "Scan this QR code on your phone to start photographing the room."
          : "Scan this QR code with your phone's camera — it opens the RoomScanner app straight into a scan for this session."}
      </p>
      <div className="w-64 h-64 flex items-center justify-center bg-white rounded-lg p-4 shadow">
        {mode === "photos" && captureUrl && <QRCodeSVG value={captureUrl} size={224} />}
        {mode === "lidar" && lidarDeepLink && <QRCodeSVG value={lidarDeepLink} size={224} />}
        {!sessionId && <span className="text-gray-400 text-sm">Generating session…</span>}
      </div>
      {sessionId && <p className="text-xs text-gray-400 font-mono break-all">session: {sessionId}</p>}
      <button onClick={() => setMode(null)} className="text-xs text-gray-400 underline">
        Choose a different capture method
      </button>

      {mode === "lidar" && lidarWaiting && (
        <p className="text-sm text-gray-500">Waiting for the scan to finish on your phone…</p>
      )}

      {mode === "photos" && photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 max-w-md">
          {photos.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={photo.name} src={photo.url} alt="" className="w-full h-32 object-cover rounded" />
          ))}
        </div>
      )}

      {mode === "photos" && photos.length > 0 && (
        <button
          onClick={generateLayout}
          disabled={inferring}
          className="px-4 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
        >
          {inferring ? "Generating layout…" : "Generate 3D Layout"}
        </button>
      )}

      {inferError && <p className="text-red-500 text-sm max-w-md">{inferError}</p>}
    </main>
  );
}
