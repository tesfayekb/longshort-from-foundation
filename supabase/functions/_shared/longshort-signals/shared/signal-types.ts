/**
 * Phase 2.1 shared signal types.
 *
 * Locks the language-stack mapping for all 9 signal sub-phases per FP-009
 * survey (§1): Optional[Decimal] (spec) → `number | null` (TS); the `-999`
 * sentinel (§6.5.2) is the Phase 3 combiner's substitution at the
 * feature-vector layer only — signal-producing functions return
 * `number | null`. Precision rationale: ratio + z-score-with-±3-clipping
 * is ~10 orders of magnitude past IEEE-754 limits.
 *
 * Mirrors the discipline locked in `_shared/longshort-universe/enrichment/types.ts`:
 * `Decimal` is NOT used anywhere in this repo per v0.6.2 §22.3(b) idiom-grep.
 *
 * Distinction from typed-absence (parallels `enrichment/types.ts:25-28`):
 *   `null` = upstream source explicitly reports no data (insufficient
 *            history, ticker missing from data source, computation not
 *            applicable, e.g. within-sector z-score for a sector with one
 *            member).
 *   `SignalComputationError` thrown = network / auth / parse / unexpected
 *            failure during signal computation; does NOT degrade to `null`;
 *            orchestrator catches and records per-ticker as `fetch_error`
 *            (parallel to FP-008.4 #23 enrichment-skip pattern).
 *
 * Owner: longshort (FP-009 Bucket A Commit A1)
 * Classification: shared types — Phase 2 signal contracts.
 */

/**
 * Per-ticker per-signal observation written to `signal_observations`
 * (MIG slot pending Commit A3). The Phase 2 layer is signal-criticality-
 * agnostic; the critical-vs-non-critical branching lives in Phase 3's
 * combiner per FP-009 survey §5.
 */
export interface SignalRow {
  operator_id: string;
  signal_id: string;          // e.g., 'cross_sectional_momentum_12_1'
  ticker: string;
  as_of_date: string;         // 'YYYY-MM-DD' (ISO date; daily cadence — not full timestamp)
  value: number | null;       // null = typed-absence (insufficient history, singleton sector, etc.)
  is_present: boolean;        // true iff value !== null; redundant but explicit for combiner queries
  gics_sector: string | null; // captured at compute time for forensic stability
  computed_at: string;        // ISO timestamp
}

/**
 * Throw path for network / auth / parse / unexpected failures during signal
 * computation. Parallel to `ConstituentFetchError`. Orchestrator catches and
 * records as a `fetch_error` skip (parallel to FP-008.4 #23 pattern).
 */
export class SignalComputationError extends Error {
  constructor(
    public readonly signal_id: string,
    public readonly ticker: string,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(`[signal:${signal_id}] ${message} for ${ticker}`);
    this.name = 'SignalComputationError';
  }
}

/** Skip-attribution for orchestrator failure-bookkeeping (parallel to `EnrichmentSkip`). */
export type SignalSkipReason =
  | 'insufficient_history'   // < required-window bars; typed-absence
  | 'missing_sector'         // gics_sector null; within-sector z-score requires sector
  | 'fetch_error'            // network / auth / parse error caught from fetcher
  | 'singleton_sector'       // sector has only 1 member; std=0; z-score undefined
  | 'data_unavailable'       // source returned no data for ticker (e.g., short-interest
                             // endpoint returned 404 or an empty report set); non-critical
                             // signals degrade with is_present=0; ticker still ranked
  | 'subscription_gated'     // source returned 403 / not-entitled; the data product is
                             // not part of the current Polygon subscription tier. Same
                             // graceful-degradation semantics as data_unavailable; the
                             // distinction is observability only (operator-actionable:
                             // "upgrade tier" vs "wait for next report").
  | 'missing_shares_outstanding' // shares-outstanding side input (Polygon reference
                             // endpoint) returned null/zero/non-finite for this ticker.
                             // Surfaced specifically for the short-interest signal
                             // (FP-041 revision-fix) where si_pct_float is derived as
                             // short_interest / share_class_shares_outstanding — without
                             // a usable denominator we cannot compute the percentage.
                             // Typed-absence; ticker is still ranked by other signals.
  | 'no_qualifying_transactions' // Source returned data, but zero rows passed the
                             // signal-specific filter (e.g., Form 4 fetcher returned
                             // results, but no row was a record_type='transaction' with
                             // an included transaction_code after the 10b5-1 sale
                             // exclusion). FP-042 / Signal #4 (insider transactions):
                             // the EXPECTED case for most names — most stocks have no
                             // qualifying insider trades in any given 90-day window.
                             // Non-critical; ticker is still ranked by other signals.
  | 'no_qualifying_flow'     // FP-043 / Signal #3 (options flow imbalance) — chain
                             // snapshot returned contracts but ZERO survived the
                             // smart-money filter (≥100 contracts, 7+ DTE, OTM/ATM)
                             // AND-classifier (last at-or-thru bid/ask). Spec §4.4.7
                             // missing-data clause: "fewer than 5 qualifying smart-
                             // money prints" → returns None. EXPECTED for the long
                             // tail of low-options-activity names. Non-critical;
                             // ticker is still ranked by other signals (combiner
                             // imputes (-999, 0) in Phase 3).
  | 'no_recent_earnings'     // FP-044 / Signal #2 (PEAD §4.4.6) — ticker has NO
                             // reported earnings inside the trailing 60-trading-day
                             // staleness window (DEC-048 + §4.4.6 missing-data
                             // clause). Returned when (a) the Finnhub earnings feed
                             // yields no reported quarters at all (after dropping
                             // future / actual=null rows), or (b) the most-recent
                             // reported `period` is > 60 trading days behind `as_of`.
                             // EXPECTED for most names on most days — earnings are
                             // a quarterly event; only ~1/60 of trading days carry
                             // an in-window report per name. Non-critical; ticker
                             // is still ranked by other signals (combiner imputes
                             // (-999, 0) in Phase 3).
  | 'pead_panel_below_floor' // FP-044 / Signal #2 — the event-quarter analyst-
                             // estimate row has `numberAnalysts < 2`. Per DEC-052:
                             // a one-estimate panel has zero meaningful dispersion;
                             // fabricating a denominator to dodge the divide-by-zero
                             // would manufacture a phantom signal (the exact failure
                             // mode CROSSWIND §2 axiom 3 + DEC-034 sentinel-fallback
                             // discipline forbid). Non-critical; ticker is still
                             // ranked by other signals.
  | 'zero_dispersion';       // FP-044 / Signal #2 — the panel has N≥2 analysts but
                             // `epsHigh === epsLow` so the DEC-051 range-proxy
                             // `σ = (epsHigh − epsLow) / (2 × 1.349)` evaluates to
                             // exactly 0. Per DEC-051 + DEC-053: this is typed
                             // absence, NEVER a fabricated ε-fallback. A non-zero
                             // ε would produce a SUE of arbitrary magnitude
                             // determined entirely by the fabricated ε — a phantom
                             // signal. Non-critical; ticker still ranked by other
                             // signals.

export interface SignalSkip {
  ticker: string;
  reason: SignalSkipReason;
  detail?: string;           // optional diagnostic (e.g., "215 bars available, 252 required")
}