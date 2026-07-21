/**
 * overshoot-universe-refresh — ACT-538 / INC-109 fix path.
 *
 * Weekly-refresh cron handler for `overshoot_universe`. Mirrors the
 * longshort quarterly refresh disarm-fire-enable convention: seeded
 * DISARMED (enabled=false) in job_registry; sql/39 authored with
 * placeholders; operator arms after end-to-end attestation (russell-
 * probe green + one successful manual invocation writing a real delta).
 *
 * Contract (POST body, all optional):
 *   {
 *     probe?: 'polygon',        // GATE-ZERO probe (no DB writes)
 *     dry_run?: boolean,        // fetch + diff, NO writes
 *     as_of?: 'YYYY-MM-DD',     // injected clock (defaults to today UTC)
 *   }
 *
 * Behaviour:
 *   - GATES: (1) X-Cron-Secret required on cron path; (2) global
 *     __kill_switch__ enabled=false → skip; (3) row-level disarm
 *     ('overshoot.universe.refresh' enabled=false) → skip. Probe modes
 *     short-circuit BEFORE the gates (a disarmed system must remain
 *     probeable).
 *   - FETCH: paginate Polygon `/v3/reference/tickers?index=russell2000&
 *     active=true&limit=1000` following `next_url` (each page's next_url
 *     already carries the pagination cursor). Cap page count defensively
 *     at MAX_PAGES to bound cost.
 *   - UPSERT: overshoot_universe rows (ticker PK) → active=true,
 *     source='polygon:russell2000', added_as_of=<today>, updated_at=now().
 *   - DELETION: tickers currently active=true in overshoot_universe but
 *     absent from the fresh roster are flipped active=false (soft delete)
 *     — the detector kernel's active-filter will drop them on the next
 *     tick. NO hard DELETEs (audit-preserving).
 *   - IDEMPOTENT: re-runs upsert the same set; no net delta on
 *     unchanged rosters.
 *
 * DEC-023 envelope. DEC-034 clause 4 wall-clock: productionClock only.
 * T4 audit writer: writeStrategyAuditEvent('overshoot', ...).
 *
 * DORMANT-AT-BIRTH: this handler ships with the job_registry row
 * disarmed AND sql/39 not-yet-applied — the first fire happens only
 * after operator arm-step post-attestation. INC-109 closes on that
 * arm-step; this landing charters the fix path.
 *
 * Owner: overshoot (ACT-538).
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts';
import { authenticateRequest } from '../_shared/authenticate-request.ts';
import { checkPermissionOrThrow } from '../_shared/authorization.ts';
import { verifyCronSecret } from '../_shared/cron-auth.ts';
import { apiError } from '../_shared/api-error.ts';
import { supabaseAdmin } from '../_shared/supabase-admin.ts';
import { productionClock } from '../_shared/longshort-clock.ts';
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts';
import { fetchWithTimeoutAndRetry } from '../_shared/longshort-universe/shared/fetch-with-timeout.ts';
import {
  parseCsvLine,
  findHeaderRowIndex,
} from '../_shared/longshort-universe/constituent-ingestion/ishares-constituent-fetcher.ts';

const POLYGON_BASE_URL = 'https://api.polygon.io';
const JOB_REGISTRY_ID = 'overshoot.universe.refresh';
const KILL_SWITCH_ID = '__kill_switch__';
const MAX_PAGES = 8; // 8 * 1000 tickers/page = 8000 headroom vs ~2000 R2000.
const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

// Polygon ticker-set code for Russell 2000 index membership. Matches the
// longshort PolygonConstituentFetcher taxonomy (I:SPX / I:MID). The prior
// `?index=russell2000` string was silently ignored — Polygon's reference
// endpoint only honors ticker-set codes, and unknown values fall through
// to an unfiltered market listing (INC-120 diagnostic evidence:
// page1_result_count=1000, sample_first_10 alphabetical A/AA/AAA…,
// pages_fetched=8 at MAX_PAGES cap).
const POLYGON_RUSSELL2000_CODE = 'I:RUT';

// Hard sanity gate on roster size. The Russell 2000 nominal membership is
// ~2000; realistic drift after corporate actions is a few dozen. Anything
// outside [1500, 2600] indicates the filter was silently dropped and we are
// looking at the unfiltered market again — refuse rather than write.
const ROSTER_SANITY_MIN = 1500;
const ROSTER_SANITY_MAX = 2600;

// iShares Russell 2000 ETF (IWM) — public holdings CSV. Same URL shape as
// IVV/IJH used by the existing iSharesConstituentFetcher (product-page ajax
// endpoint). The `1467271812596.ajax` suffix is the shared parameter route
// for the entire iShares US fund catalog; only the product-id and
// fileName differ per fund. Verbatim request-shape parity with the
// deployed longshort fetcher is the point of the probe: we reuse
// fetchWithTimeoutAndRetry + the same Accept header + the same CSV parser
// entries so egress behaviour matches what quarterly-refresh proved works.
const ISHARES_IWM_HOLDINGS_URL =
  'https://www.ishares.com/us/products/239710/ishares-russell-2000-etf/1467271812596.ajax?fileType=csv&fileName=IWM_holdings&dataType=fund';
const ISHARES_FETCH_TIMEOUT_MS = 30_000;

// FMP ETF-holder endpoint — keyed vendor fallback if iShares egress fails.
// Response shape: array of { asset: string, sharesNumber, weightPercentage,
// name, marketValue, updated }.
const FMP_ETF_HOLDER_URL = 'https://financialmodelingprep.com/api/v3/etf-holder/IWM';
const FMP_FETCH_TIMEOUT_MS = 20_000;

async function isRowDisarmed(id: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('job_registry')
    .select('enabled')
    .eq('id', id)
    .maybeSingle();
  return data ? data.enabled === false : false;
}

async function fetchRussellRoster(apiKey: string): Promise<
  | { kind: 'ok'; tickers: string[]; pages: number }
  | { kind: 'gated'; http_status: number }
  | { kind: 'unavailable'; http_status: number; reason: string }
> {
  const tickers: string[] = [];
  let url: string | null =
    `${POLYGON_BASE_URL}/v3/reference/tickers` +
    `?index=${encodeURIComponent(POLYGON_RUSSELL2000_CODE)}&active=true&limit=1000` +
    `&apiKey=${encodeURIComponent(apiKey)}`;
  let pages = 0;

  while (url !== null && pages < MAX_PAGES) {
    let resp: Response;
    try {
      resp = await fetch(url, { method: 'GET' });
    } catch (e) {
      return {
        kind: 'unavailable',
        http_status: 0,
        reason: e instanceof Error ? e.message : String(e),
      };
    }
    if (resp.status === 401 || resp.status === 403) {
      return { kind: 'gated', http_status: resp.status };
    }
    if (resp.status !== 200) {
      return { kind: 'unavailable', http_status: resp.status, reason: 'non_200' };
    }
    let body: unknown;
    try {
      body = await resp.json();
    } catch {
      return { kind: 'unavailable', http_status: resp.status, reason: 'json_parse' };
    }
    const b = body as { results?: Array<{ ticker?: string }>; next_url?: string };
    const results = Array.isArray(b.results) ? b.results : [];
    for (const r of results) {
      if (typeof r.ticker === 'string' && r.ticker.length > 0) {
        tickers.push(r.ticker);
      }
    }
    pages += 1;
    if (typeof b.next_url === 'string' && b.next_url.length > 0) {
      // next_url already carries the pagination cursor; append apiKey.
      const sep = b.next_url.includes('?') ? '&' : '?';
      url = `${b.next_url}${sep}apiKey=${encodeURIComponent(apiKey)}`;
    } else {
      url = null;
    }
  }
  return { kind: 'ok', tickers, pages };
}

/**
 * iShares IWM probe — reuses the exact request shape of the deployed
 * iSharesConstituentFetcher (fetchWithTimeoutAndRetry, Accept: text/csv,
 * 30s timeout, RFC-4180 CSV parser). Returns a normalized probe payload
 * or a typed failure — never throws through the handler seam.
 */
