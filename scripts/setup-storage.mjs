// One-time setup: creates the Supabase storage bucket used for uploaded
// room photos. Run with real env vars loaded, e.g.:
//   node --env-file=.env.local scripts/setup-storage.mjs
import { createClient } from "@supabase/supabase-js";

const BUCKET = "room-photos";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
      "Run with: node --env-file=.env.local scripts/setup-storage.mjs"
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey);

const { data: buckets, error: listError } = await supabase.storage.listBuckets();
if (listError) {
  console.error("Failed to list buckets:", listError.message);
  process.exit(1);
}

if (buckets.some((b) => b.name === BUCKET)) {
  console.log(`Bucket "${BUCKET}" already exists — nothing to do.`);
} else {
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: "15MB",
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
  });
  if (error) {
    console.error("Failed to create bucket:", error.message);
    process.exit(1);
  }
  console.log(`Created bucket "${BUCKET}" (public).`);
}
