/**
 * edgar-form4-parser.ts — FP-050 Phase 1 / DEC-058 §(a)/(b)/(c)/(h).
 *
 * Pure parser. Takes a Form-4 XML body string + acceptance metadata (the
 * `acceptanceDateTime` from the per-CIK submissions feed OR the
 * acceptance attribute on the filing index) and returns per-transaction
 * rows. Carries the §(b) Option-A dual-date contract:
 *   - `transaction_date`: decay anchor (spec §4.4.4 `age_days =
 *     as_of − transaction_date`); required per row, parse failure if
 *     absent on a non-derivative transaction row.
 *   - `acceptance_datetime`: look-ahead gate (acceptance ≤ as_of); pulled
 *     from the OUTER acceptance metadata (the XML itself does NOT carry
 *     acceptanceDateTime — discovery layer hands it in). Required per
 *     row; absent acceptance = `kind:'unparseable'`, NEVER silent
 *     default. Both dates land on every row, non-negotiable.
 *
 * §(c) 10b5-1 detector: free-text scan of the XML body for
 * `/10b5[- ]?1/i`. Form 4 has no structured per-row 10b5-1 flag; the
 * indication is a form-level checkbox + footnote prose. Phase-0 found
 * 5/5 AMZN filings carry the mention. v1 attaches the body-level boolean
 * to every row (conservative over-exclusion — DEC-058 §(c) explicit).
 *
 * §(h) idempotency triple: (issuer_cik, accession_number, transaction_seq)
 * — `transaction_seq` is the 0-indexed order in which the row appears in
 * `nonDerivativeTable/nonDerivativeTransaction` elements within the
 * filing.
 *
 * §(a) IN-set: the parser does NOT filter on transaction code — it
 * preserves every code (P/S/M/A/C/G/F/I) and lets the downstream
 * `compute-insider.ts` filter authority (DEC-044) apply §4.4.4 verbatim.
 * This keeps the filter rule in a single place; the parser is purely
 * structural.
 *
 * Derivative-only filings: the SEC Form 4 carries both
 * `nonDerivativeTable` and `derivativeTable`. v1 ONLY emits rows from
 * `nonDerivativeTable/nonDerivativeTransaction`. A filing with zero
 * non-derivative transaction rows returns `kind:'parsed', rows:[]` — a
 * counted-not-errored zero, exactly the semantics the orchestrator
 * needs (most option-exercise-only filings fall here).
 *
 * Owner: longshort (FP-050 — Signal #4 EDGAR rebuild / Phase 1)
 */

export const FORM4_PARSER_OPERATION_ID = 'edgar_form4_parser';

/** A single normalized non-derivative transaction row. */
export interface EdgarForm4Row {
  /** §(h) idempotency triple #1: padded 10-digit issuer CIK. */
  issuer_cik: string;
  /** Owner (reporting person) CIK — padded 10-digit. REQUIRED;
   *  absent / non-numeric `rptOwnerCik` ⇒ parse failure
   *  (`kind:'unparseable'`). Tightened FP-050 Phase 3.6b.iii′ (M1
   *  ruling 2026-06-12): the prior leniency would have let an empty
   *  string land in the persisted row, violating MIG-095's `NOT NULL`
   *  and shifting the §(h) four-part dedup key (issuer_cik,
   *  owner_cik, transaction_date, transaction_seq) into a silent
   *  three-part collision (R1 regression). Parser tests did not pin
   *  the prior leniency (verified by grep), so the contract owner
   *  enforces the contract here — no consumer-side leniency seam. */
  owner_cik: string;
  /** §(h) idempotency triple #2. */
  accession_number: string;
  /** §(h) idempotency triple #3 — 0-indexed within
   *  `nonDerivativeTable/nonDerivativeTransaction`. */
  transaction_seq: number;
  /** P / S / M / A / C / G / F / I — preserved verbatim for the compute-
   *  layer §(a) IN-set filter. */
  transaction_code: string;
  shares: number;
  price_per_share: number;
  /** A = acquired (+1 sign), D = disposed (-1 sign). Both letters
   *  preserved verbatim; compute layer maps to sign per §4.4.4. */
  acquired_disposed: 'A' | 'D' | string;
  /** D = direct, I = indirect; preserved for diagnostics. */
  ownership_type: 'D' | 'I' | string;
  /** Reporting officer's title; empty string if absent. */
  officer_title: string;
  is_director: boolean;
  is_officer: boolean;
  is_ten_percent_owner: boolean;
  /** §(c) document-body free-text scan. True if `/10b5[- ]?1/i` matches
   *  anywhere in the XML body. Conservatively applies to every row in
   *  the filing (form-level discipline per DEC-058 §(c)). */
  has_10b5_1_mention: boolean;
  /** §(b) decay anchor: ISO YYYY-MM-DD. */
  transaction_date: string;
  /** §(b) look-ahead gate: ISO 8601 UTC. */
  acceptance_datetime: string;
}

