"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [captureUrl, setCaptureUrl] = useState<string | null>(null);

  // Generated client-side only, after mount — a UUID picked during SSR would
  // never match the one the client re-generates on hydration.
  useEffect(() => {
    const id = crypto.randomUUID();
    setSessionId(id);
    setCaptureUrl(`${window.location.origin}/capture?session=${id}`);
  }, []);

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
    </main>
  );
}