async function probeIsharesIwm(): Promise<
  | { ok: true; roster_count: number; sample_first_10: string[]; as_of: string; source_shape: string }
  | { ok: false; status: string; http_status?: number; detail?: string; source_shape: string }
> {
  const source_shape = 'ishares_iwm_holdings_csv';
  let resp;
  try {
    resp = await fetchWithTimeoutAndRetry(
      fetch as never,
      ISHARES_IWM_HOLDINGS_URL,
      { method: 'GET', headers: { 'Accept': 'text/csv, */*;q=0.1' } },
      { timeoutMs: ISHARES_FETCH_TIMEOUT_MS },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 'network_error', detail: msg, source_shape };
  }
  if (!resp.ok) {
    return { ok: false, status: 'http_error', http_status: resp.status, detail: resp.statusText, source_shape };
  }
  let csv: string;
  try {
    csv = await resp.text();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 'body_read_failed', detail: msg, source_shape };
  }
  // If the CDN handed us HTML (anti-bot landing page), reject explicitly.
  const head = csv.slice(0, 512).toLowerCase();
  if (head.includes('<!doctype html') || head.includes('<html')) {
    return { ok: false, status: 'html_body_received', detail: `first_bytes=${csv.length}`, source_shape };
  }
  const lines = csv.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0);
  const headerIdx = findHeaderRowIndex(lines);
  if (headerIdx === null) {
    return { ok: false, status: 'header_row_not_found', detail: `lines=${lines.length}`, source_shape };
  }
  const header = parseCsvLine(lines[headerIdx]).map((h) => h.toLowerCase());
  const tickerCol = header.indexOf('ticker');
  const assetClassCol = header.indexOf('asset class');
  // Best-effort "Fund Holdings as of" — first line of the preamble on
  // iShares CSVs. Not required for the probe to succeed.
  let as_of = '';
  for (const l of lines.slice(0, Math.min(15, headerIdx))) {
    if (l.toLowerCase().includes('fund holdings as of')) {
      const fields = parseCsvLine(l);
      as_of = fields.slice(-1)[0] ?? '';
      break;
    }
  }
  const tickers: string[] = [];
  for (let i = headerIdx + 1; i < lines.length; i += 1) {
    const row = parseCsvLine(lines[i]);
    if (row.length <= tickerCol) continue;
    const t = (row[tickerCol] ?? '').trim().toUpperCase();
    if (t.length === 0 || t === '-') continue;
    if (assetClassCol >= 0 && row.length > assetClassCol) {
      const ac = (row[assetClassCol] ?? '').toLowerCase();
      if (ac.length > 0 && ac !== 'equity') continue;
    }
    tickers.push(t);
  }
  return {
    ok: true,
    roster_count: tickers.length,
    sample_first_10: tickers.slice(0, 10),
    as_of,
    source_shape,
  };
}

