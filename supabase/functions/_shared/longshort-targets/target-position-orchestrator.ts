/**
 * target-position-orchestrator — Step A boundary layer (FP-055 / ACT-302).
 *
 * Wraps the pure `computeTargets` kernel with Supabase I/O:
 *   (1) read combiner_book + combiner_rankings.gics_sector for (op, as_of)
 *   (2) compute IN-MEMORY (kernel) — throws on invariant violation
 *   (3) chunked UPSERT into longshort_target_positions
 *
 * Mirrors the 3.0c-ii ranker-orchestrator's shape (read → in-memory →
 * pre-persist invariant assertion → chunked UPSERT). Per DEC-034 (4),
 * `as_of.toISOString()` is the SOLE timestamp source threaded into both
 * the kernel (via `ts`) and the persisted `computed_at`.
 *
 * NO order submission, NO broker write, NO POST /v2/orders, NO
 * `longshort.execute` permission. Capital fetcher is the LIVE Alpaca
 * BrokerBuyingPowerFetcher when wired; a stub in dry-run mode.
 *
 * Pluggable capital fetcher (ctx.capitalFetcher) so the edge fn can
 * inject either AlpacaBuyingPowerFetcher (post-secret-provision) or a
 * stub-equity fetcher (Step G dry-run pending ALPACA_PAPER_KEY/SECRET).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BrokerBuyingPowerFetcher } from '../longshort-broker-interfaces.ts';
import {
  computeTargets,
  type BookReader,
  type BookRowInput,
  type TargetPosition,
} from './target-position-builder.ts';

const UPSERT_CHUNK_SIZE = 500;

export interface TargetPositionOrchestratorContext {
  supabase: SupabaseClient;
  operator_id: string;
  capitalFetcher: BrokerBuyingPowerFetcher;
  /** D4 — operator-configurable. Default 1.0. */
  allocationPct?: number;
}

export type TargetPositionOrchestratorResult =
  | {
      outcome: 'completed';
      as_of_date: string;
      book_size: number;
      book_size_long: number;
      book_size_short: number;
      capital_base: number;
      sizing_basis_value: number;
      per_name_notional: number;
      ranker_source: string;
      targets_written: number;
      allocation_pct: number;
      leverage: number;
    }
  | {
      outcome: 'empty_book';
      as_of_date: string;
      book_size: 0;
      book_size_long: 0;
      book_size_short: 0;
      capital_base: 0;
      sizing_basis_value: 0;
      per_name_notional: 0;
      ranker_source: null;
      targets_written: 0;
      allocation_pct: number;
      leverage: number;
    }
  | {
      outcome: 'failed';
      as_of_date: string;
      book_size: number;
      book_size_long: number;
      book_size_short: number;
      capital_base: number;
      sizing_basis_value: number;
      per_name_notional: number;
      ranker_source: string;
      targets_written: number;
      allocation_pct: number;
      leverage: number;
      failure_reason: string;
    };

type CBRow = {
  side: 'long' | 'short';
  rank_within_side: number;
  ticker: string;
  score: number;
  ranker_source: string;
  computed_at: string;
};

type CRRow = { ticker: string; gics_sector: string | null };

function makeBookReader(
  supabase: SupabaseClient,
  operatorId: string,
): BookReader {
  return {
    async readBook(_op: string, asOfDate: string): Promise<BookRowInput[]> {
      const { data: cbRows, error: cbErr } = await supabase
        .from('combiner_book')
        .select('side, rank_within_side, ticker, score, ranker_source, computed_at')
        .eq('operator_id', operatorId)
        .eq('as_of_date', asOfDate);
      if (cbErr) {
        throw new Error(`combiner_book read failed: ${cbErr.message}`);
      }
      const cb = (cbRows ?? []) as CBRow[];
      if (cb.length === 0) return [];

      // Pull gics_sector lineage from combiner_rankings for the §7.1 witness.
      // combiner_book has no gics_sector column; the rankings table does.
      const { data: crRows, error: crErr } = await supabase
        .from('combiner_rankings')
        .select('ticker, gics_sector')
        .eq('operator_id', operatorId)
        .eq('as_of_date', asOfDate);
      if (crErr) {
        // Sector lookup failure does NOT block compute — the witness
        // gracefully degrades to "no sector data, skip cap check". The
        // upstream invariant is what enforces the cap; this is witness
        // only (per Step A scope).
        const sectorByTicker = new Map<string, string | null>();
        return cb.map((r) => ({
          side: r.side,
          rank_within_side: r.rank_within_side,
          ticker: r.ticker,
          score: r.score,
          ranker_source: r.ranker_source,
          computed_at: r.computed_at,
          gics_sector: sectorByTicker.get(r.ticker) ?? null,
        }));
      }
      const sectorByTicker = new Map<string, string | null>();
      for (const r of (crRows ?? []) as CRRow[]) {
        sectorByTicker.set(r.ticker, r.gics_sector);
      }
      return cb.map((r) => ({
        side: r.side,
        rank_within_side: r.rank_within_side,
        ticker: r.ticker,
        score: r.score,
        ranker_source: r.ranker_source,
        computed_at: r.computed_at,
        gics_sector: sectorByTicker.get(r.ticker) ?? null,
      }));
    },
  };
}

