/**
 * Active-Catalyst-Flag (Signal #9, §4.4.9) shared types — Phase 1 commit 1a.
 *
 * Authority: DEC-057 (ratified 2026-06-12) §(g) IN-set governs the
 * `CatalystEventType` union. New types require a DEC-057 amendment or
 * a future-FP rider.
 *
 * Owner: longshort (FP-049 Phase 1 — Signal #9)
 * Classification: shared types — Phase-1 fetcher + Phase-1b classifier
 * contracts. NO wall-clock; NO sentinel numerics; typed-absence only.
 */

export const ACTIVE_CATALYST_SIGNAL_ID = 'active_catalyst_flag';

/**
 * The DEC-057 §(g) v1 IN-set (10 types). The OUT-set (FDA approval/rejection
 * outcome, buyback announcement, conference, non-material product launch,
 * investor day) is documented as deferred-work — adding any of them to this
 * union requires DEC-057 amendment.
 */
export type CatalystEventType =
  | 'earnings'
  | 'ma'
  | 'splits'
  | 'dividend_change'
  | 'analyst_rating'
  | 'fda_advisory'
  | 'executive_change'
  | 'guidance'
  | 'regulatory_action'
  | 'partnership';

/** §4.4.9 spec-stated tiers: 3.0 / 1.5 / 0.5 weights. */
export type CatalystTier = 1 | 2 | 3;

/** DEC-057 §(b) — structured-endpoint vs keyword-derived provenance. */
export type CatalystSource = 'structured' | 'keyword';

/** DEC-057 §(b) — which vendor produced the row (for §(h) dedup precedence). */
export type CatalystVendor = 'fmp' | 'polygon' | 'finnhub' | 'tradier';

/**
 * Per-row normalized event. Phase-1b `classify-catalyst-event.ts` consumes
 * the union of all fetcher outputs and emits this shape. Phase-1 fetchers
 * emit `RawCatalystEventInput` (see below) — same shape minus the
 * Phase-1b-assigned `tier` + `half_life_hours` + `dedup_key`.
 *
 * `event_at` is ISO-8601 UTC to-the-minute. For date-only vendor rows
 * (FMP earnings-calendar) the time component is set by the fetcher per
 * DEC-057 §(d) — Finnhub `hour` enrichment when available; otherwise the
 * documented per-vendor session-anchor default.
 */
export interface RawCatalystEventInput {
  ticker: string;
  event_type: CatalystEventType;
  /** ISO-8601 UTC; satisfies `event_at <= as_of` per §(d) look-ahead gate. */
  event_at: string;
  source: CatalystSource;
  vendor: CatalystVendor;
  /** Optional per-row diagnostic (e.g. `{hour: 'bmo'}` or `{action: 'upgrade'}`). */
  meta?: Readonly<Record<string, string | number | boolean>>;
}

/**
 * Typed unavailability reasons surfaced by Phase-1 fetchers. Mirrors the
 * Signal #8 polygon-news-feed-fetcher taxonomy verbatim plus one
 * §(e)-specific addition for the declaration-date-missing path on
 * dividends (NEVER ex-date substitution per DEC-057 §(e)).
 */
export type CatalystFetchUnavailableReason =
  | 'subscription_gated'
  | 'rate_limited'
  | 'data_unavailable'
  | 'declaration_date_unavailable';

/**
 * Per-fetcher result envelope. Carries the rows plus the §(d) skip
 * counter (`future_event_excluded`) so the Phase-1b classifier + Phase-3
 * orchestrator can record vendor-side look-ahead-gate enforcement without
 * losing the count.
 *
 * `unavailable` is end-of-line for that fetcher — callers MUST NOT
 * substitute a different vendor's rows in its place (DEC-057 §(i)
 * Tradier-backup invocation logic lives at Phase 3, not here).
 */
export type CatalystFetchResult =
  | {
      kind: 'events';
      rows: RawCatalystEventInput[];
      /** Vendor rows dropped by the §(d) look-ahead gate (event_at > as_of). */
      future_event_excluded: number;
      /** §(e)-only counter for the dividends fetcher; 0 elsewhere. */
      declaration_date_unavailable?: number;
    }
  | {
      kind: 'unavailable';
      reason: CatalystFetchUnavailableReason;
    };

/**
 * Apply the §(d) look-ahead gate to a sorted-or-unsorted candidate list.
 * Returns the surviving rows + the count of rows dropped for being
 * future-dated relative to `as_of`. Single source-of-truth for the gate so
 * every fetcher applies it identically.
 */
export function applyLookAheadGate(
  candidates: ReadonlyArray<RawCatalystEventInput>,
  as_of: Date,
): { rows: RawCatalystEventInput[]; future_event_excluded: number } {
  const asOfMs = as_of.getTime();
  if (!Number.isFinite(asOfMs)) {
    throw new Error('applyLookAheadGate: as_of is not a finite Date');
  }
  const rows: RawCatalystEventInput[] = [];
  let excluded = 0;
  for (const r of candidates) {
    const t = Date.parse(r.event_at);
    if (!Number.isFinite(t)) {
      // Invalid event_at is a fetcher-side normalization bug — skip and
      // count as future-excluded so it surfaces in telemetry rather than
      // silently slipping through. Phase-1b classifier never sees it.
      excluded += 1;
      continue;
    }
    if (t > asOfMs) {
      excluded += 1;
      continue;
    }
    rows.push(r);
  }
  return { rows, future_event_excluded: excluded };
}

/**
 * Apply a trailing-window lower bound — drop rows older than `windowStart`.
 * Used by every fetcher after `applyLookAheadGate` so the surviving rows
 * are exactly the §4.4.9 "trailing 5 trading days" set (the trading-day
 * arithmetic itself lives at Phase 3 per DEC-057 §(f); fetchers receive
 * the pre-computed `window_start_at`).
 */
export function applyWindowLowerBound(
  candidates: ReadonlyArray<RawCatalystEventInput>,
  window_start_at: Date,
): RawCatalystEventInput[] {
  const startMs = window_start_at.getTime();
  if (!Number.isFinite(startMs)) {
    throw new Error('applyWindowLowerBound: window_start_at is not a finite Date');
  }
  const rows: RawCatalystEventInput[] = [];
  for (const r of candidates) {
    const t = Date.parse(r.event_at);
    if (!Number.isFinite(t)) continue;
    if (t >= startMs) rows.push(r);
  }
  return rows;
}

/**
 * Common per-vendor window specifier passed to every Phase-1 fetcher.
 * `as_of` is the upper bound (look-ahead gate); `window_start_at` is the
 * lower bound (§4.4.9 trailing-5-trading-day floor pre-computed by the
 * orchestrator). Both are Date objects in UTC.
 */
export interface CatalystFetchWindow {
  as_of: Date;
  window_start_at: Date;
}

/**
 * Tradier-backup contract (DEC-057 §(i)): typed-fallback only. Phase 1
 * lands the fetcher; the Phase-3 orchestrator decides when to invoke it
 * (only on Polygon `unavailable`). Re-exported here so consumers don't
 * have to import an extra symbol just to discriminate.
 */
export type CatalystTradierFallbackReason = Extract<
  CatalystFetchUnavailableReason,
  'subscription_gated' | 'rate_limited' | 'data_unavailable'
>;