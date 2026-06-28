/**
 * Feature-vector assembler — FP-052 3.0b-i (PURE LOGIC LAYER).
 *
 * Spec anchors:
 *   • CROSSWIND §4.3.5 (critical-signal exclusion + coverage gate)
 *   • CROSSWIND §6.5 (16-feature representation)
 *   • ADR-008a (supersedes ADR-008): the `Decimal('-999')` sentinel is
 *     introduced at exactly ONE site — the 3.2 in-process model-input
 *     construction function immediately before LightGBM `.predict()`.
 *     The 3.0b feature store (this module + its persistence target
 *     `combiner_feature_vectors.features`) holds TYPED-ABSENCE only.
 *     NO `-999` literal in this file (Gate 1 + sentinel-pattern scanner
 *     would catch one anyway; ADR-008a forbids it as a matter of
 *     architectural correctness, not just defensive enforcement).
 *
 * Purity contract (mirrors `compute-momentum.ts` precedent):
 *   • No Supabase client, no `createClient`, no `service_role`.
 *   • No wall-clock (`Date.now()`, `new Date()` with no arg, etc.).
 *     The `asOfDate` flows in as an argument; the orchestrator
 *     (3.0b-ii) is the only layer that knows the wall-clock.
 *   • Deterministic for replay: byte-identical output for byte-identical
 *     input. Stable key order in the emitted jsonb (insertion order =
 *     `JSON.stringify` order under V8/Deno).
 *   • Pure functions over plain data — no I/O, no randomness.
 *
 * Boundary semantics: this module operates on the in-process subset of
 * `signal_observations` (fields: operator_id, signal_id, ticker, value,
 * is_present, gics_sector) and a universe of (operator_id, ticker)
 * pairs. The orchestrator (3.0b-ii) is responsible for the SELECT, the
 * UPSERT, and the §22.5.1 live-DB smoke.
 */

import {
  EXCLUDED_REASON,
  EXPECTED_FEATURE_KEY_COUNT,
  REGIME_FEATURE_COUNT,
  MIN_NON_CRITICAL_PRESENT,
  SIGNAL_IDS_CRITICAL,
  SIGNAL_IDS_NON_CRITICAL,
  nonCriticalIsPresentKey,
  nonCriticalValueKey,
  type ExcludedReason,
  type SignalId,
} from './signal-catalog.ts';
import {
  MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID,
  MARKET_REALIZED_VOL_6M_SIGNAL_ID,
} from '../longshort-signals/market-regime/compute-regime.ts';
import type { SignalSkipReason } from '../longshort-signals/shared/signal-types.ts';

/**
 * DEC-071 sub-step 3c — Reversal cross-signal gate carve-out.
 *
 * The reversal orchestrator (sub-step 3b) emits gated rows with
 * `is_present=false` and `skip_reason ∈ {'gated_by_news','gated_by_catalyst'}`
 * when a name is overshadowed by a fresh news/catalyst event on that day.
 *
 * THE GATED-NULL ≠ BUG-NULL KEYSTONE:
 *
 *   The §4.3.5 critical-coverage contract historically excluded any name
 *   whose reversal (critical #7) was absent. Sub-step 3c carves out
 *   GATED-ONLY: a reversal that is `is_present=false` with one of the
 *   two gated skip_reasons above keeps the name INCLUDED (reversal
 *   contributes nothing to the composite; per-name DEC-074 semantics).
 *
 *   A genuinely-missing reversal (no row / is_present=false with a
 *   non-gated skip_reason / no skip_reason at all) STILL excludes the
 *   name with `MISSING_CRITICAL_7`. The carve-out is GATED-ONLY — a
 *   real data gap on a critical signal remains a hard exclusion.
 *
 *   `gate_inputs_unavailable` is NOT a gated row (the gate's hard
 *   precondition failed → reversal computed normally), so it is NOT in
 *   the gated set; insufficient_history / fetch_error / etc. are
 *   genuine absences and stay excluded.
 *
 * Momentum (critical #6) is UNCHANGED — only reversal is gated by
 * DEC-071. No carve-out for momentum.
 */
const REVERSAL_SIGNAL_ID = 'short_term_reversal_1w' as const;
const GATED_REVERSAL_SKIP_REASONS = new Set<string>([
  'gated_by_news',
  'gated_by_catalyst',
]);

