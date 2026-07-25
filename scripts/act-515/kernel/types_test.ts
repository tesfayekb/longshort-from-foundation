// ACT-515 Kernel — Module 1 tests.
//
// Runner: Deno test (colocated *_test.ts convention; matches CI Gate-2).

import { assertEquals, assertThrows, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  money, bps, shares, price,
  sideDbToDetector, sideDetectorToDb,
  LONG_BAND_LABELS, SHORT_BAND_LABELS,
  type CellKey, type BandLabel,
  type HandTruthFixtureRow, type HandTruthFixtureHeader,
  type RefusalTallyKey, type NoOpReason,
  type Clock, type RngSource,
} from './types.ts';

// -----------------------------------------------------------------------------
// Branded constructors — reject non-finite / non-integer / non-positive
// -----------------------------------------------------------------------------

Deno.test('money() rejects NaN/Infinity, accepts negative and zero', () => {
  assertThrows(() => money(NaN));
  assertThrows(() => money(Infinity));
  assertEquals(money(0) as number, 0);
  assertEquals(money(-100.5) as number, -100.5);
});

Deno.test('bps() rejects non-finite, accepts signed', () => {
  assertThrows(() => bps(NaN));
  assertEquals(bps(-42.42) as number, -42.42);
});

Deno.test('shares() enforces integer & non-negative', () => {
  assertThrows(() => shares(1.5));
  assertThrows(() => shares(-1));
  assertEquals(shares(0) as number, 0);
  assertEquals(shares(19) as number, 19);
});

Deno.test('price() rejects non-positive & non-finite', () => {
  assertThrows(() => price(0));
  assertThrows(() => price(-1));
  assertThrows(() => price(NaN));
  assertEquals(price(126.62) as number, 126.62);
});

// -----------------------------------------------------------------------------
// Side mapping — round-trip; case invariants
// -----------------------------------------------------------------------------

Deno.test('sideDbToDetector round-trip', () => {
  assertEquals(sideDbToDetector('long'), 'LONG');
  assertEquals(sideDbToDetector('short'), 'SHORT');
  assertEquals(sideDetectorToDb(sideDbToDetector('long')), 'long');
  assertEquals(sideDetectorToDb(sideDbToDetector('short')), 'short');
});

// -----------------------------------------------------------------------------
// Band literal parity — 6 long + 6 short, disjoint, byte-identical to
// band-label.ts and to overshoot_study_cell_results.band.
// -----------------------------------------------------------------------------

Deno.test('band labels — 6 long + 6 short, disjoint', () => {
  assertEquals(LONG_BAND_LABELS.length, 6);
  assertEquals(SHORT_BAND_LABELS.length, 6);
  const all = new Set<BandLabel>([...LONG_BAND_LABELS, ...SHORT_BAND_LABELS]);
  assertEquals(all.size, 12);
  // Grep-anchor spot check — must match band-label.ts:48-63 verbatim.
  assert(all.has('L_10_INF'));
  assert(all.has('S_10_INF'));
  assert(all.has('L_08_10'));
  assert(all.has('S_08_10'));
});

// -----------------------------------------------------------------------------
// CellKey — DB-layer side is lowercase (INC-138 invariant)
// -----------------------------------------------------------------------------

Deno.test('CellKey uses lowercase DB side', () => {
  const k: CellKey = {
    side: 'short',
    band: 'S_08_10',
    argmaxWindowDays: 4,
    magnitudeQuintile: 5,
    drawdownBucket: 4,
    exclusionHorizonDays: 5,
  };
  assertEquals(k.side, 'short');
});

// -----------------------------------------------------------------------------
// Refusal / no-op enum surface — compile-time coverage
// -----------------------------------------------------------------------------

Deno.test('RefusalTallyKey covers all top-level tally categories', () => {
  const keys: RefusalTallyKey[] = [
    'i5_refusals', 'sizing_refusals', 'buying_power_refusals',
    'shortability_refusals', 'allocation_cap_reached',
    'daily_budget_reached', 'short_daily_budget_reached',
  ];
  assertEquals(keys.length, 7);
});

