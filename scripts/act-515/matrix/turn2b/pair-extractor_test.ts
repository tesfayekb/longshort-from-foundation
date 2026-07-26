import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { extractPairs, chunkPairs } from './pair-extractor.ts';
import type { SlateRow } from './slate-row.ts';

const CAL = ['2024-01-02','2024-01-03','2024-01-04','2024-01-05','2024-01-08','2024-01-09'];
const idx = new Map(CAL.map((s,i)=>[s,i]));
const offset = { sessionAfter: (s: string, n: number) => CAL[(idx.get(s) ?? -1) + n] ?? null };

function row(over: Partial<SlateRow>): SlateRow {
  return {
    session: '2024-01-02', side: 'long', slate_rank: 1, tier: 'T2',
    band: 'L_10_INF', ticker: 'AAA', event_id: 1,
    window_days: 4, momentum_quintile: 3, drawdown_bucket: 4,
    move_pct: '0.1', short_excess_at_argmax: null,
    excess_w1: null, excess_w2: null, excess_w3: null, excess_w4: null, excess_w5: null,
    days_to_nearest_earnings: null,
    mean_fwd_return_5d: '0.01', rank_score: '0.01', ...over,
  };
}

Deno.test('extractPairs — LONG T1 uses +2, LONG T2/SHORT use +1', () => {
  const rows: SlateRow[] = [
    row({ event_id: 1, ticker: 'AAA', session: '2024-01-02', side: 'long', tier: 'T1', window_days: 1, momentum_quintile: 4, drawdown_bucket: 1 }),
    row({ event_id: 2, ticker: 'BBB', session: '2024-01-02', side: 'long', tier: 'T2', window_days: 4 }),
    row({ event_id: 3, ticker: 'CCC', session: '2024-01-02', side: 'short', tier: 'T2', band: 'S_10_INF' }),
  ];
  const r = extractPairs(rows, offset);
  assertEquals(r.rowsSeen, 3);
  assertEquals(r.offCalendar, 0);
  // sorted by ticker
  assertEquals(r.pairs, [
    ['AAA', '2024-01-04'], // +2
    ['BBB', '2024-01-03'], // +1
    ['CCC', '2024-01-03'], // +1
  ]);
});

Deno.test('extractPairs — dedupes by (ticker, entrySession)', () => {
  const rows = [
    row({ event_id: 1, ticker: 'X', session: '2024-01-02', tier: 'T2' }),
    row({ event_id: 2, ticker: 'X', session: '2024-01-02', tier: 'T2' }),
  ];
  const r = extractPairs(rows, offset);
  assertEquals(r.pairs.length, 1);
});

Deno.test('extractPairs — off-calendar counts, no pair emitted', () => {
  const rows = [ row({ event_id: 1, ticker: 'Z', session: '2099-01-01', tier: 'T2' }) ];
  const r = extractPairs(rows, offset);
  assertEquals(r.pairs.length, 0);
  assertEquals(r.offCalendar, 1);
});

Deno.test('chunkPairs — respects maxPerReq', () => {
  const p = Array.from({ length: 12 }, (_, i) => [`T${i}`, '2024-01-02'] as const);
  const chunks = chunkPairs(p, 5);
  assertEquals(chunks.map(c => c.length), [5, 5, 2]);
  assert(chunks.flat().length === 12);
});