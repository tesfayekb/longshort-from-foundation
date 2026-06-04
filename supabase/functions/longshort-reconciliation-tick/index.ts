/**
 * longshort-reconciliation-tick — Periodic-sweep edge function for reconciliation engine.
 *
 * NOT FOR LIVE INVOCATION until Phase 2 cron-activation work item lands WITH this
 * fix (FP-008.4 Commit 7). The handler uses mock BP/position fetchers; the live
 * universe fetcher is wired but the broker fetchers are placeholders pending sub-step
 * 6.7 Alpaca integration. The Commit 7 disposition-routing fix (this file) MUST be
 * shipped before any cron schedule activates this function — otherwise infrastructure
 * failures and escalated outcomes would phantom-succeed to HTTP 200 (the #9 vector).
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
 * Permission: longshort.view (per system-state observability discipline; longshort.execute
 * is Phase 5+ territory).
 *
 * Method: POST (correlation_id propagation via canonical handler).
 */

import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { createUniverseMembershipFetcher } from '../_shared/longshort-universe/verify-membership/universe-membership-fetcher.ts';
import {
  verifyPosition,
  verifyUniverseMembership,
  verifyBuyingPower,
} from '../_shared/longshort-verifiers/index.ts';
import type {
  BrokerPositionFetcher,
  BrokerBuyingPowerFetcher,
} from '../_shared/longshort-broker-interfaces.ts';
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

// MOCK FETCHERS for 6.3d. Real broker integration lands at sub-step 6.7. These mocks
// satisfy the BrokerXxxFetcher contracts with deterministic canned responses so the
// dispatch path can be exercised end-to-end without real broker access.
//
// IMPORTANT: this file is the SOLE place where mock fetchers live in production edge
// function code. Sub-step 6.7 replaces these with real-broker-backed implementations
// from a new `_shared/longshort-broker-alpaca.ts` module.

const MOCK_POSITION_FETCHER: BrokerPositionFetcher = {
  // deno-lint-ignore require-await
  async fetchPosition(_symbol: string, _ts: Date) {
    // 6.3d mock: return null (no position) for deterministic dispatch validation
    return null;
  },
};

const MOCK_BP_FETCHER: BrokerBuyingPowerFetcher = {
  // deno-lint-ignore require-await
  async fetchBuyingPower(ts: Date) {
    return {
      available_bp: 100000,
      account_equity: 100000,
      fetched_at: ts,
    };
  },
};

// Operator UUID per DEC-031 F-2 standalone-operator-id default
const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

// FP-008 sub-step 8.7 / ACT-113 — LIVE universe-membership fetcher backed by
// supabaseAdmin reads of `universe_membership` + `hard_exclusions` (MIG-050 +
// MIG-051). Replaces former MOCK_UNIVERSE_FETCHER per Surface 1 Option A
// (verifier signature unchanged; transition lands at fetcher layer).
const LIVE_UNIVERSE_FETCHER = createUniverseMembershipFetcher({
  supabaseAdmin,
  operator_id: DEFAULT_OPERATOR_ID,
});

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'POST') {
    return apiError(405, 'Method not allowed', { correlationId: crypto.randomUUID() });
  }

  const ctx = await authenticateRequest(req);
  await checkPermissionOrThrow(ctx.user.id, 'longshort.view');

  // Top-of-call-chain wall-clock read per DEC-034 clause (4) injected-clock discipline.
  const ts = productionClock.getWallClockTs();

  const results: TickResult[] = [];

  // verify_buying_power — once per tick (system-level)
  try {
    const bpResult = await verifyBuyingPower(
      {
        operator_id: DEFAULT_OPERATOR_ID,
        expected_bp: 100000,
        requested_position_size: 0,
      },
      MOCK_BP_FETCHER,
      ts,
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
        symbol: 'AAPL',
        expected_qty: 0,
        expected_cost_basis: 0,
        operator_id: DEFAULT_OPERATOR_ID,
      },
      MOCK_POSITION_FETCHER,
      ts,
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
    correlation_id: ctx.correlationId,
  };
  if (halt) {
    const failing = results.filter((r) =>
      r.outcome === 'failure_escalated' ||
      r.outcome === 'system_bug' ||
      r.outcome === 'infrastructure_failure'
    );
    return apiError(status, 'reconciliation_tick_escalated', {
      code: 'RECONCILIATION_TICK_ESCALATED',
      correlationId: ctx.correlationId,
    });
    // NB: `body` + `failing` are intentionally not surfaced in the apiError body
    // (apiError is a fixed-shape envelope). The full per-call disposition is
    // already in reconciliation_events; clients/operators inspect that surface,
    // not the HTTP body. `failing` retained as a no-op local for diagnosability
    // when reading this file.
    // deno-lint-ignore no-unused-vars
    void failing;
  }
  return apiSuccess(body, status);
}));
