/**
 * Combiner ranker orchestrator — FP-052 3.0c-ii (ACT-239).
 *
 * Boundary layer between the pure ranker (`ranker.ts`) + book seeder
 * (`book-seeder.ts`) and Supabase persistence. Mirrors the 3.0b-ii
 * `feature-assembler-orchestrator.ts` shape:
 *
 *   (1) Read `combiner_feature_vectors` for (operator_id, as_of_date)
 *       WHERE excluded_reason IS NULL — only INCLUDED rows feed the
 *       fallback ranker (per §4.3.5 gate; the pure ranker also
 *       defends with `IncludedRowInvariantError`). Paginated via
 *       `fetchAllRows(...)` to defeat PostgREST's 1000-row cap.
 *   (2) Compute IN-MEMORY FIRST: `computeRankings(included)` then
 *       `seedBook(rankings)`. BOTH must complete (and their typed
 *       invariant errors throw) BEFORE any write. A thrown
 *       `BookOverlapError` / `IncludedRowInvariantError` returns
 *       `{outcome:'failed', failure_reason}` with ZERO partial write.
 *   (3) Chunked UPSERT into `combiner_rankings`
 *       ON CONFLICT (operator_id, as_of_date, ticker) and
 *       `combiner_book` ON CONFLICT (operator_id, as_of_date, side,
 *       rank_within_side). Both carry `computed_at = as_of.toISOString()`
 *       — explicitly overrides the schema DEFAULT now() per DEC-034 (4).
 *
 * Does NOT touch `combiner_model_registry`. The registry is the 3.2
 * LightGBM-promotion surface; the fallback ranker is the documented
 * degraded path (CROSSWIND §6.4 v0.9) and the `ranker_source =
 * 'count_normalized_fallback'` literal — stamped on every emitted row
 * — is what excludes those rows from the model-active partial index.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from './paginated-read.ts';
import type { FeatureVectorRow } from './feature-assembler.ts';
import type { ExcludedReason } from './signal-catalog.ts';
import { computeRankings, IncludedRowInvariantError } from './ranker.ts';
import { seedBook, BookOverlapError } from './book-seeder.ts';
import { RANKER_SOURCE_FALLBACK } from './ranker-constants.ts';

/** Per-row chunk size for the bulk UPSERTs. Matches the 3.0b-ii
 * assembler — well under PostgREST URL/JSON payload limits. */
const UPSERT_CHUNK_SIZE = 500;

export interface RankerOrchestratorContext {
  supabase: SupabaseClient;
  operator_id: string;
}

export type RankerOrchestratorResult =
  | {
      outcome: 'completed';
      as_of_date: string;
      vectors_read: number;
      rankings_written: number;
      book_size_long: number;
      book_size_short: number;
      ranker_source: typeof RANKER_SOURCE_FALLBACK;
    }
  | {
      outcome: 'failed';
      as_of_date: string;
      vectors_read: number;
      rankings_written: number;
      book_size_long: number;
      book_size_short: number;
      ranker_source: typeof RANKER_SOURCE_FALLBACK;
      failure_reason: string;
    };

/** Row shape of the `combiner_feature_vectors` read. Mirrors the
 * persisted columns the pure ranker consumes via `FeatureVectorRow`. */
type CFVReadRow = {
  ticker: string;
  features: Record<string, number | null>;
  gics_sector: string | null;
  coverage_count: number;
  excluded_reason: ExcludedReason | null;
};

