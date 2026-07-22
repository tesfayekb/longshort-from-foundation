/**
 * overshoot-detection-run — FP-069 W3.5.b-i (ACT-462.b-i).
 *
 * EOD detection cron handler. NOT armed at seed (job_registry.enabled=false
 * per MIG-152); operator flips to enabled=true only at W3.5.c-arm after
 * GATE-ZERO probe attestation from the deployed edge runtime.
 *
 * Contract (all operator-ratified — do NOT drift):
 *   Request  : POST { as_of?: 'YYYY-MM-DD', probe?: 'alpaca'|'polygon', dry_run?: boolean }
 *   Auth     : DEC-023 envelope via createHandler + authenticateRequest + overshoot.manage RBAC.
 *   Clock    : injected productionClock (never Date.now() in kernel/reconciliation code).
 *   Boot     : assertStudyProvenance-shape assertion against overshoot_study_runs:
 *              exactly one row with run_id = RATIFIED_STUDY_RUN_ID AND
 *              param_grid_hash LIKE '<RATIFIED_PARAM_GRID_HASH_PREFIX>%' AND
 *              outcome='completed'. Fail → typed boot_assertion_failed_priors_not_found 500.
 *   Probes   : body.probe short-circuits BEFORE the three skip gates. Returns a
 *              probe-only envelope; no pipeline stage runs. Actual live vendor
 *              probes wire in W3.5.c (this tranche only proves the branch).
 *   Gates    : (i) kill-switch (kill_switches WHERE strategy_key='overshoot' AND
 *                  state IN ('hard_paused','soft_paused','liquidating')),
 *              (ii) job-disarmed (job_registry.enabled=false for this id),
 *              (iii) probe (request-level short-circuit; see above).
 *   Pipeline : bars-append → forward-earnings-append → earnings_calendar_stale
 *              → kernel live-parameterized (event_date_min=event_date_max=as_of;
 *              runner-parity bind via EVENT_DETECTION_SQL) → SI read (staleness
 *              window) → detector (pure, unmodified) → persist run + events +
 *              target_positions for selected. dry_run persists only a
 *              dry-marked run row (zero event/target rows).
 *   Refusals : each append-leg refusal → typed run outcome, NEVER swallowed:
 *                BarsMissingForAsofError       → outcome 'no_op', reason 'bars_missing_for_asof'
 *                BenchmarksMissingError        → outcome 'failed', reason 'benchmarks_missing'
 *                EarningsCalendarCapBreachError→ outcome 'failed', reason 'earnings_calendar_cap_breach'
 *                earnings_calendar_stale=true  → outcome 'no_op', reason 'earnings_calendar_stale'
 *   Persist  : per A4-verified columns (overshoot_detection_runs, overshoot_events,
 *              overshoot_target_positions) + append_run_ids jsonb linkage
 *              (MIG-152: { bars: <backfill_run_id>, earnings: <backfill_run_id | null> }).
 *
 * Append-attribution (A2 ratification, MIG-152): each same-day append leg
 * inserts an overshoot_backfill_runs row with existing kinds ('bars',
 * 'earnings_fmp') BEFORE the upsert; captured run_id becomes the
 * source_run_id on every upserted row AND the linkage stashed in
 * overshoot_detection_runs.append_run_ids. No kind-enum extension.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

import EVENT_DETECTION_SQL from '../_shared/overshoot/study/event-detection.sql.ts';

import {
  buildBarsAppendRows,
  BarsMissingForAsofError,
  BenchmarksMissingError,
  REQUIRED_BENCHMARKS,
} from '../_shared/overshoot/bars-append.ts';
import {
  appendForwardEarnings,
  EarningsCalendarCapBreachError,
  isEarningsCalendarStale,
  DEFAULT_EARNINGS_CALENDAR_STALENESS_HOURS,
} from '../_shared/overshoot/forward-earnings-append.ts';
import { PolygonGroupedDailyFetcher } from '../_shared/overshoot/polygon-grouped-daily-fetcher.ts';
import { FmpEarningsCalendarFetcher } from '../_shared/overshoot/earnings-calendar-fetcher.ts';
import {
  OvershootAlpacaPaperClient,
  OvershootAlpacaApiError,
  OvershootAlpacaCredentialError,
  OvershootAlpacaNetworkError,
} from '../_shared/overshoot-broker/alpaca-paper-client.ts';
import {
  runDetector,
  RATIFIED_STUDY_RUN_ID,
  RATIFIED_PARAM_GRID_HASH_PREFIX,
  RATIFIED_DETECTOR_VERSION,
  emptyRefusalCounts,
  tallyRefusalCounts,
  type DetectedEvent,
  type DetectorInput,
  type KernelCandidateRow,
  type ShortInterestRow,
  type Side,
  type StudyCellKey,
  type StudyCellStats,
} from '../_shared/overshoot/detector/detector.ts';
import { bandLabelFor } from '../_shared/overshoot/detector/band-label.ts';
import {
  analystRevisionStaleWarnActive,
  OVERSHOOT_ANALYST_REVISION_STALENESS_MAX_DAYS_DEFAULT,
  OVERSHOOT_ANALYST_REVISION_STALENESS_WARN_AT_DAYS_DEFAULT,
  siStaleActive,
  overshootSleeveAllocation,
  OVERSHOOT_SI_STALENESS_MAX_DAYS_DEFAULT,
} from '../_shared/overshoot/si-freshness.ts';
import {
  resolveSleeveContext,
  maybeWriteSleeveTransition,
  decideTransition,
  resolveW5ReallocationRef,
} from '../_shared/overshoot/sleeve-reallocation-writer.ts';

// ── Live-detection defaults. Named parameters, provenance in comments. ────────
// Ratified priors (FP-069 W3): exclusion_width=5, capacity LONG=36 / SHORT=4
// (ACT-490 — deployment dial, provenance-bound to T3b sizing constants
// OVERSHOOT_CAPACITY_LONG=36 / OVERSHOOT_CAPACITY_SHORT=4 in
// `_shared/overshoot-execution/sizing.ts`; enforces `|selections| <=
// sleeve-slots per side` structurally, closes the SHORT 5× over-deployment
// hazard). Thresholds L=0.10 S=0.08, window sets L={1,2,3} S={1..5},
// momentum L={4,5} S={1,5}, drawdown L={1,2,3} S={4,5}, squeeze SI% min =
// 0.20 (20% of float), SI staleness = 20 calendar days.
const DETECTOR_EXCLUSION_WIDTH_DAYS = 5;
const DETECTOR_CAPACITY_LONG = 36;
const DETECTOR_CAPACITY_SHORT = 4;
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
const EARNINGS_CAP_ROWS = 4000;
const EARNINGS_MARGIN_DAYS = 2;

/** Strip trailing `;` + comment tail so the SELECT can be re-bound. Mirrors
 *  overshoot-study-run.ts:89-110 verbatim in behaviour. */
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

