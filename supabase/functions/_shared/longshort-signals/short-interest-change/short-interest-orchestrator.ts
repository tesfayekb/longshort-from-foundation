/**
 * Short-interest change (Signal #5) orchestrator — twice-monthly cadence.
 *
 * Mirrors `short-term-reversal/reversal-orchestrator.ts` structurally
 * (same 5-step pipeline: load universe → bounded-concurrency fetch + per-
 * ticker compute → within-sector GICS z-score → SignalRow build → persist),
 * with FOUR DIFFERENCES tied to §4.4.3 / §4.3.5:
 *
 *   1. NON-CRITICAL signal: missing data on a ticker is NOT a hard skip
 *      that excludes the ticker from ranking. It contributes a typed
 *      `is_present=0` skip and the ticker is still ranked by the other
 *      signals (per §6.5 missingness handling). For Phase 2.3 the
 *      orchestrator emits the skip; the combiner is the surface that
 *      will inject the (-999, 0) feature-vector imputation in Phase 3.
 *
 *   2. NEW external fetcher: `PolygonShortInterestFetcher` (FP-041). The
 *      fetcher is ENTITLEMENT-AWARE — HTTP 403 → typed
 *      `subscription_gated`; HTTP 404 → typed `data_unavailable`. Neither
 *      throws. The orchestrator translates each into the matching
 *      SignalSkip reason.
 *
 *   3. Twice-monthly natural cadence: the cron schedule (MIG-076) is
 *      `0 21 1,15 * *` (1st + 15th of each month at 21:00 UTC) — natural
 *      bi-weekly cadence aligned with the SEC short-interest publication
 *      rhythm. No additional orchestrator-side "is there a new report"
 *      gate is required for v1 because the schedule itself enforces the
 *      cadence; re-running on the same data is idempotent (signal_observations
 *      composite-PK upsert is last-writer-wins).
 *
 *   4. DERIVED si_pct_float (FP-041 revision-fix): Polygon's
 *      `/stocks/v1/short-interest` endpoint returns the RAW `short_interest`
 *      share count, NOT a %-of-float field. This orchestrator therefore
 *      coordinates TWO fetchers per ticker:
 *
 *        - `PolygonShortInterestFetcher`     → recent SI reports (raw counts)
 *        - `PolygonSharesOutstandingFetcher` → share_class_shares_outstanding
 *
 *      and derives `si_pct_float = short_interest / shares_outstanding` for
 *      each report before invoking the pure compute. See the
 *      "CONSCIOUS APPROXIMATION" block below for the
 *      current-shares-for-historical-SI discussion.
 *
 * ─── CONSCIOUS APPROXIMATION (§2 axiom 4 — surface, don't hide) ────────
 * The signal compares short_interest at TWO historical report dates
 * (T and T-2 ≈ 30 calendar days). The Polygon reference endpoint
 * (`/v3/reference/tickers/{ticker}`) provides ONLY current
 * `share_class_shares_outstanding`, not point-in-time. We therefore use
 * the CURRENT shares-outstanding to denominate BOTH historical SI counts.
 * This is a deliberate, documented approximation:
 *
 *   - Shares-outstanding is slow-moving (corporate actions on the order of
 *     quarters/years) relative to short-interest (twice-monthly swings of
 *     entire orders of magnitude).
 *   - The signal is `-(SI%[T] - SI%[T-2])`; with a common denominator the
 *     percentage change is dominated by the SI numerator change.
 *   - A point-in-time shares-outstanding history would be more precise
 *     (split/buyback dates do shift the denominator) but is not exposed
 *     by this Polygon endpoint; a FINRA + EDGAR cross-source would be
 *     needed and is intentionally deferred (§4.4.3 backup; outside FP-041
 *     scope).
 *
 * This approximation is NOT a silent assumption — it is documented here in
 * code, in `docs/04-modules/longshort/signals/short-interest-change.md`,
 * and pinned by the orchestrator tests. Per §2 anti-phantom discipline:
 * approximations are acceptable, hidden approximations are not.
 *
 * Wall-clock discipline (DEC-034 clause 4 / FP-047 pattern): the
 * financial-anchor timestamps (`as_of_date`, `computed_at`) derive from
 * the `as_of` parameter and never from wall-clock. The orchestrator
 * telemetry timestamps (`started_at` / `completed_at`) are stamped from
 * the injected `liveClock` (defaults to the sanctioned `productionClock`
 * chokepoint) so that `signal_compute_log.completed_at` reflects the
 * real execution instant — this is what staleness dashboards and
 * `classifyFireSource` consume. Conflating telemetry with the
 * `as_of` date-anchor causes the FP-047 / Defect-1 dashboard
 * false-Stale symptom and is forbidden here.
 *
 * Owner: longshort (FP-041 — Signal #5 / Phase 2.3; revision-fix:
 * Option A si_pct_float derivation)
 */

