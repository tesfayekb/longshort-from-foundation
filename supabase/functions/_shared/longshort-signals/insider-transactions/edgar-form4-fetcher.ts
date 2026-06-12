/**
 * edgar-form4-fetcher.ts — FP-050 Phase 1 / DEC-058 §(g)/(h)/(i).
 *
 * IO layer for per-accession Form-4 XML retrieval. Discovery happens
 * upstream (daily-index or per-CIK submissions); this fetcher takes a
 * `(cik, accession_number, acceptance_datetime, primary_document)` and
 * returns parsed `EdgarForm4Row[]` per `edgar-form4-parser.ts`.
 *
 * URL shape (Phase-0 verified):
 *   https://www.sec.gov/Archives/edgar/data/{cik}/{accession-no-dashes}/{primary_document}
 *
 * Typed taxonomy:
 *   - 404 → kind:'unavailable', reason:'data_unavailable'
 *   - 429 → kind:'rate_limited' (the orchestrator's RPS bucket lands at
 *     Phase 3 — until then a 429 here means we're talking too fast; the
 *     return is typed so the orchestrator can backoff / re-queue
 *     cleanly instead of error-stamping the whole run)
 *   - 403 → throws EdgarFetchError (UA reject — operator-actionable)
 *   - parse failures (acceptance missing, body empty) → kind:'unparseable'
 *     surfaced verbatim from the parser
 *
 * Owner: longshort (FP-050 — Signal #4 EDGAR rebuild / Phase 1)
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import { buildEdgarUserAgent, EdgarFetchError } from './edgar-cik-mapper.ts';
import {
  parseEdgarForm4,
  type EdgarForm4Row,
} from './edgar-form4-parser.ts';

export const ARCHIVES_BASE = 'https://www.sec.gov/Archives/edgar/data';
export const FORM4_FETCHER_OPERATION_ID = 'edgar_form4_fetcher';

export interface EdgarForm4FetchInput {
  /** Raw integer CIK (may be padded; either is accepted). */
  cik: string | number;
  /** Dashed accession number `NNNNNNNNNN-NN-NNNNNN`. */
  accession_number: string;
  /** ISO 8601 UTC acceptance datetime (from submissions feed). REQUIRED. */
  acceptance_datetime: string;
  /** Primary document filename, e.g. `wk-form4_172...xml`. Discovery
   *  layer surfaces this from the per-accession directory index. */
  primary_document: string;
}

export type EdgarForm4FetchResult =
  | { kind: 'rows'; rows: EdgarForm4Row[] }
  | { kind: 'unavailable'; reason: 'data_unavailable' }
  | { kind: 'rate_limited' }
  | { kind: 'unparseable'; reason: string };

function stripCikPadding(cik: string | number): string {
  const s = typeof cik === 'number' ? String(cik) : cik;
  const t = s.replace(/^0+/, '');
  if (t.length === 0) return '0';
  return t;
}

/** Build the per-accession XML URL. Accession is collapsed to no-dashes
 *  for the path segment per EDGAR convention. */
export function form4XmlUrl(input: EdgarForm4FetchInput): string {
  const cikUnpadded = stripCikPadding(input.cik);
  const accNoDashes = input.accession_number.replace(/-/g, '');
  // primary_document may already include a leading slash or path prefix;
  // strip leading slashes to keep the join clean.
  const doc = input.primary_document.replace(/^\/+/, '');
  return `${ARCHIVES_BASE}/${cikUnpadded}/${accNoDashes}/${doc}`;
}

export class EdgarForm4Fetcher {
  private readonly userAgent: string;

  constructor(
    contactEmail: string | null | undefined,
    private readonly httpFetch: HttpFetch = fetch as HttpFetch,
    moduleId = 'fp-050-insider/0.1',
  ) {
    this.userAgent = buildEdgarUserAgent(contactEmail, moduleId);
  }

  async fetchAndParse(input: EdgarForm4FetchInput): Promise<EdgarForm4FetchResult> {
    if (typeof input.acceptance_datetime !== 'string' || input.acceptance_datetime.length === 0) {
      return {
        kind: 'unparseable',
        reason: '§(b) dual-date contract: acceptance_datetime missing at fetch input',
      };
    }
    const url = form4XmlUrl(input);
    let resp: Awaited<ReturnType<HttpFetch>>;
    try {
      resp = await this.httpFetch(url, {
        method: 'GET',
        headers: { 'User-Agent': this.userAgent, 'Accept': 'application/xml' },
      });
    } catch (e) {
      throw new EdgarFetchError(
        FORM4_FETCHER_OPERATION_ID,
        `network error on ${url}`,
        e,
      );
    }
    if (resp.status === 404) return { kind: 'unavailable', reason: 'data_unavailable' };
    if (resp.status === 429) return { kind: 'rate_limited' };
    if (!resp.ok) {
      throw new EdgarFetchError(
        FORM4_FETCHER_OPERATION_ID,
        `HTTP ${resp.status} ${resp.statusText} on ${url}`,
      );
    }
    let body: string;
    try {
      body = await resp.text();
    } catch (e) {
      throw new EdgarFetchError(
        FORM4_FETCHER_OPERATION_ID,
        `text read error on ${url}`,
        e,
      );
    }
    const parsed = parseEdgarForm4({
      xml: body,
      accession_number: input.accession_number,
      acceptance_datetime: input.acceptance_datetime,
    });
    if (parsed.kind === 'unparseable') return parsed;
    return { kind: 'rows', rows: parsed.rows };
  }
}