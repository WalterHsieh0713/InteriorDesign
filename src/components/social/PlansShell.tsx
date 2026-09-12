import Link from "next/link";
import { Archivo, IBM_Plex_Mono } from "next/font/google";

/**
 * Chrome shared by every social page.
 *
 * Fonts are declared here rather than in the root layout so the scanner and
 * room views keep their own typography. Archivo is a tight industrial
 * grotesk for the interface; IBM Plex Mono carries the title-block data —
 * dimensions, areas, counts — the way a drawing sheet would.
 */

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export function PlansShell({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className={`${archivo.variable} ${plexMono.variable} plans min-h-full flex-1`}>
      <header className="border-b border-[var(--rule)] bg-[var(--sheet)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/feed" className="group flex items-baseline gap-2">
            <span className="text-lg font-semibold tracking-tight">Plans</span>
            <span className="tb text-[11px] uppercase text-[var(--pencil)] group-hover:text-[var(--blueline)]">
              scanned rooms
            </span>
          </Link>
          {action}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