import { SignalComputationError } from '../shared/signal-types.ts';
import type {
  SignalOrchestratorContext,
  SignalOrchestratorResult,
} from '../shared/signal-orchestrator-types.ts';
import type { SignalRow, SignalSkip, SignalSkipReason } from '../shared/signal-types.ts';
import { pLimitedMap } from '../shared/p-limited-map.ts';
import {
  computeShortInterestChange,
  SHORT_INTEREST_MIN_REPORTS,
  type ShortInterestReport,
} from './compute-short-interest.ts';
import { zScoreNormalizeWithinSector } from '../shared/z-score-normalize.ts';
import { captureSignalObservations } from '../shared/missingness-capture.ts';
import type { PolygonShortInterestFetcher } from '../shared/polygon-short-interest-fetcher.ts';
import type { PolygonSharesOutstandingFetcher } from '../shared/polygon-shares-outstanding-fetcher.ts';
import type { DaysToCoverRecord, DaysToCoverWriter } from '../shared/days-to-cover-store.ts';
import { type ClockReader, productionClock } from '../../longshort-clock.ts';

/** Locked signal-id for Phase 3 combiner consumption. Do not rename. */
export const SIGNAL_ID = 'short_interest_change_30d';

const DEFAULT_CONCURRENCY = 20;
/** Recent SEC report points to request per ticker. Enough headroom above
 *  SHORT_INTEREST_MIN_REPORTS=3 to absorb the occasional missing report
 *  without dropping below the threshold. */
const SHORT_INTEREST_FETCH_LIMIT = 6;

interface UniverseRow {
  ticker: string;
  gics_sector: string | null;
}

type PerTickerResult =
  | {
    kind: 'value';
    ticker: string;
    raw_signal: number;
    gics_sector: string | null;
    latest_dtc: number | null;
    latest_report_date: string | null;
    /**
     * DW-173 shadow input — the live-derived si_pct_float at T (the
     * latest report point), captured here so the shadow producer can
     * z-score the LEVEL alpha alongside the live ΔSI without a
     * round-trip and without touching the live compute. Same numeric
     * value the compute already consumed for the ΔSI calculation.
     * `null` is reserved for the (defensive) case where the latest
     * report's si_pct_float is non-finite; never fabricated 0 (§9).
     */
    latest_si_pct_float: number | null;
  }
  | {
    kind: 'skip';
    skip: SignalSkip;
    /**
     * Even when a ticker is SKIPPED from the alpha-signal (e.g.
     * `singleton_sector`, `insufficient_history`), its DTC is still
     * captured here when the fetcher returned data — the pre-flight
     * gate runs INDEPENDENT of signal-presence and benefits from DTC
     * on every name Polygon returned. `null` when no fetch happened or
     * the fetcher had no usable DTC.
     */
    ticker?: string;
    latest_dtc?: number | null;
    latest_report_date?: string | null;
  };

