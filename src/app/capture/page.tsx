import Link from "next/link";
import CaptureFlow from "@/components/CaptureFlow";

type CapturePageProps = {
  searchParams: Promise<{ session?: string }>;
};

const backLink = (
  <Link
    href="/rooms"
    className="tb inline-flex items-center gap-1.5 text-[12px] uppercase tracking-wider text-gray-500 transition-colors hover:text-gray-900"
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
    All rooms
  </Link>
);

export default async function CapturePage({ searchParams }: CapturePageProps) {
  const { session } = await searchParams;

  if (!session) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
        {backLink}
        <h1 className="text-2xl font-bold">Capture</h1>
        <p className="text-red-500">No session ID found in the URL.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center gap-6 p-8 pt-12">
      <div className="w-full max-w-sm">{backLink}</div>
      <h1 className="text-2xl font-bold">Capture Room Photos</h1>
      <p className="text-sm text-gray-500 text-center max-w-sm">
        Take as many photos as you can from different corners and angles —
        covering every wall and piece of furniture. More photos means better
        accuracy, so keep going past the minimum if you can.
      </p>
      <CaptureFlow sessionId={session} />
    </main>
  );
}
