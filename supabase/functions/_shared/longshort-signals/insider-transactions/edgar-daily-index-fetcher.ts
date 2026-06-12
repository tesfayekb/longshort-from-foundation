/**
 * edgar-daily-index-fetcher.ts — FP-050 Phase 1 / DEC-058 §(i) daily-feed
 * primary branch (architecture-fork arithmetic favors this for incremental
 * cadence: ~18 s/fire vs ~174 s/fire per-CIK).
 *
 * Reads `https://www.sec.gov/Archives/edgar/daily-index/{YYYY}/QTR{n}/form.{YYYYMMDD}.idx`
 * (the Phase-0-corrected path — NOT `/full-index/`, which only carries
 * the current-quarter rollup) and parses the fixed-width pipe-aligned
 * form-type index for Form 4 and 4/A rows. Per §(h) Form 4/A amendments
 * flow identically to Form 4 (same XML schema; idempotency by
 * accession_number).
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
 * Owner: longshort (FP-050 — Signal #4 EDGAR rebuild / Phase 1)
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import { buildEdgarUserAgent, EdgarFetchError } from './edgar-cik-mapper.ts';

export const DAILY_INDEX_BASE = 'https://www.sec.gov/Archives/edgar/daily-index';
export const DAILY_INDEX_OPERATION_ID = 'edgar_daily_index';

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
 * Build the daily-index URL for a date. Includes the QTR{n} path segment
 * derived from the date's month — quarter boundaries are deterministic.
 */
export function dailyIndexUrl(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  return `${DAILY_INDEX_BASE}/${y}/QTR${quarterOf(d)}/form.${compactDate(d)}.idx`;
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
 * Parse the SEC daily form-type index body. The file is fixed-width with
 * a 11-line header (delimiter line of `-`s separates header from data).
 * Columns (verbatim from header):
 *   Form Type   Company Name   CIK   Date Filed   Filename
 * Parsing strategy: column positions are derived from the dashed
 * delimiter line; this is what the SEC's own tooling does.
 */
export function parseDailyIndexBody(body: string): DailyIndexEntry[] {
  const lines = body.split(/\r?\n/);
  // Locate the header line ("Form Type ... Filename") and use its column
  // positions to derive fixed-width column starts. The next line is a
  // dashed delimiter (real EDGAR ships it as one continuous run of `-`,
  // so we rely on the HEADER for column starts, not the delimiter).
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith('Form Type')) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return [];
  const header = lines[headerIdx];
  // Locate the five known column-name start positions.
  const colNames = ['Form Type', 'Company Name', 'CIK', 'Date Filed', 'Filename'];
  const starts: number[] = [];
  for (const name of colNames) {
    const idx = header.indexOf(name);
    if (idx === -1) return [];
    starts.push(idx);
  }
  const [s0, s1, s2, s3, s4] = starts;
  // Skip past the dashed delimiter line (one or more lines of `-`).
  let dataIdx = headerIdx + 1;
  while (dataIdx < lines.length && /^[-\s]+$/.test(lines[dataIdx]) && lines[dataIdx].includes('-')) {
    dataIdx += 1;
  }
  const out: DailyIndexEntry[] = [];
  for (let i = dataIdx; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.length === 0) continue;
    const formType = line.slice(s0, s1).trim();
    if (!isForm4(formType)) continue;
    const companyName = line.slice(s1, s2).trim();
    const cik = line.slice(s2, s3).trim();
    const dateFiled = line.slice(s3, s4).trim();
    const filename = line.slice(s4).trim();
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

  constructor(
    contactEmail: string | null | undefined,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    moduleId = 'fp-050-insider/0.1',
  ) {
    this.userAgent = buildEdgarUserAgent(contactEmail, moduleId);
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
      throw new EdgarFetchError(
        DAILY_INDEX_OPERATION_ID,
        `network error on ${url}`,
        e,
      );
    }
    if (resp.status === 404) {
      // Holiday / archive-boundary / no-index-published. Typed, never error.
      return { kind: 'unavailable', reason: 'data_unavailable', date: iso };
    }
    if (!resp.ok) {
      throw new EdgarFetchError(
        DAILY_INDEX_OPERATION_ID,
        `HTTP ${resp.status} ${resp.statusText} on ${url}`,
      );
    }
    let body: string;
    try {
      body = await resp.text();
    } catch (e) {
      throw new EdgarFetchError(
        DAILY_INDEX_OPERATION_ID,
        `text read error on ${url}`,
        e,
      );
    }
    const entries = parseDailyIndexBody(body);
    return { kind: 'rows', entries, date: iso };
  }
}