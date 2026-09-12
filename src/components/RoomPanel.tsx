"use client";

import { useState } from "react";
import type { RoomLayout, WallFeature } from "@/lib/roomLayoutSchema";
import { WALL_SIDES } from "@/lib/roomLayoutSchema";

/**
 * The room's own shape: its dimensions, and the columns and alcoves in it.
 *
 * Dimensions start locked. They came from a scan, so they are a measurement
 * rather than a preference, and quietly letting someone nudge them turns a
 * "will this fit" answer into a guess. Unlocking is deliberate.
 */
export default function RoomPanel({
  room,
  onRoomChange,
  onClose,
}: {
  room: RoomLayout["room"];
  onRoomChange: (next: RoomLayout["room"]) => void;
  onClose: () => void;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const features = room.wallFeatures ?? [];

  function setDim(key: "width" | "length" | "height", raw: string) {
    const v = parseFloat(raw);
    if (!Number.isFinite(v) || v < 1.2 || v > 12) return;
    onRoomChange({ ...room, [key]: +v.toFixed(2) });
  }

  function addFeature(kind: WallFeature["kind"]) {
    const next: WallFeature = {
      id: crypto.randomUUID(),
      wall: WALL_SIDES[features.length % WALL_SIDES.length],
      kind,
      offset: 0,
      width: kind === "pillar" ? 0.34 : 0.6,
      height: kind === "pillar" ? room.height : kind === "recess" ? 1.0 : 0.9,
      depth: kind === "recess" ? 0.24 : 0.28,
      baseY: kind === "recess" ? 0.9 : 0,
    };
    onRoomChange({ ...room, wallFeatures: [...features, next] });
  }

  function patch(id: string, patchWith: Partial<WallFeature>) {
    onRoomChange({
      ...room,
      wallFeatures: features.map((f) => (f.id === id ? { ...f, ...patchWith } : f)),
    });
  }

  return (
    <aside className="absolute left-3 top-3 z-20 w-72 max-w-[calc(100%-24px)] overflow-y-auto rounded-lg border border-black/10 bg-white/97 p-3 shadow-lg backdrop-blur dark:border-white/10 dark:bg-neutral-900/97"
      style={{ maxHeight: "calc(100% - 24px)" }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Room</h2>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            {unlocked ? "Editing measurements from the scan." : "Locked — these came from the scan."}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded px-2 text-lg leading-none text-neutral-500 hover:bg-black/5 dark:hover:bg-white/10">
          ×
        </button>
      </div>

      <button
        onClick={() => setUnlocked((v) => !v)}
        className="mt-2 w-full rounded border border-black/10 px-2 py-1.5 text-xs hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
      >
        {unlocked ? "Lock dimensions" : "Unlock to edit"}
      </button>

      {unlocked && (
        <div className="mt-2 flex flex-col gap-1.5">
          {(["width", "length", "height"] as const).map((k) => (
            <label key={k} className="flex items-center justify-between gap-2 text-xs capitalize">
              {k}
              <input
                id={`room-${k}`}
                type="number"
                step="0.05"
                min="1.2"
                max="12"
                defaultValue={room[k].toFixed(2)}
                onChange={(e) => setDim(k, e.target.value)}
                className="w-24 rounded border border-black/15 bg-transparent px-1.5 py-1 text-right tabular-nums outline-none focus:border-blue-500 dark:border-white/15"
              />
            </label>
          ))}
        </div>
      )}

      <h3 className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
        Wall features
      </h3>
      <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">
        Columns, boxed-in pipework, alcoves. Furniture that ignores these ends up
        modelled inside a concrete pillar.
      </p>

      <ul className="mt-2 flex flex-col gap-2">
        {features.map((f) => (
          <li key={f.id} className="rounded border border-black/10 p-2 dark:border-white/10">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium capitalize">
                {f.kind} · {f.wall}
              </span>
              <button
                onClick={() =>
                  onRoomChange({ ...room, wallFeatures: features.filter((x) => x.id !== f.id) })
                }
                className="text-[11px] text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <label className="flex items-center justify-between gap-1 text-[11px] text-neutral-500">
                wall
                <select
                  id={`wall-${f.id}`}
                  value={f.wall}
                  onChange={(e) => patch(f.id, { wall: e.target.value as WallFeature["wall"] })}
                  className="w-16 rounded border border-black/15 bg-transparent px-1 py-0.5 text-[11px] dark:border-white/15"
                >
                  {WALL_SIDES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              {(["offset", "width", "depth", "height"] as const).map((k) => (
                <label key={k} className="flex items-center justify-between gap-1 text-[11px] text-neutral-500">
                  {k}
                  <input
                    id={`${k}-${f.id}`}
                    type="number"
                    step="0.05"
                    defaultValue={f[k].toFixed(2)}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!Number.isFinite(v)) return;
                      if (k !== "offset" && v <= 0) return;
                      patch(f.id, { [k]: +v.toFixed(2) });
                    }}
                    className="w-14 rounded border border-black/15 bg-transparent px-1 py-0.5 text-right tabular-nums outline-none dark:border-white/15"
                  />
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex flex-wrap gap-1">
        {(["pillar", "bump", "recess"] as const).map((k) => (
          <button
            key={k}
            onClick={() => addFeature(k)}
            className="flex-1 rounded border border-black/10 px-2 py-1 text-[11px] capitalize hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10"
          >
            + {k}
          </button>
        ))}
      </div>
    </aside>
  );
}
