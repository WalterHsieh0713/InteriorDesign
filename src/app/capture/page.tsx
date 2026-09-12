type CapturePageProps = {
  searchParams: Promise<{ session?: string }>;
};

export default async function CapturePage({ searchParams }: CapturePageProps) {
  const { session } = await searchParams;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold">Capture</h1>
      {session ? (
        <p className="font-mono text-sm break-all">session: {session}</p>
      ) : (
        <p className="text-red-500">No session ID found in the URL.</p>
      )}
    </main>
  );
}
