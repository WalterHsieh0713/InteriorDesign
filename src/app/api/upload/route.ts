import { NextRequest, NextResponse } from "next/server";
import { PHOTOS_BUCKET, supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const session = formData.get("session");
  const file = formData.get("file");

  if (typeof session !== "string" || !session) {
    return NextResponse.json({ error: "Missing session" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const ext = file.type === "image/png" ? "png" : "jpg";
  const path = `${session}/${crypto.randomUUID()}.${ext}`;

  const supabase = supabaseAdmin();
  const { error } = await supabase
    .storage.from(PHOTOS_BUCKET)
    .upload(path, file, { contentType: file.type || "image/jpeg" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The public URL goes back to the caller because the storage path is named
  // with a UUID generated here — the LiDAR app can't derive it, and it needs
  // exactly this URL to pair the photo with the camera pose that took it
  // (see CameraFrameJSON in Models.swift on archive/swift-roomplan).
  const { data: pub } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path);

  return NextResponse.json({ path, url: pub.publicUrl });
}
