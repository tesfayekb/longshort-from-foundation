/**
 * Pure-logic unit tests — FP-052 3.0b-i feature-assembler.
 *
 * DB-free. No Supabase import, no `createClient`, no `service_role`,
 * no wall-clock. Mirrors the `compute-momentum_test.ts` precedent.
 */

import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  applyGates,
  assembleFeatureVectors,
  REGIME_FAIL_LOUD_REASON,
  REGIME_FEATURE_COUNT,
  type RegimeFeatures,
  type SignalObservationInput,
  type UniverseMember,
} from './feature-assembler.ts';
import {
  EXCLUDED_REASON,
  EXPECTED_FEATURE_KEY_COUNT,
  SIGNAL_IDS_CRITICAL,
  SIGNAL_IDS_NON_CRITICAL,
  type SignalId,
} from './signal-catalog.ts';
import {
  MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID,
  MARKET_REALIZED_VOL_6M_SIGNAL_ID,
} from '../longshort-signals/market-regime/compute-regime.ts';

const OP = '00000000-0000-0000-0000-000000000001';
const AS_OF = '2026-06-16';
const REGIME: RegimeFeatures = {
  market_24m_cumulative_return: 0.123,
  market_realized_vol_6m: 0.184,
};

function obs(
  signalId: string,
  ticker: string,
  value: number | null,
  is_present: boolean,
  gics_sector: string | null = 'Information Technology',
): SignalObservationInput {
  return { operator_id: OP, ticker, signal_id: signalId, value, is_present, gics_sector };
}

function presentObs(signalId: string, ticker: string, v: number, sector: string | null = 'Information Technology') {
  return obs(signalId, ticker, v, true, sector);
}

function makeMap(arr: SignalObservationInput[]): Map<SignalId, SignalObservationInput> {
  const m = new Map<SignalId, SignalObservationInput>();
  for (const o of arr) m.set(o.signal_id as SignalId, o);
  return m;
}

function allNineFor(ticker: string): SignalObservationInput[] {
  return [
    presentObs(SIGNAL_IDS_CRITICAL[0], ticker, 1.5),
    presentObs(SIGNAL_IDS_CRITICAL[1], ticker, -0.5),
    ...SIGNAL_IDS_NON_CRITICAL.map((id, i) => presentObs(id, ticker, 0.1 * (i + 1))),
  ];
}

// ─────────────────────────── applyGates ────────────────────────────

Deno.test('applyGates: critical #6 absent → missing_critical_signal_6', () => {
  const m = makeMap([
    presentObs(SIGNAL_IDS_CRITICAL[1], 'AAPL', 0.4),
    ...SIGNAL_IDS_NON_CRITICAL.slice(0, 3).map(id => presentObs(id, 'AAPL', 0.2)),
  ]);
  const out = applyGates(m);
  assertEquals(out.included, false);
  assertEquals(out.excludedReason, EXCLUDED_REASON.MISSING_CRITICAL_6);
  assertEquals(out.coverageCount, 1 + 3);
});

Deno.test('applyGates: critical #7 absent (only) → missing_critical_signal_7', () => {
  const m = makeMap([
    presentObs(SIGNAL_IDS_CRITICAL[0], 'AAPL', 1.0),
    ...SIGNAL_IDS_NON_CRITICAL.slice(0, 4).map(id => presentObs(id, 'AAPL', 0.2)),
  ]);
  const out = applyGates(m);
  assertEquals(out.included, false);
  assertEquals(out.excludedReason, EXCLUDED_REASON.MISSING_CRITICAL_7);
  assertEquals(out.coverageCount, 1 + 4);
});

Deno.test('applyGates: BOTH criticals absent → #6 precedence wins', () => {
  const m = makeMap([
    ...SIGNAL_IDS_NON_CRITICAL.slice(0, 5).map(id => presentObs(id, 'AAPL', 0.2)),
  ]);
  const out = applyGates(m);
  assertEquals(out.excludedReason, EXCLUDED_REASON.MISSING_CRITICAL_6);
  assertEquals(out.coverageCount, 0 + 5);
});

for (const n of [0, 1, 2]) {
  Deno.test(`applyGates: coverage non-critical-present=${n} → below_coverage_threshold`, () => {
    const m = makeMap([
      presentObs(SIGNAL_IDS_CRITICAL[0], 'AAPL', 1.0),
      presentObs(SIGNAL_IDS_CRITICAL[1], 'AAPL', -0.5),
      ...SIGNAL_IDS_NON_CRITICAL.slice(0, n).map(id => presentObs(id, 'AAPL', 0.2)),
    ]);
    const out = applyGates(m);
    assertEquals(out.included, false);
    assertEquals(out.excludedReason, EXCLUDED_REASON.BELOW_COVERAGE);
    assertEquals(out.coverageCount, 2 + n);
  });
}

