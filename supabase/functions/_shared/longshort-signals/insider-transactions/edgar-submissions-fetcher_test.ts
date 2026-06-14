// @ts-nocheck — Deno test file.
import {
  assert,
  assertEquals,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  EdgarSubmissionsFetcher,
  submissionsUrl,
} from './edgar-submissions-fetcher.ts';
import { EdgarFetchError } from './edgar-cik-mapper.ts';

const CONTACT = 'ops@crosswind.invalid';

function makeResp(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.test('(1) submissionsUrl pads CIK to 10 digits and appends CIK prefix', () => {
  assertEquals(
    submissionsUrl({ cik: 1045810 }),
    'https://data.sec.gov/submissions/CIK0001045810.json',
  );
  assertEquals(
    submissionsUrl({ cik: '0001045810' }),
    'https://data.sec.gov/submissions/CIK0001045810.json',
  );
});

// Verbatim fixture captured live from EDGAR at ACT-215 investigation
// (NVDA, CIK 0001045810). The parallel-array shape is stable per the
// SEC submissions feed contract; this fixture pins it forward.
const NVDA_FIXTURE = {
  cik: '1045810',
  filings: {
    recent: {
      accessionNumber: [
        '0001243821-26-000005',
        '0001768670-26-000002',
        '0001199039-26-000005',
      ],
      acceptanceDateTime: [
        '2026-06-10T21:10:07.000Z',
        '2026-06-05T21:12:55.000Z',
        '2026-06-04T23:34:25.000Z',
      ],
      primaryDocument: [
        'xslF345X06/wk-form4_1781125804.xml',
        'xslF345X06/wk-form4_1780693972.xml',
        'xslF345X06/wk-form4_1780616062.xml',
      ],
      form: ['4', '4', '4'],
    },
  },
};

Deno.test('(2) fetchSubmissions resolved — live NVDA shape: accession→acceptance line-up', async () => {
  const fetcher = new EdgarSubmissionsFetcher(CONTACT, async () => makeResp(200, NVDA_FIXTURE));
  const r = await fetcher.fetchSubmissions({ cik: 1045810 });
  assertEquals(r.kind, 'resolved');
  if (r.kind === 'resolved') {
    assertEquals(r.cik10, '0001045810');
    assertEquals(r.rows.length, 3);
    assertEquals(r.rows[0].accession_number, '0001243821-26-000005');
    assertEquals(r.rows[0].acceptance_datetime, '2026-06-10T21:10:07.000Z');
    assertEquals(r.rows[0].form, '4');
    assertEquals(r.rows[0].primary_document, 'xslF345X06/wk-form4_1781125804.xml');
  }
});

Deno.test('(3) fetchSubmissions filters to Form 4 / 4-A only', async () => {
  const fetcher = new EdgarSubmissionsFetcher(CONTACT, async () =>
    makeResp(200, {
      cik: '1045810',
      filings: {
        recent: {
          accessionNumber: ['A-1', 'A-2', 'A-3', 'A-4'],
          acceptanceDateTime: ['t1', 't2', 't3', 't4'],
          primaryDocument: ['p1', 'p2', 'p3', 'p4'],
          form: ['4', '10-Q', '4/A', '8-K'],
        },
      },
    }));
  const r = await fetcher.fetchSubmissions({ cik: 1045810 });
  assertEquals(r.kind, 'resolved');
  if (r.kind === 'resolved') {
    assertEquals(r.rows.length, 2);
    assertEquals(r.rows.map((x) => x.form), ['4', '4/A']);
    assertEquals(r.rows.map((x) => x.accession_number), ['A-1', 'A-3']);
  }
});

Deno.test('(4) fetchSubmissions 404 → unavailable (typed)', async () => {
  const fetcher = new EdgarSubmissionsFetcher(CONTACT, async () => new Response('not found', { status: 404 }));
  const r = await fetcher.fetchSubmissions({ cik: 9999999999 });
  assertEquals(r.kind, 'unavailable');
});

Deno.test('(5) fetchSubmissions 429 → rate_limited (NOT thrown)', async () => {
  const fetcher = new EdgarSubmissionsFetcher(CONTACT, async () => new Response('', { status: 429 }));
  const r = await fetcher.fetchSubmissions({ cik: 1 });
  assertEquals(r.kind, 'rate_limited');
});

Deno.test('(6) fetchSubmissions 403 → throws EdgarFetchError (UA reject is operator-actionable)', async () => {
  const fetcher = new EdgarSubmissionsFetcher(CONTACT, async () => new Response('forbidden', { status: 403 }));
  await assertRejects(
    () => fetcher.fetchSubmissions({ cik: 1 }),
    EdgarFetchError,
  );
});

Deno.test('(7) fetchSubmissions malformed — missing filings.recent', async () => {
  const fetcher = new EdgarSubmissionsFetcher(CONTACT, async () => makeResp(200, { cik: '1' }));
  const r = await fetcher.fetchSubmissions({ cik: 1 });
  assertEquals(r.kind, 'malformed');
  if (r.kind === 'malformed') assert(r.reason.includes('filings.recent absent'));
});

Deno.test('(8) fetchSubmissions malformed — parallel-array length mismatch', async () => {
  const fetcher = new EdgarSubmissionsFetcher(CONTACT, async () =>
    makeResp(200, {
      filings: {
        recent: {
          accessionNumber: ['A-1', 'A-2'],
          acceptanceDateTime: ['t1'],
          primaryDocument: ['p1', 'p2'],
          form: ['4', '4'],
        },
      },
    }));
  const r = await fetcher.fetchSubmissions({ cik: 1 });
  assertEquals(r.kind, 'malformed');
  if (r.kind === 'malformed') assert(r.reason.includes('length mismatch'));
});

Deno.test('(9) fetchSubmissions malformed — non-string member in parallel array', async () => {
  const fetcher = new EdgarSubmissionsFetcher(CONTACT, async () =>
    makeResp(200, {
      filings: {
        recent: {
          accessionNumber: ['A-1'],
          acceptanceDateTime: [12345], // wrong type
          primaryDocument: ['p1'],
          form: ['4'],
        },
      },
    }));
  const r = await fetcher.fetchSubmissions({ cik: 1 });
  assertEquals(r.kind, 'malformed');
  if (r.kind === 'malformed') assert(r.reason.includes('shape mismatch'));
});

Deno.test('(10) constructor requires contact email (UA discipline §(g))', () => {
  let threw = false;
  try {
    new EdgarSubmissionsFetcher(undefined);
  } catch {
    threw = true;
  }
  assert(threw);
});

Deno.test('(11) source-sentinel — fetcher reads filings.recent.acceptanceDateTime, NEVER per-accession index.json', async () => {
  // ACT-215 drift guard: prevents a "helpful" backslide that wires
  // acceptance reading to the per-accession `index.json` path again —
  // the architectural mismatch ACT-215 closed. Reads the fetcher
  // source verbatim and asserts it (a) references
  // filings.recent.acceptanceDateTime AND (b) never references any
  // per-accession `index.json` URL.
  const src = await Deno.readTextFile(
    new URL('./edgar-submissions-fetcher.ts', import.meta.url),
  );
  // Strip block + line comments so documentation references don't
  // fire the sentinel.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  assert(
    /\bacceptanceDateTime\b/.test(code),
    'fetcher source must reference filings.recent.acceptanceDateTime parallel-array',
  );
  assert(
    !/\/index\.json/.test(code),
    'fetcher source must NOT reference per-accession index.json — that is the ACT-215 mismatch',
  );
});