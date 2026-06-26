/**
 * Combiner SHADOW ranker orchestrator — FP-052 3.M-iii (ACT-243).
 *
 * Boundary layer between the pure 3.M-ii layer (`shadow-assembler.ts` +
 * `shadow-ranker.ts`) and Supabase persistence. Mirrors the 3.0c-ii
 * `ranker-orchestrator.ts` shape — gate-relaxed, multi-variant:
 *
 *   (1) Read active variants from `combiner_shadow_variant_config`
 *       (12 rows at FP-052 3.M-i seed).
 *   (2) Floor universe to the latest `universe_membership` snapshot
 *       ≤ as_of — replay-determinism guarantee (identical to
 *       `feature-assembler-orchestrator.ts`). Then load that snapshot's
 *       ticker set via `fetchAllRows`.
 *   (3) Read EXACT-as_of `signal_observations` via `fetchAllRows` —
 *       MANDATORY pagination (the 1000-row PostgREST cap silently
 *       collapsed the live assembler in 3.0b-ii; same defect would
 *       silently collapse the shadow book here).
 *   (4) `assembleShadowVectors(...)` over the universe-intersected
 *       observations — NO EXCLUSION at this layer; inclusion is the
 *       per-variant ranker's job.
 *   (5) For EACH active variant, compute `computeRankingsShadow` +
 *       `seedShadowBook` IN MEMORY. ALL 12 variants computed before
 *       any UPSERT. A `ShadowBookOverlapError` (or any thrown ranker
 *       error) returns `{outcome:'failed', failure_reason}` with ZERO
 *       partial write.
 *   (6) Chunked UPSERT into `combiner_book_shadow` with `onConflict:
 *       'operator_id,as_of_date,variant,side,rank_within_side,intraday_slot'`
 *       (DEC-070 clause a — additive intraday_slot superset PK rotation;
 *       daily writer sets slot=0 per clause e). Every row carries
 *       `computed_at = as_of.toISOString()` (DEC-034 (4) — no wall-clock
 *       in the orchestrator).
 *
 * Does NOT write `combiner_rankings_shadow` (deferred; book-only at
 * 3.M-iii — see `phase-3m-shadow-measurement.md`).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from './paginated-read.ts';
import { SIGNAL_IDS_ALL } from './signal-catalog.ts';
import {
  assembleShadowVectors,
  type ShadowObservationInput,
} from './shadow-assembler.ts';
import {
  computeRankingsShadow,
  seedShadowBook,
  ShadowBookOverlapError,
} from './shadow-ranker.ts';
import {
  RANKER_SOURCE_SHADOW,
  type InclusionRule,
} from './shadow-constants.ts';
import { BOOK_SEED_SIZE } from './ranker-constants.ts';

/** Per-row chunk size for the bulk UPSERT. Matches the 3.0c-ii ranker
 * orchestrator — well under PostgREST URL/JSON payload limits. With 12
 * variants × 40 rows ≤ 480 rows per as_of, a single chunk usually
 * suffices; the loop is defensive for future shrinkage/k growth. */
const UPSERT_CHUNK_SIZE = 500;

export interface ShadowRankerOrchestratorContext {
  supabase: SupabaseClient;
  operator_id: string;
}

/** Per-variant tally exposed in the result envelope for audit metadata. */
export interface PerVariantSize {
  variant: string;
  inclusion_rule: InclusionRule;
  k: number;
  long: number;
  short: number;
}

export type ShadowRankerOrchestratorResult =
  | {
      outcome: 'completed';
      as_of_date: string;
      variants_active: number;
      variants_written: number;
      universe_size: number;
      observations_read: number;
      vectors_assembled: number;
      total_book_rows: number;
      per_variant_sizes: PerVariantSize[];
      ranker_source: typeof RANKER_SOURCE_SHADOW;
    }
  | {
      outcome: 'failed';
      as_of_date: string;
      variants_active: number;
      variants_written: number;
      universe_size: number;
      observations_read: number;
      vectors_assembled: number;
      total_book_rows: number;
      per_variant_sizes: PerVariantSize[];
      ranker_source: typeof RANKER_SOURCE_SHADOW;
      failure_reason: string;
    };

