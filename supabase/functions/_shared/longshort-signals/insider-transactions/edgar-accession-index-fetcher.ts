/**
 * edgar-accession-index-fetcher.ts — FP-050 Phase 2 / DEC-058 §(i)
 * discovery branch (ruling: per-accession `index.json`).
 *
 * Per-accession discovery layer. GETs
 *   `https://www.sec.gov/Archives/edgar/data/<cik>/<accession-no-dashes>/index.json`
 * which atomically returns BOTH the primary-document basename AND the
 * `acceptanceDateTime` for that accession (the Form-4 XML itself does
 * NOT carry acceptance; DEC-058 §(b) Option-A dual-date contract requires
 * acceptance to be threaded into the parser from this layer).
 *
 * Why per-accession (vs the rejected per-CIK submissions feed): one
 * truth-source per accession, zero join layers between the daily-index
 * discovery and the per-accession XML fetch. This closes the INC-70
 * failure family at the discovery layer: any cross-feed join is a place
 * to silently mis-resolve.
 *
 * Primary-document selection is TYPED, never guessed:
 *   - Eligible candidates: items whose `name` matches `/\.xml$/i` AND
 *     does NOT match the documented EDGAR non-primary patterns:
 *       /^[\w-]*[._-]?index\.xml$/i   (the directory's own xml index)
 *       /^.*\.xsd$/i                  (XBRL schema)
 *       /^.*-cal\.xml$/i              (XBRL calculation linkbase)
 *       /^.*-def\.xml$/i              (XBRL definition linkbase)
 *       /^.*-lab\.xml$/i              (XBRL label linkbase)
 *       /^.*-pre\.xml$/i              (XBRL presentation linkbase)
 *       /^primary_doc\.xml$/i is INCLUDED (it IS the primary on modern Form 4)
 *   - If the eligible-candidate count is ZERO or MORE THAN ONE after
 *     exclusions, the result is `kind:'ambiguous'` carrying the full
 *     `filenames[]` list verbatim — the orchestrator turns this into a
 *     typed `data_unavailable`-class skip with the filenames in detail.
 *     NO heuristic tiebreak (the INC-70 rule: never assume vendor shape
 *     where evidence hasn't proven it; surface and skip cleanly instead).
 *
 * Typed taxonomy (parallels the sibling fetchers):
 *   - HTTP 404 → kind:'unavailable', reason:'data_unavailable'
 *   - HTTP 429 → kind:'rate_limited' (the 5 rps bucket should already
 *     prevent this; surfaced typed so the orchestrator can backoff)
 *   - HTTP 403 / other non-OK → throws EdgarFetchError
 *
 * Owner: longshort (FP-050 Phase 2 — Signal #4 EDGAR rebuild)
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import { buildEdgarUserAgent, EdgarFetchError } from './edgar-cik-mapper.ts';
import {
  defaultEdgarFetchTelemetry,
  type EdgarFetchTelemetry,
} from './edgar-fetch-telemetry.ts';

export const ARCHIVES_BASE = 'https://www.sec.gov/Archives/edgar/data';
export const ACCESSION_INDEX_OPERATION_ID = 'edgar_accession_index';

export interface EdgarAccessionIndexInput {
  /** Raw integer CIK (may be padded; either accepted). */
  cik: string | number;
  /** Dashed accession number `NNNNNNNNNN-NN-NNNNNN`. */
  accession_number: string;
}

export type EdgarAccessionIndexResult =
  | {
      kind: 'resolved';
      primary_document: string;
      /** ISO 8601 UTC acceptance datetime, verbatim from index.json. */
      acceptance_datetime: string;
      /** Full filename list (for diagnostics). */
      filenames: string[];
    }
  | { kind: 'unavailable'; reason: 'data_unavailable' }
  | { kind: 'rate_limited' }
  | {
      kind: 'ambiguous';
      /** Verbatim file list — surfaced into the orchestrator skip detail
       *  so an operator can see WHICH names were eligible / excluded. */
      filenames: string[];
      /** Eligible-candidate count after exclusions: 0 or >1 (never 1 —
       *  that path returns `resolved`). */
      eligible_count: number;
      /** Whether acceptance_datetime was readable (defensive — the
       *  ambiguous branch still includes it when present, but does not
       *  fail-the-fetch on its absence). */
      acceptance_datetime: string | null;
    };

function stripCikPadding(cik: string | number): string {
  const s = typeof cik === 'number' ? String(cik) : cik;
  const t = s.replace(/^0+/, '');
  if (t.length === 0) return '0';
  return t;
}

export function accessionIndexUrl(input: EdgarAccessionIndexInput): string {
  const cikUnpadded = stripCikPadding(input.cik);
  const accNoDashes = input.accession_number.replace(/-/g, '');
  return `${ARCHIVES_BASE}/${cikUnpadded}/${accNoDashes}/index.json`;
}

/**
 * EDGAR `index.json` shape (verbatim observed):
 *   { "directory": { "name": "...", "item": [ { "name": "...", "type": "...", "size": "...", "last-modified": "..." }, ... ] } }
 * Some shapes also expose `acceptanceDateTime` at the directory level.
 */
