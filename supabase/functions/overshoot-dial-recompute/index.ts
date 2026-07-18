/**
 * overshoot-dial-recompute — ACT-551 R-003 dial-as-code.
 *
 * Production instrument for the honest ACT-536 recompute. Reads the
 * repo-committed `overshoot_dial_daily` view (ACT-548 percentile ladder
 * against ratified corpus `1888e113-...`, stamped cohort tuple per lot,
 * xw fixed at 5) and returns per-day portfolio verdict tallies + optional
 * per-lot rows. The view IS the compute; this handler is thin transport.
 *
 * DEC-023 envelope via _shared/handler.ts (T7). No writes, no clock in
 * the classifier (as_of dates are enumerated by the view via
 * generate_series → CURRENT_DATE only). Bare read.
 *
 * GET  → self-describing metadata
 * POST → { start?: 'YYYY-MM-DD', end?: 'YYYY-MM-DD', include_lots?: boolean }
 *        returns { daily: [...], lots?: [...] }
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { apiError } from '../_shared/api-error.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { parseAsOfDate } from '../_shared/parse-as-of-date.ts';

interface Body {
  start?: string;
  end?: string;
  include_lots?: boolean;
}

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  if (req.method === 'GET') {
    return apiSuccess({
      ok: true,
      handler: 'overshoot-dial-recompute',
      view: 'public.overshoot_dial_daily',
      corpus_run_id: '1888e113-f9b3-43f5-856c-d91666a3c121',
      ladder: ['leaf_xw5', 'leaf_xw0', 'pool_mq', 'pool_dd'],
      min_n: 50,
      correlation_id: correlationId,
      note: 'POST { start?, end?, include_lots? } for daily percentile verdicts',
    });
  }
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId });
  }

  if (req.headers.has('X-Cron-Secret')) {
    const cronAuthError = verifyCronSecret(req);
    if (cronAuthError) return cronAuthError;
  } else {
    const auth = await authenticateRequest(req);
    await checkPermissionOrThrow(auth.user.id, 'overshoot.view');
  }

  let body: Body = {};
  try { body = (await req.json()) as Body; } catch { body = {}; }

  const startBound = body.start ? parseAsOfDate(body.start) : null;
  const endBound = body.end ? parseAsOfDate(body.end) : null;
  if (body.start && !startBound) {
    return apiError(400, 'invalid_start_date', { correlationId });
  }
  if (body.end && !endBound) {
    return apiError(400, 'invalid_end_date', { correlationId });
  }

  let q = supabaseAdmin
    .from('overshoot_dial_daily')
    .select('as_of_date, lot_id, symbol, side, is_realized, band, win, mq, dd, ladder_rung, ladder_n, return_bps, p10_bps, p50_bps, p90_bps, verdict, entry_date')
    .order('as_of_date', { ascending: true });
  if (startBound) q = q.gte('as_of_date', startBound.toISOString().slice(0, 10));
  if (endBound) q = q.lte('as_of_date', endBound.toISOString().slice(0, 10));
  const { data, error } = await q;
  if (error) {
    return apiError(500, 'view_read_failed', {
      correlationId,
      details: { message: error.message },
    });
  }

  // Per-day aggregation — the dial's honest recompute payload.
  const daily = new Map<string, {
    as_of_date: string;
    lots: number;
    below_p10: number;
    p10_p50: number;
    p50_p90: number;
    above_p90: number;
    no_data: number;
  }>();
  for (const row of data ?? []) {
    const key = row.as_of_date as string;
    const bucket = daily.get(key) ?? {
      as_of_date: key, lots: 0, below_p10: 0, p10_p50: 0, p50_p90: 0, above_p90: 0, no_data: 0,
    };
    bucket.lots += 1;
    (bucket as unknown as Record<string, number>)[row.verdict as string] += 1;
    daily.set(key, bucket);
  }
  const dailySeries = Array.from(daily.values()).map((b) => ({
    ...b,
    pct_below_p10: b.lots - b.no_data > 0
      ? Math.round((10000 * b.below_p10) / (b.lots - b.no_data)) / 100
      : null,
  }));

  return apiSuccess({
    correlation_id: correlationId,
    view: 'public.overshoot_dial_daily',
    daily: dailySeries,
    lots: body.include_lots === true ? (data ?? []) : undefined,
  });
}));