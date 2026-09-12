"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { LandingHero } from "@/components/LandingHero";

/** Just enough of a post to draw a rail card. */
type RailPost = {
  id: string;
  thumbnail_url: string;
  render_url: string | null;
  author_handle: string;
  area_m2: number;
  room_type: string;
  caption: string | null;
};

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

const navLink =
  "rounded-full px-3.5 py-2 text-sm text-[var(--fg-2)] transition-colors hover:bg-[var(--line-soft)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber)]";

export default function Home() {
  const router = useRouter();
  // LiDAR is the only capture path now, so there's nothing left to pick —
  // this gates the QR, and with it the polling, behind an explicit intent to
  // scan. Without the gate every idle tab would poll /api/layout forever.
  const [scanning, setScanning] = useState(false);
  const [rail, setRail] = useState<RailPost[]>([]);
  const railRef = useRef<HTMLDivElement>(null);

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

  // Recently published plans, for the rail. Display only: if the feed is
  // unreachable the section simply does not render, and nothing else on
  // this page depends on it.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/feed?tab=all")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setRail((data.posts ?? []).slice(0, 14));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function scrollRail(direction: 1 | -1) {
    railRef.current?.scrollBy({ left: direction * 340, behavior: "smooth" });
  }

  /** Arm the scan and take the visitor to it, from wherever they asked. */
  const startScan = useCallback(() => {
    setScanning(true);
    // Deferred a frame so the section has rendered its QR before we move to it.
    requestAnimationFrame(() => {
      document.getElementById("scan")?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  const lidarDeepLink = `roomscanner://scan?session=${sessionId}`;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5">
        <div className="mx-auto flex max-w-6xl items-center gap-3 rounded-full border border-[var(--line)] bg-[color-mix(in_srgb,var(--ground)_78%,transparent)] py-2 pl-5 pr-2 shadow-[var(--shadow)] backdrop-blur-xl">
          <Link href="/" className="flex flex-shrink-0 items-center gap-2.5 rounded-full">
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-[19px] w-[19px]">
              <rect x="1.4" y="1.4" width="17.2" height="17.2" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M1.4 12.6h5.2v6" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".45" />
              <circle cx="13.6" cy="7" r="2.6" fill="var(--amber)" />
            </svg>
            <span className="display hidden text-[17px] font-semibold sm:block">Roomii</span>
          </Link>
          <nav className="ml-auto flex items-center gap-0.5">
            <Link href="/rooms" className={navLink}>
              Rooms
            </Link>
            <Link href="/feed" className={navLink}>
              Browse
            </Link>
            <Link href="/leaderboard" className={navLink}>
              Leaderboard
            </Link>
          </nav>
          <button
            type="button"
            onClick={startScan}
            className="hidden flex-shrink-0 rounded-full bg-[var(--amber)] px-5 py-2.5 text-sm font-semibold text-[var(--on-amber)] transition-transform hover:-translate-y-px active:translate-y-0 sm:block"
          >
            Scan your room
          </button>
        </div>
      </header>

      {/* ── The room, coming apart ──────────────────────────────────────── */}
      <LandingHero onScan={startScan} />

      {/* ── Scan handoff. The QR is the product: this browser has no depth
           sensor, so the capture happens in the iOS app. ─────────────────── */}
      <section id="scan" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto grid max-w-6xl gap-8 rounded-3xl border border-[var(--line)] bg-[var(--raised)] p-6 sm:p-10 md:grid-cols-[auto_minmax(0,1fr)] md:gap-12">
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-2xl bg-[#FBF7F1] p-4 shadow-[var(--shadow)]">
              {scanning && sessionId ? (
                <QRCodeSVG value={lidarDeepLink} size={216} bgColor="#FBF7F1" fgColor="#141110" />
              ) : (
                <div className="flex h-[216px] w-[216px] items-center justify-center px-6 text-center">
                  <span className="tb text-[12px] leading-relaxed text-[#877c6d]">
                    {sessionId ? "Start a scan to reveal the code" : "Generating session…"}
                  </span>
                </div>
              )}
            </div>
            {scanning && sessionId && (
              <p className="tb max-w-[240px] break-all text-center text-[10.5px] leading-relaxed text-[var(--fg-3)]">
                {sessionId}
              </p>
            )}
          </div>

          <div className="flex min-w-0 flex-col">
            <span className="tb text-[11px] uppercase tracking-[0.18em] text-[var(--amber)]">
              Step one
            </span>
            <h2 className="display mt-3 text-[clamp(1.6rem,3vw,2.4rem)]">
              Point your phone at this code.
            </h2>
            <p className="mt-4 max-w-[46ch] leading-relaxed text-[var(--fg-2)]">
              Scanning it with your phone&apos;s camera opens the Roomii app straight into a
              capture for this session. Walk the room once; the measured layout lands back here on
              its own. Keep this tab open.
            </p>

            {!scanning ? (
              <button
                type="button"
                onClick={() => setScanning(true)}
                className="mt-7 inline-flex w-fit items-center gap-2.5 rounded-full bg-[var(--amber)] px-7 py-3.5 font-semibold text-[var(--on-amber)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                Start a scan
              </button>
            ) : (
              <>
                <div className="mt-7 flex items-center gap-3 rounded-2xl border border-dashed border-[var(--line)] px-5 py-6 text-sm text-[var(--fg-3)]">
                  <span className="relative flex h-2 w-2 flex-shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--amber)] opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--amber)]" />
                  </span>
                  Waiting for the scan to finish on your phone.
                </div>
                <button
                  type="button"
                  onClick={() => setScanning(false)}
                  className="tb mt-4 w-fit text-[12px] text-[var(--amber)] underline underline-offset-4"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Scanned this week ───────────────────────────────────────────── */}
      {rail.length > 0 && (
        <section className="pb-20">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="flex flex-wrap items-baseline gap-4 pb-5">
              <h2 className="display text-[clamp(1.3rem,2.2vw,1.75rem)]">Scanned this week</h2>
              <span className="ml-auto hidden text-sm text-[var(--fg-3)] sm:block">
                Plans are drawn live from each capture.
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => scrollRail(-1)}
                  aria-label="Scroll left"
                  className="grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] text-[var(--fg-2)] transition-colors hover:border-[var(--fg-3)] hover:text-[var(--fg)]"
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => scrollRail(1)}
                  aria-label="Scroll right"
                  className="grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] text-[var(--fg-2)] transition-colors hover:border-[var(--fg-3)] hover:text-[var(--fg)]"
                >
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div
              ref={railRef}
              className="rail-scroll flex gap-4 overflow-x-auto pb-2"
              tabIndex={0}
              role="region"
              aria-label="Recently scanned rooms, scrollable"
            >
              {rail.map((post) => (
                <Link
                  key={post.id}
                  href={`/p/${post.id}`}
                  className="group w-[190px] flex-shrink-0 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--raised)] transition-all duration-300 hover:-translate-y-1.5 hover:border-[var(--amber-line)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.render_url ?? post.thumbnail_url}
                    alt={`Floor plan of a ${post.room_type}`}
                    className="aspect-square w-full bg-[var(--ground)] object-contain"
                    loading="lazy"
                  />
                  <div className="border-t border-[var(--line-soft)] px-3 py-2.5">
                    <p className="truncate text-[13px] text-[var(--fg)]">
                      {post.caption || post.room_type}
                    </p>
                    <p className="tb mt-1 text-[11px] text-[var(--fg-3)]">
                      {post.author_handle}, {Math.round(post.area_m2)} m²
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section className="px-5 pb-24 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-20">
          <div className="md:sticky md:top-28 md:self-start">
            <span className="tb text-[11px] uppercase tracking-[0.18em] text-[var(--fg-3)]">
              How it works
            </span>
            <h2 className="display mt-4 text-[clamp(1.9rem,4vw,3.2rem)]">
              From your floor to the feed.
            </h2>
            <p className="mt-5 max-w-[34ch] text-[var(--fg-2)]">
              No accounts, no setup. Walk the room once and the geometry is yours to rearrange.
            </p>
          </div>

          <div>
            {[
              {
                title: "Scan",
                body: "Walk the room once with the Roomii app. LiDAR reads the walls where they actually are — bays, angled corners and partitions included — along with openings and anything tall enough to bump into.",
                metric: "Around 40 seconds for a single room.",
              },
              {
                title: "Arrange",
                body: "Drag furniture across the real footprint, or swap in a product you can actually buy and watch the total move. Nothing snaps to a fake grid, so if the wardrobe will not clear the door swing, you find out here instead of in the shop.",
                metric: "Every position stored in metres.",
              },
              {
                title: "Share",
                body: "Publish the layout with a caption. It lands in a feed people filter by room size, so a 19 m² studio is compared against other 19 m² studios.",
                metric: "Filtered by dimension, not by vibe.",
              },
            ].map((step, i) => (
              <article
                key={step.title}
                className={`border-t border-[var(--line)] py-8 ${i === 2 ? "border-b" : ""}`}
              >
                <h3 className="display text-[1.45rem] font-semibold">{step.title}</h3>
                <p className="mt-2.5 max-w-[46ch] leading-relaxed text-[var(--fg-2)]">{step.body}</p>
                <p className="tb mt-3.5 text-[12px] text-[var(--amber)]">{step.metric}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="mt-auto border-t border-[var(--line)] px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start gap-x-12 gap-y-6">
          <Link href="/feed" className="text-sm text-[var(--fg-2)] hover:text-[var(--amber)]">
            Browse designs
          </Link>
          <Link href="/rooms" className="text-sm text-[var(--fg-2)] hover:text-[var(--amber)]">
            Scanned rooms
          </Link>
          <p className="ml-auto max-w-[32ch] text-right text-[13px] text-[var(--fg-3)]">
            A scan stays in your capture session until you publish a layout.
          </p>
        </div>
      </footer>
    </div>
  );
}
