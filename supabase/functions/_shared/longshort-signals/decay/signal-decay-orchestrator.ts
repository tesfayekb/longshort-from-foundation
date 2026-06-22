/**
 * Per-signal close-to-next-open decay accrual orchestrator
 * (MIG-114 / ACT-279).
 *
 * Boundary layer between the pure `signal-decay-accruer.ts` and Supabase
 * + Polygon. Mirrors `longshort-combiner/forward-return-orchestrator.ts`
 * disciplines VERBATIM:
 *   - `fetchAllRows` on EVERY read (PostgREST 1000-row cap defeat).
 *   - `computed_at = as_of_run.toISOString()` from the INJECTED clock
 *     (DEC-034 (4) / FP-047 — no Date.now()/new Date() anywhere in this
 *     module; the handler reads the wall-clock at top-of-call-chain).
 *   - Per-ticker fetch failures stored as `'error'` in the bar bundle —
 *     one bad ticker NEVER crashes the run.
 *   - All rows computed in memory BEFORE the first UPSERT.
 *   - NEVER 0 / -999; typed-absence is NULL per the table's typed-absence
 *     CHECK; the `success` status is RESERVED (DW-135).
 *   - `success`-status anti-join only — `unreconciled_single_source` rows
 *     remain re-fetchable so a later cross-source reconcile (DW-135) can
 *     overwrite them in place; typed-absence rows retry every fire so a
 *     newly-settled open promotes them off `fetch_error`.
 *
 * MEASUREMENT-ONLY: nothing consumes these tables. Do NOT wire the
 * output into the ranker, combiner, book, or exec path.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '../../longshort-combiner/paginated-read.ts';
import { pLimitedMap } from '../shared/p-limited-map.ts';
import {
  accrueDecayRows,
  type DecayBarBundle,
  type DecayEligibility,
  type DecayRow,
  type DecaySeedObservation,
} from './signal-decay-accruer.ts';
import {
  DECAY_CONCURRENCY,
  DECAY_LOOKBACK_DAYS,
  DECAY_STATUS_FETCH_ERROR,
  DECAY_STATUS_HALTED_AT_OPEN,
  DECAY_STATUS_HARD_EXCLUDED,
  DECAY_STATUS_POLYGON_404,
  DECAY_STATUS_SUCCESS,
  DECAY_STATUS_UNIVERSE_DROPPED,
  DECAY_STATUS_UNRECONCILED,
  DECAY_UPSERT_CHUNK_SIZE,
  HORIZON_NEXT_OPEN,
  type DecayPriceSourceStatus,
} from './signal-decay-constants.ts';
import type { OpenCloseBar } from '../shared/polygon-open-close-fetcher.ts';

/** Subset of {@link PolygonOpenCloseFetcher} the orchestrator depends on. */
export interface OpenClosePort {
  fetchOpenClose(
    ticker: string,
    as_of: Date,
    lookbackDays?: number,
  ): Promise<OpenCloseBar[] | null>;
}

export interface SignalDecayOrchestratorContext {
  supabase: SupabaseClient;
  operator_id: string;
  openClose: OpenClosePort;
  /** Override default Polygon concurrency (tests only). */
  concurrency?: number;
  /** Override lookback (tests only). */
  lookbackDays?: number;
}

export type SignalDecayOrchestratorResult =
  | {
      outcome: 'completed';
      as_of_date: string;
      signals_considered: number;
      observations_considered: number;
      observations_after_anti_join: number;
      distinct_tickers_fetched: number;
      rows_written: number;
      by_status: Record<string, number>;
    }
  | {
      outcome: 'failed';
      as_of_date: string;
      signals_considered: number;
      observations_considered: number;
      observations_after_anti_join: number;
      distinct_tickers_fetched: number;
      rows_written: number;
      by_status: Record<string, number>;
      failure_reason: string;
    };

