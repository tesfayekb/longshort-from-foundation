/**
 * Promotion-criteria evaluator — FP-052.3 Phase 3.3a (ACT-283).
 *
 * Pure, read-model-style evaluator: given the substrate the gate reads
 * (combiner_book_shadow ⨝ combiner_forward_returns at horizon_td=10) +
 * a candidate model's per-(seed_as_of_date, ticker, side) scores +
 * fallback scores at the same keys, computes each substrate-evaluable
 * §10.7 promotion criterion as one of:
 *   - 'pass'           — threshold met
 *   - 'not_yet'        — substrate present but below threshold
 *   - 'not_computable' — substrate insufficient (no labels, no rows, etc.)
 *
 * NO DB, NO CLOCK, NO NETWORK. The orchestrator (later prompt) is solely
 * responsible for fetching substrate rows, invoking this evaluator, and
 * persisting verdicts.
 *
 * DEC-063: C6 (SHAP attribution traceable per ranking event) is TEMPORALLY
 * RELOCATED — not evaluated here; re-gated when DW-136 lands. Listed in
 * `CARVED_OUT_CRITERIA` for visibility, never silently dropped.
 *
 * Thresholds are NAMED CONSTANTS marked `CANDIDATE THRESHOLD - calibrated
 * during Phase 3 per §6.5.4` so they are operator-ratifiable; do not bury
 * threshold values inside criterion bodies.
 */

// ============================================================
// CANDIDATE THRESHOLDS — calibrated during Phase 3 per §6.5.4.
// Operator-ratifiable; surfaced here (not inside criterion bodies).
// ============================================================

/** C1 — NDCG@K vs random. */
export const NDCG_TOP_K = 25;
/** C1 — trained-model mean NDCG@25 must beat random by ≥ N·σ. */
export const NDCG_NSIGMA = 2;                  // CANDIDATE THRESHOLD - calibrated during Phase 3 per §6.5.4
/** C1 — minimum labeled (seed, side) pairs to compute the comparison. */
export const NDCG_MIN_SEED_DATES = 20;         // CANDIDATE THRESHOLD - calibrated during Phase 3 per §6.5.4

/** C2 — walk-forward Sharpe sign over ≥ M out-of-sample folds. */
export const SHARPE_MIN_FOLDS = 4;             // CANDIDATE THRESHOLD - calibrated during Phase 3 per §6.5.4

/** C9 — label density floor per (seed-date, side). */
export const LABEL_MIN_SEED_DATES = 20;        // CANDIDATE THRESHOLD - calibrated during Phase 3 per §6.5.4
export const LABEL_MIN_ROWS_PER_SIDE = 40;     // CANDIDATE THRESHOLD - calibrated during Phase 3 per §6.5.4

/** C10 — 9-signal intersection depth (proxy for missingness-profile stability). */
export const INTERSECTION_MIN_DAYS = 20;       // CANDIDATE THRESHOLD - calibrated during Phase 3 per §6.5.4

/** C12 — trained-model NDCG@25 must beat fallback NDCG@25 by ≥ delta. */
export const MODEL_VS_FALLBACK_NDCG_DELTA = 0.02;    // CANDIDATE THRESHOLD - calibrated during Phase 3 per §6.5.4
export const MODEL_VS_FALLBACK_MIN_SEED_DATES = 20;  // CANDIDATE THRESHOLD - calibrated during Phase 3 per §6.5.4

/** Spec-mandated training-label horizon (§6.1 / §6.2 LOCK; MIG-115 widened CHECK). */
export const TRAINING_HORIZON_TD = 10;

/** DEC-063: carved-out criteria, re-gated when DW-136 lands. */
export const CARVED_OUT_CRITERIA = ['C6_SHAP_attribution_traceable'] as const;

// ============================================================
// Types — substrate shape this evaluator consumes.
// ============================================================

export type Side = 'long' | 'short';
export type Verdict = 'pass' | 'not_yet' | 'not_computable';