/**
 * Context for the short-interest orchestrator. Strict extension of
 * SignalOrchestratorContext to add the TWO non-price fetchers Signal #5
 * requires (FP-041 revision-fix). Keeping `priceHistory` out via `Omit` —
 * it's part of the shared context shape but not consumed by this signal —
 * avoids forcing callers to construct an unrelated dependency.
 */
export interface ShortInterestOrchestratorContext
  extends Omit<SignalOrchestratorContext, 'priceHistory'> {
  shortInterest: PolygonShortInterestFetcher;
  sharesOutstanding: PolygonSharesOutstandingFetcher;
  /**
   * Optional writer for the latest-DTC sibling table that feeds the
   * short-side pre-flight squeeze-avoidance gate (DW-165). When absent
   * the orchestrator simply doesn't persist DTC — production wiring
   * always provides this writer; tests omit it where DTC isn't exercised.
   *
   * IMPORTANT: DTC is written to `short_interest_days_to_cover` ONLY.
   * It MUST NEVER appear in `signal_observations.value` or any other
   * surface that feeds the combiner feature vector.
   */
  daysToCoverWriter?: DaysToCoverWriter;
  /**
   * Injectable wall-clock for orchestrator telemetry (`started_at` /
   * `completed_at`). Defaults to `productionClock`. Compute inputs and
   * the `as_of_date` / `computed_at` financial anchors never touch this
   * clock — they consume `as_of` only (FP-047 pattern, mirrors
   * `analyst-revision-orchestrator.ts`).
   */
  liveClock?: ClockReader;
}

