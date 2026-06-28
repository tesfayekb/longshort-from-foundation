/**
 * DEC-071 sub-step 3c — §4.3.5 assembler carve-out + ranker
 * gated-null discrimination tests.
 *
 * The four behavioral contracts asserted here (these MUST hold):
 *
 *   (1) GATED reversal (is_present=false, skip_reason='gated_by_news'
 *       | 'gated_by_catalyst') -> name INCLUDED, gated_signals carries
 *       'short_term_reversal_1w', features[reversal] = null (NOT a
 *       fabricated zero per §9 typed-absence).
 *
 *   (2) GENUINELY-MISSING reversal (no row / is_present=false with a
 *       NON-gated skip_reason / no skip_reason at all) -> name STILL
 *       EXCLUDED with MISSING_CRITICAL_7. The carve-out is GATED-ONLY.
 *
 *   (3) The ranker SKIPS a gated-null critical (no contribution to
 *       numerator, no contribution to presentCount — per-name DEC-074).
 *       The ranker STILL THROWS IncludedRowInvariantError on a null
 *       critical NOT marked as gated (the §4.3.5 bug-detection
 *       invariant survives intact).
 *
 *   (4) MUST-NOT-MOVE: a name with a NORMAL reversal (is_present=true)
 *       produces a composite byte-identical to the pre-DEC-071 row —
 *       the carve-out ONLY affects gated names.
 */

import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  applyGates,
  assembleFeatureVectors,
  type FeatureVectorRow,
  type SignalObservationInput,
  type RegimeFeatures,
} from './feature-assembler.ts';
import {
  EXCLUDED_REASON,
  SIGNAL_IDS_ALL,
  SIGNAL_IDS_CRITICAL,
  SIGNAL_IDS_NON_CRITICAL,
  type SignalId,
} from './signal-catalog.ts';
import { computeComposite, IncludedRowInvariantError } from './ranker.ts';

const OP = 'op-1';
const AS_OF = '2026-06-26';
const REVERSAL = 'short_term_reversal_1w';
const MOMENTUM = 'cross_sectional_momentum_12_1';
const REGIME: RegimeFeatures = {
  market_24m_cumulative_return: 0.1,
  market_realized_vol_6m: 0.2,
};

function obs(
  ticker: string,
  signal_id: string,
  value: number | null,
  is_present: boolean,
  skip_reason: string | null = null,
): SignalObservationInput {
  return {
    operator_id: OP,
    ticker,
    signal_id,
    value,
    is_present,
    gics_sector: 'Tech',
    skip_reason,
  };
}

function fullPresent(ticker: string): SignalObservationInput[] {
  const out: SignalObservationInput[] = [];
  let v = 0.1;
  for (const id of SIGNAL_IDS_ALL) {
    out.push(obs(ticker, id, v, true));
    v += 0.05;
  }
  return out;
}

function asPerTicker(
  rows: SignalObservationInput[],
): ReadonlyMap<SignalId, SignalObservationInput> {
  const m = new Map<SignalId, SignalObservationInput>();
  for (const r of rows) m.set(r.signal_id as SignalId, r);
  return m;
}

// ────────────────────── PART 1 — GATE BEHAVIOR ───────────────────────

Deno.test('(3c-1) GATED reversal (gated_by_news) -> INCLUDED, reversalGated=true', () => {
  const rows = fullPresent('AAPL').map((r) =>
    r.signal_id === REVERSAL ? obs('AAPL', REVERSAL, null, false, 'gated_by_news') : r,
  );
  const gate = applyGates(asPerTicker(rows));
  assertEquals(gate.included, true);
  assertEquals(gate.excludedReason, null);
  assertEquals(gate.reversalGated, true);
});

Deno.test('(3c-2) GATED reversal (gated_by_catalyst) -> INCLUDED, reversalGated=true', () => {
  const rows = fullPresent('AAPL').map((r) =>
    r.signal_id === REVERSAL ? obs('AAPL', REVERSAL, null, false, 'gated_by_catalyst') : r,
  );
  const gate = applyGates(asPerTicker(rows));
  assertEquals(gate.included, true);
  assertEquals(gate.reversalGated, true);
});

Deno.test('(3c-3) GENUINELY-MISSING reversal (no row) -> MISSING_CRITICAL_7', () => {
  const rows = fullPresent('AAPL').filter((r) => r.signal_id !== REVERSAL);
  const gate = applyGates(asPerTicker(rows));
  assertEquals(gate.included, false);
  assertEquals(gate.excludedReason, EXCLUDED_REASON.MISSING_CRITICAL_7);
  assertEquals(gate.reversalGated, false);
});

Deno.test('(3c-4) GENUINELY-MISSING reversal (non-gated skip insufficient_history) -> MISSING_CRITICAL_7', () => {
  const rows = fullPresent('AAPL').map((r) =>
    r.signal_id === REVERSAL
      ? obs('AAPL', REVERSAL, null, false, 'insufficient_history')
      : r,
  );
  const gate = applyGates(asPerTicker(rows));
  assertEquals(gate.included, false);
  assertEquals(gate.excludedReason, EXCLUDED_REASON.MISSING_CRITICAL_7);
  assertEquals(gate.reversalGated, false);
});

Deno.test('(3c-5) GENUINELY-MISSING reversal (is_present=false, NO skip_reason) -> MISSING_CRITICAL_7', () => {
  const rows = fullPresent('AAPL').map((r) =>
    r.signal_id === REVERSAL ? obs('AAPL', REVERSAL, null, false, null) : r,
  );
  const gate = applyGates(asPerTicker(rows));
  assertEquals(gate.included, false);
  assertEquals(gate.excludedReason, EXCLUDED_REASON.MISSING_CRITICAL_7);
});

