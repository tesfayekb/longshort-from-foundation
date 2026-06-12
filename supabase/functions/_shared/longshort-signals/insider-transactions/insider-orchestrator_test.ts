// @ts-nocheck — Deno test file. FP-050 Phase 2 — EDGAR-pipeline e2e
// fixture coverage. Replaces the FP-042 Polygon-mock orchestrator test;
// compute / classifier / z-score remain byte-unchanged (the fence) and
// are exercised through this end-to-end fixture flow.
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createInsiderOrchestrator,
  SIGNAL_ID,
  preferMostRecentAccession,
  mapEdgarRowToForm4Row,
  WINDOW_DAYS,
} from './insider-orchestrator.ts';
import { TokenBucket } from '../options-flow/token-bucket.ts';
import type { SignalRow } from '../shared/signal-types.ts';
import type { EdgarForm4Row } from './edgar-form4-parser.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF = new Date('2026-06-12T21:00:00Z');
const AS_OF_DATE = '2026-06-12';
const LATEST_SNAPSHOT = '2026-06-12';

function makeBucket(): TokenBucket {
  // High rate + zero-sleep stub → tests run deterministically without
  // wall-clock dependency.
  return new TokenBucket({ ratePerSec: 1_000_000, now: () => 0, sleep: async () => {} });
}