interface EdgarIndexJsonItem {
  name?: string;
  type?: string;
  'last-modified'?: string;
}
interface EdgarIndexJsonDirectory {
  name?: string;
  item?: EdgarIndexJsonItem[];
  acceptanceDateTime?: string;
  'acceptance-datetime'?: string;
}
interface EdgarIndexJson {
  directory?: EdgarIndexJsonDirectory;
  acceptanceDateTime?: string;
  'acceptance-datetime'?: string;
}

/** Read `acceptanceDateTime` defensively from the various observed keys. */
function readAcceptance(body: EdgarIndexJson): string | null {
  const dir = body.directory;
  const candidates = [
    body.acceptanceDateTime,
    body['acceptance-datetime'],
    dir?.acceptanceDateTime,
    dir?.['acceptance-datetime'],
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
  }
  return null;
}

/** Pull the file-name list defensively. */
function readFilenames(body: EdgarIndexJson): string[] {
  const items = body.directory?.item;
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  for (const it of items) {
    if (it === null || typeof it !== 'object') continue;
    if (typeof it.name === 'string' && it.name.length > 0) out.push(it.name);
  }
  return out;
}

/**
 * The exclusion regex set documented at the file head. A candidate
 * survives iff it ends with `.xml` (case-insensitive) AND matches NONE of
 * these patterns. `primary_doc.xml` is NOT excluded (it IS the modern
 * Form-4 primary). The directory's own self-listing `index.xml` IS
 * excluded (the EDGAR convention surfaces the index alongside the
 * filing's payload XML).
 */
const EXCLUSION_PATTERNS: RegExp[] = [
  /^[\w-]*index\.xml$/i,
  /\.xsd$/i,
  /-cal\.xml$/i,
  /-def\.xml$/i,
  /-lab\.xml$/i,
  /-pre\.xml$/i,
];

export function selectPrimaryDocument(filenames: ReadonlyArray<string>): {
  primary: string | null;
  eligible: string[];
} {
  const eligible: string[] = [];
  for (const name of filenames) {
    if (!/\.xml$/i.test(name)) continue;
    let excluded = false;
    for (const p of EXCLUSION_PATTERNS) {
      if (p.test(name)) {
        excluded = true;
        break;
      }
    }
    if (!excluded) eligible.push(name);
  }
  if (eligible.length === 1) return { primary: eligible[0], eligible };
  return { primary: null, eligible };
}

export class EdgarAccessionIndexFetcher {
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

  /** INC-73-family telemetry emit (ACT-199 F1.a) — never throws. */
  private emit(status: number, url: string): void {
    try {
      this.telemetry({
        op: ACCESSION_INDEX_OPERATION_ID,
        path_family: 'accession_index',
        status,
        url,
        correlation_id: this.correlationId,
        duration_ms: -1,
      });
    } catch {
      // swallow
    }
  }

  async fetchIndex(input: EdgarAccessionIndexInput): Promise<EdgarAccessionIndexResult> {
    const url = accessionIndexUrl(input);
    let resp: Awaited<ReturnType<HttpFetch>>;
    try {
      resp = await this.httpFetch(url, {
        method: 'GET',
        headers: { 'User-Agent': this.userAgent, 'Accept': 'application/json' },
      });
    } catch (e) {
      this.emit(0, url);
      throw new EdgarFetchError(
        ACCESSION_INDEX_OPERATION_ID,
        `network error on ${url}`,
        e,
      );
    }
    this.emit(resp.status, url);
    if (resp.status === 404) return { kind: 'unavailable', reason: 'data_unavailable' };
    if (resp.status === 429) return { kind: 'rate_limited' };
    if (!resp.ok) {
      throw new EdgarFetchError(
        ACCESSION_INDEX_OPERATION_ID,
        `HTTP ${resp.status} ${resp.statusText} on ${url}`,
      );
    }
    let body: EdgarIndexJson;
    try {
      body = (await resp.json()) as EdgarIndexJson;
    } catch (e) {
      throw new EdgarFetchError(
        ACCESSION_INDEX_OPERATION_ID,
        `JSON parse error on ${url}`,
        e,
      );
    }
    const acceptance = readAcceptance(body);
    const filenames = readFilenames(body);
    const { primary, eligible } = selectPrimaryDocument(filenames);
    if (primary === null) {
      return {
        kind: 'ambiguous',
        filenames,
        eligible_count: eligible.length,
        acceptance_datetime: acceptance,
      };
    }
    if (acceptance === null) {
      // §(b) dual-date contract — acceptance MUST be present and is
      // non-defaultable. Surface the same ambiguous-class skip; the
      // alternative (silent default) is exactly the failure mode the
      // FP-050 rebuild exists to close.
      return {
        kind: 'ambiguous',
        filenames,
        eligible_count: eligible.length,
        acceptance_datetime: null,
      };
    }
    return { kind: 'resolved', primary_document: primary, acceptance_datetime: acceptance, filenames };
  }
}