// bandLabelFor is imported from `_shared/overshoot/detector/band-label.ts`.
// The prior in-handler classifier returned `10pct_wN` — a label that never
// intersected the real study-side namespace (`{L,S}_03_04..{L,S}_10_INF`),
// zeroing selection on both sides at W3.5.c first-light. Current form is a
// signed-excess magnitude-bin classifier, verbatim-mirrored from
// `_shared/overshoot/study/cell-aggregation.sql.ts` (see band-label.ts).

interface Env {
  supabaseDbUrl: string;
  polygonKey: string;
  fmpKey: string;
  gitSha: string;
}
function readEnv(): Env {
  const supabaseDbUrl = Deno.env.get('SUPABASE_DB_URL') ?? '';
  const polygonKey = Deno.env.get('POLYGON_API_KEY_PROD_PROBE') ?? '';
  const fmpKey = Deno.env.get('FMP_API_KEY') ?? '';
  const gitSha = Deno.env.get('BUILD_SHA') ?? 'unknown';
  return { supabaseDbUrl, polygonKey, fmpKey, gitSha };
}

type Outcome = 'running' | 'completed' | 'failed' | 'no_op';

interface RunRecord {
  run_id: string;
  outcome: Outcome;
  reason?: string;
  event_count: number;
  selected_count: number;
  durations_ms: Record<string, number>;
  append_run_ids: { bars: string | null; earnings: string | null };
  dry_run: boolean;
  correlation_id: string;
}

