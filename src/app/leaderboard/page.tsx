import type { Metadata } from "next";
import { PlansShell } from "@/components/social/PlansShell";

export const metadata: Metadata = {
  title: "Leaderboard | Roomii",
  description: "The most-followed room plans, ranked.",
};

/**
 * Illustrative only — a fixed, hand-authored list rather than a query.
 * Demonstrates the ranking concept for the pitch; wiring it to
 * `posts`/`post_likes` for a real monthly ranking is future work.
 */
const LEADERBOARD: {
  handle: string;
  monthlyTop: number;
  totalStamps: number;
}[] = [
  { handle: "mira.builds", monthlyTop: 14, totalStamps: 812 },
  { handle: "kaiwrites", monthlyTop: 11, totalStamps: 704 },
  { handle: "studio.echo", monthlyTop: 9, totalStamps: 590 },
  { handle: "noor_designs", monthlyTop: 8, totalStamps: 553 },
  { handle: "theo.makes", monthlyTop: 7, totalStamps: 481 },
  { handle: "littleroom", monthlyTop: 6, totalStamps: 402 },
  { handle: "vera.k", monthlyTop: 5, totalStamps: 337 },
  { handle: "damon_scans", monthlyTop: 4, totalStamps: 289 },
  { handle: "ivy.layouts", monthlyTop: 3, totalStamps: 214 },
  { handle: "resh.rooms", monthlyTop: 2, totalStamps: 168 },
];

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage() {
  return (
    <PlansShell>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
        <p className="tb mt-2 text-[12px] text-[var(--pencil)]">
          Ranked by plans that made it to This Month. Sample data — the real
          ranking comes from the same stamps and posts already on the feed.
        </p>
      </header>

      <ol className="sheet divide-y divide-[var(--rule)] overflow-hidden rounded-[2px]">
        {LEADERBOARD.map((row, i) => (
          <li key={row.handle} className="flex items-center gap-4 px-4 py-3">
            <span className="tb w-7 shrink-0 text-center text-[13px] text-[var(--pencil)]">
              {MEDALS[i] ?? i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              @{row.handle}
            </span>
            <span className="tb shrink-0 text-[11px] uppercase tracking-wider text-[var(--pencil)]">
              {row.monthlyTop} in Top Monthly
            </span>
            <span className="tb w-16 shrink-0 text-right text-[12px] text-[var(--blueline)]">
              {row.totalStamps} stamps
            </span>
          </li>
        ))}
      </ol>
    </PlansShell>
  );
}
