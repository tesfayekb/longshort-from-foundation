/**
 * Static, type-checked registry of queue-worker consumer configurations
 * (FP-045 / DEC-047 / Phase 2 addendum §1).
 *
 * Config-as-code, NOT a DB table:
 *   - These are ENGINE tuning parameters (slice size, vendor-rate share,
 *     calls-per-name, per-ticker compute adapter), not cadence — cadence
 *     remains in `job_registry` per DEC-048.
 *   - Type-checked: a new rate-capped signal is one registry entry; no
 *     schema migration, no runtime config drift between environments.
 *   - Reviewable: changes appear in code review diffs alongside the
 *     compute-arm + adapter that consume them.
 *
 * Phase 2 ships the engine + the registry TYPE + an EMPTY production
 * registry. Phase 3 registers PEAD; Phase 4 registers options-flow.
 * Tests build their own synthetic registries via `createTestRegistry()`
 * — never mutate the production singleton.
 *
 * Adapter contract (§2 of the addendum): compute code stays untouched.
 * Adapters wrap the existing per-ticker compute arm — `computePead`
 * dual-fetch for PEAD; `runOptionsFlowChunk` per-ticker for options.
 * The engine NEVER interprets signal semantics: `zero_dispersion`, the
 * PEAD N≥2 floor, options-flow MIN_QUALIFYING_PRINTS — all stay inside
 * the compute fns (Phase 2 addendum §7).
 *
 * Owner: longshort (FP-045 — Phase 2)
 */

import type { SignalSkipReason } from '../signal-types.ts';

/**
 * Per-ticker compute adapter — returns a value-or-typed-skip. The engine
 * persists what it's told; it never fabricates a fallback. Throwing from
 * this function is treated as `fetch_error` by the slice-worker so a
 * vendor blip never silently drops a ticker.
 *
 * `asOf` is the run's wall-clock-derived `as_of`. Adapters MUST NOT call
 * `Date.now()` / `productionClock` directly — derive timestamps from
 * `asOf` (DEC-034 clause 4).
 */
export type TickerComputeFn = (args: {
  ticker: string;
  gicsSector: string | null;
  asOf: Date;
}) => Promise<TickerComputeResult>;

export type TickerComputeResult =
  | { kind: 'value'; raw: number }
  | { kind: 'skip'; reason: SignalSkipReason; detail: string };

/**
 * Sequential-feed mode (FP-048 Phase 3a) — for signals whose work unit is
 * a vendor-paginated global feed (opaque `next_url` token), NOT a
 * pre-seedable per-ticker enumeration. The engine drains the feed across
 * many slice ticks (one cursor row per run holds the current token; the
 * existing claim/release/CAS primitives are reused unmodified) and the
 * finalizer aggregates the durable `signal_queue_feed_items` rows by
 * universe ticker via `computeFromItems`.
 *
 * Architecture decision: DEC-056 cap-provenance addendum (operator
 * dashboard reads "unlimited" → self-imposed 10 rps engineering cap;
 * latency-bound 35-70 pages × 6.3s sequential = 220-441s breaches the
 * 120s/150s walls → single-invocation disqualified, queue-engine
 * sequential-feed variant ratified by operator 2026-06-11).
 */
export interface FeedItemRecord {
  /** Vendor-stable article identifier; PK component for retry idempotency. */
  articleId: string;
  /** Ticker the (article, ticker) entry attributes to; PK component. */
  ticker: string;
  /** Per-(article,ticker) sentiment numeric — frozen by Phase-1 classify. */
  sentimentNum: number;
  /** Publisher tier weight — frozen by Phase-1 classify. */
  tierWeight: number;
  /** ISO-8601 publish timestamp (vendor-canonical). */
  publishedUtc: string;
}

export interface FeedPageResult {
  /** Per-(article,ticker) item rows for this page (post-classify, post-exclusion). */
  items: FeedItemRecord[];
  /**
   * Opaque vendor pagination token for the NEXT page, or null when the
   * feed is exhausted. The engine persists this verbatim into
   * `signal_queue_runs.feed_cursor`.
   */
  nextToken: string | null;
}

/**
 * Vendor-fetch + classify for one page. The engine pumps this exactly
 * `pagesPerSlice` times per slice tick (or until `nextToken === null`),
 * acquiring ONE bucket token per call (calls-per-page = 1; the global
 * feed makes one HTTP call per page regardless of universe size).
 *
 * `cursorToken === null` on the FIRST call of a run (signals "fetch the
 * first page"). On every subsequent call the engine passes the
 * `nextToken` returned by the prior call.
 */
export type FeedFetchPageFn = (args: {
  cursorToken: string | null;
  asOf: Date;
}) => Promise<FeedPageResult>;