export type EdgarForm4ParseResult =
  | { kind: 'parsed'; rows: EdgarForm4Row[] }
  | { kind: 'unparseable'; reason: string };

export interface EdgarForm4ParseInput {
  xml: string;
  accession_number: string;
  /** From the per-CIK submissions feed or filing index. ISO 8601 UTC. */
  acceptance_datetime: string;
}

/**
 * Tag extractor (regex-based — deliberate; no XML DOM in Deno runtime
 * without a heavy dep, and Form-4 XML is shallow and machine-generated).
 * Returns the inner text of the FIRST occurrence of `<tag>...</tag>`
 * within `scope`, trimmed. Returns null if not present.
 */
function firstTag(scope: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = scope.match(re);
  if (m === null) return null;
  return m[1].trim();
}

/**
 * Boolean parsed from the SEC's `<isOfficer>1</isOfficer>` or
 * `<isOfficer>true</isOfficer>` shapes. Defaults false if absent.
 */
function boolTag(scope: string, tag: string): boolean {
  const v = firstTag(scope, tag);
  if (v === null) return false;
  const trimmed = v.trim().toLowerCase();
  return trimmed === '1' || trimmed === 'true';
}

/** Extract the inner-text of a `<value>...</value>` nested inside `<wrapper>`. */
function nestedValue(scope: string, wrapper: string): string | null {
  const wrap = firstTag(scope, wrapper);
  if (wrap === null) return null;
  return firstTag(wrap, 'value');
}

