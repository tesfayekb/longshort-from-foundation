/**
 * overshoot-matrix-export — ACT-515 matrix-lane read-only bulk export.
 *
 * Ratified by DEV-O RULING O-4 (2026-07-26): permanent fn, service-role
 * internal, TRIAD auth (CRON_SECRET / service-role bearer /
 * BACKFILL_ONESHOT_SECRET) + one-shot in-source token that rips after
 * Fetch-Cache Turn-2 with the rip-probe receipt. Returns compact NDJSON
 * streams (one line per row, no envelope).
 *
 * MODES
 *   ?mode=slate     TOP-N=25 per (session, side) compaction of
 *                   overshoot_study_candidate_events(run 1888e113…),
 *                   ranked by rankScore = mean_fwd_return_5d × sideSign
 *                   from overshoot_study_cell_results(run 1888e113…),
 *                   tie-break: tier ASC, rankScore DESC, ticker ASC,
 *                   event_id ASC (DEV-P.2). Events with no cell hit are
 *                   excluded from slate (rank_null_skip, pre-authorized).
 *   ?mode=cellmap   All 6,000 rows from overshoot_study_cell_results
 *                   (run 1888e113…), K-1 pinned columns.
 *   ?mode=universe  active=TRUE roster (905 rows) + one trailer aggregate
 *                   line: {trailer:true, active_count, corpus_ticker_count,
 *                   intersection_count, bound_delta_count}.
 *
 *   TURN-2A SIBLINGS (RULING 2026-07-26 · DEV-T T-1):
 *   ?mode=calendar         DISTINCT trading sessions from
 *                          overshoot_daily_bars WHERE ticker='SPY' over
 *                          [since, until]. SPY = canonical session marker;
 *                          NEVER a generated date range (INC-class
 *                          fabrication guard). Emits {session:'YYYY-MM-DD'}.
 *   POST mode=bars_pairs   Body: {pairs:[[ticker,session],...]}. Cap
 *                          5000/req (413 above). Returns joined bar rows.
 *   POST mode=bars_windows Body: {windows:[{ticker,from,to},...]}. Cap 500
 *                          windows/req, sum(days) 200k (413 above).
 *   ?mode=spy              Full SPY OHLCV over [since, until].
 *
 * AUTH: any ONE of —
 *   X-Cron-Secret: $CRON_SECRET
 *   Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY
 *   X-Backfill-Secret: $BACKFILL_ONESHOT_SECRET
 *   X-Matrix-Export-Token: MATRIX_EXPORT_ONESHOT_TOKEN (below; rips per O-4)
 */

// deno-lint-ignore-file no-explicit-any
/* eslint-disable @typescript-eslint/no-explicit-any */
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

// ONE-SHOT IN-SOURCE TOKEN (O-4 lifecycle: rip after Fetch-Cache Turn-2).
// This is not a secret against a determined attacker with source access;
// it is a defense-in-depth stripe over the triad. Value is high-entropy.
const MATRIX_EXPORT_ONESHOT_TOKEN =
  'mx1-7e2a4c9d6b8f13e5a077c1b4d5e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6';

const CORPUS_RUN_ID = '1888e113-f9b3-43f5-856c-d91666a3c121';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret, x-backfill-secret, x-matrix-export-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function authorize(req: Request): { ok: true } | { ok: false; reason: string } {
  const auth = req.headers.get('authorization') ?? '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
  const srk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (srk && bearer && bearer === srk) return { ok: true };

  const cron = req.headers.get('x-cron-secret') ?? '';
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  if (cronSecret && cron === cronSecret) return { ok: true };

  const backfill = req.headers.get('x-backfill-secret') ?? '';
  const backfillSecret = Deno.env.get('BACKFILL_ONESHOT_SECRET') ?? '';
  if (backfillSecret && backfill === backfillSecret) return { ok: true };

  const mx = req.headers.get('x-matrix-export-token') ?? '';
  if (mx && mx === MATRIX_EXPORT_ONESHOT_TOKEN) return { ok: true };

  return { ok: false, reason: 'no_valid_credential' };
}