Deno.test('(3c-6) gate_inputs_unavailable is NOT a gated skip -> STILL MISSING_CRITICAL_7', () => {
  const rows = fullPresent('AAPL').map((r) =>
    r.signal_id === REVERSAL
      ? obs('AAPL', REVERSAL, null, false, 'gate_inputs_unavailable')
      : r,
  );
  const gate = applyGates(asPerTicker(rows));
  assertEquals(gate.included, false);
  assertEquals(gate.excludedReason, EXCLUDED_REASON.MISSING_CRITICAL_7);
});

Deno.test('(3c-7) momentum (#6) has NO carve-out — gated_by_news on momentum is ignored, name EXCLUDED', () => {
  const rows = fullPresent('AAPL').map((r) =>
    r.signal_id === MOMENTUM ? obs('AAPL', MOMENTUM, null, false, 'gated_by_news') : r,
  );
  const gate = applyGates(asPerTicker(rows));
  assertEquals(gate.included, false);
  assertEquals(gate.excludedReason, EXCLUDED_REASON.MISSING_CRITICAL_6);
});

// ────────────────── PART 2 — FEATURES JSONB + MARKER ─────────────────

Deno.test('(3c-8) gated reversal -> features[reversal]=null + gated_signals=[reversal] (NEVER fabricated zero)', () => {
  const rows = fullPresent('AAPL').map((r) =>
    r.signal_id === REVERSAL ? obs('AAPL', REVERSAL, null, false, 'gated_by_news') : r,
  );
  const out = assembleFeatureVectors(
    rows,
    [{ operator_id: OP, ticker: 'AAPL' }],
    AS_OF,
    REGIME,
  );
  assertEquals(out.length, 1);
  const row = out[0];
  assertEquals(row.excluded_reason, null);
  assertEquals(row.features[REVERSAL], null);
  assertEquals(row.gated_signals, [REVERSAL]);
  assertEquals(typeof row.features[REVERSAL] === 'number', false);
});

Deno.test('(3c-9) NORMAL reversal -> features[reversal] is bare numeric; gated_signals=null (must-not-move)', () => {
  const rows = fullPresent('AAPL');
  const out = assembleFeatureVectors(
    rows,
    [{ operator_id: OP, ticker: 'AAPL' }],
    AS_OF,
    REGIME,
  );
  assertEquals(out.length, 1);
  const row = out[0];
  assertEquals(row.excluded_reason, null);
  assertEquals(row.gated_signals, null);
  assertEquals(typeof row.features[REVERSAL], 'number');
});

// ─────────────────────── PART 3 — RANKER ─────────────────────────────

function makeIncludedRow(features: Record<string, number | null>, gated: string[] | null): FeatureVectorRow {
  return {
    operator_id: OP,
    as_of_date: AS_OF,
    ticker: 'AAPL',
    features,
    gics_sector: 'Tech',
    coverage_count: 9,
    excluded_reason: null,
    gated_signals: gated,
  };
}

function buildNormalFeatures(): Record<string, number | null> {
  const f: Record<string, number | null> = {};
  for (const id of SIGNAL_IDS_CRITICAL) f[id] = 1.0;
  for (const id of SIGNAL_IDS_NON_CRITICAL) {
    f[`${id}__value`] = 0.5;
    f[`${id}__is_present`] = 1;
  }
  f['market_24m_cumulative_return'] = 0.1;
  f['market_realized_vol_6m'] = 0.2;
  return f;
}

Deno.test('(3c-10) ranker SKIPS gated-null critical — per-name DEC-074 (no contribution to numerator OR presentCount)', () => {
  const baseline = computeComposite(makeIncludedRow(buildNormalFeatures(), null));

  // DEC-074: SIGNAL_IDS_FALLBACK_SUM excludes active_catalyst_flag, so the
  // baseline iterates 2 criticals + 6 non-criticals (catalyst excluded).
  // baseline = (1+1 + 0.5*6) / (2+6) = 5/8 = 0.625
  // gated    = (1   + 0.5*6) / (1+6) = 4/7
  const gatedFeatures = { ...buildNormalFeatures(), [REVERSAL]: null };
  const gated = computeComposite(makeIncludedRow(gatedFeatures, [REVERSAL]));

  assertEquals(baseline.presentCount, 8);
  assertEquals(gated.presentCount, 7);
  assertEquals(Number(baseline.composite.toFixed(6)), 0.625);
  assertEquals(Number(gated.composite.toFixed(6)), Number((4 / 7).toFixed(6)));
});

Deno.test('(3c-11) ranker STILL THROWS on NON-gated null critical — bug-detection invariant intact', () => {
  const bugFeatures = { ...buildNormalFeatures(), [REVERSAL]: null };
  assertThrows(
    () => computeComposite(makeIncludedRow(bugFeatures, null)),
    IncludedRowInvariantError,
    `critical signal '${REVERSAL}'`,
  );
});

Deno.test('(3c-12) ranker STILL THROWS when null-critical NOT listed in gated_signals (empty array is not a license)', () => {
  const bugFeatures = { ...buildNormalFeatures(), [REVERSAL]: null };
  assertThrows(
    () => computeComposite(makeIncludedRow(bugFeatures, [])),
    IncludedRowInvariantError,
  );
});

Deno.test('(3c-13) ranker MUST-NOT-MOVE — normal-reversal name composite is byte-identical with gated_signals=null', () => {
  const normal = makeIncludedRow(buildNormalFeatures(), null);
  const r1 = computeComposite(normal);
  const r2 = computeComposite(normal);
  assertEquals(r1.composite, r2.composite);
  assertEquals(r1.presentCount, r2.presentCount);
  assertEquals(Number(r1.composite.toFixed(6)), 0.625);
  assertEquals(r1.presentCount, 8);
});
