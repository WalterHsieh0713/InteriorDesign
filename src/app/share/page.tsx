import Link from "next/link";
import type { Metadata } from "next";
import { PlansShell } from "@/components/social/PlansShell";
import { ShareComposer } from "@/components/social/ShareComposer";

export const metadata: Metadata = {
  title: "Share a plan | Room Scanner",
};

export default async function SharePage({ searchParams }: PageProps<"/share">) {
  const { session } = await searchParams;
  const sessionId = typeof session === "string" ? session : null;

  return (
    <PlansShell>
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
