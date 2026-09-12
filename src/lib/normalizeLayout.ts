import { OBJECT_CATEGORIES, RoomLayoutSchema, type RoomLayout } from "./roomLayoutSchema";

/**
 * Brings a layout read out of the database up to the current schema.
 *
 * Two things make this necessary, and both are real rather than theoretical:
 *
 * 1. Rows written before a field existed do not have it. `binding` has a zod
 *    default, but a default only applies when something is PARSED — returning
 *    the raw JSONB skips it, and every consumer that reads `obj.binding.source`
 *    then throws on a scan saved last week.
 *
 * 2. The scanner emits RoomPlan's own category names, which are a different
 *    and larger set than ours: real rows in this database carry `washerDryer`
 *    and `oven`. Rejecting those would mean a scanned room could be read but
 *    never saved, so they are mapped instead.
 */

const KNOWN = new Set<string>(OBJECT_CATEGORIES);

/**
 * RoomPlan category -> ours, for names that don't already match one of ours
 * exactly. Appliances (oven, stove, refrigerator, ...) are NOT aliased here
 * even though they used to be - they were demoted to "other" back when this
 * project's category list didn't include them, and stayed that way after it
 * grew to (this predates the appliance/detail categories landing in
 * roomLayoutSchema.ts; `KNOWN.has(raw)` below now matches them directly).
 * Re-adding an alias here that points an appliance at "other" would silently
 * undo that work - an oven the scanner correctly identified would render as
 * an anonymous grey box again. Anything genuinely unrecognised still falls
 * through to "other" at the bottom of mapCategory, which is honest about not
 * knowing rather than mislabelling something as furniture.
 */
const ROOMPLAN_ALIASES: Record<string, (typeof OBJECT_CATEGORIES)[number]> = {
  television: "tv",
  screen: "tv",
  computer: "monitor",
  // A casing/formatting safety net, not the primary path - RoomPlan's own
  // `.washerDryer` case is expected to already match `KNOWN` exactly.
  washerdryer: "washerDryer",
};

function mapCategory(raw: unknown, dimensions: unknown): string {
  if (typeof raw !== "string") return "other";
  if (KNOWN.has(raw)) return raw;

  const key = raw.toLowerCase();
  if (key in ROOMPLAN_ALIASES) return ROOMPLAN_ALIASES[key];

  // RoomPlan's "storage" covers both a bookcase and a chest of drawers, and
  // height is what separates them.
  if (key === "storage") {
    const h = Array.isArray(dimensions) ? Number(dimensions[1]) : NaN;
    return Number.isFinite(h) && h > 1.1 ? "shelf" : "dresser";
  }
  return "other";
}

export type NormalizeResult =
  | { ok: true; layout: RoomLayout; changed: string[] }
  | { ok: false; issues: string[] };

/**
 * Normalise then validate. Returns what it had to change, so a route can log
 * drift rather than silently papering over a scanner that has gone off-contract.
 */
export function normalizeLayout(raw: unknown): NormalizeResult {
  if (!raw || typeof raw !== "object") return { ok: false, issues: ["Layout is not an object"] };

  const input = raw as Record<string, unknown>;
  const changed: string[] = [];

  const objects = Array.isArray(input.objects) ? input.objects : [];
  const mapped = objects.map((o) => {
    if (!o || typeof o !== "object") return o;
    const obj = o as Record<string, unknown>;
    const next = mapCategory(obj.category, obj.dimensions);
    if (next !== obj.category) {
      changed.push(`category "${String(obj.category)}" -> "${next}"`);
      return { ...obj, category: next };
    }
    return obj;
  });

  const parsed = RoomLayoutSchema.safeParse({ ...input, objects: mapped });
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  return { ok: true, layout: parsed.data, changed };
}
