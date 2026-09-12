import CaptureFlow from "@/components/CaptureFlow";

type CapturePageProps = {
  searchParams: Promise<{ session?: string }>;
};

export default async function CapturePage({ searchParams }: CapturePageProps) {
  const { session } = await searchParams;

  if (!session) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-bold">Capture</h1>
        <p className="text-red-500">No session ID found in the URL.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center gap-6 p-8 pt-12">
      <h1 className="text-2xl font-bold">Capture Room Photos</h1>
      <p className="text-sm text-gray-500 text-center max-w-sm">
        Take 4 photos from different corners of the room, covering as many
        walls as possible.
      </p>
      <CaptureFlow sessionId={session} />
    </main>
  );
}
