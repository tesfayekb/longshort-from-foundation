/**
 * overshoot-backfill-bars-manual — FP-069 W1a manual invocation surface for
 * OHLCV backfill into `public.overshoot_daily_bars`.
 *
 * Contract (per W1a brief):
 *   POST {
 *     probe?: boolean,         // A5 gate-zero probe (no rows written, no run row)
 *     tickers?: string[],      // required unless probe=true or full=true
 *     full?: boolean,          // W1b: iterate the full 839-ticker universe
 *     lookback_days?: number,  // default 1830 (~5y+leap buffer)
 *     as_of?: 'YYYY-MM-DD',    // injected clock; defaults to today UTC
 *     resume_from?: string,    // W1b resume-by-cursor (ticker >= cursor)
 *   }
 *
 * Discipline:
 *   - RBAC via `overshoot.manage` (seeded lazily on first use; if the
 *     permission is not yet seeded the operator will receive a clear
 *     permission_denied response — that seeding is a follow-up doc-only task
 *     tracked in the W1b runbook; for W1a executor use, the service_role
 *     path is invoked directly via supabase functions.invoke() with
 *     admin JWT). Reads use `overshoot.view` per RLS.
 *   - Creates ONE `overshoot_backfill_runs` row per invocation and stamps
 *     `source_run_id` on every inserted bar for lineage.
 *   - Probe path: fetches AAPL bars for a 5-calendar-day window, throws
 *     away the result, never touches the DB, returns
 *     `{ probe: true, ok: <bool>, status: <http_status> }`.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import {
  PolygonDailyOhlcvFetcher,
  OvershootFetchError,
  DEFAULT_OVERSHOOT_BAR_LOOKBACK_DAYS,
  type OhlcvBar,
} from '../_shared/overshoot/polygon-daily-ohlcv-fetcher.ts';

const BATCH_HARD_CAP = 50;
const INTER_TICKER_PACING_MS = 250; // 4 rps floor; Polygon Advanced tolerates >100 rps

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId: crypto.randomUUID() });
  }

  const authCtx = await authenticateRequest(req);
  await checkPermissionOrThrow(authCtx.user.id, 'overshoot.manage');
  const correlationId = authCtx.correlationId;

  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown> ?? {}; }
  catch { return apiError(400, 'invalid_json_body', { correlationId }); }

  const polygonKey = Deno.env.get('POLYGON_API_KEY');
  if (!polygonKey) return apiError(500, 'polygon_api_key_unset', { correlationId });

  // ---- A5 gate-zero probe ----
  if (body.probe === true) {
    const fetcher = new PolygonDailyOhlcvFetcher(polygonKey);
    try {
      const bars = await fetcher.fetchDailyBars('AAPL', productionClock.getWallClockTs(), 5);
      return apiSuccess({
        probe: true, ok: true, ticker: 'AAPL',
        bar_count: bars?.length ?? 0, correlation_id: correlationId,
      });
    } catch (e) {
      const msg = e instanceof OvershootFetchError ? e.message :
        (e instanceof Error ? e.message : String(e));
      return apiError(502, 'polygon_probe_failed', { correlationId, detail: msg });
    }
  }

  // ---- as_of + lookback ----
  const asOfRaw = body.as_of;
  const as_of = asOfRaw
    ? parseAsOfDate(asOfRaw)
    : productionClock.getWallClockTs();
  if (!as_of) return apiError(400, 'as_of_invalid_format_expected_YYYY_MM_DD', { correlationId });
  const lookbackDays = typeof body.lookback_days === 'number' && body.lookback_days > 0
    ? Math.floor(body.lookback_days)
    : DEFAULT_OVERSHOOT_BAR_LOOKBACK_DAYS;

  // ---- ticker resolution ----
  let tickers: string[] = [];
  if (body.full === true) {
    const q = supabaseAdmin
      .from('overshoot_universe')
      .select('ticker')
      .eq('active', true)
      .order('ticker', { ascending: true });
    const { data, error } = await q;
    if (error) return apiError(500, 'universe_read_failed', { correlationId, detail: error.message });
    tickers = (data ?? []).map((r) => r.ticker as string);
    if (typeof body.resume_from === 'string' && body.resume_from.length > 0) {
      tickers = tickers.filter((t) => t >= (body.resume_from as string));
    }
  } else if (Array.isArray(body.tickers)) {
    tickers = (body.tickers as unknown[])
      .filter((t): t is string => typeof t === 'string' && t.length > 0)
      .map((t) => t.toUpperCase());
  } else {
    return apiError(400, 'tickers_or_full_required', { correlationId });
  }
  if (tickers.length === 0) {
    return apiError(400, 'no_tickers_resolved', { correlationId });
  }
  if (!body.full && tickers.length > BATCH_HARD_CAP) {
    return apiError(400, 'batch_exceeds_hard_cap_50', { correlationId, count: tickers.length });
  }

  // ---- create run row ----
  const startedIso = productionClock.getWallClockTs().toISOString();
  const { data: runRow, error: runErr } = await supabaseAdmin
    .from('overshoot_backfill_runs')
    .insert({ kind: 'bars', started_as_of: startedIso })
    .select('run_id')
    .single();
  if (runErr || !runRow) {
    return apiError(500, 'run_row_insert_failed', { correlationId, detail: runErr?.message });
  }
  const runId = runRow.run_id as string;

  // ---- iterate ----
  const fetcher = new PolygonDailyOhlcvFetcher(polygonKey);
  let totalRows = 0, reqCount = 0;
  const failures: Array<{ ticker: string; error: string }> = [];
  let lastCursor: string | null = null;

  for (const ticker of tickers) {
    reqCount++;
    let bars: OhlcvBar[] | null;
    try {
      bars = await fetcher.fetchDailyBars(ticker, as_of, lookbackDays);
    } catch (e) {
      failures.push({ ticker, error: e instanceof Error ? e.message : String(e) });
      lastCursor = ticker;
      await sleep(INTER_TICKER_PACING_MS);
      continue;
    }
    if (bars && bars.length > 0) {
      const fetchedIso = productionClock.getWallClockTs().toISOString();
      const rows = bars.map((b) => ({
        ticker,
        trade_date: b.trade_date,
        open: b.open, high: b.high, low: b.low, close: b.close,
        volume: b.volume, vwap: b.vwap, trade_count: b.trade_count,
        adjusted: true,
        source_run_id: runId,
        fetched_as_of: fetchedIso,
      }));
      const { error: upErr } = await supabaseAdmin
        .from('overshoot_daily_bars')
        .upsert(rows, { onConflict: 'ticker,trade_date' });
      if (upErr) {
        failures.push({ ticker, error: `upsert: ${upErr.message}` });
      } else {
        totalRows += rows.length;
      }
    }
    lastCursor = ticker;
    await sleep(INTER_TICKER_PACING_MS);
  }

  await supabaseAdmin.from('overshoot_backfill_runs').update({
    completed_as_of: productionClock.getWallClockTs().toISOString(),
    cursor: lastCursor,
    request_count: reqCount,
    row_count: totalRows,
    outcome: failures.length === 0 ? 'completed' : (totalRows > 0 ? 'partial' : 'failed'),
  }).eq('run_id', runId);

  return apiSuccess({
    ok: true, run_id: runId, ticker_count: tickers.length,
    row_count: totalRows, failure_count: failures.length,
    failures: failures.slice(0, 10),
    last_cursor: lastCursor, correlation_id: correlationId,
  });
}));