/**
 * DEC-023 handler. Order of concerns:
 *   1. Method + JSON parse (before auth so we can surface 4xx cleanly).
 *   2. RBAC (overshoot.manage).
 *   3. Boot assertion (fail-fast BEFORE any pipeline stage).
 *   4. Probe short-circuit (branches out; no pipeline).
 *   5. Skip gates (kill-switch, disarmed).
 *   6. Pipeline (bars → earnings → staleness → kernel → SI → detector → persist).
 */
Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId });
  }

  // INC-99 / ACT-503: cron-first branch mirrors overshoot-fill-sweep
  // (supabase/functions/overshoot-fill-sweep/index.ts:132-143). See INC-99.
  if (req.headers.has('X-Cron-Secret')) {
    const cronAuthError = verifyCronSecret(req);
    if (cronAuthError) return cronAuthError;
  } else {
    const authCtx = await authenticateRequest(req);
    await checkPermissionOrThrow(authCtx.user.id, 'overshoot.manage');
  }

  let body: Record<string, unknown> = {};
  try {
    body = ((await req.json()) as Record<string, unknown>) ?? {};
  } catch {
    return apiError(400, 'invalid_json_body', { correlationId });
  }

  const asOfRaw = body.as_of as string | undefined;
  const asOfDate = asOfRaw ? parseAsOfDate(asOfRaw) : productionClock.getWallClockTs();
  if (!asOfDate) return apiError(400, 'as_of_invalid_format_expected_YYYY_MM_DD', { correlationId });
  const asOfDay = asOfDate.toISOString().slice(0, 10);
  const dryRun = body.dry_run === true;
  const probeMode = body.probe as ('alpaca' | 'polygon' | undefined);
  if (probeMode !== undefined && probeMode !== 'alpaca' && probeMode !== 'polygon') {
    return apiError(400, 'probe_invalid_expected_alpaca_or_polygon', { correlationId });
  }

  const env = readEnv();
  if (!env.supabaseDbUrl) return apiError(500, 'db_url_unset', { correlationId });

  const sql = postgres(env.supabaseDbUrl, { max: 1, prepare: false, connect_timeout: 10 });

  try {
    // ── (3) Boot assertion — before ANY pipeline stage or gate. ───────────
    // Typed hard-fail if the ratified study run row is missing OR its
    // param_grid_hash does not match the ratified prefix OR it is not
    // outcome='completed'. Zero pipeline effect on failure.
    const priors = await sql<{ run_id: string; param_grid_hash: string; outcome: string }[]>`
      SELECT run_id, param_grid_hash, outcome
      FROM overshoot_study_runs
      WHERE run_id = ${RATIFIED_STUDY_RUN_ID}::uuid
        AND param_grid_hash LIKE ${RATIFIED_PARAM_GRID_HASH_PREFIX + '%'}
        AND outcome = 'completed'
    `;
    if (priors.length !== 1) {
      await sql.end({ timeout: 5 });
      console.error(JSON.stringify({
        event: 'boot_assertion_failed_priors_not_found',
        correlationId,
        expected_run_id: RATIFIED_STUDY_RUN_ID,
        expected_hash_prefix: RATIFIED_PARAM_GRID_HASH_PREFIX,
        rows_found: priors.length,
      }));
      return apiError(500, 'boot_assertion_failed_priors_not_found', { correlationId });
    }

    // FP-069 W3.8 T2.4 (ACT-479) — RATIFIED_DETECTOR_VERSION boot assertion
    // (single-home invariant tightening). The constant is imported from
    // detector.ts; this assertion proves the deployed bundle carries the
    // ratified detector-version identity (b7cdfcd8, 8-hex prefix of
    // sha256(study_full_hash ‖ DETECTOR_PREDICATE_SPEC_V2_JSON)). Absent /
    // malformed → typed hard-fail before any pipeline stage. Entry/exit
    // handlers get their own copy at T3 per minimum-coupling (§22.3(c)) —
    // their bundles are stale on this constant until then and would false-trip
    // if asserted here. INC-84 §5 bundle-content version echo:
    // RATIFIED_DETECTOR_VERSION is surfaced in the dry-run response envelope
    // (see the completion return below) making every dry-run self-attesting.
    if (typeof RATIFIED_DETECTOR_VERSION !== 'string' || !/^[0-9a-f]{8}$/.test(RATIFIED_DETECTOR_VERSION)) {
      await sql.end({ timeout: 5 });
      console.error(JSON.stringify({
        event: 'boot_assertion_failed_detector_version_malformed',
        correlationId,
        loaded_value_typeof: typeof RATIFIED_DETECTOR_VERSION,
        loaded_value_length: typeof RATIFIED_DETECTOR_VERSION === 'string' ? RATIFIED_DETECTOR_VERSION.length : null,
      }));
      return apiError(500, 'boot_assertion_failed_detector_version_malformed', { correlationId });
    }

    // ── (4) Probe short-circuit — BEFORE the three skip gates. ────────────
    if (probeMode !== undefined) {
      await sql.end({ timeout: 5 });
      // W3.5.c GATE-ZERO wiring (ratified α). Transcribes the proven pattern
      // from overshoot-short-interest-compute:222-282. Probes NEVER touch the
      // DB and NEVER emit secret material beyond the AZD5-comparator last-4.
      if (probeMode === 'alpaca') {
        try {
          const client = new OvershootAlpacaPaperClient();
          const account = await client.getJson<{ account_number?: string; status?: string }>(
            '/v2/account',
          );
          const acct = typeof account.account_number === 'string' ? account.account_number : '';
          const account_last4 = acct.length >= 4 ? acct.slice(-4) : null;
          return apiSuccess({
            ok: true,
            probe: 'alpaca',
            account_last4,
            status: typeof account.status === 'string' ? account.status : null,
            paper: true,
            detector_version: RATIFIED_DETECTOR_VERSION,
            correlation_id: correlationId,
          });
        } catch (e) {
          const detail =
            e instanceof OvershootAlpacaApiError
              ? `alpaca_api_error status=${e.status} endpoint=${e.endpoint}`
              : e instanceof OvershootAlpacaCredentialError
              ? 'alpaca_credential_missing'
              : e instanceof OvershootAlpacaNetworkError
              ? `alpaca_network_error endpoint=${e.endpoint}`
              : e instanceof Error ? e.message : String(e);
          console.error('[overshoot-detection-run] alpaca probe failed:', detail, { correlationId });
          return apiError(502, 'alpaca_probe_failed', { correlationId });
        }
      }
      // probeMode === 'polygon' — grouped-daily against POLYGON_API_KEY_PROD_PROBE.
      if (!env.polygonKey) return apiError(500, 'polygon_key_unset', { correlationId });
      try {
        const fetcher = new PolygonGroupedDailyFetcher(env.polygonKey);
        const grouped = await fetcher.fetchGroupedDaily(asOfDate);
        return apiSuccess({
          ok: true,
          probe: 'polygon',
          as_of_probed: asOfDay,
          resultsCount: grouped.resultsCount,
          detector_version: RATIFIED_DETECTOR_VERSION,
          correlation_id: correlationId,
        });
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        console.error('[overshoot-detection-run] polygon probe failed:', detail, { correlationId });
        return apiError(502, 'polygon_probe_failed', { correlationId });
      }
    }

    // ── (5) Skip gates ───────────────────────────────────────────────────
    // (i) kill-switch: any non-'active' state on strategy_key='overshoot'.
    const [ks] = await sql<{ state: string | null }[]>`
      SELECT state FROM kill_switches
      WHERE strategy_key = 'overshoot'
      LIMIT 1
    `;
    if (ks && ks.state && ks.state !== 'active') {
      const runRow = await insertRunRow(sql, {
        asOfDay, outcome: 'no_op', reason: `kill_switch_${ks.state}`, dryRun,
        gitSha: env.gitSha, correlationId, appendRunIds: { bars: null, earnings: null },
        detectorVersion: RATIFIED_DETECTOR_VERSION,
        refusalCounts: emptyRefusalCounts(),
      });
      await sql.end({ timeout: 5 });
      return apiSuccess({
        run_id: runRow.run_id, outcome: 'no_op', reason: `kill_switch_${ks.state}`,
        event_count: 0, selected_count: 0, correlation_id: correlationId,
      });
    }

    // (ii) job-disarmed: overshoot.detection.run.enabled=false.
    const [jr] = await sql<{ enabled: boolean }[]>`
      SELECT enabled FROM job_registry WHERE id = 'overshoot.detection.run'
    `;
    if (jr && jr.enabled === false) {
      const runRow = await insertRunRow(sql, {
        asOfDay, outcome: 'no_op', reason: 'job_disarmed', dryRun,
        gitSha: env.gitSha, correlationId, appendRunIds: { bars: null, earnings: null },
        detectorVersion: RATIFIED_DETECTOR_VERSION,
        refusalCounts: emptyRefusalCounts(),
      });
      await sql.end({ timeout: 5 });
      return apiSuccess({
        run_id: runRow.run_id, outcome: 'no_op', reason: 'job_disarmed',
        event_count: 0, selected_count: 0, correlation_id: correlationId,
      });
    }

    // ── (6) Pipeline ──────────────────────────────────────────────────────
    if (!env.polygonKey) { await sql.end({ timeout: 5 }); return apiError(500, 'polygon_key_unset', { correlationId }); }
    if (!env.fmpKey)     { await sql.end({ timeout: 5 }); return apiError(500, 'fmp_key_unset', { correlationId }); }

    const durations: Record<string, number> = {};
    const t0 = performance.now();

    // Insert detection-run row upfront (outcome='running') so any failure downstream
    // leaves a truthful record. append_run_ids seeded null; UPDATE at end.
    const runRow = await insertRunRow(sql, {
      asOfDay, outcome: 'running', dryRun,
      gitSha: env.gitSha, correlationId, appendRunIds: { bars: null, earnings: null },
      detectorVersion: RATIFIED_DETECTOR_VERSION,
      refusalCounts: emptyRefusalCounts(),
    });
    const runId = runRow.run_id;

    let barsBackfillRunId: string | null = null;
    let earningsBackfillRunId: string | null = null;

    // Load universe once (used by bars-append whitelist).
    const universeRows = await sql<{ ticker: string }[]>`
      SELECT ticker FROM overshoot_universe WHERE active = true
    `;
    const universe = universeRows.map((r) => r.ticker);

    // ── Stage 1: bars-append leg ────────────────────────────────────────
    try {
      const tBars = performance.now();
      const polyFetcher = new PolygonGroupedDailyFetcher(env.polygonKey);
      const grouped = await polyFetcher.fetchGroupedDaily(asOfDate);
      // Insert backfill_runs row (kind='bars') BEFORE the upsert to satisfy FK.
      const [bRun] = await sql<{ run_id: string }[]>`
        INSERT INTO overshoot_backfill_runs (kind, started_as_of, row_count, request_count, outcome)
        VALUES ('bars', ${new Date().toISOString()}::timestamptz, ${grouped.bars.length}, 1, 'completed')
        RETURNING run_id
      `;
      barsBackfillRunId = bRun.run_id;
      const barsRows = buildBarsAppendRows({
        groupedResponse: grouped,
        universe,
        sourceRunId: barsBackfillRunId,
        fetchedAsOf: productionClock.getWallClockTs(),
      });
      if (barsRows.length > 0) {
        const cols = ['ticker','trade_date','open','high','low','close','volume','vwap','trade_count','adjusted','source_run_id','fetched_as_of'] as const;
        await sql`INSERT INTO overshoot_daily_bars ${sql(barsRows, ...cols)}
          ON CONFLICT (ticker, trade_date) DO UPDATE SET
            open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low, close=EXCLUDED.close,
            volume=EXCLUDED.volume, vwap=EXCLUDED.vwap, trade_count=EXCLUDED.trade_count,
            source_run_id=EXCLUDED.source_run_id, fetched_as_of=EXCLUDED.fetched_as_of`;
      }
      durations.bars_append_ms = Math.round(performance.now() - tBars);
    } catch (err) {
      const reason = err instanceof BarsMissingForAsofError ? 'bars_missing_for_asof'
                   : err instanceof BenchmarksMissingError  ? 'benchmarks_missing'
                   : 'bars_append_unexpected';
      const outcome: Outcome = reason === 'bars_missing_for_asof' ? 'no_op' : 'failed';
      await finalizeRun(sql, runId, outcome, reason, 0, 0, durations, { bars: barsBackfillRunId, earnings: null }, dryRun);
      await sql.end({ timeout: 5 });
      return apiSuccess({ run_id: runId, outcome, reason, event_count: 0, selected_count: 0, correlation_id: correlationId });
    }

    // ── Stage 2: forward-earnings-append leg ────────────────────────────
    try {
      const tE = performance.now();
      const fmpFetcher = new FmpEarningsCalendarFetcher(env.fmpKey);
      // Backfill_runs row inserted AFTER a successful fetch produced a row_count;
      // shape: kind='earnings_fmp'. FK is on the earnings_calendar upsert, so
      // the row must exist BEFORE the upsert. Insert with placeholder then
      // update row_count/outcome once known, OR pre-count from fetcher: keep
      // simple — insert BEFORE fetch with row_count=0/outcome='running', UPDATE after.
      const [eRun] = await sql<{ run_id: string }[]>`
        INSERT INTO overshoot_backfill_runs (kind, started_as_of, request_count, outcome)
        VALUES ('earnings_fmp', ${new Date().toISOString()}::timestamptz, 1, NULL)
        RETURNING run_id
      `;
      earningsBackfillRunId = eRun.run_id;
      const appendRes = await appendForwardEarnings({
        fetcher: fmpFetcher,
        asOf: asOfDate,
        exclusionWidthDays: DETECTOR_EXCLUSION_WIDTH_DAYS,
        marginDays: EARNINGS_MARGIN_DAYS,
        sourceRunId: earningsBackfillRunId,
        fetchedAsOf: productionClock.getWallClockTs(),
        capRows: EARNINGS_CAP_ROWS,
      });
      if (appendRes.rows.length > 0) {
        const cols = ['ticker','announcement_date','source','hour','quarter','fiscal_year','eps_estimate','eps_actual','revenue_estimate','revenue_actual','source_run_id','fetched_as_of'] as const;
        await sql`INSERT INTO overshoot_earnings_calendar ${sql(appendRes.rows, ...cols)}
          ON CONFLICT (ticker, announcement_date, source) DO UPDATE SET
            hour=EXCLUDED.hour, quarter=EXCLUDED.quarter, fiscal_year=EXCLUDED.fiscal_year,
            eps_estimate=EXCLUDED.eps_estimate, eps_actual=EXCLUDED.eps_actual,
            revenue_estimate=EXCLUDED.revenue_estimate, revenue_actual=EXCLUDED.revenue_actual,
            source_run_id=EXCLUDED.source_run_id, fetched_as_of=EXCLUDED.fetched_as_of`;
      }
      await sql`UPDATE overshoot_backfill_runs SET row_count=${appendRes.rows.length}, outcome='completed', completed_as_of=${new Date().toISOString()}::timestamptz WHERE run_id=${earningsBackfillRunId}::uuid`;
      durations.earnings_append_ms = Math.round(performance.now() - tE);
      // DEFECT-2 recurrence forensic — ACT-462.c class-audit counter.
      // Surface vendor-dedupe count into durations metadata (jsonb bucket)
      // so the run-row records how many FMP vendor rows collided on
      // (ticker|announcement_date|source) in the fetch window.
      (durations as Record<string, unknown>).earnings_duplicates_dropped = appendRes.duplicatesDropped;
      (durations as Record<string, unknown>).earnings_vendor_row_count = appendRes.vendorRowCount;
      (durations as Record<string, unknown>).earnings_appended_row_count = appendRes.rows.length;
    } catch (err) {
      const reason = err instanceof EarningsCalendarCapBreachError ? 'earnings_calendar_cap_breach'
                                                                    : 'earnings_append_unexpected';
      // ACT-462.c forensic: surface throw shape in the failed run row so
      // future unexpected-bucket entries are diagnosable without an extra
      // repro. Previously the catch swallowed the message entirely,
      // forcing an out-of-band FMP probe to root-cause the 21000 case.
      (durations as Record<string, unknown>).earnings_append_error =
        err instanceof Error ? (err.name + ': ' + err.message).slice(0, 500) : String(err).slice(0, 500);
      await finalizeRun(sql, runId, 'failed', reason, 0, 0, durations, { bars: barsBackfillRunId, earnings: earningsBackfillRunId }, dryRun);
      await sql.end({ timeout: 5 });
      return apiSuccess({ run_id: runId, outcome: 'failed', reason, event_count: 0, selected_count: 0, correlation_id: correlationId });
    }

    // ── Stage 3: earnings_calendar_stale predicate ──────────────────────
    const [ecFresh] = await sql<{ last_fetched_at: string | null }[]>`
      SELECT MAX(fetched_as_of)::text AS last_fetched_at FROM overshoot_earnings_calendar
    `;
    const lastFetchedAt = ecFresh?.last_fetched_at ? new Date(ecFresh.last_fetched_at) : null;
    const stale = isEarningsCalendarStale({
      lastFetchedAt,
      asOf: productionClock.getWallClockTs(),
      thresholdHours: DEFAULT_EARNINGS_CALENDAR_STALENESS_HOURS,
    });
    if (stale) {
      await finalizeRun(sql, runId, 'no_op', 'earnings_calendar_stale', 0, 0, durations, { bars: barsBackfillRunId, earnings: earningsBackfillRunId }, dryRun);
      await sql.end({ timeout: 5 });
      return apiSuccess({ run_id: runId, outcome: 'no_op', reason: 'earnings_calendar_stale', event_count: 0, selected_count: 0, correlation_id: correlationId });
    }

    // ── Stage 4: kernel live-parameterized SELECT (runner-parity bind) ──
    // event_date_min = event_date_max = as_of. The core SELECT body is
    // BYTE-IDENTICAL to the study runner's DETECTION source — same shape,
    // same params, no fork.
    const tK = performance.now();
    const [snap] = await sql<{ lookback_min: string }[]>`
      SELECT (SELECT MIN(trade_date) + 252 FROM overshoot_daily_bars) AS lookback_min
    `;
    const detectionCore = bindNamed(stripStatementBody(EVENT_DETECTION_SQL), DETECTION_PARAM_ORDER);
    const kernelRowsRaw = await sql.unsafe(detectionCore, [
      runId,               // :run_id (used inside SELECT; harmless — persisted separately)
      asOfDay,             // :bars_snapshot_max_date
      asOfDay,             // :earnings_snapshot_max_date
      DETECTOR_MIN_BAND_BPS,
      snap.lookback_min,
      asOfDay,             // :event_date_min = as_of
      asOfDay,             // :event_date_max = as_of
    ]);
    durations.kernel_ms = Math.round(performance.now() - tK);

    // Normalize side casing ('long'|'short' → 'LONG'|'SHORT') for detector.
    const candidates: KernelCandidateRow[] = (kernelRowsRaw as Array<Record<string, unknown>>).map((r) => ({
      run_id: runId,
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

    // ── Stage 5: SI read (staleness window) ─────────────────────────────
    const tS = performance.now();
    const siRows = await sql<{ ticker: string; as_of_date: string; si_pct_float: number | null; dtc: number | null }[]>`
      SELECT ticker, as_of_date::text AS as_of_date, si_pct_float, dtc
      FROM overshoot_short_interest
      WHERE as_of_date <= ${asOfDay}::date
        AND as_of_date >= (${asOfDay}::date - ${DETECTOR_SI_STALENESS_MAX_DAYS}::int)
    `;
    const shortInterest = new Map<string, ShortInterestRow>();
    for (const r of siRows) {
      // Keep freshest per ticker.
      const existing = shortInterest.get(r.ticker);
      if (!existing || existing.as_of_date < r.as_of_date) {
        shortInterest.set(r.ticker, {
          ticker: r.ticker, as_of_date: r.as_of_date,
          si_pct_float: r.si_pct_float === null ? null : Number(r.si_pct_float),
          dtc: r.dtc === null ? null : Number(r.dtc),
        });
      }
    }
    durations.si_read_ms = Math.round(performance.now() - tS);

    // ── DEC-504-4 WIRE — book-level sleeve reallocation decision ─────────
    // Freshest SI as_of_date across the loaded corpus. `shortInterest` is
    // already deduped to the freshest row per ticker, so a single scan
    // yields the book-level max. Uses the SAME arithmetic the UI staleness
    // chip and the per-row detector gate use (siStaleActive; strict >).
    let freshestSiAsOfDate: string | null = null;
    for (const [, r] of shortInterest) {
      if (freshestSiAsOfDate === null || r.as_of_date > freshestSiAsOfDate) {
        freshestSiAsOfDate = r.as_of_date;
      }
    }
    const bookSiStaleActive = siStaleActive(
      asOfDay, freshestSiAsOfDate, OVERSHOOT_SI_STALENESS_MAX_DAYS_DEFAULT,
    );
    const sleeveDecision = overshootSleeveAllocation(bookSiStaleActive, {
      longAllocationPct: 0.90,
      shortAllocationPct: 0.10,
      longCapacity: DETECTOR_CAPACITY_LONG,
      shortCapacity: DETECTOR_CAPACITY_SHORT,
    });

    // Study-cell lookup — bound to ratified priors run_id.
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

    // ─── DEC-080-v2 / DEC-081-v2 / DEC-082 three-guard bundle (aff20a13):
    //     analyst-revision + corporate-actions joins. Window widened by
    //     max(analystProximity, maExclusionCalendar) so the per-row scan
    //     never has to touch anything outside the pulled slice.
    //     Both queries are keyed to a bounded date window; NULLs preserved
    //     so the freshness siblings can distinguish empty-corpus from
    //     stale-feed. Uses postgres.js typed rows for byte-typing safety.
    const analystRows = await sql<{
      ticker: string;
      direction: number;
      focal_published_at: string;
      computed_at: string;
    }[]>`
      SELECT ticker, direction, focal_published_at::text AS focal_published_at,
             computed_at::text AS computed_at
      FROM analyst_revision_observations
      WHERE focal_published_at::date BETWEEN (${asOfDay}::date - INTERVAL '10 days')
                                          AND (${asOfDay}::date + INTERVAL '10 days')
    `;
    const analystByTicker = new Map<string, { direction: number; focal_published_at: string }[]>();
    let analystFreshestComputedAt: string | null = null;
    for (const r of analystRows) {
      const arr = analystByTicker.get(r.ticker) ?? [];
      arr.push({ direction: Number(r.direction), focal_published_at: r.focal_published_at });
      analystByTicker.set(r.ticker, arr);
      if (analystFreshestComputedAt === null || r.computed_at > analystFreshestComputedAt) {
        analystFreshestComputedAt = r.computed_at;
      }
    }
    // Fallback: if the windowed pull happens to be empty on this date but
    // the feed itself has newer/older rows, read a corpus-level MAX so
    // fail-closed staleness reflects the actual pipeline heartbeat rather
    // than local absence of proximate revisions.
    if (analystFreshestComputedAt === null) {
      const [row] = await sql<{ max_ts: string | null }[]>`
        SELECT MAX(computed_at)::text AS max_ts FROM analyst_revision_observations
      `;
      analystFreshestComputedAt = row?.max_ts ?? null;
    }

    const maRows = await sql<{
      symbol: string;
      successor_symbol: string | null;
      action_type: string;
      announced_at: string | null;
      ex_date: string | null;
      updated_at: string;
    }[]>`
      SELECT symbol, successor_symbol, action_type,
             announced_at::text AS announced_at,
             ex_date::text AS ex_date,
             updated_at::text AS updated_at
      FROM corporate_actions
      WHERE action_type IN ('merger','acquisition','tender_offer','scheme_of_arrangement')
        AND COALESCE(announced_at::date, ex_date)
              BETWEEN (${asOfDay}::date - INTERVAL '14 days')
                  AND (${asOfDay}::date + INTERVAL '14 days')
    `;
    const maByTicker = new Map<string, { action_type: string; announced_at: string | null; ex_date: string | null }[]>();
    let maFreshestUpdatedAt: string | null = null;
    const pushMa = (
      key: string,
      row: { action_type: string; announced_at: string | null; ex_date: string | null },
    ) => {
      const arr = maByTicker.get(key) ?? [];
      arr.push(row);
      maByTicker.set(key, arr);
    };
    for (const r of maRows) {
      const payload = { action_type: r.action_type, announced_at: r.announced_at, ex_date: r.ex_date };
      if (r.symbol) pushMa(r.symbol, payload);
      if (r.successor_symbol && r.successor_symbol !== r.symbol) pushMa(r.successor_symbol, payload);
      if (maFreshestUpdatedAt === null || r.updated_at > maFreshestUpdatedAt) {
        maFreshestUpdatedAt = r.updated_at;
      }
    }
    if (maFreshestUpdatedAt === null) {
      const [row] = await sql<{ max_ts: string | null }[]>`
        SELECT MAX(updated_at)::text AS max_ts FROM corporate_actions
      `;
      maFreshestUpdatedAt = row?.max_ts ?? null;
    }

    // ── Stage 6: detector (pure, unmodified) ────────────────────────────
    const detectorInput: DetectorInput = {
      candidates,
      shortInterest,
      params: {
        runId,
        asOf: asOfDay,
        // DEC-504-4 WIRE: capacities are the sleeve decision's, not the
        // ratified constants directly. FRESH: 36 LONG / 4 SHORT (unchanged).
        // STALE: 40 LONG / 0 SHORT — SHORT admissions cannot survive the
        // detector's capacity gate; per-ticker si-squeeze-stale refusal
        // remains the second belt for any SHORT candidate that reaches
        // admission through a future code path.
        capacityLong: sleeveDecision.longCapacity,
        capacityShort: sleeveDecision.shortCapacity,
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
        // DEC-080-v2 / DEC-081-v2 / DEC-082 three-guard bundle wired to
        // real DB reads (composite version aff20a13). Defaults for windows
        // / staleness caps live in _shared/overshoot/si-freshness.ts; we
        // pass explicit values here so the detector envelope echoes the
        // ratified constants without depending on function-time defaults.
        analystRevisionLookup: (t) => analystByTicker.get(t) ?? [],
        maActionLookup: (t) => maByTicker.get(t) ?? [],
        analystRevisionFeedFreshestComputedAt: analystFreshestComputedAt,
        maFeedFreshestUpdatedAt: maFreshestUpdatedAt,
        analystProximityCalendarDays: 3,
        // 2026-07-21 amendment: 3d→4d (holiday-observed Tuesday robustness;
        // rationale in _shared/overshoot/si-freshness.ts file header).
        analystStalenessMaxDays: OVERSHOOT_ANALYST_REVISION_STALENESS_MAX_DAYS_DEFAULT,
        maExclusionCalendarDays: 7,
        maStalenessMaxDays: 14,
      },
    };
    // WARN-level companion (non-refusing): if the freshest analyst
    // observation is in the (3d, 4d] band we surface the early-warning
    // signal so a genuinely-dying feed is visible one operational day
    // before the fail-closed edge engages. NOT a refusal — the run
    // proceeds normally.
    if (
      analystRevisionStaleWarnActive(
        asOfDay,
        analystFreshestComputedAt,
        OVERSHOOT_ANALYST_REVISION_STALENESS_WARN_AT_DAYS_DEFAULT,
        OVERSHOOT_ANALYST_REVISION_STALENESS_MAX_DAYS_DEFAULT,
      )
    ) {
      console.warn(JSON.stringify({
        level: 'warn',
        event: 'overshoot.detection.analyst_revision_feed_warn',
        run_id: runId,
        as_of: asOfDay,
        freshest_computed_at: analystFreshestComputedAt,
        warn_at_days: OVERSHOOT_ANALYST_REVISION_STALENESS_WARN_AT_DAYS_DEFAULT,
        fail_closed_at_days: OVERSHOOT_ANALYST_REVISION_STALENESS_MAX_DAYS_DEFAULT,
        rationale: 'analyst feed in warn-band (>3d, ≤4d) — dying feed early-warning; not a refusal',
      }));
    }
    const tD = performance.now();
    const events: DetectedEvent[] = runDetector(detectorInput);
    durations.detector_ms = Math.round(performance.now() - tD);

    const selected = events.filter((e) => e.selected_for_entry);

    // ── DEC-504-4 WIRE — transition-edge audit + W5 provenance ──────────
    // Read the prior completed run's sleeve posture, decide engage /
    // disengage / noop, write ONE audit row on state edges only, and
    // resolve the W5 reallocation ref that stamps target rows (and
    // downstream lots via entry-run inheritance).
    const sleeveCtx = await resolveSleeveContext(sql, runId);
    const sleeveTransition = decideTransition(
      sleeveCtx.priorActive, sleeveDecision.reallocationActive,
    );
    let newSleeveAuditId: string | null = null;
    if (!dryRun) {
      newSleeveAuditId = await maybeWriteSleeveTransition({
        transition: sleeveTransition,
        correlationId,
        runId,
        asOfIso: asOfDay,
        freshestSiAsOfDateIso: freshestSiAsOfDate,
        sleeveDecision,
        stalenessMaxDays: OVERSHOOT_SI_STALENESS_MAX_DAYS_DEFAULT,
        reason: sleeveDecision.reallocationActive
          ? (freshestSiAsOfDate === null ? 'si_corpus_absent' : 'si_stale_active')
          : 'si_freshness_restored',
      });
    }
    const w5ReallocationRef = resolveW5ReallocationRef(
      sleeveDecision.reallocationActive,
      sleeveTransition,
      newSleeveAuditId,
      sleeveCtx.priorEngageAuditId,
    );

    // ── Stage 7: persist ────────────────────────────────────────────────
    // A4 column-alignment attestation (verbatim vs W3.1 migration):
    //   overshoot_events: event_id (default), run_id, as_of_date, ticker, side,
    //     excess_w1..w5, argmax_window_days, momentum_quintile, drawdown_bucket,
    //     days_to_nearest_earnings, earnings_alias_used, filter_passes,
    //     filter_refusal_reason, selected_for_entry, rank_score, study_cell_ref.
    //   overshoot_target_positions: run_id, ticker, side, target_shares,
    //     target_notional, rank_score, computed_at. PK (run_id, ticker, side).
    //   overshoot_detection_runs: run_id, as_of, detected_at, outcome,
    //     event_count, selected_count, durations_ms, correlation_id, git_sha,
    //     append_run_ids (MIG-152).
    if (!dryRun && events.length > 0) {
      const eventRows = events.map((e) => ({
        run_id: runId,
        as_of_date: e.as_of_date,
        ticker: e.ticker,
        side: e.side.toLowerCase(), // schema CHECK is ('long','short')
        excess_w1: e.excess_w1,
        excess_w2: e.excess_w2,
        excess_w3: e.excess_w3,
        excess_w4: e.excess_w4,
        excess_w5: e.excess_w5,
        argmax_window_days: e.argmax_window_days,
        momentum_quintile: e.momentum_quintile,
        drawdown_bucket: e.drawdown_bucket,
        days_to_nearest_earnings: e.days_to_nearest_earnings,
        earnings_alias_used: e.earnings_alias_used,
        filter_passes: JSON.stringify(e.filter_passes),
        filter_refusal_reason: e.filter_refusal_reason,
        selected_for_entry: e.selected_for_entry,
        rank_score: e.rank_score,
        study_cell_ref: e.study_cell_ref === null ? null : JSON.stringify(e.study_cell_ref),
        tier: e.tier, // FP-069 W3.8 T2.3 (MIG-156) — 'T1'|'T2'|null; SHORT always null
      }));
      const cols = ['run_id','as_of_date','ticker','side','excess_w1','excess_w2','excess_w3','excess_w4','excess_w5','argmax_window_days','momentum_quintile','drawdown_bucket','days_to_nearest_earnings','earnings_alias_used','filter_passes','filter_refusal_reason','selected_for_entry','rank_score','study_cell_ref','tier'] as const;
      await sql`INSERT INTO overshoot_events ${sql(eventRows, ...cols)}`;
    }
    if (!dryRun && selected.length > 0) {
      // Sizing target_shares / target_notional is a downstream broker concern
      // (W3.6+); here we persist rank_score placeholders per selected event.
      // target_shares/target_notional set to 0 numeric = intentional placeholder
      // that the broker leg will fill in W3.6. Documented in the module doc.
      const nowIso = new Date().toISOString();
      const targetRows = selected.map((e) => ({
        run_id: runId,
        ticker: e.ticker,
        side: e.side.toLowerCase(),
        target_shares: 0,
        target_notional: 0,
        rank_score: e.rank_score,
        computed_at: nowIso,
        // DEC-504-4 W5 provenance: only stamped when the sleeve is
        // currently reallocated (LONG-only 40/0). Fresh-book runs write
        // NULL, preserving the pre-wire fixture-byte semantics.
        w5_reallocation_ref: sleeveDecision.reallocationActive ? w5ReallocationRef : null,
      }));
      const cols = ['run_id','ticker','side','target_shares','target_notional','rank_score','computed_at','w5_reallocation_ref'] as const;
      await sql`INSERT INTO overshoot_target_positions ${sql(targetRows, ...cols)}
        ON CONFLICT (run_id, ticker, side) DO NOTHING`;
    }

    durations.total_ms = Math.round(performance.now() - t0);
    await finalizeRun(sql, runId, 'completed', undefined, events.length, selected.length, durations, {
      bars: barsBackfillRunId, earnings: earningsBackfillRunId,
    }, dryRun, tallyRefusalCounts(events));
    // DEC-504-4 WIRE — record sleeve posture on the run row (§22.5.1).
    // Written AFTER finalizeRun so a partial failure earlier leaves the
    // default '{}' sleeves value untouched (truthful posture on failed
    // runs = "sleeve decision never reached").
    if (!dryRun) {
      await sql`
        UPDATE overshoot_detection_runs
           SET sleeves = ${sql.json({
             reallocation_active: sleeveDecision.reallocationActive,
             long_capacity: sleeveDecision.longCapacity,
             short_capacity: sleeveDecision.shortCapacity,
             long_allocation_pct: sleeveDecision.longAllocationPct,
             short_allocation_pct: sleeveDecision.shortAllocationPct,
             si_stale_active: bookSiStaleActive,
             freshest_si_as_of_date: freshestSiAsOfDate,
             si_staleness_max_days: OVERSHOOT_SI_STALENESS_MAX_DAYS_DEFAULT,
             w5_reallocation_ref: w5ReallocationRef,
             transition: sleeveTransition,
           })}::jsonb
         WHERE run_id = ${runId}::uuid
      `;
    }
    await sql.end({ timeout: 5 });
    // FP-069 W3.8 T2.4 (ACT-479) — dry-run response envelope enrichment
    // (INC-84 §5 bundle-content proof + Proposal A tier snapshot).
    // Under dry_run=true ONLY: emit the ratified detector_version and a
    // full tier snapshot (candidate/selected counts per tier + rank_score
    // stats per tier + the full selected[] with tier + rank_score +
    // study_cell_ref). Zero DB writes beyond the dry-marked run row that
    // dry_run has always written (events/target-positions gates unchanged).
    // The presence of `detector_version` and `tier_snapshot` in the envelope
    // is the DEPLOY-CONTENT PROOF for T2.4 and every future dry-run —
    // the pre-T2.4 bundle cannot produce these fields.
    const dryRunEvidence = dryRun ? buildDryRunEvidence(events, selected) : undefined;
    return apiSuccess({
      run_id: runId, outcome: 'completed',
      event_count: events.length, selected_count: selected.length,
      dry_run: dryRun, durations_ms: durations,
      correlation_id: correlationId,
      ...(dryRunEvidence !== undefined ? { dry_run_evidence: dryRunEvidence } : {}),
    });
  } catch (err) {
    try { await sql.end({ timeout: 5 }); } catch { /* noop */ }
    console.error(JSON.stringify({ event: 'detection_run_unhandled', correlationId, err: String(err) }));
    return apiError(500, 'detection_run_unhandled_error', { correlationId });
  }
}));

