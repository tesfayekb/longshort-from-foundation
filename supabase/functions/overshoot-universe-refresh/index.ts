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

// Hard sanity gate on roster size. Per operator ruling (DEC / Option C,
// INC-126 closure): `overshoot_universe` identity is the S&P 500 (IVV) ∪
// S&P MidCap 400 (IJH) composite (~900 names). The prior [1500,2600] band
// was inherited from a Russell-2000 misconception and is retired.
// ACT-559 / vendor lanes retarget to IVV+IJH sources is deferred — the
// operator-seed multi-file union path is the reliable channel until
// EDGAR N-PORT for IVV/IJH proves out from this environment.
// ~2000; realistic drift after corporate actions is a few dozen. Anything
// outside [1500, 2600] indicates the filter was silently dropped and we are
// looking at the unfiltered market again — refuse rather than write.
const ROSTER_SANITY_MIN = 850;
const ROSTER_SANITY_MAX = 950;

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

// FMP ETF-holdings endpoint — keyed vendor fallback if iShares egress fails.
// Premium-era path: /stable/etf-holdings?symbol=IWM (v3 /etf-holder is legacy
// and returned 403 on the operator's Premium key per INC-124). Response
// shape: array of { symbol|asset, sharesNumber, weightPercentage, name,
// marketValue, updated }.
const FMP_ETF_HOLDINGS_URL = 'https://financialmodelingprep.com/stable/etf-holdings';
const FMP_FETCH_TIMEOUT_MS = 20_000;

// SEC EDGAR N-PORT probe — public, programmatic-by-design. Requires only a
// UA-with-contact header (SEC policy). Chartered as ACT-559 lane 4 successor
// to the manual-seed path: N-PORT filings lag ~1 quarter but the Russell 2000
// reconstitutes annually (June) with only modest intra-year churn, so a
// quarter-lagged holdings feed fits the drift tolerance.
//
// IWM (BlackRock's Russell 2000 ETF) is registered under CIK 0001100663
// (iShares Trust) as series S000004310. The company-tickers endpoint below
// is used only for probe-time CIK verification; the actual holdings live in
// N-PORT-P filings whose XML is fetched from the submissions index. This
// probe returns a typed shape either way — the automated primary flip only
// happens after operator ratifies the probe output.
const EDGAR_BASE = 'https://data.sec.gov';
const EDGAR_FETCH_TIMEOUT_MS = 20_000;
// Public IWM series id (iShares Russell 2000 ETF).
const EDGAR_IWM_CIK = '0001100663';
const EDGAR_IWM_SERIES_ID = 'S000004310';

// Manual-seed provenance tag — distinct from the polygon:russell2000 tag so
// downstream readers can tell operator-CSV seeds apart from cron refresh
// rows. §22.5.1 evidence lands in the T4 audit row.
// Provenance tag for the operator-seed path. Identity ratified as
// IVV ∪ IJH per Option C ruling; the multi-file union is written under
// this single tag with the per-file sha256 hashes carried in the audit
// row's `csv_sha256_provenances` array.
const SEED_SOURCE_TAG = 'ishares:ivv_ijh:manual_seed';

// Staleness watchdog budget (days). Weekly refresh is the target cadence;
// 35 days = 5 missed weeks and the actionable page threshold per Option-4
// alert redesign. The staleness probe returns days_since_last_seed so the
// dispatcher can page on breach without polling raw table state.
const STALENESS_BUDGET_DAYS = 35;

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Ticker-array normalization for the client-attested seed path.
 *
 * Contract (operator ruling):
 *   - array of 1-6-char uppercase symbols (/^[A-Z]{1,6}$/)
 *   - deduped
 *   - non-conforming rows (cash placeholders, futures, blanks, dashes)
 *     are dropped silently — the client-side extractor strips them, but
 *     we re-enforce server-side so the audit truth matches the accepted
 *     shape.
 *
 * Returns the sorted unique array. Sorting is required for the
 * `tickers_sha256` integrity hash to be reproducible across client and
 * server (join order matters).
 */
