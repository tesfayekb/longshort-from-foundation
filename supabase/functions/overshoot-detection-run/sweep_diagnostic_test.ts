/**
 * sweep_diagnostic_test.ts — READ-ONLY offline detector sweep for
 * FP-069 W3.5.c first-light candidate-date discovery (operator ratified,
 * option (1)). Sweeps 2026-06-16..2026-07-02 through the same in-process
 * detector wiring the handler uses (kernel SELECT → SI read → study-cell
 * lookup → runDetector), WITHOUT writing to any table and WITHOUT touching
 * the arm gate. Emits a per-date summary + candidate winner.
 *
 * Guardrails:
 *   - No INSERT / UPDATE / DELETE (verified by grep in this file).
 *   - Uses SUPABASE_DB_URL (same as handler).
 *   - Does not go through the overshoot-detection-run edge endpoint.
 *   - Prints a machine-readable JSON block delimited by
 *     `--- SWEEP_BEGIN ---` / `--- SWEEP_END ---` for paste-back.
 */
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

// Handler-verbatim constants (see overshoot-detection-run/index.ts:92-106).
const DETECTOR_EXCLUSION_WIDTH_DAYS = 5;
const DETECTOR_CAPACITY_PER_SIDE = 20;
const DETECTOR_LONG_EXCESS_THRESHOLD = 0.10;
const DETECTOR_SHORT_EXCESS_THRESHOLD = 0.08;
const DETECTOR_SQUEEZE_SI_PCT_FLOAT_MIN = 0.20;
const DETECTOR_SI_STALENESS_MAX_DAYS = 20;
const DETECTOR_LONG_WINDOWS = [1, 2, 3] as const;
const DETECTOR_SHORT_WINDOWS = [1, 2, 3, 4, 5] as const;
const DETECTOR_LONG_MOMENTUM = [4, 5] as const;
const DETECTOR_SHORT_MOMENTUM = [1, 5] as const;
const DETECTOR_LONG_DRAWDOWN = [1, 2, 3] as const;
const DETECTOR_SHORT_DRAWDOWN = [4, 5] as const;
const DETECTOR_MIN_BAND_BPS = 300;

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

// Trading days in-window (US equities, holidays observed). 06-19 Juneteenth
// omitted; weekends omitted.
const SWEEP_DATES = [
  '2026-06-16','2026-06-17','2026-06-18','2026-06-22','2026-06-23',
  '2026-06-24','2026-06-25','2026-06-26','2026-06-29','2026-06-30',
  '2026-07-01','2026-07-02',
];

Deno.test({
  name: 'w35c-sweep-2026-06-16-to-2026-07-02',
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const url = Deno.env.get('SUPABASE_DB_URL');
    if (!url) throw new Error('SUPABASE_DB_URL unset');
    const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 15 });

    // Study cells (once — same ratified study run).
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
      top_selected: Array<{ ticker: string; side: string; rank_score: number | null; excess: number | null; band: string | null }>;
    };
    const perDate: PerDate[] = [];

    for (const asOf of SWEEP_DATES) {
      const rows = await sql.unsafe(detectionCore, [
        '00000000-0000-0000-0000-000000000000', // dummy run_id (not persisted)
        asOf, asOf, DETECTOR_MIN_BAND_BPS, snap.lookback_min, asOf, asOf,
      ]);
      const candidates: KernelCandidateRow[] = (rows as Array<Record<string, unknown>>).map((r) => ({
        run_id: '00000000-0000-0000-0000-000000000000',
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
          runId: '00000000-0000-0000-0000-000000000000',
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
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count }));

      perDate.push({
        as_of: asOf,
        candidates: candidates.length,
        groups_ticker_side: events.length,
        selected_long: selected.filter((e) => e.side === 'LONG').length,
        selected_short: selected.filter((e) => e.side === 'SHORT').length,
        top_refusals: topRefusals,
        top_selected: selected.slice(0, 5).map((e) => ({
          ticker: e.ticker,
          side: e.side,
          rank_score: e.rank_score,
          excess: e.argmax_window_days
            ? (e.side === 'LONG'
                ? Math.max(e.excess_w1 ?? 0, e.excess_w2 ?? 0, e.excess_w3 ?? 0, e.excess_w4 ?? 0, e.excess_w5 ?? 0)
                : Math.min(e.excess_w1 ?? 0, e.excess_w2 ?? 0, e.excess_w3 ?? 0, e.excess_w4 ?? 0, e.excess_w5 ?? 0))
            : null,
          band: e.study_cell_ref?.band ?? null,
        })),
      });
    }

    await sql.end({ timeout: 5 });

    // Emit paste-back block.
    const bothSided = perDate.find((d) => d.selected_long >= 1 && d.selected_short >= 1);
    const anySelection = perDate.find((d) => d.selected_long + d.selected_short >= 1);
    const recommendation = bothSided
      ? { pick: bothSided.as_of, rationale: 'both_sided_selection' }
      : anySelection
      ? { pick: anySelection.as_of, rationale: 'single_sided_selection' }
      : { pick: null, rationale: 'sweep_empty_stop_and_report' };

    console.log('--- SWEEP_BEGIN ---');
    console.log(JSON.stringify({
      sweep_window: { start: SWEEP_DATES[0], end: SWEEP_DATES[SWEEP_DATES.length - 1], trading_days: SWEEP_DATES.length },
      per_date: perDate,
      recommendation,
    }, null, 2));
    console.log('--- SWEEP_END ---');
  },
});