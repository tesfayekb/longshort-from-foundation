/**
 * Per-rule continuous hard-exclusion refresh orchestrator —
 * FP-008 sub-step 8.5 / ACT-109.
 *
 * Per CROSSWIND §3.4 + DEC-038.1 clause (4) + AC-09. Stateless transformation
 * with caller-supplied universe (`tickers`). Per Surface 0 Option α at
 * ACT-109: at sub-step 8.5 the universe arrives via POST body; at sub-step
 * 8.7 the handler swaps the source to a `universe_membership` query without
 * changing this orchestrator's signature (minimum-coupling per v0.6.2 §22.3 (c)).
 *
 * Per-rule data fetchers (earnings calendar, corporate actions, halt feed,
 * FINRA short-interest) are NOT wired here — those land at subsequent
 * sub-steps. Until then, every rule returns `outcome='skipped'` with
 * `skipped_reason='awaiting_per_rule_fetcher_wiring'`. This matches the
 * sub-step-8.4 pattern where `exclusionInput` ships empty.
 *
 * No `logAuditEvent` import (DEC-033 v4.1 — audit emission lives in the edge
 * function handler chokepoint). No clock injection — `as_of` is parameter.
 *
 * Owner: longshort (FP-008 sub-step 8.5)
 * Classification: financial-critical (skeleton).
 */
import { isShortInterestTriggerDay } from '../shared/trading-days.ts';
import type {
  HardExclusionRefreshContext,
  HardExclusionRefreshInput,
  HardExclusionRefreshResult,
  HardExclusionRuleKey,
} from './types.ts';

export interface HardExclusionRefreshOrchestrator {
  run(input: HardExclusionRefreshInput): Promise<HardExclusionRefreshResult>;
}

export function createHardExclusionRefreshOrchestrator(
  ctx: HardExclusionRefreshContext,
): HardExclusionRefreshOrchestrator {
  return {
    async run(input: HardExclusionRefreshInput): Promise<HardExclusionRefreshResult> {
      const as_of = ctx.as_of.toISOString();

      // §3.3e cadence gate per Option 2α (handler-internal twice-monthly).
      // The dispatcher invokes the orchestrator on every daily cron tick;
      // on non-trigger days the orchestrator short-circuits to 'skipped'.
      if (input.rule === '3.3e' && !isShortInterestTriggerDay(ctx.as_of)) {
        return {
          rule: input.rule,
          as_of,
          outcome: 'skipped',
          tickers_considered: input.tickers.length,
          firings: [],
          skipped_reason: 'not_short_interest_trigger_day',
        };
      }

      // All four rules currently lack wired per-rule data fetchers at
      // sub-step 8.5. Per the deferred-work register and DEC-038.1 clause
      // (4) implementation order, the dispatcher infrastructure ships
      // first; fetcher wiring follows in subsequent sub-steps.
      //
      // FP-008 sub-step 8.7 / ACT-113 note: a `hardExclusionsPersister` slot
      // is now available on `HardExclusionRefreshContext` (Surface 4 Option b
      // — same contract shared with quarterly orchestrator). Per-rule
      // fetchers landing at subsequent sub-steps will populate `firings`
      // and invoke `ctx.hardExclusionsPersister.persist({...refresh_id:
      // null})` per MIG-051 continuous-refresh design (NULL refresh_id;
      // ON DELETE SET NULL preserves rows). At sub-step 8.5 + 8.7, firings
      // remains empty so the persister is not yet exercised here.
      return {
        rule: input.rule,
        as_of,
        outcome: 'skipped',
        tickers_considered: input.tickers.length,
        firings: [],
        skipped_reason: 'awaiting_per_rule_fetcher_wiring',
      };
    },
  };
}

/** Whether the dispatcher should accept this rule key. Single source of
 *  truth for handler-level rule-param validation. */
export function isHardExclusionRuleKey(s: string): s is HardExclusionRuleKey {
  return s === '3.3a' || s === '3.3b' || s === '3.3c' || s === '3.3e';
}