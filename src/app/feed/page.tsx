import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { PlansShell } from "@/components/social/PlansShell";
import { FeedView } from "@/components/social/FeedView";

export const metadata: Metadata = {
  title: "Browse rooms | Roomii",
  description: "Browse room layouts people have scanned and shared.",
};

export default function FeedPage() {
  return (
    <PlansShell
      action={
        <Link
          href="/"
          className="tb rounded-full bg-[var(--amber)] px-5 py-2.5 text-[12px] uppercase tracking-wider text-[var(--on-amber)] transition-transform hover:-translate-y-px active:translate-y-0"
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
