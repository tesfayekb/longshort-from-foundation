/**
 * shap-attribution-writer — FP-067 W1 fallback per-signal decomposition
 * capture sidecar (MIG-150; ACT-433).
 *
 * INVARIANT (absolute separation, ACT-419 precedent): this writer does
 * NOT share rows with the ranker orchestrator, does NOT thread through
 * its persistence path, does NOT touch the pure `computeComposite`
 * layer. It performs INDEPENDENT reads of `combiner_book` (source of
 * truth for the booked side) and `combiner_feature_vectors` (source of
 * the included row + `gated_signals`), decomposes the linear fallback
 * composite EXACTLY per signal, and upserts one row per booked
 * (op, as_of, ticker, slot, side) into `combiner_shap_attribution`.
 *
 * Fire-and-forget: callers MUST wrap in try/catch so failure cannot
 * propagate into the compose/rank/book money-path (R1). NO fabricated
 * numerics — gated-null / absent-non-critical signals contribute
 * typed-nothing (absent key in the `attributions` map), never a
 * fabricated zero (R2). Injected clock only (R3). Decomposition is
 * EXACT under the linear fallback — Σ per-signal contributions ==
 * composite by construction (contribution_i = raw_i / max(1, presentCount)
 * so Σ = numerator / denom = composite) (R4).
 *
 * SCOPE: fallback branch only. The LGBM-active path uses a different
 * (non-linear) attribution surface and is W2 (SHAP tree-path). Callers
 * MUST gate the invocation on `ranker_source === RANKER_SOURCE_FALLBACK`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from './paginated-read.ts';
import {
  SIGNAL_IDS_CRITICAL,
  SIGNAL_IDS_FALLBACK_SUM,
  SIGNAL_IDS_NON_CRITICAL,
  nonCriticalIsPresentKey,
  nonCriticalValueKey,
  type SignalId,
} from './signal-catalog.ts';
import { productionClock, type ClockReader } from '../longshort-clock.ts';

/** Sub-shape of a `combiner_feature_vectors` row consumed by the decomposition. */
export interface DecompositionInput {
  ticker: string;
  features: Record<string, number | null>;
  /** DEC-071 sub-step 3c sanctioned-null marker (critical signals). */
  gated_signals: string[] | null;
}

/** Typed error thrown when a row's INCLUDED invariant is violated
 *  (bug-null on a critical that is NOT gated, or a non-finite value
 *  where is_present=1 claims a number). Mirrors `IncludedRowInvariantError`
 *  in the pure ranker — the sidecar refuses to fabricate a decomposition
 *  rather than silently coerce. */
export class ShapDecompositionInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShapDecompositionInvariantError';
  }
}

/**
 * PURE decomposition of the linear fallback composite for ONE included
 * feature-vector row. Byte-identical arithmetic to `computeComposite`
 * in `ranker.ts` (same catalog-order iteration, same denominator, same
 * gated-null semantics) so Σ contributions == composite is exact by
 * construction. Contributions map contains ONLY present signals —
 * gated-null (per DEC-071 3c) and absent non-critical (typed-absence
 * `is_present=0`) signals are OMITTED (typed-nothing, never fabricated 0).
 */
export function decomposeFallbackComposite(row: DecompositionInput): {
  composite: number;
  present_count: number;
  contributions: Record<string, number>;
} {
  const gatedSet =
    row.gated_signals && row.gated_signals.length > 0
      ? new Set<string>(row.gated_signals)
      : null;

  const rawContrib: Record<string, number> = {};
  let numerator = 0;
  let presentCount = 0;

  for (const id of SIGNAL_IDS_FALLBACK_SUM as readonly SignalId[]) {
    if ((SIGNAL_IDS_CRITICAL as readonly string[]).includes(id)) {
      const v = row.features[id];
      if (v === null || v === undefined || typeof v !== 'number' || !Number.isFinite(v)) {
        if (v === null && gatedSet !== null && gatedSet.has(id)) {
          // Sanctioned gated-null — DEC-071 3c per-name DEC-074 semantics.
          // Numerator + presentCount BOTH unchanged; contribution OMITTED
          // from the map (typed-nothing, not fabricated 0).
          continue;
        }
        throw new ShapDecompositionInvariantError(
          `shap-decompose: ticker=${row.ticker} critical signal '${id}' is not a finite number ` +
            `(value=${JSON.stringify(v)}); §4.3.5 gates should have excluded this row`,
        );
      }
      rawContrib[id] = v;
      numerator += v;
      presentCount += 1;
      continue;
    }

    const nc = id as typeof SIGNAL_IDS_NON_CRITICAL[number];
    const isPresent = row.features[nonCriticalIsPresentKey(nc)];
    if (isPresent === 1) {
      const v = row.features[nonCriticalValueKey(nc)];
      if (v === null || v === undefined || typeof v !== 'number' || !Number.isFinite(v)) {
        throw new ShapDecompositionInvariantError(
          `shap-decompose: ticker=${row.ticker} non-critical signal '${id}' is_present=1 but ` +
            `value=${JSON.stringify(v)} is not a finite number — typed-absence contract broken`,
        );
      }
      rawContrib[id] = v;
      numerator += v;
      presentCount += 1;
    } else if (isPresent !== 0 && isPresent !== null && isPresent !== undefined) {
      throw new ShapDecompositionInvariantError(
        `shap-decompose: ticker=${row.ticker} non-critical signal '${id}' is_present=` +
          `${JSON.stringify(isPresent)} (expected 0 or 1) — typed-absence contract broken`,
      );
    }
    // else: absent-non-critical (is_present=0/null). Contribution OMITTED — typed-nothing.
  }

  const denom = Math.max(1, presentCount);
  const composite = numerator / denom;
  const contributions: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawContrib)) {
    contributions[k] = v / denom;
  }
  return { composite, present_count: presentCount, contributions };
}

