"use client";

import { useState } from "react";

type PhotoItem = {
  id: string;
  status: "uploading" | "done" | "error";
  preview: string;
};

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

// No cap on photo count here or in /api/infer-layout (which sends every
// photo found for the session to Gemini) — more angles measurably improves
// the inferred layout's accuracy, so the only limit is how many the person
// is willing to take. 4 is just the floor for reasonable wall coverage.
const MIN_RECOMMENDED = 4;

export default function CaptureFlow({ sessionId }: { sessionId: string }) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    // Each selected file uploads independently, so one slow/failed photo
    // never blocks the rest — and a phone gallery picker that returns
    // several files at once (multiple) still works.
    Array.from(files).forEach((file) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setPhotos((p) => [...p, { id, status: "uploading", preview: URL.createObjectURL(file) }]);
      uploadOne(id, file);
    });
  }

  async function uploadOne(id: string, file: File) {
    try {
      const resized = await resizeImage(file);
      setPhotos((p) =>
        p.map((item) => (item.id === id ? { ...item, preview: URL.createObjectURL(resized) } : item))
      );

      const formData = new FormData();
      formData.append("session", sessionId);
      // The server assigns its own storage path (crypto.randomUUID()) — this
      // filename is only ever used for its content-type-ish extension hint.
      formData.append("file", resized, "photo.jpg");

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");

      setPhotos((p) => p.map((item) => (item.id === id ? { ...item, status: "done" } : item)));
    } catch (err) {
      console.error(err);
      setPhotos((p) => p.map((item) => (item.id === id ? { ...item, status: "error" } : item)));
    }
  }

  const doneCount = photos.filter((p) => p.status === "done").length;
  const uploadingCount = photos.filter((p) => p.status === "uploading").length;
  const hasEnough = doneCount >= MIN_RECOMMENDED;

  return (
    <div className="flex flex-col gap-4 w-full max-w-sm">
      <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 cursor-pointer active:bg-gray-50 text-sm font-medium">
        + Add photo{photos.length > 0 ? "s" : ""}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      <p className="text-xs text-gray-500 text-center">
        {doneCount} photo{doneCount === 1 ? "" : "s"} uploaded
        {uploadingCount > 0 && ` — ${uploadingCount} uploading…`}
        {!hasEnough && ` — take at least ${MIN_RECOMMENDED}, more angles means better accuracy`}
      </p>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative aspect-square bg-gray-100 rounded overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" className="w-full h-full object-cover" />
              {p.status === "uploading" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-xs">
                  …
                </div>
              )}
              {p.status === "error" && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-600/70 text-white text-xs">
                  failed
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {hasEnough && uploadingCount === 0 && (
        <p className="text-center text-green-600 font-medium text-sm">
          {doneCount} photos uploaded — check your laptop, or keep adding more for better accuracy.
        </p>
      )}
    </div>
  );
}