export function createRankerOrchestrator(ctx: RankerOrchestratorContext) {
  return {
    async run(as_of: Date): Promise<RankerOrchestratorResult> {
      // Single as_of-derived timestamp; never wall-clock (DEC-034 (4)).
      const as_of_iso = as_of.toISOString();
      const as_of_date = as_of_iso.slice(0, 10);

      // ── Step 1: read INCLUDED feature vectors (paginated, capped-safe) ──
      let cfvRows: CFVReadRow[];
      try {
        cfvRows = await fetchAllRows<CFVReadRow>((from, to) =>
          ctx.supabase
            .from('combiner_feature_vectors')
            .select('ticker, features, gics_sector, coverage_count, excluded_reason')
            .eq('operator_id', ctx.operator_id)
            .eq('as_of_date', as_of_date)
            .is('excluded_reason', null)
            .range(from, to),
        );
      } catch (e) {
        throw new Error(
          `ranker-orchestrator: combiner_feature_vectors read failed: ${(e as Error).message}`,
        );
      }

      const vectors_read = cfvRows.length;

      if (vectors_read === 0) {
        return {
          outcome: 'failed',
          as_of_date,
          vectors_read: 0,
          rankings_written: 0,
          book_size_long: 0,
          book_size_short: 0,
          ranker_source: RANKER_SOURCE_FALLBACK,
          failure_reason: 'no_included_vectors',
        };
      }

      // Materialize as FeatureVectorRow for the pure layer. operator_id
      // + as_of_date are threaded in from orchestrator scope.
      const included: FeatureVectorRow[] = cfvRows.map((r) => ({
        operator_id: ctx.operator_id,
        as_of_date,
        ticker: r.ticker,
        features: r.features,
        gics_sector: r.gics_sector,
        coverage_count: r.coverage_count,
        excluded_reason: r.excluded_reason,
      }));

      // ── Step 2: pure compute IN-MEMORY FIRST (no writes yet) ──
      // Both calls must succeed BEFORE any persistence side-effect.
      let rankings;
      let book;
      try {
        rankings = computeRankings(included);
        book = seedBook(rankings);
      } catch (e) {
        if (e instanceof BookOverlapError || e instanceof IncludedRowInvariantError) {
          return {
            outcome: 'failed',
            as_of_date,
            vectors_read,
            rankings_written: 0,
            book_size_long: 0,
            book_size_short: 0,
            ranker_source: RANKER_SOURCE_FALLBACK,
            failure_reason: `${e.name}: ${e.message}`,
          };
        }
        throw e;
      }

      // ── Step 3: persist rankings (chunked UPSERT; computed_at = as_of) ──
      const rankingsPayload = rankings.map((r) => ({
        operator_id: ctx.operator_id,
        as_of_date,
        ticker: r.ticker,
        long_score: r.long_score,
        short_score: r.short_score,
        long_rank: r.long_rank,
        short_rank: r.short_rank,
        ranker_source: r.ranker_source,
        gics_sector: r.gics_sector,
        computed_at: as_of_iso,
      }));

      let rankings_written = 0;
      for (let i = 0; i < rankingsPayload.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = rankingsPayload.slice(i, i + UPSERT_CHUNK_SIZE);
        const { error: upErr } = await ctx.supabase
          .from('combiner_rankings')
          .upsert(chunk, { onConflict: 'operator_id,as_of_date,ticker' });
        if (upErr) {
          return {
            outcome: 'failed',
            as_of_date,
            vectors_read,
            rankings_written,
            book_size_long: 0,
            book_size_short: 0,
            ranker_source: RANKER_SOURCE_FALLBACK,
            failure_reason: `combiner_rankings upsert failed at chunk offset ${i}: ${upErr.message}`,
          };
        }
        rankings_written += chunk.length;
      }

      // ── Step 4: persist book (chunked UPSERT; computed_at = as_of) ──
      const bookPayload = book.map((b) => ({
        operator_id: ctx.operator_id,
        as_of_date,
        side: b.side,
        rank_within_side: b.rank_within_side,
        ticker: b.ticker,
        score: b.score,
        ranker_source: b.ranker_source,
        computed_at: as_of_iso,
      }));

      let book_size_long = 0;
      let book_size_short = 0;
      for (let i = 0; i < bookPayload.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = bookPayload.slice(i, i + UPSERT_CHUNK_SIZE);
        const { error: upErr } = await ctx.supabase
          .from('combiner_book')
          .upsert(chunk, {
            onConflict: 'operator_id,as_of_date,side,rank_within_side',
          });
        if (upErr) {
          // Tally already-written rows from prior chunks for forensic value.
          for (const row of bookPayload.slice(0, i)) {
            if (row.side === 'long') book_size_long++;
            else book_size_short++;
          }
          return {
            outcome: 'failed',
            as_of_date,
            vectors_read,
            rankings_written,
            book_size_long,
            book_size_short,
            ranker_source: RANKER_SOURCE_FALLBACK,
            failure_reason: `combiner_book upsert failed at chunk offset ${i}: ${upErr.message}`,
          };
        }
      }
      for (const row of bookPayload) {
        if (row.side === 'long') book_size_long++;
        else book_size_short++;
      }

      return {
        outcome: 'completed',
        as_of_date,
        vectors_read,
        rankings_written,
        book_size_long,
        book_size_short,
        ranker_source: RANKER_SOURCE_FALLBACK,
      };
    },
  };
}