type VariantConfigRow = {
  variant: string;
  inclusion_rule: InclusionRule;
  k: number;
};

type SignalObsRow = {
  ticker: string;
  signal_id: string;
  value: number | null;
  is_present: boolean;
  gics_sector: string | null;
};

/** Single in-memory book row pending UPSERT. */
interface PendingBookRow {
  operator_id: string;
  as_of_date: string;
  variant: string;
  inclusion_rule: InclusionRule;
  k: number;
  side: 'long' | 'short';
  rank_within_side: number;
  ticker: string;
  score: number;
  ranker_source: typeof RANKER_SOURCE_SHADOW;
  computed_at: string;
  /** DEC-070 clause (e) substrate dual-capture plumbing — daily writer = slot 0. */
  intraday_slot: number;
}

export function createShadowRankerOrchestrator(ctx: ShadowRankerOrchestratorContext) {
  return {
    async run(as_of: Date): Promise<ShadowRankerOrchestratorResult> {
      const as_of_iso = as_of.toISOString();
      const as_of_date = as_of_iso.slice(0, 10);

      const emptyResult = (
        failure_reason: string,
        partial: Partial<ShadowRankerOrchestratorResult> = {},
      ): ShadowRankerOrchestratorResult => ({
        outcome: 'failed',
        as_of_date,
        variants_active: 0,
        variants_written: 0,
        universe_size: 0,
        observations_read: 0,
        vectors_assembled: 0,
        total_book_rows: 0,
        per_variant_sizes: [],
        ranker_source: RANKER_SOURCE_SHADOW,
        ...partial,
        failure_reason,
      });

      // ── Step 1: active variants ──
      const { data: variantRows, error: variantErr } = await ctx.supabase
        .from('combiner_shadow_variant_config')
        .select('variant, inclusion_rule, k')
        .eq('active', true)
        .order('variant', { ascending: true });

      if (variantErr) {
        throw new Error(
          `shadow-ranker-orchestrator: combiner_shadow_variant_config read failed: ${variantErr.message}`,
        );
      }
      const variants = (variantRows ?? []) as VariantConfigRow[];
      if (variants.length === 0) {
        return emptyResult('no_active_variants');
      }

      // ── Step 2: universe floor ≤ as_of (replay-determinism) ──
      const { data: floorRows, error: floorErr } = await ctx.supabase
        .from('universe_membership')
        .select('as_of_date')
        .eq('operator_id', ctx.operator_id)
        .lte('as_of_date', as_of_date)
        .order('as_of_date', { ascending: false })
        .limit(1);
      if (floorErr) {
        throw new Error(
          `shadow-ranker-orchestrator: universe_membership floor read failed: ${floorErr.message}`,
        );
      }
      const floor_as_of_date =
        floorRows && floorRows.length > 0
          ? (floorRows[0] as { as_of_date: string }).as_of_date
          : null;
      if (floor_as_of_date === null) {
        return emptyResult('no_universe_snapshot_on_or_before_as_of', {
          variants_active: variants.length,
        });
      }

      let universeRows: Array<{ ticker: string }>;
      try {
        universeRows = await fetchAllRows<{ ticker: string }>((from, to) =>
          ctx.supabase
            .from('universe_membership')
            .select('ticker')
            .eq('operator_id', ctx.operator_id)
            .eq('as_of_date', floor_as_of_date)
            .range(from, to),
        );
      } catch (e) {
        throw new Error(
          `shadow-ranker-orchestrator: universe_membership rows read failed: ${(e as Error).message}`,
        );
      }
      const universeSet = new Set<string>(universeRows.map((r) => r.ticker));
      if (universeSet.size === 0) {
        return emptyResult('empty_universe_snapshot', {
          variants_active: variants.length,
        });
      }

      // ── Step 3: signal_observations EXACT as_of (MANDATORY pagination) ──
      let sigRows: SignalObsRow[];
      try {
        sigRows = await fetchAllRows<SignalObsRow>((from, to) =>
          ctx.supabase
            .from('signal_observations')
            .select('ticker, signal_id, value, is_present, gics_sector')
            .eq('operator_id', ctx.operator_id)
            .eq('as_of_date', as_of_date)
            .in('signal_id', [...SIGNAL_IDS_ALL])
            .range(from, to),
        );
      } catch (e) {
        throw new Error(
          `shadow-ranker-orchestrator: signal_observations read failed: ${(e as Error).message}`,
        );
      }

      // Intersect observations with the floored universe — non-universe
      // tickers are silently dropped (the gated-arm control would otherwise
      // measure stale names that the live ranker never sees).
      const observations: ShadowObservationInput[] = [];
      for (const r of sigRows) {
        if (!universeSet.has(r.ticker)) continue;
        observations.push({
          ticker: r.ticker,
          signal_id: r.signal_id,
          value: r.value,
          is_present: r.is_present,
          gics_sector: r.gics_sector,
        });
      }

      // ── Step 4: pure shadow assembly (NO exclusion) ──
      const vectors = assembleShadowVectors(observations);

      // ── Step 5: compute ALL 12 variants in memory FIRST ──
      const pendingBook: PendingBookRow[] = [];
      const perVariantSizes: PerVariantSize[] = [];
      try {
        for (const v of variants) {
          const ranked = computeRankingsShadow(vectors, {
            inclusionRule: v.inclusion_rule,
            k: v.k,
          });
          const seeded = seedShadowBook(ranked, BOOK_SEED_SIZE);
          let longCount = 0;
          let shortCount = 0;
          for (const b of seeded) {
            if (b.side === 'long') longCount++;
            else shortCount++;
            pendingBook.push({
              operator_id: ctx.operator_id,
              as_of_date,
              variant: v.variant,
              inclusion_rule: v.inclusion_rule,
              k: v.k,
              side: b.side,
              rank_within_side: b.rank_within_side,
              ticker: b.ticker,
              score: b.score,
              ranker_source: RANKER_SOURCE_SHADOW,
              computed_at: as_of_iso,
              // DEC-070 clause (e) — daily writer = slot 0.
              intraday_slot: 0,
            });
          }
          perVariantSizes.push({
            variant: v.variant,
            inclusion_rule: v.inclusion_rule,
            k: v.k,
            long: longCount,
            short: shortCount,
          });
        }
      } catch (e) {
        if (e instanceof ShadowBookOverlapError) {
          return emptyResult(`${e.name}: ${e.message}`, {
            variants_active: variants.length,
            universe_size: universeSet.size,
            observations_read: sigRows.length,
            vectors_assembled: vectors.length,
          });
        }
        // Unexpected throw — surface as failed (no partial write).
        return emptyResult(
          `unexpected_ranker_error: ${(e as Error).message}`,
          {
            variants_active: variants.length,
            universe_size: universeSet.size,
            observations_read: sigRows.length,
            vectors_assembled: vectors.length,
          },
        );
      }

      // ── Step 6: chunked UPSERT into combiner_book_shadow ──
      // DEC-070 clause (a): onConflict now includes intraday_slot.
      const onConflict =
        'operator_id,as_of_date,variant,side,rank_within_side,intraday_slot';
      for (let i = 0; i < pendingBook.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = pendingBook.slice(i, i + UPSERT_CHUNK_SIZE);
        const { error: upErr } = await ctx.supabase
          .from('combiner_book_shadow')
          .upsert(chunk, { onConflict });
        if (upErr) {
          return {
            outcome: 'failed',
            as_of_date,
            variants_active: variants.length,
            variants_written: 0,
            universe_size: universeSet.size,
            observations_read: sigRows.length,
            vectors_assembled: vectors.length,
            total_book_rows: 0,
            per_variant_sizes: perVariantSizes,
            ranker_source: RANKER_SOURCE_SHADOW,
            failure_reason: `combiner_book_shadow upsert failed at chunk offset ${i}: ${upErr.message}`,
          };
        }
      }

      return {
        outcome: 'completed',
        as_of_date,
        variants_active: variants.length,
        variants_written: variants.length,
        universe_size: universeSet.size,
        observations_read: sigRows.length,
        vectors_assembled: vectors.length,
        total_book_rows: pendingBook.length,
        per_variant_sizes: perVariantSizes,
        ranker_source: RANKER_SOURCE_SHADOW,
      };
    },
  };
}