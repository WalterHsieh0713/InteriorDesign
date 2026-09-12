"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * The landing hero: a scanned room that comes apart, one chapter at a time.
 *
 * The clip is 8.000s / 192 frames / 24fps and re-encoded all-intra, so pausing
 * lands on an exact frame rather than hunting back to the nearest keyframe —
 * which the source render, with a single keyframe in the whole file, could not
 * do. Rest points were read off the frames themselves:
 *
 *   0.00  the room intact, before the orbit
 *   2.30  orbit finished, the instant before it lets go
 *   3.70  burst complete, the pieces out in a ring
 *   8.00  settled
 *
 * Scroll is borrowed, not stolen. While chapters remain, a downward wheel
 * advances one and the page stays put; once the last chapter is reached the
 * wheel is released and the page scrolls on to the scanner below. Anyone who
 * would rather not sit through it has a skip control throughout.
 */

const STOPS = [0, 2.3, 3.7, 8] as const;
const LAST = STOPS.length - 1;

type Chapter = {
  title: React.ReactNode;
  body?: string;
  wordmark?: boolean;
};

const CHAPTERS: Chapter[] = [
  {
    wordmark: true,
    title: "ROOMII",
  },
  {
    title: (
      <>
        Measured, not <em>imagined</em>.
      </>
    ),
    body: "A LiDAR pass reads your walls where they actually stand — the bay, the alcove, the boxed-in pillar in the corner — in about forty seconds.",
  },
  {
    title: (
      <>
        Then take it <em>apart</em>.
      </>
    ),
    body: "Put real furniture back into the space you just measured, move it across the true footprint, and watch what it costs move with it.",
  },
  {
    title: "Every piece, accounted for.",
    body: "RoomPlan measures the shell down to the centimetre. Gemini finds what LiDAR cannot see — the thermostat, the outlet, the books — and back-projects them onto geometry we already trust. The catalog prices whatever you put back in.",
  },
];

