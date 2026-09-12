import Link from "next/link";
import type { Metadata } from "next";
import { PlansShell } from "@/components/social/PlansShell";
import { ShareComposer } from "@/components/social/ShareComposer";

export const metadata: Metadata = {
  title: "Share a plan | Roomii",
};

export default async function SharePage({ searchParams }: PageProps<"/share">) {
  const { session } = await searchParams;
  const sessionId = typeof session === "string" ? session : null;

  return (
    <PlansShell>
      {/* Back goes to the room being shared, not to history: you get here from
          the editor's share button, and returning to the design you were about
          to publish is the only thing "back" can usefully mean. Without a
          session there is no room to return to, so it falls back to the
          index. */}
      <Link
        href={sessionId ? `/room?session=${encodeURIComponent(sessionId)}` : "/rooms"}
        className="tb mb-5 inline-flex items-center gap-1.5 text-[12px] uppercase tracking-wider text-[var(--pencil)] transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blueline)]"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
          <path
            d="M19 12H5m0 0 6-6m-6 6 6 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {sessionId ? "Back to the room" : "All rooms"}
      </Link>

      <h1 className="mb-1 text-xl font-semibold tracking-tight">Share this plan</h1>
      <p className="tb mb-6 text-[12px] text-[var(--pencil)]">
        It goes to the public feed. Anyone with the link can open the room in 3D.
      </p>

      {sessionId ? (
        <ShareComposer session={sessionId} />
      ) : (
        <div className="sheet rounded-[2px] px-6 py-12 text-center">
          <p className="text-sm">This link is missing a design to share.</p>
          <p className="tb mt-2 text-[12px] text-[var(--pencil)]">
            Open a scanned room and use its share button, or scan a new one.
          </p>
          <Link
            href="/"
            className="tb mt-4 inline-block rounded-[2px] border border-[var(--ink)] px-4 py-2 text-[12px] uppercase tracking-wider"
          >
            Scan a room
          </Link>
        </div>
      )}
    </PlansShell>
  );
}
