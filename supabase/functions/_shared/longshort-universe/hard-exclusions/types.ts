/**
 * §3.3 hard-exclusion local types — discriminated union over rejection
 * reasons + per-rule input bundle + eligibility output type.
 *
 * Owner: longshort (FP-008 sub-step 8.3 / ACT-107)
 * Classification: financial-critical (§3.3 LOCKED rules bind tradability).
 *
 * Per v0.6.2 §22.3 (c) minimum-coupling discipline: this file is types-only.
 * No clock injection (`as_of` flows as parameter through the orchestrator);
 * no `reconcile()` coupling (cross-check at 8.8); no DB writes (persistence
 * at 8.6); no `logAuditEvent` import (DEC-033 v4.1).
 */
import type { EnrichedConstituent } from '../enrichment/types.ts';
import type {
  EarningsCalendarSnapshot,
  HaltEvent,
  MAAction,
  ShortInterestRecord,
} from '../../../../../../supabase/functions/_shared/longshort-hard-exclusion-interfaces.ts';

/** Which book(s) a firing applies to. §3.3d + §3.3e are short-book-only; others are both. */
export type BookSide = 'long' | 'short' | 'both';

/**
 * Discriminated rejection-reason union per §3.3 rule. v0.6.2 §22.3 (b)
 * idiom-grep precedent: see `longshort-broker-interfaces.ts` exclusion
 * code strings (`'in_ma'`, `'halted_5d_plus'`, `'earnings_window'`).
 */
export type HardExclusionReason =
  | 'earnings_window'           // §3.3a
  | 'ma_target'                 // §3.3b — target full exclusion
  | 'ma_large_acquirer'         // §3.3b — acquirer >25% market cap
  | 'halted_5d_lookback'        // §3.3c (v1 deferred-placeholder per DW-063)
  | 'htb_no_locate'             // §3.3d — no locate available
  | 'htb_borrow_rate_excessive' // §3.3d — borrow rate exceeds threshold
  | 'short_interest_excessive'; // §3.3e — >25% of float

/** A single hard-exclusion firing against a constituent. */
export interface HardExclusionFiring {
  readonly constituent: EnrichedConstituent;
  readonly reason: HardExclusionReason;
  readonly applies_to: BookSide;
  /** Human-readable evidence (e.g., "earnings scheduled 2026-04-29 AMC"). */
  readonly evidence: string;
}

/**
 * Eligible constituent post-hard-exclusion application; includes per-book
 * eligibility flags honoring §3.3 book-asymmetric rules.
 */
export interface EligibleConstituent extends EnrichedConstituent {
  readonly long_eligible: boolean;
  readonly short_eligible: boolean;
}

/** Result of applying all 8 hard-exclusion rules. */
export interface HardExclusionResult {
  readonly eligible: ReadonlyArray<EligibleConstituent>;
  readonly firings: ReadonlyArray<HardExclusionFiring>;
}

/**
 * §3.3d locate / borrow input. Pre-fetched per ticker at the orchestrator
 * entry point. Tickers without a record are treated as "no locate" — §3.3d
 * fires `htb_no_locate` (typed-absence per §2 axiom 3; NOT a silent assume-
 * locate-available).
 */
export interface LocateRecord {
  readonly ticker: string;
  readonly locate_available: boolean;
  /** Annualized borrow rate in basis points; null if locate unavailable. */
  readonly borrow_rate_bps: number | null;
}

/**
 * §3.3d borrow-rate threshold — annualized basis points above which a name
 * is excluded from the short book per §3.3 spec ("htb/borrow-rate
 * threshold"). LOCKED at 1000 bps (10%) for v1; revisions require CROSSWIND
 * spec amendment + DEC-038 amendment + AC-07 retest.
 */
export const HTB_BORROW_RATE_THRESHOLD_BPS = 1000;

/** §3.3e short-interest threshold — fraction of float. LOCKED at 0.25. */
export const SHORT_INTEREST_PCT_FLOAT_THRESHOLD = 0.25;

/** §3.3b acquirer-asymmetric threshold — deal size / acquirer market cap. LOCKED at 0.25. */
export const MA_LARGE_ACQUIRER_RATIO_THRESHOLD = 0.25;

/** §3.3a earnings window — trading days before scheduled print. LOCKED at 2. */
export const EARNINGS_WINDOW_TRADING_DAYS = 2;

/** §3.3c halt-history lookback — trading days. LOCKED at 5 per spec. */
export const HALT_LOOKBACK_TRADING_DAYS = 5;

/**
 * Per-rule input bundle passed to the orchestrator. Each field is fetched at
 * the quarterly / continuous refresh job entry point (sub-step 8.4 / 8.5)
 * and threaded into `applyHardExclusions()` as a pure parameter.
 */
export interface ExclusionInputData {
  readonly earnings_calendar: EarningsCalendarSnapshot;
  readonly ma_actions: ReadonlyArray<MAAction>;
  /** Halt history events in the §3.3c lookback. V1 may be empty per DW-063. */
  readonly halt_history: ReadonlyArray<HaltEvent>;
  /** Locate / borrow-rate records (short-book context). */
  readonly locate_data: ReadonlyArray<LocateRecord>;
  /** Latest semi-monthly short-interest report records. */
  readonly short_interest: ReadonlyArray<ShortInterestRecord>;
}