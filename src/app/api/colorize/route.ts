import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { PHOTOS_BUCKET, supabaseAdmin } from "@/lib/supabaseAdmin";
import { SURFACE_MATERIALS, RoomLayoutSchema } from "@/lib/roomLayoutSchema";

export const maxDuration = 60;

const MODEL = "gemini-3.6-flash";

// Colors only — the geometry is already correct and must not be touched.
// This exists for the LiDAR path: RoomPlan measures the room accurately but
// captures no imagery, so the scan has no idea what anything looks like.
// Re-running full layout inference would throw away good geometry to get
// colors, which is the wrong trade.
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    wallColor: { type: Type.STRING },
    floorColor: { type: Type.STRING },
    ceilingColor: { type: Type.STRING },
    floorMaterial: { type: Type.STRING, enum: [...SURFACE_MATERIALS] },
    lightColor: { type: Type.STRING },
    objects: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          color: { type: Type.STRING },
        },
        required: ["id", "color"],
      },
    },
  },
  required: ["wallColor", "floorColor", "floorMaterial", "objects"],
};

const HEX = /^#[0-9a-fA-F]{6}$/;

async function fetchImagePart(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch photo: ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return {
    inlineData: {
      mimeType: res.headers.get("content-type") || "image/jpeg",
      data: buffer.toString("base64"),
    },
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const session = body?.session;

  if (typeof session !== "string" || !session) {
    return NextResponse.json({ error: "Missing session" }, { status: 400 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "Server missing GEMINI_API_KEY" }, { status: 500 });
  }

  const supabase = supabaseAdmin();

  const { data: row, error: layoutError } = await supabase
    .from("rooms")
    .select("layout")
    .eq("session_id", session)
    .maybeSingle();

  if (layoutError) {
    return NextResponse.json({ error: layoutError.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "No layout for this session yet" }, { status: 404 });
  }

  const parsedLayout = RoomLayoutSchema.safeParse(row.layout);
  if (!parsedLayout.success) {
    return NextResponse.json({ error: "Stored layout is malformed" }, { status: 500 });
  }
  const layout = parsedLayout.data;

  const { data: files, error: listError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .list(session);

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  const allPhotoUrls = (files ?? [])
    .filter((entry) => entry.id)
    .map(
      (entry) =>
        supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(`${session}/${entry.name}`).data.publicUrl
    );

  // The LiDAR app now uploads ~64 frames, because *projection* needs dense
  // coverage (see framesToUpload in RoomCaptureModel.swift). Reading a colour
  // palette doesn't — it saturates after a couple of dozen views, and sending
  // all of them just burns latency against this route's 60s budget. Take an
  // even spread across the session rather than the first N, which on a walked
  // scan would all be from the same corner.
  const PALETTE_SAMPLE_LIMIT = 24;
  const stride = Math.max(1, Math.ceil(allPhotoUrls.length / PALETTE_SAMPLE_LIMIT));
  const photoUrls = allPhotoUrls.filter((_, i) => i % stride === 0).slice(0, PALETTE_SAMPLE_LIMIT);

  if (photoUrls.length === 0) {
    return NextResponse.json(
      { error: "No photos for this session — upload at least one before colorizing." },
      { status: 400 }
    );
  }

  const inventory = layout.objects
    .map(
      (o) =>
        `- id "${o.id}": a ${o.category}, roughly ${o.dimensions
          .map((d) => d.toFixed(2))
          .join("×")}m, at floor position (${o.position[0].toFixed(1)}, ${o.position[2].toFixed(1)})`
    )
    .join("\n");

  const prompt = `These are photos of a single room that has already been
measured in 3D. Your only job is to report the real colors, exactly as they
appear in the photos — do not re-measure anything or invent objects.

Report:
- wallColor, floorColor, ceilingColor: the dominant color of each surface, as #rrggbb.
- floorMaterial: one of exactly: ${SURFACE_MATERIALS.join(", ")}.
- objects: for each id below, that object's dominant color as #rrggbb.

Correct for photo lighting: report each surface's own color under neutral
light, not the color a shadowed or warmly-lit frame happens to show. Someone
should recognize their own room from these colors.

- lightColor: the one exception to that correction — the tint of the room's
  actual light sources, as #rrggbb (warm incandescent/tungsten reads
  amber/orange; daylight or cool LED reads white-to-blue). This is used to
  tint the rendered scene's lighting, so report what the room is lit *by*,
  not what the surfaces are. Omit this single field if you can't tell.

The room is ${layout.room.width.toFixed(1)}m × ${layout.room.length.toFixed(1)}m.
Objects already detected in it, with their floor positions:
${inventory}

If you can't confidently see a particular object, give it a plausible color
for that kind of furniture rather than omitting it. Return every id.`;

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  let responseText: string | undefined;
  try {
    const imageParts = await Promise.all(photoUrls.map(fetchImagePart));
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }, ...imageParts] }],
      config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
    });
    responseText = response.text;
  } catch (err) {
    return NextResponse.json(
      { error: `Gemini request failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }

  let palette: {
    wallColor?: string;
    floorColor?: string;
    ceilingColor?: string;
    floorMaterial?: string;
    lightColor?: string;
    objects?: { id: string; color: string }[];
  };
  try {
    palette = JSON.parse(responseText ?? "");
  } catch {
    return NextResponse.json({ error: "Gemini returned invalid JSON", raw: responseText }, { status: 502 });
  }

  // Merge defensively: drop anything malformed rather than failing the whole
  // request, since a partial palette still improves the render.
  const byId = new Map((palette.objects ?? []).map((o) => [o.id, o.color]));
  const merged = {
    ...layout,
    room: {
      ...layout.room,
      ...(HEX.test(palette.wallColor ?? "") && { wallColor: palette.wallColor }),
      ...(HEX.test(palette.floorColor ?? "") && { floorColor: palette.floorColor }),
      ...(HEX.test(palette.ceilingColor ?? "") && { ceilingColor: palette.ceilingColor }),
      ...(SURFACE_MATERIALS.includes(palette.floorMaterial as (typeof SURFACE_MATERIALS)[number]) && {
        floorMaterial: palette.floorMaterial,
      }),
      ...(HEX.test(palette.lightColor ?? "") && { lightColor: palette.lightColor }),
    },
    objects: layout.objects.map((o) => {
      const color = byId.get(o.id);
      return HEX.test(color ?? "") ? { ...o, color } : o;
    }),
  };

  const validated = RoomLayoutSchema.safeParse(merged);
  if (!validated.success) {
    return NextResponse.json(
      { error: "Colorized layout failed validation", details: validated.error.issues },
      { status: 500 }
    );
  }

  const { error: saveError } = await supabase
    .from("rooms")
    .upsert({ session_id: session, layout: validated.data, updated_at: new Date().toISOString() });

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  return NextResponse.json(validated.data);
}