/**
 * FMP ETF-holder probe — IWM holdings via the operator's Premium key.
 * Same normalized return shape as the iShares probe so the two are
 * substitutable in the decision rule.
 */
async function probeFmpEtfIwm(fmpKey: string): Promise<
  | { ok: true; roster_count: number; sample_first_10: string[]; as_of: string; source_shape: string }
  | { ok: false; status: string; http_status?: number; detail?: string; source_shape: string }
> {
  const source_shape = 'fmp_etf_holder_iwm';
  const url = `${FMP_ETF_HOLDER_URL}?apikey=${encodeURIComponent(fmpKey)}`;
  let resp: Response;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FMP_FETCH_TIMEOUT_MS);
    try {
      resp = await fetch(url, { method: 'GET', signal: ctl.signal });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 'network_error', detail: msg, source_shape };
  }
  if (resp.status === 401 || resp.status === 403) {
    return { ok: false, status: 'auth_gated', http_status: resp.status, source_shape };
  }
  if (resp.status !== 200) {
    return { ok: false, status: 'http_error', http_status: resp.status, detail: resp.statusText, source_shape };
  }
  let body: unknown;
  try {
    body = await resp.json();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 'json_parse_failed', detail: msg, source_shape };
  }
  if (!Array.isArray(body)) {
    // FMP sometimes returns { "Error Message": "..." } instead of an array.
    const msg = typeof body === 'object' && body !== null
      ? JSON.stringify(body).slice(0, 200)
      : String(body).slice(0, 200);
    return { ok: false, status: 'unexpected_body_shape', detail: msg, source_shape };
  }
  const tickers: string[] = [];
  let latestUpdated = '';
  for (const h of body as Array<{ asset?: unknown; updated?: unknown }>) {
    const a = h?.asset;
    if (typeof a === 'string' && a.length > 0) {
      tickers.push(a.toUpperCase());
    }
    const u = h?.updated;
    if (typeof u === 'string' && u > latestUpdated) latestUpdated = u;
  }
  return {
    ok: true,
    roster_count: tickers.length,
    sample_first_10: tickers.slice(0, 10),
    as_of: latestUpdated,
    source_shape,
  };
}