export function createTargetPositionOrchestrator(
  ctx: TargetPositionOrchestratorContext,
) {
  return {
    async run(as_of: Date): Promise<TargetPositionOrchestratorResult> {
      const as_of_iso = as_of.toISOString();
      const as_of_date = as_of_iso.slice(0, 10);
      const allocationPct = ctx.allocationPct ?? 1.0;
      // Leverage is the paper-lock default (1.0); kernel asserts.
      const leverage = 1.0;

      const bookReader = makeBookReader(ctx.supabase, ctx.operator_id);

      // (1) + (2): compute IN-MEMORY FIRST. Throws on invariant.
      let result: Awaited<ReturnType<typeof computeTargets>>;
      try {
        result = await computeTargets({
          operatorId: ctx.operator_id,
          asOfDate: as_of_date,
          ts: as_of,
          capitalFetcher: ctx.capitalFetcher,
          bookReader,
          allocationPct,
          // leverage omitted → kernel default 1.0; assertion holds.
        });
      } catch (e) {
        return {
          outcome: 'failed',
          as_of_date,
          book_size: 0,
          book_size_long: 0,
          book_size_short: 0,
          capital_base: 0,
          sizing_basis_value: 0,
          per_name_notional: 0,
          ranker_source: '',
          targets_written: 0,
          allocation_pct: allocationPct,
          leverage,
          failure_reason: `compute_threw: ${(e as Error).name}: ${(e as Error).message}`,
        };
      }

      if (result.outcome === 'empty_book') {
        return {
          outcome: 'empty_book',
          as_of_date,
          book_size: 0,
          book_size_long: 0,
          book_size_short: 0,
          capital_base: 0,
          sizing_basis_value: 0,
          per_name_notional: 0,
          ranker_source: null,
          targets_written: 0,
          allocation_pct: allocationPct,
          leverage,
        };
      }

      // (3) chunked UPSERT into longshort_target_positions.
      const payload = result.targets.map((t: TargetPosition) => ({
        operator_id: t.operator_id,
        as_of_date: t.as_of_date,
        side: t.side,
        ticker: t.ticker,
        target_notional: t.target_notional,
        target_shares: t.target_shares,
        allocation_pct: t.allocation_pct,
        leverage: t.leverage,
        sizing_basis: t.sizing_basis,
        sizing_basis_value: t.sizing_basis_value,
        capital_base: t.capital_base,
        book_size: t.book_size,
        ranker_source: t.ranker_source,
        book_ref_computed_at: t.book_ref_computed_at,
        computed_at: t.computed_at,
      }));

      let targets_written = 0;
      for (let i = 0; i < payload.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = payload.slice(i, i + UPSERT_CHUNK_SIZE);
        const { error: upErr } = await ctx.supabase
          .from('longshort_target_positions')
          .upsert(chunk, { onConflict: 'operator_id,as_of_date,ticker' });
        if (upErr) {
          return {
            outcome: 'failed',
            as_of_date,
            book_size: result.book_size,
            book_size_long: result.book_size_long,
            book_size_short: result.book_size_short,
            capital_base: result.capital_base,
            sizing_basis_value: result.sizing_basis_value,
            per_name_notional: result.per_name_notional,
            ranker_source: result.ranker_source,
            targets_written,
            allocation_pct: allocationPct,
            leverage,
            failure_reason: `longshort_target_positions upsert failed at chunk offset ${i}: ${upErr.message}`,
          };
        }
        targets_written += chunk.length;
      }

      return {
        outcome: 'completed',
        as_of_date,
        book_size: result.book_size,
        book_size_long: result.book_size_long,
        book_size_short: result.book_size_short,
        capital_base: result.capital_base,
        sizing_basis_value: result.sizing_basis_value,
        per_name_notional: result.per_name_notional,
        ranker_source: result.ranker_source,
        targets_written,
        allocation_pct: allocationPct,
        leverage,
      };
    },
  };
}