function normalizeTickers(input: unknown):
  | { ok: true; tickers: string[]; dropped: number }
  | { ok: false; status: string; detail?: string } {
  if (!Array.isArray(input)) {
    return { ok: false, status: 'tickers_not_array' };
  }
  if (input.length === 0) {
    return { ok: false, status: 'tickers_empty' };
  }
  const re = /^[A-Z]{1,6}$/;
  const seen = new Set<string>();
  const kept: string[] = [];
  let dropped = 0;
  for (const raw of input) {
    if (typeof raw !== 'string') { dropped += 1; continue; }
    const t = raw.trim().toUpperCase();
    if (!re.test(t)) { dropped += 1; continue; }
    if (seen.has(t)) { dropped += 1; continue; }
    seen.add(t);
    kept.push(t);
  }
  kept.sort();
  return { ok: true, tickers: kept, dropped };
}

/**
 * Deterministic ticker-set hash. Sorted + newline-joined so client and
 * server compute identical digests. Used as the integrity guard on the
 * client-attested seed path (server refuses on mismatch).
 */
async function tickersSha256Hex(sortedTickers: string[]): Promise<string> {
  return sha256Hex(sortedTickers.join('\n'));
}

/**
 * Parse an iShares-shaped holdings CSV (multi-line preamble + header row +
 * one row per holding). Returns the equity tickers plus the "Fund Holdings
 * as of" date if present. Shared between the ishares probe and seed modes
 * so behaviour is identical whether the CSV came from live egress or an
 * operator upload.
 */
function parseIsharesCsv(csv: string):
  | { ok: true; tickers: string[]; as_of: string }
  | { ok: false; status: string; detail?: string } {
  const head = csv.slice(0, 512).toLowerCase();
  if (head.includes('<!doctype html') || head.includes('<html')) {
    return { ok: false, status: 'html_body_received', detail: `bytes=${csv.length}` };
  }
  const lines = csv.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0);
  const headerIdx = findHeaderRowIndex(lines);
  if (headerIdx === null) {
    return { ok: false, status: 'header_row_not_found', detail: `lines=${lines.length}` };
  }
  const header = parseCsvLine(lines[headerIdx]).map((h) => h.toLowerCase());
  const tickerCol = header.indexOf('ticker');
  const assetClassCol = header.indexOf('asset class');
  if (tickerCol < 0) {
    return { ok: false, status: 'ticker_column_missing' };
  }
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
  return { ok: true, tickers, as_of };
}

/**
 * EDGAR N-PORT probe — one-shot feasibility read against data.sec.gov.
 * Fetches the iShares Trust submissions index, filters for N-PORT-P (public
 * portfolio filings), pulls the most recent filing's primary XML doc, and
 * extracts equity holdings whose series id matches IWM. This is a
 * feasibility PROBE — zero writes, typed shape identical to the other
 * probes so the decision rule is substitutable.
 *
 * SEC UA policy: "User-Agent: Company Name AdminContact@example.com".
 * We use the operator-configured `EDGAR_CONTACT_EMAIL` secret.
 */
async function probeEdgarNport(contactEmail: string): Promise<
  | { ok: true; roster_count: number; sample_first_10: string[]; as_of: string; source_shape: string }
  | { ok: false; status: string; http_status?: number; detail?: string; source_shape: string }
