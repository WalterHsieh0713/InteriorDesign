import { NextRequest, NextResponse } from "next/server";
import { IKEA_MODEL_URLS } from "@/lib/ikeaModels.generated";

/**
 * Serves IKEA's own glTF for a catalog item.
 *
 * This exists because `web-api.ikea.com` returns 403 to any request carrying a
 * browser `Origin` header, so the model cannot be loaded cross-origin however
 * permissive its CORS header looks. Fetching it from the server sidesteps that:
 * no Origin is sent, and the browser only ever talks to this app.
 *
 * It also means **no IKEA asset is stored in this repository**. The bytes pass
 * through at request time, the way they would if the browser had loaded IKEA's
 * own product page.
 *
 * Takes a catalog **id**, never a URL. Accepting a URL would make this an open
 * proxy that anything on the internet could point at any host.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const url = IKEA_MODEL_URLS[id];
  if (!url) {
    return NextResponse.json({ error: "No IKEA model for this item" }, { status: 404 });
  }

  // Belt and braces: the generated map should only ever hold IKEA URLs, but a
  // bad regenerate should not be able to turn this route into a proxy.
  if (!url.startsWith("https://web-api.ikea.com/")) {
    return NextResponse.json({ error: "Refusing a non-IKEA asset URL" }, { status: 502 });
  }

  const upstream = await fetch(url, {
    // Deliberately no Origin header — that is the whole point.
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "force-cache",
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `Upstream returned ${upstream.status}` },
      { status: 502 }
    );
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "model/gltf-binary",
      // URLs carry a content hash, so a given id+hash is immutable. Caching
      // hard keeps a room full of furniture from re-fetching on every load.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
