import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="display text-[clamp(2rem,4.5vw,3.1rem)]">Nothing here</h1>
      <p className="max-w-[46ch] leading-relaxed text-[var(--fg-2)]">
        This page doesn&apos;t exist, or whatever it pointed to is gone.
      </p>
      <Link
        href="/"
        className="mt-3 inline-flex items-center gap-2.5 rounded-full bg-[var(--amber)] px-7 py-3.5 font-semibold text-[var(--on-amber)] transition-transform hover:-translate-y-0.5 active:translate-y-0"
      >
        Back to Roomii
      </Link>
    </main>
  );
}
