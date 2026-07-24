/**
 * overshoot-sweep-diagnostic — FP-069 W3.5.c operator-ratified option (1)
 * offline sweep endpoint. READ-ONLY: no INSERT/UPDATE/DELETE, no cron,
 * no arm-gate interaction. Runs the SAME detector wiring the live handler
 * uses (kernel SELECT → SI read → study-cell lookup → runDetector) for
 * each trading day in a caller-provided window and returns a summary
 * table + recommendation. NEVER persists a run row or event row.
 *
 * Contract (three modes — pick one per call; per-day kernel is ~40-50s,
 * platform idle timeout is 150s, so a full range CANNOT be swept in a
 * single invocation):
 *   (a) ENUMERATE (fast, no detector): POST { as_of_start, as_of_end }
 *       → returns { trading_days: [...] } for the caller to loop over.
 *   (b) SINGLE  (one detector pass):   POST { as_of }
 *   (c) BATCH   (≤3 detector passes):  POST { as_of_list: [...] }
 *   correlation_id?: string on all three.
 *   Auth: DEC-023 envelope + overshoot.manage RBAC (same as detection-run).
 *
 * Guardrails codified in this file:
 *   - No writes to any table (grep-audit: no INSERT/UPDATE/DELETE keywords
 *     outside of the SELECT-only kernel body sourced from event-detection.sql.ts).
 *   - Dummy runId ('00000000-...-000') passed to detector; never used as FK.
 *   - Window capped at 60 calendar days to prevent runaway sweeps.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

import EVENT_DETECTION_SQL from '../_shared/overshoot/study/event-detection.sql.ts';
import {
  runDetector,
  RATIFIED_STUDY_RUN_ID,
  type DetectorInput,
  type KernelCandidateRow,
  type ShortInterestRow,
  type Side,
  type StudyCellKey,
  type StudyCellStats,
} from '../_shared/overshoot/detector/detector.ts';
import { bandLabelFor } from '../_shared/overshoot/detector/band-label.ts';

// Handler-verbatim constants (overshoot-detection-run/index.ts:140-152).
// ═══ 2026-07-23 CADENCE AMENDMENT — SI envelope 20 → 26 (H-1 fix) ══════
// Per-row SI envelope aligned to FINRA natural max age (15d settlement +
// ~11d publication lag = ~24-26 calendar days between cycles). String-
// identical to `overshoot-detection-run/index.ts` — both sites MUST stay
// in lockstep so diagnostic funnels mirror production windowing. Grep
// `DETECTOR_SI_STALENESS_MAX_DAYS` before any future flip. Shared-home
// refactor queued as DW-234. Detector composite `aff20a13` UNTOUCHED (this
// is data-fetch envelope, not detector.ts predicate).
const DETECTOR_EXCLUSION_WIDTH_DAYS = 5;
const DETECTOR_CAPACITY_PER_SIDE = 20;
const DETECTOR_LONG_EXCESS_THRESHOLD = 0.10;
const DETECTOR_SHORT_EXCESS_THRESHOLD = 0.08;
const DETECTOR_SQUEEZE_SI_PCT_FLOAT_MIN = 0.20;
const DETECTOR_SI_STALENESS_MAX_DAYS = 26;
const DETECTOR_LONG_WINDOWS = [1, 2, 3] as const;
const DETECTOR_SHORT_WINDOWS = [1, 2, 3, 4, 5] as const;
const DETECTOR_LONG_MOMENTUM = [4, 5] as const;
const DETECTOR_SHORT_MOMENTUM = [1, 5] as const;
const DETECTOR_LONG_DRAWDOWN = [1, 2, 3] as const;
const DETECTOR_SHORT_DRAWDOWN = [4, 5] as const;
const DETECTOR_MIN_BAND_BPS = 300;
const DUMMY_RUN_ID = '00000000-0000-0000-0000-000000000000';
const MAX_WINDOW_DAYS = 60;
const MAX_BATCH_DAYS = 3;

function stripStatementBody(sql: string): string {
  let s = sql;
  for (;;) {
    const before = s;
    s = s.replace(/\s+$/, '');
    s = s.replace(/(^|\n)[ \t]*--[^\n]*$/, '');
    s = s.replace(/;\s*$/, '');
    if (s === before) return s;
  }
}
function bindNamed(sql: string, names: readonly string[]): string {
  let out = sql;
  names.forEach((n, i) => {
    const re = new RegExp(`:${n}\\b`, 'g');
    out = out.replace(re, `$${i + 1}`);
  });
  return out;
}
const DETECTION_PARAM_ORDER = [
  'run_id',
  'bars_snapshot_max_date',
  'earnings_snapshot_max_date',
  'min_band_bps',
  'lookback_min_date',
  'event_date_min',
  'event_date_max',
] as const;

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0,4), +a.slice(5,7)-1, +a.slice(8,10));
  const db = Date.UTC(+b.slice(0,4), +b.slice(5,7)-1, +b.slice(8,10));
  return Math.round((db - da) / 86_400_000);
}

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method !== 'POST') return apiError(405, 'method_not_allowed', { correlationId });

  const authCtx = await authenticateRequest(req);
  await checkPermissionOrThrow(authCtx.user.id, 'overshoot.manage');

  let body: Record<string, unknown> = {};
  try { body = ((await req.json()) as Record<string, unknown>) ?? {}; }
  catch { return apiError(400, 'invalid_json_body', { correlationId }); }

  const asOfSingle = body.as_of as string | undefined;
  const asOfList = body.as_of_list as string[] | undefined;
  const startRaw = body.as_of_start as string | undefined;
  const endRaw = body.as_of_end as string | undefined;

  // Resolve mode.
  let mode: 'enumerate' | 'single' | 'batch';
  let requestedDates: string[] = [];
  let start = '', end = '';
  if (asOfSingle) {
    mode = 'single';
    const d = parseAsOfDate(asOfSingle);
    if (!d) return apiError(400, 'as_of_invalid_format_expected_YYYY_MM_DD', { correlationId });
    requestedDates = [d.toISOString().slice(0, 10)];
  } else if (Array.isArray(asOfList) && asOfList.length > 0) {
    mode = 'batch';
    if (asOfList.length > MAX_BATCH_DAYS) return apiError(400, `as_of_list_exceeds_${MAX_BATCH_DAYS}`, { correlationId });
    for (const s of asOfList) {
      const d = parseAsOfDate(s);
      if (!d) return apiError(400, 'as_of_list_invalid_format_expected_YYYY_MM_DD', { correlationId });
      requestedDates.push(d.toISOString().slice(0, 10));
    }
  } else if (startRaw && endRaw) {
    mode = 'enumerate';
    const startDate = parseAsOfDate(startRaw);
    const endDate = parseAsOfDate(endRaw);
    if (!startDate || !endDate) return apiError(400, 'as_of_invalid_format_expected_YYYY_MM_DD', { correlationId });
    start = startDate.toISOString().slice(0, 10);
    end = endDate.toISOString().slice(0, 10);
    if (daysBetween(start, end) < 0) return apiError(400, 'as_of_end_before_start', { correlationId });
    if (daysBetween(start, end) > MAX_WINDOW_DAYS) return apiError(400, `window_exceeds_${MAX_WINDOW_DAYS}_days`, { correlationId });
  } else {
    return apiError(400, 'expected_as_of_or_as_of_list_or_as_of_start_and_as_of_end', { correlationId });
  }

  const dbUrl = Deno.env.get('SUPABASE_DB_URL') ?? '';
  if (!dbUrl) return apiError(500, 'db_url_unset', { correlationId });
  const sql = postgres(dbUrl, { max: 1, prepare: false, connect_timeout: 15 });

  try {
    // Determine trading days.
    let sweepDates: string[];
    if (mode === 'enumerate') {
      const tradingRows = await sql<{ trade_date: string }[]>`
        SELECT DISTINCT trade_date::text AS trade_date
        FROM overshoot_daily_bars
        WHERE trade_date BETWEEN ${start}::date AND ${end}::date
        ORDER BY trade_date
      `;
      sweepDates = tradingRows.map((r) => r.trade_date);
      await sql.end({ timeout: 5 });
      return apiSuccess({
        ok: true,
        correlation_id: correlationId,
        mode,
        sweep_window: { start, end, trading_days: sweepDates.length },
        trading_days: sweepDates,
        per_date: [],
        recommendation: { pick: null, rationale: 'enumerate_only_no_detector_run' },
        read_only: true,
        bracket_touched: false,
        next_step: 'Invoke with { as_of: "<date>" } for each trading day and aggregate client-side.',
      });
    } else {
      // single | batch: filter requested dates to those that are actual trading days.
      const tradingRows = await sql<{ trade_date: string }[]>`
        SELECT DISTINCT trade_date::text AS trade_date
        FROM overshoot_daily_bars
        WHERE trade_date = ANY(${requestedDates}::date[])
        ORDER BY trade_date
      `;
      sweepDates = tradingRows.map((r) => r.trade_date);
    }

    // Study cells — one read, ratified priors.
    const cellRows = await sql<{ side: string; band: string; window_days: number; momentum_quintile: number; drawdown_bucket: number; exclusion_width_days: number; arrival_count: number; mean_fwd_return_5d: number | null }[]>`
      SELECT side, band, window_days, momentum_quintile, drawdown_bucket, exclusion_width_days, arrival_count, mean_fwd_return_5d
      FROM overshoot_study_cell_results
      WHERE run_id = ${RATIFIED_STUDY_RUN_ID}::uuid
    `;
    const cellMap = new Map<string, StudyCellStats>();
    const cellKey = (k: StudyCellKey) =>
      `${k.side}|${k.band}|${k.window_days}|${k.momentum_quintile}|${k.drawdown_bucket}|${k.exclusion_width_days}`;
    for (const c of cellRows) {
      cellMap.set(cellKey({
        side: c.side.toUpperCase() as Side,
        band: c.band, window_days: c.window_days,
        momentum_quintile: c.momentum_quintile, drawdown_bucket: c.drawdown_bucket,
        exclusion_width_days: c.exclusion_width_days,
      }), { arrival_count: c.arrival_count, mean_fwd_return_5d: c.mean_fwd_return_5d === null ? null : Number(c.mean_fwd_return_5d) });
    }

    const [snap] = await sql<{ lookback_min: string }[]>`
      SELECT (SELECT MIN(trade_date) + 252 FROM overshoot_daily_bars) AS lookback_min
    `;
    const detectionCore = bindNamed(stripStatementBody(EVENT_DETECTION_SQL), DETECTION_PARAM_ORDER);

    type PerDate = {
      as_of: string;
      candidates: number;
      groups_ticker_side: number;
      selected_long: number;
      selected_short: number;
      top_refusals: Array<{ reason: string; count: number }>;
      top_selected: Array<{ ticker: string; side: string; rank_score: number | null; excess_at_argmax: number | null; band: string | null; window_days: number | null }>;
    };
    const perDate: PerDate[] = [];

    for (const asOf of sweepDates) {
      const rows = await sql.unsafe(detectionCore, [
        DUMMY_RUN_ID, asOf, asOf, DETECTOR_MIN_BAND_BPS, snap.lookback_min, asOf, asOf,
      ]);
      const candidates: KernelCandidateRow[] = (rows as Array<Record<string, unknown>>).map((r) => ({
        run_id: DUMMY_RUN_ID,
        ticker: String(r.ticker),
        event_date: String(r.event_date).slice(0, 10),
        side: (String(r.side).toUpperCase()) as Side,
        move_pct: Number(r.move_pct),
        window_days: Number(r.window_days),
        excess_w1: r.excess_w1 === null ? null : Number(r.excess_w1),
        excess_w2: r.excess_w2 === null ? null : Number(r.excess_w2),
        excess_w3: r.excess_w3 === null ? null : Number(r.excess_w3),
        excess_w4: r.excess_w4 === null ? null : Number(r.excess_w4),
        excess_w5: r.excess_w5 === null ? null : Number(r.excess_w5),
        momentum_quintile: r.momentum_quintile === null ? null : Number(r.momentum_quintile),
        drawdown_bucket: r.drawdown_bucket === null ? null : Number(r.drawdown_bucket),
        days_to_nearest_earnings: r.days_to_nearest_earnings === null ? null : Number(r.days_to_nearest_earnings),
        alias_used: r.alias_used === null ? null : String(r.alias_used),
      }));

      const siRows = await sql<{ ticker: string; as_of_date: string; si_pct_float: number | null; dtc: number | null }[]>`
        SELECT ticker, as_of_date::text AS as_of_date, si_pct_float, dtc
        FROM overshoot_short_interest
        WHERE as_of_date <= ${asOf}::date
          AND as_of_date >= (${asOf}::date - ${DETECTOR_SI_STALENESS_MAX_DAYS}::int)
      `;
      const shortInterest = new Map<string, ShortInterestRow>();
      for (const r of siRows) {
        const existing = shortInterest.get(r.ticker);
        if (!existing || existing.as_of_date < r.as_of_date) {
          shortInterest.set(r.ticker, {
            ticker: r.ticker, as_of_date: r.as_of_date,
            si_pct_float: r.si_pct_float === null ? null : Number(r.si_pct_float),
            dtc: r.dtc === null ? null : Number(r.dtc),
          });
        }
      }

      const detectorInput: DetectorInput = {
        candidates,
        shortInterest,
        params: {
          runId: DUMMY_RUN_ID,
          asOf,
          capacityPerSide: DETECTOR_CAPACITY_PER_SIDE,
          squeezeSiPctFloatMin: DETECTOR_SQUEEZE_SI_PCT_FLOAT_MIN,
          siStalenessMaxDays: DETECTOR_SI_STALENESS_MAX_DAYS,
          exclusionWidthDays: DETECTOR_EXCLUSION_WIDTH_DAYS,
          longExcessThreshold: DETECTOR_LONG_EXCESS_THRESHOLD,
          shortExcessThreshold: DETECTOR_SHORT_EXCESS_THRESHOLD,
          longWindowSet: DETECTOR_LONG_WINDOWS,
          shortWindowSet: DETECTOR_SHORT_WINDOWS,
          longMomentumSet: DETECTOR_LONG_MOMENTUM,
          shortMomentumSet: DETECTOR_SHORT_MOMENTUM,
          longDrawdownSet: DETECTOR_LONG_DRAWDOWN,
          shortDrawdownSet: DETECTOR_SHORT_DRAWDOWN,
          bandLabelFor,
          studyCellLookup: (k) => cellMap.get(cellKey(k)) ?? null,
        },
      };
      const events = runDetector(detectorInput);
      const selected = events.filter((e) => e.selected_for_entry);
      const refusals: Record<string, number> = {};
      for (const e of events) {
        if (e.filter_refusal_reason) {
          refusals[e.filter_refusal_reason] = (refusals[e.filter_refusal_reason] ?? 0) + 1;
        }
      }
      const topRefusals = Object.entries(refusals)
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([reason, count]) => ({ reason, count }));

      perDate.push({
        as_of: asOf,
        candidates: candidates.length,
        groups_ticker_side: events.length,
        selected_long: selected.filter((e) => e.side === 'LONG').length,
        selected_short: selected.filter((e) => e.side === 'SHORT').length,
        top_refusals: topRefusals,
        top_selected: selected.slice(0, 5).map((e) => {
          const excesses = [e.excess_w1, e.excess_w2, e.excess_w3, e.excess_w4, e.excess_w5];
          const w = e.argmax_window_days;
          const exAt = (w !== null && w >= 1 && w <= 5) ? excesses[w - 1] : null;
          return {
            ticker: e.ticker,
            side: e.side,
            rank_score: e.rank_score,
            excess_at_argmax: exAt,
            band: e.study_cell_ref?.band ?? null,
            window_days: w,
          };
        }),
      });
    }

    await sql.end({ timeout: 5 });

    const bothSided = perDate.find((d) => d.selected_long >= 1 && d.selected_short >= 1);
    const anySelection = perDate.find((d) => d.selected_long + d.selected_short >= 1);
    const recommendation = bothSided
      ? { pick: bothSided.as_of, rationale: 'both_sided_selection' }
      : anySelection
      ? { pick: anySelection.as_of, rationale: 'single_sided_selection' }
      : { pick: null, rationale: 'sweep_empty_stop_and_report' };

    return apiSuccess({
      ok: true,
      correlation_id: correlationId,
      mode,
      requested_dates: requestedDates,
      trading_days_processed: sweepDates,
      per_date: perDate,
      recommendation,
      read_only: true,
      bracket_touched: false,
    });
  } catch (err) {
    try { await sql.end({ timeout: 5 }); } catch { /* noop */ }
    console.error(JSON.stringify({ event: 'sweep_unhandled', correlationId, err: String(err) }));
    return apiError(500, 'sweep_unhandled_error', { correlationId });
  }
}));
