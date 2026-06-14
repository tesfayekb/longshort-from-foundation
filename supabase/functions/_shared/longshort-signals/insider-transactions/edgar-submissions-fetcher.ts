/**
 * edgar-submissions-fetcher.ts — FP-050 Phase 4 / ACT-215 / DEC-058 §(b)
 * amendment.
 *
 * Per-issuer SEC submissions feed fetcher. GETs
 *   `https://data.sec.gov/submissions/CIK<padded10>.json`
 * and returns the issuer's recent Form-4 / 4-A accessions with their
 * authoritative `acceptanceDateTime` + `primaryDocument` + `form` lined
 * up by accession number.
 *
 * ─── WHY THIS FETCHER EXISTS (ARCHITECTURAL) ────────────────────────
 *
 * Live-EDGAR verification at ACT-215 confirmed per-accession
 * `index.json` (the layer the prior `EdgarAccessionIndexFetcher` read
 * acceptance from) does NOT carry `acceptanceDateTime` for ANY
 * observed Form-4 shape — modern Workiva `wk-form4_*.xml` and legacy
 * paper `edgardoc.xml` alike. The DEC-058 §(b) non-defaultable
 * acceptance contract requires an authoritative source; the per-issuer
 * submissions feed IS that source (the parallel-array members
 * `filings.recent.{accessionNumber, acceptanceDateTime, primaryDocument,`
 * `form}[]` are documented and stable).
 *
 * The fetcher runs at the PRODUCER layer (the GHA-egress
 * `scripts/insider-discovery-egress.ts`). The consumer reads acceptance
 * directly from the `insider_accession_discovery_queue.acceptance_datetime`
 * NOT NULL column (MIG-097) — the consumer does NOT call this fetcher.
 *
 * Rate-budget: ~1 fetch per unique issuer per producer run (vs ~14k
 * per-accession fetches under the prior architecture across a 63-day
 * backfill — ~14× cheaper at the rate-budget layer).
 *
 * ─── TYPED TAXONOMY (parallels sibling fetchers) ────────────────────
 *
 *   - HTTP 404 → kind:'unavailable' (issuer's submissions feed missing
 *     — rare; e.g., very new CIK or deregistered issuer)
 *   - HTTP 429 → kind:'rate_limited' (5 rps bucket should prevent;
 *     surfaced typed so caller can backoff)
 *   - HTTP 403 / other non-OK → throws EdgarFetchError
 *   - parallel-array shape mismatch (lengths disagree) → kind:'malformed'
 *     with a diagnostic count tuple — typed surface, not a silent skip
 *
 * ─── DRIFT SENTINEL ────────────────────────────────────────────────
 *
 * The co-located test asserts the fetcher reads `filings.recent.`
 * `acceptanceDateTime` and NEVER from per-accession `index.json`
 * paths — guards against a "helpful" backslide to the architectural
 * mismatch ACT-215 closed.
 *
 * Owner: longshort (FP-050 — Signal #4 EDGAR rebuild / Phase 4 ACT-215)
 */
import type { HttpFetch } from '../../longshort-universe-interfaces.ts';
import { buildEdgarUserAgent, EdgarFetchError } from './edgar-cik-mapper.ts';
import {
  defaultEdgarFetchTelemetry,
  type EdgarFetchTelemetry,
} from './edgar-fetch-telemetry.ts';

/** Submissions-feed endpoint base. The 10-digit padded CIK is appended. */
export const SUBMISSIONS_BASE = 'https://data.sec.gov/submissions';

/** Operation identifier surfaced on thrown errors + telemetry. */
export const SUBMISSIONS_OPERATION_ID = 'edgar_submissions';

/** Resolved per-accession metadata for ONE Form-4 / 4-A row. */
export interface SubmissionsRecentRow {
  /** Dashed accession number `NNNNNNNNNN-NN-NNNNNN` (verbatim from feed). */
  accession_number: string;
  /** Form type — '4' or '4/A' (the fetcher returns Form-4-family only). */
  form: '4' | '4/A';
  /** ISO 8601 UTC acceptance datetime (verbatim from feed). */
  acceptance_datetime: string;
  /** Primary-document basename or `xslF345X06/wk-form4_*.xml`-style relative
   *  path. Verbatim from feed; downstream consumers strip the rendering
   *  prefix if needed. */
  primary_document: string;
}

export interface EdgarSubmissionsInput {
  /** Raw integer CIK (may be padded; either accepted). */
  cik: string | number;
}

