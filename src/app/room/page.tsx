import RoomScene from "@/components/RoomScene";

type RoomPageProps = {
  searchParams: Promise<{ session?: string }>;
};

export default async function RoomPage({ searchParams }: RoomPageProps) {
  const { session } = await searchParams;

  if (!session) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-bold">Room</h1>
        <p className="text-red-500">No session ID found in the URL.</p>
      </main>
    );
  }

  return <RoomScene sessionId={session} />;
}
