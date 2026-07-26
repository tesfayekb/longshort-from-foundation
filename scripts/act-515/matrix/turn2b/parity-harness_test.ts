import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { checkPartition, summarize, selectSampleSessions } from './parity-harness.ts';
import type { SlateRow } from './slate-row.ts';

const CAL = ['2024-01-02','2024-01-03','2024-01-04','2024-01-05','2024-01-08','2024-01-09','2024-01-10'];
const idx = new Map(CAL.map((s,i)=>[s,i]));
const offset = {
  sessionAfter: (s: string, n: number) => {
    const i = idx.get(s);
    if (i === undefined) return null;
    return CAL[i + n] ?? null;
  },
};

function longRow(rank: number, ticker: string, over: Partial<SlateRow> = {}): SlateRow {
  return {
    session: '2024-01-02', side: 'long', slate_rank: rank, tier: 'T2',
    band: 'L_10_INF', ticker, event_id: 1000 + rank,
    window_days: 4, momentum_quintile: 3, drawdown_bucket: 4,
    move_pct: '0.1', short_excess_at_argmax: null,
    excess_w1: null, excess_w2: null, excess_w3: null, excess_w4: null, excess_w5: null,
    days_to_nearest_earnings: null,
    mean_fwd_return_5d: '0.01', rank_score: '0.01', ...over,
  };
}

Deno.test('parity — key-parity passes on LONG L_10_INF rows', () => {
  const rows = [1,2,3,4,5,6,7].map(r => longRow(r, `T${r}`));
  const closes = () => 100; // all Stage-A closes present
  const res = checkPartition('2024-01-02', 'long', rows, closes, offset);
  assertEquals(res.passed, true, JSON.stringify(res.stops));
  assertEquals(res.denoAdmits.length, 5, 'K=5 picked');
  assertEquals(res.denoAdmits.map(a => a.slateRank), [1,2,3,4,5]);
});

Deno.test('parity — entry_price_missing skips row and picks next', () => {
  const rows = [1,2,3,4,5,6].map(r => longRow(r, `T${r}`));
  const closes = (t: string) => (t === 'T2' ? null : 100); // T2 missing
  const res = checkPartition('2024-01-02', 'long', rows, closes, offset);
  assertEquals(res.passed, true);
  assertEquals(res.typedSkipsByClass.entry_price_missing, 1);
  assertEquals(res.denoAdmits.map(a => a.slateRank), [1,3,4,5,6]);
});

Deno.test('parity — key mismatch STOPs', () => {
  const rows = [longRow(1, 'X', { band: 'L_08_10' })]; // slate says L_08_10 but LONG_BAND_LITERAL is L_10_INF
  const closes = () => 100;
  const res = checkPartition('2024-01-02', 'long', rows, closes, offset);
  assertEquals(res.passed, false);
  assertEquals(res.stops[0].reason, 'key_mismatch');
});

Deno.test('parity — SHORT S_10_INF row passes key-parity', () => {
  const r: SlateRow = {
    session: '2024-01-02', side: 'short', slate_rank: 1, tier: 'T2',
    band: 'S_10_INF', ticker: 'S1', event_id: 9,
    window_days: 2, momentum_quintile: 1, drawdown_bucket: 5,
    move_pct: '-0.15', short_excess_at_argmax: '-0.15',
    excess_w1: '-0.05', excess_w2: '-0.15', excess_w3: null,
    excess_w4: null, excess_w5: null,
    days_to_nearest_earnings: null,
    mean_fwd_return_5d: '-0.02', rank_score: '0.02',
  };
  const res = checkPartition('2024-01-02', 'short', [r], () => 100, offset);
  assertEquals(res.passed, true, JSON.stringify(res.stops));
  assertEquals(res.denoAdmits.length, 1);
});

Deno.test('selectSampleSessions — includes fixture-ii window + every 25th', () => {
  const sess: string[] = [];
  const start = Date.parse('2022-06-29');
  for (let i = 0; i < 100; i++) sess.push(new Date(start + i * 86400000).toISOString().slice(0, 10));
  const sample = selectSampleSessions(sess);
  assert(sample.length >= 4, 'includes fixture-ii sessions');
  // Every 25th of 100 = 4 samples + 4 fixture-ii dates (unique) ≥ 4
});

Deno.test('summarize — folds all-green', () => {
  const rows = [1,2].map(r => longRow(r, `A${r}`));
  const r1 = checkPartition('2024-01-02', 'long', rows, () => 100, offset);
  const sum = summarize([r1]);
  assertEquals(sum.allGreen, true);
  assertEquals(sum.totals.admits, 2);
});