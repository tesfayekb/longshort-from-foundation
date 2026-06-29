/**
 * account-pause-escalator — FP-062 6I.6a / DW-151 §8.9.
 *
 * The PAUSE-class routing seam for broker rejections that demand an
 * account-wide trading pause. Sibling to cache-propagator-io: the
 * propagator owns NO-PAUSE-class cache writes; this module owns
 * PAUSE-class account-state writes. The two are deliberately
 * decoupled (mixing entangles htb-write-fail with pause-fail).
 *
 * SCOPE — pdt_block ONLY.
 *   - ssr_violation → DW-150 (per-symbol pause; out of scope).
 *   - persistent buying-power divergence → 6I.6b (rolling-window detection;
 *     out of scope).
 *
 * Split mirrors cache-propagator (pure) / cache-propagator-io (shell):
 *   - PURE classifier `classifyPdtPauseRouting` — given the kernel-tagged
 *     rejection tier + reason + order id, returns the pause spec
 *     (`reason`, `source_ref`) or null.
 *   - IO SHELL `createAccountPauseEscalator(deps)` — wraps the classifier
 *     around an injected `pauseFn` (the trading-pause.ts `pauseAccount`
 *     wrapper) + the shared `ReconciliationEventWriter`.
 *
 * The escalator is OPTIONAL-INJECTED on the lifecycle-orchestrator (mirrors
 * the `propagator?: RejectionPropagator` pattern). Callers that don't
 * inject it skip auto-pause; the kernel still tags the order
 * `terminal_tier3_pause` and the operator alert fires off the tier-3
 * reconciliation event (read path unchanged).
 */

import type {
  EmittedExecutionEvent,
  ReconciliationEventWriter,
} from './lifecycle-orchestrator.ts';
import type { RejectionTier } from './rejection-classifier.ts';

// ── PURE CLASSIFIER ─────────────────────────────────────────────────

/** PDT-token regex — mirrors the TIER3_TOKENS pdt entries in
 *  rejection-classifier.ts (`pdt_block`, `pattern_day_trader`,
 *  `pattern day`). Case-insensitive. */
const PDT_TOKEN_RE = /pdt|pattern[_ ]?day/i;

export interface PdtPauseSpec {
  reason: string;
  source_ref: string;
}

export interface ClassifyPdtPauseInput {
  rejection_tier: RejectionTier | null;
  rejection_reason: string | null;
  order_id: string;
}

/** Returns the pause spec iff the rejection is a tier-3 pdt_block. Anything
 *  else (tier-2, tier-3 non-pdt, null) → null. PURE — no I/O, no clock. */
export function classifyPdtPauseRouting(
  input: ClassifyPdtPauseInput,
): PdtPauseSpec | null {
  if (input.rejection_tier !== 'tier3_pause') return null;
  const reason = input.rejection_reason ?? '';
  if (!PDT_TOKEN_RE.test(reason)) return null;
  return {
    reason: 'pdt_block rejection from broker',
    source_ref: `pdt_block:order=${input.order_id}`,
  };
}

// ── IO SHELL ────────────────────────────────────────────────────────

/** Narrow callback over trading-pause.ts `pauseAccount` — the shell holds
 *  the supabase client capability; this module receives only the closed-
 *  over invoker. Mirrors how cache-propagator-io takes an HtbCacheWriter
 *  rather than a supabase client. */
export type PauseAccountFn = (input: {
  reason: string;
  source_ref: string;
}) => Promise<void>;

export interface EscalatePdtBlockArgs {
  order_id: string;
  client_order_id: string;
  symbol: string;
  rejection_reason: string | null;
  rejection_tier: RejectionTier | null;
  ts: Date;
}

export interface AccountPauseEscalator {
  escalatePdtBlock(args: EscalatePdtBlockArgs): Promise<void>;
}

export function createAccountPauseEscalator(deps: {
  pauseFn: PauseAccountFn;
  eventWriter: ReconciliationEventWriter;
}): AccountPauseEscalator {
  return {
    async escalatePdtBlock(args) {
      const spec = classifyPdtPauseRouting({
        rejection_tier: args.rejection_tier,
        rejection_reason: args.rejection_reason,
        order_id: args.order_id,
      });
      if (spec === null) return;

      try {
        await deps.pauseFn({ reason: spec.reason, source_ref: spec.source_ref });
      } catch (err) {
        const failEvent: EmittedExecutionEvent = {
          call_name: 'longshort.execution.account_pause_failed',
          tier: 'tier3',
          outcome: 'failure_escalated',
          payload: {
            symbol: args.symbol,
            order_id: args.order_id,
            client_order_id: args.client_order_id,
            rejection_reason: args.rejection_reason,
            pause_class: 'pdt_block',
            source_ref: spec.source_ref,
            error: err instanceof Error ? err.message : String(err),
          },
        };
        await deps.eventWriter.emit(failEvent, args.ts);
        return;
      }

      const okEvent: EmittedExecutionEvent = {
        call_name: 'longshort.execution.account_paused_pdt',
        tier: 'tier2',
        outcome: 'failure_handled',
        payload: {
          symbol: args.symbol,
          order_id: args.order_id,
          client_order_id: args.client_order_id,
          rejection_reason: args.rejection_reason,
          pause_class: 'pdt_block',
          source_ref: spec.source_ref,
        },
      };
      await deps.eventWriter.emit(okEvent, args.ts);
    },
  };
}