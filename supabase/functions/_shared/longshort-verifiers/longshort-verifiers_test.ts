/**
 * longshort-verifiers_test — Deno unit tests for verify_* batch A (#1-#5).
 *
 * Tests exercise spec shape + compute_divergence + classify_outcome + failure_action
 * directly (pure-function paths). reconcile() lifecycle integration (which hits
 * supabaseAdmin) is covered at sub-step 6.3d Gate 6.3 closure with edge-function
 * end-to-end tests against an integration DB.
 *
 * AC coverage:
 *   AC-16 → verify_position (Zero-tolerance / strong_plus)
 *   AC-17 → verify_quote (Noise-tolerant / medium + 100bps magnitude)
 *   AC-18 → verify_quote_freshness (Noise-tolerant / medium)
 *   AC-19 → verify_short_availability (Low-tolerance / strong)
 *   AC-20 → verify_ssr_status (Low-tolerance / strong / tri-state per DEC-035 clause (4))
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

import {
  buildVerifyPositionSpec,
  buildVerifyQuoteSpec,
  buildVerifyQuoteFreshnessSpec,
  buildVerifyShortAvailabilitySpec,
  buildVerifySSRStatusSpec,
  buildVerifyHaltStatusSpec,
  buildVerifyBorrowRateSpec,
  buildVerifyBorrowPersistenceSpec,
  buildVerifyBuyingPowerSpec,
  buildVerifyUniverseMembershipSpec,
  buildVerifyCorporateActionCleanSpec,
  buildVerifySettlementStatusSpec,
  buildVerifyOrderAcceptanceSpec,
  buildVerifyRealizedPnLSpec,
  buildVerifyLotRecordSpec,
  buildVerifyWashSaleRecordSpec,
  buildVerifyRebalanceAggregateSpec,
  IMPLEMENTED_VERIFIERS,
  isVerifierImplemented,
} from './index.ts';

const OP = '00000000-0000-0000-0000-000000000001';

// ─── AC-16: verify_position ────────────────────────────────────────

Deno.test('AC-16: verify_position spec shape — strong_plus + zero_tolerance', () => {
  const spec = buildVerifyPositionSpec({ symbol: 'AAPL', operator_id: OP });
  assertEquals(spec.call_name, 'verify_position');
  assertEquals(spec.tier, 'strong_plus');
  assertEquals(spec.tolerance_class, 'zero_tolerance');
  assertEquals((spec.tolerance as { qty_tolerance: number }).qty_tolerance, 0);
  assertEquals(
    (spec.tolerance as { cost_basis_cents_per_share: number }).cost_basis_cents_per_share,
    1,
  );
});

Deno.test('AC-16: verify_position — qty_diff !== 0 → failure_escalated', () => {
  const spec = buildVerifyPositionSpec({ symbol: 'AAPL', operator_id: OP });
  const div = spec.compute_divergence(
    { qty: 100, cost_basis: 15000 },
    { symbol: 'AAPL', qty: 101, avg_entry_price: 150, fetched_at: new Date(0) },
  );
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_escalated');
});

Deno.test('AC-16: verify_position — cost_basis diff > 1¢ per share → failure_escalated', () => {
  const spec = buildVerifyPositionSpec({ symbol: 'AAPL', operator_id: OP });
  // expected per-share = 150.00; observed avg_entry = 150.05 → 5¢ diff > 1¢ tolerance
  const div = spec.compute_divergence(
    { qty: 100, cost_basis: 15000 },
    { symbol: 'AAPL', qty: 100, avg_entry_price: 150.05, fetched_at: new Date(0) },
  );
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_escalated');
});

Deno.test('AC-16: verify_position — within tolerance → false_positive_within_tolerance', () => {
  const spec = buildVerifyPositionSpec({ symbol: 'AAPL', operator_id: OP });
  // expected per-share = 150.00; observed = 150.005 → 0.5¢ diff < 1¢ tolerance
  const div = spec.compute_divergence(
    { qty: 100, cost_basis: 15000 },
    { symbol: 'AAPL', qty: 100, avg_entry_price: 150.005, fetched_at: new Date(0) },
  );
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'false_positive_within_tolerance');
});

Deno.test('AC-16: verify_position — observed=null (broker reports no position) → failure_escalated', () => {
  const spec = buildVerifyPositionSpec({ symbol: 'AAPL', operator_id: OP });
  const div = spec.compute_divergence({ qty: 100, cost_basis: 15000 }, null);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_escalated');
});

Deno.test('AC-16: verify_position — failure_action emits symbol_halt_alert_emitted', async () => {
  const spec = buildVerifyPositionSpec({ symbol: 'AAPL', operator_id: OP });
  const result = await spec.failure_action({
    ts: new Date(0),
    outcome: 'failure_escalated',
    divergence: { observed_present: true, qty_diff: 1, cost_basis_per_share_diff_cents: 0 },
    expected: { qty: 100, cost_basis: 15000 },
    observed: { symbol: 'AAPL', qty: 101, avg_entry_price: 150, fetched_at: new Date(0) },
  });
  assertEquals(result.action_taken, 'symbol_halt_alert_emitted');
});

// ─── AC-17: verify_quote ───────────────────────────────────────────

function makeQuote(bid: number, ask: number, src: string) {
  return {
    symbol: 'AAPL',
    bid,
    ask,
    last: (bid + ask) / 2,
    ts: new Date(0),
    source: src,
  };
}

Deno.test('AC-17: verify_quote spec — medium + noise_tolerant', () => {
  const spec = buildVerifyQuoteSpec({ symbol: 'AAPL', operator_id: OP });
  assertEquals(spec.call_name, 'verify_quote');
  assertEquals(spec.tier, 'medium');
  assertEquals(spec.tolerance_class, 'noise_tolerant');
  assertEquals(
    (spec.tolerance as { magnitude_escalation_bps: number }).magnitude_escalation_bps,
    100,
  );
});

Deno.test('AC-17: verify_quote — max_pairwise_bps >= 100 → failure_escalated (magnitude rule)', () => {
  const spec = buildVerifyQuoteSpec({ symbol: 'AAPL', operator_id: OP });
  // signal mid=100.00; broker mid=102.00 → ~198 bps → exceeds 100bps
  const triplet = {
    signal: makeQuote(99.99, 100.01, 'polygon'),
    recon: makeQuote(99.99, 100.01, 'tradier'),
    broker: makeQuote(101.99, 102.01, 'alpaca'),
  };
  const div = spec.compute_divergence(triplet, triplet);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_escalated');
});

Deno.test('AC-17: verify_quote — 5bps + 1¢ both exceeded → failure_handled', () => {
  const spec = buildVerifyQuoteSpec({ symbol: 'AAPL', operator_id: OP });
  // signal mid=100.00; recon mid=100.10 → 10 bps, 10¢ — both exceed 5bps + 1¢; magnitude < 100
  const triplet = {
    signal: makeQuote(99.99, 100.01, 'polygon'),
    recon: makeQuote(100.09, 100.11, 'tradier'),
    broker: makeQuote(100.05, 100.07, 'alpaca'),
  };
  const div = spec.compute_divergence(triplet, triplet);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_handled');
});

Deno.test('AC-17: verify_quote — within both thresholds → false_positive_within_tolerance', () => {
  const spec = buildVerifyQuoteSpec({ symbol: 'AAPL', operator_id: OP });
  const triplet = {
    signal: makeQuote(99.99, 100.01, 'polygon'),
    recon: makeQuote(99.99, 100.01, 'tradier'),
    broker: makeQuote(99.99, 100.01, 'alpaca'),
  };
  const div = spec.compute_divergence(triplet, triplet);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'false_positive_within_tolerance');
});

// ─── AC-18: verify_quote_freshness ─────────────────────────────────

Deno.test('AC-18: verify_quote_freshness spec — medium + noise_tolerant + default max_age_s=5', () => {
  const spec = buildVerifyQuoteFreshnessSpec({ symbol: 'AAPL', operator_id: OP });
  assertEquals(spec.tier, 'medium');
  assertEquals(spec.tolerance_class, 'noise_tolerant');
  assertEquals((spec.tolerance as { max_age_s: number }).max_age_s, 5);
});

Deno.test('AC-18: verify_quote_freshness — stale (10s old, max=5) → failure_handled + mtm_skipped_quote_stale', async () => {
  const spec = buildVerifyQuoteFreshnessSpec({ symbol: 'AAPL', operator_id: OP });
  const callTs = new Date(10_000);
  const quote = makeQuote(99.99, 100.01, 'alpaca');
  quote.ts = new Date(0); // 10s old
  const expected = { max_age_s: 5, call_ts_ms: callTs.getTime() } as unknown as { max_age_s: number };
  const div = spec.compute_divergence(expected, quote);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_handled');
  const action = await spec.failure_action({
    ts: callTs, outcome: 'failure_handled', divergence: div, expected, observed: quote,
  });
  assertEquals(action.action_taken, 'mtm_skipped_quote_stale');
});

Deno.test('AC-18: verify_quote_freshness — fresh (2s old, max=5) → false_positive_within_tolerance', () => {
  const spec = buildVerifyQuoteFreshnessSpec({ symbol: 'AAPL', operator_id: OP });
  const callTs = new Date(2_000);
  const quote = makeQuote(99.99, 100.01, 'alpaca');
  quote.ts = new Date(0);
  const expected = { max_age_s: 5, call_ts_ms: callTs.getTime() } as unknown as { max_age_s: number };
  const div = spec.compute_divergence(expected, quote);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'false_positive_within_tolerance');
});

// ─── AC-19: verify_short_availability ──────────────────────────────

Deno.test('AC-19: verify_short_availability spec — strong + low_tolerance', () => {
  const spec = buildVerifyShortAvailabilitySpec({ symbol: 'AAPL', operator_id: OP, qty_requested: 100 });
  assertEquals(spec.tier, 'strong');
  assertEquals(spec.tolerance_class, 'low_tolerance');
});

Deno.test('AC-19: verify_short_availability — available=false → failure_handled + short_entry_skipped_locate_unavailable', async () => {
  const spec = buildVerifyShortAvailabilitySpec({ symbol: 'AAPL', operator_id: OP, qty_requested: 100 });
  const observed = {
    symbol: 'AAPL', available: false, locate_id: null, qty_available: null, fetched_at: new Date(0),
  };
  const div = spec.compute_divergence({ qty_requested: 100 }, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_handled');
  const action = await spec.failure_action({
    ts: new Date(0), outcome: 'failure_handled', divergence: div,
    expected: { qty_requested: 100 }, observed,
  });
  assertEquals(action.action_taken, 'short_entry_skipped_locate_unavailable');
});

Deno.test('AC-19: verify_short_availability — partial qty (no substitution per §11.0.7) → failure_handled', () => {
  const spec = buildVerifyShortAvailabilitySpec({ symbol: 'AAPL', operator_id: OP, qty_requested: 100 });
  const observed = {
    symbol: 'AAPL', available: true, locate_id: 'L1', qty_available: 50, fetched_at: new Date(0),
  };
  const div = spec.compute_divergence({ qty_requested: 100 }, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_handled');
});

Deno.test('AC-19: verify_short_availability — full qty available → false_positive_within_tolerance', () => {
  const spec = buildVerifyShortAvailabilitySpec({ symbol: 'AAPL', operator_id: OP, qty_requested: 100 });
  const observed = {
    symbol: 'AAPL', available: true, locate_id: 'L1', qty_available: 100, fetched_at: new Date(0),
  };
  const div = spec.compute_divergence({ qty_requested: 100 }, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'false_positive_within_tolerance');
});

// ─── AC-20: verify_ssr_status TRI-STATE (DEC-035 clause (4) ≥3 scenarios) ──

Deno.test('AC-20: verify_ssr_status spec — strong + low_tolerance', () => {
  const spec = buildVerifySSRStatusSpec({ symbol: 'AAPL', operator_id: OP });
  assertEquals(spec.tier, 'strong');
  assertEquals(spec.tolerance_class, 'low_tolerance');
});

Deno.test('AC-20: verify_ssr_status — state=not_active → false_positive_within_tolerance', () => {
  const spec = buildVerifySSRStatusSpec({ symbol: 'AAPL', operator_id: OP });
  const observed = { symbol: 'AAPL', state: 'not_active' as const, source: 'nyse', fetched_at: new Date(0) };
  const div = spec.compute_divergence(null, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'false_positive_within_tolerance');
});

Deno.test('AC-20: verify_ssr_status — state=active → failure_handled + ssr_compliant_routing_required', async () => {
  const spec = buildVerifySSRStatusSpec({ symbol: 'AAPL', operator_id: OP });
  const observed = { symbol: 'AAPL', state: 'active' as const, source: 'nyse', fetched_at: new Date(0) };
  const div = spec.compute_divergence(null, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_handled');
  const action = await spec.failure_action({
    ts: new Date(0), outcome: 'failure_handled', divergence: div, expected: null, observed,
  });
  assertEquals(action.action_taken, 'ssr_compliant_routing_required');
});

Deno.test('AC-20: verify_ssr_status — state=indeterminate → failure_handled + short_skipped_ssr_indeterminate', async () => {
  const spec = buildVerifySSRStatusSpec({ symbol: 'AAPL', operator_id: OP });
  const observed = { symbol: 'AAPL', state: 'indeterminate' as const, source: 'nyse', fetched_at: new Date(0) };
  const div = spec.compute_divergence(null, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_handled');
  const action = await spec.failure_action({
    ts: new Date(0), outcome: 'failure_handled', divergence: div, expected: null, observed,
  });
  assertEquals(action.action_taken, 'short_skipped_ssr_indeterminate');
});

// ─── Registry sanity ───────────────────────────────────────────────

Deno.test('Registry — IMPLEMENTED_VERIFIERS contains all 17 §11.0.7 verifiers in canonical order', () => {
  assertEquals(IMPLEMENTED_VERIFIERS, [
    'verify_position',
    'verify_quote',
    'verify_quote_freshness',
    'verify_short_availability',
    'verify_ssr_status',
    'verify_halt_status',
    'verify_borrow_rate',
    'verify_borrow_persistence',
    'verify_buying_power',
    'verify_universe_membership',
    'verify_corporate_action_clean',
    'verify_settlement_status',
    'verify_order_acceptance',
    'verify_realized_pnl',
    'verify_lot_record',
    'verify_wash_sale_record',
    'verify_rebalance_aggregate',
  ]);
});

Deno.test('Registry — isVerifierImplemented reflects full 17-verifier roster (6.3d closure)', () => {
  assertEquals(isVerifierImplemented('verify_position'), true);
  assertEquals(isVerifierImplemented('verify_halt_status'), true);
  assertEquals(isVerifierImplemented('verify_universe_membership'), true);
  assertEquals(isVerifierImplemented('verify_corporate_action_clean'), true);
  assertEquals(isVerifierImplemented('verify_realized_pnl'), true);
  assertEquals(isVerifierImplemented('verify_lot_record'), true);
  assertEquals(isVerifierImplemented('verify_wash_sale_record'), true);
  assertEquals(isVerifierImplemented('verify_rebalance_aggregate'), true);
});

// ─── AC-21: verify_halt_status (#6 — Low/strong) ──────────────────

Deno.test('AC-21: verify_halt_status spec — strong + low_tolerance', () => {
  const spec = buildVerifyHaltStatusSpec({ symbol: 'AAPL', operator_id: OP });
  assertEquals(spec.call_name, 'verify_halt_status');
  assertEquals(spec.tier, 'strong');
  assertEquals(spec.tolerance_class, 'low_tolerance');
  assertEquals(spec.symbol, 'AAPL');
});

Deno.test('AC-21: verify_halt_status — halted=true → failure_handled + name_skipped_halted_this_tick', async () => {
  const spec = buildVerifyHaltStatusSpec({ symbol: 'AAPL', operator_id: OP });
  const observed = { symbol: 'AAPL', halted: true, halt_reason: 'T1', fetched_at: new Date(0) };
  const div = spec.compute_divergence(null, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_handled');
  const action = await spec.failure_action({
    ts: new Date(0), outcome: 'failure_handled', divergence: div, expected: null, observed,
  });
  assertEquals(action.action_taken, 'name_skipped_halted_this_tick');
});

Deno.test('AC-21: verify_halt_status — halted=false → false_positive_within_tolerance', () => {
  const spec = buildVerifyHaltStatusSpec({ symbol: 'AAPL', operator_id: OP });
  const observed = { symbol: 'AAPL', halted: false, halt_reason: null, fetched_at: new Date(0) };
  const div = spec.compute_divergence(null, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'false_positive_within_tolerance');
});

// ─── AC-22: verify_borrow_rate (#7 — Low/strong + 200bps magnitude) ──

Deno.test('AC-22: verify_borrow_rate spec — strong + low_tolerance + 200bps magnitude config (§11.0.9 line 271)', () => {
  const spec = buildVerifyBorrowRateSpec({ symbol: 'GME', operator_id: OP });
  assertEquals(spec.tier, 'strong');
  assertEquals(spec.tolerance_class, 'low_tolerance');
  assertEquals((spec.tolerance as { bps_magnitude_escalation: number }).bps_magnitude_escalation, 200);
  assertEquals((spec.tolerance as { bps_tolerance: number }).bps_tolerance, 50);
});

Deno.test('AC-22: verify_borrow_rate — bps_diff >= 200 → failure_escalated (magnitude per §11.0.9 line 271)', () => {
  const spec = buildVerifyBorrowRateSpec({ symbol: 'GME', operator_id: OP });
  // internal 1.0%, observed 4.0% → 300bps diff
  const observed = { symbol: 'GME', annual_rate_pct: 4.0, is_htb: false, fetched_at: new Date(0) };
  const div = spec.compute_divergence({ annual_rate_pct: 1.0 }, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_escalated');
});

Deno.test('AC-22: verify_borrow_rate — broker is_htb=true while internal rate is finite → failure_handled', async () => {
  const spec = buildVerifyBorrowRateSpec({ symbol: 'GME', operator_id: OP });
  // internal 2.0%, observed 2.5% with is_htb=true → 50bps diff, broker says HTB
  const observed = { symbol: 'GME', annual_rate_pct: 2.5, is_htb: true, fetched_at: new Date(0) };
  const div = spec.compute_divergence({ annual_rate_pct: 2.0 }, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_handled');
  const action = await spec.failure_action({
    ts: new Date(0), outcome: 'failure_handled', divergence: div,
    expected: { annual_rate_pct: 2.0 }, observed,
  });
  assertEquals(action.action_taken, 'short_entry_blocked_htb_or_rate_divergence');
});

Deno.test('AC-22: verify_borrow_rate — bps_diff within 50bps tolerance → false_positive_within_tolerance', () => {
  const spec = buildVerifyBorrowRateSpec({ symbol: 'GME', operator_id: OP });
  // internal 3.00%, observed 3.10% → 10bps diff
  const observed = { symbol: 'GME', annual_rate_pct: 3.10, is_htb: false, fetched_at: new Date(0) };
  const div = spec.compute_divergence({ annual_rate_pct: 3.00 }, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'false_positive_within_tolerance');
});

// ─── AC-23: verify_borrow_persistence (#8 — EXPECTED-DIVERGENCE-AWARE — FIRST USE) ──

Deno.test('AC-23: verify_borrow_persistence spec — strong + low_tolerance + expected-divergence-aware', () => {
  const spec = buildVerifyBorrowPersistenceSpec({ symbol: 'GME', operator_id: OP });
  assertEquals(spec.call_name, 'verify_borrow_persistence');
  assertEquals(spec.tier, 'strong');
  assertEquals(spec.tolerance_class, 'low_tolerance');
});

Deno.test('AC-23: verify_borrow_persistence — end-of-TTL (still_valid=false, expired_at_ttl=true) → expected_divergence_handled (does NOT count toward escalation)', () => {
  const spec = buildVerifyBorrowPersistenceSpec({ symbol: 'GME', operator_id: OP });
  const observed = {
    symbol: 'GME', locate_id: 'L1', still_valid: false, expired_at_ttl: true,
    ttl_expires_at: new Date(0), fetched_at: new Date(0),
  };
  const div = spec.compute_divergence({ locate_id: 'L1' }, observed);
  // FIRST emission of expected_divergence_handled in batch B.
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'expected_divergence_handled');
  // Lifecycle's shouldRunAction guard excludes expected_divergence_handled → failure_action is not invoked.
  // This is enforced by reconciliation-lifecycle.ts; here we just confirm the classifier emits the right outcome.
});

Deno.test('AC-23: verify_borrow_persistence — pre-TTL disappearance → failure_handled + locate_lost_pre_ttl_short_close_required', async () => {
  const spec = buildVerifyBorrowPersistenceSpec({ symbol: 'GME', operator_id: OP });
  const observed = {
    symbol: 'GME', locate_id: 'L1', still_valid: false, expired_at_ttl: false,
    ttl_expires_at: new Date(10_000), fetched_at: new Date(0),
  };
  const div = spec.compute_divergence({ locate_id: 'L1' }, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_handled');
  const action = await spec.failure_action({
    ts: new Date(0), outcome: 'failure_handled', divergence: div,
    expected: { locate_id: 'L1' }, observed,
  });
  assertEquals(action.action_taken, 'locate_lost_pre_ttl_short_close_required');
});

Deno.test('AC-23: verify_borrow_persistence — still_valid=true → false_positive_within_tolerance', () => {
  const spec = buildVerifyBorrowPersistenceSpec({ symbol: 'GME', operator_id: OP });
  const observed = {
    symbol: 'GME', locate_id: 'L1', still_valid: true, expired_at_ttl: false,
    ttl_expires_at: null, fetched_at: new Date(0),
  };
  const div = spec.compute_divergence({ locate_id: 'L1' }, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'false_positive_within_tolerance');
});

// ─── AC-24: verify_buying_power (#9 — SYSTEM-LEVEL symbol=null FIRST + 10% magnitude) ──

Deno.test('AC-24: verify_buying_power spec — strong + low_tolerance + symbol=null + 10% magnitude (§11.0.9 line 269)', () => {
  const spec = buildVerifyBuyingPowerSpec({ operator_id: OP });
  assertEquals(spec.call_name, 'verify_buying_power');
  assertEquals(spec.tier, 'strong');
  assertEquals(spec.tolerance_class, 'low_tolerance');
  // FIRST system-level verifier: symbol MUST be null per §11.0.7.
  assertEquals(spec.symbol, null);
  assertEquals((spec.tolerance as { pct_magnitude_escalation: number }).pct_magnitude_escalation, 10);
});

Deno.test('AC-24: verify_buying_power — insufficient_for_request=true → failure_handled + entry_skipped_insufficient_bp', async () => {
  const spec = buildVerifyBuyingPowerSpec({ operator_id: OP });
  // expected_bp 50_000, observed 40_000 (matches internal somewhat, but request 45_000 > observed)
  const observed = { available_bp: 40_000, account_equity: 100_000, fetched_at: new Date(0) };
  const div = spec.compute_divergence(
    { expected_bp: 40_000, requested_position_size: 45_000 },
    observed,
  );
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_handled');
  const action = await spec.failure_action({
    ts: new Date(0), outcome: 'failure_handled', divergence: div,
    expected: { expected_bp: 40_000, requested_position_size: 45_000 }, observed,
  });
  assertEquals(action.action_taken, 'entry_skipped_insufficient_bp');
});

Deno.test('AC-24: verify_buying_power — pct_diff >= 10 → failure_escalated (magnitude per §11.0.9 line 269)', () => {
  const spec = buildVerifyBuyingPowerSpec({ operator_id: OP });
  // internal 55_000, observed 50_000 → diff 5000 / max(55000,50000) = ~9.09% — under 10
  // Use internal 60_000 observed 50_000 → 10000/60000 = 16.67% > 10%
  const observed = { available_bp: 50_000, account_equity: 100_000, fetched_at: new Date(0) };
  const div = spec.compute_divergence(
    { expected_bp: 60_000, requested_position_size: 10_000 },
    observed,
  );
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_escalated');
});

Deno.test('AC-24: verify_buying_power — pct_diff within 2% band → false_positive_within_tolerance', () => {
  const spec = buildVerifyBuyingPowerSpec({ operator_id: OP });
  // internal 50_000, observed 50_500 → 1% diff
  const observed = { available_bp: 50_500, account_equity: 100_000, fetched_at: new Date(0) };
  const div = spec.compute_divergence(
    { expected_bp: 50_000, requested_position_size: 10_000 },
    observed,
  );
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'false_positive_within_tolerance');
});

// ─── AC-25: verify_universe_membership (#10 — STRUCTURAL ESCALATION — FIRST USE) ──

Deno.test('AC-25: verify_universe_membership spec — strong + low_tolerance + structural-escalation config', () => {
  const spec = buildVerifyUniverseMembershipSpec({ symbol: 'AAPL', operator_id: OP });
  assertEquals(spec.call_name, 'verify_universe_membership');
  assertEquals(spec.tier, 'strong');
  assertEquals(spec.tolerance_class, 'low_tolerance');
  const reasons = (spec.tolerance as { materially_excluded_reasons: string[] }).materially_excluded_reasons;
  assertEquals(reasons.includes('in_ma'), true);
  assertEquals(reasons.includes('halted_5d_plus'), true);
});

Deno.test('AC-25: verify_universe_membership — materially_excluded (in_ma) + internal_in_universe=true → failure_escalated (structural per §11.0.9 line 273)', async () => {
  const spec = buildVerifyUniverseMembershipSpec({ symbol: 'AAPL', operator_id: OP });
  const observed = {
    symbol: 'AAPL', in_universe: false, excluded: true,
    exclusion_reasons: ['in_ma'], fetched_at: new Date(0),
  };
  const div = spec.compute_divergence({ in_universe: true }, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_escalated');
  const action = await spec.failure_action({
    ts: new Date(0), outcome: 'failure_escalated', divergence: div,
    expected: { in_universe: true }, observed,
  });
  assertEquals(action.action_taken, 'entry_blocked_materially_excluded');
});

Deno.test('AC-25: verify_universe_membership — non-material exclusion (low_volume) + internal_in_universe=true → failure_handled (count-based; not structural)', () => {
  const spec = buildVerifyUniverseMembershipSpec({ symbol: 'AAPL', operator_id: OP });
  const observed = {
    symbol: 'AAPL', in_universe: false, excluded: true,
    exclusion_reasons: ['low_volume'], fetched_at: new Date(0),
  };
  const div = spec.compute_divergence({ in_universe: true }, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_handled');
});

Deno.test('AC-25: verify_universe_membership — cache stale (observed_in_universe=false, no exclusion) + internal=true → failure_handled', () => {
  const spec = buildVerifyUniverseMembershipSpec({ symbol: 'AAPL', operator_id: OP });
  const observed = {
    symbol: 'AAPL', in_universe: false, excluded: false,
    exclusion_reasons: [], fetched_at: new Date(0),
  };
  const div = spec.compute_divergence({ in_universe: true }, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_handled');
});

Deno.test('AC-25: verify_universe_membership — consistent inclusion → false_positive_within_tolerance', () => {
  const spec = buildVerifyUniverseMembershipSpec({ symbol: 'AAPL', operator_id: OP });
  const observed = {
    symbol: 'AAPL', in_universe: true, excluded: false,
    exclusion_reasons: [], fetched_at: new Date(0),
  };
  const div = spec.compute_divergence({ in_universe: true }, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'false_positive_within_tolerance');
});
// ─── AC-26: verify_corporate_action_clean (#11 — Low + expected-div + 48h structural) ───

Deno.test('AC-26: verify_corporate_action_clean spec — strong + low_tolerance', () => {
  const spec = buildVerifyCorporateActionCleanSpec({ symbol: 'AAPL', operator_id: OP });
  assertEquals(spec.call_name, 'verify_corporate_action_clean');
  assertEquals(spec.tier, 'strong');
  assertEquals(spec.tolerance_class, 'low_tolerance');
  assertEquals(spec.symbol, 'AAPL');
});

Deno.test('AC-26: verify_corporate_action_clean — no recent action → false_positive_within_tolerance', () => {
  const spec = buildVerifyCorporateActionCleanSpec({ symbol: 'AAPL', operator_id: OP });
  const observed = {
    symbol: 'AAPL', recent_action_within_lookback: false, action_type: null,
    action_ts: null, broker_basis_adjusted: false, hours_since_action: null,
    fetched_at: new Date(0),
  };
  const div = spec.compute_divergence(null, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'false_positive_within_tolerance');
});

Deno.test('AC-26: verify_corporate_action_clean — recent action + broker_basis_adjusted → false_positive_within_tolerance', () => {
  const spec = buildVerifyCorporateActionCleanSpec({ symbol: 'AAPL', operator_id: OP });
  const observed = {
    symbol: 'AAPL', recent_action_within_lookback: true, action_type: 'split',
    action_ts: new Date(0), broker_basis_adjusted: true, hours_since_action: 12,
    fetched_at: new Date(0),
  };
  const div = spec.compute_divergence(null, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'false_positive_within_tolerance');
});

Deno.test('AC-26: verify_corporate_action_clean — T+0 to T+1 (hours<24) → expected_divergence_handled', () => {
  const spec = buildVerifyCorporateActionCleanSpec({ symbol: 'AAPL', operator_id: OP });
  const observed = {
    symbol: 'AAPL', recent_action_within_lookback: true, action_type: 'split',
    action_ts: new Date(0), broker_basis_adjusted: false, hours_since_action: 12,
    fetched_at: new Date(0),
  };
  const div = spec.compute_divergence(null, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'expected_divergence_handled');
});

Deno.test('AC-26: verify_corporate_action_clean — 24-48h window → failure_handled (count-based)', () => {
  const spec = buildVerifyCorporateActionCleanSpec({ symbol: 'AAPL', operator_id: OP });
  const observed = {
    symbol: 'AAPL', recent_action_within_lookback: true, action_type: 'split',
    action_ts: new Date(0), broker_basis_adjusted: false, hours_since_action: 36,
    fetched_at: new Date(0),
  };
  const div = spec.compute_divergence(null, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_handled');
  // failure_action invoked here per lifecycle guard
});

Deno.test('AC-26: verify_corporate_action_clean — beyond 48h → failure_escalated + operator_alert_corporate_action_unresolved_48h', async () => {
  const spec = buildVerifyCorporateActionCleanSpec({ symbol: 'AAPL', operator_id: OP });
  const observed = {
    symbol: 'AAPL', recent_action_within_lookback: true, action_type: 'split',
    action_ts: new Date(0), broker_basis_adjusted: false, hours_since_action: 72,
    fetched_at: new Date(0),
  };
  const div = spec.compute_divergence(null, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_escalated');
  const action = await spec.failure_action({
    ts: new Date(0), outcome: 'failure_escalated', divergence: div, expected: null, observed,
  });
  assertEquals(action.action_taken, 'operator_alert_corporate_action_unresolved_48h');
});

// ─── AC-27: verify_settlement_status (#12 — hybrid Zero + expected-div per §11.0.9 line 235) ───

Deno.test('AC-27: verify_settlement_status spec — strong + zero_tolerance (post-T+1 path) + expected-div for pre-T+1', () => {
  const spec = buildVerifySettlementStatusSpec({ symbol: 'AAPL', side: 'long', operator_id: OP });
  assertEquals(spec.call_name, 'verify_settlement_status');
  assertEquals(spec.tier, 'strong');
  assertEquals(spec.tolerance_class, 'zero_tolerance');
  assertEquals(spec.symbol, 'AAPL');
});

Deno.test('AC-27: verify_settlement_status — settled=true → false_positive_within_tolerance', () => {
  const spec = buildVerifySettlementStatusSpec({ symbol: 'AAPL', side: 'long', operator_id: OP });
  const observed = {
    symbol: 'AAPL', side: 'long' as const, trade_ts: new Date('2026-01-01T10:00:00Z'),
    settled: true,
    expected_settlement_ts: new Date('2026-01-02T16:00:00Z'),
    fetched_at: new Date('2026-01-03T10:00:00Z'),
  };
  const div = spec.compute_divergence(null, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'false_positive_within_tolerance');
});

Deno.test('AC-27: verify_settlement_status — pre-T+1 unsettled → expected_divergence_handled (does not count)', () => {
  const spec = buildVerifySettlementStatusSpec({ symbol: 'AAPL', side: 'short', operator_id: OP });
  const observed = {
    symbol: 'AAPL', side: 'short' as const, trade_ts: new Date('2026-01-01T10:00:00Z'),
    settled: false,
    expected_settlement_ts: new Date('2026-01-02T16:00:00Z'),
    fetched_at: new Date('2026-01-02T10:00:00Z'),  // before expected_settlement_ts
  };
  const div = spec.compute_divergence(null, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'expected_divergence_handled');
});

Deno.test('AC-27: verify_settlement_status — post-T+1 unsettled → failure_escalated (Zero-tolerance per §11.0.9 line 235)', async () => {
  const spec = buildVerifySettlementStatusSpec({ symbol: 'AAPL', side: 'short', operator_id: OP });
  const observed = {
    symbol: 'AAPL', side: 'short' as const, trade_ts: new Date('2026-01-01T10:00:00Z'),
    settled: false,
    expected_settlement_ts: new Date('2026-01-02T16:00:00Z'),
    fetched_at: new Date('2026-01-03T16:00:00Z'),  // 24h past expected
  };
  const div = spec.compute_divergence(null, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_escalated');
  const action = await spec.failure_action({
    ts: new Date(0), outcome: 'failure_escalated', divergence: div, expected: null, observed,
  });
  assertEquals(action.action_taken, 'post_t1_unsettled_operator_alert_emitted');
});

// ─── AC-28: verify_order_acceptance (#13 — TRI-STATE, second after #5) ───

Deno.test('AC-28: verify_order_acceptance spec — strong + zero_tolerance + tri-state', () => {
  const spec = buildVerifyOrderAcceptanceSpec({ order_id: 'ord-1', symbol: 'AAPL', operator_id: OP });
  assertEquals(spec.call_name, 'verify_order_acceptance');
  assertEquals(spec.tier, 'strong');
  assertEquals(spec.tolerance_class, 'zero_tolerance');
  assertEquals(spec.symbol, 'AAPL');
});

Deno.test('AC-28: verify_order_acceptance — state=accepted → false_positive_within_tolerance', () => {
  const spec = buildVerifyOrderAcceptanceSpec({ order_id: 'ord-1', symbol: 'AAPL', operator_id: OP });
  const observed = {
    order_id: 'ord-1', symbol: 'AAPL', state: 'accepted' as const,
    rejection_reason: null, pending_elapsed_s: 0, fetched_at: new Date(0),
  };
  const div = spec.compute_divergence(null, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'false_positive_within_tolerance');
});

Deno.test('AC-28: verify_order_acceptance — state=rejected → failure_escalated + order_marked_rejected_no_retry', async () => {
  const spec = buildVerifyOrderAcceptanceSpec({ order_id: 'ord-1', symbol: 'AAPL', operator_id: OP });
  const observed = {
    order_id: 'ord-1', symbol: 'AAPL', state: 'rejected' as const,
    rejection_reason: 'insufficient_buying_power', pending_elapsed_s: 0, fetched_at: new Date(0),
  };
  const div = spec.compute_divergence(null, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_escalated');
  const action = await spec.failure_action({
    ts: new Date(0), outcome: 'failure_escalated', divergence: div, expected: null, observed,
  });
  assertEquals(action.action_taken, 'order_marked_rejected_no_retry');
  // Confirm cancel-and-retry NEVER emitted per §11.0.7 ban
  assertEquals(action.action_taken === 'cancel_and_retry', false);
});

Deno.test('AC-28: verify_order_acceptance — state=pending elapsed<60s → failure_handled + polling_escalated_2s_interval', async () => {
  const spec = buildVerifyOrderAcceptanceSpec({ order_id: 'ord-1', symbol: 'AAPL', operator_id: OP });
  const observed = {
    order_id: 'ord-1', symbol: 'AAPL', state: 'pending' as const,
    rejection_reason: null, pending_elapsed_s: 15, fetched_at: new Date(0),
  };
  const div = spec.compute_divergence(null, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_handled');
  const action = await spec.failure_action({
    ts: new Date(0), outcome: 'failure_handled', divergence: div, expected: null, observed,
  });
  assertEquals(action.action_taken, 'polling_escalated_2s_interval');
});

Deno.test('AC-28: verify_order_acceptance — state=pending elapsed>60s → failure_escalated + operator_alert_pending_60s_exceeded', async () => {
  const spec = buildVerifyOrderAcceptanceSpec({ order_id: 'ord-1', symbol: 'AAPL', operator_id: OP });
  const observed = {
    order_id: 'ord-1', symbol: 'AAPL', state: 'pending' as const,
    rejection_reason: null, pending_elapsed_s: 75, fetched_at: new Date(0),
  };
  const div = spec.compute_divergence(null, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_escalated');
  const action = await spec.failure_action({
    ts: new Date(0), outcome: 'failure_escalated', divergence: div, expected: null, observed,
  });
  assertEquals(action.action_taken, 'operator_alert_pending_60s_exceeded');
});

// ─── AC-29: verify_realized_pnl (#14 — Zero + STRONG_PLUS first outside #1) ───

Deno.test('AC-29: verify_realized_pnl spec — strong_plus + zero_tolerance + 1¢ tolerance config (first strong_plus outside #1)', () => {
  const spec = buildVerifyRealizedPnLSpec({ symbol: 'AAPL', operator_id: OP });
  assertEquals(spec.call_name, 'verify_realized_pnl');
  assertEquals(spec.tier, 'strong_plus');
  assertEquals(spec.tolerance_class, 'zero_tolerance');
  assertEquals(
    (spec.tolerance as { diff_tolerance_cents: number }).diff_tolerance_cents,
    1,
  );
});

Deno.test('AC-29: verify_realized_pnl — diff_cents <= 1 → false_positive_within_tolerance', () => {
  const spec = buildVerifyRealizedPnLSpec({ symbol: 'AAPL', operator_id: OP });
  // claimed=100.005, broker=100.00 -> diff=$0.005 -> 0.5¢ < 1¢
  const observed = {
    trade_id: 't-1', symbol: 'AAPL', broker_confirmed_pnl: 100.00,
    trade_ts: new Date(0), fetched_at: new Date(0),
  };
  const div = spec.compute_divergence({ trade_id: 't-1', claimed_pnl: 100.005 }, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'false_positive_within_tolerance');
});

Deno.test('AC-29: verify_realized_pnl — diff_cents > 1 → failure_escalated + realized_pnl_divergence_operator_alert_emitted', async () => {
  const spec = buildVerifyRealizedPnLSpec({ symbol: 'AAPL', operator_id: OP });
  // claimed=100.00, broker=100.05 -> diff=$0.05 -> 5¢ > 1¢
  const observed = {
    trade_id: 't-1', symbol: 'AAPL', broker_confirmed_pnl: 100.05,
    trade_ts: new Date(0), fetched_at: new Date(0),
  };
  const div = spec.compute_divergence({ trade_id: 't-1', claimed_pnl: 100.00 }, observed);
  assertEquals(spec.classify_outcome(div, spec.tolerance), 'failure_escalated');
  const action = await spec.failure_action({
    ts: new Date(0), outcome: 'failure_escalated', divergence: div, expected: { trade_id: 't-1', claimed_pnl: 100.00 }, observed,
  });
  assertEquals(action.action_taken, 'realized_pnl_divergence_operator_alert_emitted');
});