export function LandingHero({ onScan }: { onScan: () => void }) {
  const hostRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  // Read inside the rAF loop, which must not re-subscribe every render.
  // `playingRef` is the authority and `playing` is its render-visible copy;
  // both are written together in settle() and goTo(), never during render.
  const targetRef = useRef(0);
  const playingRef = useRef(false);

  const settle = useCallback(() => {
    const v = videoRef.current;
    playingRef.current = false;
    setPlaying(false);
    if (!v) return;
    try {
      v.pause();
      v.currentTime = targetRef.current;
    } catch {
      // A pause mid-seek can throw; the frame we land on is close enough.
    }
  }, []);

  const goTo = useCallback(
    (next: number) => {
      const v = videoRef.current;
      if (!v || !ready || playingRef.current || next === phase) return;
      if (next < 0 || next > LAST) return;

      targetRef.current = STOPS[next];
      setPhase(next);

      // Backwards rewinds rather than plays: pieces flying back together at
      // speed reads as a glitch, not as a rewind.
      if (next < phase) {
        try {
          v.currentTime = STOPS[next];
        } catch {}
        return;
      }

      playingRef.current = true;
      setPlaying(true);
      const started = v.play();
      // Autoplay refused: land on the frame anyway so the story still moves.
      if (started) started.catch(() => settle());
    },
    [phase, ready, settle]
  );

  const advance = useCallback(() => {
    if (phase < LAST) goTo(phase + 1);
  }, [phase, goTo]);

  // timeupdate fires only a few times a second, which would overshoot a 1.4s
  // segment badly, so the stop is watched every frame.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v && playingRef.current && v.currentTime >= targetRef.current - 0.012) {
        settle();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [settle]);

  // A muted video that has never played paints nothing in several browsers, so
  // nudge it once and pause immediately to force frame 0 on screen.
  const onLoadedData = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const done = () => {
      try {
        v.pause();
        v.currentTime = 0;
      } catch {}
      setReady(true);
    };
    const started = v.play();
    if (started) started.then(done).catch(() => setReady(true));
    else done();
  }, []);

  // Wheel is borrowed while chapters remain and handed back afterwards, so the
  // page below is always reachable.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let lock = false;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 8) return;
      if (e.deltaY > 0 && phase >= LAST) return; // done — let the page scroll
      if (e.deltaY < 0 && phase === 0) return; // at the top — let it be
      e.preventDefault();
      if (lock) return;
      lock = true;
      window.setTimeout(() => {
        lock = false;
      }, 420);
      if (e.deltaY > 0) advance();
      else goTo(phase - 1);
    };

    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [phase, advance, goTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && el.closest && el.closest("a,button,input,textarea")) return;
      if (e.key === "ArrowRight" || e.key === " ") {
        if (phase < LAST) {
          e.preventDefault();
          advance();
        }
      } else if (e.key === "ArrowLeft" && phase > 0) {
        e.preventDefault();
        goTo(phase - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, advance, goTo]);

  const skip = useCallback(() => {
    document.getElementById("scan")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const chapter = CHAPTERS[phase];

  return (
    <section
      ref={hostRef}
      aria-label="What Roomii does"
      className="relative h-[100svh] w-full overflow-hidden bg-black"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button")) return;
        advance();
      }}
    >
      <video
        ref={videoRef}
        src="/roomii.mp4"
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        onLoadedData={onLoadedData}
        onError={() => setReady(true)}
        className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 scale-[1.04] object-cover"
      />

      {/* Dark at the top and bottom where the nav and the prompt sit, open
          through the middle where the room actually is. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(20,17,16,.88) 0%, rgba(20,17,16,.16) 26%, rgba(20,17,16,.16) 72%, rgba(20,17,16,.94) 100%)",
        }}
      />
      {/* A ring, not a blob: a centred glow would sit behind the headline and
          undo the scrim, so the amber stays out at the object's radius. */}
      <div aria-hidden="true" className="hero-bloom pointer-events-none absolute inset-0" />
      <div aria-hidden="true" className="hero-grain pointer-events-none absolute inset-[-50%]" />

      {/* Copy, with a scrim that travels with it. The room is bright and busy
          exactly where the text lands, so shadow is pooled behind the words
          rather than laid over the whole frame. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-5 pb-32 pt-28 text-center sm:px-10">
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 h-[min(660px,92%)] w-[min(1180px,104%)] -translate-x-1/2 -translate-y-1/2"
          style={{
            background:
              "radial-gradient(closest-side, rgba(10,8,7,.92) 0%, rgba(10,8,7,.86) 34%, rgba(10,8,7,.62) 58%, rgba(10,8,7,.26) 79%, transparent 100%)",
          }}
        />

        <div key={phase} className="hero-copy relative z-10 flex flex-col items-center">
          {chapter.wordmark ? (
            <>
              <h1 className="display hero-shadow text-[clamp(54px,15vw,190px)] font-bold tracking-[-0.05em]">
                {chapter.title}
              </h1>
              <p className="tb hero-shadow-sm mt-4 text-[clamp(11px,1.1vw,13px)] uppercase tracking-[0.34em] text-[var(--fg-2)]">
                Rooms, measured
              </p>
            </>
          ) : (
            <>
              <h1 className="display hero-shadow max-w-[15ch] text-[clamp(36px,7.2vw,104px)] leading-[0.97]">
                {chapter.title}
              </h1>
              {chapter.body && (
                <p className="hero-shadow-sm mt-5 max-w-[50ch] text-[clamp(15px,1.28vw,19px)] leading-relaxed text-[#ece5da]">
                  {chapter.body}
                </p>
              )}
            </>
          )}

          {phase === 1 && (
            <div className="pointer-events-auto mt-8">
              <button
                type="button"
                onClick={onScan}
                className="inline-flex h-12 items-center rounded-full bg-[var(--amber)] px-7 font-semibold text-[var(--on-amber)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                Scan your room
              </button>
            </div>
          )}

          {phase === 2 && (
            <div className="pointer-events-auto mt-8">
              <Link
                href="/feed"
                className="inline-flex h-12 items-center rounded-full bg-[var(--amber)] px-7 font-semibold text-[var(--on-amber)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                Browse for inspiration
              </Link>
            </div>
          )}

          {phase === LAST && (
            <div className="pointer-events-auto mt-8 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={onScan}
                className="inline-flex h-12 items-center rounded-full bg-[var(--amber)] px-7 font-semibold text-[var(--on-amber)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                Scan your room
              </button>
              <Link
                href="/feed"
                className="inline-flex h-12 items-center rounded-full border border-[var(--line)] px-7 font-medium text-[var(--fg)] transition-colors hover:border-[var(--amber-line)] hover:bg-[var(--raised)]"
              >
                See other rooms
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Chapter dots */}
      <nav
        aria-label="Chapter"
        className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-3 sm:right-6"
      >
        {CHAPTERS.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Chapter ${i + 1}`}
            aria-current={i === phase}
            onClick={() => goTo(i)}
            className={`h-2 w-2 rounded-full transition-all duration-300 ${
              i === phase ? "scale-150 bg-[var(--amber)]" : "bg-[var(--line)] hover:bg-[var(--fg-3)]"
            }`}
          />
        ))}
      </nav>

      {/* One prompt, doing two jobs: it says the story advances while there is
          more, and becomes the way down once there is not. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 pb-7">
        {!playing && (
          <>
            <span className="hero-arrow text-[var(--fg-2)]" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 5v13m0 0 6-6m-6 6-6-6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <button
              type="button"
              onClick={phase >= LAST ? skip : advance}
              className="tb pointer-events-auto hero-shadow-sm text-[11px] uppercase tracking-[0.22em] text-[var(--fg-2)] transition-colors hover:text-[var(--fg)]"
            >
              {phase >= LAST ? "Scroll on" : phase === 0 ? "Scroll or click to begin" : "Scroll or click to continue"}
            </button>
          </>
        )}
        {phase < LAST && (
          <button
            type="button"
            onClick={skip}
            className="tb pointer-events-auto mt-1 text-[10px] uppercase tracking-[0.2em] text-[var(--fg-3)] transition-colors hover:text-[var(--fg-2)]"
          >
            Skip to scanner
          </button>
        )}
      </div>
    </section>
  );
}
