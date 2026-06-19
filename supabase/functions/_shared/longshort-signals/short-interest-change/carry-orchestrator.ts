/**
 * DW-106-c-i (FP-053) — Short-interest daily CARRY orchestrator.
 *
 * Pure-DB orchestrator (NO Polygon, NO wall-clock — `as_of` is a
 * parameter; all timestamps derive from it per DEC-034 clause 4).
 * Wires the DW-106-b pure decider (`decideShortInterestCarry`) to
 * live `signal_observations` rows for Signal #9
 * (`short_interest_change_30d`).
 *
 * Pipeline (5 steps):
 *   1. Load latest universe snapshot (`universe_membership` latest-as_of
 *      pattern, mirrors `short-interest-orchestrator.ts:131-188`).
 *   2. Bulk-read 35-calendar-day priors from `signal_observations`
 *      (`fetchAllRows`; one paginated read; window = 22d bound + 15d
 *      missed-cycle + 2d safety = 39d effective — rounded to 35d which
 *      is sufficient since the bound anchor only needs ONE native row
 *      inside [as_of−22d, as_of] to authorize a carry; older priors are
 *      pruned by the SQL filter). Group in-memory by ticker.
 *   3. Per universe ticker: call `decideShortInterestCarry` → map the
 *      4-outcome union to a (row?, skip?) pair:
 *        skip_native_exists → no row, no skip (publication-day idempotency).
 *        emit_carry         → SignalRow { is_present:true, value:held,
 *                              gics_sector:anchor.gics_sector,
 *                              carried_forward:true }.
 *        emit_absence past_bound        → typed-absence row + SignalSkip
 *                              'data_unavailable' (reuses the existing
 *                              SignalSkipReason enum per the reconciled
 *                              design — no new reason value added in c-i).
 *        emit_absence no_prior_publication → typed-absence row + SignalSkip
 *                              'insufficient_history'.
 *      `emit_absence` rows carry `gics_sector` = current universe value
 *      (per DEC-060 + the reconciled c-i design): we already loaded the
 *      universe row's `gics_sector` in Step 1; falling back to the
 *      anchor's sector would be staler than the live universe value, and
 *      `null` is reserved for "we genuinely have no sector for this
 *      ticker" — distinct semantics. (CHECK MIG-064 disjunct 1 is
 *      satisfied regardless: is_present=false AND value IS NULL.)
 *   4. Single-batch `captureSignalObservations(rows)` — zero-partial
 *      write per the established orchestrator contract; on persist
 *      error the entire run reports failed.
 *   5. Return `CarryOrchestratorResult` with counts for telemetry.
 *
 * NO `heal_date` stamp here — that is cron-only and lives in
 * DW-106-c-ii (`longshort-short-interest-carry-compute` cron handler).
 * The manual fn intentionally cannot stamp `heal_date` so operator
 * §22.5.1 smoke runs do NOT open the DEC-059 n≥30 measurement window
 * prematurely.
 *
 * Owner: longshort (FP-053 / DW-106-c-i)
 * Classification: shared orchestrator factory — Phase 2 carry-forward.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '../../longshort-combiner/paginated-read.ts';
import type { SignalRow, SignalSkip } from '../shared/signal-types.ts';
import { captureSignalObservations } from '../shared/missingness-capture.ts';
import {
  decideShortInterestCarry,
  type PriorObservation,
} from './carry-decider.ts';

/** Locked signal-id (must match the native publisher). */
export const SIGNAL_ID = 'short_interest_change_30d';

/**
 * Calendar-day prior-read window. 22d (DEC-060 bound) + 15d (one missed
 * publication cycle) − 2d (conservative trim — 35d is comfortably above
 * any plausible bound-anchor-survival window). Sized for SQL filter
 * efficiency, NOT for the bound itself (the decider re-checks staleness
 * exactly).
 */
export const CARRY_PRIORS_LOOKBACK_DAYS = 35;

export interface CarryOrchestratorContext {
  supabase: SupabaseClient;
  operator_id: string;
}

export interface CarryOrchestratorResult {
  outcome: 'completed' | 'failed';
  signal_id: string;
  as_of_date: string;
  universe_size: number;
  persisted_count: number;
  skipped: SignalSkip[];
  carried_count: number;
  past_bound_count: number;
  no_publication_count: number;
  skipped_native_count: number;
  failure_reason?: string;
  started_at: string;
  completed_at: string;
}

interface UniverseRow {
  ticker: string;
  gics_sector: string | null;
}

interface PriorRow {
  ticker: string;
  as_of_date: string;
  value: number | null;
  is_present: boolean;
  gics_sector: string | null;
  carried_forward: boolean;
}

