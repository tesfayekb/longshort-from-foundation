/**
 * longshort-reconciliation-tick — Periodic-sweep edge function for reconciliation engine.
 *
 * Handler readiness: BP + position fetchers are now REAL via
 * `createLiveBrokerInterfaces` (FP-062 sub-step 6I.2a-remaining / ACT-384 — DW-060
 * condition-1). The universe-membership fetcher remains the live supabaseAdmin-
 * backed reader. A verify_halt_status dispatch is INTENTIONALLY not added here —
 * it splits to post-6I.1b (the halt-probe defines symbol-set + cadence; designing
 * the dispatch against an un-run probe would be premature).
 *
 * Cron is STILL DISARMED at the registry level (MIG-058 unchanged). Re-enable
 * lands at 6I.3a (two-invocation liveness rule wiring) + 6I.3b (explicit
 * re-enable migration). The Commit 7 disposition router (this file) remains the
 * required pre-condition so infrastructure failures + escalated outcomes do not
 * phantom-succeed to HTTP 200 (the #9 vector).
 *
 * Registry-level disarm (FP-008.4 Commit 8 / MIG-058): this handler is disarmed at
 * the registry level — `job_registry.enabled = false` for
 * `longshort.reconciliation_periodic_sweep` per MIG-058. MIG-045's enablement
 * conflated registry-readiness (verifier set complete, dispatch function exists)
 * with handler-readiness (real broker fetchers, fail-loud disposition, liveness
 * detection). Re-enablement requires ALL THREE of: (1) real broker fetchers —
 * SATISFIED by ACT-384 via createLiveBrokerInterfaces (this file); (2) the
 * two-invocation liveness rule (FP-008.4 #11 second commit) — PENDING 6I.3a; (3)
 * an explicit re-enable migration citing MIG-058 and confirming (1)+(2) landed —
 * PENDING 6I.3b.
 *
 * Purpose: dispatches a subset of verify_*'s in batch per the scheduled job
 * `longshort.reconciliation_periodic_sweep` (activated at sub-step 6.3d via MIG-045).
 *
 * Sub-step 6.3d scope: PROVE THE DISPATCH PATH end-to-end. Mock fetchers are used here;
 * real broker integration lands at sub-step 6.7 (Alpaca paper). Sub-step 6.5 replay
 * framework consumes this same edge function with captured-day fixtures substituted for
 * mock fetchers.
 *
 * Per-tick verifier subset (rotates with strategy state in production):
 *   - verify_buying_power: invoked once per tick (system-level)
 *   - verify_universe_membership: invoked for current universe
 *   - verify_position: invoked for each open position
 *
 * Other verifiers (verify_short_availability / verify_borrow_*) dispatch from
 * order-execution code at Phase 5 (per-order-submit), not from periodic sweep.
 *
 * Permission: cron-only via verifyCronSecret (FP-062 sub-step 6I.3c-pre / ACT-389 —
 * system-level cron path; the CRON_SECRET IS the authorization, mirroring
 * longshort-universe-quarterly-refresh). No live UI caller exists; if one is added
 * later, extract a separate manual sibling per the split-handler precedent — do NOT
 * widen this handler's auth surface to dual-auth.
 *
 * Method: POST (correlation_id propagation via canonical handler).
 */

import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { createUniverseMembershipFetcher } from '../_shared/longshort-universe/verify-membership/universe-membership-fetcher.ts';
import {
  verifyPosition,
  verifyUniverseMembership,
  verifyBuyingPower,
} from '../_shared/longshort-verifiers/index.ts';
import { createLiveBrokerInterfaces } from '../_shared/longshort-execution/broker-bootstrap.ts';
import type { ReconciliationOutcome } from '../_shared/longshort-reconciliation-types.ts';

/**
 * Per-verifier tick result — outcome is either a ReconciliationOutcome
 * (verify completed and reconcile() classified it) or 'infrastructure_failure'
 * (the verify wrapper / reconcile() loadFn re-threw — FP-008.4 Commit 7 already
 * wrote a system_bug row to reconciliation_events before the re-throw).
 */
export type TickResultOutcome = ReconciliationOutcome | 'infrastructure_failure';

export interface TickResult {
  call: string;
  outcome: TickResultOutcome;
  symbol?: string;
  error?: string;
}

