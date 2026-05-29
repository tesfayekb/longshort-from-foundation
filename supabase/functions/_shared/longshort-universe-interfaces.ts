/**
 * longshort-universe-interfaces — Constituent-source contracts for FP-008 Phase 1
 * universe construction.
 *
 * Owner: longshort (FP-008 sub-step 8.1)
 * Classification: financial-critical (universe ingestion is upstream of every
 * strategy decision; per DEC-038 clauses (1)+(2) the source-of-truth contract +
 * ingestion-time cross-check live here).
 *
 * Design discipline (CROSSWIND §11.9 + DEC-034 clauses (2)+(3) + DEC-038):
 *   - No silent sentinels in money paths. Missing data is encoded as
 *     `Promise<T | null>` with the contract spelled out in JSDoc; `null` is the
 *     repo-native typed-absence idiom per §2 axiom 3. A `null` return means the
 *     source EXPLICITLY reports no data (e.g. empty constituent list), NOT a
 *     network / auth / parse failure — those throw.
 *   - No wall-clock leakage. Every fetcher accepts `as_of: Date` as a parameter
 *     and stamps it on returned rows. The injected `Clock` from
 *     `_shared/longshort-clock.ts` is read ONLY at the top-of-call-chain entry
 *     point (the quarterly-refresh job invocation in sub-step 8.4 / 8.5);
 *     downstream fetchers are pure with respect to time.
 *   - Interfaces only. Concrete implementations live under
 *     `src/features/longshort/services/universe/` per DEC-031 T1 folder layout.
 *
 * Per FP-008 sub-step 8.1 selection (Lovable Finding 3 / Option B): the
 * SECONDARY cross-check source is iShares ETF holdings (IVV for S&P 500, IJH
 * for S&P 400) per AC-05. PRIMARY source is Polygon reference data per AC-04.
 */

/** Index identifiers used by FP-008 Phase 1 per CROSSWIND §3.1. */
export type IndexId = 'sp500' | 'sp400';

/**
 * iShares ETF ticker mapping per Option B selection at sub-step 8.1.
 *   - IVV — iShares Core S&P 500 ETF (tracks S&P 500)
 *   - IJH — iShares Core S&P Mid-Cap ETF (tracks S&P 400)
 * Holdings are published daily as a CSV at:
 *   https://www.ishares.com/us/products/<product-id>/<slug>/1467271812596.ajax?fileType=csv&fileName=<ticker>_holdings&dataType=fund
 */
export const ISHARES_ETF_FOR_INDEX: Readonly<Record<IndexId, 'IVV' | 'IJH'>> = {
  sp500: 'IVV',
  sp400: 'IJH',
} as const;

/** Single constituent row as returned by any source. */
export interface UniverseConstituent {
  /** Index this constituent belongs to. */
  index: IndexId;
  /** Ticker symbol, upper-cased, no whitespace. */
  ticker: string;
  /** Company / security name as reported by the source (best-effort; may be empty for iShares). */
  name: string;
  /** Source identifier — `'polygon'` for primary, `'ishares'` for secondary cross-check,
   *  `'manual'` for operator-seeded universe rows (bootstrap / enrich-and-filter path). */
  source: 'polygon' | 'ishares' | 'manual';
  /** Caller-injected timestamp; stamped on every row from the same fetch invocation. */
  fetched_at: Date;
}

/**
 * Constituent fetcher contract.
 *
 * Implementations:
 *   - Throw on network / auth / parse failure (reconcile() lifecycle classifies as
 *     `system_bug` per DEC-034 clause (3); the ingestion-time cross-check at
 *     sub-step 8.5 surfaces the failure rather than masking it).
 *   - Return `null` ONLY when the source explicitly reports an empty constituent
 *     list for the requested index (vanishingly rare for S&P 500 / 400 in
 *     practice; encoded for completeness per the §2 axiom 3 typed-absence rule).
 *   - Return a non-empty `UniverseConstituent[]` on success. Order is NOT
 *     guaranteed; downstream code must sort if it cares.
 */
export interface ConstituentFetcher {
  /**
   * Fetch the current constituent list for one index.
   *
   * @param index    Which S&P index to fetch.
   * @param as_of    Caller-injected wall-clock timestamp; stamped on every row.
   *                 Per DEC-034 clause (4) + DEC-035 clause (2) + §11.9 the
   *                 fetcher MUST NOT read `Date.now()` / `new Date()` itself;
   *                 callers obtain `as_of` from the injected Clock at the
   *                 polling-loop / cron entry point.
   */
  fetchConstituents(index: IndexId, as_of: Date): Promise<UniverseConstituent[] | null>;
}

/** Minimal HTTP fetch function shape — injected for testability per FP-006 fetcher precedent. */
export type HttpFetch = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

/** Thrown by fetchers on network / auth / parse failure. */
export class ConstituentFetchError extends Error {
  constructor(
    public readonly source: 'polygon' | 'ishares',
    public readonly index: IndexId,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(`[${source}:${index}] ${message}`);
    this.name = 'ConstituentFetchError';
  }
}
