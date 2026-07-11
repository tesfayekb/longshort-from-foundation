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