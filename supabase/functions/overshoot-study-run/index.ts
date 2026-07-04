/**
 * overshoot-study-run — FP-069 W2.4 study runner (manual invocation only).
 *
 * W2.6 PHASE MECHANISM (ACT-457-ADD-08):
 *   Optional `phase` param splits a run into N detect invocations + 1 aggregate
 *   invocation, all keyed to ONE run_id. Preserves exact statistics (no median-
 *   merge approximation) with 2.1x margin under the 400s edge-fn ceiling.
 *
 *   phase omitted (legacy)  — single-shot detect+aggregate, byte-for-byte
 *                             identical to W2.5 behaviour.
 *   phase='detect'          — insert events for the [event_date_min,
 *                             event_date_max] slice against a run_id. If
 *                             `run_id` is not supplied, a fresh run row is
 *                             created with param_grid.window recording the
 *                             REQUESTED full window (event_date_min_full,
 *                             event_date_max_full). Each detect call appends
 *                             its slice bounds + event_count to
 *                             param_grid.phases_completed.
 *   phase='aggregate'       — requires run_id. Refuses to run unless the
 *                             union of param_grid.phases_completed slices
 *                             covers [event_date_min_full, event_date_max_full]
 *                             contiguously (a coverage CHECK, not trust).
 *                             Runs cell-aggregation over the FULL events
 *                             table for run_id, marks outcome='completed'.
 *
 * Contract:
 *   POST {
 *     as_of?: 'YYYY-MM-DD',            // injected clock (P7); default = today UTC
 *     param_grid?: Record<string, unknown>,  // stored on runs row (informational)
 *     slippage_haircut_bps_long?: number,    // default 5
 *     slippage_haircut_bps_short?: number,   // default 15
 *     min_band_bps?: number,           // default 300 (lower bound of smallest band)
 *     run_label?: string,              // human tag; dry runs auto-prefixed 'DRY_RUN:'
 *     dry_run?: boolean,               // default false; when true, no event/cell writes
 *     event_date_min?: 'YYYY-MM-DD',   // W2.5 D-2: LOWER BOUND on candidate event_date.
 *                                       // Bounds EVENT dates only; lookback/lead windows
 *                                       // still read bars outside the bound. Defaults to
 *                                       // '1900-01-01' when unset (full-window behaviour).
 *     event_date_max?: 'YYYY-MM-DD',   // W2.6 phase slice: UPPER BOUND on candidate event_date.
 *                                       // Defaults to '9999-12-31' when unset.
 *     phase?: 'detect' | 'aggregate',  // W2.6: optional phased execution. See header.
 *     run_id?: 'uuid',                 // W2.6: required for phase='aggregate' and for
 *                                       // subsequent phase='detect' calls; must match an
 *                                       // existing run in outcome='running'.
 *     event_date_min_full?: 'YYYY-MM-DD', // W2.6: REQUESTED full-window lower bound; recorded
 *                                          // on first detect call, checked by aggregate coverage.
 *                                          // Defaults to event_date_min.
 *     event_date_max_full?: 'YYYY-MM-DD', // W2.6: REQUESTED full-window upper bound. Defaults to
 *                                          // event_date_max (or bars ceiling if both unset).
 *   }
 *
 * Sequence (single pg connection; runs row lives OUTSIDE the events/cells txn
 * so a failure is truthfully recorded per ACT-457-ADD-03 spec):
 *   1. Insert overshoot_study_runs row with stamps + params + snapshot ceilings
 *      + git_sha, outcome='running'.
 *   2. BEGIN TX.
 *      2a. INSERT ... FROM event-detection.sql.ts (SELECT-only for dry_run).
 *      2b. INSERT ... FROM cell-aggregation.sql.ts (skipped for dry_run).
 *      COMMIT.
 *   3. UPDATE runs SET outcome='completed', completed_at=now(). On error,
 *      UPDATE outcome='failed' (transaction rolled back, runs row survives).
 *
 * Response: { run_id, event_count, cell_count, dry_run, durations_ms, correlation_id }.
 *
 * RBAC: authenticated caller must hold `overshoot.manage`. Writes use service-role
 * via SUPABASE_DB_URL; the runs table is RLS-restrictive-deny to authenticated,
 * service-role-only (W2.2). No cron trigger.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

// FP-069 W2.5 (ACT-457-ADD-04): the .sql bodies were converted to .ts modules
// so the Supabase edge-fn bundler ships them with the deployed image. The .ts
// modules are the single source of truth for the query text — there is no
// duplicate .sql file to drift against.
import EVENT_DETECTION_SQL from '../_shared/overshoot/study/event-detection.sql.ts';
import CELL_AGGREGATION_SQL from '../_shared/overshoot/study/cell-aggregation.sql.ts';

const SURVIVORSHIP_STAMP = 'UPPER_BOUND_SURVIVORSHIP_BIASED';
const PERFORMANCE_STAMP = 'NON_PERFORMANCE_STUDY_ONLY';
const SHORT_FILTER_STAMP = 'NO_SQUEEZE_FILTER_ARRIVALS_UPPER_BOUND_RETURNS_CONSERVATIVE';
const RETURN_BASIS = 'CLOSE_TO_CLOSE_REFERENCE';

function stripStatementBody(sql: string): string {
  // Strip trailing whitespace, trailing `--` line-comments, AND the final
  // statement-terminating `;` so the SELECT can be safely wrapped in
  // `INSERT ... <core>` or `WITH detection AS (<core>) ...`.
  //
  // The prior implementation used /;\s*$/ which only removed a `;` at the
  // very end of the string. The .sql.ts bodies (event-detection,
  // cell-aggregation) have trailing `-- wiring notes` comment blocks AFTER
  // the real statement terminator, so the mid-body `;` survived and — once
  // wrapped in parentheses for dry_run — produced a Postgres syntax error
  // ("SELECT ... FROM cte; -- comments )"), returning 500 study_run_failed.
  // Loop to strip any interleaved trailing comment lines / whitespace /
  // semicolons until stable.
  let s = sql;
  for (;;) {
    const before = s;
    s = s.replace(/\s+$/, '');
    s = s.replace(/(^|\n)[ \t]*--[^\n]*$/, '');
    s = s.replace(/;\s*$/, '');
    if (s === before) return s;
  }
}

/**
 * Substitute `:name` placeholders with `$N` positional params in the order
 * given by `names`. `::type` casts adjacent to `:name` are preserved.
 */
