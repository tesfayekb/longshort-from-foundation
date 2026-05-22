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

Deno.test('Registry — IMPLEMENTED_VERIFIERS contains all 5 batch-A verifiers in canonical order', () => {
  assertEquals(IMPLEMENTED_VERIFIERS, [
    'verify_position',
    'verify_quote',
    'verify_quote_freshness',
    'verify_short_availability',
    'verify_ssr_status',
  ]);
});

Deno.test('Registry — isVerifierImplemented reflects batch-A membership', () => {
  assertEquals(isVerifierImplemented('verify_position'), true);
  assertEquals(isVerifierImplemented('verify_halt_status'), false);
});