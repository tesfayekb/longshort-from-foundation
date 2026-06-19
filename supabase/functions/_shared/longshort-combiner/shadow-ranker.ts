/**
 * Shadow ranker — FP-052 3.M-ii / ACT-242.
 *
 * PURE LAYER (no Supabase, no clock, no -999, no randomness). The
 * gate-relaxed measurement counterpart to `ranker.ts`. Produces one
 * `ShadowRankingRow` per included ticker per (inclusion_rule, k)
 * variant from `combiner_shadow_variant_config`.
 *
 * DELIBERATE, ISOLATED FORK FROM `ranker.ts`:
 *   The live `computeComposite` THROWS `IncludedRowInvariantError`
 *   when a critical signal is absent — that throw is a load-bearing
 *   guarantee of the §4.3.5 contract on the live path and MUST stay
 *   loud. The shadow composite guards on presence INSTEAD (criticals-
 *   symmetric: every signal contributes iff present, never throws).
 *   This is the entire point of the shadow harness — to measure what
 *   the live ranker would emit if the gate were relaxed. Reusing the
 *   live `computeComposite` would either (a) need a `permissive` flag
 *   on the live function (weakens the live invariant) or (b) need a
 *   thrown-error catch loop (silently swallows real bugs). Neither
 *   is acceptable. The two composites are intentionally separate.
 *
 * The rank comparators reuse the LIVE semantics verbatim:
 *   long_rank  → adjusted DESC, ticker ASC
 *   short_rank → adjusted ASC,  ticker ASC
 * Ranks are computed in TypeScript (NEVER via a Postgres ORDER BY).
 *
 * The regression-tie test in `shadow-ranker_test.ts` asserts that for
 * a fully-gated input (both criticals present, non-critical floor
 * met), `computeRankingsShadow(rows, { inclusionRule: 'gated', k: 0 })`
 * yields IDENTICAL `(ticker, long_rank, short_rank)` to the live
 * `computeRankings(rows)`. That property is the load-bearing guard
 * against silent drift between the two surfaces.
 */

import {
  SIGNAL_IDS_ALL,
  SIGNAL_IDS_CRITICAL,
  MIN_NON_CRITICAL_PRESENT,
  type SignalId,
} from './signal-catalog.ts';
import { BOOK_SEED_SIZE } from './ranker-constants.ts';
import type { InclusionRule } from './shadow-constants.ts';
import { RANKER_SOURCE_SHADOW } from './shadow-constants.ts';
import type { ShadowVector } from './shadow-assembler.ts';

/** Variant tuning — one row per `combiner_shadow_variant_config` entry. */
export interface ShadowVariantParams {
  inclusionRule: InclusionRule;
  /** Shrinkage k ≥ 0; k=0 ⇒ factor 1 (no shrinkage). */
  k: number;
}

/** One emitted shadow ranking row per included ticker per variant. */
export interface ShadowRankingRow {
  ticker: string;
  /** composite × n / (n + k) — what the ranker actually sorts on. */
  adjusted: number;
  /** Raw §6.4 count-normalized average (pre-shrinkage). */
  composite: number;
  presentCount: number;
  long_rank: number;
  short_rank: number;
  gics_sector: string | null;
}

/** One emitted shadow book row per side per variant. */
export interface ShadowBookRow {
  side: 'long' | 'short';
  rank_within_side: number;
  ticker: string;
  score: number;
  ranker_source: typeof RANKER_SOURCE_SHADOW;
}

/** Thrown if a shadow seed would place the same ticker on both sides. */
export class ShadowBookOverlapError extends Error {
  readonly overlapping: readonly string[];
  constructor(overlapping: readonly string[]) {
    super(
      `shadow-ranker: tickers appear on BOTH long and short sides of the seeded shadow book: ` +
        overlapping.join(', '),
    );
    this.name = 'ShadowBookOverlapError';
    this.overlapping = overlapping;
  }
}

/**
 * Inclusion gate — pure predicate. Encodes the three regimes the
 * shadow harness measures in parallel. The `gated` branch mirrors the
 * live §4.3.5 contract; the other two are the relaxation arms DW-109
 * exists to resolve.
 */
export function passesInclusion(vector: ShadowVector, rule: InclusionRule): boolean {
  const c6 = vector.present.has(SIGNAL_IDS_CRITICAL[0] as SignalId);
  const c7 = vector.present.has(SIGNAL_IDS_CRITICAL[1] as SignalId);

  if (rule === 'no_gate') {
    return vector.presentCount >= 1;
  }
  if (rule === 'criticals_required') {
    return c6 && c7;
  }
  // 'gated' — both criticals AND non-critical floor.
  if (!(c6 && c7)) return false;
  // presentCount includes the two criticals; non-critical-present count
  // is the residual.
  const nonCriticalPresent = vector.presentCount - 2;
  return nonCriticalPresent >= MIN_NON_CRITICAL_PRESENT;
}

/**
 * Criticals-symmetric §6.4 composite — every signal (critical and
 * non-critical alike) is guarded on presence; the absent half of the
 * typed-absence pair is never read. Iterates `SIGNAL_IDS_ALL` in
 * catalog order (IEEE-754 non-associativity ⇒ catalog sequence is the
 * byte-identical replay guarantee — same contract as `ranker.ts`).
 */
