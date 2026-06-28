/**
 * Short-term reversal (Signal #7) daily-cadence orchestrator.
 *
 * Mirrors `cross-sectional-momentum/momentum-orchestrator.ts` exactly:
 * same 5-step pipeline (load universe → bounded-concurrency fetch + per-
 * ticker compute → within-sector GICS z-score → SignalRows → persist),
 * same shared infra (`pLimitedMap`, `zScoreNormalizeWithinSector`,
 * `captureSignalObservations`, `PolygonPriceHistoryFetcher`), same
 * SignalOrchestratorContext + SignalOrchestratorResult contracts.
 *
 * Differences vs momentum:
 *   - Compute is `computeReversal` (§4.4.2: -1 × ((P[T-1]/P[T-6])-1)).
 *   - Bar requirement is REVERSAL_MIN_BARS=7 (vs MOMENTUM_MIN_BARS=253).
 *   - PRICE_HISTORY_LOOKBACK_DAYS is much smaller (20 calendar days)
 *     because only 7 trading bars are needed; see in-code comment for
 *     the calendar→trading-bar reasoning + holiday-cluster headroom.
 *
 * Wall-clock discipline (DEC-034 clause 4): NO wall-clock reads anywhere
 * in supabase/functions/ — telemetry included. All timestamps
 * (`started_at`/`completed_at`/`computed_at`) derive from the `as_of`
 * parameter, mirroring the momentum-orchestrator precedent.
 *
 * Owner: longshort (FP-040 — Signal #7 / Phase 2.2)
 */

import { SignalComputationError } from '../shared/signal-types.ts';
import type {
  SignalOrchestratorContext,
  SignalOrchestratorResult,
} from '../shared/signal-orchestrator-types.ts';
import type { SignalRow, SignalSkip } from '../shared/signal-types.ts';
import { pLimitedMap } from '../shared/p-limited-map.ts';
import { computeReversal, REVERSAL_MIN_BARS } from './compute-reversal.ts';
import { zScoreNormalizeWithinSector } from '../shared/z-score-normalize.ts';
import { captureSignalObservations } from '../shared/missingness-capture.ts';

/** Locked signal-id string for Phase 3 combiner consumption. Do not rename. */
export const SIGNAL_ID = 'short_term_reversal_1w';

/**
 * DEC-071 sub-step 3b — cross-signal gate dependencies. Reversal is
 * suppressed at emit when news (#8) or catalyst (#9) is PRESENT for the
 * same (ticker, as_of_date). The orchestrator reads these signal IDs
 * from signal_observations after verifying via signal_compute_log that
 * both producers have a SUCCESSFUL run on the same as_of_date (the hard
 * precondition — absence-of-row ≠ absence-of-news, §9 anti-phantom).
 */
const NEWS_SIGNAL_ID = 'news_sentiment_7d';
const CATALYST_SIGNAL_ID = 'active_catalyst_flag';
const SHADOW_TABLE = 'reversal_ungated_observations';

const DEFAULT_CONCURRENCY = 20;
/** Lookback in CALENDAR days. Must span REVERSAL_MIN_BARS=7 TRADING days
 *  + headroom for holiday clusters. Trading/calendar ratio ≈ 252/365 ≈
 *  0.69; 20 calendar days → ~14 trading bars (2× the 7-bar requirement)
 *  — comfortable headroom for week-of-Thanksgiving / Christmas / similar
 *  holiday clusters that could otherwise starve the 7-bar window. Mirrors
 *  the momentum orchestrator's calendar→trading reasoning discipline
 *  (INC-57 lineage: the original 280 there was too tight; this 20 here is
 *  ~2× rather than +9% of the floor). */
const PRICE_HISTORY_LOOKBACK_DAYS = 20;

interface UniverseRow {
  ticker: string;
  gics_sector: string | null;
}

type PerTickerResult =
  | { kind: 'value'; ticker: string; raw_signal: number; gics_sector: string | null }
  | { kind: 'skip'; skip: SignalSkip };

