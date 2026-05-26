import "server-only";

import { getObjectBytes } from "@/lib/storage/r2";

/**
 * Fetch the raw bytes of a single R2 object by its storage key.
 *
 * Thin wrapper around `getObjectBytes` that normalises the error message
 * so callers (the docx generator) get a consistent shape regardless of
 * the underlying S3/network failure mode.
 */
export async function fetchImageBytes(
  storageKey: string
): Promise<Uint8Array> {
  const key = typeof storageKey === "string" ? storageKey.trim() : "";
  if (!key) {
    throw new Error("fetchImageBytes: storageKey must be a non-empty string");
  }
  try {
    return await getObjectBytes(key);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`fetchImageBytes(${key}): ${message}`);
  }
}

const DEFAULT_CONCURRENCY = 10;

export interface FetchImageBytesBatchResult {
  /** Map of storageKey -> bytes for successful fetches. */
  results: Map<string, Uint8Array>;
  /** Map of storageKey -> error message for fetches that threw. */
  failures: Map<string, string>;
}

/**
 * Fetch many R2 objects in parallel with a bounded concurrency cap.
 *
 * Failed fetches do NOT throw — they're collected in `failures` so the
 * caller (e.g. the docx generator) can substitute a placeholder for
 * missing images without aborting the whole document.
 *
 * Concurrency is implemented as a small counting-semaphore: we spawn at
 * most `concurrency` worker promises that share a single cursor and each
 * pull the next key until the input is drained. Duplicate keys are
 * de-duplicated up front so we never fetch the same object twice.
 */
export async function fetchImageBytesBatch(
  keys: string[],
  opts?: { concurrency?: number }
): Promise<FetchImageBytesBatchResult> {
  const results = new Map<string, Uint8Array>();
  const failures = new Map<string, string>();

  // De-duplicate while preserving the first-seen order. Trim blanks.
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const raw of keys) {
    const key = typeof raw === "string" ? raw.trim() : "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    queue.push(key);
  }

  if (queue.length === 0) {
    return { results, failures };
  }

  const requested = opts?.concurrency ?? DEFAULT_CONCURRENCY;
  const concurrency = Math.max(
    1,
    Math.min(Math.floor(requested), queue.length)
  );

  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= queue.length) return;
      const key = queue[index];
      // Guard for `noUncheckedIndexedAccess` — the bounds check above
      // guarantees `key` is defined, but the type system can't see that.
      if (key === undefined) return;
      try {
        const bytes = await fetchImageBytes(key);
        results.set(key, bytes);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.set(key, message);
      }
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return { results, failures };
}
