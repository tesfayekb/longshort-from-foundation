/**
 * Combiner fallback ranker — FP-052 (3.0c-i / ACT-238).
 *
 * PURE LAYER (no Supabase, no clock, no wall-clock leakage, no -999
 * sentinel, no randomness). Reads INCLUDED-only typed-absence feature
 * vectors produced by `feature-assembler.ts` and emits one
 * `RankingRow` per ticker. The orchestrator (3.0c-ii — not in this
 * commit) handles the `combiner_feature_vectors` SELECT, the
 * `combiner_rankings` UPSERT, and the chunked persistence shape.
 *
 * Formula — CROSSWIND §6.4 (v0.9 count-normalized fallback):
 *
 *   composite = ( Σ_critical z_i  +  Σ_non_critical (is_present_i ? value_i : 0) )
 *               / max(1, Σ is_present_i)
 *
 * Critical signals (Signals #6 + #7) are bare numerics on the included
 * row (the §4.3.5 gates guarantee this; `feature-assembler.ts` throws
 * if the invariant is broken). Their effective `is_present` is 1.
 * Non-critical signals contribute `value_i` only when `is_present_i===1`;
 * the missing-value half of the typed-absence pair is `null` and MUST
 * NOT be coerced or read for arithmetic — guarding on `is_present_i`
 * (not multiplying by it) prevents `null * 0 = NaN`-class drift.
 *
 * Determinism contract (load-bearing):
 *
 *   (a) Summation iterates `SIGNAL_IDS_ALL` in catalog order. IEEE-754
 *       float addition is non-associative — the catalog order is the
 *       determinism guarantee for byte-identical re-runs / replay.
 *   (b) Rank assignment uses the (composite, ticker) sort key:
 *         long_rank  → composite DESC, ticker ASC
 *         short_rank → composite ASC,  ticker ASC
 *       Ties break by ticker-ASC (NOT by insertion order, NOT by
 *       Array#sort browser-specific stable-sort behavior). Ranks are
 *       computed in TypeScript — never delegated to a Postgres
 *       ORDER BY (would couple replay determinism to PG collation).
 *
 * `ranker_source = RANKER_SOURCE_FALLBACK` on every emitted row —
 * stamps the documented degraded path (CROSSWIND §6.4) for the
 * partial-index attestation.
 */

import type { FeatureVectorRow } from './feature-assembler.ts';
import {
  SIGNAL_IDS_CRITICAL,
  SIGNAL_IDS_NON_CRITICAL,
  SIGNAL_IDS_ALL,
  nonCriticalIsPresentKey,
  nonCriticalValueKey,
  type SignalId,
} from './signal-catalog.ts';
import { RANKER_SOURCE_FALLBACK } from './ranker-constants.ts';

/**
 * One emitted ranking row per included ticker. Shape mirrors the
 * `combiner_rankings` table (MIG-099 sibling 20260616103102) — the
 * orchestrator UPSERTs these as-is (modulo operator_id / as_of_date
 * which the orchestrator threads in from the caller-supplied as_of).
 */
export interface RankingRow {
  ticker: string;
  long_score: number;
  short_score: number;
  long_rank: number;
  short_rank: number;
  /** Attribution literal stamped onto the persisted row. The fallback
   *  path stamps {@link RANKER_SOURCE_FALLBACK} verbatim; the 3.3b-i
   *  model-active path stamps a composite `lgbm:<long_model>@<long_ver>/<short_model>@<short_ver>`
   *  literal — see `ranker-orchestrator.ts` model-gate branch. The
   *  `<> 'count_normalized_fallback'` partial index keys off this. */
  ranker_source: string;
  gics_sector: string | null;
}

/**
 * Typed error thrown when an INCLUDED feature vector violates the
 * §4.3.5 invariant (criticals must be bare numerics on included rows).
 * The pure layer throws rather than silently coercing — surfaces as an
 * orchestrator error, not a NaN-poisoned ranking.
 */
export class IncludedRowInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IncludedRowInvariantError';
  }
}

/**
 * Compute the composite score for one included feature vector.
 * Exported for test reach; the public entry is `computeRankings`.
 */
