import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { PlansShell } from "@/components/social/PlansShell";
import { FeedView } from "@/components/social/FeedView";

export const metadata: Metadata = {
  title: "Plans — scanned rooms",
  description: "Browse room layouts people have scanned and shared.",
};

export default function FeedPage() {
  return (
    <PlansShell
      action={
        <Link
          href="/"
          className="tb rounded-[2px] border border-[var(--ink)] px-3 py-1.5 text-[12px] uppercase tracking-wider hover:bg-[var(--ink)] hover:text-white"
        >
          Scan a room
        </Link>
      }
    >
      {/* FeedView reads the URL for tab and filter state, which needs a
          Suspense boundary in the App Router. */}
      <Suspense fallback={<div className="tb text-[12px] text-[var(--pencil)]">Loading plans…</div>}>
        <FeedView />
      </Suspense>
    </PlansShell>
  );
}
