/**
 * edgar-daily-index-fetcher.ts — FP-050 Phase 1 / DEC-058 §(i) daily-feed
 * primary branch.
 *
 * Reads `https://www.sec.gov/Archives/edgar/daily-index/{YYYY}/QTR{n}/master.{YYYYMMDD}.idx`
 * — the **master.idx** discovery file (Phase-4 F1 pivot, ACT-199). The
 * prior `form.{YYYYMMDD}.idx` family was blocked from the Supabase Edge
 * egress (two distinct files, ~90 min apart, under varied conditions —
 * durability bar for the §22.8.4 STOP-and-conclude met; ruling pivoted
 * to F1: same path root, sibling index file). master.idx carries the
 * identical set of accessions for the same date/quarter (per the
 * fixture-pair `master.20260612.idx` ~471 KB vs `form.20260612.idx`
 * ~1 MB — master is denser pipe-delimited; form is fixed-width sorted
 * by form-type). Per §(h) Form 4/A amendments flow identically to
 * Form 4 (same XML schema; idempotency by accession_number).
 *
 * Format: pipe-delimited 5-column rows (NOT fixed-width):
 *   CIK|Company Name|Form Type|Date Filed|Filename
 * Header row is literally `CIK|Company Name|Form Type|Date Filed|Filename`
 * followed by a dashed delimiter line. Post-parse filter:
 * `Form Type IN ('4','4/A')` — the index is form-type-mixed (3, 4, 5,
 * 8-K, 10-K, ...), unlike the legacy `form.idx` which was already
 * partitioned by form type.
 *
 * Iterates trading-day dates. v1 trading-day approximation = weekends-only
 * (per the §(f) v1-approximation precedent in DEC-057; bounded shortfall
 * ≤ 1 day around double-holiday weeks; NYSE-calendar upgrade tracked
 * separately). An empty / holiday day returns `entries:[]` cleanly with
 * `kind:'rows'`, NEVER throws.
 *
 * Typed taxonomy (subscription-gated is N/A for EDGAR — open data):
 *  - HTTP 403 with-UA → EdgarFetchError (operator-actionable: UA reject)
 *  - HTTP 404 → kind:'unavailable', reason:'data_unavailable' (date has
 *    no published index — holiday or far-past archive boundary)
 *  - All other failures throw EdgarFetchError
 *
 * Telemetry (INC-73-family, ACT-199 F1.a): every fetch emits an
 * `EdgarFetchTelemetryEvent` with `path_family:'master_index'`,
 * `status`, `url`, and the caller-threaded `correlation_id`. Default
 * impl logs structured JSON; consumers MAY pass an accumulator to
 * surface in the run row's audit trail.
 *
 * Owner: longshort (FP-050 — Signal #4 EDGAR rebuild / Phase 1 + Phase 4 F1.a)
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import { buildEdgarUserAgent, EdgarFetchError } from './edgar-cik-mapper.ts';
import {
  defaultEdgarFetchTelemetry,
  type EdgarFetchTelemetry,
} from './edgar-fetch-telemetry.ts';

export const DAILY_INDEX_BASE = 'https://www.sec.gov/Archives/edgar/daily-index';
/**
 * Operation tag — renamed to reflect the master.idx pivot. The legacy
 * alias `DAILY_INDEX_OPERATION_ID` is preserved for any external doc
 * reference but new code MUST use `MASTER_INDEX_OPERATION_ID`.
 */
export const MASTER_INDEX_OPERATION_ID = 'edgar_master_index';
/** @deprecated Use MASTER_INDEX_OPERATION_ID — retained for back-compat. */
export const DAILY_INDEX_OPERATION_ID = MASTER_INDEX_OPERATION_ID;