export function computeComposite(row: FeatureVectorRow): {
  composite: number;
  presentCount: number;
} {
  if (row.excluded_reason !== null) {
    throw new IncludedRowInvariantError(
      `ranker: ticker=${row.ticker} carries excluded_reason='${row.excluded_reason}' — ` +
        `caller must filter to included rows before invoking computeRankings`,
    );
  }

  let numerator = 0;
  let presentCount = 0;

  // Iterate catalog order — float addition is non-associative; the
  // SIGNAL_IDS_ALL sequence is the determinism guarantee.
  for (const id of SIGNAL_IDS_ALL as readonly SignalId[]) {
    if ((SIGNAL_IDS_CRITICAL as readonly string[]).includes(id)) {
      const v = row.features[id];
      if (v === null || v === undefined || typeof v !== 'number' || !Number.isFinite(v)) {
        throw new IncludedRowInvariantError(
          `ranker: ticker=${row.ticker} critical signal '${id}' is not a finite number ` +
            `(value=${JSON.stringify(v)}); §4.3.5 gates should have excluded this row`,
        );
      }
      numerator += v;
      presentCount += 1;
      continue;
    }

    // Non-critical — typed-absence pair. Guard on is_present; never
    // multiply by it (the absent half is `null`, never a numeric 0).
    const isPresent = row.features[nonCriticalIsPresentKey(id as typeof SIGNAL_IDS_NON_CRITICAL[number])];
    if (isPresent === 1) {
      const v = row.features[nonCriticalValueKey(id as typeof SIGNAL_IDS_NON_CRITICAL[number])];
      if (v === null || v === undefined || typeof v !== 'number' || !Number.isFinite(v)) {
        throw new IncludedRowInvariantError(
          `ranker: ticker=${row.ticker} non-critical signal '${id}' is_present=1 but ` +
            `value=${JSON.stringify(v)} is not a finite number — typed-absence contract broken`,
        );
      }
      numerator += v;
      presentCount += 1;
    } else if (isPresent !== 0) {
      throw new IncludedRowInvariantError(
        `ranker: ticker=${row.ticker} non-critical signal '${id}' is_present=${JSON.stringify(isPresent)} ` +
          `(expected 0 or 1) — typed-absence contract broken`,
      );
    }
  }

  const composite = numerator / Math.max(1, presentCount);
  return { composite, presentCount };
}

/**
 * Public entry — compute one `RankingRow` per included feature vector.
 * Caller passes ONLY included rows (`excluded_reason === null`); a
 * mixed array trips `IncludedRowInvariantError` in `computeComposite`.
 *
 * Output ordering is NOT a contract — the orchestrator UPSERT keys on
 * `(operator_id, as_of_date, ticker)`. The (score, ticker) ranks
 * inside each row ARE the contract.
 */
export function computeRankings(includedVectors: readonly FeatureVectorRow[]): RankingRow[] {
  // Per-row composite (with catalog-order summation).
  const composites: Array<{ ticker: string; composite: number; gics_sector: string | null }> = [];
  for (const row of includedVectors) {
    const { composite } = computeComposite(row);
    composites.push({ ticker: row.ticker, composite, gics_sector: row.gics_sector });
  }

  // Long rank: composite DESC, ticker ASC. We sort a copy of the index
  // set so the original `composites` array order is preserved for the
  // short-side sort (defense-in-depth — Array#sort is in-place).
  const longOrder = [...composites].sort((a, b) => {
    if (a.composite !== b.composite) return b.composite - a.composite; // DESC
    return a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0;     // ticker ASC
  });
  const longRankByTicker = new Map<string, number>();
  for (let i = 0; i < longOrder.length; i++) {
    longRankByTicker.set(longOrder[i].ticker, i + 1);
  }

  // Short rank: composite ASC, ticker ASC.
  const shortOrder = [...composites].sort((a, b) => {
    if (a.composite !== b.composite) return a.composite - b.composite; // ASC
    return a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0;     // ticker ASC
  });
  const shortRankByTicker = new Map<string, number>();
  for (let i = 0; i < shortOrder.length; i++) {
    shortRankByTicker.set(shortOrder[i].ticker, i + 1);
  }

  // Emit one row per ticker in the input order (orchestrator-friendly
  // — same iteration order as the input vector array).
  const out: RankingRow[] = [];
  for (const c of composites) {
    const longRank = longRankByTicker.get(c.ticker);
    const shortRank = shortRankByTicker.get(c.ticker);
    if (longRank === undefined || shortRank === undefined) {
      // Unreachable — every ticker is inserted into both maps above.
      // Guarded for static-analysis exhaustiveness only.
      throw new IncludedRowInvariantError(
        `ranker: internal — rank assignment missing for ticker=${c.ticker}`,
      );
    }
    out.push({
      ticker: c.ticker,
      long_score: c.composite,
      short_score: -c.composite,
      long_rank: longRank,
      short_rank: shortRank,
      ranker_source: RANKER_SOURCE_FALLBACK,
      gics_sector: c.gics_sector,
    });
  }
  return out;
}