function isGatedReversal(obs: SignalObservationInput | undefined): boolean {
  return (
    obs !== undefined &&
    obs.signal_id === REVERSAL_SIGNAL_ID &&
    obs.is_present === false &&
    obs.skip_reason !== null &&
    obs.skip_reason !== undefined &&
    GATED_REVERSAL_SKIP_REASONS.has(obs.skip_reason)
  );
}

/**
 * FP-052.2 / DEC-066 — market-level regime broadcast (3.2-c).
 *
 * Two market-level regime features are broadcast IDENTICALLY into every
 * per-name `features` jsonb at a given `as_of_date`:
 *   • `market_24m_cumulative_return`  (bare numeric)
 *   • `market_realized_vol_6m`        (bare numeric)
 *
 * Category per §6.5.1.1: MARKET-LEVEL. NOT the per-name non-critical
 * pattern — NO `__value`/`__is_present` pair. Fail-loud propagation lives
 * at the orchestrator boundary (a regime-less feature vector would poison
 * training and is therefore never constructed); 3.2-d will flip
 * `EXPECTED_FEATURE_KEY_COUNT` 16 → 18 in the catalog and re-hash
 * `FEATURE_ORDER`. THIS file does NOT change the hash.
 */
export interface RegimeFeatures {
  readonly market_24m_cumulative_return: number;
  readonly market_realized_vol_6m: number;
}

/**
 * Re-export the catalog's REGIME_FEATURE_COUNT so existing consumers that
 * import the constant from this module continue to work after 3.2-d folded
 * the +2 into `EXPECTED_FEATURE_KEY_COUNT` (single source of truth lives in
 * `signal-catalog.ts`).
 */
export { REGIME_FEATURE_COUNT };

/**
 * Typed fail-loud reason surfaced by the orchestrator when regime data
 * is absent for an as_of (producer failed-loud OR hasn't fired). Consistent
 * with the DEC-066 §(e) fail-loud family on the producer side.
 */
export const REGIME_FAIL_LOUD_REASON = 'regime_data_unavailable_at_assemble' as const;
export type RegimeFailLoudReason = typeof REGIME_FAIL_LOUD_REASON;

/**
 * Per-(operator, ticker, signal) observation — the minimal in-process
 * subset of `signal_observations` this pure layer consumes. The
 * orchestrator projects the DB row down to this shape.
 */
export interface SignalObservationInput {
  operator_id: string;
  ticker: string;
  signal_id: string;
  /** Z-score (`number`) when `is_present=true`; otherwise MUST be `null`. */
  value: number | null;
  is_present: boolean;
  /** GICS sector captured at compute time per the signal-row contract; may be null. */
  gics_sector: string | null;
  /**
   * DEC-071 sub-step 3c — gated-vs-missing discriminator. Carried verbatim
   * from `signal_observations.skip_reason`. The carve-out reads ONLY this
   * field on the reversal row to decide GATED (carve-out) vs MISSING
   * (still excluded). `null` / `undefined` = legacy (non-gated) row.
   */
  skip_reason?: SignalSkipReason | string | null;
}

/** Universe-membership entry — orchestrator floors to the latest snapshot ≤ as_of. */
export interface UniverseMember {
  operator_id: string;
  ticker: string;
}

/**
 * Output row — shape matches `public.combiner_feature_vectors`
 * (MIG-099). The orchestrator UPSERTs these via
 * `ON CONFLICT (operator_id, as_of_date, ticker) DO UPDATE`.
 */
export interface FeatureVectorRow {
  operator_id: string;
  as_of_date: string;
  ticker: string;
  features: Record<string, number | null>;
  gics_sector: string | null;
  coverage_count: number;
  excluded_reason: ExcludedReason | null;
  /**
   * DEC-071 sub-step 3c — sanctioned-null marker. Lists the critical
   * signal_ids whose `features[<id>] = null` is GATED (per-name carve-out),
   * NOT a bug. The ranker SKIPS criticals listed here (numerator and
   * presentCount unchanged for that slot — DEC-074 per-name) and STILL
   * THROWS `IncludedRowInvariantError` on a null critical NOT listed here
   * (the §4.3.5 bug-detection invariant survives intact).
   *
   * `null` = no gated criticals on this row (legacy / byte-identical).
   * Today the only signal that can appear here is `short_term_reversal_1w`.
   */
  gated_signals: string[] | null;
}

