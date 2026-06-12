// @ts-nocheck — Deno test file; runs via `deno test`.
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseEdgarForm4 } from './edgar-form4-parser.ts';

// --- B2-flavored fixtures (AMZN cluster: M then S; 10b5-1 mention; a
// pure-P fixture; a 4/A; a derivative-only filing.) Shapes mirror real
// Form-4 XML envelopes but trimmed to the elements the parser reads.

const AMZN_M_THEN_S = `<?xml version="1.0"?>
<ownershipDocument>
  <issuer>
    <issuerCik>1018724</issuerCik>
    <issuerName>AMAZON COM INC</issuerName>
    <issuerTradingSymbol>AMZN</issuerTradingSymbol>
  </issuer>
  <reportingOwner>
    <reportingOwnerId><rptOwnerCik>1234567</rptOwnerCik></reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>0</isDirector>
      <isOfficer>1</isOfficer>
      <isTenPercentOwner>0</isTenPercentOwner>
      <officerTitle>CEO Worldwide Amazon Stores</officerTitle>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <transactionDate><value>2026-06-05</value></transactionDate>
      <transactionCoding>
        <transactionFormType>4</transactionFormType>
        <transactionCode>M</transactionCode>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>1000</value></transactionShares>
        <transactionPricePerShare><value>0</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <ownershipNature>
        <directOrIndirectOwnership><value>D</value></directOrIndirectOwnership>
      </ownershipNature>
    </nonDerivativeTransaction>
    <nonDerivativeTransaction>
      <transactionDate><value>2026-06-05</value></transactionDate>
      <transactionCoding>
        <transactionFormType>4</transactionFormType>
        <transactionCode>S</transactionCode>
      </transactionCoding>
      <transactionAmounts>
        <transactionShares><value>800</value></transactionShares>
        <transactionPricePerShare><value>185.50</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <ownershipNature>
        <directOrIndirectOwnership><value>D</value></directOrIndirectOwnership>
      </ownershipNature>
      <footnoteId id="F1"/>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
  <footnotes>
    <footnote id="F1">Sale effected pursuant to a Rule 10b5-1 trading plan adopted on 2026-02-14.</footnote>
  </footnotes>
</ownershipDocument>`;

const PURE_P = `<?xml version="1.0"?>
<ownershipDocument>
  <issuer><issuerCik>320193</issuerCik><issuerName>APPLE</issuerName></issuer>
  <reportingOwner>
    <reportingOwnerId><rptOwnerCik>7777777</rptOwnerCik></reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>1</isDirector><isOfficer>0</isOfficer><isTenPercentOwner>0</isTenPercentOwner>
      <officerTitle></officerTitle>
    </reportingOwnerRelationship>
  </reportingOwner>
  <nonDerivativeTable>
    <nonDerivativeTransaction>
      <transactionDate><value>2026-05-20</value></transactionDate>
      <transactionCoding><transactionCode>P</transactionCode></transactionCoding>
      <transactionAmounts>
        <transactionShares><value>500</value></transactionShares>
        <transactionPricePerShare><value>175.25</value></transactionPricePerShare>
        <transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode>
      </transactionAmounts>
      <ownershipNature><directOrIndirectOwnership><value>D</value></directOrIndirectOwnership></ownershipNature>
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;

const FORM_4A = PURE_P; // shape identical at parser layer per §(h)

const DERIVATIVE_ONLY = `<?xml version="1.0"?>
<ownershipDocument>
  <issuer><issuerCik>1045810</issuerCik></issuer>
  <reportingOwner>
    <reportingOwnerId><rptOwnerCik>9999</rptOwnerCik></reportingOwnerId>
    <reportingOwnerRelationship>
      <isOfficer>1</isOfficer><officerTitle>VP Engineering</officerTitle>
    </reportingOwnerRelationship>
  </reportingOwner>
  <derivativeTable>
    <derivativeTransaction>
      <transactionDate><value>2026-05-15</value></transactionDate>
      <transactionCoding><transactionCode>A</transactionCode></transactionCoding>
    </derivativeTransaction>
  </derivativeTable>
