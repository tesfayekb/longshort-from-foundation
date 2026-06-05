// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
//
// FP-008.4 #13 — closes the WikipediaConstituentFetcher orphan-test gap and
// covers the new sanity-bounds assertion + skip-count forensics added to
// parseWikipediaConstituents.
//
// Defense-in-depth scope (per #13 framing): the bounds throw is an earlier,
// more diagnosable fail-fast at the parse boundary; the cross-check still
// backstops the catastrophic case via the sym-diff ceiling. These tests
// pin the parse-boundary behavior, NOT the cross-check (covered separately
// in cross-check-spec.test.ts).
import {
  assert,
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  parseWikipediaConstituents,
  WikipediaConstituentFetcher,
} from './wikipedia-constituent-fetcher.ts';
import { ConstituentFetchError } from '../../longshort-universe-interfaces.ts';

const AS_OF = new Date('2026-05-25T14:30:00Z');

/** Build a wikitable HTML page with N data rows, each having a valid ticker. */
function buildWikitableHtml(opts: {
  rowCount: number;
  tickerFor?: (i: number) => string;
  header?: string;
  extraRows?: string;
}): string {
  const tickerFor = opts.tickerFor ?? ((i: number) => `T${i.toString(36).toUpperCase()}`);
  const header = opts.header ?? '<th>Symbol</th><th>Security</th><th>GICS Sector</th>';
  const rows: string[] = [];
  for (let i = 0; i < opts.rowCount; i += 1) {
    const t = tickerFor(i);
    rows.push(
      `<tr><td><a href="/wiki/${t}">${t}</a></td><td>${t} Corp</td><td>Tech</td></tr>`,
    );
  }
  if (opts.extraRows) rows.push(opts.extraRows);
  return `<html><body>
    <table class="wikitable sortable">
      <tr>${header}</tr>
      ${rows.join('\n')}
    </table>
  </body></html>`;
}

/** Generate unique, regex-valid tickers across an arbitrary count. */
function uniqueTicker(i: number): string {
  // 26*26 = 676 combos with two letters — enough for sp500 bounds tests.
  const a = String.fromCharCode(65 + Math.floor(i / 26) % 26);
  const b = String.fromCharCode(65 + (i % 26));
  const c = String.fromCharCode(65 + Math.floor(i / 676) % 26);
  return `${a}${b}${c}`;
}

// ─── Positive: in-bounds parse ───────────────────────────────────────────

Deno.test('(1) positive: 500-row valid wikitable parses to 500 sp500 tickers, no throw', () => {
  const html = buildWikitableHtml({ rowCount: 500, tickerFor: uniqueTicker });
  const parsed = parseWikipediaConstituents(html, 'sp500');
  assertEquals(parsed.length, 500);
  // Bounds endpoint sanity: in-bounds tickers are upper-cased ASCII.
  assert(parsed.every((p) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(p.ticker)));
  // FP-009 Bucket 0 — every row carries the synthetic "Tech" sector from the fixture.
  assert(parsed.every((p) => p.gics_sector === 'Tech'));
});

Deno.test('(2) positive: 400-row valid wikitable parses to 400 sp400 tickers, no throw', () => {
  const html = buildWikitableHtml({ rowCount: 400, tickerFor: uniqueTicker });
  const parsed = parseWikipediaConstituents(html, 'sp400');
  assertEquals(parsed.length, 400);
});

Deno.test('(3) positive: bounds boundary — sp500 at min (490) and max (520) accepted', () => {
  const atMin = parseWikipediaConstituents(
    buildWikitableHtml({ rowCount: 490, tickerFor: uniqueTicker }),
    'sp500',
  );
  assertEquals(atMin.length, 490);
  const atMax = parseWikipediaConstituents(
    buildWikitableHtml({ rowCount: 520, tickerFor: uniqueTicker }),
    'sp500',
  );
  assertEquals(atMax.length, 520);
});

Deno.test('(4) positive: bounds boundary — sp400 at min (385) and max (415) accepted', () => {
  const atMin = parseWikipediaConstituents(
    buildWikitableHtml({ rowCount: 385, tickerFor: uniqueTicker }),
    'sp400',
  );
  assertEquals(atMin.length, 385);
  const atMax = parseWikipediaConstituents(
    buildWikitableHtml({ rowCount: 415, tickerFor: uniqueTicker }),
    'sp400',
  );
  assertEquals(atMax.length, 415);
});