/** Result of the §4.3.5 gate evaluation for a single (operator, ticker). */
export interface GateOutcome {
  included: boolean;
  excludedReason: ExcludedReason | null;
  coverageCount: number;
  /**
   * DEC-071 sub-step 3c — set true only when reversal was carve-out-gated
   * (`is_present=false` with `skip_reason ∈ gated_by_news|gated_by_catalyst`).
   * Distinct from `critical7Present`: a normal-present reversal has
   * `reversalGated=false` AND contributes to the composite; a gated
   * reversal has `reversalGated=true` AND contributes nothing.
   */
  reversalGated: boolean;
}

/** "Absent" per §4.3.5 = no observation row OR `is_present === false`. */
function isPresent(obs: SignalObservationInput | undefined): boolean {
  return obs !== undefined && obs.is_present === true;
}

/**
 * Defensive: reject `is_present=true` with `value=null` as malformed
 * input. The DB-side CHECK on `signal_observations` already enforces
 * this; we re-enforce in the pure layer so unit-test fixtures and
 * upstream regressions surface immediately rather than producing a
 * silently malformed feature vector.
 */
function assertWellFormed(obs: SignalObservationInput): void {
  if (obs.is_present === true && obs.value === null) {
    throw new Error(
      `feature-assembler: malformed observation for ticker=${obs.ticker} ` +
        `signal=${obs.signal_id}: is_present=true requires value !== null`,
    );
  }
  if (obs.is_present === false && obs.value !== null) {
    throw new Error(
      `feature-assembler: malformed observation for ticker=${obs.ticker} ` +
        `signal=${obs.signal_id}: is_present=false requires value === null`,
    );
  }
}

/**
 * Evaluate the §4.3.5 gates for a single ticker's observation set.
 *
 * Gate order (locked, do NOT reorder):
 *   (1) Critical-signal gate: Signal #6 absent → `missing_critical_signal_6`;
 *       else Signal #7 absent → `missing_critical_signal_7`. When BOTH are
 *       absent the #6 reason wins (precedence rule).
 *   (2) Coverage gate: with both criticals present, count the non-critical
 *       presents. Below `MIN_NON_CRITICAL_PRESENT` (3) → `below_coverage_threshold`.
 *   (3) Otherwise: included.
 *
 * `coverageCount` is `critical_present + non_critical_present` and is
 * populated for excluded names too (queryable audit surface per FP-052).
 */
export function applyGates(
  perTickerObs: ReadonlyMap<SignalId, SignalObservationInput>,
): GateOutcome {
  const sig6 = SIGNAL_IDS_CRITICAL[0]; // cross_sectional_momentum_12_1
  const sig7 = SIGNAL_IDS_CRITICAL[1]; // short_term_reversal_1w
  const critical6Present = isPresent(perTickerObs.get(sig6));
  const critical7Present = isPresent(perTickerObs.get(sig7));
  // DEC-071 sub-step 3c — carve-out: reversal absent BUT gated by news
  // or catalyst is treated as critical-coverage-SATISFIED (the name is
  // rankable) while reversal contributes NOTHING to the composite. A
  // normal-present reversal is NOT "gated" — only is_present=false with
  // an explicitly gated skip_reason qualifies. Momentum (#6) is NEVER
  // carved out — only reversal is gated by DEC-071.
  const reversalGated = !critical7Present && isGatedReversal(perTickerObs.get(sig7));

  let nonCriticalPresent = 0;
  for (const id of SIGNAL_IDS_NON_CRITICAL) {
    if (isPresent(perTickerObs.get(id))) nonCriticalPresent++;
  }

  // coverageCount mirrors what actually contributes to the composite
  // (per-name DEC-074): a gated reversal is NOT counted toward coverage
  // because it contributes nothing to the numerator/presentCount. The
  // critical-coverage GATE is satisfied (the name is included), but the
  // coverage AUDIT field reflects the contributing signals only.
  const criticalPresent = (critical6Present ? 1 : 0) + (critical7Present ? 1 : 0);
  const coverageCount = criticalPresent + nonCriticalPresent;

  if (!critical6Present) {
    return {
      included: false,
      excludedReason: EXCLUDED_REASON.MISSING_CRITICAL_6,
      coverageCount,
      reversalGated: false,
    };
  }
  if (!critical7Present) {
    if (reversalGated) {
      // GATED carve-out — name INCLUDED; reversal contributes nothing.
      // Coverage gate still applies to the non-criticals below.
      if (nonCriticalPresent < MIN_NON_CRITICAL_PRESENT) {
        return {
          included: false,
          excludedReason: EXCLUDED_REASON.BELOW_COVERAGE,
          coverageCount,
          reversalGated: true,
        };
      }
      return {
        included: true,
        excludedReason: null,
        coverageCount,
        reversalGated: true,
      };
    }
    // GENUINELY MISSING reversal (non-gated skip / no row) → STILL exclude.
    // The carve-out is GATED-ONLY; a real data gap on a critical signal
    // remains a hard exclusion.
    return {
      included: false,
      excludedReason: EXCLUDED_REASON.MISSING_CRITICAL_7,
      coverageCount,
      reversalGated: false,
    };
  }
  if (nonCriticalPresent < MIN_NON_CRITICAL_PRESENT) {
    return {
      included: false,
      excludedReason: EXCLUDED_REASON.BELOW_COVERAGE,
      coverageCount,
      reversalGated: false,
    };
  }
  return { included: true, excludedReason: null, coverageCount, reversalGated: false };
}

