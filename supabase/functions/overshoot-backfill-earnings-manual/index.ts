/**
 * overshoot-backfill-earnings-manual — FP-069 W1a manual invocation surface
 * for earnings-calendar backfill into `public.overshoot_earnings_calendar`.
 *
 * Contract:
 *   POST {
 *     source: 'finnhub' | 'fmp',
 *     from: 'YYYY-MM-DD',
 *     to:   'YYYY-MM-DD',
 *     tickers?: string[],   // required for source=finnhub (per-ticker API)
 *     full?: boolean,       // W1b: iterate the full 839-ticker universe (finnhub only)
 *     resume_from?: string, // W1b resume-by-cursor (finnhub only)
 *   }
 *
 * Notes on source selection:
 *   - Finnhub is per-ticker and carries the load-bearing `hour` session flag
 *     (NULL preserved for empty/unknown values — typed absence).
 *   - FMP is a single bulk range call per invocation; hour is always NULL
 *     (used exclusively for date-agreement cross-audit at the W1 close bar).
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import {
  FinnhubEarningsFetcher,
  FmpEarningsCalendarFetcher,
  type EarningsRow,
} from '../_shared/overshoot/earnings-calendar-fetcher.ts';
import { OvershootFetchError } from '../_shared/overshoot/polygon-daily-ohlcv-fetcher.ts';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const INTER_TICKER_PACING_MS = 1100; // Finnhub free tier ~60/min; Advanced tier tolerates faster
const BATCH_HARD_CAP = 50;

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

  const source = body.source as string | undefined;
  const from = body.from as string | undefined;
  const to = body.to as string | undefined;
  if (source !== 'finnhub' && source !== 'fmp') {
    return apiError(400, 'source_must_be_finnhub_or_fmp', { correlationId });
  }
  if (!from || !ISO_DATE_RE.test(from) || !to || !ISO_DATE_RE.test(to)) {
    return apiError(400, 'from_to_required_YYYY_MM_DD', { correlationId });
  }

  const kind = source === 'finnhub' ? 'earnings_finnhub' : 'earnings_fmp';
  const startedIso = productionClock.getWallClockTs().toISOString();
  const { data: runRow, error: runErr } = await supabaseAdmin
    .from('overshoot_backfill_runs')
    .insert({ kind, started_as_of: startedIso })
    .select('run_id')
    .single();
  if (runErr || !runRow) {
    return apiError(500, 'run_row_insert_failed', { correlationId, detail: runErr?.message });
  }
  const runId = runRow.run_id as string;

  let totalRows = 0, reqCount = 0;
  const failures: Array<{ scope: string; error: string }> = [];
  let lastCursor: string | null = null;
  let duplicatesDropped = 0;

  async function persist(rows: EarningsRow[]) {
    if (rows.length === 0) return;
    const fetchedIso = productionClock.getWallClockTs().toISOString();
    // DEFECT-2 / ACT-456 (FP-069 W1b turn-6): in-memory PK-tuple dedupe
    // (ticker|announcement_date|source), keep-FIRST. Vendor bulk ranges
    // (FMP) occasionally return duplicate PK tuples that would otherwise
    // trip Postgres upsert ("cannot affect row a second time"). No other
    // row semantics are changed.
    const seen = new Map<string, EarningsRow>();
    for (const r of rows) {
      const key = `${r.ticker}|${r.announcement_date}|${r.source}`;
      if (seen.has(key)) { duplicatesDropped++; continue; }
      seen.set(key, r);
    }
    const deduped = Array.from(seen.values());
    const payload = deduped.map((r) => ({
      ticker: r.ticker,
      announcement_date: r.announcement_date,
      source: r.source,
      hour: r.hour, // may be null (typed absence)
      quarter: r.quarter,
      fiscal_year: r.fiscal_year,
      eps_estimate: r.eps_estimate,
      eps_actual: r.eps_actual,
      revenue_estimate: r.revenue_estimate,
      revenue_actual: r.revenue_actual,
      source_run_id: runId,
      fetched_as_of: fetchedIso,
    }));
    const { error } = await supabaseAdmin
      .from('overshoot_earnings_calendar')
      .upsert(payload, { onConflict: 'ticker,announcement_date,source' });
    if (error) failures.push({ scope: 'upsert', error: error.message });
    else totalRows += payload.length;
  }

  try {
    if (source === 'finnhub') {
      const key = Deno.env.get('FINNHUB_API_KEY');
      if (!key) return apiError(500, 'finnhub_api_key_unset', { correlationId });
      let tickers: string[] = [];
      if (body.full === true) {
        const { data, error } = await supabaseAdmin
          .from('overshoot_universe').select('ticker').eq('active', true)
          .order('ticker', { ascending: true });
        if (error) return apiError(500, 'universe_read_failed', { correlationId, detail: error.message });
        tickers = (data ?? []).map((r) => r.ticker as string);
        if (typeof body.resume_from === 'string' && (body.resume_from as string).length > 0) {
          tickers = tickers.filter((t) => t >= (body.resume_from as string));
        }
      } else if (Array.isArray(body.tickers)) {
        tickers = (body.tickers as unknown[])
          .filter((t): t is string => typeof t === 'string' && t.length > 0)
          .map((t) => t.toUpperCase());
      } else {
        return apiError(400, 'tickers_or_full_required_for_finnhub', { correlationId });
      }
      if (tickers.length === 0) return apiError(400, 'no_tickers_resolved', { correlationId });
      if (!body.full && tickers.length > BATCH_HARD_CAP) {
        return apiError(400, 'batch_exceeds_hard_cap_50', { correlationId, count: tickers.length });
      }
      const fetcher = new FinnhubEarningsFetcher(key);
      for (const ticker of tickers) {
        reqCount++;
        try {
          const rows = await fetcher.fetchForTicker(ticker, from, to);
          await persist(rows);
        } catch (e) {
          failures.push({
            scope: ticker,
            error: e instanceof OvershootFetchError ? e.message
                 : (e instanceof Error ? e.message : String(e)),
          });
        }
        lastCursor = ticker;
        await sleep(INTER_TICKER_PACING_MS);
      }
    } else {
      const key = Deno.env.get('FMP_API_KEY');
      if (!key) return apiError(500, 'fmp_api_key_unset', { correlationId });
      const fetcher = new FmpEarningsCalendarFetcher(key);
      reqCount++;
      try {
        const rows = await fetcher.fetchRange(from, to);
        await persist(rows);
      } catch (e) {
        failures.push({
          scope: `${from}..${to}`,
          error: e instanceof OvershootFetchError ? e.message
               : (e instanceof Error ? e.message : String(e)),
        });
      }
      lastCursor = to;
    }
  } finally {
    await supabaseAdmin.from('overshoot_backfill_runs').update({
      completed_as_of: productionClock.getWallClockTs().toISOString(),
      cursor: lastCursor,
      request_count: reqCount,
      row_count: totalRows,
      outcome: failures.length === 0 ? 'completed' : (totalRows > 0 ? 'partial' : 'failed'),
    }).eq('run_id', runId);
  }

  return apiSuccess({
    ok: true, run_id: runId, source, from, to,
    row_count: totalRows, request_count: reqCount,
    duplicates_dropped: duplicatesDropped,
    failure_count: failures.length, failures: failures.slice(0, 10),
    last_cursor: lastCursor, correlation_id: correlationId,
  });
}));