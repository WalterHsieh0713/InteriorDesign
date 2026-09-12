"use client";

import { useState } from "react";

const SLOTS = [
  "Corner 1 — stand in a corner and capture as much of the room as you can",
  "Corner 2 — move to the opposite corner",
  "Corner 3 — a third corner or angle",
  "Corner 4 — the last corner or angle",
];

type SlotStatus = "empty" | "uploading" | "done" | "error";

// Vercel's free-tier serverless functions cap request bodies at 4.5MB, and
// full-res phone photos routinely exceed that — so resize before upload.
// Smaller images also make the Stage 3 vision call faster and cheaper.
async function resizeImage(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, width, height);

  return await new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to encode image"))),
      "image/jpeg",
      quality
    )
  );
}

export default function CaptureFlow({ sessionId }: { sessionId: string }) {
  const [statuses, setStatuses] = useState<SlotStatus[]>(SLOTS.map(() => "empty"));
  const [previews, setPreviews] = useState<(string | null)[]>(SLOTS.map(() => null));

  async function handleFile(index: number, file: File | undefined) {
    if (!file) return;

    setStatuses((s) => s.map((v, i) => (i === index ? "uploading" : v)));

    try {
      const resized = await resizeImage(file);
      setPreviews((p) => p.map((v, i) => (i === index ? URL.createObjectURL(resized) : v)));

      const formData = new FormData();
      formData.append("session", sessionId);
      formData.append("file", resized, `photo-${index}.jpg`);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");

      setStatuses((s) => s.map((v, i) => (i === index ? "done" : v)));
    } catch (err) {
      console.error(err);
      setStatuses((s) => s.map((v, i) => (i === index ? "error" : v)));
    }
  }

  const allDone = statuses.every((s) => s === "done");

  return (
    <div className="flex flex-col gap-4 w-full max-w-sm">
      {SLOTS.map((label, i) => (
        <label
          key={i}
          className="flex items-center gap-3 border rounded-lg p-3 cursor-pointer active:bg-gray-50"
        >
          <div className="w-16 h-16 flex-shrink-0 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
            {previews[i] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previews[i]!} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs text-gray-400">
                {statuses[i] === "uploading" ? "…" : i + 1}
              </span>
            )}
          </div>
          <div className="flex-1 text-sm">
            <div>{label}</div>
            <div className="text-xs text-gray-400">
              {statuses[i] === "done" && "Uploaded"}
              {statuses[i] === "uploading" && "Uploading…"}
              {statuses[i] === "error" && "Failed — tap to retry"}
              {statuses[i] === "empty" && "Tap to take photo"}
            </div>
          </div>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFile(i, e.target.files?.[0])}
          />
        </label>
      ))}
      {allDone && (
        <p className="text-center text-green-600 font-medium">
          All 4 photos uploaded — check your laptop.
        </p>
      )}
    </div>
  );
}
