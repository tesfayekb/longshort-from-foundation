// @ts-nocheck — Deno test file. FP-050 Phase 3.6b.ii″ — hand-computed
// fixture surface for the lifted load+compute module. Three load-bearing
// surfaces:
//   (A) §(h) preference key behavior:
//       - different-owner same-(issuer,transaction_date,transaction_seq)
//         rows BOTH survive (R1 collision proof — the regression fixture
//         that would have caught MIG-094's owner_cik schema gap had it
//         existed then; permanent forward sentinel per ACT-191).
//       - 4/A amendment with the SAME 4-part key supersedes the prior
//         Form-4 on `acceptance_datetime` lex order (verbatim FP-042
//         §(h) semantics, lifted from the deleted orchestrator).
//   (B) §(b) acceptance gate parity:
//       - SQL `WHERE acceptance_datetime <= as_of` is semantically
//         identical to the deleted orchestrator's in-memory strict-`>`
//         exclusion. The boundary pair (one row at acceptance===as_of
//         INCLUDED; one at as_of+1ms EXCLUDED) is asserted at the
//         stubbed-supabase boundary.
//   (C) 839 mass-balance invariant (universe-scope, name-level ledger):
//       `universe_size === persisted_count + skipped.length`.
//       Hand-computed z-score for a two-ticker same-sector universe:
//       z = ±√2/2 ≈ ±0.7071 (sample-std n=1 → |v1-v2|/√2 → ±sign).
import {
  assert,
  assertEquals,
  assertAlmostEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createInsiderLoadAndCompute,
  mapInsiderRowToForm4Row,
  preferMostRecentAccession,
  readInsiderRowsWindow,
  SIGNAL_ID,
  WINDOW_DAYS,
  type InsiderRowFromTable,
} from './insider-load-and-compute.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF = new Date('2026-06-12T21:00:00.000Z');
const AS_OF_ISO = AS_OF.toISOString();
const AS_OF_DATE = '2026-06-12';
const LATEST_SNAPSHOT = '2026-06-12';

function row(over: Partial<InsiderRowFromTable> = {}): InsiderRowFromTable {
  return {
    issuer_cik: '0000320193',
    owner_cik: '0001234567',
    accession_number: '0000320193-26-000001',
    transaction_seq: 0,
    transaction_date: '2026-06-12',
    acceptance_datetime: '2026-06-12T16:00:00.000Z',
    transaction_code: 'P',
    transaction_acquired_disposed: 'A',
    transaction_shares: 1000,
    transaction_price_per_share: 50,
    aff_10b5_one: false,
    is_director: false,
    is_officer: true,
    is_ten_percent_owner: false,
    officer_title: 'Chief Executive Officer',
    ticker: 'AAPL',
    ...over,
  };
}

// ── (A.1) Different-owner regression — R1 collision proof ──────────────
Deno.test('(A.1) preferMostRecentAccession: different-owner same-(issuer,date,seq) BOTH survive', () => {
  // Two officers at the same issuer trade on the same date. The
  // transaction_seq is 0-indexed PER FILING (not globally), so two
  // separate Form-4 filings (one per owner) both legitimately carry
  // seq=0. A 3-part dedup key would silently collide them — the R1
  // option the Q-E ruling permanently falsified. With the 4-part key
  // including owner_cik, BOTH rows survive.
  const ceo = row({
    owner_cik: '0001111111',
    accession_number: '0000320193-26-000010',
    officer_title: 'Chief Executive Officer',
    transaction_shares: 1000,
  });
  const cfo = row({
    owner_cik: '0002222222',
    accession_number: '0000320193-26-000011',
    officer_title: 'Chief Financial Officer',
    transaction_shares: 2000,
  });
  // Same (issuer, transaction_date, transaction_seq) — only owner differs.
  assertEquals(ceo.issuer_cik, cfo.issuer_cik);
  assertEquals(ceo.transaction_date, cfo.transaction_date);
  assertEquals(ceo.transaction_seq, cfo.transaction_seq);
  const out = preferMostRecentAccession([ceo, cfo]);
  assertEquals(out.length, 2, 'BOTH owners survive — R1 collision falsified');
  const owners = out.map((r) => r.owner_cik).sort();
  assertEquals(owners, ['0001111111', '0002222222']);
});

