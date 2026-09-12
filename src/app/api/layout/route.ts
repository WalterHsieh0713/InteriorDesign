import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { RoomLayoutSchema } from "@/lib/roomLayoutSchema";

export async function GET(req: NextRequest) {
  const session = req.nextUrl.searchParams.get("session");
  if (!session) {
    return NextResponse.json({ error: "Missing session" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("rooms")
    .select("layout")
    .eq("session_id", session)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "No layout for this session" }, { status: 404 });
  }

  return NextResponse.json(data.layout);
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const session = body?.session;

  if (typeof session !== "string" || !session) {
    return NextResponse.json({ error: "Missing session" }, { status: 400 });
  }

  const result = RoomLayoutSchema.safeParse(body?.layout);
  if (!result.success) {
    return NextResponse.json(
      { error: "Invalid layout", details: result.error.issues },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin()
    .from("rooms")
    .upsert({ session_id: session, layout: result.data, updated_at: new Date().toISOString() });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
