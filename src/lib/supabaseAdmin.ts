import { createClient } from "@supabase/supabase-js";

export const PHOTOS_BUCKET = "room-photos";

// Server-only client — uses the service_role key, which bypasses Row Level
// Security. Never import this from a client component.
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