export interface LabeledScoreRow {
  /** YYYY-MM-DD seed date. */
  seed_as_of_date: string;
  ticker: string;
  side: Side;
  /** Candidate model's predicted score for this (seed, ticker, side). */
  model_score: number;
  /** §6.4 count-normalized fallback's score for the same key. */
  fallback_score: number;
  /** Realized T+10 side-signed return; null when label not yet matured or
   *  price fetch failed (typed absence). */
  side_signed_return: number | null;
}

export interface IntersectionDay {
  as_of_date: string;
  /** Number of distinct `signal_id` present in `signal_observations` on
   *  this date; 9 = full intersection. */
  distinct_signal_count: number;
}

export interface EvaluatorInput {
  rows: ReadonlyArray<LabeledScoreRow>;
  intersection_days: ReadonlyArray<IntersectionDay>;
}

export interface CriterionEvidence {
  measured_value: number | null;
  threshold: number | null;
  detail: Record<string, unknown>;
}

export interface CriterionResult {
  criterion: string;
  verdict: Verdict;
  evidence: CriterionEvidence;
  spec_anchor: string;
}

export interface EvaluatorOutput {
  evaluated_at_horizon_td: number;
  results: CriterionResult[];
  /** True iff every result.verdict === 'pass'. */
  all_pass: boolean;
  carved_out: string[];
}

// ============================================================
// Pure helpers.
// ============================================================

function bySide(rows: ReadonlyArray<LabeledScoreRow>, side: Side): LabeledScoreRow[] {
  return rows.filter((r) => r.side === side);
}
function distinct<T>(xs: ReadonlyArray<T>): T[] {
  return Array.from(new Set(xs));
}
function mean(xs: ReadonlyArray<number>): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}
function stdev(xs: ReadonlyArray<number>): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}
function dcg(gains: ReadonlyArray<number>, k: number): number {
  const limit = Math.min(k, gains.length);
  let sum = 0;
  for (let i = 0; i < limit; i++) sum += gains[i] / Math.log2(i + 2);
  return sum;
}
function rankByScore(
  rows: ReadonlyArray<LabeledScoreRow>,
  scoreOf: (r: LabeledScoreRow) => number,
): LabeledScoreRow[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => scoreOf(b.r) - scoreOf(a.r) || a.i - b.i)
    .map((x) => x.r);
}
function ndcgAtK(
  rows: ReadonlyArray<LabeledScoreRow>,
  scoreOf: (r: LabeledScoreRow) => number,
  k: number,
): number | null {
  const labeled = rows.filter((r) => r.side_signed_return !== null);
  if (labeled.length === 0) return null;
  const predicted = rankByScore(labeled, scoreOf);
  const ideal = [...labeled].sort(
    (a, b) => (b.side_signed_return as number) - (a.side_signed_return as number),
  );
  const idealDcg = dcg(ideal.map((r) => r.side_signed_return as number), k);
  if (idealDcg === 0) return null;
  return dcg(predicted.map((r) => r.side_signed_return as number), k) / idealDcg;
}

// ============================================================
// Per-criterion evaluators.
// ============================================================

