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
 * 3.3b-i model-gate (ACT-285):
 *   Before the fallback compute, the orchestrator READS
 *   `combiner_model_registry` for `status='active'` rows. Three branches:
 *     - 0 active rows  → fallback path UNCHANGED (byte-identical
 *                        rankings/book payloads as 3.0c-ii).
 *     - 1 active row   → failed: §6.1/§6.2 LOCK two models (long+short);
 *                        a single-side active is a partial-promotion
 *                        invariant violation — surface, do not score.
 *     - 2 active rows  → model path. Requires `ctx.loadArtifact` to be
 *                        wired (the Storage bucket provisioning is
 *                        3.3b-ii); if absent → failed with
 *                        `model_active_artifact_loader_not_wired_pending_3_3b_ii`.
 *                        With loader: load both LightGBM text dumps,
 *                        parse, score each included row's 16-feature
 *                        vector against long+short models, build
 *                        `RankingRow`s with composite ranker_source
 *                        `lgbm:<long_key>@<long_ver>/<short_key>@<short_ver>`,
 *                        then `seedBook` + persist via the SAME UPSERT
 *                        path as fallback.
 *
 *   The §4.3.5 critical-exclusion + coverage gates apply identically in
 *   both branches — names excluded by the assembler are excluded
 *   regardless of ranker. The `ranker_source <> 'count_normalized_fallback'`
 *   partial index keys off the stamped literal: fallback rows carry the
 *   literal verbatim; model rows carry the composite attribution
 *   string (any non-fallback literal hits the partial index).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from './paginated-read.ts';
import type { FeatureVectorRow } from './feature-assembler.ts';
import type { ExcludedReason } from './signal-catalog.ts';
import { computeRankings, IncludedRowInvariantError, type RankingRow } from './ranker.ts';
import { seedBook, BookOverlapError } from './book-seeder.ts';
import { RANKER_SOURCE_FALLBACK } from './ranker-constants.ts';
import {
  parseLgbmTreeDump,
  scoreLgbm,
  featuresToOrderedArray,
  LgbmTreeDumpParseError,
} from './lgbm-inference.ts';
import {
  ArtifactDownloadError,
  ArtifactUriParseError,
  FeatureOrderHashMismatchError,
  type LoadedModelArtifact,
} from './model-artifact-loader.ts';

/** Per-row chunk size for the bulk UPSERTs. Matches the 3.0b-ii
 * assembler — well under PostgREST URL/JSON payload limits. */
const UPSERT_CHUNK_SIZE = 500;

/** Side-keyed active-model row shape read from `combiner_model_registry`. */
interface ActiveModelRow {
  model_id: string;
  model_key: string;
  side: 'long' | 'short';
  version: string;
  artifact_uri: string | null;
}

/** Pluggable artifact loader — the orchestrator BRANCHES on registry
 *  state but defers the Storage fetch + DEC-064 Clause 4 hash refusal
 *  to this thin callback so the Storage download details + the
 *  hash-mismatch refusal live in `model-artifact-loader.ts`. Returns
 *  both the LightGBM text dump and the parsed sidecar meta.json
 *  (per DEC-065 Clause 2). Tests inject a fixture loader that returns
 *  a hand-crafted dump + matching meta with the live FEATURE_ORDER
 *  hash. Loader MUST throw `FeatureOrderHashMismatchError` on any
 *  hash mismatch (3.3b-ii-A / ACT-287). */
export type LoadModelArtifact = (artifact_uri: string) => Promise<LoadedModelArtifact>;

export interface RankerOrchestratorContext {
  supabase: SupabaseClient;
  operator_id: string;
  /** Optional — required only when an active model row exists. Absence
   *  with an active model row triggers the
   *  `model_active_artifact_loader_not_wired_pending_3_3b_ii` failure. */
  loadArtifact?: LoadModelArtifact;
}