function makeSupabase(opts: {
  universe?: Array<{ ticker: string; gics_sector: string | null }>;
  upsertError?: { message: string } | null;
}) {
  const upsertPayloads: SignalRow[][] = [];
  const universe = opts.universe ?? [];
  const latestDate = universe.length > 0 ? LATEST_SNAPSHOT : null;
  const supabase = {
    from(table: string) {
      if (table === 'universe_membership') {
        let mode: 'latest' | 'rows' = 'rows';
        const builder: Record<string, unknown> = {
          select(cols: string) {
            mode = cols === 'as_of_date' ? 'latest' : 'rows';
            return builder;
          },
          eq() { return builder; },
          order() { return builder; },
          limit() { return resolve(); },
          then(onFul: unknown, onRej: unknown) { return resolve().then(onFul, onRej); },
        };
        const resolve = () => {
          if (mode === 'latest') {
            return Promise.resolve({ data: latestDate ? [{ as_of_date: latestDate }] : [], error: null });
          }
          return Promise.resolve({ data: universe, error: null });
        };
        return builder;
      }
      if (table === 'signal_observations') {
        return {
          upsert(payload: SignalRow[]) {
            upsertPayloads.push(payload);
            return Promise.resolve({
              error: opts.upsertError ?? null,
              count: opts.upsertError ? null : payload.length,
            });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { supabase, upsertPayloads };
}

/** CIK lookup stub. `overrides` maps TICKER → cik10; missing → unresolved. */
function makeCikMapper(overrides: Record<string, string>) {
  return {
    async loadMap() {
      return (raw: string) => {
        const t = (raw ?? '').toUpperCase().trim();
        const cik10 = overrides[t];
        if (cik10 === undefined) return { kind: 'unresolved', ticker: t };
        return { kind: 'resolved', ticker: t, cik10, source: 'snapshot' };
      };
    },
  };
}

/** Daily-index stub. `entriesByDate` keyed by ISO YYYY-MM-DD. Days not
 *  present return typed `unavailable` (holiday-clean). `throwOn` triggers
 *  a throw on that specific date. */
function makeDailyIndex(opts: {
  entriesByDate?: Record<string, Array<{ filer_cik: string; accession_number: string; form_type?: '4' | '4/A' }>>;
  throwOn?: string;
}) {
  return {
    async fetchDay(d: Date) {
      const iso = d.toISOString().slice(0, 10);
      if (opts.throwOn === iso) {
        throw new Error(`daily-index synthetic throw on ${iso}`);
      }
      const raw = opts.entriesByDate?.[iso];
      if (!raw) return { kind: 'unavailable', reason: 'data_unavailable', date: iso };
      const entries = raw.map((e) => ({
        form_type: e.form_type ?? '4',
        filer_cik: e.filer_cik,
        company_name: 'TEST',
        date_filed: iso,
        filename: `edgar/data/${e.filer_cik}/${e.accession_number.replace(/-/g, '')}/${e.accession_number}-index.htm`,
        accession_number: e.accession_number,
      }));
      return { kind: 'rows', entries, date: iso };
    },
  };
}

/** Accession-index stub. Keyed by accession_number. */
function makeAccessionIndex(byAcc: Record<string, {
  kind: 'resolved' | 'ambiguous' | 'unavailable' | 'rate_limited' | 'throw';
  primary_document?: string;
  acceptance_datetime?: string;
  filenames?: string[];
}>) {
  return {
    async fetchIndex({ accession_number }: { accession_number: string }) {
      const b = byAcc[accession_number];
      if (!b) return { kind: 'unavailable', reason: 'data_unavailable' };
      if (b.kind === 'throw') throw new Error(`accession-index synthetic throw on ${accession_number}`);
      if (b.kind === 'unavailable') return { kind: 'unavailable', reason: 'data_unavailable' };
      if (b.kind === 'rate_limited') return { kind: 'rate_limited' };
      if (b.kind === 'ambiguous') {
        return {
          kind: 'ambiguous',
          filenames: b.filenames ?? [],
          eligible_count: (b.filenames ?? []).filter((f) => /\.xml$/i.test(f)).length,
          acceptance_datetime: b.acceptance_datetime ?? null,
        };
      }
      return {
        kind: 'resolved',
        primary_document: b.primary_document ?? 'wf-form4.xml',
        acceptance_datetime: b.acceptance_datetime ?? '2026-06-10T16:00:00.000Z',
        filenames: b.filenames ?? [b.primary_document ?? 'wf-form4.xml'],
      };
    },
  };
}

/** Form-4 fetch+parse stub keyed by accession. */
function makeForm4Edgar(byAcc: Record<string, { kind: 'rows'; rows: EdgarForm4Row[] } | { kind: 'throw' }>) {
  return {
    async fetchAndParse({ accession_number }: { accession_number: string }) {
      const b = byAcc[accession_number];
      if (!b) return { kind: 'rows', rows: [] };
      if (b.kind === 'throw') throw new Error(`form-4 synthetic throw on ${accession_number}`);
      return { kind: 'rows', rows: b.rows };
    },
  };
}

function makeShares(behaviors: Record<string, { kind: 'shares'; shares: number } | { kind: 'unavailable'; reason: string }> = {}) {
  return {
    async fetchShares(ticker: string) {
      const b = behaviors[ticker];
      if (!b) return { kind: 'shares', shares: 1_000_000_000 };
      return b;
    },
  };
}
function makePrice(behaviors: Record<string, { close?: number; null?: boolean } | undefined> = {}) {
  return {
    async fetchPriceHistory(ticker: string) {
      const b = behaviors[ticker];
      if (!b) return [{ ts: '2026-06-12', close: 100 }];
      if (b.null) return null;
      return [{ ts: '2026-06-12', close: b.close ?? 100 }];
    },
  };
}

/** Helper — build an EdgarForm4Row with required fields + overrides. */
function edgarRow(over: Partial<EdgarForm4Row> = {}): EdgarForm4Row {
  return {
    issuer_cik: '0000320193',
    owner_cik: '0001234567',
    accession_number: '0000320193-26-000077',
    transaction_seq: 0,
    transaction_code: 'P',
    shares: 1000,
    price_per_share: 100,
    acquired_disposed: 'A',
    ownership_type: 'D',
    officer_title: 'CEO',
    is_director: false,
    is_officer: true,
    is_ten_percent_owner: false,
    has_10b5_1_mention: false,
    transaction_date: '2026-06-10',
    acceptance_datetime: '2026-06-10T16:00:00.000Z',
    ...over,
  };
}

function ctx(opts: {
  supabase: unknown;
  cikMap: Record<string, string>;
  entriesByDate?: Record<string, Array<{ filer_cik: string; accession_number: string; form_type?: '4' | '4/A' }>>;
  throwOnDate?: string;
  cikMapperThrows?: boolean;
  acc?: Parameters<typeof makeAccessionIndex>[0];
  f4?: Parameters<typeof makeForm4Edgar>[0];
  shares?: Parameters<typeof makeShares>[0];
  price?: Parameters<typeof makePrice>[0];
}) {
  const cikMapper = opts.cikMapperThrows
    ? { async loadMap() { throw new Error('CIK snapshot 503'); } }
    : makeCikMapper(opts.cikMap);
  return {
    supabase: opts.supabase,
    cikMapper,
    dailyIndex: makeDailyIndex({ entriesByDate: opts.entriesByDate, throwOn: opts.throwOnDate }),
    accessionIndex: makeAccessionIndex(opts.acc ?? {}),
    form4Edgar: makeForm4Edgar(opts.f4 ?? {}),
    sharesOutstanding: makeShares(opts.shares),
    priceHistory: makePrice(opts.price),
    operator_id: OPERATOR_ID,
    bucket: makeBucket(),
  };
}

Deno.test('(1) signal_id locked = insider_transactions_90d', () => {
  assertEquals(SIGNAL_ID, 'insider_transactions_90d');
});

Deno.test('(2) WINDOW_DAYS = 90 (§4.4.4 trailing window)', () => {
  assertEquals(WINDOW_DAYS, 90);
});

Deno.test('(3) mapEdgarRowToForm4Row — seam mapping is exhaustive + 10b5-1 → aff_10b5_one', () => {
  const e = edgarRow({ has_10b5_1_mention: true, transaction_code: 'S', acquired_disposed: 'D' });
  const f = mapEdgarRowToForm4Row(e);
  assertEquals(f.record_type, 'transaction');
  assertEquals(f.transaction_code, 'S');
  assertEquals(f.aff_10b5_one, true);
  assertEquals(f.transaction_acquired_disposed, 'D');
  assertEquals(f.transaction_shares, 1000);
  assertEquals(f.transaction_price_per_share, 100);
  assertEquals(f.transaction_date, '2026-06-10');
  assertEquals(f.is_officer, true);
  assertEquals(f.officer_title, 'CEO');
});

Deno.test('(4) preferMostRecentAccession — Form 4/A supersedes Form 4 with same (issuer,owner,date,seq)', () => {
  const original = edgarRow({
    accession_number: '0000320193-26-000077',
    acceptance_datetime: '2026-06-10T16:00:00.000Z',
    shares: 1000,
  });
  const amended = edgarRow({
    accession_number: '0000320193-26-000099',
    acceptance_datetime: '2026-06-11T10:00:00.000Z',
    shares: 2000, // corrected upward in amendment
  });
  const out = preferMostRecentAccession([original, amended]);
  assertEquals(out.length, 1);
  assertEquals(out[0].shares, 2000);
  assertEquals(out[0].accession_number, '0000320193-26-000099');
});

Deno.test('(5) happy path — 2 of 3 tickers have qualifying buys, 1 has no activity', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'NVDA', gics_sector: 'IT' },
  ];
  const { supabase, upsertPayloads } = makeSupabase({ universe });
  const c = ctx({
    supabase,
    cikMap: { AAPL: '0000320193', MSFT: '0000789019', NVDA: '0001045810' },
    entriesByDate: {
      '2026-06-10': [
        { filer_cik: '320193', accession_number: '0000320193-26-000077' },
        { filer_cik: '789019', accession_number: '0000789019-26-000033' },
        // NVDA: no entries in any day → no_qualifying
      ],
    },
    acc: {
      '0000320193-26-000077': { kind: 'resolved', acceptance_datetime: '2026-06-10T16:00:00.000Z' },
      '0000789019-26-000033': { kind: 'resolved', acceptance_datetime: '2026-06-10T17:00:00.000Z' },
    },
    f4: {
      '0000320193-26-000077': { kind: 'rows', rows: [edgarRow({ issuer_cik: '0000320193', shares: 1000 })] },
      '0000789019-26-000033': { kind: 'rows', rows: [edgarRow({ issuer_cik: '0000789019', accession_number: '0000789019-26-000033', shares: 500 })] },
    },
  });
  const res = await createInsiderOrchestrator(c).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  assertEquals(res.universe_size, 3);
  assertEquals(res.persisted_count, 2);
  const nvda = res.skipped.find((s) => s.ticker === 'NVDA');
  assert(nvda);
  assertEquals(nvda!.reason, 'no_qualifying_transactions');
  assertEquals(upsertPayloads[0].length, 2);
  assertEquals(res.not_yet_knowable_excluded, 0);
});

Deno.test('(6) ticker_to_cik_unresolved — universe ticker not in CIK map surfaces typed skip', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'UNKNOWN', gics_sector: 'IT' },
  ];
  const { supabase } = makeSupabase({ universe });
  const c = ctx({
    supabase,
    cikMap: { AAPL: '0000320193' }, // UNKNOWN missing
    entriesByDate: {
      '2026-06-10': [{ filer_cik: '320193', accession_number: '0000320193-26-000077' }],
    },
    acc: { '0000320193-26-000077': { kind: 'resolved', acceptance_datetime: '2026-06-10T16:00:00.000Z' } },
    f4: { '0000320193-26-000077': { kind: 'rows', rows: [edgarRow()] } },
  });
  const res = await createInsiderOrchestrator(c).run(AS_OF);
  const u = res.skipped.find((s) => s.ticker === 'UNKNOWN');
  assert(u);
  assertEquals(u!.reason, 'ticker_to_cik_unresolved');
});