function evalC1(input: EvaluatorInput): CriterionResult {
  const seedDates = distinct(input.rows.map((r) => r.seed_as_of_date));
  if (seedDates.length === 0) {
    return {
      criterion: 'C1_NDCG_25_vs_random',
      verdict: 'not_computable',
      evidence: { measured_value: null, threshold: null, detail: { reason: 'no_seed_dates' } },
      spec_anchor: '§10.7 line 320',
    };
  }
  const modelNdcgs: number[] = [];
  const randomNdcgs: number[] = [];
  for (const sd of seedDates) {
    for (const side of ['long', 'short'] as Side[]) {
      const r = bySide(input.rows.filter((x) => x.seed_as_of_date === sd), side);
      const m = ndcgAtK(r, (x) => x.model_score, NDCG_TOP_K);
      // Deterministic pseudo-random surrogate ranking (ticker charcode).
      // Production evaluator should average over multiple seeds; this
      // single-seed surrogate is documented in evidence.detail.
      const rand = ndcgAtK(r, (x) => -x.ticker.charCodeAt(0), NDCG_TOP_K);
      if (m !== null) modelNdcgs.push(m);
      if (rand !== null) randomNdcgs.push(rand);
    }
  }
  if (modelNdcgs.length < NDCG_MIN_SEED_DATES) {
    return {
      criterion: 'C1_NDCG_25_vs_random',
      verdict: modelNdcgs.length === 0 ? 'not_computable' : 'not_yet',
      evidence: {
        measured_value: modelNdcgs.length > 0 ? mean(modelNdcgs) : null,
        threshold: NDCG_MIN_SEED_DATES,
        detail: {
          observed_seed_date_side_pairs: modelNdcgs.length,
          required_seed_date_side_pairs: NDCG_MIN_SEED_DATES,
          random_seed_method: 'ticker_charcode_descending_surrogate',
          reason: 'insufficient_labeled_seed_dates',
        },
      },
      spec_anchor: '§10.7 line 320',
    };
  }
  const modelMean = mean(modelNdcgs);
  const randomMean = mean(randomNdcgs);
  const randomSigma = stdev(randomNdcgs);
  const threshold = randomMean + NDCG_NSIGMA * randomSigma;
  return {
    criterion: 'C1_NDCG_25_vs_random',
    verdict: modelMean >= threshold ? 'pass' : 'not_yet',
    evidence: {
      measured_value: modelMean,
      threshold,
      detail: {
        model_mean_ndcg: modelMean,
        random_mean_ndcg: randomMean,
        random_sigma: randomSigma,
        n_sigma: NDCG_NSIGMA,
        observed_seed_date_side_pairs: modelNdcgs.length,
      },
    },
    spec_anchor: '§10.7 line 320',
  };
}

function evalC2(input: EvaluatorInput): CriterionResult {
  const seedDates = distinct(input.rows.map((r) => r.seed_as_of_date)).sort();
  const daily: number[] = [];
  for (const sd of seedDates) {
    const longs = bySide(input.rows.filter((x) => x.seed_as_of_date === sd), 'long')
      .filter((r) => r.side_signed_return !== null);
    const shorts = bySide(input.rows.filter((x) => x.seed_as_of_date === sd), 'short')
      .filter((r) => r.side_signed_return !== null);
    if (longs.length === 0 || shorts.length === 0) continue;
    const topLongs = rankByScore(longs, (r) => r.model_score).slice(0, NDCG_TOP_K);
    const topShorts = rankByScore(shorts, (r) => r.model_score).slice(0, NDCG_TOP_K);
    const longRet = mean(topLongs.map((r) => r.side_signed_return as number));
    const shortRet = mean(topShorts.map((r) => r.side_signed_return as number));
    daily.push(longRet - shortRet);
  }
  if (daily.length < SHARPE_MIN_FOLDS) {
    return {
      criterion: 'C2_walk_forward_sharpe_sign',
      verdict: daily.length === 0 ? 'not_computable' : 'not_yet',
      evidence: {
        measured_value: daily.length > 0 ? mean(daily) : null,
        threshold: SHARPE_MIN_FOLDS,
        detail: { observed_folds: daily.length, required_folds: SHARPE_MIN_FOLDS },
      },
      spec_anchor: '§10.7 line 321 (kill condition: Sharpe ≤ 0)',
    };
  }
  const sigma = stdev(daily);
  const sharpe = sigma === 0 ? 0 : (mean(daily) / sigma) * Math.sqrt(252);
  return {
    criterion: 'C2_walk_forward_sharpe_sign',
    verdict: sharpe > 0 ? 'pass' : 'not_yet',
    evidence: {
      measured_value: sharpe,
      threshold: 0,
      detail: {
        annualized_sharpe: sharpe,
        daily_mean: mean(daily),
        daily_stdev: sigma,
        n_folds: daily.length,
      },
    },
    spec_anchor: '§10.7 line 321 (kill condition: Sharpe ≤ 0)',
  };
}