function bindNamed(sql: string, names: readonly string[]): string {
  let out = sql;
  names.forEach((n, i) => {
    // Word-boundary match, avoid matching `::type` casts.
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
const AGGREGATION_PARAM_ORDER = [
  'run_id',
  'haircut_bps_long',
  'haircut_bps_short',
  'bars_snapshot_max_date',
] as const;

function hashParams(obj: unknown): Promise<string> {
  const s = JSON.stringify(obj);
  return crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(s))
    .then((buf) =>
      Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(''),
    );
}

/**
 * Coverage check: verify sorted phase slices union-cover the full window
 * [W_min, W_max] with no gaps (overlap allowed). Dates as ISO YYYY-MM-DD.
 * Returns { covered, gap? } for observable diagnostics.
 */
export function checkPhaseCoverage(
  phases: readonly { min: string; max: string }[],
  fullMin: string,
  fullMax: string,
): { covered: boolean; reason?: string } {
  if (phases.length === 0) return { covered: false, reason: 'no_phases_completed' };
  const sorted = [...phases].sort((a, b) => (a.min < b.min ? -1 : 1));
  if (sorted[0].min > fullMin) {
    return { covered: false, reason: `gap_at_start:first_min=${sorted[0].min}>full_min=${fullMin}` };
  }
  let cursor = sorted[0].max;
  for (let i = 1; i < sorted.length; i++) {
    // Allow contiguous OR overlap: sorted[i].min <= cursor + 1 day
    const gapCutoff = addDaysIso(cursor, 1);
    if (sorted[i].min > gapCutoff) {
      return { covered: false, reason: `gap:${cursor}->${sorted[i].min}` };
    }
    if (sorted[i].max > cursor) cursor = sorted[i].max;
  }
  if (cursor < fullMax) {
    return { covered: false, reason: `gap_at_end:last_max=${cursor}<full_max=${fullMax}` };
  }
  return { covered: true };
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId: crypto.randomUUID() });
  }
  const authCtx = await authenticateRequest(req);
  await checkPermissionOrThrow(authCtx.user.id, 'overshoot.manage');
  const correlationId = authCtx.correlationId;

  let body: Record<string, unknown> = {};
  try {
    body = ((await req.json()) as Record<string, unknown>) ?? {};
  } catch {
    return apiError(400, 'invalid_json_body', { correlationId });
  }

  const asOfRaw = body.as_of as string | undefined;
  const asOfDate = asOfRaw ? parseAsOfDate(asOfRaw) : productionClock.getWallClockTs();
  if (!asOfDate) return apiError(400, 'as_of_invalid_format_expected_YYYY_MM_DD', { correlationId });
  const asOfIso = asOfDate.toISOString();
  const asOfDay = asOfIso.slice(0, 10);
  const dryRun = body.dry_run === true;
  const haircutLong = Number.isFinite(body.slippage_haircut_bps_long)
    ? Number(body.slippage_haircut_bps_long)
    : 5;
  const haircutShort = Number.isFinite(body.slippage_haircut_bps_short)
    ? Number(body.slippage_haircut_bps_short)
    : 15;
  const minBandBps = Number.isFinite(body.min_band_bps) ? Number(body.min_band_bps) : 300;
  // W2.5 D-2 slice control. When unset, use '1900-01-01' so the pre-W2.5-D2
  // full-window detection semantics are preserved byte-for-byte.
  const eventDateMinRaw = body.event_date_min as string | undefined;
  if (eventDateMinRaw !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(eventDateMinRaw)) {
    return apiError(400, 'event_date_min_invalid_format_expected_YYYY_MM_DD', { correlationId });
  }
  const eventDateMin = eventDateMinRaw ?? '1900-01-01';
  // W2.6 phase slice upper bound. Defaults to sentinel preserving W2.5 semantics.
  const eventDateMaxRaw = body.event_date_max as string | undefined;
  if (eventDateMaxRaw !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(eventDateMaxRaw)) {
    return apiError(400, 'event_date_max_invalid_format_expected_YYYY_MM_DD', { correlationId });
  }
  const eventDateMax = eventDateMaxRaw ?? '9999-12-31';

  // W2.6 phase mechanism.
  const phase = body.phase as ('detect' | 'aggregate' | undefined);
  if (phase !== undefined && phase !== 'detect' && phase !== 'aggregate') {
    return apiError(400, 'phase_invalid_expected_detect_or_aggregate', { correlationId });
  }
  const priorRunIdRaw = body.run_id as string | undefined;
  if (priorRunIdRaw !== undefined && !/^[0-9a-f-]{36}$/i.test(priorRunIdRaw)) {
    return apiError(400, 'run_id_invalid_uuid_format', { correlationId });
  }
  if (phase === 'aggregate' && !priorRunIdRaw) {
    return apiError(400, 'phase_aggregate_requires_run_id', { correlationId });
  }
  const eventDateMinFull = (body.event_date_min_full as string | undefined) ?? eventDateMin;
  const eventDateMaxFull = (body.event_date_max_full as string | undefined) ?? eventDateMax;
  if (phase && !/^\d{4}-\d{2}-\d{2}$/.test(eventDateMinFull)) {
    return apiError(400, 'event_date_min_full_invalid_format', { correlationId });
  }
  if (phase && !/^\d{4}-\d{2}-\d{2}$/.test(eventDateMaxFull)) {
    return apiError(400, 'event_date_max_full_invalid_format', { correlationId });
  }

  const paramGrid = (body.param_grid as Record<string, unknown>) ?? { defaults: 'R1' };
  const paramGridHash = await hashParams({
    param_grid: paramGrid,
    haircut_long: haircutLong,
    haircut_short: haircutShort,
    min_band_bps: minBandBps,
    event_date_min: eventDateMin,
    event_date_max: eventDateMax,
    phase: phase ?? 'single',
  });
  const runLabel = `${dryRun ? 'DRY_RUN:' : ''}${(body.run_label as string) ?? 'w24-run'}`;
  const gitSha = Deno.env.get('BUILD_SHA') ?? 'unknown';

  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) return apiError(500, 'db_url_unset', { correlationId });

  const sql = postgres(dbUrl, { max: 1, prepare: false, connect_timeout: 10 });

  const t0 = performance.now();
  let runId: string | null = null;

  try {
    // 1. Snapshot ceilings (bars_max, earnings_max, lookback_min) BEFORE the run row.
    const [snap] = await sql<{ bars_max: string; earnings_max: string; lookback_min: string }[]>`
      SELECT
        (SELECT MAX(trade_date) FROM overshoot_daily_bars WHERE trade_date <= ${asOfDay}::date) AS bars_max,
        (SELECT MAX(announcement_date) FROM overshoot_earnings_calendar WHERE announcement_date <= ${asOfDay}::date) AS earnings_max,
        (SELECT MIN(trade_date) + 252 FROM overshoot_daily_bars) AS lookback_min
    `;
    if (!snap?.bars_max) {
      await sql.end({ timeout: 5 });
      console.error(JSON.stringify({ event: 'no_bars_at_or_before_as_of', correlationId, as_of: asOfDay }));
      return apiError(422, 'no_bars_at_or_before_as_of', { correlationId });
    }

    // 2. Insert or attach to runs row.
    //    Legacy + first detect + single-shot: INSERT a new runs row.
    //    Subsequent detect / aggregate: attach to existing run_id, refuse if not 'running'.
    let paramGridForRun: Record<string, unknown> = paramGrid;
    if (priorRunIdRaw && (phase === 'detect' || phase === 'aggregate')) {
      const [existing] = await sql<{
        run_id: string;
        outcome: string;
        param_grid: Record<string, unknown> | null;
      }[]>`
        SELECT run_id, outcome, param_grid
        FROM overshoot_study_runs
        WHERE run_id = ${priorRunIdRaw}::uuid
        FOR UPDATE
      `;
      if (!existing) {
        await sql.end({ timeout: 5 });
        console.error(JSON.stringify({ event: 'run_id_not_found', correlationId, run_id: priorRunIdRaw }));
        return apiError(404, 'run_id_not_found', { correlationId });
      }
      if (existing.outcome !== 'running') {
        await sql.end({ timeout: 5 });
        console.error(JSON.stringify({
          event: 'run_not_in_running_state',
          correlationId, run_id: priorRunIdRaw, outcome: existing.outcome,
        }));
        return apiError(409, 'run_not_in_running_state', { correlationId });
      }
      runId = existing.run_id;
      paramGridForRun = (existing.param_grid as Record<string, unknown>) ?? {};
    } else {
      // Fresh insert. For phase='detect', embed the requested full window so
      // subsequent aggregate can enforce coverage against a fixed contract.
      const seedGrid: Record<string, unknown> = { ...paramGrid };
      if (phase === 'detect') {
        seedGrid.window = {
          event_date_min_full: eventDateMinFull,
          event_date_max_full: eventDateMaxFull,
        };
        seedGrid.phases_completed = [];
      }
      const [runRow] = await sql<{ run_id: string }[]>`
        INSERT INTO overshoot_study_runs (
          run_label, as_of, git_sha, param_grid, param_grid_hash,
          slippage_haircut_bps_long, slippage_haircut_bps_short,
          bars_snapshot_max_date, earnings_snapshot_max_date,
          survivorship_stamp, performance_stamp, short_filter_stamp, return_basis,
          outcome
        ) VALUES (
          ${runLabel}, ${asOfIso}::timestamptz, ${gitSha},
          ${sql.json(seedGrid)}, ${paramGridHash},
          ${haircutLong}, ${haircutShort},
          ${snap.bars_max}::date, ${snap.earnings_max}::date,
          ${SURVIVORSHIP_STAMP}, ${PERFORMANCE_STAMP}, ${SHORT_FILTER_STAMP}, ${RETURN_BASIS},
          'running'
        )
        RETURNING run_id
      `;
      runId = runRow.run_id;
      paramGridForRun = seedGrid;
    }

    const detectionCore = bindNamed(stripStatementBody(EVENT_DETECTION_SQL), DETECTION_PARAM_ORDER);
    const aggregationCore = bindNamed(stripStatementBody(CELL_AGGREGATION_SQL), AGGREGATION_PARAM_ORDER);

    // 3. Events + cells transaction. Parameter substitution uses postgres.js
    //    unsafe() with positional params so the entire SQL body ships once.
    let eventCount = 0;
    let cellCount = 0;

    // Detect the execution kind:
    //   'single'    — legacy: detect + aggregate in one txn, mark outcome
    //   'detect'    — insert events for slice only, append phase, keep running
    //   'aggregate' — coverage-gated aggregation only, mark outcome
    const kind: 'single' | 'detect' | 'aggregate' = phase ?? 'single';

    if (kind === 'aggregate') {
      const phasesRaw = (paramGridForRun.phases_completed as Array<{ min: string; max: string }>) ?? [];
      const win = (paramGridForRun.window as { event_date_min_full: string; event_date_max_full: string } | undefined);
      if (!win) {
        await sql.end({ timeout: 5 });
        console.error(JSON.stringify({
          event: 'aggregate_missing_window_contract',
          correlationId, run_id: runId,
          hint: "run must be seeded by phase='detect'",
        }));
        return apiError(409, 'aggregate_missing_window_contract', { correlationId });
      }
      const cov = checkPhaseCoverage(phasesRaw, win.event_date_min_full, win.event_date_max_full);
      if (!cov.covered) {
        await sql.end({ timeout: 5 });
        console.error(JSON.stringify({
          event: 'aggregate_coverage_refused',
          correlationId, run_id: runId,
          coverage_gap: cov.reason,
          window: [win.event_date_min_full, win.event_date_max_full],
          phases_completed: phasesRaw,
        }));
        return apiError(409, 'aggregate_coverage_refused', { correlationId });
      }
      if (!dryRun) {
        const insertCells =
          `INSERT INTO overshoot_study_cell_results
             (run_id, side, band, window_days, momentum_quintile, drawdown_bucket,
              exclusion_width_days, arrival_count,
              mean_fwd_return_1d, mean_fwd_return_5d, mean_fwd_return_20d,
              median_fwd_return_5d, hit_rate_5d, notes)
           ${aggregationCore}`;
        const cellsRes = await sql.unsafe(insertCells, [
          runId, haircutLong, haircutShort, snap.bars_max,
        ]);
        cellCount = cellsRes.count ?? 0;
      }
      const totalMs = performance.now() - t0;
      await sql`
        UPDATE overshoot_study_runs
           SET outcome = ${dryRun ? 'partial' : 'completed'},
               completed_at = now()
         WHERE run_id = ${runId}::uuid
      `;
      await sql.end({ timeout: 5 });
      return apiSuccess({
        run_id: runId,
        event_count: 0,
        cell_count: cellCount,
        dry_run: dryRun,
        phase: 'aggregate',
        durations_ms: { total: Math.round(totalMs) },
        correlation_id: correlationId,
      });
    }

    if (kind === 'detect') {
      // Insert events for this slice; do NOT run aggregation, do NOT mark
      // outcome — the run remains 'running' until the aggregate phase.
      if (dryRun) {
        const [{ count }] = await sql.unsafe(
          `WITH detection AS (${detectionCore}) SELECT count(*)::int AS count FROM detection`,
          [runId, snap.bars_max, snap.earnings_max, minBandBps, snap.lookback_min, eventDateMin, eventDateMax],
        );
        eventCount = Number(count);
      } else {
        const insertEvents =
          `INSERT INTO overshoot_study_candidate_events
             (run_id, ticker, event_date, side, move_pct, window_days,
              excess_w1, excess_w2, excess_w3, excess_w4, excess_w5,
              momentum_quintile, drawdown_bucket, days_to_nearest_earnings, alias_used,
              fwd_return_1d, fwd_return_5d, fwd_return_20d)
           ${detectionCore}`;
        const eventsRes = await sql.unsafe(insertEvents, [
          runId, snap.bars_max, snap.earnings_max, minBandBps, snap.lookback_min, eventDateMin, eventDateMax,
        ]);
        eventCount = eventsRes.count ?? 0;
        // Append this slice to phases_completed atomically (jsonb).
        await sql`
          UPDATE overshoot_study_runs
             SET param_grid = jsonb_set(
                   COALESCE(param_grid, '{}'::jsonb),
                   '{phases_completed}',
                   COALESCE(param_grid->'phases_completed', '[]'::jsonb)
                   || ${sql.json({ min: eventDateMin, max: eventDateMax, event_count: eventCount, completed_at: new Date().toISOString() })}::jsonb
                 )
           WHERE run_id = ${runId}::uuid
        `;
      }
      const totalMs = performance.now() - t0;
      await sql.end({ timeout: 5 });
      return apiSuccess({
        run_id: runId,
        event_count: eventCount,
        cell_count: 0,
        dry_run: dryRun,
        phase: 'detect',
        slice: { event_date_min: eventDateMin, event_date_max: eventDateMax },
        durations_ms: { total: Math.round(totalMs) },
        correlation_id: correlationId,
      });
    }

    // kind === 'single' — legacy path, byte-for-byte compatible with W2.5.
    // postgres.js v3.4.4 ships as .js without .d.ts — use a local structural
    // Tx interface covering only the .unsafe() surface we call. Keeps the
    // module free of `: any` (ESLint no-explicit-any) with zero behavior change.
    interface Tx {
      unsafe(query: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
    }
    await sql.begin(async (tx: Tx) => {
      if (dryRun) {
        const [{ count }] = await tx.unsafe(
          `WITH detection AS (${detectionCore}) SELECT count(*)::int AS count FROM detection`,
          [runId, snap.bars_max, snap.earnings_max, minBandBps, snap.lookback_min, eventDateMin, eventDateMax],
        );
        eventCount = Number(count);
        return;
      }

      const insertEvents =
        `INSERT INTO overshoot_study_candidate_events
           (run_id, ticker, event_date, side, move_pct, window_days,
            excess_w1, excess_w2, excess_w3, excess_w4, excess_w5,
            momentum_quintile, drawdown_bucket, days_to_nearest_earnings, alias_used,
            fwd_return_1d, fwd_return_5d, fwd_return_20d)
         ${detectionCore}`;
      const eventsRes = await tx.unsafe(insertEvents, [
        runId,
        snap.bars_max,
        snap.earnings_max,
        minBandBps,
        snap.lookback_min,
        eventDateMin,
        eventDateMax,
      ]);
      eventCount = eventsRes.count ?? 0;

      const insertCells =
        `INSERT INTO overshoot_study_cell_results
           (run_id, side, band, window_days, momentum_quintile, drawdown_bucket,
            exclusion_width_days, arrival_count,
            mean_fwd_return_1d, mean_fwd_return_5d, mean_fwd_return_20d,
            median_fwd_return_5d, hit_rate_5d, notes)
         ${aggregationCore}`;
      const cellsRes = await tx.unsafe(insertCells, [
        runId,
        haircutLong,
        haircutShort,
        snap.bars_max,
      ]);
      cellCount = cellsRes.count ?? 0;
    });

    const totalMs = performance.now() - t0;
    await sql`
      UPDATE overshoot_study_runs
         SET outcome = ${dryRun ? 'partial' : 'completed'},
             completed_at = now()
       WHERE run_id = ${runId}::uuid
    `;
    await sql.end({ timeout: 5 });

    return apiSuccess({
      run_id: runId,
      event_count: eventCount,
      cell_count: cellCount,
      dry_run: dryRun,
      durations_ms: { total: Math.round(totalMs) },
      correlation_id: correlationId,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // W2.5 D-2 diagnostics: apiError intentionally drops `detail` from the wire
    // response (no internal leakage). Log server-side so edge-function logs
    // carry the postgres error text for correlation-id lookup.
    console.error(
      JSON.stringify({
        event: 'study_run_failed',
        correlation_id: correlationId,
        run_id: runId,
        detail,
        stack: err instanceof Error ? err.stack : undefined,
      }),
    );
    if (runId) {
      try {
        await sql`
          UPDATE overshoot_study_runs
             SET outcome = 'failed', completed_at = now()
           WHERE run_id = ${runId}::uuid
        `;
      } catch { /* best-effort; the runs row already records outcome='running' truthfully */ }
    }
    try { await sql.end({ timeout: 5 }); } catch { /* ignore */ }
    return apiError(500, 'study_run_failed', { correlationId });
  }
}));