// ── Helpers ──────────────────────────────────────────────────────────────
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sql = any;

async function insertRunRow(sql: Sql, args: {
  asOfDay: string; outcome: Outcome; reason?: string; dryRun: boolean;
  gitSha: string; correlationId: string;
  appendRunIds: { bars: string | null; earnings: string | null };
  detectorVersion: string;
  refusalCounts: Record<string, number>;
}): Promise<{ run_id: string }> {
  // FP-069 W3.8 T2.4 corrective A′ — driver-binding fix. postgresjs v3.4.4
  // JSON.stringify()'s any parameter it serializes for jsonb; pre-stringifying
  // AND casting ::jsonb double-encoded every prior row (jsonb_typeof=string,
  // silently defeating any durations_ms->>'key' read including T2.4's
  // console-pollution filter). Pass the OBJECT and the driver serializes once.
  const durations: Record<string, unknown> = args.reason
    ? { skip_reason: args.reason, dry_run: args.dryRun }
    : { dry_run: args.dryRun };
  const [row] = await sql<{ run_id: string }[]>`
    INSERT INTO overshoot_detection_runs
      (as_of, detected_at, outcome, event_count, selected_count, durations_ms,
       correlation_id, git_sha, append_run_ids, detector_version, refusal_class_counts)
    VALUES (${args.asOfDay}::date, ${new Date().toISOString()}::timestamptz,
            ${args.outcome}, 0, 0, ${sql.json(durations)}::jsonb,
            ${args.correlationId}, ${args.gitSha},
            ${sql.json(args.appendRunIds)}::jsonb,
            ${args.detectorVersion},
            ${sql.json(args.refusalCounts)}::jsonb)
    RETURNING run_id
  `;
  return { run_id: row.run_id };
}

