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

// ONE-SHOT IN-SOURCE TOKEN — third use of the standing mint→fetch→rip
// pattern (INC-147 delta re-fetch, 1,078 windows). Rips same-session.
const MATRIX_EXPORT_ONESHOT_TOKEN: string | null =
  'mx3-06ee2196176fcfd92c90b5d00e9445857924fd2b46287ca036f9cda37ef20ac9';

const CORPUS_RUN_ID = '1888e113-f9b3-43f5-856c-d91666a3c121';

// Envelope limits (DEV-T T-1 pins). 413 above these caps.
const BARS_PAIRS_MAX_PER_REQ   = 5_000;
const BARS_WINDOWS_MAX_PER_REQ = 500;
const BARS_WINDOWS_SUM_DAYS_CAP = 200_000;

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
  if (MATRIX_EXPORT_ONESHOT_TOKEN && mx === MATRIX_EXPORT_ONESHOT_TOKEN) return { ok: true };

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
//
// DEV-V RULING (V-β-SCOPED, 2026-07-26): SHORT rows MUST pass the certified
// kernel qualification INSIDE the compaction — signed excess_at_argmax
// <= -0.08 (shortExcessThreshold; reconstructor.ts:121) AND
// (window_days, momentum_quintile, drawdown_bucket) ∈ SHORT_GEOMETRY_MATRIX
// (reconstructor.ts:117-122, byte-verbatim from detector.ts:317-321):
//   windows            = {1,2,3,4,5}
//   momentum_quintiles = {1,5}
//   drawdown_buckets   = {4,5}
// Rationale: without kernel-basis pre-qualification, SHORT rows the kernel
// rejects can crowd qualifying rows below the top-25 cut (displacement =
// silent strategy substitution). LONG geometry is unchanged (LONG side had
// zero key_mismatch in Turn-2B admit; already coherent).
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
    -- DEV-V kernel-basis qualification (SHORT only; LONG untouched).
    AND (
      e.side = 'long'
      OR (
        e.side = 'short'
        AND e.short_excess_at_argmax IS NOT NULL
        AND e.short_excess_at_argmax <= -0.08
        AND e.window_days        IN (1,2,3,4,5)
        AND e.momentum_quintile  IN (1,5)
        AND e.drawdown_bucket    IN (4,5)
      )
    )
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

// CALENDAR SOURCING PIN (RULING 2026-07-26 · DEV-T T-1): the session list =
// DISTINCT trading sessions from overshoot_daily_bars WHERE ticker='SPY'.
// SPY presence is the canonical session marker for this study; a generated
// date range would be an INC-class fabrication.
const CALENDAR_SQL = `
SELECT trade_date::text AS session
FROM public.overshoot_daily_bars
WHERE ticker = 'SPY'
  AND trade_date >= $1::date
  AND trade_date <= $2::date
ORDER BY trade_date
`;

// SPY full-window OHLCV — served as its own mode so config (d) SPY-BH
// benchmark can consume it without re-issuing the calendar query.
const SPY_SQL = `
SELECT trade_date::text AS trade_date,
       open::text  AS open,
       high::text  AS high,
       low::text   AS low,
       close::text AS close,
       volume::text AS volume
FROM public.overshoot_daily_bars
WHERE ticker = 'SPY'
  AND trade_date >= $1::date
  AND trade_date <= $2::date
ORDER BY trade_date
`;

// bars_pairs — joined via unnest for a single planner pass.
const BARS_PAIRS_SQL = `
WITH p AS (
  SELECT unnest($1::text[]) AS ticker,
         unnest($2::date[]) AS trade_date
)
SELECT b.ticker,
       b.trade_date::text AS trade_date,
       b.open::text  AS open,
       b.high::text  AS high,
       b.low::text   AS low,
       b.close::text AS close,
       b.volume::text AS volume
FROM p
JOIN public.overshoot_daily_bars b
  ON b.ticker = p.ticker
 AND b.trade_date = p.trade_date
ORDER BY b.ticker, b.trade_date
`;