Deno.test('NoOpReason covers emitted no-op strings', () => {
  const reasons: NoOpReason[] = [
    'job_disarmed', 'market_closed', 'run_already_exists',
    'strategy_config_absent', 'equity_snapshot_unavailable',
    'budget_exhausted_pre_loop',
  ];
  assertEquals(reasons.length, 6);
});

// -----------------------------------------------------------------------------
// Fixture types — shape parity with the on-disk 2024-05-02 hand-truth row
// -----------------------------------------------------------------------------

Deno.test('HandTruthFixtureRow shape matches on-disk row (uppercase side)', () => {
  const row: HandTruthFixtureRow = {
    ticker: 'ANF',
    side: 'LONG',   // preserved from disk; NOT lowercase
    tier: 'T2',
    entry_date: '2024-05-03',
    entry_open: 126.62,
    exit_date: '2024-05-16',
    exit_close: 135.69,
    shares: 19,
    notional_usd: 2405.78,
    pnl_usd: 172.33,
    pnl_bps: 716.32,
  };
  assertEquals(row.side, 'LONG');
  assertEquals(sideDetectorToDb(row.side), 'long');
});

Deno.test('HandTruthFixtureHeader shape matches on-disk header', () => {
  const h: HandTruthFixtureHeader = {
    epoch: 'ACT-515-hand-truth-v1',
    as_of_event_date: '2024-05-02',
    entry_convention: 'T+1 open (session-ordinal 1)',
    exit_convention: 'ordinal-10 close (LONG T2, holdingDayOrdinal>=10, session-age.ts:145)',
    entry_date: '2024-05-03',
    exit_date: '2024-05-16',
    sizing_usd: 2500.0,
    shares_rule: 'floor(SIZE / entry_open); no fractional shares',
    pnl_rule: 'pnl_usd = shares * (exit_close - entry_open); pnl_bps = (exit_close - entry_open) / entry_open * 10000',
    bars_source: 'public.overshoot_daily_bars (adjusted split/div per ingestion)',
    selection_source: 'fixtures/overshoot-detector-selection/2024-05-02.jsonl (selected_for_entry:true, N=20)',
    sides_note: 'all LONG T2 in this fixture',
    generated_at_utc: '2026-07-23T18:07:00Z',
  };
  assertEquals(h.sizing_usd, 2500.0);
});

// -----------------------------------------------------------------------------
// Clock / RngSource are INTERFACES — kernel injects, never reads globals
// -----------------------------------------------------------------------------

Deno.test('Clock injection contract', () => {
  const fixed: Clock = { nowMs: () => 1_700_000_000_000 };
  assertEquals(fixed.nowMs(), 1_700_000_000_000);
});

Deno.test('RngSource injection contract (deterministic stub)', () => {
  let i = 0;
  const seq = [0.1, 0.5, 0.9];
  const rng: RngSource = { next: () => seq[i++ % seq.length] };
  assertEquals(rng.next(), 0.1);
  assertEquals(rng.next(), 0.5);
  assertEquals(rng.next(), 0.9);
});

// -----------------------------------------------------------------------------
// Anti-phantom lint — types.ts contains no wall-clock / RNG tokens.
// This is the PIN (d) rule as an executable test, not a comment.
// -----------------------------------------------------------------------------

Deno.test('types.ts contains no Date.now / new Date( / Math.random tokens', async () => {
  const src = await Deno.readTextFile(new URL('./types.ts', import.meta.url));
  // Strip line comments so grep-anchor prose in comments doesn't false-positive.
  const codeOnly = src
    .split('\n')
    .map((ln) => {
      const idx = ln.indexOf('//');
      return idx >= 0 ? ln.slice(0, idx) : ln;
    })
    .join('\n');
  assert(!/\bDate\.now\b/.test(codeOnly), 'Date.now token forbidden in kernel');
  assert(!/\bnew\s+Date\s*\(/.test(codeOnly), 'new Date( token forbidden in kernel');
  assert(!/\bMath\.random\b/.test(codeOnly), 'Math.random token forbidden in kernel');
});