/**
 * Derive `gics_sector` for a ticker as the first non-null sector among
 * its observations (catalog iteration order). All-null → null (caller
 * persists NULL; per F3 the row is INCLUDED if gates pass, not
 * excluded — sector is forensic-only at this layer).
 */
function deriveSector(
  perTickerObs: ReadonlyMap<SignalId, SignalObservationInput>,
): string | null {
  for (const id of [...SIGNAL_IDS_CRITICAL, ...SIGNAL_IDS_NON_CRITICAL]) {
    const obs = perTickerObs.get(id);
    if (obs && obs.gics_sector !== null && obs.gics_sector !== undefined) {
      return obs.gics_sector;
    }
  }
  return null;
}

/**
 * Build the typed-absence `features` jsonb for an INCLUDED name.
 *
 * Shape (16 keys total, stable insertion order):
 *   • For each critical signal (in catalog order):
 *       features[id] = <z-score>            // bare numeric, never null
 *   • For each non-critical signal (in catalog order):
 *       features[id__value]      = z | null
 *       features[id__is_present] = 0 | 1
 *
 * NO `-999` is ever written here. The fallback ranker (§6.4) reads
 * `__is_present` for the masking arithmetic; the 3.2 model-input
 * builder is the single site that constructs the `-999` sentinel
 * from this typed-absence representation per ADR-008a.
 */
function buildFeaturesJsonb(
  perTickerObs: ReadonlyMap<SignalId, SignalObservationInput>,
  regime: RegimeFeatures,
  reversalGated: boolean,
): Record<string, number | null> {
  // Insertion order is the contract — `JSON.stringify` will emit keys
  // in this exact sequence, making the output byte-deterministic.
  const features: Record<string, number | null> = {};

  for (const id of SIGNAL_IDS_CRITICAL) {
    const obs = perTickerObs.get(id);
    // DEC-071 sub-step 3c — gated reversal: features[reversal] = null
    // (typed-absence, §9 — never a fabricated zero). The `gated_signals`
    // marker on the FeatureVectorRow tells the ranker this null is
    // sanctioned, not a bug.
    if (id === REVERSAL_SIGNAL_ID && reversalGated) {
      features[id] = null;
      continue;
    }
    // Gate (1) guarantees both criticals are present when we reach this
    // builder; the non-null assertion is enforced by the upstream gate.
    if (!obs || !obs.is_present || obs.value === null) {
      throw new Error(
        `feature-assembler: included-name invariant broken — critical signal ${id} ` +
          `is not present for this ticker; gates should have excluded it`,
      );
    }
    features[id] = obs.value;
  }

  for (const id of SIGNAL_IDS_NON_CRITICAL) {
    const obs = perTickerObs.get(id);
    const present = isPresent(obs);
    features[nonCriticalValueKey(id)] = present ? (obs!.value as number) : null;
    features[nonCriticalIsPresentKey(id)] = present ? 1 : 0;
  }

  // Market-level regime broadcast (FP-052.2 §(d) / DEC-066). Bare numerics,
  // identical across every per-name row at the same as_of. The literal
  // keys here MUST match the constants 3.2-d will append to FEATURE_ORDER
  // at positions [16] and [17] when the hash flips — one literal, one
  // contract chain. Appended LAST so the per-name key order is unchanged.
  features[MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID] = regime.market_24m_cumulative_return;
  features[MARKET_REALIZED_VOL_6M_SIGNAL_ID] = regime.market_realized_vol_6m;

  return features;
}

