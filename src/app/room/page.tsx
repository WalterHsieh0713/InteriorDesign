import Link from "next/link";
import RoomScene from "@/components/RoomScene";

type RoomPageProps = {
  searchParams: Promise<{ session?: string }>;
};

export default async function RoomPage({ searchParams }: RoomPageProps) {
  const { session } = await searchParams;

  if (!session) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
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
        <h1 className="text-2xl font-bold">Room</h1>
        <p className="text-red-500">No session ID found in the URL.</p>
      </main>
    );
  }

  return <RoomScene sessionId={session} />;
}