export type EdgarSubmissionsResult =
  | { kind: 'resolved'; cik10: string; rows: SubmissionsRecentRow[] }
  | { kind: 'unavailable'; reason: 'data_unavailable' }
  | { kind: 'rate_limited' }
  | { kind: 'malformed'; reason: string };

/** Build the submissions URL — pads the CIK to 10 digits. */
export function submissionsUrl(input: EdgarSubmissionsInput): string {
  const raw = typeof input.cik === 'number' ? String(input.cik) : input.cik;
  const cleaned = raw.replace(/^0+/, '');
  const unpadded = cleaned.length === 0 ? '0' : cleaned;
  const padded = unpadded.padStart(10, '0');
  return `${SUBMISSIONS_BASE}/CIK${padded}.json`;
}

/** Submissions feed shape (only the fields we read). */
interface SubmissionsRecentArrays {
  accessionNumber?: unknown;
  acceptanceDateTime?: unknown;
  primaryDocument?: unknown;
  form?: unknown;
}
interface SubmissionsBody {
  cik?: unknown;
  filings?: { recent?: SubmissionsRecentArrays };
}

/** Read a parallel-array field as `string[]`, returning null on shape mismatch. */
function readStringArray(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') return null;
    out.push(x);
  }
  return out;
}

export class EdgarSubmissionsFetcher {
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
        op: SUBMISSIONS_OPERATION_ID,
        path_family: 'submissions',
        status,
        url,
        correlation_id: this.correlationId,
        duration_ms: -1,
      });
    } catch {
      // swallow
    }
  }

  async fetchSubmissions(input: EdgarSubmissionsInput): Promise<EdgarSubmissionsResult> {
    const url = submissionsUrl(input);
    let resp: Awaited<ReturnType<HttpFetch>>;
    try {
      resp = await this.httpFetch(url, {
        method: 'GET',
        headers: { 'User-Agent': this.userAgent, 'Accept': 'application/json' },
      });
    } catch (e) {
      this.emit(0, url);
      throw new EdgarFetchError(
        SUBMISSIONS_OPERATION_ID,
        `network error on ${url}`,
        e,
      );
    }
    this.emit(resp.status, url);
    if (resp.status === 404) return { kind: 'unavailable', reason: 'data_unavailable' };
    if (resp.status === 429) return { kind: 'rate_limited' };
    if (!resp.ok) {
      throw new EdgarFetchError(
        SUBMISSIONS_OPERATION_ID,
        `HTTP ${resp.status} ${resp.statusText} on ${url}`,
      );
    }
    let body: SubmissionsBody;
    try {
      body = (await resp.json()) as SubmissionsBody;
    } catch (e) {
      throw new EdgarFetchError(
        SUBMISSIONS_OPERATION_ID,
        `JSON parse error on ${url}`,
        e,
      );
    }

    // ── Read the 4 parallel arrays we need; shape-validate strictly.
    const recent = body.filings?.recent;
    if (recent === undefined || recent === null) {
      return { kind: 'malformed', reason: 'filings.recent absent' };
    }
    const accs = readStringArray(recent.accessionNumber);
    const acceptances = readStringArray(recent.acceptanceDateTime);
    const primaries = readStringArray(recent.primaryDocument);
    const forms = readStringArray(recent.form);
    if (accs === null || acceptances === null || primaries === null || forms === null) {
      return {
        kind: 'malformed',
        reason: 'filings.recent parallel-array shape mismatch (non-string member)',
      };
    }
    if (
      accs.length !== acceptances.length ||
      accs.length !== primaries.length ||
      accs.length !== forms.length
    ) {
      return {
        kind: 'malformed',
        reason: `parallel-array length mismatch (acc=${accs.length} acceptance=${acceptances.length} primary=${primaries.length} form=${forms.length})`,
      };
    }

    // ── Filter to Form 4 / 4/A only; emit one row per accession.
    const rows: SubmissionsRecentRow[] = [];
    for (let i = 0; i < accs.length; i += 1) {
      const form = forms[i];
      if (form !== '4' && form !== '4/A') continue;
      const acceptance = acceptances[i];
      if (acceptance.length === 0) continue; // defensive — should never happen
      rows.push({
        accession_number: accs[i],
        form,
        acceptance_datetime: acceptance,
        primary_document: primaries[i],
      });
    }

    // ── Resolve the canonical 10-digit CIK for the caller.
    const cikRaw = typeof input.cik === 'number' ? String(input.cik) : input.cik;
    const cleaned = cikRaw.replace(/^0+/, '');
    const padded = (cleaned.length === 0 ? '0' : cleaned).padStart(10, '0');
    return { kind: 'resolved', cik10: padded, rows };
  }
}