> {
  const source_shape = 'sec_edgar_nport_p_iwm_series';
  const ua = `overshoot-universe-refresh/1.0 (${contactEmail})`;
  const headers: Record<string, string> = {
    'User-Agent': ua,
    'Accept': 'application/json, text/xml, */*;q=0.1',
    'Accept-Encoding': 'gzip, deflate',
    'Host': 'data.sec.gov',
  };
  const url = `${EDGAR_BASE}/submissions/CIK${EDGAR_IWM_CIK}.json`;
  let resp;
  try {
    resp = await fetchWithTimeoutAndRetry(
      fetch as never,
      url,
      { method: 'GET', headers },
      { timeoutMs: EDGAR_FETCH_TIMEOUT_MS },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 'network_error', detail: msg, source_shape };
  }
  if (!resp.ok) {
    return {
      ok: false,
      status: 'http_error',
      http_status: resp.status,
      detail: resp.statusText,
      source_shape,
    };
  }
  let body: unknown;
  try {
    body = await resp.json();
  } catch (e) {
    return {
      ok: false,
      status: 'json_parse_failed',
      detail: e instanceof Error ? e.message : String(e),
      source_shape,
    };
  }
  const b = body as {
    filings?: {
      recent?: {
        form?: string[];
        accessionNumber?: string[];
        primaryDocument?: string[];
        filingDate?: string[];
      };
    };
  };
  const recent = b?.filings?.recent;
  if (!recent || !Array.isArray(recent.form)) {
    return { ok: false, status: 'submissions_index_shape', source_shape };
  }
  // Locate the most recent N-PORT-P.
  let idx = -1;
  for (let i = 0; i < recent.form.length; i += 1) {
    if (recent.form[i] === 'NPORT-P') {
      idx = i;
      break;
    }
  }
  if (idx < 0) {
    return { ok: false, status: 'no_nport_p_filing', source_shape };
  }
  const accession = (recent.accessionNumber?.[idx] ?? '').replace(/-/g, '');
  const primary = recent.primaryDocument?.[idx] ?? '';
  const filingDate = recent.filingDate?.[idx] ?? '';
  if (!accession || !primary) {
    return { ok: false, status: 'nport_filing_pointer_missing', source_shape };
  }
  // N-PORT primary docs live under www.sec.gov/Archives/edgar/data/<cik>/<accession>/<primary>.
  // The XML enumerates ALL series in the trust; we filter by series id at parse time.
  const filingUrl =
    `https://www.sec.gov/Archives/edgar/data/${Number(EDGAR_IWM_CIK)}/${accession}/${primary}`;
  let filingResp;
  try {
    filingResp = await fetchWithTimeoutAndRetry(
      fetch as never,
      filingUrl,
      { method: 'GET', headers: { ...headers, 'Host': 'www.sec.gov' } },
      { timeoutMs: EDGAR_FETCH_TIMEOUT_MS },
    );
  } catch (e) {
    return {
      ok: false,
      status: 'nport_fetch_network_error',
      detail: e instanceof Error ? e.message : String(e),
      source_shape,
    };
  }
  if (!filingResp.ok) {
    return {
      ok: false,
      status: 'nport_http_error',
      http_status: filingResp.status,
      detail: filingResp.statusText,
      source_shape,
    };
  }
  let xml: string;
  try {
    xml = await filingResp.text();
  } catch (e) {
    return {
      ok: false,
      status: 'nport_body_read_failed',
      detail: e instanceof Error ? e.message : String(e),
      source_shape,
    };
  }
  // Best-effort XML extraction without pulling a heavy parser:
  //   - Series id lives in <seriesId>Sxxxxxxxxxx</seriesId>.
  //   - Each holding lives in <invstOrSec>...<ticker>XYZ</ticker>...</invstOrSec>.
  // The N-PORT XML repeats <invstOrSec> once per issuer. This is a PROBE —
  // if the tag shape shifts the probe returns typed shape-mismatch and the
  // manual-seed path stays primary.
  if (!xml.includes(`<seriesId>${EDGAR_IWM_SERIES_ID}</seriesId>`)) {
    return {
      ok: false,
      status: 'series_id_absent_in_nport',
      detail: `expected=${EDGAR_IWM_SERIES_ID}`,
      source_shape,
    };
  }
  const tickerRe = /<ticker>([A-Z0-9.\-]{1,10})<\/ticker>/g;
  const tickers: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = tickerRe.exec(xml)) !== null) {
    const t = m[1].trim().toUpperCase();
    if (t.length > 0 && !tickers.includes(t)) tickers.push(t);
  }
  if (tickers.length === 0) {
    return { ok: false, status: 'no_tickers_extracted', source_shape };
  }
  return {
    ok: true,
    roster_count: tickers.length,
    sample_first_10: tickers.slice(0, 10),
    as_of: filingDate,
    source_shape,
  };
}

/**
 * Staleness probe — reports the age (days) of `overshoot_universe`'s most
 * recent active-row upsert. Used by the alerts dispatcher (Option-4 alert
 * redesign) so it can page ONLY on staleness-budget breach without polling
 * the raw table. Zero writes.
 */