// ─── Bounds-violation negatives ───────────────────────────────────────────

Deno.test('(5) bounds-negative: 40-row sp500 page throws ConstituentFetchError with count+bounds+skip-breakdown', () => {
  const html = buildWikitableHtml({ rowCount: 40, tickerFor: uniqueTicker });
  const err = assertThrows(
    () => parseWikipediaConstituents(html, 'sp500'),
    ConstituentFetchError,
  );
  // Forensic message must include actual count, bounds, and skip breakdown.
  assert(err.message.includes('40 tickers'), `missing count: ${err.message}`);
  assert(err.message.includes('490-520'), `missing bounds: ${err.message}`);
  assert(err.message.includes('skipped'), `missing skip-breakdown: ${err.message}`);
  assert(err.message.includes('ragged'), `missing ragged counter: ${err.message}`);
  assert(err.message.includes('empty'), `missing empty counter: ${err.message}`);
  assert(err.message.includes('regex-rejected'), `missing regex counter: ${err.message}`);
  assert(err.message.includes('layout likely changed'), `missing diagnostic hint: ${err.message}`);
  assertEquals(err.source, 'wikipedia');
  assertEquals(err.index, 'sp500');
});

Deno.test('(6) bounds-negative: 489 (just below sp500 min) throws', () => {
  const html = buildWikitableHtml({ rowCount: 489, tickerFor: uniqueTicker });
  assertThrows(
    () => parseWikipediaConstituents(html, 'sp500'),
    ConstituentFetchError,
    '489 tickers',
  );
});

Deno.test('(7) bounds-negative: 521 (just above sp500 max) throws', () => {
  const html = buildWikitableHtml({ rowCount: 521, tickerFor: uniqueTicker });
  assertThrows(
    () => parseWikipediaConstituents(html, 'sp500'),
    ConstituentFetchError,
    '521 tickers',
  );
});

Deno.test('(8) bounds-negative: 384 (just below sp400 min) throws', () => {
  const html = buildWikitableHtml({ rowCount: 384, tickerFor: uniqueTicker });
  assertThrows(
    () => parseWikipediaConstituents(html, 'sp400'),
    ConstituentFetchError,
    '384 tickers',
  );
});

// ─── Structural negatives (orphan-coverage completeness) ─────────────────

Deno.test('(9) structural-negative: no wikitable in HTML throws', () => {
  assertThrows(
    () => parseWikipediaConstituents('<html><body><p>no table here</p></body></html>', 'sp500'),
    ConstituentFetchError,
    'no wikitable found',
  );
});

Deno.test('(10) structural-negative: wikitable with no rows throws', () => {
  const html = '<table class="wikitable"></table>';
  assertThrows(
    () => parseWikipediaConstituents(html, 'sp500'),
    ConstituentFetchError,
    'no rows',
  );
});

Deno.test('(11) structural-negative: header row with no <th> cells throws', () => {
  // First row has only <td>s, not <th>s.
  const html = '<table class="wikitable"><tr><td>Symbol</td></tr><tr><td>AAPL</td></tr></table>';
  assertThrows(
    () => parseWikipediaConstituents(html, 'sp500'),
    ConstituentFetchError,
    'no <th>',
  );
});

Deno.test('(12) structural-negative: missing Symbol column in header throws', () => {
  const html = buildWikitableHtml({
    rowCount: 500,
    tickerFor: uniqueTicker,
    header: '<th>Company</th><th>Sector</th><th>HQ</th>',
  });
  assertThrows(
    () => parseWikipediaConstituents(html, 'sp500'),
    ConstituentFetchError,
    'Symbol column not found',
  );
});

// ─── Skip-counting behavior ───────────────────────────────────────────────

Deno.test('(13) skip-counting: regex-rejected rows are counted; if survivors stay in-bounds, no throw', () => {
  // 500 valid + 10 footnote-marker rows (regex-rejected: lowercase / digits-leading).
  const validRows = Array.from({ length: 500 }, (_, i) => {
    const t = uniqueTicker(i);
    return `<tr><td><a href="/wiki/${t}">${t}</a></td><td>${t} Corp</td><td>Tech</td></tr>`;
  });
  const junkRows = Array.from(
    { length: 10 },
    () => '<tr><td><a href="/wiki/x">[a]</a></td><td>footnote</td><td>Tech</td></tr>',
  );
  const html = `<table class="wikitable"><tr><th>Symbol</th><th>Security</th><th>GICS Sector</th></tr>${validRows.join('')}${junkRows.join('')}</table>`;
  const parsed = parseWikipediaConstituents(html, 'sp500');
  // 500 valid survive (in-bounds); junk rows silently skipped via regex.
  assertEquals(parsed.length, 500);
});