interface FreshObsRow {
  signal_id: string;
  as_of_date: string;
  ticker: string;
  value: number | null;
}
interface ExistingDecayKey {
  signal_id: string;
  seed_as_of_date: string;
  ticker: string;
  horizon_label: string;
}
interface UniverseRow {
  ticker: string;
}
interface HardExclusionRow {
  ticker: string;
  as_of_date: string;
  firing_rules: string[] | null;
}

function obsKey(s: { signal_id: string; seed_as_of_date: string; ticker: string }): string {
  return `${s.signal_id}|${s.seed_as_of_date}|${s.ticker}`;
}

function emptyByStatus(): Record<string, number> {
  return {
    [DECAY_STATUS_SUCCESS]: 0,
    [DECAY_STATUS_UNRECONCILED]: 0,
    [DECAY_STATUS_POLYGON_404]: 0,
    [DECAY_STATUS_FETCH_ERROR]: 0,
    [DECAY_STATUS_HALTED_AT_OPEN]: 0,
    [DECAY_STATUS_UNIVERSE_DROPPED]: 0,
    [DECAY_STATUS_HARD_EXCLUDED]: 0,
  };
}

export function createSignalDecayOrchestrator(
  ctx: SignalDecayOrchestratorContext,
) {
  return {
    async run(as_of_run: Date): Promise<SignalDecayOrchestratorResult> {
      const as_of_iso = as_of_run.toISOString();
      const run_date = as_of_iso.slice(0, 10);

      const failed = (
        failure_reason: string,
        partial: Partial<SignalDecayOrchestratorResult> = {},
      ): SignalDecayOrchestratorResult => ({
        outcome: 'failed',
        as_of_date: run_date,
        signals_considered: 0,
        observations_considered: 0,
        observations_after_anti_join: 0,
        distinct_tickers_fetched: 0,
        rows_written: 0,
        by_status: emptyByStatus(),
        ...partial,
        failure_reason,
      });

      // ── Step 1: read fresh observations across all signals ──
      // Fresh-only filter: is_present=true AND carried_forward=false.
      // Limit to seeds <= run_date so we never attribute decay against a
      // signal compute whose at-open hasn't happened yet.
      let freshObs: FreshObsRow[];
      try {
        freshObs = await fetchAllRows<FreshObsRow>((from, to) =>
          ctx.supabase
            .from('signal_observations')
            .select('signal_id, as_of_date, ticker, value')
            .eq('operator_id', ctx.operator_id)
            .eq('is_present', true)
            .eq('carried_forward', false)
            .lt('as_of_date', run_date)
            .range(from, to),
        );
      } catch (e) {
        return failed(`signal_observations read failed: ${(e as Error).message}`);
      }

      const observations: DecaySeedObservation[] = freshObs.map((r) => ({
        signal_id: r.signal_id,
        seed_as_of_date: r.as_of_date,
        ticker: r.ticker,
        seed_value: r.value,
      }));
      const signals_considered = new Set(observations.map((o) => o.signal_id)).size;
      const observations_considered = observations.length;
      if (observations_considered === 0) {
        return {
          outcome: 'completed',
          as_of_date: run_date,
          signals_considered,
          observations_considered: 0,
          observations_after_anti_join: 0,
          distinct_tickers_fetched: 0,
          rows_written: 0,
          by_status: emptyByStatus(),
        };
      }

      // ── Step 2: anti-join against existing decay rows ──
      // SUCCESS-status anti-join only: typed-absence + unreconciled_single_source
      // rows MUST remain re-attemptable (DW-135 cross-source reconcile is the
      // event that promotes unreconciled -> success; bar settlement is the event
      // that promotes fetch_error -> data-bearing).
      const seedDates = Array.from(new Set(observations.map((o) => o.seed_as_of_date)));
      let existingRows: ExistingDecayKey[];
      try {
        existingRows = await fetchAllRows<ExistingDecayKey>((from, to) =>
          ctx.supabase
            .from('signal_decay_returns')
            .select('signal_id, seed_as_of_date, ticker, horizon_label')
            .eq('operator_id', ctx.operator_id)
            .eq('price_source_status', DECAY_STATUS_SUCCESS)
            .eq('horizon_label', HORIZON_NEXT_OPEN)
            .in('seed_as_of_date', seedDates)
            .range(from, to),
        );
      } catch (e) {
        return failed(
          `signal_decay_returns key read failed: ${(e as Error).message}`,
          { signals_considered, observations_considered },
        );
      }
      const existingKeys = new Set<string>(existingRows.map((r) => obsKey(r)));
      const survivors = observations.filter((o) => !existingKeys.has(obsKey(o)));
      const observations_after_anti_join = survivors.length;
      if (observations_after_anti_join === 0) {
        return {
          outcome: 'completed',
          as_of_date: run_date,
          signals_considered,
          observations_considered,
          observations_after_anti_join: 0,
          distinct_tickers_fetched: 0,
          rows_written: 0,
          by_status: emptyByStatus(),
        };
      }

      // ── Step 3: eligibility reads (universe + hard exclusions) ──
      // Universe currency: a survivor whose ticker no longer appears in
      // ANY universe_membership row at or after seed_as_of_date is dropped.
      // For Phase-1 simplicity, read membership for the run-date and treat
      // absence as `universe_dropped`. Hard exclusions: any row with
      // as_of_date > seed_as_of_date marks the ticker hard_excluded_since_seed.
      const survivorTickers = Array.from(new Set(survivors.map((s) => s.ticker)));

      let currentUniverseTickers: Set<string>;
      try {
        const universeRows = await fetchAllRows<UniverseRow>((from, to) =>
          ctx.supabase
            .from('universe_membership')
            .select('ticker')
            .eq('operator_id', ctx.operator_id)
            .in('ticker', survivorTickers)
            .range(from, to),
        );
        currentUniverseTickers = new Set(universeRows.map((r) => r.ticker));
      } catch (e) {
        return failed(
          `universe_membership read failed: ${(e as Error).message}`,
          {
            signals_considered,
            observations_considered,
            observations_after_anti_join,
          },
        );
      }

      let exclusionRows: HardExclusionRow[];
      try {
        exclusionRows = await fetchAllRows<HardExclusionRow>((from, to) =>
          ctx.supabase
            .from('hard_exclusions')
            .select('ticker, as_of_date, firing_rules')
            .eq('operator_id', ctx.operator_id)
            .in('ticker', survivorTickers)
            .range(from, to),
        );
      } catch (e) {
        return failed(
          `hard_exclusions read failed: ${(e as Error).message}`,
          {
            signals_considered,
            observations_considered,
            observations_after_anti_join,
          },
        );
      }
      // Map ticker -> {latest_as_of_date, firing_rules}; only "since-seed" filter
      // is applied per-survivor below (depends on per-row seed_as_of_date).
      const exclusionsByTicker = new Map<
        string,
        Array<{ as_of_date: string; firing_rules: string[] }>
      >();
      for (const r of exclusionRows) {
        const arr = exclusionsByTicker.get(r.ticker) ?? [];
        arr.push({
          as_of_date: r.as_of_date,
          firing_rules: r.firing_rules ?? [],
        });
        exclusionsByTicker.set(r.ticker, arr);
      }

      // ── Step 4: bounded-concurrency Polygon fetch ──
      const lookbackDays = ctx.lookbackDays ?? DECAY_LOOKBACK_DAYS;
      const concurrency = ctx.concurrency ?? DECAY_CONCURRENCY;
      const perTicker = await pLimitedMap<
        string,
        { ticker: string; bundle: DecayBarBundle }
      >(survivorTickers, concurrency, async (ticker) => {
        try {
          const bars = await ctx.openClose.fetchOpenClose(
            ticker,
            as_of_run,
            lookbackDays,
          );
          return { ticker, bundle: bars };
        } catch {
          return { ticker, bundle: 'error' as const };
        }
      });
      const barsByTicker = new Map<string, DecayBarBundle>();
      for (const r of perTicker) barsByTicker.set(r.ticker, r.bundle);

      // ── Step 5: pure accrual (per-survivor eligibility assembled inline) ──
      // We accrue per-survivor (rather than once per ticker) because
      // hard_excluded_since_seed depends on the survivor's seed_as_of_date.
      const rows: DecayRow[] = [];
      for (const s of survivors) {
        const universeDropped = !currentUniverseTickers.has(s.ticker);
        const tickerExclusions = exclusionsByTicker.get(s.ticker) ?? [];
        const sinceSeed = tickerExclusions.filter(
          (e) => e.as_of_date > s.seed_as_of_date,
        );
        const hardExcluded = sinceSeed.length > 0;
        const hardExclusionFiringRules = hardExcluded
          ? Array.from(
              new Set(sinceSeed.flatMap((e) => e.firing_rules ?? [])),
            )
          : undefined;
        const elig: DecayEligibility = {
          // Phase-1: positive halt detection requires a BrokerHaltStatusFetcher
          // production wiring (deferred — no fetcher exists today). The
          // accruer's halted_at_open status remains schema-valid and the
          // typed-absence CHECK admits it; the orchestrator simply never
          // sets the flag in Phase-1. DW-135 is the right vehicle to add
          // both the Tradier price reconcile AND the halt verifier wiring.
          haltedAtOpen: false,
          universeDropped,
          hardExcluded,
          hardExclusionFiringRules,
        };
        const accrued = accrueDecayRows(
          barsByTicker,
          new Map([[s.ticker, elig]]),
          [s],
        );
        rows.push(...accrued);
      }

      const by_status = emptyByStatus();
      for (const r of rows) {
        by_status[r.price_source_status] =
          (by_status[r.price_source_status] ?? 0) + 1;
      }

      // ── Step 6: chunked UPSERT ──
      const onConflict =
        'operator_id,signal_id,seed_as_of_date,ticker,horizon_label';
      let rows_written = 0;
      for (let i = 0; i < rows.length; i += DECAY_UPSERT_CHUNK_SIZE) {
        const chunk = rows
          .slice(i, i + DECAY_UPSERT_CHUNK_SIZE)
          .map((r) => ({
            operator_id: ctx.operator_id,
            signal_id: r.signal_id,
            seed_as_of_date: r.seed_as_of_date,
            ticker: r.ticker,
            horizon_label: r.horizon_label,
            seed_value: r.seed_value,
            seed_close: r.seed_close,
            next_open: r.next_open,
            open_decay_return: r.open_decay_return,
            seed_close_date: r.seed_close_date,
            next_open_date: r.next_open_date,
            price_source: r.price_source,
            price_source_status: r.price_source_status,
            notes: r.notes,
            computed_at: as_of_iso,
          }));
        const { error: upErr } = await ctx.supabase
          .from('signal_decay_returns')
          .upsert(chunk, { onConflict });
        if (upErr) {
          return failed(
            `signal_decay_returns upsert failed at chunk offset ${i}: ${upErr.message}`,
            {
              signals_considered,
              observations_considered,
              observations_after_anti_join,
              distinct_tickers_fetched: survivorTickers.length,
              rows_written,
              by_status,
            },
          );
        }
        rows_written += chunk.length;
      }

      return {
        outcome: 'completed',
        as_of_date: run_date,
        signals_considered,
        observations_considered,
        observations_after_anti_join,
        distinct_tickers_fetched: survivorTickers.length,
        rows_written,
        by_status,
      };
    },
  };
}

/** Re-export status enum type for callers writing run-level telemetry. */
export type { DecayPriceSourceStatus };