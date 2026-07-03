/**
 * overshoot-study-run — FP-069 W2.4 study runner (manual invocation only).
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
 *   }
 *
 * Sequence (single pg connection; runs row lives OUTSIDE the events/cells txn
 * so a failure is truthfully recorded per ACT-457-ADD-03 spec):
 *   1. Insert overshoot_study_runs row with stamps + params + snapshot ceilings
 *      + git_sha, outcome='running'.
 *   2. BEGIN TX.
 *      2a. INSERT ... FROM event-detection.sql (SELECT-only for dry_run).
 *      2b. INSERT ... FROM cell-aggregation.sql (skipped for dry_run).
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

const EVENT_DETECTION_SQL = await Deno.readTextFile(
  new URL('../_shared/overshoot/study/event-detection.sql', import.meta.url),
);
const CELL_AGGREGATION_SQL = await Deno.readTextFile(
  new URL('../_shared/overshoot/study/cell-aggregation.sql', import.meta.url),
);

const SURVIVORSHIP_STAMP = 'UPPER_BOUND_SURVIVORSHIP_BIASED';
const PERFORMANCE_STAMP = 'NON_PERFORMANCE_STUDY_ONLY';
const SHORT_FILTER_STAMP = 'NO_SQUEEZE_FILTER_ARRIVALS_UPPER_BOUND_RETURNS_CONSERVATIVE';
const RETURN_BASIS = 'CLOSE_TO_CLOSE_REFERENCE';

function stripStatementBody(sql: string): string {
  // Strip trailing whitespace / final `;` at end-of-file so the SELECT can be
  // wrapped in an INSERT ... SELECT. Line-level comments (--) inside the body
  // are preserved.
  return sql.replace(/;\s*$/, '').trimEnd();
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
  const paramGrid = (body.param_grid as Record<string, unknown>) ?? { defaults: 'R1' };
  const paramGridHash = await hashParams({
    param_grid: paramGrid,
    haircut_long: haircutLong,
    haircut_short: haircutShort,
    min_band_bps: minBandBps,
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
      return apiError(422, 'no_bars_at_or_before_as_of', { correlationId, detail: asOfDay });
    }

    // 2. Insert runs row (outside the events/cells transaction).
    const [runRow] = await sql<{ run_id: string }[]>`
      INSERT INTO overshoot_study_runs (
        run_label, as_of, git_sha, param_grid, param_grid_hash,
        slippage_haircut_bps_long, slippage_haircut_bps_short,
        bars_snapshot_max_date, earnings_snapshot_max_date,
        survivorship_stamp, performance_stamp, short_filter_stamp, return_basis,
        outcome
      ) VALUES (
        ${runLabel}, ${asOfIso}::timestamptz, ${gitSha},
        ${sql.json(paramGrid)}, ${paramGridHash},
        ${haircutLong}, ${haircutShort},
        ${snap.bars_max}::date, ${snap.earnings_max}::date,
        ${SURVIVORSHIP_STAMP}, ${PERFORMANCE_STAMP}, ${SHORT_FILTER_STAMP}, ${RETURN_BASIS},
        'running'
      )
      RETURNING run_id
    `;
    runId = runRow.run_id;

    const detectionCore = bindNamed(stripStatementBody(EVENT_DETECTION_SQL), DETECTION_PARAM_ORDER);
    const aggregationCore = bindNamed(stripStatementBody(CELL_AGGREGATION_SQL), AGGREGATION_PARAM_ORDER);

    // 3. Events + cells transaction. Parameter substitution uses postgres.js
    //    unsafe() with positional params so the entire SQL body ships once.
    let eventCount = 0;
    let cellCount = 0;

    await sql.begin(async (tx) => {
      if (dryRun) {
        const [{ count }] = await tx.unsafe(
          `WITH detection AS (${detectionCore}) SELECT count(*)::int AS count FROM detection`,
          [runId, snap.bars_max, snap.earnings_max, minBandBps, snap.lookback_min],
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
    return apiError(500, 'study_run_failed', { correlationId, detail });
  }
}));
