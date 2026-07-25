/**
 * overshoot-sector-ingest — ACT-515(e) Sector Ingest, Turn 2 of 3.
 *
 * Fetches GICS sector metadata from FMP `/stable/profile?symbol=<T>` for
 * `overshoot_universe` tickers and writes `gics_sector / sector_source /
 * sector_asof` (columns landed Turn 1, sql/44_overshoot_universe_sector.sql).
 * Consumed downstream by the ACT-515(e) sector-concentration cap engine
 * variant (see scripts/act-515/charter-amendment-e-sector-cap.md).
 *
 * Modes (POST body — all fields optional):
 *   {
 *     probe?:   'fmp',                     // 1-ticker verbatim fetch, no writes
 *     smoke?:   true,                      // N tickers from universe, verbatim rows, no writes
 *     tickers?: string[],                  // override smoke set (upper-case symbols)
 *     limit?:   number,                    // smoke/apply cap (default: smoke=20)
 *     apply?:   true,                      // REAL WRITE path (Turn 3) — requires cron secret
 *     as_of?:   'YYYY-MM-DD',              // injected wall-clock; default today UTC
 *   }
 *
 * Semantics:
 *   - `probe='fmp'`: fetch AAPL (default) or `tickers[0]`, return the
 *     FmpProfileFetchResult verbatim + `verifyFieldsPresent` audit for the
 *     load-bearing fields (`symbol`, `sector`, `industry`). Zero side-effects.
 *   - `smoke=true` (no `apply`): default 20 tickers from `overshoot_universe`
 *     where `active=true` AND `gics_sector IS NULL` (unenriched-first) ordered
 *     by ticker. Emits `{ticker, kind, sector?, industry?, reason?, symbol_echo?}`
 *     rows verbatim. No DB writes.
 *   - `apply=true`: DORMANT this turn. Requires cron secret. Wires the writer
 *     for Turn 3; kill-switch and dormant-at-birth job registry gates apply.
 *
 * Discipline:
 *   - `as_of` from injected clock (`productionClock`) at the entry point.
 *     Fetcher and downstream helpers are pure w.r.t. time.
 *   - Typed-absence: missing / blank / gated sector NEVER written; the MIG
 *     Turn-1 CHECK constraint (`overshoot_universe_sector_provenance_chk`)
 *     rejects a NULL sector with non-NULL source at the substrate.
 *   - Rate limit: sequential fetch with 100ms inter-request delay (~10 rps)
 *     to stay comfortably under FMP quota during Turn-3 backfill.
 *   - DEC-023 envelope. T4 audit via `writeStrategyAuditEvent`.
 *
 * Owner: overshoot (ACT-515(e) Sector Ingest Turn 2).
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import {
  FmpProfileFetcher,
  verifyFieldsPresent,
  type FmpProfileFetchResult,
} from '../_shared/overshoot/fmp-profile-fetcher.ts';

const SOURCE_TAG = 'fmp';
const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const JOB_REGISTRY_ID = 'overshoot.sector.ingest';
const KILL_SWITCH_ID = '__kill_switch__';
const DEFAULT_SMOKE_LIMIT = 20;
const DEFAULT_APPLY_LIMIT = 1000; // ~IVV+IJH universe headroom
const REQUIRED_FMP_FIELDS = ['symbol', 'sector', 'industry'] as const;
const RATE_LIMIT_DELAY_MS = 100;

// SOURCE_VERSION — sector-ingest Turn 2 landing (fetcher + fn + smoke).
// Bump on any money-path / substrate-behaviour change (Turn 3 backfill flips
// to '+t3'). See _shared/handler.ts sourceVersion contract.
const SOURCE_VERSION = 'sector-ingest-t2';

function todayUtcIso(): string {
  return productionClock.now().toISOString().slice(0, 10);
}

function isValidTicker(t: unknown): t is string {
  return typeof t === 'string' && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(t.trim().toUpperCase());
}

async function isDisarmed(id: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('job_registry')
    .select('enabled')
    .eq('id', id)
    .maybeSingle();
  // Dormant-at-birth: MISSING row is treated as disarmed. This is the
  // opposite of the universe-refresh convention (which pre-dates the job
  // row) because Turn-2 lands the handler WITHOUT seeding a job_registry
  // row — Turn-3 charter is responsible for seeding + operator arm-step.
  if (!data) return true;
  return data.enabled === false;
}

interface SmokeRow {
  ticker: string;
  kind: 'profile' | 'unavailable';
  sector?: string;
  industry?: string | null;
  symbol_echo?: string;
  reason?: 'subscription_gated' | 'data_unavailable';
}

function toSmokeRow(ticker: string, r: FmpProfileFetchResult): SmokeRow {
  if (r.kind === 'profile') {
    return {
      ticker,
      kind: 'profile',
      sector: r.sector,
      industry: r.industry,
      symbol_echo: r.symbol_echo,
    };
  }
  return { ticker, kind: 'unavailable', reason: r.reason };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

Deno.serve(createHandler(async (req: Request): Promise<Response> => {
  const correlationId = crypto.randomUUID();
  const cronErr = verifyCronSecret(req);
  const isCron = cronErr === null;

  const bodyRaw = await req.text();
  let body: {
    probe?: string;
    smoke?: boolean;
    apply?: boolean;
    tickers?: unknown;
    limit?: number;
    as_of?: string;
  } = {};
  if (bodyRaw.length > 0) {
    try {
      body = JSON.parse(bodyRaw);
    } catch {
      return apiSuccess({ ok: false, status: 'json_parse_failed', correlationId });
    }
  }

  const asOfDate = typeof body.as_of === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.as_of)
    ? body.as_of
    : todayUtcIso();

  const apiKey = Deno.env.get('FMP_API_KEY') ?? '';
  if (apiKey.length === 0) {
    return apiSuccess({ ok: false, status: 'fmp_api_key_missing', correlationId });
  }
  const fetcher = new FmpProfileFetcher(apiKey);

  // ---------- probe='fmp' ---------- (no writes; no gates)
  if (body.probe === 'fmp') {
    const probeTicker = Array.isArray(body.tickers) && isValidTicker((body.tickers as unknown[])[0])
      ? ((body.tickers as string[])[0]).trim().toUpperCase()
      : 'AAPL';
    // Second raw fetch so verifyFieldsPresent can observe the payload the
    // typed fetcher just consumed. This is intentionally two calls — the
    // probe mode explicitly trades one extra request for verbatim evidence.
    let raw: unknown = null;
    try {
      const url =
        `https://financialmodelingprep.com/stable/profile?symbol=${encodeURIComponent(probeTicker)}` +
        `&apikey=${encodeURIComponent(apiKey)}`;
      const resp = await fetch(url);
      if (resp.ok) {
        raw = await resp.json();
      } else {
        try { await resp.text(); } catch { /* ignore */ }
      }
    } catch (_e) {
      raw = null;
    }
    const rawRow = Array.isArray(raw) && raw.length > 0 ? raw[0] : null;
    const fields = verifyFieldsPresent(rawRow, REQUIRED_FMP_FIELDS);

    let result: FmpProfileFetchResult;
    try {
      result = await fetcher.fetchProfile(probeTicker);
    } catch (e) {
      return apiSuccess({
        ok: false,
        probe: 'fmp',
        ticker: probeTicker,
        status: 'fetch_error',
        detail: e instanceof Error ? e.message : String(e),
        correlationId,
      });
    }
    return apiSuccess({
      ok: true,
      probe: 'fmp',
      ticker: probeTicker,
      result,
      fields_present: fields.present,
      fields_missing: fields.missing,
      raw_row: rawRow,
      as_of_date: asOfDate,
      correlationId,
    });
  }

  // ---------- smoke=true (default when apply != true) ----------
  const wantsApply = body.apply === true;
  if (!wantsApply) {
    let tickers: string[] = [];
    if (Array.isArray(body.tickers)) {
      for (const t of body.tickers as unknown[]) {
        if (isValidTicker(t)) tickers.push((t as string).trim().toUpperCase());
      }
      tickers = [...new Set(tickers)].sort();
    } else {
      const limit = typeof body.limit === 'number' && body.limit > 0
        ? Math.min(Math.trunc(body.limit), 100)
        : DEFAULT_SMOKE_LIMIT;
      // Prefer UNENRICHED tickers (gics_sector IS NULL) so smoke exercises
      // the write-path that Turn-3 backfill will actually run against.
      // Fall back to enriched if the universe is fully populated already
      // (post-Turn-3 world).
      const { data: unenriched, error: e1 } = await supabaseAdmin
        .from('overshoot_universe')
        .select('ticker')
        .eq('active', true)
        .is('gics_sector', null)
        .order('ticker', { ascending: true })
        .limit(limit);
      if (e1) {
        return apiSuccess({ ok: false, smoke: true, status: 'universe_read_failed', detail: e1.message, correlationId });
      }
      tickers = (unenriched ?? []).map((r) => r.ticker as string);
      if (tickers.length === 0) {
        const { data: enriched, error: e2 } = await supabaseAdmin
          .from('overshoot_universe')
          .select('ticker')
          .eq('active', true)
          .order('ticker', { ascending: true })
          .limit(limit);
        if (e2) {
          return apiSuccess({ ok: false, smoke: true, status: 'universe_read_failed', detail: e2.message, correlationId });
        }
        tickers = (enriched ?? []).map((r) => r.ticker as string);
      }
    }

    const rows: SmokeRow[] = [];
    const errors: Array<{ ticker: string; error: string }> = [];
    for (const t of tickers) {
      try {
        const r = await fetcher.fetchProfile(t);
        rows.push(toSmokeRow(t, r));
      } catch (e) {
        errors.push({ ticker: t, error: e instanceof Error ? e.message : String(e) });
      }
      await sleep(RATE_LIMIT_DELAY_MS);
    }

    const summary = {
      total: tickers.length,
      profile_count: rows.filter((r) => r.kind === 'profile').length,
      unavailable_count: rows.filter((r) => r.kind === 'unavailable').length,
      error_count: errors.length,
    };
    return apiSuccess({
      ok: true,
      smoke: true,
      as_of_date: asOfDate,
      summary,
      rows,
      errors,
      correlationId,
    });
  }

  // ---------- apply=true — REAL WRITE (Turn 3 territory) ----------
  if (cronErr !== null) {
    return apiSuccess({ ok: false, apply: true, status: 'cron_secret_required', correlationId });
  }
  // Kill-switch supreme + dormant-at-birth job row.
  if (await isDisarmed(KILL_SWITCH_ID)) {
    return apiSuccess({ ok: true, apply: true, skipped: 'kill_switch_engaged', correlationId });
  }
  if (await isDisarmed(JOB_REGISTRY_ID)) {
    return apiSuccess({
      ok: true,
      apply: true,
      skipped: 'job_disarmed_dormant_at_birth',
      note: 'Turn-3 backfill charter will seed job_registry row and operator arm-step will flip enabled=true.',
      correlationId,
    });
  }

  // From here down: Turn-3 backfill loop. Wired but not exercised this turn.
  const limit = typeof body.limit === 'number' && body.limit > 0
    ? Math.min(Math.trunc(body.limit), DEFAULT_APPLY_LIMIT)
    : DEFAULT_APPLY_LIMIT;

  const { data: targets, error: readErr } = await supabaseAdmin
    .from('overshoot_universe')
    .select('ticker')
    .eq('active', true)
    .is('gics_sector', null)
    .order('ticker', { ascending: true })
    .limit(limit);
  if (readErr) {
    return apiSuccess({ ok: false, apply: true, status: 'universe_read_failed', detail: readErr.message, correlationId });
  }
  const tickers = (targets ?? []).map((r) => r.ticker as string);

  const applied: string[] = [];
  const unavailable: Array<{ ticker: string; reason: string }> = [];
  const errors: Array<{ ticker: string; error: string }> = [];
  const asOfIso = productionClock.now().toISOString();

  for (const t of tickers) {
    try {
      const r = await fetcher.fetchProfile(t);
      if (r.kind === 'profile') {
        const { error: updErr } = await supabaseAdmin
          .from('overshoot_universe')
          .update({
            gics_sector: r.sector,
            sector_source: SOURCE_TAG,
            sector_asof: asOfIso,
          })
          .eq('ticker', t);
        if (updErr) {
          errors.push({ ticker: t, error: updErr.message });
        } else {
          applied.push(t);
        }
      } else {
        // Typed-absence: NEVER write NULL sector with non-null provenance.
        unavailable.push({ ticker: t, reason: r.reason });
      }
    } catch (e) {
      errors.push({ ticker: t, error: e instanceof Error ? e.message : String(e) });
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  await writeStrategyAuditEvent({
    strategyKey: 'overshoot',
    actorId: DEFAULT_OPERATOR_ID,
    action: 'overshoot.sector.ingest.completed',
    targetType: 'overshoot_universe',
    correlationId,
    metadata: {
      source: SOURCE_TAG,
      as_of: asOfIso,
      candidate_count: tickers.length,
      applied_count: applied.length,
      unavailable_count: unavailable.length,
      error_count: errors.length,
      applied_sample: applied.slice(0, 20),
      is_cron: isCron,
    },
  });

  return apiSuccess({
    ok: true,
    apply: true,
    source: SOURCE_TAG,
    as_of: asOfIso,
    summary: {
      candidate_count: tickers.length,
      applied_count: applied.length,
      unavailable_count: unavailable.length,
      error_count: errors.length,
    },
    unavailable_sample: unavailable.slice(0, 20),
    errors_sample: errors.slice(0, 20),
    correlationId,
  });
}, { sourceVersion: SOURCE_VERSION }));