/**
 * Group observations by (operator_id, ticker) → Map<signal_id, obs>.
 * Observations whose `signal_id` is not in the live catalog are
 * IGNORED at this layer (the orchestrator is responsible for the
 * `WHERE signal_id IN (...)` filter; this is defense-in-depth).
 */
function indexObservations(
  observations: ReadonlyArray<SignalObservationInput>,
): Map<string, Map<SignalId, SignalObservationInput>> {
  const catalog = new Set<string>([...SIGNAL_IDS_CRITICAL, ...SIGNAL_IDS_NON_CRITICAL]);
  const byTicker = new Map<string, Map<SignalId, SignalObservationInput>>();
  for (const obs of observations) {
    assertWellFormed(obs);
    if (!catalog.has(obs.signal_id)) continue;
    const key = `${obs.operator_id}\u0000${obs.ticker}`;
    let perTicker = byTicker.get(key);
    if (!perTicker) {
      perTicker = new Map<SignalId, SignalObservationInput>();
      byTicker.set(key, perTicker);
    }
    perTicker.set(obs.signal_id as SignalId, obs);
  }
  return byTicker;
}

/**
 * Main pure entry-point. Assembles one `FeatureVectorRow` per universe
 * member, with typed-absence features for included names and
 * `{features: {}, excluded_reason, coverage_count}` for excluded names.
 *
 * Iteration order: the input `universe` order is preserved verbatim
 * (determinism for replay; orchestrator is responsible for the
 * upstream sort if any).
 */
export function assembleFeatureVectors(
  observations: ReadonlyArray<SignalObservationInput>,
  universe: ReadonlyArray<UniverseMember>,
  asOfDate: string,
  regime: RegimeFeatures,
): FeatureVectorRow[] {
  const indexed = indexObservations(observations);
  const rows: FeatureVectorRow[] = [];

  for (const member of universe) {
    const key = `${member.operator_id}\u0000${member.ticker}`;
    const perTickerObs = indexed.get(key) ?? new Map<SignalId, SignalObservationInput>();

    const gate = applyGates(perTickerObs);
    const gicsSector = deriveSector(perTickerObs);

    if (gate.included) {
      const features = buildFeaturesJsonb(perTickerObs, regime, gate.reversalGated);
      // Defense-in-depth: lock the per-name + regime-broadcast key count.
      // 3.2-c additive: per-name catalog (EXPECTED_FEATURE_KEY_COUNT, 16)
      // + REGIME_FEATURE_COUNT (2). 3.2-d will fold the +2 into the catalog
      // constant itself (16 → 18) when FEATURE_ORDER flips.
      // 3.2-d: `EXPECTED_FEATURE_KEY_COUNT` now bakes in the 2 market-level
      // regime keys (per DEC-066 §(c) — bare numerics appended after the
      // per-name block); no separate `+ REGIME_FEATURE_COUNT` term.
      const expected = EXPECTED_FEATURE_KEY_COUNT;
      if (Object.keys(features).length !== expected) {
        throw new Error(
          `feature-assembler: included-row feature count ${Object.keys(features).length} ` +
            `!= EXPECTED_FEATURE_KEY_COUNT(${expected})`,
        );
      }
      rows.push({
        operator_id: member.operator_id,
        as_of_date: asOfDate,
        ticker: member.ticker,
        features,
        gics_sector: gicsSector,
        coverage_count: gate.coverageCount,
        excluded_reason: null,
        gated_signals: gate.reversalGated ? [REVERSAL_SIGNAL_ID] : null,
      });
    } else {
      rows.push({
        operator_id: member.operator_id,
        as_of_date: asOfDate,
        ticker: member.ticker,
        features: {},
        gics_sector: gicsSector,
        coverage_count: gate.coverageCount,
        excluded_reason: gate.excludedReason,
        gated_signals: null,
      });
    }
  }

  return rows;
}