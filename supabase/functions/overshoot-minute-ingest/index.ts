/**
 * overshoot-minute-ingest — ACT-509 Stage-2 minute-bar substrate ingester.
 *
 * Contract:
 *   POST {
 *     slice: 'a' | 'b',
 *     pairs: [{ ticker: string, session_date: 'YYYY-MM-DD' }],
 *     seed?: number,              // recorded on ingest_runs.seed (SLICE-B stratified sample provenance)
 *   }
 *
 * Windowing (per session ET, converted to UTC on Polygon call):
 *   SLICE-A: full RTH 09:30–16:00 ET → store every 1-min bar.
 *   SLICE-B: full RTH fetched (Polygon per-day is atomic), but STORE only
 *            two decision windows per session:
 *              [09:30–09:46 ET]  == [13:30–13:46 UTC in summer / 14:30–14:46 winter]
 *              [15:45–16:01 ET]  == [19:45–20:01 UTC in summer]
 *            Filter is applied in ET-local minute-of-day, so DST-agnostic.
 *
 * Idempotency: PRIMARY KEY (ticker, ts) with ON CONFLICT DO NOTHING.
 * Discipline:  DEC-023 envelope via createHandler; overshoot.manage RBAC;
 *              one overshoot_minute_ingest_runs row per invocation with
 *              status transitions running → completed | failed.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { apiError } from '../_shared/api-error.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';

const SOURCE_VERSION = 'fb5fdf13+fix1';
const INTER_CALL_PACING_MS = 60;           // ~16 rps; Advanced tier is Unlimited
const CHUNK_UPSERT_SIZE   = 1000;

type Pair = { ticker: string; session_date: string };

interface PolygonAggBar {
  t: number;    // ms epoch (bar START)
  o: number; h: number; l: number; c: number;
  v: number; vw?: number; n?: number;
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ET-local minute-of-day, DST-agnostic via Intl.
function etMinuteOfDay(tsMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false,
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(tsMs));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}

// SLICE-B decision-window filter (ET minutes-of-day).
const WIN_MORN_START = 9 * 60 + 30;   // 09:30
const WIN_MORN_END   = 9 * 60 + 46;   // 09:46 exclusive
const WIN_LATE_START = 15 * 60 + 45;  // 15:45
const WIN_LATE_END   = 16 * 60 + 1;   // 16:01 exclusive

function inDecisionWindow(tsMs: number): boolean {
  const m = etMinuteOfDay(tsMs);
  return (m >= WIN_MORN_START && m < WIN_MORN_END) ||
         (m >= WIN_LATE_START && m < WIN_LATE_END);
}

async function fetchDayBars(
  polygonKey: string, ticker: string, session: string,
): Promise<{ bars: PolygonAggBar[]; status: number }> {
  // Polygon per-session, ET-anchored day; adjusted=false to preserve raw prints.
  const url =
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}` +
    `/range/1/minute/${session}/${session}` +
    `?adjusted=false&sort=asc&limit=50000&apiKey=${polygonKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`polygon_http_${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = await res.json();
  return { bars: (json?.results ?? []) as PolygonAggBar[], status: res.status };
}

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();

  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId });
  }

  let bodyRaw: Record<string, unknown> = {};
  try { bodyRaw = (await req.json()) as Record<string, unknown> ?? {}; }
  catch { return apiError(400, 'invalid_json_body', { correlationId }); }

  // Deploy-truth rail: version probe short-circuits BEFORE auth/kill-switch.
  if (bodyRaw?.probe === 'version') {
    return apiSuccess({
      probe: 'version', source_version: SOURCE_VERSION,
      correlation_id: correlationId,
    });
  }

  // Debug probe (non-leaking): confirms whether the cron-secret header
  // matches the edge-runtime CRON_SECRET, without echoing the value.
  if (bodyRaw?.probe === 'cron_auth') {
    const envSecret = Deno.env.get('CRON_SECRET') ?? '';
    const hdr = req.headers.get('x-cron-secret') ?? '';
    return apiSuccess({
      probe: 'cron_auth',
      env_secret_present: envSecret.length > 0,
      header_present: hdr.length > 0,
      matches: envSecret.length > 0 && hdr.length > 0 && envSecret === hdr,
      env_len: envSecret.length,
      hdr_len: hdr.length,
      correlation_id: correlationId,
    });
  }

  // Auth: either a service_role Bearer (operator-invoked one-shot backfill),
  // or a signed-in user with overshoot.manage.
  let actorId: string | null = null;
  const authHeader = req.headers.get('Authorization') ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (bearer && svcKey && bearer === svcKey) {
    actorId = null; // service-role invoked
  } else {
    const authCtx = await authenticateRequest(req);
    await checkPermissionOrThrow(authCtx.user.id, 'overshoot.manage');
    actorId = authCtx.user.id;
  }

  const polygonKey = Deno.env.get('POLYGON_API_KEY');
  if (!polygonKey) return apiError(500, 'polygon_api_key_unset', { correlationId });

  const slice = String(bodyRaw?.slice ?? '').toLowerCase();
  if (slice !== 'a' && slice !== 'b') {
    return apiError(400, 'invalid_slice', { correlationId, hint: "slice must be 'a' or 'b'" });
  }
  const pairs = Array.isArray(bodyRaw?.pairs) ? bodyRaw.pairs as Pair[] : [];
  if (pairs.length === 0) {
    return apiError(400, 'no_pairs', { correlationId });
  }
  const seed = typeof bodyRaw?.seed === 'number' ? Math.trunc(bodyRaw.seed as number) : null;

  // Insert ingest-run row (status=running).
  const admin = supabaseAdmin();
  const runIns = await admin
    .from('overshoot_minute_ingest_runs')
    .insert({
      slice_tag: slice,
      scope: { pair_count: pairs.length, sample: pairs.slice(0, 5) },
      seed: seed,
      status: 'running',
      created_by: actorId,
    })
    .select('run_id')
    .single();
  if (runIns.error) {
    return apiError(500, 'ingest_run_insert_failed', { correlationId, detail: runIns.error.message });
  }
  const runId = runIns.data.run_id as string;

  let apiCalls = 0;
  let rowsWritten = 0;
  const perPair: Array<{ ticker: string; session: string; fetched: number; stored: number; err?: string }> = [];

  try {
    for (const p of pairs) {
      if (!p?.ticker || !p?.session_date) {
        perPair.push({ ticker: String(p?.ticker), session: String(p?.session_date), fetched: 0, stored: 0, err: 'malformed_pair' });
        continue;
      }
      try {
        const { bars } = await fetchDayBars(polygonKey, p.ticker, p.session_date);
        apiCalls += 1;

        const filtered = slice === 'a' ? bars : bars.filter((b) => inDecisionWindow(b.t));
        const rows = filtered.map((b) => ({
          ticker: p.ticker,
          ts: new Date(b.t).toISOString(),
          o: b.o, h: b.h, l: b.l, c: b.c,
          v: b.v, vw: b.vw ?? null, n: b.n ?? null,
          slice_tag: slice,
          ingest_run_id: runId,
          source: 'polygon',
        }));

        let stored = 0;
        for (let i = 0; i < rows.length; i += CHUNK_UPSERT_SIZE) {
          const chunk = rows.slice(i, i + CHUNK_UPSERT_SIZE);
          const ins = await admin
            .from('overshoot_minute_bars')
            .upsert(chunk, { onConflict: 'ticker,ts', ignoreDuplicates: true });
          if (ins.error) throw new Error(`upsert_failed: ${ins.error.message}`);
          stored += chunk.length;
        }
        rowsWritten += stored;
        perPair.push({ ticker: p.ticker, session: p.session_date, fetched: bars.length, stored });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        perPair.push({ ticker: p.ticker, session: p.session_date, fetched: 0, stored: 0, err: msg });
      }
      await sleep(INTER_CALL_PACING_MS);
    }

    await admin
      .from('overshoot_minute_ingest_runs')
      .update({
        rows_written: rowsWritten,
        api_calls: apiCalls,
        status: 'completed',
        finished_at: new Date().toISOString(),
      })
      .eq('run_id', runId);

    return apiSuccess({
      run_id: runId,
      slice_tag: slice,
      pair_count: pairs.length,
      api_calls: apiCalls,
      rows_written: rowsWritten,
      per_pair: perPair,
      source_version: SOURCE_VERSION,
      correlation_id: correlationId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin
      .from('overshoot_minute_ingest_runs')
      .update({
        rows_written: rowsWritten,
        api_calls: apiCalls,
        status: 'failed',
        error: msg,
        finished_at: new Date().toISOString(),
      })
      .eq('run_id', runId);
    return apiError(500, 'ingest_failed', { correlationId, detail: msg });
  }
}));