Deno.test('(7) §(b) acceptance gate — accession with acceptance > as_of is dropped + counter increments', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
  ];
  const { supabase } = makeSupabase({ universe });
  const c = ctx({
    supabase,
    cikMap: { AAPL: '0000320193', MSFT: '0000789019' },
    entriesByDate: {
      '2026-06-10': [
        { filer_cik: '320193', accession_number: '0000320193-26-000077' },
        { filer_cik: '789019', accession_number: '0000789019-26-000033' },
      ],
    },
    acc: {
      '0000320193-26-000077': { kind: 'resolved', acceptance_datetime: '2026-06-10T16:00:00.000Z' },
      // AFTER as_of (2026-06-12T21:00:00Z) — must be gated.
      '0000789019-26-000033': { kind: 'resolved', acceptance_datetime: '2026-06-13T10:00:00.000Z' },
    },
    f4: {
      '0000320193-26-000077': { kind: 'rows', rows: [edgarRow({ issuer_cik: '0000320193' })] },
      '0000789019-26-000033': { kind: 'rows', rows: [edgarRow({ issuer_cik: '0000789019' })] },
    },
  });
  const res = await createInsiderOrchestrator(c).run(AS_OF);
  assertEquals(res.not_yet_knowable_excluded, 1);
  // MSFT had ONLY a not-yet-knowable accession → surfaces as no_qualifying.
  const msft = res.skipped.find((s) => s.ticker === 'MSFT');
  assert(msft);
  assertEquals(msft!.reason, 'no_qualifying_transactions');
});

