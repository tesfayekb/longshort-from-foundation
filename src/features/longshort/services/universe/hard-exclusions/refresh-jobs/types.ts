/**
 * Hard-exclusion refresh-job types — FP-008 sub-step 8.5 / ACT-109.
 *
 * Per v0.6.2 §22.3 (c) minimum-coupling: types-only module; no runtime
 * dependencies. Consumed by the per-rule hard-exclusion refresh orchestrator
 * and the `longshort-universe-hard-exclusion-refresh` one-dispatcher edge
 * function handler (Surface 1 Option (a) at ACT-109).
 *
 * Owner: longshort (FP-008 sub-step 8.5)
 * Classification: financial-critical (skeleton; per-rule fetchers wire in at
 *                 later sub-steps).
 */
import type { HardExclusionFiring } from '../types.ts';

/**
 * The four §3.3 rules that participate in continuous refresh per
 * DEC-038.1 clause (4). MIG-049 seeds one `job_registry` row per key.
 *
 * NOT in this set per §3.3 spec:
 *   3.3d HTB — pre-trade check at order-execution layer; not continuous refresh.
 *   3.3f / 3.3g / 3.3h — N/A v1.
 */
export type HardExclusionRuleKey = '3.3a' | '3.3b' | '3.3c' | '3.3e';

export const HARD_EXCLUSION_RULE_KEYS: ReadonlyArray<HardExclusionRuleKey> = [
  '3.3a',
  '3.3b',
  '3.3c',
  '3.3e',
];

/**
 * Per-rule outcome of one refresh invocation. `'completed'` indicates the
 * rule logic executed (firings array may be empty); `'skipped'` indicates
 * the rule was not exercised this invocation (e.g., cadence gate did not
 * fire, or universe-membership source not yet wired). `'failed'` reserved
 * for rule-fetcher error paths landing at later sub-steps.
 */
export type HardExclusionRefreshOutcome = 'completed' | 'skipped' | 'failed';

export interface HardExclusionRefreshResult {
  rule: HardExclusionRuleKey;
  as_of: string;
  outcome: HardExclusionRefreshOutcome;
  /** Number of tickers passed to the rule logic. Zero when input universe
   *  is absent (Surface 0 Option α stub-input path at sub-step 8.5). */
  tickers_considered: number;
  /** Firings produced by the rule. Empty until per-rule fetchers wire in. */
  firings: ReadonlyArray<HardExclusionFiring>;
  /** Populated when outcome !== 'completed'. Stable vocabulary:
   *  - 'awaiting_universe_membership_8_6' — body lacked `tickers`; universe
   *    source not yet plumbed.
   *  - 'awaiting_per_rule_fetcher_wiring' — per-rule data-source integration
   *    deferred to subsequent sub-steps.
   *  - 'not_short_interest_trigger_day' — §3.3e cadence gate did not fire
   *    (Option 2α handler-internal twice-monthly gating). */
  skipped_reason: string | null;
}

/**
 * Constructor-injected dependencies for the orchestrator. Per-rule fetchers
 * are NOT wired at sub-step 8.5; the context is intentionally narrow at this
 * sub-step and grows as later sub-steps stitch in `PolygonEarningsCalendarFetcher`
 * (3.3a), corporate-actions polling (3.3b), halt-feed (3.3c, gated by DW-058 B2),
 * and `FinraShortInterestFetcher` (3.3e).
 */
export interface HardExclusionRefreshContext {
  /** Caller-supplied trading-day clock. `as_of.toISOString()` is recorded
   *  in the result + audit metadata. */
  as_of: Date;
}

export interface HardExclusionRefreshInput {
  rule: HardExclusionRuleKey;
  /** Eligible universe sourced by the handler. At sub-step 8.5 this is the
   *  POST-body `tickers` array (Surface 0 Option α). At sub-step 8.7 the
   *  handler swaps the source to a `universe_membership` query without
   *  changing the orchestrator signature. */
  tickers: ReadonlyArray<string>;
}