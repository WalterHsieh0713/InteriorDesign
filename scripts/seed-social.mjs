/**
 * Seed the social feed with posts built from the REAL layouts already in
 * the `rooms` table. No fixture geometry — every post points at a design
 * that actually exists, so the feed and the floor-plan thumbnails render
 * real rooms from day one.
 *
 *   node --env-file=.env.local scripts/seed-social.mjs
 *   node --env-file=.env.local scripts/seed-social.mjs --reset
 *
 * Uses plain fetch against the Supabase REST API rather than
 * @supabase/supabase-js, which needs Node 22+ for native WebSocket and
 * throws on Node 20. Next.js supplies its own WebSocket so the app is
 * fine; standalone scripts like this one are not.
 *
 * This runs against a database shared with teammates. By default it
 * refuses to run when `posts` is non-empty; pass --reset to delete every
 * post first (it will tell you how many it is about to destroy).
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run with: node --env-file=.env.local scripts/seed-social.mjs"
  );
  process.exit(1);
}

const RESET = process.argv.includes("--reset");

/** Live floor plan generated from the layout. See src/app/api/thumbnail. */
const thumbnailFor = (session) => `/api/thumbnail/${encodeURIComponent(session)}`;

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Supabase's gateway intermittently returns 502/503/504 under load. Those
 * are worth a short backoff; a 4xx means the request itself is wrong and
 * retrying it just fails slower.
 */
async function rest(path, init = {}, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
    });

    if (res.ok) return res;

    const retryable = res.status === 502 || res.status === 503 || res.status === 504;
    if (!retryable || attempt === attempts - 1) {
      throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${await res.text()}`);
    }

    console.warn(`  ${res.status} on ${init.method ?? "GET"} ${path} — retrying...`);
    await sleep(1000 * 2 ** attempt);
  }
  throw new Error("unreachable");
}

// --- deriving plausible metadata from a real layout -------------------------

/**
 * Guess a room type from what the scan actually found.
 *
 * Must return a value from ROOM_TYPES in src/lib/postMetadata.ts, or the
 * post is invisible to the room-type filter, which only offers those.
 *
 * LiDAR scans mostly yield shelf/chair/table/door/window and give nothing
 * to infer from, so the fallback assigns a plausible type deterministically
 * rather than dumping everything into one bucket. That is fabrication, and
 * acceptable only because this is seed data whose job is to exercise the
 * filters. Real posts get the type from the author in the composer.
 */
function inferRoomType(categories, seed) {
  const has = (c) => categories.includes(c);
  if (has("bed") && has("desk")) return "dorm";
  if (has("bed")) return "bedroom";
  if (has("sofa") && has("tv")) return "living room";
  if (has("sofa")) return "lounge";
  if (has("desk")) return "office";
  return pick(["studio", "office", "bedroom", "living room", "other"], seed);
}

/** Deterministic pick, so re-seeding produces the same feed. */
function pick(list, seed) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

function pickSome(list, seed, n) {
  const out = [];
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  for (let i = 0; i < n; i++) {
    const item = list[(h + i * 7) % list.length];
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

const HANDLES = [
  "mira", "tobias", "quinn", "ade", "noor",
  "jules", "sasha", "wren", "kai", "iris",
];

const STYLE_POOL = [
  "minimal", "cozy", "dorm", "warm", "industrial",
  "scandi", "cluttered", "bright", "monochrome", "plants",
];

/**
 * A few real-sounding exchanges, so the comment thread is not an empty box
 * during a demo. Questions rather than praise: "how did you fit that in" is
 * the conversation this app is actually for.
 */
const COMMENT_BODIES = [
  "how did you get a desk in there without blocking the window?",
  "what are the dimensions on that shelf? mine is a similar width",
  "the layout makes way more sense with the sofa off the wall",
  "did the scan pick up the radiator or did you move it manually?",
  "stealing this. my room is almost exactly this size",
  "curious what you did about the door swing on the left",
];

const CAPTIONS = [
  "first scan of the new place",
  "finally got the layout right",
  "before the furniture arrives",
  "rearranged everything this weekend",
  "small space, lots of storage",
  "still deciding on the corner",
  "one week in",
  "the desk situation, resolved",
  "trying a more open layout",
  "everything against the walls for now",
];

/**
 * Spread posts across the time windows so the Today / Week / Month /
 * All-time tabs return genuinely different results. A seed where every
 * row lands today makes all four tabs identical and hides ranking bugs.
 */
function createdAtFor(index, total) {
  const HOUR = 3600_000;
  const now = Date.now();
  const bucket = index / total;
  let ageHours;
  if (bucket < 0.22) ageHours = 1 + index * 3;            // today
  else if (bucket < 0.5) ageHours = 48 + index * 12;      // this week
  else if (bucket < 0.8) ageHours = 24 * 9 + index * 24;  // this month
  else ageHours = 24 * 45 + index * 72;                   // older
  return new Date(now - ageHours * HOUR).toISOString();
}

// --- main -------------------------------------------------------------------

const existing = await rest("posts?select=id&limit=1", {
  headers: { Prefer: "count=exact" },
});
const existingCount = Number(
  (existing.headers.get("content-range") ?? "/0").split("/")[1] ?? 0
);

if (existingCount > 0 && !RESET) {
  console.error(
    `Refusing to seed: \`posts\` already has ${existingCount} row(s).\n` +
      "This database is shared with teammates. Re-run with --reset to delete them first."
  );
  process.exit(1);
}