export function createShortInterestOrchestrator(ctx: ShortInterestOrchestratorContext) {
  const liveClock = ctx.liveClock ?? productionClock;
  return {
    async run(as_of: Date): Promise<SignalOrchestratorResult> {
      const ts = as_of.toISOString();
      const as_of_date = ts.slice(0, 10);
      const started_at = liveClock.getWallClockTs().toISOString();
      const finalize = (): string => liveClock.getWallClockTs().toISOString();

      // ── Step 1: load current universe ─────────────────────────────────
      const { data: latestRows, error: latestErr } = await ctx.supabase
        .from('universe_membership')
        .select('as_of_date')
        .eq('operator_id', ctx.operator_id)
        .order('as_of_date', { ascending: false })
        .limit(1);

      if (latestErr) {
        throw new Error(
          `short-interest-orchestrator: universe_membership latest-date read failed: ${latestErr.message}`,
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
          completed_at: finalize(),
        };
      }

      const { data: universeRows, error: universeErr } = await ctx.supabase
        .from('universe_membership')
        .select('ticker, gics_sector')
        .eq('operator_id', ctx.operator_id)
        .eq('as_of_date', latest_as_of_date);

      if (universeErr) {
        throw new Error(
          `short-interest-orchestrator: universe_membership read failed: ${universeErr.message}`,
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
          completed_at: finalize(),
        };
      }

      // ── Step 2: per-ticker fetch + raw short-interest-change signal ───
      const concurrency = ctx.concurrency ?? DEFAULT_CONCURRENCY;
      const perTicker = await pLimitedMap<UniverseRow, PerTickerResult>(
        universe,
        concurrency,
        async (row) => {
          const { ticker, gics_sector } = row;
          try {
            // Parallel fetch: SI reports + shares-outstanding. Two
            // independent Polygon endpoints; no point serializing them.
            // `Promise.all` rejects on the first throw — both fetchers
            // wrap network/HTTP-non-403/404 failures in
            // SignalComputationError, which the outer catch converts to
            // `fetch_error` with ticker context.
            const [siResult, shResult] = await Promise.all([
              ctx.shortInterest.fetchShortInterest(ticker, as_of, SHORT_INTEREST_FETCH_LIMIT),
              ctx.sharesOutstanding.fetchShares(ticker),
            ]);

            // SI fetcher entitlement / data-availability skips. Per §4.3.5
            // non-critical: graceful degradation, NOT a fake zero. The
            // reason discriminates operator-actionable ("subscription_gated"
            // → upgrade tier) from transient ("data_unavailable" → next
            // report cycle).
            if (siResult.kind === 'unavailable') {
              const reason: SignalSkipReason =
                siResult.reason === 'subscription_gated'
                  ? 'subscription_gated'
                  : 'data_unavailable';
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason,
                  detail: siResult.reason === 'subscription_gated'
                    ? 'polygon 403: short-interest endpoint not entitled on current subscription tier'
                    : 'polygon 404: ticker has no short-interest record',
                },
              };
            }

            // Shares-outstanding side input. Treated as a distinct,
            // diagnosable failure mode (`missing_shares_outstanding`) so
            // the operator can tell "no SI data" from "no denominator"
            // when reading skip_counts — they're different remediation
            // paths. NEVER falls back to a fabricated denominator.
            if (shResult.kind === 'unavailable') {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: 'missing_shares_outstanding',
                  detail: shResult.reason === 'subscription_gated'
                    ? 'polygon 403: reference endpoint not entitled (shares-outstanding unavailable)'
                    : 'polygon reference endpoint returned no usable share_class_shares_outstanding',
                },
                ticker,
                ...extractLatestDtc(siResult.reports),
              };
            }

            // ─── Derive si_pct_float per report ─────────────────────────
            // CONSCIOUS APPROXIMATION: `shResult.shares` is CURRENT
            // shares-outstanding, used to denominate BOTH historical SI
            // counts (see file-level comment for the full rationale).
            // Defensive `> 0` is already enforced by the fetcher's
            // typed-absence guard, but we re-check here so this site is
            // the explicit place a divide-by-zero would be caught if a
            // future refactor weakens the fetcher's guard.
            const shares = shResult.shares;
            if (!Number.isFinite(shares) || shares <= 0) {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: 'missing_shares_outstanding',
                  detail: `defensive: shares=${shares} is not a positive finite number`,
                },
                ticker,
                ...extractLatestDtc(siResult.reports),
              };
            }
            const reports: ShortInterestReport[] = siResult.reports.map((r) => ({
              report_date: r.report_date,
              si_pct_float: r.short_interest / shares,
            }));
            const dtc = extractLatestDtc(siResult.reports);
            const raw_signal = computeShortInterestChange(reports);
            if (raw_signal === null) {
              return {
                kind: 'skip',
                skip: {
                  ticker,
                  reason: 'insufficient_history',
                  detail: `${reports.length} reports < ${SHORT_INTEREST_MIN_REPORTS} required`,
                },
                ticker,
                ...dtc,
              };
            }
            // DW-173: capture the latest si_pct_float (LEVEL alpha
            // input). Same numeric value `computeShortInterestChange`
            // consumed at index T; no round-trip, no re-derivation.
            const latest_si_pct_float = reports.length > 0
              ? (() => {
                const v = reports[reports.length - 1].si_pct_float;
                return Number.isFinite(v) ? v : null;
              })()
              : null;
            return {
              kind: 'value',
              ticker,
              raw_signal,
              gics_sector,
              latest_dtc: dtc.latest_dtc,
              latest_report_date: dtc.latest_report_date,
              latest_si_pct_float,
            };
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
      const values = perTicker
        .filter((r): r is Extract<PerTickerResult, { kind: 'value' }> => r.kind === 'value')
        .map((r) => ({ ticker: r.ticker, value: r.raw_signal, gics_sector: r.gics_sector }));
      const skips: SignalSkip[] = perTicker
        .filter((r): r is Extract<PerTickerResult, { kind: 'skip' }> => r.kind === 'skip')
        .map((r) => r.skip);

      const zScored = zScoreNormalizeWithinSector(values);

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
          completed_at: finalize(),
        };
      }

      // ── Step 5b: persist latest-DTC sibling rows (DW-165) ────────────
      // DTC lives in a SEPARATE table from the SI %-of-float observations.
      // This site is the chokepoint enforcing the no-contamination
      // invariant: DTC is fanned out to `short_interest_days_to_cover`
      // and NEVER mixed into `signal_observations.value`.
      if (ctx.daysToCoverWriter) {
        const dtcRows: DaysToCoverRecord[] = [];
        for (const r of perTicker) {
          const ticker = r.kind === 'value' ? r.ticker : r.ticker;
          if (!ticker) continue;
          const latest_dtc = r.kind === 'value' ? r.latest_dtc : (r.latest_dtc ?? null);
          const report_date = r.kind === 'value'
            ? r.latest_report_date
            : (r.latest_report_date ?? null);
          if (!report_date) continue;
          dtcRows.push({
            operator_id: ctx.operator_id,
            ticker,
            as_of_date,
            latest_days_to_cover: latest_dtc,
            report_date,
            updated_at: ts,
          });
        }
        if (dtcRows.length > 0) {
          await ctx.daysToCoverWriter.upsertLatest(dtcRows);
        }
      }

      // ── Step 5c: DW-173 shadow capture (si_level + si_dtc alpha) ─────
      // Per-signal SHADOW table (mechanism 2 — see DW-173 register
      // addendum; the §6.5 `combiner_shadow_variant_config` harness is
      // ranker-tuning-only and cannot hold a new alpha series). Writes
      // to `short_interest_alpha_shadow`, PHYSICALLY SEPARATE from
      // `signal_observations` so the live feature-assembler cannot see
      // it (the assembler reads `signal_observations` for
      // `SIGNAL_IDS_ALL` only — a shadow signal_id there would leak).
      //
      // Within-sector z-score per variant mirrors live #5 (so Phase-7
      // can compare comparable series). Typed-absence per §9: tickers
      // with no usable input for a variant get NO row (matching DW-176
      // reversal_ungated precedent — absence is recorded as absence-of-
      // row, never a fabricated 0). Singleton-sector / missing-sector
      // z-score outputs are also dropped (same precedent).
      //
      // Failure is telemetry-only — swallowed so the live signal-#5
      // path cannot be moved by the shadow. signal_compute_log carries
      // the run outcome; the Phase-7 reader detects gaps.
      try {
        const shadowRows = buildShortInterestShadowRows(
          perTicker,
          ctx.operator_id,
          as_of_date,
          computed_at,
        );
        if (shadowRows.length > 0) {
          const { error: shadowErr } = await ctx.supabase
            .from('short_interest_alpha_shadow')
            .upsert(shadowRows, {
              onConflict: 'operator_id,variant,as_of_date,ticker',
              ignoreDuplicates: true,
            });
          if (shadowErr) {
            // Telemetry-only — MUST NOT fail the live run. The Phase-7
            // reader will detect the gap.
          }
        }
      } catch (_e) {
        // Defensive: any unexpected shadow-path throw is swallowed for
        // the same must-not-move reason. The live path above is fully
        // committed at this point.
      }

      return {
        outcome: 'completed',
        signal_id: SIGNAL_ID,
        as_of_date,
        universe_size: universe.length,
        persisted_count: inserted,
        skipped: skips,
        started_at,
        completed_at: finalize(),
      };
    },
  };
}