// ── (A.2) 4/A amendment supersedes on acceptance_datetime ──────────────
Deno.test('(A.2) preferMostRecentAccession: 4/A amendment supersedes prior 4 on acceptance lex order', () => {
  const original = row({
    accession_number: '0000320193-26-000020',
    acceptance_datetime: '2026-06-10T16:00:00.000Z',
    transaction_shares: 1000,
  });
  const amendment = row({
    accession_number: '0000320193-26-000021', // 4/A — different accession
    acceptance_datetime: '2026-06-11T18:00:00.000Z',
    transaction_shares: 1500, // corrected share count
  });
  // SAME 4-part key (issuer, owner, transaction_date, transaction_seq).
  const out = preferMostRecentAccession([original, amendment]);
  assertEquals(out.length, 1, 'amendment supersedes original — one survivor');
  assertEquals(out[0].transaction_shares, 1500, 'the corrected (later) row wins');
  assertEquals(out[0].acceptance_datetime, '2026-06-11T18:00:00.000Z');
});

// ── (B) §(b) acceptance-gate parity via readInsiderRowsWindow ──────────
/** A faithful stub of the supabase query-builder chain used by
 *  `readInsiderRowsWindow`. Honors `.in('ticker',...)`, `.gte('transaction_date',...)`,
 *  `.lte('acceptance_datetime',...)`, and `.range(offset, end)` filters
 *  against an in-memory row list, so the SQL `WHERE` semantics are
 *  exercised verbatim (parity by construction). */
function makeSupabaseForReads(rows: InsiderRowFromTable[]) {
  const calls: { fn: string; args: unknown[] }[] = [];
  return {
    calls,
    from(table: string) {
      calls.push({ fn: 'from', args: [table] });
      assertEquals(table, 'insider_form4_rows');
      let filtered = rows.slice();
      let rangeStart = 0;
      let rangeEnd = Number.POSITIVE_INFINITY;
      const b: Record<string, unknown> = {
        select() { return b; },
        in(col: string, vals: string[]) {
          calls.push({ fn: 'in', args: [col, vals] });
          filtered = filtered.filter((r) => vals.includes((r as Record<string, unknown>)[col] as string));
          return b;
        },
        gte(col: string, v: string) {
          calls.push({ fn: 'gte', args: [col, v] });
          filtered = filtered.filter((r) => String((r as Record<string, unknown>)[col]) >= v);
          return b;
        },
        lte(col: string, v: string) {
          calls.push({ fn: 'lte', args: [col, v] });
          filtered = filtered.filter((r) => String((r as Record<string, unknown>)[col]) <= v);
          return b;
        },
        order() { return b; },
        range(start: number, end: number) {
          rangeStart = start;
          rangeEnd = end;
          const slice = filtered.slice(rangeStart, rangeEnd + 1);
          return Promise.resolve({ data: slice, error: null });
        },
      };
      return b;
    },
  };
}

Deno.test('(B.1) §(b) boundary pair: acceptance === as_of INCLUDED; acceptance > as_of EXCLUDED', async () => {
  const included = row({
    accession_number: 'INC',
    acceptance_datetime: AS_OF_ISO, // exactly equal — `<=` keeps it
    transaction_date: AS_OF_DATE,
  });
  const excluded = row({
    accession_number: 'EXC',
    acceptance_datetime: '2026-06-12T21:00:00.001Z', // 1ms past — `<=` drops it
    transaction_date: AS_OF_DATE,
  });
  const supabase = makeSupabaseForReads([included, excluded]);
  const out = await readInsiderRowsWindow(supabase as never, ['AAPL'], AS_OF);
  const accs = out.map((r) => r.accession_number).sort();
  assertEquals(accs, ['INC'], 'boundary equality included; +1ms past excluded');
  // Parity assertion at the call site: the SQL WHERE was issued as `<=`
  // against `acceptance_datetime` with the as_of ISO string.
  const lte = supabase.calls.find((c) => c.fn === 'lte');
  assertEquals(lte!.args, ['acceptance_datetime', AS_OF_ISO]);
});