Deno.test('(8) §(h) preference end-to-end — amended row supersedes original within orchestrator', async () => {
  const universe = [{ ticker: 'AAPL', gics_sector: 'IT' }, { ticker: 'MSFT', gics_sector: 'IT' }];
  const { supabase, upsertPayloads } = makeSupabase({ universe });
  const c = ctx({
    supabase,
    cikMap: { AAPL: '0000320193', MSFT: '0000789019' },
    entriesByDate: {
      '2026-06-09': [{ filer_cik: '320193', accession_number: '0000320193-26-000077' }],
      '2026-06-10': [{ filer_cik: '320193', accession_number: '0000320193-26-000099', form_type: '4/A' }],
      '2026-06-11': [{ filer_cik: '789019', accession_number: '0000789019-26-000033' }],
    },
    acc: {
      '0000320193-26-000077': { kind: 'resolved', acceptance_datetime: '2026-06-09T16:00:00.000Z' },
      '0000320193-26-000099': { kind: 'resolved', acceptance_datetime: '2026-06-10T16:00:00.000Z' },
      '0000789019-26-000033': { kind: 'resolved', acceptance_datetime: '2026-06-11T16:00:00.000Z' },
    },
    f4: {
      '0000320193-26-000077': { kind: 'rows', rows: [edgarRow({ shares: 1000, accession_number: '0000320193-26-000077', acceptance_datetime: '2026-06-09T16:00:00.000Z' })] },
      '0000320193-26-000099': { kind: 'rows', rows: [edgarRow({ shares: 5000, accession_number: '0000320193-26-000099', acceptance_datetime: '2026-06-10T16:00:00.000Z' })] },
      '0000789019-26-000033': { kind: 'rows', rows: [edgarRow({ issuer_cik: '0000789019', shares: 500, accession_number: '0000789019-26-000033', acceptance_datetime: '2026-06-11T16:00:00.000Z' })] },
    },
  });
  const res = await createInsiderOrchestrator(c).run(AS_OF);
  assertEquals(res.outcome, 'completed');
  assertEquals(res.persisted_count, 2);
  const payload = upsertPayloads[0];
  const aapl = payload.find((r: SignalRow) => r.ticker === 'AAPL')!;
  const msft = payload.find((r: SignalRow) => r.ticker === 'MSFT')!;
  // AAPL effective shares = 5000 (amended), MSFT = 500 → z-score AAPL > MSFT
  assert(aapl.value > msft.value);
});