for (const n of [3, 4, 5, 6, 7]) {
  Deno.test(`applyGates: coverage non-critical-present=${n} → INCLUDED`, () => {
    const m = makeMap([
      presentObs(SIGNAL_IDS_CRITICAL[0], 'AAPL', 1.0),
      presentObs(SIGNAL_IDS_CRITICAL[1], 'AAPL', -0.5),
      ...SIGNAL_IDS_NON_CRITICAL.slice(0, n).map(id => presentObs(id, 'AAPL', 0.2)),
    ]);
    const out = applyGates(m);
    assertEquals(out.included, true);
    assertEquals(out.excludedReason, null);
    assertEquals(out.coverageCount, 2 + n);
  });
}

Deno.test('applyGates: is_present=false rows do NOT count as present', () => {
  const m = makeMap([
    presentObs(SIGNAL_IDS_CRITICAL[0], 'AAPL', 1.0),
    presentObs(SIGNAL_IDS_CRITICAL[1], 'AAPL', -0.5),
    obs(SIGNAL_IDS_NON_CRITICAL[0], 'AAPL', null, false),
    obs(SIGNAL_IDS_NON_CRITICAL[1], 'AAPL', null, false),
    presentObs(SIGNAL_IDS_NON_CRITICAL[2], 'AAPL', 0.2),
    presentObs(SIGNAL_IDS_NON_CRITICAL[3], 'AAPL', 0.3),
    presentObs(SIGNAL_IDS_NON_CRITICAL[4], 'AAPL', 0.4),
  ]);
  const out = applyGates(m);
  assertEquals(out.included, true);
  assertEquals(out.coverageCount, 2 + 3);
});

// ────────────────────── assembleFeatureVectors ─────────────────────

Deno.test('assembler: INCLUDED row jsonb has exactly 18 keys, NO -999 anywhere', () => {
  const universe: UniverseMember[] = [{ operator_id: OP, ticker: 'AAPL' }];
  const rows = assembleFeatureVectors(allNineFor('AAPL'), universe, AS_OF, REGIME);
  assertEquals(rows.length, 1);
  const row = rows[0];
  assertEquals(row.excluded_reason, null);
  // 3.2-d: EXPECTED_FEATURE_KEY_COUNT now bakes in the 2 market-level keys
  // (2 critical + 7*2 non-critical + 2 market = 18).
  assertEquals(REGIME_FEATURE_COUNT, 2);
  assertEquals(EXPECTED_FEATURE_KEY_COUNT, 18);
  assertEquals(Object.keys(row.features).length, EXPECTED_FEATURE_KEY_COUNT);
  assertEquals(row.coverage_count, 9);
  // No -999 anywhere in the features payload.
  for (const v of Object.values(row.features)) {
    assert(v !== -999, 'features must not contain the -999 sentinel at 3.0b');
  }
  // Bare numeric for criticals.
  assertEquals(row.features[SIGNAL_IDS_CRITICAL[0]], 1.5);
  assertEquals(row.features[SIGNAL_IDS_CRITICAL[1]], -0.5);
  // Pair shape for non-criticals (present).
  for (let i = 0; i < SIGNAL_IDS_NON_CRITICAL.length; i++) {
    const id = SIGNAL_IDS_NON_CRITICAL[i];
    assertEquals(row.features[`${id}__value`], 0.1 * (i + 1));
    assertEquals(row.features[`${id}__is_present`], 1);
  }
  // Market-level regime broadcast: bare numerics, NOT __value/__is_present.
  assertEquals(row.features[MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID], 0.123);
  assertEquals(row.features[MARKET_REALIZED_VOL_6M_SIGNAL_ID], 0.184);
  assertEquals(row.features[`${MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID}__value`], undefined);
  assertEquals(row.features[`${MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID}__is_present`], undefined);
});

Deno.test('assembler: included row — absent non-critical → __value:null, __is_present:0, NO -999', () => {
  // 5 of 7 non-critical present → INCLUDED. 2 absent.
  const presentNonCrit = SIGNAL_IDS_NON_CRITICAL.slice(0, 5);
  const obsArr = [
    presentObs(SIGNAL_IDS_CRITICAL[0], 'MSFT', 0.7),
    presentObs(SIGNAL_IDS_CRITICAL[1], 'MSFT', 0.2),
    ...presentNonCrit.map(id => presentObs(id, 'MSFT', 0.5)),
  ];
  const rows = assembleFeatureVectors(obsArr, [{ operator_id: OP, ticker: 'MSFT' }], AS_OF, REGIME);
  const row = rows[0];
  assertEquals(row.excluded_reason, null);
  assertEquals(Object.keys(row.features).length, 18);
  for (const id of SIGNAL_IDS_NON_CRITICAL.slice(5)) {
    assertEquals(row.features[`${id}__value`], null);
    assertEquals(row.features[`${id}__is_present`], 0);
  }
  // Affirm no -999 sentinel anywhere.
  for (const v of Object.values(row.features)) {
    assert(v !== -999);
  }
});