/** Chunk size for the bulk UPSERT — mirrors orchestrator constants. */
const SHAP_UPSERT_CHUNK_SIZE = 500;

interface BookRow {
  ticker: string;
  side: 'long' | 'short';
}

interface FeatureVectorReadRow {
  ticker: string;
  features: Record<string, number | null>;
  gated_signals: string[] | null;
}

export interface ShapAttributionSidecarInput {
  operator_id: string;
  as_of_date: string;
  intraday_slot: number;
  /** Optional injected clock (R3). Defaults to productionClock at the
   *  top-of-call-chain sanctioned exception. */
  clock?: ClockReader;
}

export interface ShapAttributionSidecarResult {
  written: number;
  booked_names: number;
  vectors_read: number;
  computed_at: string;
}

/**
 * Fallback per-signal decomposition sidecar. INDEPENDENT reads +
 * fire-and-forget UPSERT. Caller MUST wrap in try/catch — failure here
 * cannot propagate to the money-path (R1).
 */
export async function writeFallbackShapAttributions(
  supabase: SupabaseClient,
  input: ShapAttributionSidecarInput,
): Promise<ShapAttributionSidecarResult> {
  const clock = input.clock ?? productionClock;
  const computed_at = clock.getWallClockTs().toISOString();

  // Step 1 — independent read of the booked side per name at this slot.
  const bookResp = await supabase
    .from('combiner_book')
    .select('ticker, side')
    .eq('operator_id', input.operator_id)
    .eq('as_of_date', input.as_of_date)
    .eq('intraday_slot', input.intraday_slot);
  if (bookResp.error) {
    throw new Error(
      `writeFallbackShapAttributions: combiner_book read failed: ${bookResp.error.message}`,
    );
  }
  const bookRows = (bookResp.data ?? []) as BookRow[];
  if (bookRows.length === 0) {
    return { written: 0, booked_names: 0, vectors_read: 0, computed_at };
  }
  const sideByTicker = new Map<string, 'long' | 'short'>();
  for (const b of bookRows) sideByTicker.set(b.ticker, b.side);

  // Step 2 — independent read of the INCLUDED feature vectors at this slot.
  const vectorRows = await fetchAllRows<FeatureVectorReadRow>((from, to) =>
    supabase
      .from('combiner_feature_vectors')
      .select('ticker, features, gated_signals')
      .eq('operator_id', input.operator_id)
      .eq('as_of_date', input.as_of_date)
      .eq('intraday_slot', input.intraday_slot)
      .is('excluded_reason', null)
      .range(from, to),
  );

  // Step 3 — decompose ONLY booked names. Non-booked included rows are
  // scored but not attributed (they don't affect P&L, so they don't
  // enter FP-058's per-signal ROI ledger).
  const inserts: Array<Record<string, unknown>> = [];
  for (const v of vectorRows) {
    const side = sideByTicker.get(v.ticker);
    if (!side) continue;
    const { contributions } = decomposeFallbackComposite({
      ticker: v.ticker,
      features: v.features,
      gated_signals: v.gated_signals ?? null,
    });
    inserts.push({
      operator_id: input.operator_id,
      as_of_date: input.as_of_date,
      ticker: v.ticker,
      intraday_slot: input.intraday_slot,
      side,
      attributions: contributions,
      model_id: null, // fallback path — no LGBM model backs this row.
      computed_at,
    });
  }

  if (inserts.length === 0) {
    return { written: 0, booked_names: bookRows.length, vectors_read: vectorRows.length, computed_at };
  }

  // Chunked UPSERT — idempotent on the rotated 5-tuple PK (MIG-150).
  let written = 0;
  for (let i = 0; i < inserts.length; i += SHAP_UPSERT_CHUNK_SIZE) {
    const chunk = inserts.slice(i, i + SHAP_UPSERT_CHUNK_SIZE);
    const upResp = await supabase
      .from('combiner_shap_attribution')
      .upsert(chunk, {
        onConflict: 'operator_id,as_of_date,ticker,intraday_slot,side',
      });
    if (upResp.error) {
      throw new Error(
        `writeFallbackShapAttributions: upsert failed at chunk offset ${i}: ${upResp.error.message}`,
      );
    }
    written += chunk.length;
  }

  return {
    written,
    booked_names: bookRows.length,
    vectors_read: vectorRows.length,
    computed_at,
  };
}