async function probeStaleness(): Promise<
  | { ok: true; last_updated_at: string | null; days_since: number | null; budget_days: number; breach: boolean }
  | { ok: false; status: string; detail?: string }
> {
  const { data, error } = await supabaseAdmin
    .from('overshoot_universe')
    .select('updated_at')
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    return { ok: false, status: 'read_failed', detail: error.message };
  }
  const last = (data?.updated_at as string | undefined) ?? null;
  if (last === null) {
    return {
      ok: true,
      last_updated_at: null,
      days_since: null,
      budget_days: STALENESS_BUDGET_DAYS,
      breach: true, // absence-of-data is a breach, not a zero
    };
  }
  const nowMs = new Date(productionClock.getWallClockTs()).getTime();
  const lastMs = new Date(last).getTime();
  const days = Number.isFinite(lastMs) ? (nowMs - lastMs) / 86_400_000 : null;
  return {
    ok: true,
    last_updated_at: last,
    days_since: days === null ? null : Math.round(days * 100) / 100,
    budget_days: STALENESS_BUDGET_DAYS,
    breach: days === null ? true : days > STALENESS_BUDGET_DAYS,
  };
}

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
  return probeIsharesIwmWithHeaders({ 'Accept': 'text/csv, */*;q=0.1' }, 'ishares_iwm_holdings_csv');
}

/**
 * Browser-headers variant — same URL/parser, but sends a Mozilla User-Agent,
 * Accept-Language, and Referer to defeat CDN anti-bot fingerprinting. Held
 * as a separate probe so the raw baseline and the browser-shaped attempt
 * are directly comparable (INC-123 diagnostic).
 */
async function probeIsharesIwmBrowser(): Promise<
  | { ok: true; roster_count: number; sample_first_10: string[]; as_of: string; source_shape: string }
  | { ok: false; status: string; http_status?: number; detail?: string; source_shape: string }