Deno.test('assembler: EXCLUDED row → features={}, reason set, coverage_count populated', () => {
  // Only critical #7 + 2 non-critical → excluded (missing #6).
  const obsArr = [
    presentObs(SIGNAL_IDS_CRITICAL[1], 'TSLA', 0.3),
    presentObs(SIGNAL_IDS_NON_CRITICAL[0], 'TSLA', 0.1),
    presentObs(SIGNAL_IDS_NON_CRITICAL[1], 'TSLA', 0.2),
  ];
  const rows = assembleFeatureVectors(obsArr, [{ operator_id: OP, ticker: 'TSLA' }], AS_OF, REGIME);
  const row = rows[0];
  assertEquals(row.excluded_reason, EXCLUDED_REASON.MISSING_CRITICAL_6);
  assertEquals(row.features, {});
  assertEquals(row.coverage_count, 1 + 2);
  assertEquals(row.gics_sector, 'Information Technology');
});

Deno.test('assembler: malformed is_present=true with value=null → throws', () => {
  assertThrows(
    () =>
      assembleFeatureVectors(
        [{ operator_id: OP, ticker: 'AAPL', signal_id: SIGNAL_IDS_CRITICAL[0], value: null, is_present: true, gics_sector: null }],
        [{ operator_id: OP, ticker: 'AAPL' }],
        AS_OF,
        REGIME,
      ),
    Error,
    'is_present=true requires value !== null',
  );
});

Deno.test('assembler: malformed is_present=false with value!=null → throws', () => {
  assertThrows(
    () =>
      assembleFeatureVectors(
        [{ operator_id: OP, ticker: 'AAPL', signal_id: SIGNAL_IDS_CRITICAL[0], value: 0.5, is_present: false, gics_sector: null }],
        [{ operator_id: OP, ticker: 'AAPL' }],
        AS_OF,
        REGIME,
      ),
    Error,
    'is_present=false requires value === null',
  );
});

Deno.test('assembler: deterministic key order — two runs byte-identical', () => {
  const universe: UniverseMember[] = [{ operator_id: OP, ticker: 'AAPL' }];
  const a = assembleFeatureVectors(allNineFor('AAPL'), universe, AS_OF, REGIME);
  // Re-run with reversed observation input order to defeat any accidental
  // "first-seen" ordering of feature keys; output JSON must match.
  const reversed = [...allNineFor('AAPL')].reverse();
  const b = assembleFeatureVectors(reversed, universe, AS_OF, REGIME);
  assertEquals(JSON.stringify(a), JSON.stringify(b));
  // Lock the exact key sequence for the deterministic-replay contract.
  // Regime keys appended LAST so per-name key order is unchanged.
  const expectedKeys = [
    ...SIGNAL_IDS_CRITICAL,
    ...SIGNAL_IDS_NON_CRITICAL.flatMap(id => [`${id}__value`, `${id}__is_present`]),
    MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID,
    MARKET_REALIZED_VOL_6M_SIGNAL_ID,
  ];
  assertEquals(Object.keys(a[0].features), expectedKeys);
});

Deno.test('assembler: all-null sector → INCLUDED with gics_sector=null (F3)', () => {
  const obsArr = [
    presentObs(SIGNAL_IDS_CRITICAL[0], 'NULLSEC', 1.0, null),
    presentObs(SIGNAL_IDS_CRITICAL[1], 'NULLSEC', -0.4, null),
    ...SIGNAL_IDS_NON_CRITICAL.slice(0, 3).map(id => presentObs(id, 'NULLSEC', 0.2, null)),
  ];
  const rows = assembleFeatureVectors(obsArr, [{ operator_id: OP, ticker: 'NULLSEC' }], AS_OF, REGIME);
  const row = rows[0];
  assertEquals(row.excluded_reason, null);
  assertEquals(row.gics_sector, null);
  assertEquals(Object.keys(row.features).length, 18);
});