/**
 * #9 fail-loud disposition router (FP-008.4 Commit 7).
 *
 * Inputs: per-verifier outcomes from one tick.
 * Output: HTTP status the handler should return.
 *
 * Halt-and-surface (HTTP 500) if ANY result is:
 *   - 'failure_escalated' (verify completed; rolling-window/severity says halt)
 *   - 'system_bug'        (verify completed; non-recoverable engine/data invariant break)
 *   - 'infrastructure_failure' (verify could not run; source unavailable)
 *
 * HTTP 200 otherwise — every remaining outcome is either within tolerance,
 * an expected divergence, or a failure_handled case whose handling already
 * executed inside reconcile() and is recorded in reconciliation_events.
 *
 * No strategy_audit events are emitted — every outcome (including infra
 * failures, post-Commit 7) is in reconciliation_events via reconcile(). The
 * HTTP status IS the disposition signal; the audit record already exists
 * canonically. Emitting a parallel strategy-audit event here would hit the
 * audit-writer trap the lifecycle docstring explicitly bans.
 */
export function classifyTickDisposition(
  results: ReadonlyArray<Pick<TickResult, 'outcome'>>,
): { status: 200 | 500; halt: boolean } {
  const HALT_OUTCOMES: ReadonlySet<TickResultOutcome> = new Set([
    'failure_escalated',
    'system_bug',
    'infrastructure_failure',
  ]);
  const halt = results.some((r) => HALT_OUTCOMES.has(r.outcome));
  return { status: halt ? 500 : 200, halt };
}

// FP-062 sub-step 6I.2a-remaining / ACT-384 — BP + position fetchers are now LIVE
// via createLiveBrokerInterfaces (constructed inside the handler body below, NOT at
// module top-level, so module-load stays creds-free for CI). All three verify
// dispatches below tag fetcher_source='live' under the whole-handler-scoped
// liveness predicate: the tick is a live broker observation, and the live
// universe-membership fetcher shares the tick's provenance (call_name-scoped to
// broker calls — a tick exercising real BP + real position IS a live broker
// observation, and UMS inherits that tag because it dispatches on the same tick).
// This rationale stays load-bearing for 6I.3a's two-invocation liveness predicate.
// A verify_halt_status dispatch is NOT added here — it splits to post-6I.1b
// (probe defines symbol-set + cadence).

// Operator UUID per DEC-031 F-2 standalone-operator-id default
const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

// BOOTSTRAP PLACEHOLDERS for the internal-expected reconciliation side (DW-138 —
// FP-062 6I.3c / ACT-393). The verify_* reconcilers compare internal-belief vs
// broker-truth. Pre-first-trade, no internal equity-snapshot/lot state exists to
// seed these (`longshort_equity_snapshots` is write-only-after-rebalance), so
// these are honest placeholders that CORRECTLY escalate against a live
// never-traded paper account (the failure_escalated rows observed at 6I.3c
// closure are TRUE-positives — the truth being "internal expectation is a
// tracked DW-138 stub"). They resolve naturally when DW-138 wires the real
// internal equity/position source on the tick-handler expected-state seeding
// surface. Do NOT seed these from a broker snapshot — that would make
// expected==observed by construction (tautology) and defeat the drift detection
// the verifier exists for (§9 anti-phantom rule from the other side: a visible
// sentinel replaced by an invisible tautology).
const BOOTSTRAP_PLACEHOLDER_EXPECTED_BP_USD = 100_000;      // DW-138 — verify_buying_power expected side
const BOOTSTRAP_PLACEHOLDER_PROBE_SYMBOL = 'AAPL';          // DW-138 — verify_position probe symbol
const BOOTSTRAP_PLACEHOLDER_EXPECTED_QTY = 0;               // DW-138 — verify_position expected qty
const BOOTSTRAP_PLACEHOLDER_EXPECTED_COST_BASIS = 0;        // DW-138 — verify_position expected cost basis