async function finalizeRun(
  sql: Sql, runId: string, outcome: Outcome, reason: string | undefined,
  eventCount: number, selectedCount: number,
  durations: Record<string, number>,
  appendRunIds: { bars: string | null; earnings: string | null },
  dryRun: boolean,
  refusalCounts?: Record<string, number>,
): Promise<void> {
  // FP-069 W3.8 T2.4 corrective (Option A) — carry the dry_run marker on
  // BOTH paths (true/false) so every completed run row is explicitly marked.
  // Absence of the key now means pre-T2.4 legacy row only. Prior defect:
  // finalizeRun overwrote durations_ms without merging the flag insertRunRow
  // had stamped, silently defeating the T2.4 STEP 3 console-pollution filter.
  // A′ — object binding via sql.json(); no pre-stringify, no ::jsonb cast.
  const payload: Record<string, unknown> = reason
    ? { ...durations, skip_reason: reason, dry_run: dryRun }
    : { ...durations, dry_run: dryRun };
  await sql`
    UPDATE overshoot_detection_runs
       SET outcome = ${outcome},
           event_count = ${eventCount},
           selected_count = ${selectedCount},
           durations_ms = ${sql.json(payload)}::jsonb,
           append_run_ids = ${sql.json(appendRunIds)}::jsonb,
           refusal_class_counts = COALESCE(${refusalCounts ? sql.json(refusalCounts) : null}::jsonb, refusal_class_counts)
     WHERE run_id = ${runId}::uuid
  `;
}

