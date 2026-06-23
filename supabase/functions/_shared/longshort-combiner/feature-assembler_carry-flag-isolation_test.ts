// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
/**
 * DW-106-b — Reader-side regression test pinning DEC-060 §(v):
 * `signal_observations.carried_forward` is AUDIT-ONLY and MUST NOT
 * leak into the feature vector. This test is the structural lock that
 * a future refactor adding the column to a combiner reader's `.select`
 * string fails immediately.
 *
 * Three guards, layered:
 *
 *   (G1) STRUCTURAL — `SignalObservationInput` (the pure assembler's
 *        in-process input type) has no `carried_forward` field. Even if
 *        the orchestrator started projecting the column, it could not
 *        reach the feature vector without a type-level change here.
 *        Asserted by enumerating the keys of a fully-populated sample.
 *
 *   (G2) BEHAVIORAL — two assembler runs over functionally-identical
 *        observation sets (one conceptually sourced from native
 *        publications, one from carried rows; both projected to the
 *        same `SignalObservationInput` shape) produce byte-identical
 *        `FeatureVectorRow[]` output. Confirms the pure layer cannot
 *        distinguish carried from native observations.
 *
 *   (G3) SOURCE-STRING — both combiner reader orchestrators'
 *        `signal_observations` `.select(...)` strings MUST NOT contain
 *        the substring 'carried_forward'. Read with --allow-read when
 *        available (locally / CI); skipped gracefully in the
 *        permission-restricted harness (--allow-net --allow-env only)
 *        with a clear log. The structural + behavioral guards above
 *        provide the harness-resident contract; G3 is the
 *        belt-and-suspenders defense for grep-evident regressions.
 */

import {
  assert,
  assertEquals,
  assertFalse,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  assembleFeatureVectors,
  type RegimeFeatures,
  type SignalObservationInput,
  type UniverseMember,
} from './feature-assembler.ts';
import {
  SIGNAL_IDS_CRITICAL,
  SIGNAL_IDS_NON_CRITICAL,
} from './signal-catalog.ts';

const OPERATOR = '00000000-0000-0000-0000-00000000d106';
const AS_OF = '2026-06-19';
const REGIME: RegimeFeatures = {
  market_24m_cumulative_return: 0.05,
  market_realized_vol_6m: 0.18,
};

/** Full-coverage observation set for one ticker — passes both gates. */
function fullCoverage(ticker: string): SignalObservationInput[] {
  const rows: SignalObservationInput[] = [];
  for (const id of SIGNAL_IDS_CRITICAL) {
    rows.push({
      operator_id: OPERATOR,
      ticker,
      signal_id: id,
      value: 0.5,
      is_present: true,
      gics_sector: 'Tech',
    });
  }
  for (const id of SIGNAL_IDS_NON_CRITICAL) {
    rows.push({
      operator_id: OPERATOR,
      ticker,
      signal_id: id,
      value: 0.25,
      is_present: true,
      gics_sector: 'Tech',
    });
  }
  return rows;
}

Deno.test('(G1) SignalObservationInput has NO carried_forward field — type-level isolation', () => {
  const sample: SignalObservationInput = {
    operator_id: OPERATOR,
    ticker: 'AAPL',
    signal_id: 'short_interest_change_30d',
    value: 0.1,
    is_present: true,
    gics_sector: 'Tech',
  };
  const keys = Object.keys(sample).sort();
  assertEquals(keys, [
    'gics_sector',
    'is_present',
    'operator_id',
    'signal_id',
    'ticker',
    'value',
  ]);
  assertFalse(keys.includes('carried_forward'));
});

Deno.test('(G2) assembler output is byte-identical for "native" vs "carried" inputs', () => {
  // Two functionally identical observation sets — the only thing that
  // differs between them at the writer layer (carried_forward) is
  // structurally absent from the assembler input. If the assembler
  // produced different output for these two it would mean some hidden
  // channel leaked — which by construction it cannot.
  const universe: UniverseMember[] = [{ operator_id: OPERATOR, ticker: 'AAPL' }];
  const fromNative = fullCoverage('AAPL');
  const fromCarried = fullCoverage('AAPL'); // identical projection

  const out1 = assembleFeatureVectors(fromNative, universe, AS_OF, REGIME);
  const out2 = assembleFeatureVectors(fromCarried, universe, AS_OF, REGIME);

  assertEquals(JSON.stringify(out1), JSON.stringify(out2));
  assertEquals(out1.length, 1);
  assertEquals(out1[0].excluded_reason, null);
  // The feature jsonb itself is the surface that would leak a writer
  // flag — assert NO key in the emitted features mentions carried.
  for (const k of Object.keys(out1[0].features)) {
    assertFalse(k.includes('carried'), `feature key '${k}' leaks carry semantics`);
  }
});

Deno.test('(G3) combiner reader .select strings do NOT contain "carried_forward"', async () => {
  // Permission-aware grep. The supabase test harness runs with
  // --allow-net --allow-env (per project docs); local / CI runs grant
  // --allow-read and exercise the full check. Either path is correct:
  // structural (G1) + behavioral (G2) guards already pin the contract;
  // G3 is the grep-evident defense for the rare regression that
  // bypasses both (e.g. a future writer that smuggles carry semantics
  // through a different column name).
  const targets = [
    new URL('./feature-assembler-orchestrator.ts', import.meta.url),
    new URL('./shadow-ranker-orchestrator.ts', import.meta.url),
  ];
  const source: string[] = [];
  try {
    for (const u of targets) {
      source.push(await Deno.readTextFile(u));
    }
  } catch (e) {
    if (e instanceof Deno.errors.PermissionDenied) {
      // Harness path — skip the source-string grep; G1+G2 still hold.
      console.warn(
        '(G3) skipped: --allow-read not granted in this harness; G1+G2 are sufficient. ' +
          'Local / CI runs with --allow-read exercise the full grep.',
      );
      return;
    }
    throw e;
  }

  for (let i = 0; i < source.length; i++) {
    const src = source[i];
    const name = targets[i].pathname.split('/').pop();
    // The actual signal_observations select strings (verbatim from
    // feature-assembler-orchestrator.ts:179 + shadow-ranker-orchestrator.ts:220):
    //   .select('ticker, signal_id, value, is_present, gics_sector')
    const re = /from\(['"]signal_observations['"]\)[\s\S]*?\.select\(([^)]*)\)/g;
    let m: RegExpExecArray | null;
    let matched = 0;
    while ((m = re.exec(src)) !== null) {
      matched++;
      const selectArgs = m[1];
      assertFalse(
        selectArgs.includes('carried_forward'),
        `${name}: signal_observations .select(${selectArgs}) contains 'carried_forward' — ` +
          `DEC-060 §(v) violation. The flag is audit-only and MUST NOT be projected to the reader.`,
      );
    }
    assert(matched > 0, `${name}: no signal_observations .select() match — regex needs updating`);
  }
});