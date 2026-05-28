/**
 * longshort-reconciliation-tick — Periodic-sweep edge function for reconciliation engine.
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

  const results: Array<{ call: string; outcome: string; symbol?: string; error?: string }> = [];

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

  // verify_universe_membership — per-symbol; for 6.3d dispatch-path validation, one symbol.
  try {
    const ums = await verifyUniverseMembership(
      {
        symbol: 'AAPL',
        operator_id: DEFAULT_OPERATOR_ID,
        internal_in_universe: true,
      },
      LIVE_UNIVERSE_FETCHER,
      ts,
    );
    results.push({ call: 'verify_universe_membership', outcome: ums.outcome, symbol: 'AAPL' });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    results.push({ call: 'verify_universe_membership', outcome: 'infrastructure_failure', error: errMsg, symbol: 'AAPL' });
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

  return apiSuccess({
    tick_ts: ts.toISOString(),
    verifiers_dispatched: results.length,
    results,
    correlation_id: ctx.correlationId,
  });
}));