export type RankerOrchestratorResult =
  | {
      outcome: 'completed';
      as_of_date: string;
      vectors_read: number;
      rankings_written: number;
      book_size_long: number;
      book_size_short: number;
      /** Either the fallback literal or the model-attribution composite. */
      ranker_source: string;
    }
  | {
      outcome: 'failed';
      as_of_date: string;
      vectors_read: number;
      rankings_written: number;
      book_size_long: number;
      book_size_short: number;
      ranker_source: string;
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

      // ── Step 2 (3.3b-i): model-gate. Read active models BEFORE the
      //    compute branch so the path-selection is single-point. ──
      let activeModels: ActiveModelRow[];
      try {
        const { data, error } = await ctx.supabase
          .from('combiner_model_registry')
          .select('model_id, model_key, side, version, artifact_uri')
          .eq('status', 'active');
        if (error) {
          throw new Error(error.message);
        }
        activeModels = (data ?? []) as ActiveModelRow[];
      } catch (e) {
        return {
          outcome: 'failed',
          as_of_date,
          vectors_read,
          rankings_written: 0,
          book_size_long: 0,
          book_size_short: 0,
          ranker_source: RANKER_SOURCE_FALLBACK,
          failure_reason: `combiner_model_registry read failed: ${(e as Error).message}`,
        };
      }

      // §6.1/§6.2 LOCK: a 1-side-active state is a partial-promotion
      // invariant violation — neither fallback NOR model is the correct
      // disposition. Surface and stop.
      if (activeModels.length === 1) {
        return {
          outcome: 'failed',
          as_of_date,
          vectors_read,
          rankings_written: 0,
          book_size_long: 0,
          book_size_short: 0,
          ranker_source: RANKER_SOURCE_FALLBACK,
          failure_reason:
            `only_one_side_active_violates_section_6_1_two_model_lock: ` +
            `side='${activeModels[0].side}' model_id=${activeModels[0].model_id}`,
        };
      }

      // Reject any unexpected duplicate-per-side (the partial-unique
      // index in MIG-099 makes this impossible at DB level; defense in
      // depth in case the index is dropped or the read races a write).
      if (activeModels.length > 2) {
        return {
          outcome: 'failed',
          as_of_date,
          vectors_read,
          rankings_written: 0,
          book_size_long: 0,
          book_size_short: 0,
          ranker_source: RANKER_SOURCE_FALLBACK,
          failure_reason:
            `combiner_model_registry returned ${activeModels.length} active rows ` +
            `(expected 0 or 2) — partial-unique-index invariant violated`,
        };
      }

      // ── Step 3: compute IN-MEMORY FIRST on the selected branch. ──
      // Both compute + seed must succeed BEFORE any persistence side-effect.
      let rankings: RankingRow[];
      let book;
      let ranker_source_literal: string;

      if (activeModels.length === 2) {
        // Model-active branch — both sides have an active LightGBM model.
        const longModel = activeModels.find((m) => m.side === 'long');
        const shortModel = activeModels.find((m) => m.side === 'short');
        if (!longModel || !shortModel) {
          return {
            outcome: 'failed',
            as_of_date,
            vectors_read,
            rankings_written: 0,
            book_size_long: 0,
            book_size_short: 0,
            ranker_source: RANKER_SOURCE_FALLBACK,
            failure_reason:
              `combiner_model_registry returned 2 active rows but sides ≠ {long, short}`,
          };
        }
        if (!ctx.loadArtifact) {
          return {
            outcome: 'failed',
            as_of_date,
            vectors_read,
            rankings_written: 0,
            book_size_long: 0,
            book_size_short: 0,
            ranker_source: RANKER_SOURCE_FALLBACK,
            failure_reason:
              `model_active_artifact_loader_not_wired_pending_3_3b_ii: ` +
              `long_model_id=${longModel.model_id} short_model_id=${shortModel.model_id}`,
          };
        }
        if (!longModel.artifact_uri || !shortModel.artifact_uri) {
          return {
            outcome: 'failed',
            as_of_date,
            vectors_read,
            rankings_written: 0,
            book_size_long: 0,
            book_size_short: 0,
            ranker_source: RANKER_SOURCE_FALLBACK,
            failure_reason:
              `active model missing artifact_uri: long='${longModel.artifact_uri}' ` +
              `short='${shortModel.artifact_uri}'`,
          };
        }

        try {
          const [longLoaded, shortLoaded] = await Promise.all([
            ctx.loadArtifact(longModel.artifact_uri),
            ctx.loadArtifact(shortModel.artifact_uri),
          ]);
          const longEnsemble = parseLgbmTreeDump(longLoaded.modelText);
          const shortEnsemble = parseLgbmTreeDump(shortLoaded.modelText);

          ranker_source_literal =
            `lgbm:${longModel.model_key}@${longModel.version}` +
            `/${shortModel.model_key}@${shortModel.version}`;

          rankings = computeModelRankings(
            included,
            longEnsemble,
            shortEnsemble,
            ranker_source_literal,
          );
          book = seedBook(rankings);
        } catch (e) {
          if (
            e instanceof BookOverlapError ||
            e instanceof IncludedRowInvariantError ||
            e instanceof LgbmTreeDumpParseError ||
            e instanceof FeatureOrderHashMismatchError ||
            e instanceof ArtifactDownloadError ||
            e instanceof ArtifactUriParseError
          ) {
            return {
              outcome: 'failed',
              as_of_date,
              vectors_read,
              rankings_written: 0,
              book_size_long: 0,
              book_size_short: 0,
              ranker_source: RANKER_SOURCE_FALLBACK,
              failure_reason: `${(e as Error).name}: ${(e as Error).message}`,
            };
          }
          return {
            outcome: 'failed',
            as_of_date,
            vectors_read,
            rankings_written: 0,
            book_size_long: 0,
            book_size_short: 0,
            ranker_source: RANKER_SOURCE_FALLBACK,
            failure_reason: `model_artifact_load_or_score_failed: ${(e as Error).message}`,
          };
        }
      } else {
        // Fallback branch — byte-identical to the 3.0c-ii path.
        ranker_source_literal = RANKER_SOURCE_FALLBACK;
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
        // DEC-070 clause (e) substrate dual-capture plumbing — daily writer = slot 0.
        intraday_slot: 0,
      }));

      let rankings_written = 0;
      for (let i = 0; i < rankingsPayload.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = rankingsPayload.slice(i, i + UPSERT_CHUNK_SIZE);
        const { error: upErr } = await ctx.supabase
          .from('combiner_rankings')
          .upsert(chunk, { onConflict: 'operator_id,as_of_date,ticker,intraday_slot' });
        if (upErr) {
          return {
            outcome: 'failed',
            as_of_date,
            vectors_read,
            rankings_written,
            book_size_long: 0,
            book_size_short: 0,
            ranker_source: ranker_source_literal,
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
        // DEC-070 clause (e) substrate dual-capture plumbing — daily writer = slot 0.
        intraday_slot: 0,
      }));

      let book_size_long = 0;
      let book_size_short = 0;
      for (let i = 0; i < bookPayload.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = bookPayload.slice(i, i + UPSERT_CHUNK_SIZE);
        const { error: upErr } = await ctx.supabase
          .from('combiner_book')
          .upsert(chunk, {
            onConflict: 'operator_id,as_of_date,side,rank_within_side,intraday_slot',
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
            ranker_source: ranker_source_literal,
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
        ranker_source: ranker_source_literal,
      };
    },
  };
}