Deno.test('assembler: universe member with NO observations → excluded missing_critical_signal_6, coverage=0', () => {
  const rows = assembleFeatureVectors([], [{ operator_id: OP, ticker: 'GHOST' }], AS_OF, REGIME);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].excluded_reason, EXCLUDED_REASON.MISSING_CRITICAL_6);
  assertEquals(rows[0].features, {});
  assertEquals(rows[0].coverage_count, 0);
  assertEquals(rows[0].gics_sector, null);
});

Deno.test('assembler: preserves universe iteration order (replay determinism)', () => {
  const universe: UniverseMember[] = [
    { operator_id: OP, ticker: 'AAA' },
    { operator_id: OP, ticker: 'BBB' },
    { operator_id: OP, ticker: 'CCC' },
  ];
  const obsArr = [...allNineFor('AAA'), ...allNineFor('BBB'), ...allNineFor('CCC')];
  const rows = assembleFeatureVectors(obsArr, universe, AS_OF, REGIME);
  assertEquals(rows.map(r => r.ticker), ['AAA', 'BBB', 'CCC']);
});

Deno.test('assembler: observations with unknown signal_id are ignored (defense-in-depth)', () => {
  const obsArr = [
    ...allNineFor('AAPL'),
    presentObs('not_a_real_signal', 'AAPL', 999),
  ];
  const rows = assembleFeatureVectors(obsArr, [{ operator_id: OP, ticker: 'AAPL' }], AS_OF, REGIME);
  assertEquals(Object.keys(rows[0].features).length, 18);
  assertEquals(rows[0].features['not_a_real_signal'], undefined);
});

Deno.test('assembler: as_of_date threads through to every emitted row verbatim', () => {
  const universe: UniverseMember[] = [
    { operator_id: OP, ticker: 'X' },
    { operator_id: OP, ticker: 'Y' },
  ];
  const rows = assembleFeatureVectors([], universe, '2025-01-02', REGIME);
  for (const r of rows) assertEquals(r.as_of_date, '2025-01-02');
});

// ───────────────── 3.2-c — regime broadcast invariants ─────────────────

Deno.test('(3.2-c) regime broadcast: IDENTICAL values across all per-name rows at same as_of', () => {
  const universe: UniverseMember[] = [
    { operator_id: OP, ticker: 'AAA' },
    { operator_id: OP, ticker: 'BBB' },
    { operator_id: OP, ticker: 'CCC' },
  ];
  const obsArr = [...allNineFor('AAA'), ...allNineFor('BBB'), ...allNineFor('CCC')];
  const rows = assembleFeatureVectors(obsArr, universe, AS_OF, REGIME);
  for (const r of rows) {
    assertEquals(r.features[MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID], 0.123);
    assertEquals(r.features[MARKET_REALIZED_VOL_6M_SIGNAL_ID], 0.184);
  }
});

Deno.test('(3.2-c) regime keys are bare numerics — NO __value/__is_present pair (market-level category)', () => {
  const rows = assembleFeatureVectors(
    allNineFor('AAPL'),
    [{ operator_id: OP, ticker: 'AAPL' }],
    AS_OF,
    REGIME,
  );
  const f = rows[0].features;
  // Bare numerics present.
  assertEquals(typeof f[MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID], 'number');
  assertEquals(typeof f[MARKET_REALIZED_VOL_6M_SIGNAL_ID], 'number');
  // Pair-shape keys MUST NOT exist.
  for (const id of [MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID, MARKET_REALIZED_VOL_6M_SIGNAL_ID]) {
    assertEquals(f[`${id}__value`], undefined);
    assertEquals(f[`${id}__is_present`], undefined);
  }
});

Deno.test('(3.2-c) per-name signal keys are UNCHANGED — broadcast is purely additive', () => {
  const rows = assembleFeatureVectors(
    allNineFor('AAPL'),
    [{ operator_id: OP, ticker: 'AAPL' }],
    AS_OF,
    REGIME,
  );
  const perNameKeys = [
    ...SIGNAL_IDS_CRITICAL,
    ...SIGNAL_IDS_NON_CRITICAL.flatMap(id => [`${id}__value`, `${id}__is_present`]),
  ];
  for (const k of perNameKeys) {
    assert(k in rows[0].features, `per-name key missing: ${k}`);
  }
  // 3.2-d: EXPECTED_FEATURE_KEY_COUNT now includes the 2 market-level keys;
  // the per-name block is the catalog count minus the regime broadcast.
  assertEquals(perNameKeys.length, EXPECTED_FEATURE_KEY_COUNT - REGIME_FEATURE_COUNT);
});

Deno.test('(3.2-c) REGIME_FAIL_LOUD_REASON is the typed reason literal', () => {
  assertEquals(REGIME_FAIL_LOUD_REASON, 'regime_data_unavailable_at_assemble');
});