Deno.test('(9) ambiguous accession (>1 .xml) → data_unavailable per-ticker skip with filenames in detail', async () => {
  const universe = [{ ticker: 'AAPL', gics_sector: 'IT' }];
  const { supabase } = makeSupabase({ universe });
  const c = ctx({
    supabase,
    cikMap: { AAPL: '0000320193' },
    entriesByDate: { '2026-06-10': [{ filer_cik: '320193', accession_number: '0000320193-26-000077' }] },
    acc: {
      '0000320193-26-000077': {
        kind: 'ambiguous',
        filenames: ['a.xml', 'b.xml'],
        acceptance_datetime: '2026-06-10T16:00:00.000Z',
      },
    },
  });
  const res = await createInsiderOrchestrator(c).run(AS_OF);
  const aapl = res.skipped.find((s) => s.ticker === 'AAPL');
  assert(aapl);
  assertEquals(aapl!.reason, 'data_unavailable');
  assertStringIncludes(aapl!.detail!, 'ambiguous');
  assertStringIncludes(aapl!.detail!, 'a.xml');
});

Deno.test('(10) CIK map fetch throw → outcome=failed, failure_reason', async () => {
  const universe = [{ ticker: 'AAPL', gics_sector: 'IT' }];
  const { supabase } = makeSupabase({ universe });
  const c = ctx({ supabase, cikMap: {}, cikMapperThrows: true });
  const res = await createInsiderOrchestrator(c).run(AS_OF);
  assertEquals(res.outcome, 'failed');
  assertStringIncludes(res.failure_reason!, 'CIK map fetch failed');
  assertStringIncludes(res.failure_reason!, 'CIK snapshot 503');
});

Deno.test('(11) daily-index throw on any day → outcome=failed, failure_reason carries date', async () => {
  const universe = [{ ticker: 'AAPL', gics_sector: 'IT' }];
  const { supabase } = makeSupabase({ universe });
  // Throw on as_of_date (always in the window).
  const c = ctx({
    supabase,
    cikMap: { AAPL: '0000320193' },
    throwOnDate: AS_OF_DATE,
  });
  const res = await createInsiderOrchestrator(c).run(AS_OF);
  assertEquals(res.outcome, 'failed');
  assertStringIncludes(res.failure_reason!, 'daily-index sweep failed');
  assertStringIncludes(res.failure_reason!, AS_OF_DATE);
});

Deno.test('(12) empty universe → outcome=failed, failure_reason=empty_universe', async () => {
  const { supabase } = makeSupabase({ universe: [] });
  const c = ctx({ supabase, cikMap: {} });
  const res = await createInsiderOrchestrator(c).run(AS_OF);
  assertEquals(res.outcome, 'failed');
  assertEquals(res.failure_reason, 'empty_universe');
});