// bars_windows — one joined range scan across the union of windows.
const BARS_WINDOWS_SQL = `
WITH w AS (
  SELECT (elem->>'ticker')::text AS ticker,
         (elem->>'from')::date   AS f,
         (elem->>'to')::date     AS t
  FROM jsonb_array_elements($1::text::jsonb) AS elem
)
SELECT b.ticker,
       b.trade_date::text AS trade_date,
       b.open::text  AS open,
       b.high::text  AS high,
       b.low::text   AS low,
       b.close::text AS close,
       b.volume::text AS volume
FROM w
JOIN public.overshoot_daily_bars b
  ON b.ticker = w.ticker
 AND b.trade_date >= w.f
 AND b.trade_date <= w.t
ORDER BY b.ticker, b.trade_date
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
      source_version: 'matrix-export-v2-devv',
      corpus_run_id: CORPUS_RUN_ID,
      cellmap_run_id: CORPUS_RUN_ID,
      oneshot_token_present: false,
      auth: { triad: ['x-cron-secret', 'authorization:bearer(service_role)', 'x-backfill-secret'],
              oneshot: null },
      modes: ['slate','cellmap','universe','calendar','bars_pairs','bars_windows','spy'],
      envelope: {
        bars_pairs_max_per_req:   BARS_PAIRS_MAX_PER_REQ,
        bars_windows_max_per_req: BARS_WINDOWS_MAX_PER_REQ,
        bars_windows_sum_days_cap: BARS_WINDOWS_SUM_DAYS_CAP,
      },
      calendar_source: "distinct trade_date from overshoot_daily_bars where ticker='SPY'",
      slate_predicate: {
        long:  "band='L_10_INF' (kernel unchanged)",
        short: "signed excess_at_argmax<=-0.08 AND window_days IN (1..5) AND momentum_quintile IN (1,5) AND drawdown_bucket IN (4,5)",
        ruling: "DEV-V V-β-SCOPED — kernel-basis qualification inside compaction",
      },
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
    if (mode === 'calendar') {
      const since = url.searchParams.get('since') ?? '2000-01-01';
      const until = url.searchParams.get('until') ?? '2100-01-01';
      const rows = await sql.unsafe(CALENDAR_SQL, [since, until]);
      await sql.end({ timeout: 5 });
      const encoder = new TextEncoder();
      const parts: Uint8Array[] = [];
      for (const row of rows) parts.push(encoder.encode(JSON.stringify(row) + '\n'));
      const body = new Blob(parts, { type: 'application/x-ndjson; charset=utf-8' });
      return new Response(body, {
        headers: { ...CORS, 'Content-Type': 'application/x-ndjson; charset=utf-8',
                   'X-Mode': 'calendar', 'X-Since': since, 'X-Until': until,
                   'X-Rows': String(rows.length),
                   'X-Calendar-Source': 'spy_marker' },
      });
    }
    if (mode === 'spy') {
      const since = url.searchParams.get('since') ?? '2000-01-01';
      const until = url.searchParams.get('until') ?? '2100-01-01';
      const rows = await sql.unsafe(SPY_SQL, [since, until]);
      await sql.end({ timeout: 5 });
      const encoder = new TextEncoder();
      const parts: Uint8Array[] = [];
      for (const row of rows) parts.push(encoder.encode(JSON.stringify(row) + '\n'));
      const body = new Blob(parts, { type: 'application/x-ndjson; charset=utf-8' });
      return new Response(body, {
        headers: { ...CORS, 'Content-Type': 'application/x-ndjson; charset=utf-8',
                   'X-Mode': 'spy', 'X-Since': since, 'X-Until': until,
                   'X-Rows': String(rows.length) },
      });
    }
    if (mode === 'bars_pairs') {
      if (req.method !== 'POST') {
        await sql.end({ timeout: 1 });
        return new Response(JSON.stringify({ error: 'method_required_post' }), {
          status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      let body: unknown;
      try { body = await req.json(); } catch {
        await sql.end({ timeout: 1 });
        return new Response(JSON.stringify({ error: 'bad_json' }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      const pairs = (body as { pairs?: unknown }).pairs;
      if (!Array.isArray(pairs) || pairs.length === 0) {
        await sql.end({ timeout: 1 });
        return new Response(JSON.stringify({ error: 'pairs_required' }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      if (pairs.length > BARS_PAIRS_MAX_PER_REQ) {
        await sql.end({ timeout: 1 });
        return new Response(JSON.stringify({
          error: 'too_many_pairs', cap: BARS_PAIRS_MAX_PER_REQ, got: pairs.length,
        }), { status: 413, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      const tickers: string[] = [];
      const sessions: string[] = [];
      for (const p of pairs) {
        if (!Array.isArray(p) || p.length !== 2
            || typeof p[0] !== 'string' || typeof p[1] !== 'string') {
          await sql.end({ timeout: 1 });
          return new Response(JSON.stringify({ error: 'bad_pair_shape' }), {
            status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
          });
        }
        tickers.push(p[0]);
        sessions.push(p[1]);
      }
      const rows = await sql.unsafe(BARS_PAIRS_SQL, [tickers, sessions]);
      await sql.end({ timeout: 5 });
      const encoder = new TextEncoder();
      const parts: Uint8Array[] = [];
      for (const row of rows) parts.push(encoder.encode(JSON.stringify(row) + '\n'));
      const respBody = new Blob(parts, { type: 'application/x-ndjson; charset=utf-8' });
      return new Response(respBody, {
        headers: { ...CORS, 'Content-Type': 'application/x-ndjson; charset=utf-8',
                   'X-Mode': 'bars_pairs',
                   'X-Pairs-In': String(pairs.length),
                   'X-Rows-Out': String(rows.length) },
      });
    }
    if (mode === 'bars_windows') {
      if (req.method !== 'POST') {
        await sql.end({ timeout: 1 });
        return new Response(JSON.stringify({ error: 'method_required_post' }), {
          status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      let body: unknown;
      try { body = await req.json(); } catch {
        await sql.end({ timeout: 1 });
        return new Response(JSON.stringify({ error: 'bad_json' }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      const windows = (body as { windows?: unknown }).windows;
      if (!Array.isArray(windows) || windows.length === 0) {
        await sql.end({ timeout: 1 });
        return new Response(JSON.stringify({ error: 'windows_required' }), {
          status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      if (windows.length > BARS_WINDOWS_MAX_PER_REQ) {
        await sql.end({ timeout: 1 });
        return new Response(JSON.stringify({
          error: 'too_many_windows', cap: BARS_WINDOWS_MAX_PER_REQ, got: windows.length,
        }), { status: 413, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      let sumDays = 0;
      for (const w of windows) {
        const ww = w as { ticker?: unknown; from?: unknown; to?: unknown };
        if (typeof ww.ticker !== 'string' || typeof ww.from !== 'string' || typeof ww.to !== 'string') {
          await sql.end({ timeout: 1 });
          return new Response(JSON.stringify({ error: 'bad_window_shape' }), {
            status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
          });
        }
        const df = Date.parse(ww.from), dt = Date.parse(ww.to);
        if (!Number.isFinite(df) || !Number.isFinite(dt) || dt < df) {
          await sql.end({ timeout: 1 });
          return new Response(JSON.stringify({ error: 'bad_window_dates' }), {
            status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
          });
        }
        sumDays += Math.floor((dt - df) / 86400000) + 1;
      }
      if (sumDays > BARS_WINDOWS_SUM_DAYS_CAP) {
        await sql.end({ timeout: 1 });
        return new Response(JSON.stringify({
          error: 'too_many_days', cap: BARS_WINDOWS_SUM_DAYS_CAP, got: sumDays,
        }), { status: 413, headers: { ...CORS, 'Content-Type': 'application/json' } });
      }
      const rows = await sql.unsafe(BARS_WINDOWS_SQL, [JSON.stringify(windows)]);
      await sql.end({ timeout: 5 });
      const encoder = new TextEncoder();
      const parts: Uint8Array[] = [];
      for (const row of rows) parts.push(encoder.encode(JSON.stringify(row) + '\n'));
      const respBody = new Blob(parts, { type: 'application/x-ndjson; charset=utf-8' });
      return new Response(respBody, {
        headers: { ...CORS, 'Content-Type': 'application/x-ndjson; charset=utf-8',
                   'X-Mode': 'bars_windows',
                   'X-Windows-In': String(windows.length),
                   'X-Sum-Days': String(sumDays),
                   'X-Rows-Out': String(rows.length) },
      });
    }
    await sql.end({ timeout: 1 });
    return new Response(JSON.stringify({ error: 'bad_mode',
      hint: 'mode=slate|cellmap|universe|calendar|spy|bars_pairs(POST)|bars_windows(POST) or probe=version' }), {
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