/**
 * Per-universe-ticker compute adapter for feed mode — invoked once per
 * universe name at finalize-time with that ticker's slice of the durable
 * `signal_queue_feed_items` rows. Pure (no I/O, no clock — `asOf` is
 * injected; matches the `TickerComputeFn` discipline).
 *
 * A universe name with ZERO feed items still gets called (with an empty
 * `items` array) so the consumer can emit a typed skip
 * (`no_articles_in_window`) — the mass-balance ruling 839 (every
 * universe ticker accounted for: value OR typed skip) lives in the
 * consumer, not the engine.
 */
export type FeedComputeFromItemsFn = (args: {
  ticker: string;
  gicsSector: string | null;
  items: ReadonlyArray<Omit<FeedItemRecord, 'ticker'>>;
  asOf: Date;
}) => TickerComputeResult;

/**
 * The reserved synthetic ticker used as the single cursor row in
 * sequential-feed mode. Underscore-prefixed and lowercase so it can
 * never collide with a real exchange-listed ticker (which are uppercase
 * A-Z, optionally with `.` or `-` punctuation). The claim RPC's
 * `ORDER BY ticker` still works on the singleton trivially.
 */
export const FEED_SYNTHETIC_TICKER = '__feed__';

export interface QueueSignalConfig {
  /** Stable signal id — matches `signal_observations.signal_id` etc. */
  signalId: string;
  /** `job_registry.id` for the init cron (truth-in-telemetry per DEC-048). */
  jobId: string;
  /** Vendor cap × 0.85 safety. PEAD: 4.25 (300/min Finnhub). Options: 1.7 (120/min Tradier). */
  ratePerSec: number;
  /** Heartbeat staleness threshold for the orphan-sweeper, in seconds. */
  heartbeatTimeoutSec: number;
  /** Staging TTL for completed runs — sweeper deletes staging older than this. */
  stagingTtlSec: number;
  /**
   * Engine mode — `'per-ticker'` (default, BACKWARD-COMPATIBLE: existing
   * PEAD/options registrations omit this field and keep their semantics
   * unchanged) or `'sequential-feed'` (FP-048 Phase 3a — news).
   *
   * The validator enforces that ONLY the per-mode fields are present
   * (or omitted only when defaulted) and surfaces a clear error on
   * cross-mode contamination.
   */
  mode?: 'per-ticker' | 'sequential-feed' | 'work-list';
  // ─── per-ticker mode fields (required when mode is per-ticker / unset) ───
  /** Drives the pre-flight arithmetic row. PEAD: 2. Options: 1. */
  callsPerName?: number;
  /**
   * Slice size — tickers claimed per slice-worker invocation. Chosen so
   * `(sliceSize × callsPerName) / ratePerSec` fits well under the 150s
   * HTTP wall (Phase 2 addendum §6 — engine module doc captures the
   * arithmetic table).
   */
  sliceSize?: number;
  /** Per-ticker compute adapter — wraps the existing compute arm. */
  fetchAndCompute?: TickerComputeFn;
  // ─── sequential-feed mode fields (required when mode='sequential-feed') ───
  /**
   * Pages fetched per slice tick. News: 15 (≈94.5s at 6.3s/page observed
   * Phase-0 latency — matches options-flow's 94.1s slice shape, safely
   * under the 120s STOP gate and 150s HTTP wall).
   */
  pagesPerSlice?: number;
  /**
   * Runaway guard — if a run reaches this many pages without exhausting,
   * the slice-worker transitions it to `failed` with reason
   * `max_pages_exceeded` rather than spinning forever.
   */
  maxPages?: number;
  /** Vendor-fetch + classify for one page (see {@link FeedFetchPageFn}). */
  fetchPage?: FeedFetchPageFn;
  /** Per-universe-ticker aggregation (see {@link FeedComputeFromItemsFn}). */
  computeFromItems?: FeedComputeFromItemsFn;
  // ─── work-list mode fields (required when mode='work-list') ────────────
  /**
   * Items claimed per slice-worker invocation (work-list analogue of
   * `sliceSize` / `pagesPerSlice`). Chosen so
   * `(itemsPerSlice × callsPerItem) / ratePerSec` fits well under the
   * 150s HTTP wall. Insider: 50 × 2 / 5 = 20s paced + parse.
   */
  itemsPerSlice?: number;
  /**
   * Vendor calls per processed item — drives the pre-flight arithmetic
   * row (work-list analogue of `callsPerName`). Insider: 2 (accession
   * index.json + primary XML).
   */
  callsPerItem?: number;
  /** Seeds the run's work list (see {@link WorkListSeedFn}). */
  seedWorkItems?: WorkListSeedFn;
  /** Per-item processor (see {@link WorkListProcessItemFn}). */
  processItem?: WorkListProcessItemFn;
  /** Finalize-time aggregator (see {@link WorkListLoadAndComputeFn}). */
  loadAndCompute?: WorkListLoadAndComputeFn;
}