if (existingCount > 0 && RESET) {
  console.log(`--reset: deleting ${existingCount} existing post(s) (likes cascade)...`);
  await rest("posts?id=not.is.null", { method: "DELETE" });
}

const roomsRes = await rest("rooms?select=session_id,layout&order=updated_at.desc");
const rooms = await roomsRes.json();

if (rooms.length === 0) {
  console.error("No rows in `rooms` — nothing to build posts from.");
  process.exit(1);
}

const posts = [];
rooms.forEach((row, i) => {
  const layout = row.layout ?? {};
  const room = layout.room ?? {};
  const objects = Array.isArray(layout.objects) ? layout.objects : [];

  if (!(room.width > 0) || !(room.length > 0)) {
    console.warn(`  skipping ${row.session_id}: layout has no usable room dimensions`);
    return;
  }

  const categories = [...new Set(objects.map((o) => o.category))];
  const seed = row.session_id;

  posts.push({
    session_id: row.session_id,
    author_handle: pick(HANDLES, seed),
    caption: pick(CAPTIONS, seed),
    thumbnail_url: thumbnailFor(row.session_id),
    created_at: createdAtFor(i, rooms.length),
    room_type: inferRoomType(categories, seed),
    width_m: Number(room.width.toFixed(2)),
    length_m: Number(room.length.toFixed(2)),
    area_m2: Number((room.width * room.length).toFixed(2)),
    style_tags: pickSome(STYLE_POOL, seed, 2),
    // Stays null until catalog bindings are saved onto layouts. The budget
    // filter stays hidden while every row is null — seeding fake dollar
    // amounts here would make that filter look finished when it isn't.
    total_budget_cents: null,
    object_count: objects.length,
    like_count: (seed.charCodeAt(0) * 7 + objects.length * 3) % 90,
  });
});

const inserted = await (
  await rest("posts", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(posts),
  })
).json();

/**
 * Back every seeded like_count with real post_likes rows.
 *
 * The like endpoint recounts from post_likes rather than incrementing, so a
 * counter that isn't backed by rows collapses the instant someone clicks:
 * a post showing 89 drops to 1 on the first real like. Seeding the rows
 * keeps the counter honest and the ranking tabs stable during a demo.
 */
const likeRows = [];
for (const post of inserted) {
  for (let i = 0; i < post.like_count; i++) {
    likeRows.push({ post_id: post.id, device_id: `seed-device-${i}` });
  }
}

if (likeRows.length > 0) {
  // Chunked: a few thousand rows in one request is a large body and a slow
  // statement for no benefit.
  for (let i = 0; i < likeRows.length; i += 500) {
    await rest("post_likes", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify(likeRows.slice(i, i + 500)),
    });
  }
}

// Comments on a subset. A feed where every plan has the same number of
// comments looks generated, which it is, but there is no need to advertise it.
const commentRows = [];
inserted.forEach((post, i) => {
  const howMany = i % 3 === 0 ? 2 : i % 3 === 1 ? 1 : 0;
  for (let n = 0; n < howMany; n++) {
    commentRows.push({
      post_id: post.id,
      author_handle: HANDLES[(i + n + 3) % HANDLES.length],
      device_id: `seed-device-${n}`,
      body: COMMENT_BODIES[(i * 2 + n) % COMMENT_BODIES.length],
    });
  }
});

if (commentRows.length > 0) {
  await rest("post_comments", { method: "POST", body: JSON.stringify(commentRows) });

  // Keep the denormalized counter honest, the way the API route does.
  const tally = {};
  for (const row of commentRows) tally[row.post_id] = (tally[row.post_id] ?? 0) + 1;
  for (const [postId, count] of Object.entries(tally)) {
    await rest(`posts?id=eq.${postId}`, {
      method: "PATCH",
      body: JSON.stringify({ comment_count: count }),
    });
  }
}


console.log(`\nSeeded ${inserted.length} post(s) from ${rooms.length} real layout(s).`);
console.log(`  ${likeRows.length} like(s) inserted so the counters are backed by real rows.\n`);
console.log(`  ${commentRows.length} comment(s) seeded across the feed.`);

const byType = {};
for (const p of posts) byType[p.room_type] = (byType[p.room_type] ?? 0) + 1;
console.log("  room types:", Object.entries(byType).map(([k, v]) => `${k} x${v}`).join(", "));

const HOUR = 3600_000;
const now = Date.now();
const within = (h) => posts.filter((p) => now - Date.parse(p.created_at) < h * HOUR).length;
console.log(
  "  time windows:",
  `today ${within(24)}, week ${within(24 * 7)}, month ${within(24 * 30)}, all ${posts.length}`
);
console.log("\n  thumbnails render a live floor plan from each layout.\n");