function evalC9(input: EvaluatorInput): CriterionResult {
  const seedDates = distinct(input.rows.map((r) => r.seed_as_of_date));
  let qualifying = 0;
  for (const sd of seedDates) {
    for (const side of ['long', 'short'] as Side[]) {
      const labeled = bySide(input.rows.filter((x) => x.seed_as_of_date === sd), side)
        .filter((r) => r.side_signed_return !== null);
      if (labeled.length >= LABEL_MIN_ROWS_PER_SIDE) qualifying++;
    }
  }
  const required = LABEL_MIN_SEED_DATES * 2; // per-side count
  return {
    criterion: 'C9_label_density',
    verdict:
      qualifying >= required
        ? 'pass'
        : qualifying === 0
          ? 'not_computable'
          : 'not_yet',
    evidence: {
      measured_value: qualifying,
      threshold: required,
      detail: {
        qualifying_seed_date_side_pairs: qualifying,
        required_seed_date_side_pairs: required,
        required_rows_per_side: LABEL_MIN_ROWS_PER_SIDE,
        horizon_td: TRAINING_HORIZON_TD,
      },
    },
    spec_anchor: '§6.3 sufficient-data-accumulated + §6.1 T+10 horizon',
  };
}

function evalC10(input: EvaluatorInput): CriterionResult {
  const fullIntersection = input.intersection_days.filter(
    (d) => d.distinct_signal_count >= 9,
  ).length;
  return {
    criterion: 'C10_9signal_intersection_depth',
    verdict:
      fullIntersection >= INTERSECTION_MIN_DAYS
        ? 'pass'
        : fullIntersection === 0
          ? 'not_computable'
          : 'not_yet',
    evidence: {
      measured_value: fullIntersection,
      threshold: INTERSECTION_MIN_DAYS,
      detail: {
        observed_days: fullIntersection,
        required_days: INTERSECTION_MIN_DAYS,
      },
    },
    spec_anchor: '§6.5.3.2 / §6.3',
  };
}

function evalC12(input: EvaluatorInput): CriterionResult {
  const seedDates = distinct(input.rows.map((r) => r.seed_as_of_date));
  const deltas: number[] = [];
  for (const sd of seedDates) {
    for (const side of ['long', 'short'] as Side[]) {
      const r = bySide(input.rows.filter((x) => x.seed_as_of_date === sd), side);
      const m = ndcgAtK(r, (x) => x.model_score, NDCG_TOP_K);
      const f = ndcgAtK(r, (x) => x.fallback_score, NDCG_TOP_K);
      if (m !== null && f !== null) deltas.push(m - f);
    }
  }
  if (deltas.length < MODEL_VS_FALLBACK_MIN_SEED_DATES) {
    return {
      criterion: 'C12_model_vs_fallback_ndcg_delta',
      verdict: deltas.length === 0 ? 'not_computable' : 'not_yet',
      evidence: {
        measured_value: deltas.length > 0 ? mean(deltas) : null,
        threshold: MODEL_VS_FALLBACK_MIN_SEED_DATES,
        detail: {
          observed_pairs: deltas.length,
          required_pairs: MODEL_VS_FALLBACK_MIN_SEED_DATES,
        },
      },
      spec_anchor: 'implicit §10.7 (trained model must justify replacing fallback)',
    };
  }
  const m = mean(deltas);
  return {
    criterion: 'C12_model_vs_fallback_ndcg_delta',
    verdict: m >= MODEL_VS_FALLBACK_NDCG_DELTA ? 'pass' : 'not_yet',
    evidence: {
      measured_value: m,
      threshold: MODEL_VS_FALLBACK_NDCG_DELTA,
      detail: { mean_delta: m, n_pairs: deltas.length },
    },
    spec_anchor: 'implicit §10.7 (trained model must justify replacing fallback)',
  };
}

// ============================================================
// Public entry point.
// ============================================================

export function evaluatePromotionCriteria(input: EvaluatorInput): EvaluatorOutput {
  const results: CriterionResult[] = [
    evalC1(input),
    evalC2(input),
    evalC9(input),
    evalC10(input),
    evalC12(input),
  ];
  return {
    evaluated_at_horizon_td: TRAINING_HORIZON_TD,
    results,
    all_pass: results.every((r) => r.verdict === 'pass'),
    carved_out: [...CARVED_OUT_CRITERIA],
  };
}