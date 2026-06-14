/**
 * edgar-accession-index-fetcher.ts — FP-050 Phase 4 / ACT-215 / DEC-058 §(b)
 * amendment (was: Phase 2 discovery branch).
 *
 * Per-accession primary-document resolver. GETs
 *   `https://www.sec.gov/Archives/edgar/data/<cik>/<accession-no-dashes>/index.json`
 * to enumerate the accession's filenames and select the single eligible
 * `.xml` primary document.
 *
 * ─── ACT-215 SCOPE NARROWING ────────────────────────────────────────
 *
 * Historical scope (Phase 2): this fetcher also read `acceptanceDateTime`
 * from `index.json` to honor the DEC-058 §(b) dual-date contract.
 * Live-EDGAR verification at ACT-215 (2026-06-14) confirmed that field
 * is NEVER present in `index.json` for any observed Form-4 shape
 * (modern Workiva `wk-form4_*.xml` or legacy paper `edgardoc.xml`); the
 * §(b) gate consequently fired 100% on absence rather than on real
 * acceptance absence. The DEC-058 §(b) amendment relocates the
 * acceptance source to the per-issuer submissions feed
 * (`data.sec.gov/submissions/CIK<padded10>.json`, the new
 * `EdgarSubmissionsFetcher`) and writes the value onto every
 * `insider_accession_discovery_queue.acceptance_datetime` NOT NULL row
 * at producer-time (MIG-097). The consumer reads acceptance from the
 * queue row; this fetcher no longer participates in §(b).
 *
 * This fetcher's RESPONSIBILITY post-ACT-215 is exclusively primary-doc
 * resolution. The `resolved` kind returns `primary_document` +
 * `filenames` (no `acceptance_datetime`). The `no_acceptance_datetime`
 * kind added at ACT-214 is REMOVED because its semantic predicate
 * (acceptance-absent at a non-truth-source layer) is no longer a
 * meaningful condition.
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
 * Discriminated-union discipline (ACT-213 → ACT-215): each non-resolved
 * kind encodes ONE semantic failure mode. The ACT-213 split that added
 * `no_acceptance_datetime` (Path B) is collapsed by ACT-215 because the
 * acceptance-absent condition at this layer is no longer a meaningful
 * predicate (the truth source moved). Only `no_primary_doc` (Path A,
 * 0-or-more-than-1 eligible XML) survives as a non-resolved fail mode.
 *
 * Owner: longshort (FP-050 Phase 4 — Signal #4 EDGAR rebuild / ACT-215)
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
      /** Full filename list (for diagnostics). */
      filenames: string[];
    }
  | { kind: 'unavailable'; reason: 'data_unavailable' }
  | { kind: 'rate_limited' }
  | {
      /** Path A — `selectPrimaryDocument` returned 0 or >1 eligible
       *  `.xml` candidates. INC-70 anti-heuristic rule: never guess a
       *  filename. Consumer routes to a typed-permanent skip; the
       *  ticker is still ranked by other signals. */
      kind: 'no_primary_doc';
      /** Verbatim file list — surfaced into the orchestrator skip detail
       *  so an operator can see WHICH names were eligible / excluded. */
      filenames: string[];
      /** Eligible-candidate count after exclusions: 0 or >1 (never 1 —
       *  that path routes to `resolved`). */
      eligible_count: number;
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
 *
 * NOTE (ACT-215): `acceptanceDateTime` is NOT exposed by `index.json` for
 * any observed Form-4 shape — verified live 2026-06-14. The submissions
 * feed (`EdgarSubmissionsFetcher`) is the truth source for that field.
 */
interface EdgarIndexJsonItem {
  name?: string;
  type?: string;
  'last-modified'?: string;
}
interface EdgarIndexJsonDirectory {
  name?: string;
  item?: EdgarIndexJsonItem[];
}
interface EdgarIndexJson {
  directory?: EdgarIndexJsonDirectory;
}

// ACT-215: `readAcceptance` removed. The function previously read keys
// that do not exist on the `index.json` payload for any observed
// Form-4 shape; preserving it as dead code would invite a re-wire
// regression. The submissions feed is the truth source for acceptance.

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
    const filenames = readFilenames(body);
    const { primary, eligible } = selectPrimaryDocument(filenames);
    if (primary === null) {
      return {
        kind: 'no_primary_doc',
        filenames,
        eligible_count: eligible.length,
      };
    }
    // ACT-215: acceptance reading removed; the §(b) invariant is the
    // queue's NOT NULL column (MIG-097), enforced at producer-enqueue
    // time. The resolved primary is sufficient for this layer.
    return { kind: 'resolved', primary_document: primary, filenames };
  }
}