/** Discriminator helper — single point of truth for runtime branching. */
export function isFeedMode(cfg: QueueSignalConfig): boolean {
  return cfg.mode === 'sequential-feed';
}

/** Discriminator helper — work-list mode (FP-050 Phase 3.6a). */
export function isWorkListMode(cfg: QueueSignalConfig): boolean {
  return cfg.mode === 'work-list';
}

/** A pre-enumerated, opaque-to-engine work item (FP-050 Phase 3.6a). */
export interface WorkListItem {
  /**
   * Stable item identifier — used as the synthetic-ticker cursor key.
   * MUST be unique within the run, deterministic across re-seeds, and
   * ORDER-COMPATIBLE with lexicographic ticker sort (drains in lex order
   * — Q2: replay-safe is the property that matters). For insider: the
   * EDGAR accession_number (already lex-sortable).
   */
  id: string;
  /**
   * Opaque consumer payload threaded through `processItem` unchanged.
   * Engine MUST NOT introspect this — semantics live in the consumer.
   */
  payload: Readonly<Record<string, unknown>>;
}

export type WorkListItemResult =
  | { kind: 'processed' }
  | { kind: 'permanent_skip'; reason: SignalSkipReason; detail: string };

/**
 * Seeds the run's work list. THROW = fail-loud init failure
 * (`failure_reason='seed_failed: <masked verbatim>'`, never half-seeded
 * — Q5). A successfully-computed empty array is a VALID run that
 * proceeds directly to finalize (Q5 distinction: empty seed ≠ no-op —
 * for insider an empty filing day still reads the 90-day window).
 */
export type WorkListSeedFn = (args: {
  asOf: Date;
}) => Promise<ReadonlyArray<WorkListItem>>;

/**
 * Process one work item. Return-vs-throw discipline encodes Q3:
 *   • `{kind:'processed'}`      → success; engine deletes cursor row.
 *   • `{kind:'permanent_skip'}` → typed-permanent (zero-or-many-primary,
 *     malformed XML, 404 — honestly dead, retry pointless); engine
 *     deletes cursor row AND writes a `signal_queue_skips` row with
 *     item-scope marker (Q4).
 *   • THROW                     → transient (network, 5xx, 429); engine
 *     leaves the cursor row for natural retry, counts `item_retries`.
 *
 * Consumers MUST persist successful work into their own private table
 * BEFORE returning `{kind:'processed'}` so the CAS barrier (Q1) holds:
 * process → upsert → engine-delete cursor row.
 */
export type WorkListProcessItemFn = (args: {
  item: WorkListItem;
  asOf: Date;
}) => Promise<WorkListItemResult>;

/**
 * Finalize-time aggregator. Reads from the consumer-private persistence
 * table over its window and returns one result per universe ticker. The
 * engine persists these to `signal_queue_staging` exactly as in
 * per-ticker mode — mass balance (839 = values + typed skips) is the
 * CONSUMER's responsibility (Q4: two ledgers, two scopes). Pure: no I/O
 * timestamps, no clock — `asOf` is injected.
 */
export type WorkListLoadAndComputeFn = (args: {
  asOf: Date;
}) => Promise<ReadonlyArray<{
  ticker: string;
  gicsSector: string | null;
  result: TickerComputeResult;
}>>;

/**
 * Heartbeat granularity for work-list mode (Q2 ruling): emit at slice
 * entry AND every N processed items. 25 ≈ 10s of paced work at 2 calls
 * per item (5 rps) — frequent enough that no sweeper threshold can
 * starve mid-slice, sparse enough not to spam. Exported so slice-worker
 * tests can assert against the named constant.
 */
export const WORK_LIST_HEARTBEAT_ITEM_INTERVAL = 25;

export class QueueConfigRegistry {
  private readonly map = new Map<string, QueueSignalConfig>();

  register(cfg: QueueSignalConfig): void {
    validateConfig(cfg);
    if (this.map.has(cfg.signalId)) {
      throw new Error(
        `QueueConfigRegistry: signal_id '${cfg.signalId}' already registered`,
      );
    }
    this.map.set(cfg.signalId, cfg);
  }

  /** Throws if signalId is not registered — fail-loud (no silent fallback). */
  get(signalId: string): QueueSignalConfig {
    const cfg = this.map.get(signalId);
    if (!cfg) {
      throw new Error(
        `QueueConfigRegistry: no config registered for signal_id '${signalId}'`,
      );
    }
    return cfg;
  }

