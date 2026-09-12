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

const navLink =
  "rounded-full px-3.5 py-2 text-sm text-[var(--fg-2)] transition-colors hover:bg-[var(--line-soft)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber)]";

export default async function RoomsPage() {
  const sessions = await loadSessions();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Same pill nav as the landing page. Duplicated rather than extracted
          because the landing page's copy carries client state (it arms the
          scan poll) and this one is a plain server component. */}
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5">
        <div className="mx-auto flex max-w-6xl items-center gap-3 rounded-full border border-[var(--line)] bg-[color-mix(in_srgb,var(--ground)_78%,transparent)] py-2 pl-5 pr-2 shadow-[var(--shadow)] backdrop-blur-xl">
          <Link href="/" className="flex flex-shrink-0 items-center gap-2.5 rounded-full">
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-[19px] w-[19px]">
              <rect x="1.4" y="1.4" width="17.2" height="17.2" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M1.4 12.6h5.2v6" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".45" />
              <circle cx="13.6" cy="7" r="2.6" fill="var(--amber)" />
            </svg>
            <span className="display hidden text-[17px] font-semibold sm:block">Room Scanner</span>
          </Link>
          <nav className="ml-auto flex items-center gap-0.5">
            <Link href="/" className={navLink}>
              Home
            </Link>
            <Link href="/rooms" className={`${navLink} bg-[var(--raised)] text-[var(--fg)]`} aria-current="page">
              Rooms
            </Link>
            <Link href="/feed" className={navLink}>
              Browse
            </Link>
          </nav>
          <Link
            href="/"
            className="hidden flex-shrink-0 rounded-full bg-[var(--amber)] px-5 py-2.5 text-sm font-semibold text-[var(--on-amber)] transition-transform hover:-translate-y-px active:translate-y-0 sm:block"
          >
            Scan my room
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-14 sm:px-8 sm:pt-20">
        <header className="mb-10 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <h1 className="display text-[clamp(2rem,4.5vw,3.1rem)]">Scanned rooms</h1>
            <p className="mt-3 max-w-[46ch] leading-relaxed text-[var(--fg-2)]">
              {sessions.length === 0
                ? "Nothing scanned yet."
                : `Every one of these was measured off the sensor. Open one to furnish it.`}
            </p>
          </div>
          {sessions.length > 0 && (
            <p className="tb text-[12px] uppercase tracking-[0.18em] text-[var(--fg-3)]">
              {sessions.length} {sessions.length === 1 ? "room" : "rooms"}
            </p>
          )}
        </header>

        {sessions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[var(--line)] px-6 py-20 text-center">
            <p className="text-[var(--fg-2)]">
              Scan a room from the home page, or check that the database is reachable.
            </p>
            <Link
              href="/"
              className="mt-7 inline-flex items-center gap-2.5 rounded-full bg-[var(--amber)] px-7 py-3.5 font-semibold text-[var(--on-amber)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              Scan a room
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 8h12M9 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((s) => (
              <li key={s.sessionId}>
                <Link
                  href={`/room?session=${s.sessionId}`}
                  className="group flex h-full flex-col justify-between rounded-2xl border border-[var(--line)] bg-[var(--raised)] p-5 transition-all duration-300 hover:-translate-y-1 hover:border-[var(--amber-line)] hover:shadow-[var(--shadow-lift)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber)]"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      {/* The dimensions are the room's identity here — this
                          product's whole claim is that they are measured, so
                          they lead the card rather than a generic title. */}
                      <span className="tb text-[15px] text-[var(--fg)] transition-colors group-hover:text-[var(--amber)]">
                        {s.width.toFixed(1)} × {s.length.toFixed(1)} m
                      </span>
                      {s.hasPhotos && (
                        <span
                          title="Scanned with camera poses, so surfaces show real photographed pixels"
                          className="tb shrink-0 rounded-full border border-[var(--amber-line)] bg-[var(--amber-wash)] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--amber)]"
                        >
                          Photo
                        </span>
                      )}
                    </div>
                    {/* --fg-2 rather than --fg-3 on this surface: fg-3 lands
                        at 4.08:1 on --raised, under the floor for text this
                        small. The feed's cards use fg-2 here for the same
                        reason. */}
                    <p className="tb mt-2.5 text-[12px] leading-relaxed text-[var(--fg-2)]">
                      {s.areaM2} m² · {s.height.toFixed(1)} m ceiling · {s.objectCount} objects
                    </p>
                  </div>
                  <p className="tb mt-6 flex items-center justify-between gap-3 border-t border-[var(--line-soft)] pt-3.5 text-[11px] text-[var(--fg-2)]">
                    <span>{s.sessionId.slice(0, 8)}</span>
                    <span>{timeAgo(s.updatedAt)}</span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