function ndjsonStream(sql: any, cursorSql: string, params: any[] = []) {
  const cursor = sql.unsafe(cursorSql, params).cursor(500);
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await cursor.next();
        if (done) {
          controller.close();
          await sql.end({ timeout: 5 });
          return;
        }
        // postgres.js cursor yields arrays of rows
        for (const row of value) {
          controller.enqueue(encoder.encode(JSON.stringify(row) + '\n'));
        }
      } catch (e) {
        controller.error(e);
        try { await sql.end({ timeout: 1 }); } catch { /* noop */ }
      }
    },
    async cancel() {
      try { await sql.end({ timeout: 1 }); } catch { /* noop */ }
    },
  });
}

// mode=slate — TOP-25 per (session,side) via ROW_NUMBER over rankScore.
// rankScore = cell.mean_fwd_return_5d × sideSign, from join
// (side, band, window_days, momentum_quintile, drawdown_bucket, exclusion_width_days=5).
//
// SHORT band derivation: argmax-|excess| across excess_w1..w5, then bucket by
// signed excess into S_03_04..S_10_INF (thresholds mirror cell-aggregation.sql.ts §A).
// LONG band: fixed 'L_10_INF' per Matrix §1(b) certified geometry.
const SLATE_SQL = `
WITH ev AS (
  SELECT event_id, ticker, event_date, side,
         move_pct, window_days, momentum_quintile, drawdown_bucket,
         days_to_nearest_earnings,
         excess_w1, excess_w2, excess_w3, excess_w4, excess_w5
  FROM public.overshoot_study_candidate_events
  WHERE run_id = $1::uuid
    AND event_date >= $2::date
    AND event_date <  $3::date
),
ev_short_argmax AS (
  SELECT e.*,
    CASE WHEN e.side='short' THEN (
      SELECT ex FROM (
        VALUES (e.excess_w1),(e.excess_w2),(e.excess_w3),(e.excess_w4),(e.excess_w5)
      ) AS t(ex)
      WHERE ex IS NOT NULL
      ORDER BY abs(ex) DESC NULLS LAST
      LIMIT 1
    ) END AS short_excess_at_argmax
  FROM ev e
),
ev_band AS (
  SELECT e.*,
    CASE
      WHEN e.side='long' THEN 'L_10_INF'
      WHEN e.side='short' AND e.short_excess_at_argmax IS NULL THEN NULL
      WHEN e.side='short' AND e.short_excess_at_argmax <= -0.10 THEN 'S_10_INF'
      WHEN e.side='short' AND e.short_excess_at_argmax <= -0.08 THEN 'S_08_10'
      WHEN e.side='short' AND e.short_excess_at_argmax <= -0.06 THEN 'S_06_08'
      WHEN e.side='short' AND e.short_excess_at_argmax <= -0.05 THEN 'S_05_06'
      WHEN e.side='short' AND e.short_excess_at_argmax <= -0.04 THEN 'S_04_05'
      WHEN e.side='short' AND e.short_excess_at_argmax <= -0.03 THEN 'S_03_04'
      ELSE NULL
    END AS band
  FROM ev_short_argmax e
),
ev_tier AS (
  SELECT e.*,
    CASE
      WHEN e.side='long' AND e.window_days IN (1,2,3,4,5)
           AND e.momentum_quintile IN (4,5) AND e.drawdown_bucket IN (1,2) THEN 'T1'
      WHEN e.side='long' THEN 'T2'
      WHEN e.side='short' THEN 'T2'
      ELSE NULL
    END AS tier
  FROM ev_band e
),
joined AS (
  SELECT e.event_id, e.ticker, e.event_date, e.side, e.tier, e.band,
         e.window_days, e.momentum_quintile, e.drawdown_bucket,
         e.move_pct, e.days_to_nearest_earnings,
         e.excess_w1, e.excess_w2, e.excess_w3, e.excess_w4, e.excess_w5,
         e.short_excess_at_argmax,
         c.mean_fwd_return_5d,
         (CASE e.side WHEN 'long' THEN 1 WHEN 'short' THEN -1 END)::numeric
           * c.mean_fwd_return_5d AS rank_score
  FROM ev_tier e
  JOIN public.overshoot_study_cell_results c
    ON c.run_id = $1::uuid
   AND c.side = e.side
   AND c.band = e.band
   AND c.window_days = e.window_days
   AND c.momentum_quintile = e.momentum_quintile
   AND c.drawdown_bucket = e.drawdown_bucket
   AND c.exclusion_width_days = 5
  WHERE e.band IS NOT NULL
    AND e.momentum_quintile IS NOT NULL
    AND e.drawdown_bucket IS NOT NULL
),
ranked AS (
  SELECT j.*,
    ROW_NUMBER() OVER (
      PARTITION BY j.event_date, j.side
      ORDER BY j.tier ASC, j.rank_score DESC, j.ticker ASC, j.event_id ASC
    ) AS slate_rank
  FROM joined j
)
SELECT event_date::text AS session, side, slate_rank::int AS slate_rank,
       tier, band, ticker, event_id,
       window_days, momentum_quintile, drawdown_bucket,
       move_pct::text AS move_pct,
       short_excess_at_argmax::text AS short_excess_at_argmax,
       excess_w1::text AS excess_w1, excess_w2::text AS excess_w2,
       excess_w3::text AS excess_w3, excess_w4::text AS excess_w4,
       excess_w5::text AS excess_w5,
       days_to_nearest_earnings,
       mean_fwd_return_5d::text AS mean_fwd_return_5d,
       rank_score::text AS rank_score
FROM ranked
WHERE slate_rank <= 25
ORDER BY event_date, side, slate_rank
`;