/**
 * Extract the latest (most-recent settlement_date) `days_to_cover` value
 * from a fetched SI report set. Reports are guaranteed ASC-sorted by the
 * fetcher — the last entry is the latest. Returns `null` for both fields
 * when the report set is empty.
 */
function extractLatestDtc(
  reports: ReadonlyArray<{ report_date: string; days_to_cover?: number | null }>,
): { latest_dtc: number | null; latest_report_date: string | null } {
  if (reports.length === 0) return { latest_dtc: null, latest_report_date: null };
  const latest = reports[reports.length - 1];
  const dtc = latest.days_to_cover;
  return {
    latest_dtc: typeof dtc === 'number' && Number.isFinite(dtc) ? dtc : null,
    latest_report_date: latest.report_date,
  };
}

/**
 * DW-173 shadow row builder — pure, no I/O. Produces zero-or-more
 * `short_interest_alpha_shadow` rows from the per-ticker results.
 *
 * Two variants, each within-sector z-scored independently:
 *   - `si_level`: input = `latest_si_pct_float` from value results
 *     (level alpha, Asquith/Pathak/Ritter 2005 lineage).
 *   - `si_dtc`:   input = `latest_dtc` from value AND skip results
 *     (DTC alpha, Hong/Li/Ni/Scheinkman/Yan 2016 lineage). DTC is
 *     captured even on alpha-skip paths (e.g. `missing_shares_outstanding`,
 *     `insufficient_history`) because the underlying DTC fetch
 *     succeeded — Phase-7 should see all available DTC observations.
 *
 * Z-score uses the live within-sector helper (clip ±3) for direct
 * comparability to live #5 at Phase-7. Singleton/missing-sector cases
 * yield no row (DW-176 absence-of-row precedent). Sign convention is
 * NOT applied here — Phase-7 weights the level/DTC alpha as part of
 * the promote/stack/keep ablation; baking a literature-prior sign into
 * the shadow data would foreclose that measurement.
 *
 * Exported for test access; pure function.
 */
