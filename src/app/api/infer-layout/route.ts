import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { PHOTOS_BUCKET, supabaseAdmin } from "@/lib/supabaseAdmin";
import { OBJECT_CATEGORIES, RoomLayoutSchema } from "@/lib/roomLayoutSchema";

// Vision + reasoning over several images can run long — give it more than
// the platform's 10s default before we get cut off mid-inference.
export const maxDuration = 60;

const MODEL = "gemini-3.6-flash";

const PROMPT = `You are analyzing photos of a single room, taken from several
different corners, to reconstruct a simple 3D layout of it.

Estimate:
1. The room's overall dimensions in meters: width, length, height.
2. Every distinct piece of furniture or fixture you can actually identify
   across the photos (don't invent objects you can't see).

For each object, estimate:
- category: one of exactly these strings: ${OBJECT_CATEGORIES.join(", ")}.
  Use "other" if nothing fits.
- position: [x, y, z] in meters, the object's center point.
- rotationY: rotation around the vertical Y axis, in radians.
- dimensions: [width, height, depth] in meters (full extent, not half).
- confidence: your confidence in this estimate, from 0 to 1.

Coordinate system: right-handed, Y-up, floor at y = 0, origin at the exact
center of the room's floor. x and z span the floor plane; y is height off
the floor. Use consistent units (meters) and keep estimates physically
plausible for a residential room.

Respond with JSON only, matching the given schema exactly.`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    room: {
      type: Type.OBJECT,
      properties: {
        width: { type: Type.NUMBER },
        length: { type: Type.NUMBER },
        height: { type: Type.NUMBER },
      },
      required: ["width", "length", "height"],
    },
    objects: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          category: { type: Type.STRING, enum: [...OBJECT_CATEGORIES] },
          position: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          rotationY: { type: Type.NUMBER },
          dimensions: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          confidence: { type: Type.NUMBER },
        },
        required: ["id", "category", "position", "rotationY", "dimensions", "confidence"],
      },
    },
  },
  required: ["room", "objects"],
};

function isRetryableGeminiError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  // Transient overload, e.g. {"error":{"code":503,"status":"UNAVAILABLE",...}}
  // or 429 RESOURCE_EXHAUSTED — worth a short backoff-and-retry. Anything
  // else (bad request, auth, schema issues) should fail immediately.
  return /"code":\s*(429|503)/.test(message) || /UNAVAILABLE|RESOURCE_EXHAUSTED/.test(message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithRetry(
  ai: GoogleGenAI,
  params: Parameters<typeof ai.models.generateContent>[0],
  attempts = 3
) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      const isLastAttempt = attempt === attempts - 1;
      if (isLastAttempt || !isRetryableGeminiError(err)) throw err;
      await sleep(1000 * 2 ** attempt); // 1s, then 2s
    }
  }
  throw new Error("unreachable");
}

async function fetchImageAsInlinePart(url: string) {
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
  const { data: files, error: listError } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .list(session);

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 });
  }

  const photoUrls = (files ?? [])
    .filter((entry) => entry.id)
    .map(
      (entry) =>
        supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(`${session}/${entry.name}`).data
          .publicUrl
    );

  if (photoUrls.length === 0) {
    return NextResponse.json(
      { error: "No photos found for this session. Upload photos first." },
      { status: 400 }
    );
  }

  let imageParts;
  try {
    imageParts = await Promise.all(photoUrls.map(fetchImageAsInlinePart));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load photos" },
      { status: 500 }
    );
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  let responseText: string | undefined;
  try {
    const response = await generateWithRetry(ai, {
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: PROMPT }, ...imageParts] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    });
    responseText = response.text;
  } catch (err) {
    return NextResponse.json(
      { error: `Gemini request failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }

  if (!responseText) {
    return NextResponse.json({ error: "Gemini returned an empty response" }, { status: 502 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return NextResponse.json(
      { error: "Gemini did not return valid JSON", raw: responseText },
      { status: 502 }
    );
  }

  const result = RoomLayoutSchema.safeParse(parsed);
  if (!result.success) {
    return NextResponse.json(
      { error: "Gemini's output didn't match the expected schema", details: result.error.issues, raw: parsed },
      { status: 502 }
    );
  }

  const { error: saveError } = await supabase
    .from("rooms")
    .upsert({ session_id: session, layout: result.data, updated_at: new Date().toISOString() });

  if (saveError) {
    return NextResponse.json(
      { error: `Inferred layout but failed to save it: ${saveError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(result.data);
}
