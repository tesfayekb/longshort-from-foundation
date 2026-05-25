/**
 * longshort-hard-exclusion-interfaces — Data-source contracts for FP-008
 * sub-step 8.3 §3.3 hard-exclusion infrastructure.
 *
 * Owner: longshort (FP-008 sub-step 8.3 / ACT-107)
 * Classification: financial-critical (§3.3 LOCKED rules bind tradability;
 * book-asymmetric exclusions live downstream of these fetcher contracts).
 *
 * Mirrors the ACT-104 `longshort-universe-interfaces.ts` pattern: shared
 * contracts live at the edge-function tier so they are consumable by both
 * the `src/` tree (universe-component code via cross-tree import) and the
 * `supabase/functions/` tree (future `verify_universe_membership` at 8.7,
 * cross-check at 8.8, refresh job at 8.4 / 8.5).
 *
 * Per ACT-107 §22.8.4 surface resolutions:
 *   - Surface 1 → Option A: Polygon earnings endpoint (reuses POLYGON_API_KEY)
 *   - Surface 2 → Option A: FINRA twice-monthly short-interest bulk CSV
 *     (public, no auth; float denominator via Polygon ticker-details
 *     `share_class_shares_outstanding`)
 *   - Surface 3 → Option β: §3.3c halts is deferred-placeholder per R4 +
 *     DW-058 B2 + DW-063 (this sub-step). The interface is reserved so the
 *     future real implementation slots in without changing the orchestrator.
 *
 * Design discipline:
 *   - No silent sentinels in money paths. Missing data is encoded as
 *     `T | null` or empty arrays with the contract spelled out in JSDoc.
 *   - No wall-clock leakage. Every fetcher accepts `as_of: Date`.
 *   - Interfaces only. Concrete implementations live under
 *     `src/features/longshort/services/universe/hard-exclusions/`.
 */

// ============================================================================
// Surface 1 — Earnings calendar (§3.3a)
// ============================================================================

/** Earnings session timing per §3.3 worked examples. */
export type EarningsTimeOfDay = 'BMO' | 'AMC' | 'intraday';

/** A scheduled earnings event for a single ticker. */
export interface ScheduledEarnings {
  readonly ticker: string;
  /** ISO date YYYY-MM-DD (Eastern-time session date the print is associated with). */
  readonly scheduled_date: string;
  /** Per §3.3a — BMO / AMC / intraday timing flag. */
  readonly time_of_day: EarningsTimeOfDay;
}

/** Snapshot of upcoming earnings events covering the §3.3a window. */
export interface EarningsCalendarSnapshot {
  readonly entries: ReadonlyArray<ScheduledEarnings>;
  readonly fetched_at: Date;
}

export interface EarningsCalendarFetcher {
  /**
   * Fetch upcoming earnings entries covering the §3.3a 2-trading-day window
   * around `as_of`. Implementations MAY return a wider window; the §3.3a rule
   * code is responsible for the trading-day window math.
   *
   * Throws on network / auth / parse failure (no silent fallback to empty).
   */
  fetchUpcomingEarnings(
    tickers: ReadonlyArray<string>,
    as_of: Date,
  ): Promise<EarningsCalendarSnapshot>;
}

// ============================================================================
// Surface 2 — Short-interest reporting (§3.3e)
// ============================================================================

/** A single short-interest record from the most-recent semi-monthly report. */
export interface ShortInterestRecord {
  readonly ticker: string;
  /** ISO date YYYY-MM-DD — the SEC/FINRA settlement-date the report covers. */
  readonly report_date: string;
  readonly short_interest_shares: number;
  readonly float_shares: number;
  /** Ratio in [0, 1]; §3.3e threshold = 0.25. */
  readonly short_interest_pct_float: number;
}

export interface ShortInterestFetcher {
  /**
   * Fetch the most-recent short-interest record per ticker. Tickers without
   * coverage in the latest report are omitted from the result (NOT included
   * with a zero value — §2 axiom 3 typed-absence).
   */
  fetchShortInterest(
    tickers: ReadonlyArray<string>,
    as_of: Date,
  ): Promise<ReadonlyArray<ShortInterestRecord>>;
}

// ============================================================================
// Surface 3 — Halt history (§3.3c) — DEFERRED PLACEHOLDER per R4 + DW-063
// ============================================================================

export interface HaltEvent {
  readonly ticker: string;
  /** ISO date YYYY-MM-DD of the halt session. */
  readonly halt_date: string;
  readonly halt_reason: string;
}

export interface HaltHistoryProvider {
  /**
   * Return halt events within the §3.3c lookback window (5 trading days at v1
   * spec).
   *
   * V1 IMPLEMENTATION per R4 + DW-058 B2 + DW-063: returns an empty array
   * (deferred-placeholder). Real-feed implementation lands when Phase 7
   * halt-feed work completes. FP-008 closure document at sub-step 8.13
   * attests this rule as deferred-placeholder.
   */
  fetchHaltsInLookback(
    tickers: ReadonlyArray<string>,
    lookback_trading_days: number,
    as_of: Date,
  ): Promise<ReadonlyArray<HaltEvent>>;
}

// ============================================================================
// §3.3b — M&A actions
// ============================================================================

export type MAStatus = 'announced' | 'closed' | 'broken';

export interface MAAction {
  readonly target_ticker: string;
  /** Null if acquirer is private / non-public. */
  readonly acquirer_ticker: string | null;
  readonly deal_size_usd: number | null;
  /** Acquirer market cap at announcement; used for §3.3b >25% asymmetric rule. */
  readonly acquirer_market_cap_usd_at_announcement: number | null;
  readonly announcement_date: string;
  readonly status: MAStatus;
}

export interface MAActionsFetcher {
  /** Returns active M&A actions touching any of `tickers` at `as_of`. */
  fetchActiveMAActions(
    tickers: ReadonlyArray<string>,
    as_of: Date,
  ): Promise<ReadonlyArray<MAAction>>;
}