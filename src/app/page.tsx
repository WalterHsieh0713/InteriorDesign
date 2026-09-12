"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

type Photo = { name: string; url: string; createdAt: string | null };

export default function Home() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [captureUrl, setCaptureUrl] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [inferring, setInferring] = useState(false);
  const [inferError, setInferError] = useState<string | null>(null);

  // Generated client-side only, after mount — a UUID picked during SSR would
  // never match the one the client re-generates on hydration.
  useEffect(() => {
    const id = crypto.randomUUID();
    setSessionId(id);
    setCaptureUrl(`${window.location.origin}/capture?session=${id}`);
  }, []);

  // Deliberately dumb polling for now — Supabase Realtime replaces this later.
  useEffect(() => {
    if (!sessionId) return;

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
  }, [sessionId]);

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

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-bold">Room Scanner</h1>
      <p className="text-gray-500 max-w-sm">
        Scan this QR code on your phone to start photographing the room.
      </p>
      <div className="w-64 h-64 flex items-center justify-center bg-white rounded-lg p-4 shadow">
        {captureUrl ? (
          <QRCodeSVG value={captureUrl} size={224} />
        ) : (
          <span className="text-gray-400 text-sm">Generating session…</span>
        )}
      </div>
      {sessionId && (
        <p className="text-xs text-gray-400 font-mono break-all">
          session: {sessionId}
        </p>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 max-w-md">
          {photos.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.name}
              src={photo.url}
              alt=""
              className="w-full h-32 object-cover rounded"
            />
          ))}
        </div>
      )}

      {photos.length > 0 && (
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