// FP-069 W3.8 T2.4 (ACT-479) — dry-run envelope evidence builder.
// Pure, side-effect-free; consumes the in-memory detector output only.
// Produces the INC-84 §5 bundle-content proof (detector_version echo) +
// tier snapshot (LONG T1 / LONG T2 / SHORT counts + rank_score stats per
// tier) + full selected[] with tier / rank_score / study_cell_ref.
function buildDryRunEvidence(
  events: readonly DetectedEvent[],
  selected: readonly DetectedEvent[],
): {
  detector_version: string;
  ratified_study_run_id: string;
  ratified_param_grid_hash_prefix: string;
  tier_snapshot: {
    long_t1_candidates: number;
    long_t2_candidates: number;
    short_candidates: number;
    long_t1_selected: number;
    long_t2_selected: number;
    short_selected: number;
    rank_score_by_tier: Record<'LONG_T1' | 'LONG_T2' | 'SHORT', { count: number; mean: number | null; min: number | null; max: number | null }>;
  };
  selected: Array<{ ticker: string; side: Side; tier: 'T1' | 'T2' | null; rank_score: number | null; study_cell_ref: StudyCellKey | null }>;
} {
  const longT1Cand = events.filter((e) => e.side === 'LONG' && e.tier === 'T1');
  const longT2Cand = events.filter((e) => e.side === 'LONG' && e.tier === 'T2');
  const shortCand  = events.filter((e) => e.side === 'SHORT');
  const longT1Sel  = selected.filter((e) => e.side === 'LONG' && e.tier === 'T1');
  const longT2Sel  = selected.filter((e) => e.side === 'LONG' && e.tier === 'T2');
  const shortSel   = selected.filter((e) => e.side === 'SHORT');
  const rsStats = (rows: readonly DetectedEvent[]) => {
    const scores = rows.map((e) => e.rank_score).filter((s): s is number => s !== null);
    if (scores.length === 0) return { count: rows.length, mean: null, min: null, max: null };
    const sum = scores.reduce((a, b) => a + b, 0);
    return { count: rows.length, mean: sum / scores.length, min: Math.min(...scores), max: Math.max(...scores) };
  };
  return {
    detector_version: RATIFIED_DETECTOR_VERSION,
    ratified_study_run_id: RATIFIED_STUDY_RUN_ID,
    ratified_param_grid_hash_prefix: RATIFIED_PARAM_GRID_HASH_PREFIX,
    tier_snapshot: {
      long_t1_candidates: longT1Cand.length,
      long_t2_candidates: longT2Cand.length,
      short_candidates:   shortCand.length,
      long_t1_selected:   longT1Sel.length,
      long_t2_selected:   longT2Sel.length,
      short_selected:     shortSel.length,
      rank_score_by_tier: {
        LONG_T1: rsStats(longT1Sel),
        LONG_T2: rsStats(longT2Sel),
        SHORT:   rsStats(shortSel),
      },
    },
    selected: selected.map((e) => ({
      ticker: e.ticker, side: e.side, tier: e.tier,
      rank_score: e.rank_score, study_cell_ref: e.study_cell_ref,
    })),
  };
}