type GateDecision = 'none' | 'gated_by_news' | 'gated_by_catalyst' | 'gate_inputs_unavailable';

export function createReversalOrchestrator(ctx: SignalOrchestratorContext) {
  return {
    async run(as_of: Date): Promise<SignalOrchestratorResult> {
      // Single as_of-derived timestamp reused for all telemetry sites.
      // Per DEC-034(4): no wall-clock reads in supabase/functions/.
      const ts = as_of.toISOString();
      const started_at = ts;
      const as_of_date = ts.slice(0, 10);

      // ── Step 1: load current universe ─────────────────────────────────
      const { data: latestRows, error: latestErr } = await ctx.supabase
        .from('universe_membership')
        .select('as_of_date')
        .eq('operator_id', ctx.operator_id)
        .order('as_of_date', { ascending: false })
        .limit(1);

      if (latestErr) {
        throw new Error(
          `reversal-orchestrator: universe_membership latest-date read failed: ${latestErr.message}`,
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
          `reversal-orchestrator: universe_membership read failed: ${universeErr.message}`,
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
          failure_reason: 'empty_universe',
          started_at,
          completed_at: ts,
        };
      }

      // ── DEC-071 sub-step 3b precondition: news/catalyst run gate ──────
      // Query signal_compute_log for SUCCESSFUL runs of #8 + #9 on the
      // SAME as_of_date. If either is missing, we cannot safely gate —
      // the absence of a signal_observations row could mean "no news" OR
      // "the news job never ran"; the precondition disambiguates. On
      // pipeline gap → SAFE FALLBACK: emit raw reversal values for all
      // names (pre-DEC-071 status quo, NOT a skip, NOT an exclusion);
      // shadow rows carry gate_decision='gate_inputs_unavailable'.
      const { data: runRows, error: runErr } = await ctx.supabase
        .from('signal_compute_log')
        .select('signal_id')
        .eq('operator_id', ctx.operator_id)
        .eq('as_of_date', as_of_date)
        .in('signal_id', [NEWS_SIGNAL_ID, CATALYST_SIGNAL_ID])
        .eq('outcome', 'completed');
      if (runErr) {
        throw new Error(
          `reversal-orchestrator: signal_compute_log precondition read failed: ${runErr.message}`,
        );
      }
      const seenSignals = new Set(
        (runRows ?? []).map((r) => (r as { signal_id: string }).signal_id),
      );
      const gateInputsAvailable =
        seenSignals.has(NEWS_SIGNAL_ID) && seenSignals.has(CATALYST_SIGNAL_ID);

      // ── Cross-signal presence map (only when gate is armed) ──────────
      // Single batched read on SAME as_of_date (no T+1 look-ahead).
      // "Present" = is_present===true (reading the VALUE would be wrong —
      // neutral news still means news happened).
      const newsPresent = new Set<string>();
      const catalystPresent = new Set<string>();
      if (gateInputsAvailable) {
        const { data: obsRows, error: obsErr } = await ctx.supabase
          .from('signal_observations')
          .select('ticker, signal_id')
          .eq('operator_id', ctx.operator_id)
          .eq('as_of_date', as_of_date)
          .in('signal_id', [NEWS_SIGNAL_ID, CATALYST_SIGNAL_ID])
          .eq('is_present', true);
        if (obsErr) {
          throw new Error(
            `reversal-orchestrator: cross-signal observations read failed: ${obsErr.message}`,
          );
        }
        for (const r of (obsRows ?? []) as Array<{ ticker: string; signal_id: string }>) {
          if (r.signal_id === NEWS_SIGNAL_ID) newsPresent.add(r.ticker);
          else if (r.signal_id === CATALYST_SIGNAL_ID) catalystPresent.add(r.ticker);
        }
      }

      // ── Step 2: per-ticker fetch + raw reversal signal ────────────────
      const concurrency = ctx.concurrency ?? DEFAULT_CONCURRENCY;
      const perTicker = await pLimitedMap<UniverseRow, PerTickerResult>(
        universe,
        concurrency,
        async (row) => {
          const { ticker, gics_sector } = row;
          try {
            const bars = await ctx.priceHistory.fetchPriceHistory(
              ticker,
              as_of,
              PRICE_HISTORY_LOOKBACK_DAYS,
            );
            if (bars === null) {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: 'fetch_error',
                  detail: 'polygon 404: ticker not in reference',
                },
              };
            }
            const raw_signal = computeReversal(bars);
            if (raw_signal === null) {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: 'insufficient_history',
                  detail: `${bars.length} bars < ${REVERSAL_MIN_BARS} required`,
                },
              };
            }
            return { kind: 'value', ticker, raw_signal, gics_sector };
          } catch (err) {
            const message = err instanceof SignalComputationError
              ? err.message
              : err instanceof Error
                ? err.message
                : String(err);
            return {
              kind: 'skip',
              skip: { ticker, reason: 'fetch_error', detail: message },
            };
          }
        },
      );

      // ── Step 3: within-sector z-score ────────────────────────────────
      const valueResults = perTicker
        .filter((r): r is Extract<PerTickerResult, { kind: 'value' }> => r.kind === 'value');
      const skips: SignalSkip[] = perTicker
        .filter((r): r is Extract<PerTickerResult, { kind: 'skip' }> => r.kind === 'skip')
        .map((r) => r.skip);

      // ── DEC-071 sub-step 3b: partition value-tickers by gate decision ─
      // The gate ONLY removes a ticker from the z-score normalization
      // pool when gateInputsAvailable AND (news_present OR catalyst_present).
      // gate_inputs_unavailable → pre-DEC-071 path (all values z-scored).
      // News precedence: news beats catalyst when both fire.
      const gateDecisions = new Map<string, GateDecision>();
      const rawByTicker = new Map<string, number>();
      const normalValues: Array<{ ticker: string; value: number; gics_sector: string | null }> = [];
      for (const v of valueResults) {
        rawByTicker.set(v.ticker, v.raw_signal);
        let decision: GateDecision = 'none';
        if (!gateInputsAvailable) {
          decision = 'gate_inputs_unavailable';
        } else if (newsPresent.has(v.ticker)) {
          decision = 'gated_by_news';
        } else if (catalystPresent.has(v.ticker)) {
          decision = 'gated_by_catalyst';
        }
        gateDecisions.set(v.ticker, decision);
        // gate_inputs_unavailable + none both participate in z-score.
        if (decision === 'none' || decision === 'gate_inputs_unavailable') {
          normalValues.push({ ticker: v.ticker, value: v.raw_signal, gics_sector: v.gics_sector });
        }
      }

      const zScored = zScoreNormalizeWithinSector(normalValues);

      // ── Step 4: rows + attributed sector-related skips ───────────────
      const computed_at = ts;
      const rows: SignalRow[] = [];
      for (const z of zScored) {
        if (z.value === null) {
          const reason: SignalSkip['reason'] =
            z.gics_sector === null ? 'missing_sector' : 'singleton_sector';
          skips.push({
            ticker: z.ticker,
            reason,
            detail: z.gics_sector
              ? `sector="${z.gics_sector}" yielded std=0`
              : 'gics_sector is null',
          });
          continue;
        }
        rows.push({
          operator_id: ctx.operator_id,
          signal_id: SIGNAL_ID,
          ticker: z.ticker,
          as_of_date,
          value: z.value,
          is_present: true,
          gics_sector: z.gics_sector,
          computed_at,
        });
      }

      // DEC-071 sub-step 3b: emit GATED typed-absence rows for tickers
      // suppressed by the news/catalyst cross-signal gate. value=null,
      // is_present=false, skip_reason ∈ {'gated_by_news','gated_by_catalyst'}.
      // Per §9 anti-phantom: NEVER a fabricated zero. These rows do NOT
      // participate in z-score normalization (they're not in normalValues).
      // gate_inputs_unavailable does NOT reach this branch — those tickers
      // emit normally (raw → z-score) above.
      for (const v of valueResults) {
        const d = gateDecisions.get(v.ticker);
        if (d === 'gated_by_news' || d === 'gated_by_catalyst') {
          rows.push({
            operator_id: ctx.operator_id,
            signal_id: SIGNAL_ID,
            ticker: v.ticker,
            as_of_date,
            value: null,
            is_present: false,
            gics_sector: v.gics_sector,
            computed_at,
            skip_reason: d,
          });
        }
      }

      // ── Step 5: persist ──────────────────────────────────────────────
      const { inserted, error: persistErr } = await captureSignalObservations(ctx.supabase, rows);
      if (persistErr) {
        return {
          outcome: 'failed',
          signal_id: SIGNAL_ID,
          as_of_date,
          universe_size: universe.length,
          persisted_count: 0,
          skipped: skips,
          failure_reason: `signal_observations persistence failed: ${persistErr.message}`,
          started_at,
          completed_at: ts,
        };
      }

      // ── DEC-071 sub-step 3b / DW-176: ungated shadow capture ─────────
      // ALWAYS write a shadow row for every ticker that produced a
      // numeric raw_signal — including the 'none' (normal-emit) and
      // 'gate_inputs_unavailable' (precondition fallback) cases. No
      // series gap; raw_value is the pre-gate computeReversal output
      // (NEVER re-derived, NEVER fabricated). ON CONFLICT DO NOTHING
      // mirrors the idempotent-overwrite ban on the shadow series.
      const shadowRows = valueResults.map((v) => ({
        operator_id: ctx.operator_id,
        signal_id: SIGNAL_ID,
        as_of_date,
        ticker: v.ticker,
        raw_value: v.raw_signal,
        gate_decision: gateDecisions.get(v.ticker) ?? 'none',
        computed_at,
      }));
      if (shadowRows.length > 0) {
        const { error: shadowErr } = await ctx.supabase
          .from(SHADOW_TABLE)
          .upsert(shadowRows, {
            onConflict: 'operator_id,signal_id,as_of_date,ticker',
            ignoreDuplicates: true,
          });
        if (shadowErr) {
          // Shadow failure is telemetry-only — it MUST NOT fail the
          // live signal path (the gate decision and the present rows
          // are already persisted). The Phase-7 reader will detect the
          // gap and surface it; the live ranking is unaffected.
          // We swallow here to preserve the must-not-move on the normal
          // path; signal_compute_log carries the run outcome.
        }
      }

      return {
        outcome: 'completed',
        signal_id: SIGNAL_ID,
        as_of_date,
        universe_size: universe.length,
        persisted_count: inserted,
        skipped: skips,
        started_at,
        completed_at: ts,
        // DEC-071 3b telemetry fix (MIG-136): per-gate-decision counts
        // computed from the typed-absence rows actually emitted to
        // `rows[]` (NOT from `skipped[]` — gated rows are deliberate
        // suppressions, not skips). Source-of-truth is the rows we are
        // about to persist; aligns with the §22.5.1 live-DB invariant.
        gate_counts: countGatedRows(rows),
      };
    },
  };
}

/**
 * DEC-071 3b telemetry fix (MIG-136): tally typed-absence gated emits by
 * skip_reason. Pure helper, no I/O. Returns a stable-shape object so the
 * persisted `gate_counts` is queryable by key even when a category is 0.
 */
function countGatedRows(
  rows: ReadonlyArray<{ skip_reason?: string | null }>,
): Record<'gated_by_news' | 'gated_by_catalyst', number> {
  const counts = { gated_by_news: 0, gated_by_catalyst: 0 };
  for (const r of rows) {
    if (r.skip_reason === 'gated_by_news') counts.gated_by_news += 1;
    else if (r.skip_reason === 'gated_by_catalyst') counts.gated_by_catalyst += 1;
  }
  return counts;
}