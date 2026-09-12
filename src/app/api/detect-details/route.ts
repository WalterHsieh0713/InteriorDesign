import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { RoomLayoutSchema, type RoomLayout } from "@/lib/roomLayoutSchema";
import {
  placeDetection,
  mergeDetections,
  rejectDuplicates,
  snapToSupports,
  type Detection2D,
  type PlacedObject,
} from "@/lib/backproject";

export const maxDuration = 60;

const MODEL = "gemini-3.6-flash";

// The small stuff LiDAR structurally cannot return. RoomPlan's
// CapturedRoom.Object.Category is a fixed 16-value Apple enum — there is no
// thermostat in it and never will be — so these come from looking at the
// photos instead. Everything here is deliberately small and usually mounted
// flat against a surface, which is exactly the case the back-projection
// handles well.
const DETECTABLE = [
  "monitor",
  "keyboard",
  "speaker",
  "clock",
  "artwork",
  "thermostat",
  "smokeAlarm",
  "outlet",
  "lightSwitch",
  "vent",
  "books",
  "plant",
  "mirror",
] as const;

// Frames are cheap to upload but not to reason over. A spread of this many
// gives most small fittings two or more sightings — which is what
// mergeDetections needs to accept them — while staying inside the 60s budget.
const FRAMES_TO_ANALYZE = 14;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    detections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING, enum: [...DETECTABLE] },
          xmin: { type: Type.NUMBER },
          ymin: { type: Type.NUMBER },
          xmax: { type: Type.NUMBER },
          ymax: { type: Type.NUMBER },
          confidence: { type: Type.NUMBER },
        },
        required: ["category", "xmin", "ymin", "xmax", "ymax", "confidence"],
      },
    },
  },
  required: ["detections"],
};

const PROMPT = `This is one photo of a room that has already been measured in 3D.
Find the small fixtures and items in it that a LiDAR scan cannot detect.

Report every instance you can actually see of exactly these categories:
${DETECTABLE.join(", ")}.

For each one give a tight bounding box as normalized coordinates in the range
0 to 1, with the origin at the TOP-LEFT of the image:
- xmin, xmax: left and right edges, as a fraction of image width.
- ymin, ymax: top and bottom edges, as a fraction of image height.
- confidence: 0 to 1, how sure you are this is really that object.

Rules that matter:
- Only report what is genuinely visible in THIS photo. Do not infer things
  that are probably in the room but out of frame.
- Box the object itself, tightly — not the furniture it sits on, and not the
  wall around it. The box size is used to compute the object's real-world
  size, so a loose box produces a wrong measurement.
- Do not report large furniture (beds, sofas, tables, desks, chairs,
  appliances). Those are already measured and reporting them again creates
  duplicates.
- If you see nothing from the list, return an empty array. An empty answer is
  much better than a guessed one.`;

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

function isSaneBox(d: Detection2D): boolean {
  const within = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;
  if (![d.xmin, d.ymin, d.xmax, d.ymax].every(within)) return false;
  if (d.xmax <= d.xmin || d.ymax <= d.ymin) return false;
  // A "small item" filling most of the frame is a misdetection — usually the
  // wall itself labelled as artwork.
  if ((d.xmax - d.xmin) * (d.ymax - d.ymin) > 0.6) return false;
  return d.confidence >= 0.35;
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
  const { data: row, error: loadError } = await supabase
    .from("rooms")
    .select("layout")
    .eq("session_id", session)
    .maybeSingle();

  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }
  if (!row?.layout) {
    return NextResponse.json({ error: "No layout for this session yet" }, { status: 404 });
  }

  const parsed = RoomLayoutSchema.safeParse(row.layout);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Stored layout failed validation", details: parsed.error.issues },
      { status: 500 }
    );
  }
  const layout: RoomLayout = parsed.data;

  // This whole route is back-projection: without a camera pose per photo
  // there's no way to turn a 2D box into a 3D position, and guessing a depth
  // would put things in worse places than not adding them at all.
  const frames = layout.cameraFrames ?? [];
  if (frames.length === 0) {
    return NextResponse.json(
      {
        error:
          "This session has no camera poses, so 2D detections can't be placed in 3D. " +
          "Only LiDAR scans carry them.",
      },
      { status: 400 }
    );
  }

  // An even spread across the walk, not the first N — consecutive frames are
  // all from wherever the scan started.
  const stride = Math.max(1, Math.ceil(frames.length / FRAMES_TO_ANALYZE));
  const chosen = frames.filter((_, i) => i % stride === 0).slice(0, FRAMES_TO_ANALYZE);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // One call per frame rather than one call with every image: the model has
  // to report coordinates relative to a specific photo, and batching them
  // reliably produces boxes attributed to the wrong image.
  const perFrame = await Promise.all(
    chosen.map(async (frame) => {
      try {
        const image = await fetchImagePart(frame.url);
        const response = await ai.models.generateContent({
          model: MODEL,
          contents: [{ role: "user", parts: [{ text: PROMPT }, image] }],
          config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
        });
        const detections = (JSON.parse(response.text ?? "{}")?.detections ?? []) as Detection2D[];
        return { frame, detections: detections.filter(isSaneBox) };
      } catch {
        // One bad frame shouldn't lose the whole pass.
        return { frame, detections: [] as Detection2D[] };
      }
    })
  );

  const placed: PlacedObject[] = [];
  for (const { frame, detections } of perFrame) {
    for (const detection of detections) {
      const result = placeDetection(detection, frame, layout);
      if (result) placed.push(result);
    }
  }

  // Snap last, after clustering has settled each item's final position —
  // averaging across frames would otherwise lift a snapped item back off its
  // surface by a centimetre or two.
  const merged = snapToSupports(
    rejectDuplicates(mergeDetections(placed), layout.objects),
    layout
  );

  if (merged.length === 0) {
    return NextResponse.json({
      added: 0,
      analyzed: chosen.length,
      raw: placed.length,
      note: "Nothing new survived merging — either none were visible or none were seen twice.",
    });
  }

  const additions = merged.map((item, index) => ({
    id: `detected-${item.category}-${index}`,
    category: item.category as RoomLayout["objects"][number]["category"],
    position: item.position,
    rotationY: item.rotationY,
    dimensions: item.dimensions,
    confidence: Math.min(1, Math.max(0, item.confidence)),
  }));

  // Replace rather than append on re-run, so calling this twice doesn't
  // double everything it found the first time.
  const kept = layout.objects.filter((o) => !o.id.startsWith("detected-"));
  const updated = { ...layout, objects: [...kept, ...additions] };

  const validated = RoomLayoutSchema.safeParse(updated);
  if (!validated.success) {
    return NextResponse.json(
      { error: "Detected objects failed validation", details: validated.error.issues },
      { status: 500 }
    );
  }

  const { error: saveError } = await supabase
    .from("rooms")
    .upsert({ session_id: session, layout: validated.data, updated_at: new Date().toISOString() });

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 500 });
  }

  return NextResponse.json({
    added: additions.length,
    analyzed: chosen.length,
    raw: placed.length,
    categories: additions.map((a) => a.category),
  });
}
