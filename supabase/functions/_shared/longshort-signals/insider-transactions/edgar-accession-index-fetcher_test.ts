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

Deno.test('(11) fetchIndex — >1 eligible xml → no_primary_doc (NO tiebreak)', async () => {
  const fetcher = new EdgarAccessionIndexFetcher(CONTACT, async () =>
    makeResp(200, {
      directory: {
        item: [{ name: 'a.xml' }, { name: 'b.xml' }],
      },
    }));
  const r = await fetcher.fetchIndex({ cik: 1, accession_number: '0000000001-00-000001' });
  assertEquals(r.kind, 'no_primary_doc');
  if (r.kind === 'no_primary_doc') {
    assertEquals(r.eligible_count, 2);
    assertEquals(r.filenames.length, 2);
  }
});

Deno.test('(12) fetchIndex — single eligible xml, no acceptance read attempted → resolved (ACT-215: §(b) moved to producer/queue)', async () => {
  // ACT-215: index.json never carries acceptanceDateTime for any
  // observed Form-4 shape; the fetcher post-amendment does NOT read
  // acceptance at all. Single-eligible-xml + no acceptance still
  // returns `resolved` (was `no_acceptance_datetime` under ACT-214).
  const fetcher = new EdgarAccessionIndexFetcher(CONTACT, async () =>
    makeResp(200, {
      directory: { item: [{ name: 'wf-form4_1.xml' }] },
    }));
  const r = await fetcher.fetchIndex({ cik: 1, accession_number: '0000000001-00-000001' });
  assertEquals(r.kind, 'resolved');
  if (r.kind === 'resolved') {
    assertEquals(r.primary_document, 'wf-form4_1.xml');
  }
});

Deno.test('(12b) fetchIndex — zero eligible xml → no_primary_doc (Path A boundary at 0)', async () => {
  const fetcher = new EdgarAccessionIndexFetcher(CONTACT, async () =>
    makeResp(200, {
      directory: {
        item: [{ name: 'foo.txt' }, { name: 'bar.htm' }],
      },
    }));
  const r = await fetcher.fetchIndex({ cik: 1, accession_number: '0000000001-00-000001' });
  assertEquals(r.kind, 'no_primary_doc');
  if (r.kind === 'no_primary_doc') {
    assertEquals(r.eligible_count, 0);
  }
});

Deno.test('(12c) fetchIndex — ACT-215 forensic fixture: accession 0000100885-26-000182 verbatim index.json → resolved, primary=edgardoc.xml (post-amendment)', async () => {
  // Same verbatim body captured live during the ACT-213 investigation.
  // Pre-ACT-215 this routed to `no_acceptance_datetime` (Path B);
  // post-ACT-215 the fetcher returns `resolved` because acceptance is
  // no longer this layer's responsibility. The fixture is preserved to
  // pin that the LIVE-EDGAR shape (no acceptanceDateTime present)
  // still resolves cleanly through the primary-doc-only contract.
  const fetcher = new EdgarAccessionIndexFetcher(CONTACT, async () =>
    makeResp(200, {
      directory: {
        name: '/Archives/edgar/data/100885/000010088526000182',
        'parent-dir': '/Archives/edgar/data/100885',
        item: [
          { 'last-modified': '2026-06-11 17:45:03', name: '0000100885-26-000182-index-headers.html', type: 'text.gif', size: '' },
          { 'last-modified': '2026-06-11 17:45:03', name: '0000100885-26-000182-index.html', type: 'text.gif', size: '' },
          { 'last-modified': '2026-06-11 17:45:03', name: '0000100885-26-000182.txt', type: 'text.gif', size: '' },
          { 'last-modified': '2026-06-11 17:45:03', name: 'edgardoc.xml', type: 'text.gif', size: '3293' },
        ],
      },
    }));
  const r = await fetcher.fetchIndex({ cik: 100885, accession_number: '0000100885-26-000182' });
  assertEquals(r.kind, 'resolved');
  if (r.kind === 'resolved') {
    assertEquals(r.primary_document, 'edgardoc.xml');
    assertEquals(r.filenames.length, 4);
  }
});

Deno.test('(12d) source-sentinel — fetcher never returns kind:"ambiguous" OR kind:"no_acceptance_datetime" (ACT-213 split + ACT-215 collapse remain pinned)', async () => {
  // Compound drift guard:
  //   - ACT-213 split: the old `kind:'ambiguous'` MUST stay gone.
  //   - ACT-215 collapse: the sibling `kind:'no_acceptance_datetime'`
  //     also MUST stay gone (acceptance moved to producer/queue).
  // A "helpful" backslide that resurrects either name re-opens the
  // architectural drift this fetcher was reshaped to close.
  const src = await Deno.readTextFile(
    new URL('./edgar-accession-index-fetcher.ts', import.meta.url),
  );
  // Strip block + line comments so documentation references to the
  // historical names don't fire the sentinel.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  assert(
    !/kind:\s*['"]ambiguous['"]/.test(code),
    'fetcher source must not return kind:"ambiguous" — ACT-213 split must remain (no_primary_doc / no_acceptance_datetime).',
  );
  assert(
    !/kind:\s*['"]no_acceptance_datetime['"]/.test(code),
    'fetcher source must not return kind:"no_acceptance_datetime" — ACT-215 collapse moved acceptance to the producer/queue layer.',
  );
  // The fetcher must also not READ acceptanceDateTime from the index
  // payload — that was the architectural mismatch ACT-215 closed.
  assert(
    !/\bacceptanceDateTime\b/.test(code),
    'fetcher source must not read acceptanceDateTime — the field is not present on per-accession index.json (live-verified 2026-06-14); acceptance lives in the submissions feed.',
  );
});

Deno.test('(13) constructor requires contact email (UA discipline §(g))', () => {
  let threw = false;
  try {
    new EdgarAccessionIndexFetcher(undefined);
  } catch {
    threw = true;
  }
  assert(threw);
});