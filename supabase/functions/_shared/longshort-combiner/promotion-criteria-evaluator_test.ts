/**
 * Pure tests for the promotion-criteria evaluator — FP-052.3 / ACT-283.
 * Locks (a) the carve-out invariant per DEC-063, (b) the §6.1 T+10
 * horizon constant, (c) the "current-substrate" baseline state (every
 * criterion in {not_computable, not_yet}; all_pass=false — correct, not
 * a failure, because no trained model exists at 3.3a).
 */
import { assert, assertEquals } from 'jsr:@std/assert';
import {
  CARVED_OUT_CRITERIA,
  evaluatePromotionCriteria,
  TRAINING_HORIZON_TD,
  type EvaluatorInput,
  type LabeledScoreRow,
} from './promotion-criteria-evaluator.ts';

const emptyInput: EvaluatorInput = { rows: [], intersection_days: [] };

function makeRow(
  seed: string,
  ticker: string,
  side: 'long' | 'short',
  model_score: number,
  fallback_score: number,
  ret: number | null,
): LabeledScoreRow {
  return {
    seed_as_of_date: seed,
    ticker,
    side,
    model_score,
    fallback_score,
    side_signed_return: ret,
  };
}

Deno.test('empty input → every criterion not_computable; all_pass=false', () => {
  const out = evaluatePromotionCriteria(emptyInput);
  assertEquals(out.all_pass, false);
  assertEquals(out.evaluated_at_horizon_td, 10);
  for (const r of out.results) {
    assertEquals(r.verdict, 'not_computable', `${r.criterion} should be not_computable`);
  }
});

Deno.test('DEC-063: SHAP/C6 carved out — never in results, always in carved_out', () => {
  const out = evaluatePromotionCriteria(emptyInput);
  for (const r of out.results) {
    assert(
      !r.criterion.toLowerCase().includes('shap'),
      `unexpected SHAP criterion in results: ${r.criterion}`,
    );
  }
  assertEquals(out.carved_out, [...CARVED_OUT_CRITERIA]);
});

Deno.test('§6.1/§6.2 LOCK — TRAINING_HORIZON_TD is 10', () => {
  assertEquals(TRAINING_HORIZON_TD, 10);
});

Deno.test('C10 intersection: 25 full-intersection days → pass; 3 days → not_yet', () => {
  const days25 = Array.from({ length: 25 }, (_, i) => ({
    as_of_date: `2026-06-${String(i + 1).padStart(2, '0')}`,
    distinct_signal_count: 9,
  }));
  const c10a = evaluatePromotionCriteria({ rows: [], intersection_days: days25 })
    .results.find((r) => r.criterion === 'C10_9signal_intersection_depth')!;
  assertEquals(c10a.verdict, 'pass');

  const c10b = evaluatePromotionCriteria({ rows: [], intersection_days: days25.slice(0, 3) })
    .results.find((r) => r.criterion === 'C10_9signal_intersection_depth')!;
  assertEquals(c10b.verdict, 'not_yet');
});

Deno.test('C9 label density: 1 labeled seed-date × 40 rows/side → not_yet (need many seed-dates)', () => {
  const rows: LabeledScoreRow[] = [];
  for (let i = 0; i < 40; i++) {
    rows.push(makeRow('2026-06-16', `TKR${i}`, 'long', i, i, 0.01));
    rows.push(makeRow('2026-06-16', `SKR${i}`, 'short', i, i, 0.01));
  }
  const c9 = evaluatePromotionCriteria({ rows, intersection_days: [] })
    .results.find((r) => r.criterion === 'C9_label_density')!;
  assertEquals(c9.verdict, 'not_yet');
});

Deno.test('current-substrate snapshot (3 intersection days, no labels) → every criterion in {not_computable, not_yet}', () => {
  const out = evaluatePromotionCriteria({
    rows: [],
    intersection_days: [
      { as_of_date: '2026-06-15', distinct_signal_count: 9 },
      { as_of_date: '2026-06-16', distinct_signal_count: 9 },
      { as_of_date: '2026-06-22', distinct_signal_count: 9 },
    ],
  });
  assertEquals(out.all_pass, false);
  for (const r of out.results) {
    assert(
      r.verdict === 'not_computable' || r.verdict === 'not_yet',
      `expected not_computable|not_yet, got ${r.verdict} for ${r.criterion}`,
    );
  }
});

Deno.test('C1 with sufficient seed-dates + model that perfectly ranks → pass', () => {
  // 30 seed-dates × 30 tickers/side, model_score = side_signed_return (perfect rank).
  const rows: LabeledScoreRow[] = [];
  for (let s = 0; s < 30; s++) {
    const sd = `2026-04-${String(s + 1).padStart(2, '0')}`;
    for (let i = 0; i < 30; i++) {
      const ret = i * 0.001;
      rows.push(makeRow(sd, `L${i}_${s}`, 'long', ret, 0, ret));
      rows.push(makeRow(sd, `S${i}_${s}`, 'short', ret, 0, ret));
    }
  }
  const c1 = evaluatePromotionCriteria({ rows, intersection_days: [] })
    .results.find((r) => r.criterion === 'C1_NDCG_25_vs_random')!;
  assertEquals(c1.verdict, 'pass');
});