Deno.test('(B.2) 90-day transaction_date window applied as `gte` filter', async () => {
  const inWindow = row({
    accession_number: 'IN',
    transaction_date: '2026-03-14', // exactly 90 days back from 2026-06-12
  });
  const outOfWindow = row({
    accession_number: 'OUT',
    transaction_date: '2026-03-13', // 91 days back — dropped
  });
  const supabase = makeSupabaseForReads([inWindow, outOfWindow]);
  const out = await readInsiderRowsWindow(supabase as never, ['AAPL'], AS_OF);
  const accs = out.map((r) => r.accession_number).sort();
  assertEquals(accs, ['IN']);
  const gte = supabase.calls.find((c) => c.fn === 'gte');
  assertEquals(gte!.args[0], 'transaction_date');
  // Boundary value: as_of − WINDOW_DAYS expressed as YYYY-MM-DD.
  const expected = new Date(AS_OF.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  assertEquals(gte!.args[1], expected);
});

// ── (C) End-to-end 839 mass-balance + hand-computed z-score ────────────
/** Composite supabase stub for the loadAndCompute roundtrip: universe
 *  reads + insider_form4_rows reads + signal_observations upsert. */
function makeSupabaseE2E(opts: {
  universe: Array<{ ticker: string; gics_sector: string | null }>;
  rows: InsiderRowFromTable[];
}) {
  const upserts: Record<string, unknown>[][] = [];
  return {
    upserts,
    from(table: string) {
      if (table === 'universe_membership') {
        let mode: 'latest' | 'rows' = 'rows';
        const b: Record<string, unknown> = {
          select(cols: string) { mode = cols === 'as_of_date' ? 'latest' : 'rows'; return b; },
          eq() { return b; },
          order() { return b; },
          limit() { return resolve(); },
          then(onF: unknown, onR: unknown) { return resolve().then(onF as never, onR as never); },
        };
        const resolve = () => mode === 'latest'
          ? Promise.resolve({ data: opts.universe.length > 0 ? [{ as_of_date: LATEST_SNAPSHOT }] : [], error: null })
          : Promise.resolve({ data: opts.universe, error: null });
        return b;
      }
      if (table === 'insider_form4_rows') {
        let filtered = opts.rows.slice();
        const b: Record<string, unknown> = {
          select() { return b; },
          in(col: string, vals: string[]) {
            filtered = filtered.filter((r) => vals.includes((r as Record<string, unknown>)[col] as string));
            return b;
          },
          gte(col: string, v: string) {
            filtered = filtered.filter((r) => String((r as Record<string, unknown>)[col]) >= v);
            return b;
          },
          lte(col: string, v: string) {
            filtered = filtered.filter((r) => String((r as Record<string, unknown>)[col]) <= v);
            return b;
          },
          order() { return b; },
          range(start: number, end: number) {
            return Promise.resolve({ data: filtered.slice(start, end + 1), error: null });
          },
        };
        return b;
      }
      if (table === 'signal_observations') {
        return {
          upsert(payload: Record<string, unknown>[]) {
            upserts.push(payload);
            return Promise.resolve({ error: null, count: payload.length });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function makeShares(behaviors: Record<string, { kind: 'shares'; shares: number } | { kind: 'unavailable'; reason: string }> = {}) {
  return {
    async fetchShares(ticker: string) {
      return behaviors[ticker] ?? { kind: 'shares' as const, shares: 1_000_000_000 };
    },
  };
}
function makePrice(behaviors: Record<string, { close: number } | undefined> = {}) {
  return {
    async fetchPriceHistory(ticker: string) {
      const b = behaviors[ticker];
      return [{ ts: AS_OF_DATE, close: (b?.close) ?? 100 }];
    },
  };
}

Deno.test('(C.1) end-to-end: 839 mass-balance invariant + hand-computed z-score (±√2/2)', async () => {
  // Universe of 5 tickers in two sectors. Two tickers in the same sector
  // ('Tech') receive one qualifying P/S row each → both produce values,
  // sample-std n=2 → z-scores = ±√2/2 exactly. The other three tickers
  // produce three distinct typed skips covering the consumer-name-level
  // ledger axis (mass-balance: 5 = 2 + 3).
  const universe = [
    { ticker: 'AAPL', gics_sector: 'Tech' },
    { ticker: 'MSFT', gics_sector: 'Tech' },
    { ticker: 'NORW', gics_sector: 'Tech' },     // no rows → no_qualifying_transactions
    { ticker: 'DELI', gics_sector: 'Tech' },     // shares unavailable
    { ticker: 'NOPR', gics_sector: 'Tech' },     // qualifying row but price empty
  ];
  const rows: InsiderRowFromTable[] = [
    row({
      ticker: 'AAPL',
      issuer_cik: '0000320193',
      owner_cik: '0001111111',
      transaction_code: 'P',                 // purchase (bullish)
      transaction_acquired_disposed: 'A',
      transaction_shares: 1000,
      transaction_price_per_share: 50,
      officer_title: 'Chief Executive Officer',
      aff_10b5_one: false,
    }),
    row({
      ticker: 'MSFT',
      issuer_cik: '0000789019',
      owner_cik: '0002222222',
      accession_number: '0000789019-26-000001',
      transaction_code: 'S',                 // discretionary sale (bearish)
      transaction_acquired_disposed: 'D',
      transaction_shares: 2000,
      transaction_price_per_share: 60,
      officer_title: 'Chief Executive Officer',
      aff_10b5_one: false,                   // discretionary — INCLUDED
    }),
    row({
      ticker: 'NOPR',
      issuer_cik: '0000111111',
      owner_cik: '0003333333',
      accession_number: '0000111111-26-000001',
      transaction_code: 'P',
      transaction_acquired_disposed: 'A',
      transaction_shares: 500,
      transaction_price_per_share: 25,
      officer_title: 'Chief Executive Officer',
    }),
  ];
  const supabase = makeSupabaseE2E({ universe, rows });
  const ctx = {
    supabase: supabase as never,
    operator_id: OPERATOR_ID,
    sharesOutstanding: makeShares({
      DELI: { kind: 'unavailable', reason: 'no_data' },
    }) as never,
    priceHistory: {
      async fetchPriceHistory(ticker: string) {
        if (ticker === 'NOPR') return [];
        return [{ ts: AS_OF_DATE, close: 100 }];
      },
    } as never,
    concurrency: 1,
  };
  const result = await createInsiderLoadAndCompute(ctx).run(AS_OF);

  // Mass-balance: universe_size = persisted_count + skipped.length.
  assertEquals(result.outcome, 'completed');
  assertEquals(result.universe_size, 5, 'universe size');
  assertEquals(result.persisted_count, 2, 'two values persisted (AAPL+MSFT)');
  assertEquals(result.skipped.length, 3, 'three skips (NORW+DELI+NOPR)');
  assertEquals(
    result.universe_size,
    result.persisted_count + result.skipped.length,
    '839 mass-balance invariant (consumer-scope ledger)',
  );

  // Skip taxonomy.
  const reasons = result.skipped.map((s) => `${s.ticker}:${s.reason}`).sort();
  assertEquals(reasons, [
    'DELI:missing_shares_outstanding',
    'NOPR:data_unavailable',
    'NORW:no_qualifying_transactions',
  ]);

  // Hand-computed z-score for the two-ticker Tech sector. For n=2 sample
  // std, z(v_i) = (v_i - mean) / std = sign(v_i - v_other) × √2/2 exactly,
  // independent of raw_signal magnitudes (a property of n=2 sample std).
  const payload = supabase.upserts[0];
  assertEquals(payload.length, 2);
  const byTicker = new Map(payload.map((p) => [p.ticker, p]));
  const aapl = byTicker.get('AAPL')!;
  const msft = byTicker.get('MSFT')!;
  // AAPL = positive raw (purchase) → z = +√2/2; MSFT = negative raw → -√2/2.
  assertAlmostEquals(aapl.value as number, Math.SQRT2 / 2, 1e-12);
  assertAlmostEquals(msft.value as number, -Math.SQRT2 / 2, 1e-12);
  assertEquals(aapl.signal_id, SIGNAL_ID);
  assertEquals(aapl.is_present, true);
  assertEquals(aapl.as_of_date, AS_OF_DATE);
  assertEquals(result.not_yet_knowable_excluded, 0,
    'producer-side surface per Q4 two-ledger; consumer slot pinned at 0');
});

// ── (D) Seam mapper trivia — exercise nullable coercions ───────────────
Deno.test('(D.1) mapInsiderRowToForm4Row coerces null price/title without crashing compute', () => {
  const out = mapInsiderRowToForm4Row(row({
    transaction_price_per_share: null,
    officer_title: null,
  }));
  assertEquals(out.record_type, 'transaction');
  assertEquals(out.transaction_price_per_share, 0);
  assertEquals(out.officer_title, '');
});

// ── (E) Empty-universe guard ───────────────────────────────────────────
Deno.test('(E.1) empty universe → outcome=failed, failure_reason=empty_universe', async () => {
  const supabase = makeSupabaseE2E({ universe: [], rows: [] });
  const result = await createInsiderLoadAndCompute({
    supabase: supabase as never,
    operator_id: OPERATOR_ID,
    sharesOutstanding: makeShares() as never,
    priceHistory: makePrice() as never,
  }).run(AS_OF);
  assertEquals(result.outcome, 'failed');
  assertEquals(result.failure_reason, 'empty_universe');
  assertEquals(result.universe_size, 0);
  assertEquals(result.persisted_count, 0);
});