export function buildShortInterestShadowRows(
  perTicker: ReadonlyArray<PerTickerResult>,
  operator_id: string,
  as_of_date: string,
  computed_at: string,
): Array<{
  operator_id: string;
  variant: 'si_level' | 'si_dtc';
  as_of_date: string;
  ticker: string;
  raw_value: number;
  gics_sector: string | null;
  computed_at: string;
}> {
  // si_level: only value results carry the derived si_pct_float[T].
  const levelInputs: Array<{ ticker: string; value: number | null; gics_sector: string | null }> = [];
  // si_dtc: every result that surfaced a numeric latest_dtc (value OR skip).
  const dtcInputs: Array<{ ticker: string; value: number | null; gics_sector: string | null }> = [];

  for (const r of perTicker) {
    if (r.kind === 'value') {
      if (r.latest_si_pct_float !== null) {
        levelInputs.push({
          ticker: r.ticker,
          value: r.latest_si_pct_float,
          gics_sector: r.gics_sector,
        });
      }
      if (r.latest_dtc !== null && r.latest_dtc !== undefined) {
        dtcInputs.push({
          ticker: r.ticker,
          value: r.latest_dtc,
          gics_sector: r.gics_sector,
        });
      }
    } else {
      // skip kind — DTC may be present even when alpha is skipped.
      // gics_sector is not carried on skip results; the within-sector
      // helper treats null sector as passthrough → null z-score → no
      // shadow row (typed-absence). This is the correct behavior:
      // without sector we cannot produce a comparable z-score.
      const dtc = r.latest_dtc;
      if (r.ticker && dtc !== null && dtc !== undefined) {
        dtcInputs.push({ ticker: r.ticker, value: dtc, gics_sector: null });
      }
    }
  }

  const rows: Array<{
    operator_id: string;
    variant: 'si_level' | 'si_dtc';
    as_of_date: string;
    ticker: string;
    raw_value: number;
    gics_sector: string | null;
    computed_at: string;
  }> = [];

  if (levelInputs.length > 0) {
    const zLevel = zScoreNormalizeWithinSector(levelInputs);
    for (const z of zLevel) {
      if (z.value === null) continue; // singleton/missing-sector → no row
      rows.push({
        operator_id,
        variant: 'si_level',
        as_of_date,
        ticker: z.ticker,
        raw_value: z.value,
        gics_sector: z.gics_sector,
        computed_at,
      });
    }
  }

  if (dtcInputs.length > 0) {
    const zDtc = zScoreNormalizeWithinSector(dtcInputs);
    for (const z of zDtc) {
      if (z.value === null) continue; // singleton/missing-sector → no row
      rows.push({
        operator_id,
        variant: 'si_dtc',
        as_of_date,
        ticker: z.ticker,
        raw_value: z.value,
        gics_sector: z.gics_sector,
        computed_at,
      });
    }
  }

  return rows;
}