/** Returns null when roster size is inside the sanity band; otherwise a
 *  typed refusal payload. Caller must abort ALL writes on non-null return. */
function checkRosterSanity(count: number):
  | null
  | { failed: true; reason: 'roster_sanity_failed'; count: number; band: [number, number] } {
  if (count < ROSTER_SANITY_MIN || count > ROSTER_SANITY_MAX) {
    return { failed: true, reason: 'roster_sanity_failed', count, band: [ROSTER_SANITY_MIN, ROSTER_SANITY_MAX] };
  }
  return null;
}

Deno.serve(createHandler(async (req: Request) => {
  const correlationId = crypto.randomUUID();
  if (req.method !== 'POST') {
    return apiError(405, 'method_not_allowed', { correlationId });
  }

  // Cron-first branch (INC-99 / ACT-503 precedent).
  const isCron = req.headers.has('X-Cron-Secret');
  if (isCron) {
    const cronErr = verifyCronSecret(req);
    if (cronErr) return cronErr;
  } else {
    const auth = await authenticateRequest(req);
    await checkPermissionOrThrow(auth.user.id, 'overshoot.manage');
  }

  let body: { probe?: string; dry_run?: boolean; as_of?: string } = {};
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      body = await req.json();
    }
  } catch {
    // tolerate empty / non-json bodies (cron sends {time})
  }

  const apiKey = Deno.env.get('POLYGON_API_KEY') ?? '';

  // Probe short-circuits BEFORE any disarm gates — a paused system must
  // remain probeable (matches overshoot-short-interest-compute convention).
  if (body.probe === 'polygon') {
    if (!apiKey) {
      return apiSuccess({ ok: false, probe: 'polygon', status: 'polygon_api_key_missing', correlationId });
    }
    const roster = await fetchRussellRoster(apiKey);
    if (roster.kind === 'gated') {
      return apiSuccess({ ok: false, probe: 'polygon', status: 'subscription_gated', http_status: roster.http_status, correlationId });
    }
    if (roster.kind === 'unavailable') {
      return apiSuccess({ ok: false, probe: 'polygon', status: 'data_unavailable', http_status: roster.http_status, correlationId });
    }
    const sanity = checkRosterSanity(roster.tickers.length);
    return apiSuccess({
      ok: sanity === null,
      probe: 'polygon',
      status: sanity === null ? 'reports' : 'roster_sanity_failed',
      roster_count: roster.tickers.length,
      sanity_band: [ROSTER_SANITY_MIN, ROSTER_SANITY_MAX],
      sample_first_10: roster.tickers.slice(0, 10),
      pages_fetched: roster.pages,
      index_code: POLYGON_RUSSELL2000_CODE,
      correlationId,
    });
  }

  // iShares + FMP probes are cron-only (self-invoke pattern via
  // CRON_SECRET, matching R-003 / ACT-554-a). Zero writes. Zero disarm-
  // gate coupling — a paused system stays probeable.
  if (body.probe === 'ishares') {
    if (!isCron) {
      return apiSuccess({ ok: false, probe: 'ishares', status: 'cron_secret_required', correlationId });
    }
    const r = await probeIsharesIwm();
    return apiSuccess({ probe: 'ishares', correlationId, ...r });
  }
  if (body.probe === 'fmp_etf') {
    if (!isCron) {
      return apiSuccess({ ok: false, probe: 'fmp_etf', status: 'cron_secret_required', correlationId });
    }
    const fmpKey = Deno.env.get('FMP_API_KEY') ?? '';
    if (!fmpKey) {
      return apiSuccess({ ok: false, probe: 'fmp_etf', status: 'fmp_api_key_missing', correlationId });
    }
    const r = await probeFmpEtfIwm(fmpKey);
    return apiSuccess({ probe: 'fmp_etf', correlationId, ...r });
  }

  // Kill-switch is supreme over EVERYTHING including dry-runs and probes-below.
  // Row-level disarm is a scheduled-tick gate; it does NOT block operator
  // attestations (dry_run) — per operator ruling on the ordering defect.
  if (await isRowDisarmed(KILL_SWITCH_ID)) {
    return apiSuccess({ ok: true, skipped: 'kill_switch_active', correlationId });
  }

  if (!apiKey) {
    return apiSuccess({ ok: false, status: 'polygon_api_key_missing', correlationId });
  }

  const nowIso = productionClock.getWallClockTs();
  const asOfDate = (body.as_of ?? nowIso.slice(0, 10));

  const roster = await fetchRussellRoster(apiKey);
  if (roster.kind !== 'ok') {
    return apiSuccess({
      ok: false,
      status: `roster_${roster.kind}`,
      correlationId,
      http_status: 'http_status' in roster ? roster.http_status : undefined,
      reason: 'reason' in roster ? roster.reason : undefined,
    });
  }

  // Hard sanity gate — refuse ALL writes when count is outside the band.
  // This defends against silent filter-ignore regressions (INC-120 root
  // cause) and any future taxonomy drift on Polygon's side.
  const sanity = checkRosterSanity(roster.tickers.length);
  if (sanity !== null) {
    return apiSuccess({
      ok: false,
      status: 'roster_sanity_failed',
      roster_count: roster.tickers.length,
      sanity_band: [ROSTER_SANITY_MIN, ROSTER_SANITY_MAX],
      sample_first_10: roster.tickers.slice(0, 10),
      index_code: POLYGON_RUSSELL2000_CODE,
      pages_fetched: roster.pages,
      correlationId,
    });
  }

  const freshSet = new Set(roster.tickers);

  // Load current active universe for delta computation.
  const { data: current, error: readErr } = await supabaseAdmin
    .from('overshoot_universe')
    .select('ticker, active')
    .eq('active', true);
  if (readErr) {
    return apiSuccess({ ok: false, status: 'universe_read_failed', detail: readErr.message, correlationId });
  }
  const currentActive = new Set((current ?? []).map((r) => r.ticker as string));
  const toDeactivate: string[] = [];
  for (const t of currentActive) {
    if (!freshSet.has(t)) toDeactivate.push(t);
  }
  const upsertRows = roster.tickers.map((t) => ({
    ticker: t,
    source: 'polygon:russell2000',
    added_as_of: asOfDate,
    active: true,
  }));

  if (body.dry_run === true) {
    return apiSuccess({
      ok: true,
      dry_run: true,
      roster_count: roster.tickers.length,
      sanity_band: [ROSTER_SANITY_MIN, ROSTER_SANITY_MAX],
      would_upsert: upsertRows.length,
      would_deactivate: toDeactivate.length,
      would_deactivate_sample: toDeactivate.slice(0, 10),
      pages_fetched: roster.pages,
      index_code: POLYGON_RUSSELL2000_CODE,
      as_of_date: asOfDate,
      correlationId,
    });
  }

  // Real-write path: row-level disarm gate applies HERE (scheduled/manual
  // real fires). Probes + dry-runs already returned above.
  if (await isRowDisarmed(JOB_REGISTRY_ID)) {
    return apiSuccess({ ok: true, skipped: 'job_disarmed', correlationId });
  }

  const { error: upsertErr } = await supabaseAdmin
    .from('overshoot_universe')
    .upsert(upsertRows, { onConflict: 'ticker', ignoreDuplicates: false });
  if (upsertErr) {
    return apiSuccess({ ok: false, status: 'universe_upsert_failed', detail: upsertErr.message, correlationId });
  }

  let deactivated = 0;
  if (toDeactivate.length > 0) {
    const { error: deactErr, count } = await supabaseAdmin
      .from('overshoot_universe')
      .update({ active: false }, { count: 'exact' })
      .in('ticker', toDeactivate);
    if (deactErr) {
      return apiSuccess({ ok: false, status: 'universe_deactivate_failed', detail: deactErr.message, correlationId });
    }
    deactivated = count ?? toDeactivate.length;
  }

  await writeStrategyAuditEvent({
    strategyKey: 'overshoot',
    actorId: DEFAULT_OPERATOR_ID,
    action: 'overshoot.universe.refresh.completed',
    targetType: 'overshoot_universe',
    correlationId,
    metadata: {
      as_of_date: asOfDate,
      roster_count: roster.tickers.length,
      upserted: upsertRows.length,
      deactivated,
      pages_fetched: roster.pages,
      is_cron: isCron,
    },
  });

  return apiSuccess({
    ok: true,
    as_of_date: asOfDate,
    roster_count: roster.tickers.length,
    upserted: upsertRows.length,
    deactivated,
    pages_fetched: roster.pages,
    correlationId,
  });
}));