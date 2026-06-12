// @ts-nocheck — Deno test file.
import {
  assert,
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  EdgarAccessionIndexFetcher,
  accessionIndexUrl,
  selectPrimaryDocument,
} from './edgar-accession-index-fetcher.ts';
import { EdgarFetchError } from './edgar-cik-mapper.ts';

const CONTACT = 'ops@crosswind.invalid';

function makeResp(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.test('(1) accessionIndexUrl strips CIK padding + collapses accession dashes', () => {
  assertEquals(
    accessionIndexUrl({ cik: '0000320193', accession_number: '0000320193-26-000077' }),
    'https://www.sec.gov/Archives/edgar/data/320193/000032019326000077/index.json',
  );
  assertEquals(
    accessionIndexUrl({ cik: 320193, accession_number: '0000320193-26-000077' }),
    'https://www.sec.gov/Archives/edgar/data/320193/000032019326000077/index.json',
  );
});

Deno.test('(2) selectPrimaryDocument — single eligible xml resolves', () => {
  const { primary, eligible } = selectPrimaryDocument([
    'wk-form4_1717000000.xml',
    'wk-form4_1717000000.txt',
    '0000320193-26-000077-index.htm',
  ]);
  assertEquals(primary, 'wk-form4_1717000000.xml');
  assertEquals(eligible.length, 1);
});

Deno.test('(3) selectPrimaryDocument — primary_doc.xml is eligible (modern Form 4)', () => {
  const { primary } = selectPrimaryDocument(['primary_doc.xml', 'primary_doc.html']);
  assertEquals(primary, 'primary_doc.xml');
});

Deno.test('(4) selectPrimaryDocument — excludes index.xml + XBRL linkbases + xsd', () => {
  const { primary, eligible } = selectPrimaryDocument([
    'wf-form4_x.xml',
    'index.xml',
    'foo.xsd',
    'foo-cal.xml', 'foo-def.xml', 'foo-lab.xml', 'foo-pre.xml',
  ]);
  assertEquals(primary, 'wf-form4_x.xml');
  assertEquals(eligible.length, 1);
});

Deno.test('(5) selectPrimaryDocument — zero eligible → primary null', () => {
  const { primary, eligible } = selectPrimaryDocument(['foo.txt', 'bar.htm', 'baz.xsd']);
  assertEquals(primary, null);
  assertEquals(eligible.length, 0);
});

Deno.test('(6) selectPrimaryDocument — >1 eligible → primary null (NO heuristic tiebreak)', () => {
  const { primary, eligible } = selectPrimaryDocument(['a.xml', 'b.xml']);
  assertEquals(primary, null);
  assertEquals(eligible.length, 2);
});

Deno.test('(7) fetchIndex — resolved happy path', async () => {
  const fetcher = new EdgarAccessionIndexFetcher(CONTACT, async () =>
    makeResp(200, {
      directory: {
        name: '0000320193-26-000077',
        acceptanceDateTime: '2026-06-10T16:30:00.000Z',
        item: [
          { name: 'wk-form4_1.xml', type: 'text/xml' },
          { name: '0000320193-26-000077-index.htm', type: 'text/html' },
        ],
      },
    }));
  const r = await fetcher.fetchIndex({ cik: 320193, accession_number: '0000320193-26-000077' });
  assertEquals(r.kind, 'resolved');
  if (r.kind === 'resolved') {
    assertEquals(r.primary_document, 'wk-form4_1.xml');
    assertEquals(r.acceptance_datetime, '2026-06-10T16:30:00.000Z');
  }
});

Deno.test('(8) fetchIndex — 404 typed as data_unavailable', async () => {
  const fetcher = new EdgarAccessionIndexFetcher(CONTACT, async () => new Response('not found', { status: 404 }));
  const r = await fetcher.fetchIndex({ cik: 1, accession_number: '0000000001-00-000001' });
  assertEquals(r.kind, 'unavailable');
});

Deno.test('(9) fetchIndex — 429 typed as rate_limited (NOT thrown)', async () => {
  const fetcher = new EdgarAccessionIndexFetcher(CONTACT, async () => new Response('', { status: 429 }));
  const r = await fetcher.fetchIndex({ cik: 1, accession_number: '0000000001-00-000001' });
  assertEquals(r.kind, 'rate_limited');
});

Deno.test('(10) fetchIndex — 403 throws EdgarFetchError (UA reject is operator-actionable)', async () => {
  const fetcher = new EdgarAccessionIndexFetcher(CONTACT, async () => new Response('forbidden', { status: 403 }));
  await assertRejects(
    () => fetcher.fetchIndex({ cik: 1, accession_number: '0000000001-00-000001' }),
    EdgarFetchError,
  );
});

Deno.test('(11) fetchIndex — >1 eligible xml → ambiguous (NO tiebreak)', async () => {
  const fetcher = new EdgarAccessionIndexFetcher(CONTACT, async () =>
    makeResp(200, {
      directory: {
        acceptanceDateTime: '2026-06-10T16:30:00.000Z',
        item: [{ name: 'a.xml' }, { name: 'b.xml' }],
      },
    }));
  const r = await fetcher.fetchIndex({ cik: 1, accession_number: '0000000001-00-000001' });
  assertEquals(r.kind, 'ambiguous');
  if (r.kind === 'ambiguous') {
    assertEquals(r.eligible_count, 2);
    assertEquals(r.filenames.length, 2);
  }
});

Deno.test('(12) fetchIndex — acceptance missing → ambiguous (§(b) non-defaultable)', async () => {
  const fetcher = new EdgarAccessionIndexFetcher(CONTACT, async () =>
    makeResp(200, {
      directory: { item: [{ name: 'wf-form4_1.xml' }] },
    }));
  const r = await fetcher.fetchIndex({ cik: 1, accession_number: '0000000001-00-000001' });
  assertEquals(r.kind, 'ambiguous');
  if (r.kind === 'ambiguous') {
    assertEquals(r.acceptance_datetime, null);
  }
});

Deno.test('(13) constructor requires contact email (UA discipline §(g))', () => {
  let threw = false;
  try {
    // deno-lint-ignore no-explicit-any
    new EdgarAccessionIndexFetcher(undefined as any);
  } catch {
    threw = true;
  }
  assert(threw);
});