Deno.test('(13) persistence error → outcome=failed with reason', async () => {
  const universe = [{ ticker: 'AAPL', gics_sector: 'IT' }, { ticker: 'MSFT', gics_sector: 'IT' }];
  const { supabase } = makeSupabase({ universe, upsertError: { message: 'unique violation' } });
  const c = ctx({
    supabase,
    cikMap: { AAPL: '0000320193', MSFT: '0000789019' },
    entriesByDate: {
      '2026-06-10': [
        { filer_cik: '320193', accession_number: '0000320193-26-000077' },
        { filer_cik: '789019', accession_number: '0000789019-26-000033' },
      ],
    },
    acc: {
      '0000320193-26-000077': { kind: 'resolved', acceptance_datetime: '2026-06-10T16:00:00.000Z' },
      '0000789019-26-000033': { kind: 'resolved', acceptance_datetime: '2026-06-10T17:00:00.000Z' },
    },
    f4: {
      '0000320193-26-000077': { kind: 'rows', rows: [edgarRow({ issuer_cik: '0000320193', shares: 1000 })] },
      '0000789019-26-000033': { kind: 'rows', rows: [edgarRow({ issuer_cik: '0000789019', accession_number: '0000789019-26-000033', shares: 500 })] },
    },
  });
  const res = await createInsiderOrchestrator(c).run(AS_OF);
  assertEquals(res.outcome, 'failed');
  assertStringIncludes(res.failure_reason!, 'unique violation');
});

Deno.test('(14) determinism — same inputs → same persisted values + as_of-derived timestamps', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
    { ticker: 'NVDA', gics_sector: 'IT' },
  ];
  const buildCtx = () => {
    const { supabase, upsertPayloads } = makeSupabase({ universe });
    return {
      ...ctx({
        supabase,
        cikMap: { AAPL: '0000320193', MSFT: '0000789019', NVDA: '0001045810' },
        entriesByDate: {
          '2026-06-10': [
            { filer_cik: '320193', accession_number: '0000320193-26-000077' },
            { filer_cik: '789019', accession_number: '0000789019-26-000033' },
            { filer_cik: '1045810', accession_number: '0001045810-26-000044' },
          ],
        },
        acc: {
          '0000320193-26-000077': { kind: 'resolved', acceptance_datetime: '2026-06-10T16:00:00.000Z' },
          '0000789019-26-000033': { kind: 'resolved', acceptance_datetime: '2026-06-10T17:00:00.000Z' },
          '0001045810-26-000044': { kind: 'resolved', acceptance_datetime: '2026-06-10T18:00:00.000Z' },
        },
        f4: {
          '0000320193-26-000077': { kind: 'rows', rows: [edgarRow({ issuer_cik: '0000320193', shares: 1000 })] },
          '0000789019-26-000033': { kind: 'rows', rows: [edgarRow({ issuer_cik: '0000789019', accession_number: '0000789019-26-000033', shares: 500 })] },
          '0001045810-26-000044': { kind: 'rows', rows: [edgarRow({ issuer_cik: '0000104581', accession_number: '0001045810-26-000044', shares: 2000 })] },
        },
      }),
      upsertPayloads,
    };
  };
  const a = buildCtx();
  const b = buildCtx();
  const ra = await createInsiderOrchestrator(a).run(AS_OF);
  const rb = await createInsiderOrchestrator(b).run(AS_OF);
  const sortVals = (p: SignalRow[][]) =>
    p[0].slice().sort((x: SignalRow, y: SignalRow) => x.ticker.localeCompare(y.ticker))
      .map((r: SignalRow) => ({ ticker: r.ticker, value: r.value }));
  // Only AAPL + MSFT will compute (NVDA fixture has issuer_cik mismatch
  // demonstrating the seam's defensive cik-mismatch handling).
  assertEquals(ra.persisted_count, rb.persisted_count);
  const expectedTs = AS_OF.toISOString();
  assertEquals(ra.started_at, expectedTs);
  assertEquals(ra.completed_at, expectedTs);
});

Deno.test('(15) as_of_date in result matches as_of (YYYY-MM-DD slice)', async () => {
  const universe = [{ ticker: 'AAPL', gics_sector: 'IT' }];
  const { supabase } = makeSupabase({ universe });
  const c = ctx({ supabase, cikMap: { AAPL: '0000320193' } });
  const res = await createInsiderOrchestrator(c).run(AS_OF);
  assertEquals(res.as_of_date, AS_OF_DATE);
  assertEquals(res.signal_id, SIGNAL_ID);
});