/** Pure 'YYYY-MM-DD' subtraction (UTC midnight). No clock. */
function isoDateMinusDays(as_of_date: string, days: number): string {
  const ms = Date.parse(as_of_date + 'T00:00:00Z') - days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function createCarryOrchestrator(ctx: CarryOrchestratorContext) {
  return {
    async run(as_of: Date): Promise<CarryOrchestratorResult> {
      const ts = as_of.toISOString();
      const started_at = ts;
      const as_of_date = ts.slice(0, 10);

      // ── Step 1: latest universe snapshot ─────────────────────────────
      const { data: latestRows, error: latestErr } = await ctx.supabase
        .from('universe_membership')
        .select('as_of_date')
        .eq('operator_id', ctx.operator_id)
        .order('as_of_date', { ascending: false })
        .limit(1);

      if (latestErr) {
        throw new Error(
          `carry-orchestrator: universe_membership latest-date read failed: ${latestErr.message}`,
        );
      }
      const latest_as_of_date = latestRows && latestRows.length > 0
        ? (latestRows[0] as { as_of_date: string }).as_of_date
        : null;
      if (latest_as_of_date === null) {
        return {
          outcome: 'failed',
          signal_id: SIGNAL_ID,
          as_of_date,
          universe_size: 0,
          persisted_count: 0,
          skipped: [],
          carried_count: 0,
          past_bound_count: 0,
          no_publication_count: 0,
          skipped_native_count: 0,
          failure_reason: 'empty_universe',
          started_at,
          completed_at: ts,
        };
      }

      const { data: universeRows, error: universeErr } = await ctx.supabase
        .from('universe_membership')
        .select('ticker, gics_sector')
        .eq('operator_id', ctx.operator_id)
        .eq('as_of_date', latest_as_of_date);
      if (universeErr) {
        throw new Error(
          `carry-orchestrator: universe_membership read failed: ${universeErr.message}`,
        );
      }
      const universe = (universeRows ?? []) as UniverseRow[];
      if (universe.length === 0) {
        return {
          outcome: 'failed',
          signal_id: SIGNAL_ID,
          as_of_date,
          universe_size: 0,
          persisted_count: 0,
          skipped: [],
          carried_count: 0,
          past_bound_count: 0,
          no_publication_count: 0,
          skipped_native_count: 0,
          failure_reason: 'empty_universe',
          started_at,
          completed_at: ts,
        };
      }

      // ── Step 2: bulk-read 35d priors via fetchAllRows ────────────────
      const window_start = isoDateMinusDays(as_of_date, CARRY_PRIORS_LOOKBACK_DAYS);
      let priorRows: PriorRow[];
      try {
        priorRows = await fetchAllRows<PriorRow>((from, to) =>
          ctx.supabase
            .from('signal_observations')
            .select('ticker, as_of_date, value, is_present, gics_sector, carried_forward')
            .eq('operator_id', ctx.operator_id)
            .eq('signal_id', SIGNAL_ID)
            .gte('as_of_date', window_start)
            .lte('as_of_date', as_of_date)
            .range(from, to),
        );
      } catch (e) {
        throw new Error(
          `carry-orchestrator: signal_observations priors read failed: ${(e as Error).message}`,
        );
      }

      // In-memory group by ticker.
      const priorsByTicker = new Map<string, PriorObservation[]>();
      for (const r of priorRows) {
        const arr = priorsByTicker.get(r.ticker);
        const obs: PriorObservation = {
          as_of_date: r.as_of_date,
          value: r.value,
          is_present: r.is_present,
          gics_sector: r.gics_sector,
          carried_forward: r.carried_forward,
        };
        if (arr) arr.push(obs);
        else priorsByTicker.set(r.ticker, [obs]);
      }

      // ── Step 3: per-ticker decide + map ──────────────────────────────
      const computed_at = ts;
      const rows: SignalRow[] = [];
      const skips: SignalSkip[] = [];
      let carried_count = 0;
      let past_bound_count = 0;
      let no_publication_count = 0;
      let skipped_native_count = 0;

      for (const u of universe) {
        const priors = priorsByTicker.get(u.ticker) ?? [];
        const outcome = decideShortInterestCarry(priors, as_of_date);
        switch (outcome.kind) {
          case 'skip_native_exists':
            skipped_native_count += 1;
            break;
          case 'emit_carry':
            carried_count += 1;
            rows.push({
              operator_id: ctx.operator_id,
              signal_id: SIGNAL_ID,
              ticker: u.ticker,
              as_of_date,
              value: outcome.value,
              is_present: true,
              gics_sector: outcome.gics_sector,
              computed_at,
              carried_forward: true,
            });
            break;
          case 'emit_absence': {
            if (outcome.reason === 'past_bound') {
              past_bound_count += 1;
              skips.push({
                ticker: u.ticker,
                reason: 'data_unavailable',
                detail: `short_interest carry past 22d bound; anchor_as_of=${outcome.anchor_as_of}`,
              });
            } else {
              no_publication_count += 1;
              skips.push({
                ticker: u.ticker,
                reason: 'insufficient_history',
                detail: 'no native short_interest publication in priors window',
              });
            }
            rows.push({
              operator_id: ctx.operator_id,
              signal_id: SIGNAL_ID,
              ticker: u.ticker,
              as_of_date,
              value: null,
              is_present: false,
              gics_sector: u.gics_sector,
              computed_at,
              carried_forward: false,
            });
            break;
          }
        }
      }

      // ── Step 4: persist (single batch — zero-partial) ────────────────
      const { inserted, error: persistErr } = await captureSignalObservations(
        ctx.supabase,
        rows,
      );
      if (persistErr) {
        return {
          outcome: 'failed',
          signal_id: SIGNAL_ID,
          as_of_date,
          universe_size: universe.length,
          persisted_count: 0,
          skipped: skips,
          carried_count,
          past_bound_count,
          no_publication_count,
          skipped_native_count,
          failure_reason: `signal_observations persistence failed: ${persistErr.message}`,
          started_at,
          completed_at: ts,
        };
      }

      return {
        outcome: 'completed',
        signal_id: SIGNAL_ID,
        as_of_date,
        universe_size: universe.length,
        persisted_count: inserted,
        skipped: skips,
        carried_count,
        past_bound_count,
        no_publication_count,
        skipped_native_count,
        started_at,
        completed_at: ts,
      };
    },
  };
}