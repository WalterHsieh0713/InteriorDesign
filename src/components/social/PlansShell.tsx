import Link from "next/link";

/**
 * Chrome shared by every social page.
 *
 * Fonts used to be declared here so the feed could keep its own typography,
 * separate from the scanner's. That separation is what made the product feel
 * like two apps bolted together, so the faces now come from the root layout
 * and this file only lays out the header.
 *
 * The nav carries the same three destinations as the landing page, in the
 * same order, so moving between halves of the product does not move the
 * furniture.
 */

const navLink =
  "rounded-full px-3.5 py-2 text-sm text-[var(--fg-2)] transition-colors hover:bg-[var(--line-soft)] hover:text-[var(--fg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber)]";

export function PlansShell({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="plans min-h-full flex-1">
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-5">
        <div className="mx-auto flex max-w-6xl items-center gap-3 rounded-full border border-[var(--line)] bg-[color-mix(in_srgb,var(--ground)_78%,transparent)] py-2 pl-5 pr-2 shadow-[var(--shadow)] backdrop-blur-xl">
          <Link
            href="/feed"
            className="group flex flex-shrink-0 items-center gap-2.5 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--amber)]"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" className="h-[19px] w-[19px]">
              <rect
                x="1.4"
                y="1.4"
                width="17.2"
                height="17.2"
                rx="2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M1.4 12.6h5.2v6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                opacity=".45"
              />
              <circle cx="13.6" cy="7" r="2.6" fill="var(--amber)" />
            </svg>
            <span className="display hidden text-[17px] font-semibold sm:block">
              Room Scanner
            </span>
          </Link>

          <nav className="ml-auto flex items-center gap-0.5">
            <Link href="/" className={navLink}>
              Home
            </Link>
            <Link href="/feed" className={navLink}>
              Browse
            </Link>
            <Link href="/#scan" className={navLink}>
              Scan
            </Link>
          </nav>

          {action}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
