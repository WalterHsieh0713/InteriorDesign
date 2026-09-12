import { normalizeLayout } from "./normalizeLayout";
import { buildShoppingList, listTotal } from "./shoppingList";

/**
 * One scanned room, reduced to what a list of rooms needs to show and sort by.
 *
 * Built in one place because two callers need it — the /rooms page, which
 * queries Postgres directly, and GET /api/sessions, which serves the same
 * thing to clients. They used to map rows independently, which was fine while
 * the shape was only measurements and would not have survived `costCents`
 * being added to one of them.
 */
export type SessionSummary = {
  sessionId: string;
  width: number;
  length: number;
  height: number;
  areaM2: number;
  objectCount: number;
  /** True when the scan carried ARKit camera poses, so the room renders real photographed surfaces. */
  hasPhotos: boolean;
  updatedAt: string | null;
  /**
   * What the furniture placed in this room would cost, in cents.
   *
   * The shopping list's own total, so this and the editor's HUD can never
   * disagree. Scanned furniture is excluded — it is already in the room and
   * was not bought here — so a room nobody has furnished is 0 rather than
   * being priced as though its existing contents were on sale.
   */
  costCents: number;
  /**
   * Whether anyone has actually furnished this room.
   *
   * Distinct from `costCents > 0`: placing a custom item with no price is
   * still furnishing it, and that room should rank above one nobody has
   * opened. A bare scan binds every object as "owned", which is what makes
   * this false.
   */
  touched: boolean;
};

type RoomRow = {
  session_id: string;
  layout: unknown;
  updated_at?: string | null;
};

/**
 * A row from `rooms` as the list needs it, or null when the layout cannot be
 * parsed — a room that cannot be opened should not be offered as a link that
 * lands on an error.
 */
export function summarizeRoom(row: RoomRow): SessionSummary | null {
  const parsed = normalizeLayout(row.layout);
  if (!parsed.ok) return null;

  const { room, objects, cameraFrames } = parsed.layout;
  const lines = buildShoppingList(objects);

  return {
    sessionId: row.session_id,
    width: room.width,
    length: room.length,
    height: room.height,
    areaM2: +(room.width * room.length).toFixed(1),
    objectCount: objects.length,
    hasPhotos: (cameraFrames?.length ?? 0) > 0,
    updatedAt: row.updated_at ?? null,
    costCents: listTotal(lines),
    touched: lines.length > 0,
  };
}

export const ROOM_SORTS = ["recent", "budget"] as const;
export type RoomSort = (typeof ROOM_SORTS)[number];

export function isRoomSort(value: string | undefined): value is RoomSort {
  return (ROOM_SORTS as readonly string[]).includes(value ?? "");
}

const byNewest = (a: SessionSummary, b: SessionSummary) =>
  Date.parse(b.updatedAt ?? "") - Date.parse(a.updatedAt ?? "") || 0;

/**
 * Order the room list.
 *
 * **An unfurnished room always sinks, whichever sort is chosen.** Every scan
 * carries an `updated_at` from the moment it was uploaded, so by raw recency a
 * room nobody has touched outranks one somebody spent an hour furnishing — which
 * is backwards for a page whose whole purpose is getting back to work. Treating
 * untouched as both zero-cost and least-recent puts the rooms with something in
 * them at the top and leaves the raw scans as a tail you scroll to.
 *
 * Within each of those two groups:
 *   recent — newest first.
 *   budget — most expensive first, ties broken by newest.
 */
export function sortSessions(sessions: SessionSummary[], sort: RoomSort): SessionSummary[] {
  return [...sessions].sort((a, b) => {
    if (a.touched !== b.touched) return a.touched ? -1 : 1;
    if (sort === "budget" && a.costCents !== b.costCents) return b.costCents - a.costCents;
    return byNewest(a, b);
  });
}

/** `$1,240` — whole dollars, which is the resolution this page reads at. */
export function formatCost(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}
