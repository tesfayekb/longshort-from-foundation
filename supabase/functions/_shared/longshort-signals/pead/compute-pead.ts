/**
 * Post-earnings-announcement drift (PEAD, Signal #2) per CROSSWIND §4.4.6.
 *
 * Formula (spec-literal):
 *   SUE      = (epsActual − consensus_epsAvg) / σ_proxy
 *   σ_proxy  = (epsHigh − epsLow) / (2 × 1.349)              ← DEC-051
 *   signal_N = SUE × exp(−trading_days_since_period / 20)    ← §4.4.6 decay
 *
 * Trading-day-counted decay (weekends/NYSE holidays do NOT advance the
 * exponent). Uses the shared `tradingDaysBetween` calendar utility.
 *
 * ─── Floor + typed-absence discipline ─────────────────────────────────
 * Per DEC-052 the strict eligibility floor is `numberAnalysts ≥ 2`. A
 * one-estimate panel has zero meaningful dispersion; we DO NOT compute a
 * SUE for it (skip reason `pead_panel_below_floor`).
 *
 * Per DEC-051 + DEC-053 the σ_proxy = 0 path (epsHigh === epsLow even
 * with N≥2) is `zero_dispersion`-class TYPED ABSENCE — NEVER a
 * fabricated ε-fallback. The ε path is forbidden: a non-zero ε would
 * produce a SUE of arbitrary magnitude determined entirely by the
 * fabricated denominator, manufacturing a phantom signal (CROSSWIND §2
 * axiom 3 + DEC-034 clause (2) sentinel-fallback discipline).
 *
 * Per DEC-048 + §4.4.6 the staleness gate is `trading_days_since ≤ 60`.
 * Beyond that the most recent earnings is "stale" and the signal returns
 * `no_recent_earnings`.
 *
 * ─── Conscious approximation (per DEC-053) ────────────────────────────
 * The §4.4.6 numerator nominally uses `consensus_estimate_EPS_at_T-5`;
 * the Finnhub eps-estimate row supplies the consensus AS OF T-0 (frozen
 * at report). The residual deviation is the pre-earnings-week "walk-
 * down" — analysts often nudge estimates downward in the final days
 * before report. Net effect: measured SUE may be slightly DAMPENED
 * versus a true T-5 consensus. Flagged for Phase-7 scrutiny per DEC-053.
 *
 * The §4.4.6 decay anchor is the report DATE; v1 uses `period` (fiscal
 * period-end) as a proxy because Finnhub's `/stock/earnings` endpoint
 * does not surface a separate report-date field. Typical slip is ≤2
 * trading days; conscious approximation documented in
 * `finnhub-earnings-fetcher.ts` and DEC-053.
 *
 * Pure: no I/O, no clock, no randomness. Deterministic for replay.
 *
 * Owner: longshort (FP-044 — Signal #2 / Phase 2.6)
 */
import { tradingDaysBetween } from '../../longshort-universe/shared/trading-days.ts';

/** DEC-052: strict floor — N=1 panels have zero meaningful dispersion. */
export const PEAD_MIN_ANALYSTS = 2;

/** §4.4.6: half-life of the SUE-decay envelope, in trading days. */
export const PEAD_HALF_LIFE_TRADING_DAYS = 20;

/**
 * §4.4.6 + DEC-048: trailing staleness window. Reports older than this
 * many trading days produce `no_recent_earnings` typed absence.
 */
export const PEAD_STALENESS_WINDOW_TRADING_DAYS = 60;

/**
 * DEC-051 range-to-σ proxy divisor: `(epsHigh − epsLow) / (2 × 1.349)`.
 * 1.349 is the half-width of the inter-quartile range for the standard
 * normal (z = ±0.6745) → 2 × 1.349 ≈ 2.698 converts range-of-N to a
 * z-scale dispersion proxy. Constant inlined for spec-literal grep
 * (DEC-051 cites "(2 × 1.349)" verbatim).
 */
export const RANGE_TO_SIGMA_DIVISOR = 2 * 1.349;

export interface PeadInputs {
  /** epsActual — reported EPS for the just-reported quarter. */
  epsActual: number;
  /** epsAvg — at-report consensus mean from `/stock/eps-estimate`. */
  epsAvg: number;
  /** epsHigh — upper bound of the analyst panel. DEC-051 input. */
  epsHigh: number;
  /** epsLow — lower bound of the analyst panel. DEC-051 input. */
  epsLow: number;
  /** numberAnalysts — panel size. DEC-052 floor input. */
  numberAnalysts: number;
  /** Fiscal period-end Date (proxy for report date per DEC-053). */
  reportPeriodDate: Date;
  /** `as_of` date for the compute run. */
  asOf: Date;
}

