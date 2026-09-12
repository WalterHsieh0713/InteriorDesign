import { NextRequest, NextResponse } from "next/server";
import { PHOTOS_BUCKET, supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  const session = req.nextUrl.searchParams.get("session");
  if (!session) {
    return NextResponse.json({ error: "Missing session" }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.storage.from(PHOTOS_BUCKET).list(session, {
    sortBy: { column: "created_at", order: "asc" },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const photos = (data ?? [])
    .filter((entry) => entry.id) // skip the placeholder "folder" entry, if any
    .map((entry) => {
      const path = `${session}/${entry.name}`;
      const { data: publicUrlData } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
      return {
        name: entry.name,
        url: publicUrlData.publicUrl,
        createdAt: entry.created_at,
      };
    });

  return NextResponse.json({ photos });
}
