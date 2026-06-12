// @ts-nocheck — Deno test file; runs via `deno test`.
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { EdgarForm4Fetcher, form4XmlUrl } from './edgar-form4-fetcher.ts';
import { EdgarFetchError } from './edgar-cik-mapper.ts';

const PURE_P_XML = `<?xml version="1.0"?>
<ownershipDocument>
  <issuer><issuerCik>320193</issuerCik></issuer>
  <reportingOwner>
    <reportingOwnerId><rptOwnerCik>7777777</rptOwnerCik></reportingOwnerId>
    <reportingOwnerRelationship>
      <isDirector>1</isDirector><isOfficer>0</isOfficer><isTenPercentOwner>0</isTenPercentOwner>
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
    </nonDerivativeTransaction>
  </nonDerivativeTable>
</ownershipDocument>`;

function textResp(body: string, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : status === 429 ? 'Too Many' : 'ERR',
    text: async () => body,
    json: async () => ({}),
  };
}

Deno.test('(1) form4XmlUrl strips CIK padding + collapses accession dashes', () => {
  const url = form4XmlUrl({
    cik: '0000320193',
    accession_number: '0000320193-26-000077',
    acceptance_datetime: '2026-05-20T12:00:00',
    primary_document: 'wk-form4_172.xml',
  });
  assertEquals(
    url,
    'https://www.sec.gov/Archives/edgar/data/320193/000032019326000077/wk-form4_172.xml',
  );
});

Deno.test('(2) happy path returns kind=rows with parsed rows', async () => {
  const fetch = async (url: string, init?: { headers?: Record<string, string> }) => {
    assertStringIncludes(url, '/Archives/edgar/data/320193/');
    assert(init?.headers?.['User-Agent']?.includes('Lovable-Crosswind/'));
    return textResp(PURE_P_XML);
  };
  const fetcher = new EdgarForm4Fetcher('ops@example.com', fetch);
  const r = await fetcher.fetchAndParse({
    cik: 320193,
    accession_number: '0000320193-26-000077',
    acceptance_datetime: '2026-05-20T12:00:00',
    primary_document: 'wk-form4_172.xml',
  });
  assertEquals(r.kind, 'rows');
  if (r.kind === 'rows') {
    assertEquals(r.rows.length, 1);
    assertEquals(r.rows[0].transaction_code, 'P');
    assertEquals(r.rows[0].acceptance_datetime, '2026-05-20T12:00:00');
  }
});

Deno.test('(3) 404 → kind=unavailable, never throws', async () => {
  const fetch = async () => textResp('', 404);
  const fetcher = new EdgarForm4Fetcher('ops@example.com', fetch);
  const r = await fetcher.fetchAndParse({
    cik: 1, accession_number: '0000000001-26-000001',
    acceptance_datetime: '2026-05-20T12:00:00', primary_document: 'a.xml',
  });
  assertEquals(r.kind, 'unavailable');
});

Deno.test('(4) 429 → kind=rate_limited (typed; for orchestrator backoff)', async () => {
  const fetch = async () => textResp('', 429);
  const fetcher = new EdgarForm4Fetcher('ops@example.com', fetch);
  const r = await fetcher.fetchAndParse({
    cik: 1, accession_number: '0000000001-26-000001',
    acceptance_datetime: '2026-05-20T12:00:00', primary_document: 'a.xml',
  });
  assertEquals(r.kind, 'rate_limited');
});

Deno.test('(5) 403 (UA reject) throws EdgarFetchError', async () => {
  const fetch = async () => textResp('blocked', 403);
  const fetcher = new EdgarForm4Fetcher('ops@example.com', fetch);
  await assertRejects(() => fetcher.fetchAndParse({
    cik: 1, accession_number: '0000000001-26-000001',
    acceptance_datetime: '2026-05-20T12:00:00', primary_document: 'a.xml',
  }), EdgarFetchError, 'HTTP 403');
});

Deno.test('(6) missing acceptance_datetime → kind=unparseable, no HTTP made', async () => {
  let called = 0;
  const fetch = async () => { called += 1; return textResp(PURE_P_XML); };
  const fetcher = new EdgarForm4Fetcher('ops@example.com', fetch);
  const r = await fetcher.fetchAndParse({
    cik: 1, accession_number: '0000000001-26-000001',
    acceptance_datetime: '', primary_document: 'a.xml',
  });
  assertEquals(r.kind, 'unparseable');
  assertEquals(called, 0);
});

Deno.test('(7) network throw → EdgarFetchError wrapped', async () => {
  const fetch = async () => { throw new Error('ECONNRESET'); };
  const fetcher = new EdgarForm4Fetcher('ops@example.com', fetch);
  await assertRejects(() => fetcher.fetchAndParse({
    cik: 1, accession_number: '0000000001-26-000001',
    acceptance_datetime: '2026-05-20T12:00:00', primary_document: 'a.xml',
  }), EdgarFetchError, 'network error');
});

Deno.test('(8) parser-surfaced unparseable propagates verbatim', async () => {
  const fetch = async () => textResp('<broken/>');
  const fetcher = new EdgarForm4Fetcher('ops@example.com', fetch);
  const r = await fetcher.fetchAndParse({
    cik: 1, accession_number: '0000000001-26-000001',
    acceptance_datetime: '2026-05-20T12:00:00', primary_document: 'a.xml',
  });
  assertEquals(r.kind, 'unparseable');
});