export type PeadSkipReason =
  | 'pead_panel_below_floor'
  | 'zero_dispersion'
  | 'no_recent_earnings';

export type PeadComputeResult =
  | {
      kind: 'value';
      value: number;
      sue: number;
      sigma_proxy: number;
      trading_days_since: number;
      /**
       * DW-172 — T-0 consensus snapshot capture. Additive, pure
       * passthrough of the function's own inputs (already in scope).
       * The value/sue/sigma_proxy/trading_days_since arithmetic is
       * BYTE-UNCHANGED — this field only echoes inputs the compute
       * already received, exposing them across the orchestrator
       * boundary (where they were previously dropped at the value
       * branch). Capture-only: not consumed by the live signal /
       * z-score / ranker. Per DEC-053, persisting this T-0 snapshot
       * forward lets a true T-5 consensus series accrue (~3 mo
       * horizon) for Phase-7 walk-down ablation.
       */
      inputs_snapshot: {
        epsActual: number;
        epsAvg: number;
        epsHigh: number;
        epsLow: number;
        numberAnalysts: number;
      };
    }
  | { kind: 'skip'; reason: PeadSkipReason; detail: string };

/**
 * Returns the decayed SUE signal, or a typed-skip discriminant.
 * Caller (orchestrator) maps skip reasons 1:1 to `SignalSkipReason`.
 */
export function computePead(i: PeadInputs): PeadComputeResult {
  // ── DEC-052 floor (FIRST gate — independent of dispersion math) ────
  if (!Number.isFinite(i.numberAnalysts) || i.numberAnalysts < PEAD_MIN_ANALYSTS) {
    return {
      kind: 'skip',
      reason: 'pead_panel_below_floor',
      detail: `numberAnalysts=${i.numberAnalysts} < ${PEAD_MIN_ANALYSTS} (DEC-052)`,
    };
  }

  // ── DEC-051 σ_proxy + DEC-053 zero-dispersion typed absence ────────
  // NEVER fabricate an ε to dodge the divide-by-zero. A non-zero ε
  // would produce an arbitrary-magnitude SUE — phantom signal.
  if (!Number.isFinite(i.epsHigh) || !Number.isFinite(i.epsLow)) {
    // Defensive — fetcher normalizeRow already drops non-finite rows.
    return {
      kind: 'skip',
      reason: 'zero_dispersion',
      detail: `non-finite eps bounds: high=${i.epsHigh} low=${i.epsLow}`,
    };
  }
  const range = i.epsHigh - i.epsLow;
  const sigma_proxy = range / RANGE_TO_SIGMA_DIVISOR;
  if (sigma_proxy <= 0) {
    return {
      kind: 'skip',
      reason: 'zero_dispersion',
      detail:
        `epsHigh=${i.epsHigh} epsLow=${i.epsLow} → σ_proxy=${sigma_proxy} ` +
        `(DEC-051 + DEC-053: typed absence; ε-fallback forbidden)`,
    };
  }

  // ── §4.4.6 + DEC-048 staleness gate (after period→as_of arithmetic) ─
  const trading_days_since = tradingDaysBetween(i.reportPeriodDate, i.asOf);
  // Future-period defensive: orchestrator filters `period <= as_of`,
  // but if a future period leaks through, treat as no_recent_earnings.
  if (i.reportPeriodDate.getTime() > i.asOf.getTime()) {
    return {
      kind: 'skip',
      reason: 'no_recent_earnings',
      detail: `reportPeriodDate is in the future relative to as_of`,
    };
  }
  if (trading_days_since > PEAD_STALENESS_WINDOW_TRADING_DAYS) {
    return {
      kind: 'skip',
      reason: 'no_recent_earnings',
      detail:
        `${trading_days_since} trading days since report > ` +
        `${PEAD_STALENESS_WINDOW_TRADING_DAYS} (§4.4.6 staleness gate)`,
    };
  }

  if (!Number.isFinite(i.epsActual) || !Number.isFinite(i.epsAvg)) {
    return {
      kind: 'skip',
      reason: 'no_recent_earnings',
      detail: `non-finite eps fields: actual=${i.epsActual} avg=${i.epsAvg}`,
    };
  }

  const sue = (i.epsActual - i.epsAvg) / sigma_proxy;
  const value = sue * Math.exp(-trading_days_since / PEAD_HALF_LIFE_TRADING_DAYS);
  return {
    kind: 'value',
    value,
    sue,
    sigma_proxy,
    trading_days_since,
    inputs_snapshot: {
      epsActual: i.epsActual,
      epsAvg: i.epsAvg,
      epsHigh: i.epsHigh,
      epsLow: i.epsLow,
      numberAnalysts: i.numberAnalysts,
    },
  };
}