/**
 * Score every included row against the long + short LightGBM ensembles
 * and emit `RankingRow`s. Two-model semantics: `long_score` comes from
 * the long ensemble, `short_score` from the short ensemble — they are
 * independent, not derived from a single composite (unlike the fallback
 * which sets `short_score = -long_score`).
 *
 * Ranking — long_rank: long_score DESC, ticker ASC; short_rank:
 * short_score DESC, ticker ASC. Both directions are DESC because each
 * model's output is already side-oriented: the long model is trained to
 * score "stronger long" higher; the short model is trained to score
 * "stronger short" higher. (The fallback's ASC-of-composite for the
 * short side is the equivalent operation for its negation contract.)
 *
 * Catalog-order iteration in `featuresToOrderedArray` (driven by the
 * `FEATURE_ORDER` constant) is the determinism guarantee for replay
 * diffing — IEEE-754 sum order matters and the projection is locked.
 */
function computeModelRankings(
  included: readonly FeatureVectorRow[],
  longEnsemble: ReturnType<typeof parseLgbmTreeDump>,
  shortEnsemble: ReturnType<typeof parseLgbmTreeDump>,
  ranker_source: string,
): RankingRow[] {
  const scored: Array<{
    ticker: string;
    long_score: number;
    short_score: number;
    gics_sector: string | null;
  }> = [];

  for (const row of included) {
    if (row.excluded_reason !== null) {
      throw new IncludedRowInvariantError(
        `model-ranker: ticker=${row.ticker} carries excluded_reason='${row.excluded_reason}' — ` +
          `caller must filter to included rows before invoking the model path`,
      );
    }
    const v = featuresToOrderedArray(row.features);
    scored.push({
      ticker: row.ticker,
      long_score: scoreLgbm(longEnsemble, v),
      short_score: scoreLgbm(shortEnsemble, v),
      gics_sector: row.gics_sector,
    });
  }

  // Long-side rank — long_score DESC, ticker ASC.
  const longOrder = [...scored].sort((a, b) => {
    if (a.long_score !== b.long_score) return b.long_score - a.long_score;
    return a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0;
  });
  const longRankByTicker = new Map<string, number>();
  for (let i = 0; i < longOrder.length; i++) {
    longRankByTicker.set(longOrder[i].ticker, i + 1);
  }

  // Short-side rank — short_score DESC, ticker ASC.
  const shortOrder = [...scored].sort((a, b) => {
    if (a.short_score !== b.short_score) return b.short_score - a.short_score;
    return a.ticker < b.ticker ? -1 : a.ticker > b.ticker ? 1 : 0;
  });
  const shortRankByTicker = new Map<string, number>();
  for (let i = 0; i < shortOrder.length; i++) {
    shortRankByTicker.set(shortOrder[i].ticker, i + 1);
  }

  const out: RankingRow[] = [];
  for (const s of scored) {
    const longRank = longRankByTicker.get(s.ticker)!;
    const shortRank = shortRankByTicker.get(s.ticker)!;
    out.push({
      ticker: s.ticker,
      long_score: s.long_score,
      short_score: s.short_score,
      long_rank: longRank,
      short_rank: shortRank,
      ranker_source,
      gics_sector: s.gics_sector,
    });
  }
  return out;
}