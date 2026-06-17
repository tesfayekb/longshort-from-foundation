/**
 * Paginated PostgREST read helper — FP-052 corrective.
 *
 * Root cause this addresses: PostgREST applies a project-wide default
 * row cap (1000 in this project) to any `.select()` that omits both
 * `.range()` and `.limit()`. Unbounded reads silently truncate to an
 * arbitrary 1000-row slice (physical storage order) — catastrophic for
 * the combiner assembler, which interprets missing rows as
 * `is_present=false` and excludes the ticker.
 *
 * Contract: caller supplies a `build(from, to)` factory that materializes
 * the full chained PostgREST builder for a single page (so this helper
 * stays DB-free / unit-testable). We loop `.range(from, from+pageSize-1)`
 * pages, accumulate rows, and terminate on a short read
 * (`data.length < pageSize`). Any per-page error is propagated as a
 * thrown Error — never silently swallowed to an empty result.
 *
 * NOT a substitute for a server-side aggregate when one suffices.
 * Use only for "load all matching rows for downstream pure assembly".
 */

export interface PostgrestPageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export type PostgrestPageBuilder<T> = PromiseLike<PostgrestPageResult<T>>;

/** PostgREST's project-wide default cap. Page size MUST match the cap so
 * a short read unambiguously signals end-of-result (anything smaller
 * would still hide a truncation at the cap boundary). */
export const POSTGREST_DEFAULT_PAGE_SIZE = 1000;

/**
 * Page through a PostgREST query until a short read.
 *
 * @param build  Factory returning a fresh awaitable builder for the
 *               page `[from, to]` (inclusive). MUST end with `.range(from, to)`
 *               on the caller side — the helper does not chain `.range`
 *               itself so the builder type stays opaque (Deno/Vite split).
 * @param pageSize  Defaults to {@link POSTGREST_DEFAULT_PAGE_SIZE}. Override
 *                  only in tests.
 */
export async function fetchAllRows<T>(
  build: (from: number, to: number) => PostgrestPageBuilder<T>,
  pageSize: number = POSTGREST_DEFAULT_PAGE_SIZE,
): Promise<T[]> {
  if (pageSize <= 0) {
    throw new Error(`fetchAllRows: pageSize must be > 0 (got ${pageSize})`);
  }
  const accumulated: T[] = [];
  let from = 0;
  // Hard ceiling to prevent runaway loops on a buggy builder that never
 // shrinks. 10M rows is well past any realistic combiner workload.
  const MAX_PAGES = 10_000;
  for (let page = 0; page < MAX_PAGES; page++) {
    const to = from + pageSize - 1;
    const { data, error } = await build(from, to);
    if (error) {
      throw new Error(`fetchAllRows: page [${from},${to}] failed: ${error.message}`);
    }
    const rows = data ?? [];
    accumulated.push(...rows);
    if (rows.length < pageSize) return accumulated;
    from += pageSize;
  }
  throw new Error(
    `fetchAllRows: exceeded MAX_PAGES=${MAX_PAGES} at pageSize=${pageSize} — builder never returned a short page`,
  );
}