export function computeCompositeShadow(vector: ShadowVector): {
  composite: number;
  presentCount: number;
} {
  let numerator = 0;
  let presentCount = 0;
  for (const id of SIGNAL_IDS_ALL as readonly SignalId[]) {
    const v = vector.present.get(id);
    if (v === undefined) continue;
    // assembleShadowVectors already filtered to finite numerics; the
    // defensive guard here is a cheap second line.
    if (!Number.isFinite(v)) continue;
    numerator += v;
    presentCount += 1;
  }
  const composite = numerator / Math.max(1, presentCount);
  return { composite, presentCount };
}

/**
 * Coverage shrinkage — `composite × n / (n + k)`. k=0 ⇒ factor 1
 * (no shrinkage; preserves the gross-gate semantics).
 * Caller passes the `presentCount` computed by `computeCompositeShadow`
 * (or, equivalently, `vector.presentCount` — the two are equal by
 * construction).
 */
export function applyShrinkage(composite: number, presentCount: number, k: number): number {
  if (k < 0) {
    throw new Error(`shadow-ranker: shrinkage k must be ≥ 0 (got ${k})`);
  }
  return (composite * presentCount) / (presentCount + k);
}

/**
 * Public entry — compute one `ShadowRankingRow` per included vector.
 * Filters by `passesInclusion`, computes composite + shrinkage, then
 * assigns long/short ranks reusing the live `(score, ticker)`
 * comparator semantics. Output ordering is NOT a contract — the rank
 * fields inside each row ARE.
 */
export function computeRankingsShadow(
  vectors: readonly ShadowVector[],
  params: ShadowVariantParams,
): ShadowRankingRow[] {
  const included: Array<{
    ticker: string;
    adjusted: number;
    composite: number;
    presentCount: number;
    gics_sector: string | null;
  }> = [];

  for (const vec of vectors) {
    if (!passesInclusion(vec, params.inclusionRule)) continue;
    const { composite, presentCount } = computeCompositeShadow(vec);
    const adjusted = applyShrinkage(composite, presentCount, params.k);
    included.push({
      ticker: vec.ticker,
      adjusted,
      composite,
      presentCount,
      gics_sector: vec.gics_sector,
    });
  }

  // Long rank: adjusted DESC, ticker ASC. Sort copies so the original
  // included[] preserves its (catalog-order) iteration sequence —
  // defense-in-depth against Array#sort being in-place.
  const longOrder = [...included].sort((a, b) => {
    if (a.adjusted !== b.adjusted) return b.adjusted - a.adjusted;
    return a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0;
  });
  const longRankByTicker = new Map<string, number>();
  for (let i = 0; i < longOrder.length; i++) {
    longRankByTicker.set(longOrder[i].ticker, i + 1);
  }

  // Short rank: adjusted ASC, ticker ASC.
  const shortOrder = [...included].sort((a, b) => {
    if (a.adjusted !== b.adjusted) return a.adjusted - b.adjusted;
    return a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0;
  });
  const shortRankByTicker = new Map<string, number>();
  for (let i = 0; i < shortOrder.length; i++) {
    shortRankByTicker.set(shortOrder[i].ticker, i + 1);
  }

  const out: ShadowRankingRow[] = [];
  for (const c of included) {
    const longRank = longRankByTicker.get(c.ticker);
    const shortRank = shortRankByTicker.get(c.ticker);
    if (longRank === undefined || shortRank === undefined) {
      throw new Error(`shadow-ranker: internal — rank assignment missing for ticker=${c.ticker}`);
    }
    out.push({
      ticker: c.ticker,
      adjusted: c.adjusted,
      composite: c.composite,
      presentCount: c.presentCount,
      long_rank: longRank,
      short_rank: shortRank,
      gics_sector: c.gics_sector,
    });
  }
  return out;
}

/**
 * Seed the shadow book — top-`size` per side. Mirrors `book-seeder.ts`
 * (no-overlap pre-persistence assertion) but typed against shadow
 * shapes + stamped with `RANKER_SOURCE_SHADOW`. Re-using the live
 * `seedBook` directly would require either coercing shadow rows into
 * `RankingRow` (lossy — adjusted vs composite/long_score/short_score)
 * or editing `book-seeder.ts` to accept a generic shape (forbidden by
 * scope). The thin shadow analogue is the right boundary.
 */
export function seedShadowBook(
  ranked: readonly ShadowRankingRow[],
  size: number = BOOK_SEED_SIZE,
): ShadowBookRow[] {
  const longRows: ShadowBookRow[] = [];
  for (const r of ranked) {
    if (r.long_rank >= 1 && r.long_rank <= size) {
      longRows.push({
        side: 'long',
        rank_within_side: r.long_rank,
        ticker: r.ticker,
        score: r.adjusted,
        ranker_source: RANKER_SOURCE_SHADOW,
      });
    }
  }
  longRows.sort((a, b) => a.rank_within_side - b.rank_within_side);

  const shortRows: ShadowBookRow[] = [];
  for (const r of ranked) {
    if (r.short_rank >= 1 && r.short_rank <= size) {
      shortRows.push({
        side: 'short',
        rank_within_side: r.short_rank,
        ticker: r.ticker,
        score: -r.adjusted,
        ranker_source: RANKER_SOURCE_SHADOW,
      });
    }
  }
  shortRows.sort((a, b) => a.rank_within_side - b.rank_within_side);

  // Pre-persistence overlap assertion (throw BEFORE returning so the
  // shadow orchestrator never reaches its UPSERT).
  const longSet = new Set(longRows.map((r) => r.ticker));
  const overlap: string[] = [];
  for (const r of shortRows) {
    if (longSet.has(r.ticker)) overlap.push(r.ticker);
  }
  if (overlap.length > 0) {
    overlap.sort();
    throw new ShadowBookOverlapError(overlap);
  }

  return [...longRows, ...shortRows];
}