> {
  return probeIsharesIwmWithHeaders(
    {
      'Accept': 'text/csv,application/csv,*/*;q=0.1',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.ishares.com/us/products/239710/ishares-russell-2000-etf',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    'ishares_iwm_holdings_csv_browser_headers',
  );
}

async function probeIsharesIwmWithHeaders(
  headers: Record<string, string>,
  source_shape: string,
): Promise<
  | { ok: true; roster_count: number; sample_first_10: string[]; as_of: string; source_shape: string }
  | { ok: false; status: string; http_status?: number; detail?: string; source_shape: string }
> {
  let resp;
  try {
    resp = await fetchWithTimeoutAndRetry(
      fetch as never,
      ISHARES_IWM_HOLDINGS_URL,
      { method: 'GET', headers },
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
  const source_shape = 'fmp_stable_etf_holdings_iwm';
  const url = `${FMP_ETF_HOLDINGS_URL}?symbol=IWM&apikey=${encodeURIComponent(fmpKey)}`;
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
  for (const h of body as Array<{ asset?: unknown; symbol?: unknown; updated?: unknown }>) {
    // /stable/etf-holdings uses `symbol`; /v3/etf-holder used `asset`. Accept both.
    const a = (typeof h?.symbol === 'string' && h.symbol.length > 0) ? h.symbol : h?.asset;
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
  if (body.probe === 'ishares_bh') {
    if (!isCron) {
      return apiSuccess({ ok: false, probe: 'ishares_bh', status: 'cron_secret_required', correlationId });
    }
    const r = await probeIsharesIwmBrowser();
    return apiSuccess({ probe: 'ishares_bh', correlationId, ...r });
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

  // EDGAR N-PORT probe — lane 4 (ACT-559). Cron-only (self-invoke pattern),
  // zero writes. UA-with-contact per SEC access policy.
  if (body.probe === 'edgar_nport') {
    if (!isCron) {
      return apiSuccess({ ok: false, probe: 'edgar_nport', status: 'cron_secret_required', correlationId });
    }
    const contact = Deno.env.get('EDGAR_CONTACT_EMAIL') ?? '';
    if (!contact) {
      return apiSuccess({ ok: false, probe: 'edgar_nport', status: 'edgar_contact_email_missing', correlationId });
    }
    const r = await probeEdgarNport(contact);
    return apiSuccess({ probe: 'edgar_nport', correlationId, ...r });
  }

  // Staleness probe — reports age of overshoot_universe. Cron-only. Zero
  // writes. Consumed by the alerts dispatcher's Option-4 watchdog.
  if (body.probe === 'staleness') {
    if (!isCron) {
      return apiSuccess({ ok: false, probe: 'staleness', status: 'cron_secret_required', correlationId });
    }
    const r = await probeStaleness();
    return apiSuccess({ probe: 'staleness', correlationId, ...r });
  }

  // Operator-CSV seed — dry-run. Accepts the raw iShares IWM holdings CSV
  // in `body.csv` (string). Cron-only (only reachable via CRON_SECRET path
  // + operator DevTools snippet). Zero writes; returns roster_count +
  // csv_sha256 + would_upsert / would_deactivate so §22.5.1 evidence can
  // be inspected before commit.
  if (body.probe === 'seed') {
    if (!isCron) {
      return apiSuccess({ ok: false, probe: 'seed', status: 'cron_secret_required', correlationId });
    }
    // Two accepted shapes:
    //   (A) server_hashed:   { csv: string }                     — ≤64KB path
    //   (B) client_attested: { tickers: string[],
    //                          as_of?: string,
    //                          csv_sha256_provenance?: string,
    //                          csv_bytes?: number }              — ~15-20KB path
    // The dispatcher chooses by presence of `tickers` (array). The
    // audit row records `provenance_mode` honestly so downstream
    // readers cannot mistake a client-attested seed for a server-
    // hashed one.
    const b = body as {
      csv?: unknown;
      tickers?: unknown;
      as_of?: unknown;
      csv_sha256_provenance?: unknown;
      csv_bytes?: unknown;
      csv_sha256_provenances?: unknown; // multi-file union: e.g. IVV + IJH
    };
    const hasTickers = Array.isArray(b.tickers);

    let tickers: string[];
    let as_of_from_source: string;
    let provenance_mode: 'server_hashed' | 'client_attested';
    let csv_sha256: string | null;
    let csv_sha256_provenance: string | null = null;
    let csv_sha256_provenances: string[] = [];
    let csv_bytes_attested: number | null = null;
    let dropped = 0;

    if (hasTickers) {
      const norm = normalizeTickers(b.tickers);
      if (!norm.ok) {
        return apiSuccess({ ok: false, probe: 'seed', status: norm.status, detail: norm.detail, correlationId });
      }
      tickers = norm.tickers;
      dropped = norm.dropped;
      as_of_from_source = typeof b.as_of === 'string' ? b.as_of : '';
      provenance_mode = 'client_attested';
      csv_sha256 = null;
      csv_sha256_provenance = typeof b.csv_sha256_provenance === 'string'
        ? b.csv_sha256_provenance.toLowerCase()
        : null;
      if (Array.isArray(b.csv_sha256_provenances)) {
        csv_sha256_provenances = (b.csv_sha256_provenances as unknown[])
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.toLowerCase());
      }
      csv_bytes_attested = typeof b.csv_bytes === 'number' && Number.isFinite(b.csv_bytes)
        ? Math.trunc(b.csv_bytes)
        : null;
    } else {
      const csv = typeof b.csv === 'string' ? b.csv : '';
      if (csv.length === 0) {
        return apiSuccess({ ok: false, probe: 'seed', status: 'csv_body_missing', correlationId });
      }
      const parsed = parseIsharesCsv(csv);
      if (!parsed.ok) {
        return apiSuccess({ ok: false, probe: 'seed', status: parsed.status, detail: parsed.detail, correlationId });
      }
      tickers = parsed.tickers;
      as_of_from_source = parsed.as_of;
      csv_sha256 = await sha256Hex(csv);
      provenance_mode = 'server_hashed';
    }

    const tickers_sha256 = await tickersSha256Hex(tickers);
    const sanity = checkRosterSanity(tickers.length);
    if (sanity !== null) {
      return apiSuccess({
        ok: false,
        probe: 'seed',
        status: 'roster_sanity_failed',
        roster_count: tickers.length,
        sanity_band: [ROSTER_SANITY_MIN, ROSTER_SANITY_MAX],
        sample_first_10: tickers.slice(0, 10),
        provenance_mode,
        tickers_sha256,
        csv_sha256,
        csv_sha256_provenance,
        correlationId,
      });
    }
    const fresh = new Set(tickers);
    const { data: current, error: readErr } = await supabaseAdmin
      .from('overshoot_universe')
      .select('ticker')
      .eq('active', true);
    if (readErr) {
      return apiSuccess({ ok: false, probe: 'seed', status: 'universe_read_failed', detail: readErr.message, correlationId });
    }
    const currentSet = new Set((current ?? []).map((r) => r.ticker as string));
    const would_deactivate: string[] = [];
    for (const t of currentSet) if (!fresh.has(t)) would_deactivate.push(t);
    return apiSuccess({
      ok: true,
      probe: 'seed',
      dry_run: true,
      roster_count: tickers.length,
      sanity_band: [ROSTER_SANITY_MIN, ROSTER_SANITY_MAX],
      sample_first_10: tickers.slice(0, 10),
      as_of_from_source,
      would_upsert: tickers.length,
      would_deactivate: would_deactivate.length,
      would_deactivate_sample: would_deactivate.slice(0, 10),
      provenance_mode,
      tickers_sha256,
      csv_sha256,
      csv_sha256_provenance,
      csv_sha256_provenances,
      csv_bytes_attested,
      dropped_nonconforming: dropped,
      correlationId,
    });
  }

  // Operator-CSV seed — real apply. Same parse + sanity gate as seed dry-run.
  // Requires `body.csv` AND `body.csv_sha256_expect` — the caller pre-hashes
  // in the browser and this branch refuses if the server-side hash disagrees
  // (integrity guard against snippet corruption / paste truncation).
  if (body.probe === 'seed_apply') {
    if (!isCron) {
      return apiSuccess({ ok: false, probe: 'seed_apply', status: 'cron_secret_required', correlationId });
    }
    const b = body as {
      csv?: unknown;
      csv_sha256_expect?: unknown;
      tickers?: unknown;
      tickers_sha256_expect?: unknown;
      as_of?: unknown;
      csv_sha256_provenance?: unknown;
      csv_bytes?: unknown;
    };
    const hasTickers = Array.isArray(b.tickers);

    let tickers: string[];
    let as_of_from_source: string;
    let provenance_mode: 'server_hashed' | 'client_attested';
    let csv_sha256: string | null;
    let csv_sha256_provenance: string | null = null;
    let csv_bytes_attested: number | null = null;
    let dropped = 0;

    if (hasTickers) {
      const norm = normalizeTickers(b.tickers);
      if (!norm.ok) {
        return apiSuccess({ ok: false, probe: 'seed_apply', status: norm.status, detail: norm.detail, correlationId });
      }
      tickers = norm.tickers;
      dropped = norm.dropped;
      as_of_from_source = typeof b.as_of === 'string' ? b.as_of : '';
      provenance_mode = 'client_attested';
      csv_sha256 = null;
      csv_sha256_provenance = typeof b.csv_sha256_provenance === 'string'
        ? b.csv_sha256_provenance.toLowerCase()
        : null;
      csv_bytes_attested = typeof b.csv_bytes === 'number' && Number.isFinite(b.csv_bytes)
        ? Math.trunc(b.csv_bytes)
        : null;

      // Integrity guard: server re-hashes normalized (sorted+joined) tickers
      // and refuses on mismatch with the client-computed expectation.
      const tickers_sha256 = await tickersSha256Hex(tickers);
      const expectT = typeof b.tickers_sha256_expect === 'string'
        ? (b.tickers_sha256_expect as string).toLowerCase()
        : '';
      if (expectT.length === 0) {
        return apiSuccess({
          ok: false,
          probe: 'seed_apply',
          status: 'tickers_sha256_expect_missing',
          tickers_sha256,
          correlationId,
        });
      }
      if (expectT !== tickers_sha256) {
        return apiSuccess({
          ok: false,
          probe: 'seed_apply',
          status: 'tickers_sha256_mismatch',
          tickers_sha256,
          expected: expectT,
          correlationId,
        });
      }
    } else {
      const csv = typeof b.csv === 'string' ? b.csv : '';
      const expect = typeof b.csv_sha256_expect === 'string'
        ? (b.csv_sha256_expect as string).toLowerCase()
        : '';
      if (csv.length === 0) {
        return apiSuccess({ ok: false, probe: 'seed_apply', status: 'csv_body_missing', correlationId });
      }
      csv_sha256 = await sha256Hex(csv);
      if (expect.length > 0 && expect !== csv_sha256) {
        return apiSuccess({
          ok: false,
          probe: 'seed_apply',
          status: 'csv_sha256_mismatch',
          csv_sha256,
          expected: expect,
          correlationId,
        });
      }
      const parsed = parseIsharesCsv(csv);
      if (!parsed.ok) {
        return apiSuccess({ ok: false, probe: 'seed_apply', status: parsed.status, detail: parsed.detail, correlationId });
      }
      tickers = parsed.tickers;
      as_of_from_source = parsed.as_of;
      provenance_mode = 'server_hashed';
    }

    const tickers_sha256 = await tickersSha256Hex(tickers);
    const sanity = checkRosterSanity(tickers.length);
    if (sanity !== null) {
      return apiSuccess({
        ok: false,
        probe: 'seed_apply',
        status: 'roster_sanity_failed',
        roster_count: tickers.length,
        sanity_band: [ROSTER_SANITY_MIN, ROSTER_SANITY_MAX],
        sample_first_10: tickers.slice(0, 10),
        provenance_mode,
        tickers_sha256,
        csv_sha256,
        csv_sha256_provenance,
        correlationId,
      });
    }
    // Kill-switch supreme.
    if (await isRowDisarmed(KILL_SWITCH_ID)) {
      return apiSuccess({ ok: true, probe: 'seed_apply', skipped: 'kill_switch_active', correlationId });
    }
    const nowIso = productionClock.getWallClockTs();
    const asOfDate = nowIso.slice(0, 10);
    const fresh = new Set(tickers);
    const { data: current, error: readErr } = await supabaseAdmin
      .from('overshoot_universe')
      .select('ticker')
      .eq('active', true);
    if (readErr) {
      return apiSuccess({ ok: false, probe: 'seed_apply', status: 'universe_read_failed', detail: readErr.message, correlationId });
    }
    const currentSet = new Set((current ?? []).map((r) => r.ticker as string));
    const toDeactivate: string[] = [];
    for (const t of currentSet) if (!fresh.has(t)) toDeactivate.push(t);
    const upsertRows = tickers.map((t) => ({
      ticker: t,
      source: SEED_SOURCE_TAG,
      added_as_of: asOfDate,
      active: true,
    }));
    const { error: upsertErr } = await supabaseAdmin
      .from('overshoot_universe')
      .upsert(upsertRows, { onConflict: 'ticker', ignoreDuplicates: false });
    if (upsertErr) {
      return apiSuccess({ ok: false, probe: 'seed_apply', status: 'universe_upsert_failed', detail: upsertErr.message, correlationId });
    }
    let deactivated = 0;
    if (toDeactivate.length > 0) {
      const { error: deactErr, count } = await supabaseAdmin
        .from('overshoot_universe')
        .update({ active: false }, { count: 'exact' })
        .in('ticker', toDeactivate);
      if (deactErr) {
        return apiSuccess({ ok: false, probe: 'seed_apply', status: 'universe_deactivate_failed', detail: deactErr.message, correlationId });
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
        source: SEED_SOURCE_TAG,
        as_of_date: asOfDate,
        as_of_from_source,
        roster_count: tickers.length,
        upserted: upsertRows.length,
        deactivated,
        provenance_mode,
        tickers_sha256,
        csv_sha256,
        csv_sha256_provenance,
        csv_bytes_attested,
        dropped_nonconforming: dropped,
        via: 'operator_seed_apply',
      },
    });
    return apiSuccess({
      ok: true,
      probe: 'seed_apply',
      as_of_date: asOfDate,
      roster_count: tickers.length,
      upserted: upsertRows.length,
      deactivated,
      provenance_mode,
      tickers_sha256,
      csv_sha256,
      csv_sha256_provenance,
      correlationId,
    });
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