/** A single Form-4 (or 4/A) entry surfaced from a daily form.idx. */
export interface DailyIndexEntry {
  /** Always 'Form 4' or 'Form 4/A' verbatim from the index column. */
  form_type: '4' | '4/A';
  /** Filer CIK as the index reports it (raw integer string, NOT padded). */
  filer_cik: string;
  /** Issuer / filer company name verbatim from the index. */
  company_name: string;
  /** ISO YYYY-MM-DD date the filing landed in the index. */
  date_filed: string;
  /** Path under /Archives/ to the filing's text bundle (used to derive
   *  accession number + directory). e.g.
   *  `edgar/data/320193/000032019326000077/0000320193-26-000077-index.htm` */
  filename: string;
  /** Accession number derived from `filename` (`NNNNNNNNNN-NN-NNNNNN`). */
  accession_number: string;
}

export type DailyIndexResult =
  | { kind: 'rows'; entries: DailyIndexEntry[]; date: string }
  | { kind: 'unavailable'; reason: 'data_unavailable'; date: string };

/** YYYYMMDD compact form for the daily-index URL filename. */
function compactDate(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${y}${m}${dd}`;
}

/** ISO YYYY-MM-DD form (used in returned entries). */
function isoDate(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Calendar-quarter (1-4) for the UTC month of `d`. */
export function quarterOf(d: Date): 1 | 2 | 3 | 4 {
  const m = d.getUTCMonth(); // 0-11
  return ((Math.floor(m / 3) + 1) as 1 | 2 | 3 | 4);
}

/**
 * Build the master.idx URL for a date (F1.a pivot, ACT-199). Includes
 * the QTR{n} path segment derived from the date's month — quarter
 * boundaries are deterministic.
 *
 * DRIFT INVARIANT (pinned by `edgar-daily-index-fetcher_test.ts`): the
 * returned URL MUST match `/master\.\d{8}\.idx$/`; NEVER `/form\./`. A
 * regression that re-introduces `form.{YYYYMMDD}.idx` would re-open
 * the Phase-4 F1 blocker. The sentinel test pins this verbatim.
 */
export function dailyIndexUrl(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  return `${DAILY_INDEX_BASE}/${y}/QTR${quarterOf(d)}/master.${compactDate(d)}.idx`;
}

/**
 * Extract the SEC accession number from the index `filename` column.
 * Filenames look like `edgar/data/<cik>/<accession-no-dashes>/<basename>`
 * OR `edgar/data/<cik>/<accession-with-dashes>-index.htm`. Both shapes
 * are accepted; return the canonical dashed form `NNNNNNNNNN-NN-NNNNNN`.
 * Returns null if no plausible accession is present.
 */
export function parseAccessionFromFilename(filename: string): string | null {
  // Dashed form first.
  const dashed = filename.match(/(\d{10}-\d{2}-\d{6})/);
  if (dashed !== null) return dashed[1];
  // No-dash form: 18 digits in a path segment.
  const flat = filename.match(/\/(\d{10})(\d{2})(\d{6})(?:[/.]|$)/);
  if (flat !== null) return `${flat[1]}-${flat[2]}-${flat[3]}`;
  return null;
}

/** Detect Form 4 / 4/A; reject everything else (the index also carries
 *  Form 3, 5, 10-K, 8-K, etc — only 4 / 4/A are insider-transaction). */
function isForm4(formType: string): formType is '4' | '4/A' {
  return formType === '4' || formType === '4/A';
}

/**
 * Parse the SEC master.idx body (F1.a pivot, ACT-199). Format is
 * **pipe-delimited 5-column** (NOT fixed-width), header verbatim:
 *   CIK|Company Name|Form Type|Date Filed|Filename
 * Header is followed by a dashed delimiter line. Each data row is
 * split on `|`; rows with !=5 fields are skipped silently. Post-parse
 * filter: Form Type ∈ ('4','4/A') — master.idx is form-type-mixed,
 * unlike the legacy form.idx which was already partitioned.
 *
 * Returns [] (NOT throws) when the body lacks the expected header —
 * matches the v1 holiday/malformed contract.
 */
export function parseDailyIndexBody(body: string): DailyIndexEntry[] {
  const lines = body.split(/\r?\n/);
  // Locate the master.idx header line — exact verbatim string match
  // (no leading whitespace, no partial). The next non-blank line is a
  // dashed delimiter we skip.
  const HEADER_LINE = 'CIK|Company Name|Form Type|Date Filed|Filename';
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === HEADER_LINE) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return [];
  // Skip past the dashed delimiter line(s) — one or more lines of `-`.
  let dataIdx = headerIdx + 1;
  while (dataIdx < lines.length && /^[-\s]+$/.test(lines[dataIdx]) && lines[dataIdx].includes('-')) {
    dataIdx += 1;
  }
  const out: DailyIndexEntry[] = [];
  for (let i = dataIdx; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.length === 0) continue;
    // Pipe-delimited split — EXACTLY 5 columns. The Filename column is
    // the trailing element and may legitimately contain no embedded
    // pipes (SEC filenames are restricted-charset). Rows with !=5
    // columns are malformed; skip silently.
    const parts = line.split('|');
    if (parts.length !== 5) continue;
    const cik = parts[0].trim();
    const companyName = parts[1].trim();
    const formType = parts[2].trim();
    const dateFiled = parts[3].trim();
    const filename = parts[4].trim();
    if (!isForm4(formType)) continue;
    const accession = parseAccessionFromFilename(filename);
    if (accession === null) continue; // malformed row, skip silently
    if (!/^\d+$/.test(cik)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFiled)) continue;
    out.push({
      form_type: formType,
      filer_cik: cik,
      company_name: companyName,
      date_filed: dateFiled,
      filename,
      accession_number: accession,
    });
  }
  return out;
}

export class EdgarDailyIndexFetcher {
  private readonly userAgent: string;
  private readonly telemetry: EdgarFetchTelemetry;
  private readonly correlationId: string;

  constructor(
    contactEmail: string | null | undefined,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    moduleId = 'fp-050-insider/0.1',
    telemetry: EdgarFetchTelemetry = defaultEdgarFetchTelemetry,
    correlationId = '',
  ) {
    this.userAgent = buildEdgarUserAgent(contactEmail, moduleId);
    this.telemetry = telemetry;
    this.correlationId = correlationId;
  }

  private emit(status: number, url: string): void {
    try {
      this.telemetry({
        op: MASTER_INDEX_OPERATION_ID,
        path_family: 'master_index',
        status,
        url,
        correlation_id: this.correlationId,
        duration_ms: -1,
      });
    } catch {
      // Telemetry MUST NOT throw — swallow silently.
    }
  }

  async fetchDay(date: Date): Promise<DailyIndexResult> {
    const url = dailyIndexUrl(date);
    const iso = isoDate(date);
    let resp: Awaited<ReturnType<HttpFetch>>;
    try {
      resp = await this.httpFetch(url, {
        method: 'GET',
        headers: { 'User-Agent': this.userAgent, 'Accept-Encoding': 'identity' },
      });
    } catch (e) {
      this.emit(0, url);
      throw new EdgarFetchError(
        MASTER_INDEX_OPERATION_ID,
        `network error on ${url}`,
        e,
      );
    }
    this.emit(resp.status, url);
    if (resp.status === 404) {
      // Holiday / archive-boundary / no-index-published. Typed, never error.
      return { kind: 'unavailable', reason: 'data_unavailable', date: iso };
    }
    if (!resp.ok) {
      throw new EdgarFetchError(
        MASTER_INDEX_OPERATION_ID,
        `HTTP ${resp.status} ${resp.statusText} on ${url}`,
      );
    }
    let body: string;
    try {
      body = await resp.text();
    } catch (e) {
      throw new EdgarFetchError(
        MASTER_INDEX_OPERATION_ID,
        `text read error on ${url}`,
        e,
      );
    }
    const entries = parseDailyIndexBody(body);
    return { kind: 'rows', entries, date: iso };
  }
}