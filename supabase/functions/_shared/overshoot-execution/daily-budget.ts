/**
 * daily-budget — ACT-501 (Tier-A entry-engine change). Single-homed
 * OVERSHOOT_DAILY_ENTRY_BUDGET constant + pure per-slot admission gate.
 *
 * PROVENANCE (ACT-500 Part 1 DEC, operator-ratified 2026-07-10):
 *   K-grid Option-A simulation over the 5-yr overshoot study corpus
 *   (839 tickers, ~483K events, H=10 bar-derived + H=20 stored). K=5/day
 *   is the adopted DAILY ENTRY BUDGET: peak realized P&L across
 *   {3,4,5,unlimited}, ~2.4x uplift vs unlimited at current sizing,
 *   20% cap-frozen-day rate acceptable inside INC-96 aggregate cap.
 *   K=4 sits within model noise of K=5 (~95% of P&L, zero frozen days);
 *   W5 4-week LIVE TRIPWIRE is chartered — realized per-lot economics
 *   after 4 weeks of budgeted live fills may drop K to 4 on evidence.
 *   Rank-order admission, fixed budget, NO carryover.
 *
 * SHAPE:
 *   - PURE: no I/O, no clock, no globals. Handler injects budget +
 *     `admittedThisRun` (count of slots that have passed both the
 *     allocation-cap gate and every prior refusal).
 *   - Positioned in the entry-run evaluation order AFTER
 *     `allocation_cap_reached` — a name refused by the cap does NOT
 *     consume budget. Identity:
 *       targets_loaded = orders_submitted
 *                      + position_already_open + regime + refbar
 *                      + i5 + sizing
 *                      + allocation_cap_reached
 *                      + daily_budget_reached
 *                      + buying_power + shortability + entry_price
 *                      + submit_failed + fill_unfilled_no_lots
 *   - RANK-PRESERVING: iteration order unchanged. Because the entry
 *     handler iterates in detector rank-order (LONG then SHORT,
 *     `rank_score DESC`), the top-K eligible names claim the budget
 *     first and the tail truncates cleanly with `daily_budget_reached`.
 */

export const OVERSHOOT_DAILY_ENTRY_BUDGET = 5 as const;

// ── DEC-084 — SHORT-SIDE DAILY PACING ──────────────────────────────────────
// PROVENANCE (operator ruling 2026-07-24): the short arm has ZERO ratified
// live-fill history and only theoretical W5 study exposure. Global daily
// budget K=5 (ACT-501) admits any mix of longs and shorts; the short book
// cap is 4 (OVERSHOOT_CAPACITY_SHORT). Ladder arithmetic mirroring the long
// design: 1 short admit/day × ~5-session SHORT hold ≈ rolling 4-5 concurrent
// short lots → the ladder converges onto the 4-cap in steady state, giving
// an enter-1/exit-1 rhythm that mirrors the long side (which enters ~5/day
// against a 36-cap and settles into enter-5/exit-5 rhythm at maturity).
//
// EXPANSION PATH (documented for auditors, verbatim per operator):
//   "budget raises only by operator DEC gated on live short-sleeve
//    evidence (W5.e verdict); roadmap: toward long-side parity
//    (cap 36-class) as evidence accrues."
//
// CONFIG-NOT-CONSTANT: the live value is read from
// `system_config.overshoot_short_daily_budget`. This constant is the
// DEFAULT (seeded at DEC-084 promotion) and the fallback when the config
// row is absent.
export const OVERSHOOT_SHORT_DAILY_BUDGET_DEFAULT = 1 as const;

// Per-side sibling of evaluateDailyBudget. Distinct refusal literal so
// FIX-8 completion-pass classifier + audit indexes can slice
// short-budget refusals apart from global-budget refusals. Grep-anchored
// emit-site: `overshoot.entry.short_daily_budget_reached` in
// `overshoot-entry-run/index.ts`. Terminal-for-the-day (added to
// OVERSHOOT_COMPLETION_TERMINAL_ACTIONS — pass-2 must not re-admit
// beyond the per-side budget any more than pass-2 re-admits beyond K).
export interface ShortDailyBudgetInputs {
  budget: number;
  admittedShortsThisRun: number;
}
export type ShortDailyBudgetResult =
  | { ok: true; budget: number; admitted_this_run: number; remaining: number }
  | { ok: false; refusal: 'short_daily_budget_reached'; reason: string; budget: number; admitted_this_run: number };