Deno.test('(14) skip-counting: when regex-rejection drops count below bounds, throw message reports the regex count', () => {
  // 40 valid + 100 regex-rejected → 40 survives → below sp500 min.
  const validRows = Array.from({ length: 40 }, (_, i) => {
    const t = uniqueTicker(i);
    return `<tr><td><a>${t}</a></td><td>x</td><td>Tech</td></tr>`;
  });
  const junkRows = Array.from(
    { length: 100 },
    () => '<tr><td><a>[1]</a></td><td>x</td><td>Tech</td></tr>',
  );
  const html = `<table class="wikitable"><tr><th>Symbol</th><th>Security</th><th>GICS Sector</th></tr>${validRows.join('')}${junkRows.join('')}</table>`;
  const err = assertThrows(
    () => parseWikipediaConstituents(html, 'sp500'),
    ConstituentFetchError,
  );
  assert(err.message.includes('40 tickers'), err.message);
  assert(err.message.includes('100 regex-rejected'), `expected 100 regex-rejected in: ${err.message}`);
});

Deno.test('(15) skip-counting: ragged rows (fewer cells than symbol column index) counted in message', () => {
  // Header: Name | Symbol | Sector  → symbolCol = 1. Rows with only 1 cell are ragged.
  const header = '<th>Name</th><th>Symbol</th><th>Sector</th>';
  const validRows = Array.from({ length: 30 }, (_, i) => {
    const t = uniqueTicker(i);
    return `<tr><td>${t} Co</td><td><a>${t}</a></td><td>Tech</td></tr>`;
  });
  const raggedRows = Array.from({ length: 5 }, () => '<tr><td>only one</td></tr>');
  const html = `<table class="wikitable"><tr>${header}</tr>${validRows.join('')}${raggedRows.join('')}</table>`;
  const err = assertThrows(
    () => parseWikipediaConstituents(html, 'sp500'),
    ConstituentFetchError,
  );
  // 5 hand-crafted ragged rows + 1 trailing post-</tr> chunk that also has
  // zero cells (rowChunks split artifact) = 6 ragged. The point of the
  // assertion is that the ragged counter is non-zero and reported; pin a
  // lower bound rather than the exact split-artifact count.
  const raggedMatch = err.message.match(/(\d+) ragged/);
  assert(raggedMatch, `expected "<N> ragged" in: ${err.message}`);
  assert(
    Number(raggedMatch[1]) >= 5,
    `expected ragged count >= 5, got: ${err.message}`,
  );
});

// ─── Fetcher wrapper sanity (HTTP path is covered by polygon/ishares pattern;
//     here we pin that bounds-throws propagate through the wrapper unchanged.) ─

Deno.test('(16) fetcher wrapper: bounds-violation thrown by parser propagates from fetchConstituents', async () => {
  const html = buildWikitableHtml({ rowCount: 40, tickerFor: uniqueTicker });
  const fetcher = new WikipediaConstituentFetcher(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => html,
    json: async () => ({}),
  }));
  let threw = false;
  try {
    await fetcher.fetchConstituents('sp500', AS_OF);
  } catch (e) {
    threw = true;
    assert(e instanceof ConstituentFetchError);
    assertEquals(e.source, 'wikipedia');
    assert(e.message.includes('40 tickers'));
  }
  assert(threw, 'expected bounds-violation to propagate from fetcher wrapper');
});

Deno.test('(17) fetcher wrapper: valid 500-row HTML returns UniverseConstituent[] with correct stamping', async () => {
  const html = buildWikitableHtml({ rowCount: 500, tickerFor: uniqueTicker });
  const fetcher = new WikipediaConstituentFetcher(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => html,
    json: async () => ({}),
  }));
  const rows = await fetcher.fetchConstituents('sp500', AS_OF);
  assert(rows !== null);
  assertEquals(rows!.length, 500);
  assert(rows!.every((r) => r.source === 'wikipedia'));
  assert(rows!.every((r) => r.index === 'sp500'));
  assert(rows!.every((r) => r.fetched_at.getTime() === AS_OF.getTime()));
  // FP-009 Bucket 0: sector populated from the fixture's "Tech" cells.
  assert(rows!.every((r) => r.gics_sector === 'Tech'));
});

