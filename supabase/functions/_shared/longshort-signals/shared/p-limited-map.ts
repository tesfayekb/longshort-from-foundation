/**
 * Bounded-concurrency map — runs `fn(item, index)` over `items` with at most
 * `limit` concurrent invocations. Results returned in input order.
 *
 * Extracted from `longshort-universe-enrich-and-filter/index.ts:48` at FP-009
 * Bucket B Commit B2 — the momentum-orchestrator is the second consumer, the
 * boundary at which extraction wins over copy-paste. Generic over `T` (input)
 * and `R` (output); no domain coupling.
 *
 * Pure: no I/O, no clock, no randomness. Worker count is clamped to
 * `[1, items.length]`, so `limit <= 0` becomes 1 worker and `limit` greater
 * than the input length spawns at most `items.length` workers.
 *
 * Owner: longshort (FP-009 Bucket B Commit B2)
 * Classification: shared leaf utility — consumed by universe + signals layers.
 */

export async function pLimitedMap<T, R>(
  items: ReadonlyArray<T>,
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  if (items.length === 0) return results;
  let cursor = 0;
  const workers: Promise<void>[] = [];
  const workerCount = Math.min(Math.max(limit, 1), items.length);
  for (let w = 0; w < workerCount; w++) {
    workers.push((async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
      }
    })());
  }
  await Promise.all(workers);
  return results;
}