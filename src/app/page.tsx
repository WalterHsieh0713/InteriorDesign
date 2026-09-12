"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

type Photo = { name: string; url: string; createdAt: string | null };

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
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [inferring, setInferring] = useState(false);
  const [inferError, setInferError] = useState<string | null>(null);
  const [rail, setRail] = useState<RailPost[]>([]);
  const railRef = useRef<HTMLDivElement>(null);

  // Generated client-side only — a UUID picked during SSR would never match
  // the one the client re-generates on hydration. useSyncExternalStore is
  // built for exactly this: it renders the server snapshot (null) through
  // hydration, then swaps in the client one, with no setState in an effect
  // and no mismatch warning.
  const sessionId = useSyncExternalStore(subscribeSession, getSessionId, getServerSessionId);
  const captureUrl = sessionId ? `${window.location.origin}/capture?session=${sessionId}` : null;

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
    <div className="flex min-h-full flex-1 flex-col">
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
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
            <Link href="/" className={`${navLink} bg-[var(--raised)] text-[var(--fg)]`} aria-current="page">
              Home
            </Link>
            <Link href="/feed" className={navLink}>
              Browse
            </Link>
            <a href="#scan" className={navLink}>
              Scan
            </a>
          </nav>
          <a
            href="#scan"
            className="hidden flex-shrink-0 rounded-full bg-[var(--amber)] px-5 py-2.5 text-sm font-semibold text-[var(--on-amber)] transition-transform hover:-translate-y-px active:translate-y-0 sm:block"
          >
            Scan my room
          </a>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-5 pb-16 pt-16 sm:px-8 sm:pb-24 sm:pt-28">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-40 h-[520px]"
          style={{
            background:
              "radial-gradient(46% 60% at 22% 34%, rgb(233 179 106 / 0.20), transparent 62%), radial-gradient(38% 52% at 76% 22%, rgb(233 179 106 / 0.13), transparent 64%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl">
          <span className="tb text-[11px] uppercase tracking-[0.18em] text-[var(--fg-3)]">
            LiDAR room capture
          </span>
          <h1 className="display mt-5 max-w-[19ch] text-[clamp(2.6rem,7vw,5.6rem)]">
            Every room here was measured, not{" "}
            <span className="text-[var(--amber)]">imagined</span>.
          </h1>
          <p className="mt-6 max-w-[52ch] text-[clamp(1rem,1.5vw,1.18rem)] leading-relaxed text-[var(--fg-2)]">
            Scan the room you actually live in, then find what other people did with one the same
            size. Down to the centimetre, because the floor plan comes off the sensor and not out of
            a mood board.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a
              href="#scan"
              className="inline-flex items-center gap-2.5 rounded-full bg-[var(--amber)] px-7 py-3.5 font-semibold text-[var(--on-amber)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              Scan my room
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2 8h12M9 3l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <Link
              href="/feed"
              className="inline-flex items-center rounded-full border border-[var(--line)] px-7 py-3.5 font-semibold text-[var(--fg)] transition-colors hover:border-[var(--fg-3)] hover:bg-[var(--raised)]"
            >
              Browse designs
            </Link>
          </div>
        </div>
      </section>

      {/* ── Scan handoff. The QR is the product: this browser cannot read
           depth, so the capture happens on a phone. ──────────────────────── */}
      <section id="scan" className="scroll-mt-24 px-5 pb-20 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 rounded-3xl border border-[var(--line)] bg-[var(--raised)] p-6 sm:p-10 md:grid-cols-[auto_minmax(0,1fr)] md:gap-12">
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-2xl bg-[#FBF7F1] p-4 shadow-[var(--shadow)]">
              {captureUrl ? (
                <QRCodeSVG value={captureUrl} size={216} bgColor="#FBF7F1" fgColor="#141110" />
              ) : (
                <div className="flex h-[216px] w-[216px] items-center justify-center">
                  <span className="tb text-[12px] text-[#877c6d]">Generating session…</span>
                </div>
              )}
            </div>
            {sessionId && (
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
              The capture runs on your phone, because that is where the depth sensor is. Photograph
              the room from a few angles and the shots appear here as they arrive. Keep this tab
              open.
            </p>

            {photos.length === 0 ? (
              <div className="mt-7 flex items-center gap-3 rounded-2xl border border-dashed border-[var(--line)] px-5 py-6 text-sm text-[var(--fg-3)]">
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--amber)] opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--amber)]" />
                </span>
                Waiting for the first photo.
              </div>
            ) : (
              <>
                <div className="mt-7 flex items-baseline justify-between gap-3">
                  <span className="tb text-[11px] uppercase tracking-[0.14em] text-[var(--fg-3)]">
                    Received
                  </span>
                  <span className="tb text-[12px] text-[var(--fg-2)]">
                    {photos.length} {photos.length === 1 ? "photo" : "photos"}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                  {photos.map((photo) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={photo.name}
                      src={photo.url}
                      alt=""
                      className="h-24 w-full rounded-xl border border-[var(--line)] object-cover"
                    />
                  ))}
                </div>
              </>
            )}

            {photos.length > 0 && (
              <button
                onClick={generateLayout}
                disabled={inferring}
                className="mt-7 inline-flex w-fit items-center gap-2.5 rounded-full bg-[var(--amber)] px-7 py-3.5 font-semibold text-[var(--on-amber)] transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:translate-y-0 disabled:opacity-50"
              >
                {inferring ? "Generating layout…" : "Generate 3D layout"}
              </button>
            )}

            {inferError && (
              <p className="mt-4 max-w-[46ch] rounded-xl border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-4 py-3 text-sm text-[var(--danger)]">
                {inferError}
              </p>
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
                    className="aspect-square w-full bg-[var(--ground)] object-cover"
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
                body: "Photograph the room from a few angles on your phone. The depth pass reads walls, openings and anything tall enough to bump into.",
                metric: "Around 40 seconds for a single room.",
              },
              {
                title: "Arrange",
                body: "Drag furniture across the real footprint. Nothing snaps to a fake grid, so if the wardrobe will not clear the door swing, you find out here instead of in the shop.",
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
          <a href="#scan" className="text-sm text-[var(--fg-2)] hover:text-[var(--amber)]">
            Scan a room
          </a>
          <p className="ml-auto max-w-[32ch] text-right text-[13px] text-[var(--fg-3)]">
            Photos stay in your capture session until you publish a layout.
          </p>
        </div>
      </footer>
    </div>
  );
}