// ─── FP-009 Bucket 0 — GICS sector plumbing ───────────────────────────────

Deno.test('(18) GICS sector: missing GICS Sector header throws ConstituentFetchError', () => {
  // Header has Symbol + Security but no GICS Sector column.
  const validRows = Array.from({ length: 500 }, (_, i) => {
    const t = uniqueTicker(i);
    return `<tr><td><a>${t}</a></td><td>${t} Corp</td></tr>`;
  });
  const html = `<table class="wikitable"><tr><th>Symbol</th><th>Security</th></tr>${validRows.join('')}</table>`;
  const err = assertThrows(
    () => parseWikipediaConstituents(html, 'sp500'),
    ConstituentFetchError,
  );
  assert(
    err.message.includes('GICS Sector column not found'),
    `expected GICS-Sector-column-not-found diagnostic: ${err.message}`,
  );
  assert(
    err.message.includes('layout likely changed'),
    `expected layout-changed hint: ${err.message}`,
  );
});

Deno.test('(19) GICS sector: row with empty sector cell yields gics_sector: null (typed-absence)', () => {
  // 500 valid + 1 row with empty sector cell. Both kept; empty one is typed-absent.
  const validRows = Array.from({ length: 499 }, (_, i) => {
    const t = uniqueTicker(i);
    return `<tr><td><a>${t}</a></td><td>${t} Corp</td><td>Tech</td></tr>`;
  });
  const blankSectorRow = '<tr><td><a>ZZZ</a></td><td>ZZZ Corp</td><td>   </td></tr>';
  const html =
    `<table class="wikitable"><tr><th>Symbol</th><th>Security</th><th>GICS Sector</th></tr>` +
    `${validRows.join('')}${blankSectorRow}</table>`;
  const parsed = parseWikipediaConstituents(html, 'sp500');
  assertEquals(parsed.length, 500);
  const zzz = parsed.find((p) => p.ticker === 'ZZZ');
  assert(zzz, 'ZZZ row should be present');
  assertEquals(zzz!.gics_sector, null);
  // Sanity: the 499 valid rows still carry their sector.
  const populated = parsed.filter((p) => p.gics_sector !== null);
  assertEquals(populated.length, 499);
});

Deno.test('(20) GICS sector: mixed-batch — multiple sectors propagate verbatim per row', () => {
  const sectors = ['Information Technology', 'Health Care', 'Financials', 'Energy'];
  const rows = Array.from({ length: 500 }, (_, i) => {
    const t = uniqueTicker(i);
    return `<tr><td><a>${t}</a></td><td>${t} Corp</td><td>${sectors[i % 4]}</td></tr>`;
  });
  const html =
    `<table class="wikitable"><tr><th>Symbol</th><th>Security</th><th>GICS Sector</th></tr>${rows.join('')}</table>`;
  const parsed = parseWikipediaConstituents(html, 'sp500');
  assertEquals(parsed.length, 500);
  // Each sector should appear exactly 125 times (500/4) verbatim.
  for (const s of sectors) {
    const count = parsed.filter((p) => p.gics_sector === s).length;
    assertEquals(count, 125, `expected 125 rows with sector "${s}", got ${count}`);
  }
});

Deno.test('(21) GICS sector: "Sector" alone (older S&P 400 revision header) is accepted', () => {
  const rows = Array.from({ length: 400 }, (_, i) => {
    const t = uniqueTicker(i);
    return `<tr><td><a>${t}</a></td><td>${t} Corp</td><td>Industrials</td></tr>`;
  });
  // Header uses "Sector" alone (no "GICS" prefix) — historical Wikipedia layout.
  const html =
    `<table class="wikitable"><tr><th>Symbol</th><th>Security</th><th>Sector</th></tr>${rows.join('')}</table>`;
  const parsed = parseWikipediaConstituents(html, 'sp400');
  assertEquals(parsed.length, 400);
  assert(parsed.every((p) => p.gics_sector === 'Industrials'));
});