export function evaluateShortDailyBudget(input: ShortDailyBudgetInputs): ShortDailyBudgetResult {
  const { budget, admittedShortsThisRun } = input;
  if (typeof budget !== 'number' || !Number.isFinite(budget) || budget < 0 || !Number.isInteger(budget)) {
    return {
      ok: false,
      refusal: 'short_daily_budget_reached',
      reason: `short-daily-budget input budget=${budget} not a finite non-negative integer`,
      budget: 0,
      admitted_this_run: admittedShortsThisRun,
    };
  }
  if (typeof admittedShortsThisRun !== 'number' || !Number.isFinite(admittedShortsThisRun) || admittedShortsThisRun < 0 || !Number.isInteger(admittedShortsThisRun)) {
    return {
      ok: false,
      refusal: 'short_daily_budget_reached',
      reason: `short-daily-budget input admittedShortsThisRun=${admittedShortsThisRun} not a finite non-negative integer`,
      budget,
      admitted_this_run: 0,
    };
  }
  if (admittedShortsThisRun >= budget) {
    return {
      ok: false,
      refusal: 'short_daily_budget_reached',
      reason: `short daily entry budget consumed: admitted_shorts=${admittedShortsThisRun} short_budget=${budget} (DEC-084)`,
      budget,
      admitted_this_run: admittedShortsThisRun,
    };
  }
  return {
    ok: true,
    budget,
    admitted_this_run: admittedShortsThisRun,
    remaining: budget - admittedShortsThisRun,
  };
}

// FIX-8 completion-pass symmetry: K_remaining_short mirrors
// computeRemainingBudget. Handler passes ledger truth priorAdmittedShorts
// (COUNT(*) FROM overshoot_lots WHERE entry_ts::date = sessionDate
//   AND side = 'short').
export function computeRemainingShortBudget(input: { budget: number; priorAdmittedShorts: number }): number {
  const { budget, priorAdmittedShorts } = input;
  if (!Number.isFinite(budget) || !Number.isInteger(budget) || budget < 0) {
    throw new Error(`computeRemainingShortBudget: budget=${budget} not a finite non-negative integer`);
  }
  if (!Number.isFinite(priorAdmittedShorts) || !Number.isInteger(priorAdmittedShorts) || priorAdmittedShorts < 0) {
    throw new Error(`computeRemainingShortBudget: priorAdmittedShorts=${priorAdmittedShorts} not a finite non-negative integer`);
  }
  return Math.max(0, budget - priorAdmittedShorts);
}

// ── FIX-8 (DEC-083 §c) — completion-pass budget helper ────────────────────
// PURE: no I/O, no clock. Handler passes ledger truth priorAdmittedCount
// (COUNT(*) FROM overshoot_lots WHERE entry_ts::date = sessionDate).
// K_remaining = max(0, K − priorAdmittedCount). Substituted into
// evaluateDailyBudget's budget input for pass-2. Cash sufficiency stays
// with the existing sizing/BP path (DEC-083 §c).
export interface RemainingBudgetInputs {
  budget: number;
  priorAdmittedCount: number;
}
export function computeRemainingBudget(input: RemainingBudgetInputs): number {
  const { budget, priorAdmittedCount } = input;
  if (!Number.isFinite(budget) || !Number.isInteger(budget) || budget < 0) {
    throw new Error(`computeRemainingBudget: budget=${budget} not a finite non-negative integer`);
  }
  if (!Number.isFinite(priorAdmittedCount) || !Number.isInteger(priorAdmittedCount) || priorAdmittedCount < 0) {
    throw new Error(`computeRemainingBudget: priorAdmittedCount=${priorAdmittedCount} not a finite non-negative integer`);
  }
  return Math.max(0, budget - priorAdmittedCount);
}

export interface DailyBudgetInputs {
  budget: number;
  admittedThisRun: number;
}

export type DailyBudgetResult =
  | {
      ok: true;
      budget: number;
      admitted_this_run: number;
      remaining: number;
    }
  | {
      ok: false;
      refusal: 'daily_budget_reached';
      reason: string;
      budget: number;
      admitted_this_run: number;
    };

/**
 * Evaluate the daily entry budget for a single candidate slot. PURE.
 *
 * Invariant: `admittedThisRun >= budget` ⇒ refuse. A name refused by
 * this gate MUST NOT increment `admittedThisRun`; the handler bumps the
 * counter only after a slot has passed this gate.
 */
export function evaluateDailyBudget(input: DailyBudgetInputs): DailyBudgetResult {
  const { budget, admittedThisRun } = input;
  if (typeof budget !== 'number' || !Number.isFinite(budget) || budget < 0 || !Number.isInteger(budget)) {
    return {
      ok: false,
      refusal: 'daily_budget_reached',
      reason: `daily-budget input budget=${budget} not a finite non-negative integer`,
      budget: 0,
      admitted_this_run: admittedThisRun,
    };
  }
  if (typeof admittedThisRun !== 'number' || !Number.isFinite(admittedThisRun) || admittedThisRun < 0 || !Number.isInteger(admittedThisRun)) {
    return {
      ok: false,
      refusal: 'daily_budget_reached',
      reason: `daily-budget input admittedThisRun=${admittedThisRun} not a finite non-negative integer`,
      budget,
      admitted_this_run: 0,
    };
  }
  if (admittedThisRun >= budget) {
    return {
      ok: false,
      refusal: 'daily_budget_reached',
      reason: `daily entry budget consumed: admitted=${admittedThisRun} budget=${budget} (ACT-501, ACT-500 Part 1 DEC K=5)`,
      budget,
      admitted_this_run: admittedThisRun,
    };
  }
  return {
    ok: true,
    budget,
    admitted_this_run: admittedThisRun,
    remaining: budget - admittedThisRun,
  };
}