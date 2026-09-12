import Link from "next/link";
import type { SessionSummary } from "../api/sessions/route";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeLayout } from "@/lib/normalizeLayout";

export const dynamic = "force-dynamic";

async function loadSessions(): Promise<SessionSummary[]> {
  // Queried directly rather than fetching this app's own /api/sessions. A
  // server component has no origin to fetch from, so a self-fetch has to guess
  // its own URL — and guesses wrong on any port or preview domain it was not
  // told about. /api/sessions still exists for clients that need it.
  const { data, error } = await supabaseAdmin()
    .from("rooms")
    .select("session_id, layout, updated_at")
    .order("updated_at", { ascending: false })
    .limit(60);

  if (error || !data) return [];

  const out: SessionSummary[] = [];
  for (const row of data) {
    // A room that cannot be parsed cannot be opened either, so leaving it out
    // is honest rather than offering a link that lands on an error.
    const parsed = normalizeLayout(row.layout);
    if (!parsed.ok) continue;
    const { room, objects, cameraFrames } = parsed.layout;
    out.push({
      sessionId: row.session_id,
      width: room.width,
      length: room.length,
      height: room.height,
      areaM2: +(room.width * room.length).toFixed(1),
      objectCount: objects.length,
      hasPhotos: (cameraFrames?.length ?? 0) > 0,
      updatedAt: row.updated_at ?? null,
    });
  }
  return out;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "unknown";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default async function RoomsPage() {
  const sessions = await loadSessions();

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Scanned rooms</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            {sessions.length === 0
              ? "Nothing scanned yet."
              : `${sessions.length} ${sessions.length === 1 ? "room" : "rooms"}. Open one to furnish it.`}
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link href="/" className="rounded-full border border-black/10 px-3 py-1.5 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10">
            New scan
          </Link>
          <Link href="/feed" className="rounded-full border border-black/10 px-3 py-1.5 hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10">
            Feed
          </Link>
        </nav>
      </header>

      {sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-black/15 p-10 text-center dark:border-white/15">
          <p className="text-sm text-neutral-500">
            Scan a room from the home page, or check that the database is reachable.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((s) => (
            <li key={s.sessionId}>
              <Link
                href={`/room?session=${s.sessionId}`}
                className="group flex h-full flex-col justify-between rounded-lg border border-black/10 p-4 transition hover:border-blue-500 hover:shadow-sm dark:border-white/10"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-sm font-medium tabular-nums">
                      {s.width.toFixed(1)} × {s.length.toFixed(1)} m
                    </span>
                    {s.hasPhotos && (
                      <span
                        title="Scanned with camera poses, so surfaces show real photographed pixels"
                        className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      >
                        Photo
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {s.areaM2} m² · {s.height.toFixed(1)} m ceiling · {s.objectCount} objects
                  </p>
                </div>
                <p className="mt-3 flex items-center justify-between text-xs text-neutral-400">
                  <span className="font-mono">{s.sessionId.slice(0, 8)}</span>
                  <span>{timeAgo(s.updatedAt)}</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