const CELLMAP_SQL = `
SELECT side, band, window_days, momentum_quintile, drawdown_bucket,
       exclusion_width_days,
       arrival_count,
       mean_fwd_return_1d::text  AS mean_fwd_return_1d,
       mean_fwd_return_5d::text  AS mean_fwd_return_5d,
       mean_fwd_return_20d::text AS mean_fwd_return_20d,
       median_fwd_return_5d::text AS median_fwd_return_5d,
       hit_rate_5d::text AS hit_rate_5d
FROM public.overshoot_study_cell_results
WHERE run_id = $1::uuid
ORDER BY side, band, window_days, momentum_quintile, drawdown_bucket, exclusion_width_days
`;

const UNIVERSE_SQL = `
SELECT ticker, source, added_as_of::text AS added_as_of, active,
       gics_sector, sector_source
FROM public.overshoot_universe
WHERE active = TRUE
ORDER BY ticker
`;

// Trailer aggregate for universe mode.
async function universeTrailer(sql: any): Promise<Record<string, unknown>> {
  const rows = await sql.unsafe(`
    WITH active_u AS (
      SELECT ticker FROM public.overshoot_universe WHERE active = TRUE
    ),
    corpus_t AS (
      SELECT DISTINCT ticker FROM public.overshoot_study_candidate_events
      WHERE run_id = $1::uuid
    )
    SELECT
      (SELECT count(*) FROM active_u) AS active_count,
      (SELECT count(*) FROM corpus_t) AS corpus_ticker_count,
      (SELECT count(*) FROM active_u a JOIN corpus_t c ON c.ticker=a.ticker) AS intersection_count,
      (SELECT count(*) FROM corpus_t c WHERE NOT EXISTS(SELECT 1 FROM active_u a WHERE a.ticker=c.ticker)) AS corpus_only_count,
      (SELECT count(*) FROM active_u a WHERE NOT EXISTS(SELECT 1 FROM corpus_t c WHERE c.ticker=a.ticker)) AS active_only_count
  `, [CORPUS_RUN_ID]);
  const r = rows[0] ?? {};
  return {
    trailer: true,
    active_count: Number(r.active_count ?? 0),
    corpus_ticker_count: Number(r.corpus_ticker_count ?? 0),
    intersection_count: Number(r.intersection_count ?? 0),
    corpus_only_count: Number(r.corpus_only_count ?? 0),
    active_only_count: Number(r.active_only_count ?? 0),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const authz = authorize(req);
  if (!authz.ok) {
    return new Response(JSON.stringify({ error: 'unauthorized', reason: authz.reason }), {
      status: 401,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get('mode');
  const probe = url.searchParams.get('probe');

  if (probe === 'version') {
    return new Response(JSON.stringify({
      source_version: 'matrix-export-v1',
      corpus_run_id: CORPUS_RUN_ID,
      cellmap_run_id: CORPUS_RUN_ID,
      oneshot_token_present: true,
      auth: { triad: ['x-cron-secret', 'authorization:bearer(service_role)', 'x-backfill-secret'],
              oneshot: 'x-matrix-export-token' },
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) {
    return new Response(JSON.stringify({ error: 'supabase_db_url_unset' }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // postgres.js: prepare=false is required for pgbouncer transaction-pooled URLs
  const sql = postgres(dbUrl, { prepare: false, max: 1, idle_timeout: 5 });

  try {
    if (mode === 'slate') {
      const since = url.searchParams.get('since') ?? '2000-01-01';
      const until = url.searchParams.get('until') ?? '2100-01-01';
      // Buffered (not streamed): guarantees the connection isn't held past
      // Cloudflare's 100s idle window when the CTE is planning. Window is
      // caller-paginated (yearly slices from the fetch-cache driver).
      const rows = await sql.unsafe(SLATE_SQL, [CORPUS_RUN_ID, since, until]);
      await sql.end({ timeout: 5 });
      const encoder = new TextEncoder();
      const parts: Uint8Array[] = [];
      for (const row of rows) parts.push(encoder.encode(JSON.stringify(row) + '\n'));
      const body = new Blob(parts, { type: 'application/x-ndjson; charset=utf-8' });
      return new Response(body, {
        headers: { ...CORS, 'Content-Type': 'application/x-ndjson; charset=utf-8',
                   'X-Mode': 'slate', 'X-Corpus-Run': CORPUS_RUN_ID,
                   'X-Since': since, 'X-Until': until, 'X-Rows': String(rows.length) },
      });
    }
    if (mode === 'cellmap') {
      // Buffered (6,000 rows, ~1MB). Streaming via postgres.js cursor was
      // hitting a 504 on cold pool; buffered is honest for this size.
      const rows = await sql.unsafe(CELLMAP_SQL, [CORPUS_RUN_ID]);
      await sql.end({ timeout: 5 });
      const encoder = new TextEncoder();
      const parts: Uint8Array[] = [];
      for (const row of rows) parts.push(encoder.encode(JSON.stringify(row) + '\n'));
      const body = new Blob(parts, { type: 'application/x-ndjson; charset=utf-8' });
      return new Response(body, {
        headers: { ...CORS, 'Content-Type': 'application/x-ndjson; charset=utf-8',
                   'X-Mode': 'cellmap', 'X-Cellmap-Run': CORPUS_RUN_ID,
                   'X-Rows': String(rows.length) },
      });
    }
    if (mode === 'universe') {
      // Universe is small; stream rows + trailer inline (single stream, single connection).
      const trailer = await universeTrailer(sql);
      const rows = await sql.unsafe(UNIVERSE_SQL, []);
      const encoder = new TextEncoder();
      const parts: Uint8Array[] = [];
      for (const row of rows) parts.push(encoder.encode(JSON.stringify(row) + '\n'));
      parts.push(encoder.encode(JSON.stringify(trailer) + '\n'));
      await sql.end({ timeout: 5 });
      const body = new Blob(parts, { type: 'application/x-ndjson; charset=utf-8' });
      return new Response(body, {
        headers: { ...CORS, 'Content-Type': 'application/x-ndjson; charset=utf-8',
                   'X-Mode': 'universe' },
      });
    }
    await sql.end({ timeout: 1 });
    return new Response(JSON.stringify({ error: 'bad_mode', hint: 'mode=slate|cellmap|universe or probe=version' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    try { await sql.end({ timeout: 1 }); } catch { /* noop */ }
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[overshoot-matrix-export]', msg);
    return new Response(JSON.stringify({ error: 'export_failed', detail: msg }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});