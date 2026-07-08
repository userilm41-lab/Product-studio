import { randomUUID } from "node:crypto";

/**
 * Caches product cutouts so regeneration can skip the (~5s) segmentation step
 * — the product layer is locked once, then only the scene varies, which is why
 * the product cannot drift between versions (Plan §3).
 *
 * In-memory + process-local for now; this moves to object storage (keyed by
 * product/asset) in M6. Bounded by count and age so it can't grow unbounded.
 */

interface Entry {
  cutout: Buffer;
  createdAt: number;
}

const MAX_ENTRIES = 100;
const TTL_MS = 60 * 60 * 1000; // 1 hour

const store = new Map<string, Entry>();

function evictExpired(now: number): void {
  for (const [id, e] of store) {
    if (now - e.createdAt > TTL_MS) store.delete(id);
  }
}

/** Store a cutout and return its new productId. */
export function putCutout(cutout: Buffer): string {
  const now = Date.now();
  evictExpired(now);
  // Bound size: drop the oldest entry (insertion order) if at capacity.
  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  const id = randomUUID();
  store.set(id, { cutout, createdAt: now });
  return id;
}

/** Retrieve a cached cutout, or undefined if missing/expired. */
export function getCutout(productId: string): Buffer | undefined {
  const e = store.get(productId);
  if (!e) return undefined;
  if (Date.now() - e.createdAt > TTL_MS) {
    store.delete(productId);
    return undefined;
  }
  return e.cutout;
}