  has(signalId: string): boolean {
    return this.map.has(signalId);
  }

  listSignalIds(): string[] {
    return Array.from(this.map.keys()).sort();
  }
}

function validateConfig(cfg: QueueSignalConfig): void {
  if (!cfg.signalId || typeof cfg.signalId !== 'string') {
    throw new Error('QueueSignalConfig: signalId must be a non-empty string');
  }
  if (!cfg.jobId || typeof cfg.jobId !== 'string') {
    throw new Error(`QueueSignalConfig[${cfg.signalId}]: jobId must be a non-empty string`);
  }
  if (!Number.isFinite(cfg.ratePerSec) || cfg.ratePerSec <= 0) {
    throw new Error(`QueueSignalConfig[${cfg.signalId}]: ratePerSec must be > 0`);
  }
  if (!Number.isInteger(cfg.heartbeatTimeoutSec) || cfg.heartbeatTimeoutSec <= 0) {
    throw new Error(`QueueSignalConfig[${cfg.signalId}]: heartbeatTimeoutSec must be > 0`);
  }
  if (!Number.isInteger(cfg.stagingTtlSec) || cfg.stagingTtlSec <= 0) {
    throw new Error(`QueueSignalConfig[${cfg.signalId}]: stagingTtlSec must be > 0`);
  }
  if (cfg.mode !== undefined && cfg.mode !== 'per-ticker' && cfg.mode !== 'sequential-feed') {
    throw new Error(
      `QueueSignalConfig[${cfg.signalId}]: mode must be 'per-ticker' or 'sequential-feed' (got ${String(cfg.mode)})`,
    );
  }
  if (isFeedMode(cfg)) {
    // Feed mode requires its own fields and FORBIDS the per-ticker ones —
    // cross-mode contamination is a config-time bug.
    if (cfg.fetchAndCompute !== undefined) {
      throw new Error(
        `QueueSignalConfig[${cfg.signalId}]: feed mode must not set fetchAndCompute`,
      );
    }
    if (cfg.callsPerName !== undefined) {
      throw new Error(
        `QueueSignalConfig[${cfg.signalId}]: feed mode must not set callsPerName (one call per page)`,
      );
    }
    if (cfg.sliceSize !== undefined) {
      throw new Error(
        `QueueSignalConfig[${cfg.signalId}]: feed mode must not set sliceSize (pagesPerSlice is the per-slice bound)`,
      );
    }
    if (!Number.isInteger(cfg.pagesPerSlice) || (cfg.pagesPerSlice as number) <= 0) {
      throw new Error(`QueueSignalConfig[${cfg.signalId}]: pagesPerSlice must be a positive integer`);
    }
    if (!Number.isInteger(cfg.maxPages) || (cfg.maxPages as number) <= 0) {
      throw new Error(`QueueSignalConfig[${cfg.signalId}]: maxPages must be a positive integer`);
    }
    if (typeof cfg.fetchPage !== 'function') {
      throw new Error(`QueueSignalConfig[${cfg.signalId}]: fetchPage must be a function`);
    }
    if (typeof cfg.computeFromItems !== 'function') {
      throw new Error(`QueueSignalConfig[${cfg.signalId}]: computeFromItems must be a function`);
    }
  } else {
    // per-ticker mode (default) — original Phase-2 contract.
    if (!Number.isInteger(cfg.callsPerName) || (cfg.callsPerName as number) <= 0) {
      throw new Error(`QueueSignalConfig[${cfg.signalId}]: callsPerName must be a positive integer`);
    }
    if (!Number.isInteger(cfg.sliceSize) || (cfg.sliceSize as number) <= 0) {
      throw new Error(`QueueSignalConfig[${cfg.signalId}]: sliceSize must be a positive integer`);
    }
    if (typeof cfg.fetchAndCompute !== 'function') {
      throw new Error(`QueueSignalConfig[${cfg.signalId}]: fetchAndCompute must be a function`);
    }
    if (cfg.pagesPerSlice !== undefined || cfg.maxPages !== undefined
        || cfg.fetchPage !== undefined || cfg.computeFromItems !== undefined) {
      throw new Error(
        `QueueSignalConfig[${cfg.signalId}]: per-ticker mode must not set feed-mode fields`,
      );
    }
  }
}

/**
 * The production singleton — intentionally EMPTY in Phase 2. Phase 3
 * registers PEAD; Phase 4 registers options-flow. Consumer registration
 * lives in the consumer's own module so deletion of a signal removes its
 * registration alongside its code (T6 per-strategy removability).
 */
export const productionQueueRegistry = new QueueConfigRegistry();

/** Build an isolated registry for tests; never share state with production. */
export function createTestRegistry(): QueueConfigRegistry {
  return new QueueConfigRegistry();
}