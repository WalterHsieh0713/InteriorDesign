/**
 * Retry a Supabase call through a transient gateway failure.
 *
 * Supabase's edge intermittently answers 502/503/504 under load — we hit it
 * three times in one afternoon of development, once mid-publish, which
 * surfaced to the user as "couldn't publish this plan" for a request that
 * was perfectly valid. The project already does this for Gemini in
 * /api/infer-layout; this is the same idea for the database.
 *
 * Only infrastructure failures are retried. A constraint violation, a
 * permission error or a malformed query will fail identically on the second
 * attempt, so retrying those just makes the error slower.
 */

/**
 * Anything shaped like a Supabase response. The generic passes the caller's
 * exact type straight through, so `count` from a counted select and the
 * non-null `data` from `.single()` both survive the wrapper.
 */
type SupabaseResponse = { error: { message?: string; code?: string } | null };

/** Gateway and connection failures, as opposed to anything Postgres decided. */
function isTransient(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;

  // Postgres error codes are five characters (23505, 42P01, ...). Their
  // presence means the database answered, so the request reached it and
  // retrying won't change the outcome.
  if (error.code && /^[0-9A-Z]{5}$/.test(error.code)) return false;

  const message = error.message ?? "";
  return /gateway|timeout|timed out|502|503|504|fetch failed|ECONNRESET|socket hang up/i.test(
    message
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T extends SupabaseResponse>(
  run: () => PromiseLike<T>,
  attempts = 3
): Promise<T> {
  let last: T | undefined;

  for (let attempt = 0; attempt < attempts; attempt++) {
    last = await run();
    if (!isTransient(last.error) || attempt === attempts - 1) return last;
    await sleep(250 * 2 ** attempt); // 250ms, then 500ms
  }

  return last as T;
}