</ownershipDocument>`;

const ACCEPTANCE = '2026-06-08T14:23:45';

Deno.test('(1) AMZN fixture: M-then-S parsed as two rows, codes preserved verbatim', () => {
  const r = parseEdgarForm4({
    xml: AMZN_M_THEN_S, accession_number: '0001018724-26-000123', acceptance_datetime: ACCEPTANCE,
  });
  assertEquals(r.kind, 'parsed');
  if (r.kind !== 'parsed') return;
  assertEquals(r.rows.length, 2);
  assertEquals(r.rows[0].transaction_code, 'M');
  assertEquals(r.rows[1].transaction_code, 'S');
  assertEquals(r.rows[0].transaction_seq, 0);
  assertEquals(r.rows[1].transaction_seq, 1);
  assertEquals(r.rows[0].issuer_cik, '0001018724');
  assertEquals(r.rows[0].owner_cik, '0001234567');
});

Deno.test('(2) §(b) DUAL-DATE contract: both transaction_date AND acceptance_datetime present on every row', () => {
  const r = parseEdgarForm4({
    xml: AMZN_M_THEN_S, accession_number: 'X', acceptance_datetime: ACCEPTANCE,
  });
  if (r.kind !== 'parsed') throw new Error('unexpected');
  for (const row of r.rows) {
    assertEquals(row.transaction_date, '2026-06-05');
    assertEquals(row.acceptance_datetime, ACCEPTANCE);
  }
});

Deno.test('(3) §(c) 10b5-1 mention detected on body — flag attaches to EVERY row in the filing', () => {
  const r = parseEdgarForm4({
    xml: AMZN_M_THEN_S, accession_number: 'X', acceptance_datetime: ACCEPTANCE,
  });
  if (r.kind !== 'parsed') throw new Error('unexpected');
  assert(r.rows.every((row) => row.has_10b5_1_mention === true));
});

Deno.test('(3a) Pure-P fixture: no 10b5-1 mention → false on every row', () => {
  const r = parseEdgarForm4({
    xml: PURE_P, accession_number: 'X', acceptance_datetime: ACCEPTANCE,
  });
  if (r.kind !== 'parsed') throw new Error('unexpected');
  assertEquals(r.rows.length, 1);
  assertEquals(r.rows[0].has_10b5_1_mention, false);
  assertEquals(r.rows[0].transaction_code, 'P');
  assertEquals(r.rows[0].acquired_disposed, 'A');
  assertEquals(r.rows[0].shares, 500);
  assertEquals(r.rows[0].price_per_share, 175.25);
  assertEquals(r.rows[0].is_director, true);
  assertEquals(r.rows[0].is_officer, false);
});

Deno.test('(4) Form 4/A parses identically (§(h))', () => {
  const r = parseEdgarForm4({
    xml: FORM_4A, accession_number: '9999-26-000001', acceptance_datetime: ACCEPTANCE,
  });
  assertEquals(r.kind, 'parsed');
  if (r.kind === 'parsed') assertEquals(r.rows.length, 1);
});

Deno.test('(5) Derivative-only filing → kind=parsed with rows=[] (counted, NOT errored)', () => {
  const r = parseEdgarForm4({
    xml: DERIVATIVE_ONLY, accession_number: 'X', acceptance_datetime: ACCEPTANCE,
  });
  assertEquals(r.kind, 'parsed');
  if (r.kind === 'parsed') assertEquals(r.rows.length, 0);
});

Deno.test('(6) Missing acceptance_datetime → kind=unparseable (§(b) non-negotiable)', () => {
  const r = parseEdgarForm4({
    xml: PURE_P, accession_number: 'X', acceptance_datetime: '',
  });
  assertEquals(r.kind, 'unparseable');
  if (r.kind === 'unparseable') assertStringIncludes(r.reason, 'dual-date');
});

Deno.test('(7) Empty / malformed XML → typed unparseable, never silent', () => {
  const r = parseEdgarForm4({ xml: '', accession_number: 'X', acceptance_datetime: ACCEPTANCE });
  assertEquals(r.kind, 'unparseable');
  const r2 = parseEdgarForm4({
    xml: '<garbage>no issuer</garbage>', accession_number: 'X', acceptance_datetime: ACCEPTANCE,
  });
  assertEquals(r2.kind, 'unparseable');
});

Deno.test('(8) Officer-title and role booleans surface from reportingOwnerRelationship', () => {
  const r = parseEdgarForm4({
    xml: AMZN_M_THEN_S, accession_number: 'X', acceptance_datetime: ACCEPTANCE,
  });
  if (r.kind !== 'parsed') throw new Error('unexpected');
  assertEquals(r.rows[0].officer_title, 'CEO Worldwide Amazon Stores');
  assertEquals(r.rows[0].is_officer, true);
  assertEquals(r.rows[0].is_director, false);
});

Deno.test('(9) §(a): parser does NOT filter on transaction code — M, P, S, A, G all preserved', () => {
  // Codes M and S both appear above and both surface unfiltered; that
  // is the §(a) contract — filtering authority lives in compute-insider.
  const r = parseEdgarForm4({
    xml: AMZN_M_THEN_S, accession_number: 'X', acceptance_datetime: ACCEPTANCE,
  });
  if (r.kind !== 'parsed') throw new Error('unexpected');
  const codes = r.rows.map((row) => row.transaction_code);
  assertEquals(codes.sort(), ['M', 'S']);
});