// FP-008 sub-step 8.7 / ACT-113 — LIVE universe-membership fetcher backed by
// supabaseAdmin reads of `universe_membership` + `hard_exclusions` (MIG-050 +
// MIG-051). Replaces the prior mock-universe fetcher per Surface 1 Option A
// (verifier signature unchanged; transition lands at fetcher layer).
const LIVE_UNIVERSE_FETCHER = createUniverseMembershipFetcher({
  supabaseAdmin,
  operator_id: DEFAULT_OPERATOR_ID,
});

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'POST') {
    return apiError(405, 'Method not allowed', { correlationId: crypto.randomUUID() });
  }

  // FP-062 sub-step 6I.3c-pre / ACT-389 — cron-only auth (system-level cron path),
  // mirroring longshort-universe-quarterly-refresh. pg_cron's only credential is
  // CRON_SECRET via X-Cron-Secret; user-JWT auth would 401 the cron caller. No live
  // UI caller exists for this handler (grounding: every reconciliation-tick reference
  // in src/ + edge fns is doc/comment-only), so no manual sibling is needed.
  const correlationId = crypto.randomUUID();
  const cronAuthError = verifyCronSecret(req);
  if (cronAuthError) return cronAuthError;

  // Top-of-call-chain wall-clock read per DEC-034 clause (4) injected-clock discipline.
  const ts = productionClock.getWallClockTs();

  // Live broker interfaces — constructed lazily inside the handler body so module
  // load remains creds-free (unit tests exercise only the pure classifier).
  // The production factory always populates buyingPowerFetcher + positionFetcher
  // per broker-bootstrap; the `!` reflects a type carve-out for advance-path test
  // helpers, not runtime nullability.
  const broker = createLiveBrokerInterfaces();

  const results: TickResult[] = [];

  // verify_buying_power — once per tick (system-level)
  try {
    const bpResult = await verifyBuyingPower(
      {
        operator_id: DEFAULT_OPERATOR_ID,
        expected_bp: BOOTSTRAP_PLACEHOLDER_EXPECTED_BP_USD,
        requested_position_size: 0,
      },
      broker.buyingPowerFetcher!,
      ts,
      'live',
    );
    results.push({ call: 'verify_buying_power', outcome: bpResult.outcome });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    results.push({ call: 'verify_buying_power', outcome: 'infrastructure_failure', error: errMsg });
  }

  // verify_universe_membership — per-symbol, per-side. Sub-step 6.3d dispatch-
  // path validation: AAPL on both sides. FP-008.3 side-awareness contract:
  // this tick is a generic health probe with no position context driving a
  // specific side, so it MUST exercise both books explicitly. Position-
  // driven side selection lives at Phase 5+ order-entry sites where the
  // per-position `side` is known.
  for (const side of ['long', 'short'] as const) {
    try {
      const ums = await verifyUniverseMembership(
        {
          symbol: 'AAPL',
          side,
          operator_id: DEFAULT_OPERATOR_ID,
          internal_in_universe: true,
        },
        LIVE_UNIVERSE_FETCHER,
        ts,
        'live',
      );
      results.push({
        call: 'verify_universe_membership',
        outcome: ums.outcome,
        symbol: `AAPL:${side}`,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      results.push({
        call: 'verify_universe_membership',
        outcome: 'infrastructure_failure',
        error: errMsg,
        symbol: `AAPL:${side}`,
      });
    }
  }

  // verify_position — per-symbol
  try {
    const posResult = await verifyPosition(
      {
        symbol: BOOTSTRAP_PLACEHOLDER_PROBE_SYMBOL,
        expected_qty: BOOTSTRAP_PLACEHOLDER_EXPECTED_QTY,
        expected_cost_basis: BOOTSTRAP_PLACEHOLDER_EXPECTED_COST_BASIS,
        operator_id: DEFAULT_OPERATOR_ID,
      },
      broker.positionFetcher!,
      ts,
      'live',
    );
    results.push({ call: 'verify_position', outcome: posResult.outcome, symbol: 'AAPL' });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    results.push({ call: 'verify_position', outcome: 'infrastructure_failure', error: errMsg, symbol: 'AAPL' });
  }

  // #9 fail-loud disposition (FP-008.4 Commit 7). Escalated / system_bug /
  // infrastructure_failure → HTTP 500 so cron-level retry + alerting fires.
  // Every outcome is already in reconciliation_events via reconcile() (the
  // infrastructure_failure path was the audit hole closed in the same commit).
  const { status, halt } = classifyTickDisposition(results);
  const body = {
    tick_ts: ts.toISOString(),
    verifiers_dispatched: results.length,
    results,
    correlation_id: correlationId,
  };
  if (halt) {
    // Per-call disposition (escalated / system_bug / infrastructure_failure)
    // is already in reconciliation_events via reconcile() — operators inspect
    // that surface, not the HTTP body. apiError's fixed-shape envelope is the
    // disposition signal; cron-level retry + alerting fires on the 5xx.
    return apiError(status, 'reconciliation_tick_escalated', {
      code: 'RECONCILIATION_TICK_ESCALATED',
      correlationId,
    });
  }
  return apiSuccess(body, status);
}));
