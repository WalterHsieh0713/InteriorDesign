"use client";

/**
 * Per-browser identity for the social layer.
 *
 * There are no accounts. A device id deduplicates likes and a handle
 * attributes posts — both live in localStorage, both are trivially
 * forgeable, and neither is treated as a security boundary. It is enough
 * that one person can't like the same plan forty times by clicking forty
 * times.
 *
 * Every access is guarded: localStorage throws in private windows and in
 * embedded webviews with site data blocked, and a feed that can't render
 * because storage is unavailable is a worse failure than an anonymous one.
 */

const DEVICE_KEY = "plans.deviceId";
const HANDLE_KEY = "plans.handle";
const LIKED_KEY = "plans.liked";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable. The caller keeps its in-memory copy for this
    // session; likes just won't survive a reload.
  }
}

/** Stable per-browser id, created on first use. */
export function getDeviceId(): string {
  const existing = read(DEVICE_KEY);
  if (existing) return existing;

  const id = crypto.randomUUID();
  write(DEVICE_KEY, id);
  return id;
}

export function getHandle(): string | null {
  const handle = read(HANDLE_KEY);
  return handle && handle.trim() ? handle : null;
}

export function setHandle(handle: string): void {
  const clean = handle.trim().slice(0, 24);
  write(HANDLE_KEY, clean);
  handleCache = clean;
  handleCached = true;
  for (const listener of handleListeners) listener();
}

/**
 * Which plans this browser has liked.
 *
 * A local mirror of the server's post_likes rows, so a card can render in
 * its liked state immediately instead of waiting on a round trip. The
 * server stays authoritative for the count.
 */
function parseLiked(): Set<string> {
  const raw = read(LIKED_KEY);
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v) => typeof v === "string")) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * localStorage exposed as an external store.
 *
 * Components read it through useSyncExternalStore rather than copying it
 * into state inside an effect. Reading storage during render would break
 * SSR, and the copy-in-an-effect version causes the cascading re-render
 * the react-hooks/set-state-in-effect rule exists to catch.
 *
 * The snapshot is cached because useSyncExternalStore compares snapshots by
 * identity: a fresh Set on every call would re-render forever.
 */
const listeners = new Set<() => void>();
let likedCache: Set<string> | null = null;

/** Stable empty set for the server render, where there is no storage. */
const EMPTY: ReadonlySet<string> = new Set<string>();

export function subscribeLiked(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function getLikedSnapshot(): ReadonlySet<string> {
  if (!likedCache) likedCache = parseLiked();
  return likedCache;
}

export function getLikedServerSnapshot(): ReadonlySet<string> {
  return EMPTY;
}

export function setLikedId(postId: string, liked: boolean): void {
  const next = new Set(getLikedSnapshot());
  if (liked) next.add(postId);
  else next.delete(postId);

  likedCache = next;
  write(LIKED_KEY, JSON.stringify([...next]));
  for (const listener of listeners) listener();
}

const handleListeners = new Set<() => void>();
let handleCache: string | null = null;
let handleCached = false;

export function subscribeHandle(onChange: () => void): () => void {
  handleListeners.add(onChange);
  return () => handleListeners.delete(onChange);
}

export function getHandleSnapshot(): string {
  if (!handleCached) {
    handleCache = getHandle();
    handleCached = true;
  }
  return handleCache ?? "";
}

export function getHandleServerSnapshot(): string {
  return "";
}