/** Match every `<nonDerivativeTransaction>...</nonDerivativeTransaction>` block. */
function nonDerivativeTransactionBlocks(xml: string): string[] {
  const out: string[] = [];
  const re = /<nonDerivativeTransaction[^>]*>([\s\S]*?)<\/nonDerivativeTransaction>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

/** Zero-pad a CIK integer-string to 10 chars. Returns '' if not numeric. */
function padCikString(raw: string | null): string {
  if (raw === null) return '';
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return '';
  return t.padStart(10, '0');
}

/**
 * Parse a Form-4 XML body to per-transaction rows. Pure function; the
 * fetcher is the IO layer. Returns `kind:'unparseable'` only on
 * structural failures the orchestrator must treat as fetch errors
 * (missing acceptance_datetime; XML lacking even the issuer block).
 */
export function parseEdgarForm4(input: EdgarForm4ParseInput): EdgarForm4ParseResult {
  const { xml, accession_number, acceptance_datetime } = input;
  if (typeof xml !== 'string' || xml.length === 0) {
    return { kind: 'unparseable', reason: 'empty XML body' };
  }
  if (typeof acceptance_datetime !== 'string' || acceptance_datetime.length === 0) {
    // The dual-date contract is non-negotiable per DEC-058 §(b).
    return {
      kind: 'unparseable',
      reason: '§(b) dual-date contract violated: acceptance_datetime missing — never silently defaulted',
    };
  }

  const issuerBlock = firstTag(xml, 'issuer');
  if (issuerBlock === null) {
    return { kind: 'unparseable', reason: 'missing <issuer> block' };
  }
  const issuerCik = padCikString(firstTag(issuerBlock, 'issuerCik'));
  if (issuerCik === '') {
    return { kind: 'unparseable', reason: 'missing or non-numeric issuerCik' };
  }

  // Reporting-owner block (may be present multiple times; v1 uses first).
  const ownerBlock = firstTag(xml, 'reportingOwner') ?? '';
  const ownerIdBlock = firstTag(ownerBlock, 'reportingOwnerId') ?? '';
  const ownerCik = padCikString(firstTag(ownerIdBlock, 'rptOwnerCik'));
  if (ownerCik === '') {
    // M1 ruling (2026-06-12): absent owner_cik = typed parse failure,
    // never silently '' (would collapse the §(h) four-part dedup key
    // and violate MIG-095 NOT NULL).
    return {
      kind: 'unparseable',
      reason: '§(h) four-part-key contract violated: missing or non-numeric rptOwnerCik',
    };
  }
  const relBlock = firstTag(ownerBlock, 'reportingOwnerRelationship') ?? '';
  const isDirector = boolTag(relBlock, 'isDirector');
  const isOfficer = boolTag(relBlock, 'isOfficer');
  const isTenPercent = boolTag(relBlock, 'isTenPercentOwner');
  const officerTitle = (firstTag(relBlock, 'officerTitle') ?? '').trim();

  // §(c) body-level 10b5-1 detector.
  const has10b5_1 = /10b5[- ]?1/i.test(xml);

  // Per-row parse.
  const blocks = nonDerivativeTransactionBlocks(xml);
  const rows: EdgarForm4Row[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const transactionDate = nestedValue(block, 'transactionDate');
    if (transactionDate === null || !/^\d{4}-\d{2}-\d{2}/.test(transactionDate)) {
      // A non-derivative transaction MUST carry a date; skip-with-counter
      // semantics live in the orchestrator. Here we drop the row from
      // emission rather than fail the whole filing.
      continue;
    }
    const codingBlock = firstTag(block, 'transactionCoding') ?? '';
    const transactionCode = (firstTag(codingBlock, 'transactionCode') ?? '').trim();
    const amountsBlock = firstTag(block, 'transactionAmounts') ?? '';
    const sharesStr = nestedValue(amountsBlock, 'transactionShares');
    const priceStr = nestedValue(amountsBlock, 'transactionPricePerShare');
    const adStr =
      nestedValue(amountsBlock, 'transactionAcquiredDisposedCode') ??
      firstTag(amountsBlock, 'transactionAcquiredDisposedCode') ??
      '';
    const ownershipBlock = firstTag(block, 'ownershipNature') ?? '';
    const ownershipType =
      nestedValue(ownershipBlock, 'directOrIndirectOwnership') ??
      firstTag(ownershipBlock, 'directOrIndirectOwnership') ??
      '';

    const shares = sharesStr === null ? NaN : Number(sharesStr);
    const pricePerShare = priceStr === null ? 0 : Number(priceStr);
    if (!Number.isFinite(shares) || shares <= 0) continue;

    rows.push({
      issuer_cik: issuerCik,
      owner_cik: ownerCik,
      accession_number,
      transaction_seq: i,
      transaction_code: transactionCode,
      shares,
      // Price may legitimately be 0 (gifts, certain transfers); preserve.
      price_per_share: Number.isFinite(pricePerShare) ? pricePerShare : 0,
      acquired_disposed: adStr.trim(),
      ownership_type: ownershipType.trim(),
      officer_title: officerTitle,
      is_director: isDirector,
      is_officer: isOfficer,
      is_ten_percent_owner: isTenPercent,
      has_10b5_1_mention: has10b5_1,
      transaction_date: transactionDate.slice(0, 10),
      acceptance_datetime,
    });
  }

  return { kind: 'parsed', rows };
}