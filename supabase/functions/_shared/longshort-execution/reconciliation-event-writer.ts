/**
 * reconciliation-event-writer — ACT-326 (REVISION-FIX for the four-violation
 * `reconciliation_events` writer defect surfaced at corr `bb3810bf`).
 *
 * THE ONE PLACE the placement-path + orchestrator emit sites talk to
 * `public.reconciliation_events`. Centralizes:
 *
 *   1. kernel-tier → reconciliation_tier ENUM mapping (DEC-068 addendum,
 *      clause (o), 2026-06-25 — tier1→medium, tier2→strong, tier3→strong_plus;
 *      'weak' INTENTIONALLY UNMAPPED on the placement path).
 *   2. the decomposed insert shape per MIG-043 (expected_value /
 *      observed_value / divergence / tolerance — NO `payload` column),
 *      with back-compat for legacy `EmittedExecutionEvent.payload`
 *      callers that haven't been decomposed yet (orchestrator emits).
 *   3. the two NOT-NULL fields the prior writers were missing:
 *      `engine_version` (sourced from `ENGINE_VERSION` like the canonical
 *      `writeEventRow`) + `fetcher_source` (caller-injected; live placement
 *      passes `'live'`).
 *   4. operator_id (caller-injected; defaults to the canonical operator
 *      uuid when omitted).
 *
 * THE FOUR VIOLATIONS this writer prevents (the recurrence guard the
 * payload-column throw would have caught):
 *
 *   (a) `payload` column — DOES NOT EXIST in MIG-043; the prior writers
 *       inserted into it and the insert errored with the schema-cache
 *       message that surfaced at corr `bb3810bf`. The fix decomposes
 *       into `expected_value` / `observed_value` / `divergence`.
 *   (b) `tier='tier1'|'tier2'|'tier3'` — kernel vocabulary, NOT a valid
 *       `reconciliation_tier` enum value (strong_plus / strong / medium /
 *       weak). The fix maps via `mapKernelTierToReconciliationTier`.
 *   (c) `engine_version` is NOT NULL and was missing — the fix mirrors
 *       the canonical `writeEventRow` and sources from `ENGINE_VERSION`.
 *   (d) `fetcher_source` is NOT NULL and was missing — the fix takes it
 *       from the caller (live placement = `'live'`).
 */

import { supabaseAdmin } from '../supabase-admin.ts';
import { ENGINE_VERSION } from '../longshort-reconciliation-types.ts';
import type {
  FetcherSource,
  ReconciliationTier,
  ReconciliationOutcome,
} from '../longshort-reconciliation-types.ts';
import type {
  EmittedExecutionEvent,
  ReconciliationEventWriter,
} from './lifecycle-orchestrator.ts';

/**
 * kernel-tier → reconciliation_tier ENUM mapping (DEC-068 addendum clause (o)).
 *
 *   'tier1' → 'medium'      (false-positive / handled / informational)
 *   'tier2' → 'strong'      (handled-failure; auto-skip terminal)
 *   'tier3' → 'strong_plus' (paging escalation; PAUSE-class)
 *
 * 'weak' is INTENTIONALLY UNMAPPED on the placement path — every
 * placement-path reconciliation event touches money and is at least
 * medium-consequential. A future caller reaching for 'weak' as a
 * placement default is a signal the call does not belong on the
 * placement path (see clause (o) for the binding prohibition).
 */
export function mapKernelTierToReconciliationTier(
  t: 'tier1' | 'tier2' | 'tier3',
): ReconciliationTier {
  switch (t) {
    case 'tier1':
      return 'medium';
    case 'tier2':
      return 'strong';
    case 'tier3':
      return 'strong_plus';
  }
}

export interface SupabaseReconciliationEventWriterOptions {
  /** Defaults to the canonical operator uuid (matches MIG-043 column default). */
  operator_id?: string;
  /** Live placement passes `'live'`. Test seams pass `'mock'`. */
  fetcher_source: FetcherSource;
}

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

/** Extract a string `symbol` from a free-form payload, if present. */
function symbolFromPayload(p: Record<string, unknown> | undefined): string | null {
  if (!p) return null;
  const s = p['symbol'];
  return typeof s === 'string' && s.length > 0 ? s : null;
}

/** Outcomes that represent a divergence/failure (per MIG-043 enum). */
const DIVERGENT_OUTCOMES: ReadonlySet<ReconciliationOutcome> = new Set([
  'failure_handled',
  'failure_escalated',
  'system_bug',
]);

/**
 * The ONE production writer. Both `longshort-rebalance-submit` and
 * `longshort-execute` (and the orchestrator transitively) consume this
 * factory — the mapping + decomposition is single-sourced.
 */
export function createSupabaseReconciliationEventWriter(
  opts: SupabaseReconciliationEventWriterOptions,
): ReconciliationEventWriter {
  const operator_id = opts.operator_id ?? DEFAULT_OPERATOR_ID;
  const fetcher_source = opts.fetcher_source;
  return {
    async emit(event: EmittedExecutionEvent, ts: Date): Promise<void> {
      // Decomposed-first; payload-fallback for back-compat with orchestrator
      // emit sites that haven't been migrated to the decomposed shape.
      const observed_value =
        event.observed_value !== undefined
          ? event.observed_value
          : (event.payload ?? null);
      const expected_value =
        event.expected_value !== undefined ? event.expected_value : null;
      // For legacy payload-only failure events, surface the payload as the
      // divergence record too — the divergence detector reads from this
      // field; a null-divergence row on a failure outcome would understate
      // the firing. Producers that explicitly set divergence (including
      // explicit `null` for non-divergent kinds) override this default.
      const divergence =
        event.divergence !== undefined
          ? event.divergence
          : DIVERGENT_OUTCOMES.has(event.outcome)
            ? (event.payload ?? null)
            : null;
      const tolerance =
        event.tolerance !== undefined ? event.tolerance : null;
      const symbol =
        event.symbol !== undefined
          ? event.symbol
          : symbolFromPayload(event.payload);
      const tier = mapKernelTierToReconciliationTier(event.tier);

      const { error } = await supabaseAdmin
        .from('reconciliation_events')
        .insert({
          operator_id,
          ts: ts.toISOString(),
          engine_version: ENGINE_VERSION,
          call_name: event.call_name,
          tier,
          symbol,
          expected_value,
          observed_value,
          divergence,
          tolerance,
          outcome: event.outcome,
          fetcher_source,
        });
      if (error) {
        // DEC-034 clause (3): propagate; no swallow + phantom-success.
        throw new Error(`reconciliation_events_insert_failed: ${error.message}`);
      }
    },
  };
}