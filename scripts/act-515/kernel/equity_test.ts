// ACT-515 Kernel — Module 7 tests.
//
// Runner: Deno test, colocated (CI Gate-2 convention).

import { assertEquals, assert, assertThrows, assertAlmostEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  runEquityPath, MATRIX_COLUMN_IDS, DAILY_CARRY_RATE, MARGIN_MONTHLY_RATE,
  type SessionPlan, type EntryEvent, type ExitEventScheduled,
} from './equity.ts';
import { makeBars, MapBarSource } from './mark.ts';
import { price, shares, money } from './types.ts';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const SESSIONS = [
  '2024-05-02', '2024-05-03', '2024-05-06', '2024-05-07', '2024-05-08',
  '2024-05-09', '2024-05-10', '2024-05-13', '2024-05-14', '2024-05-15', '2024-05-16',
] as string[];

function entry(overrides: Partial<EntryEvent> & {
  lotId: string; ticker: string; side: 'long' | 'short';
  sharesN: number; entryN: number; slotN: number;
}): EntryEvent {
  return {
    lotId: overrides.lotId, ticker: overrides.ticker, side: overrides.side,
    shares: shares(overrides.sharesN),
    entryPrice: price(overrides.entryN),
    slotNotional: money(overrides.slotN),
  };
}

function exitE(overrides: {
  lotId: string; ticker: string; side: 'long' | 'short';
  sharesN: number; entryN: number; exitN: number;
}): ExitEventScheduled {
  const realized = overrides.side === 'long'
    ? overrides.sharesN * (overrides.exitN - overrides.entryN)
    : overrides.sharesN * (overrides.entryN - overrides.exitN);
  return {
    lotId: overrides.lotId, ticker: overrides.ticker, side: overrides.side,
    shares: shares(overrides.sharesN),
    entryPrice: price(overrides.entryN),
    exitClosePostHaircut: price(overrides.exitN),
    realizedUsd: money(realized),
  };
}

// -----------------------------------------------------------------------------
// PIN (a) — Equity definition + no-double-count on haircuts
// -----------------------------------------------------------------------------

Deno.test('PIN (a) equity(t) = cash + longMv + shortMv; flat book returns starting equity', () => {
  const bars = new MapBarSource(new Map());
  const r = runEquityPath(SESSIONS, [], bars, { startingEquityUsd: money(100_000) });
  assert(r.ok); if (!r.ok) return;
  assertEquals(r.rows.length, SESSIONS.length);
  for (const row of r.rows) {
    assertEquals(row.equityUsd as number, 100_000);
    assertEquals(row.cashUsd as number, 100_000);
    assertEquals(row.longMvUsd as number, 0);
    assertEquals(row.shortMvUsd as number, 0);
    assertEquals(row.carryTodayUsd as number, 0);
  }
  assertEquals(r.summary.endingEquityUsd as number, 100_000);
  assertEquals(r.summary.drawdown.maxDdPct, 0);
});

Deno.test('PIN (a) long round-trip: cash + mv reproduce realized; equity moves by exit − entry', () => {
  // 10 shares AAPL long at 100, exit at 110 on session[10]. haircut baked into
  // Module-6-produced exit price; EQUITY does NOT re-apply.
  const barEntries: [string, string, number][] = [];
  for (const s of SESSIONS) barEntries.push(['AAPL', s, 100]); // flat mark
  barEntries[barEntries.length - 1] = ['AAPL', SESSIONS[SESSIONS.length - 1], 110];
  const bars = makeBars(barEntries);
  const plan: SessionPlan[] = [
    { sessionDate: SESSIONS[0], entries: [entry({
        lotId: 'L1', ticker: 'AAPL', side: 'long', sharesN: 10, entryN: 100, slotN: 1000,
      })], exits: [] },
    { sessionDate: SESSIONS[SESSIONS.length - 1], entries: [], exits: [
      exitE({ lotId: 'L1', ticker: 'AAPL', side: 'long', sharesN: 10, entryN: 100, exitN: 110 }),
    ]},
  ];
  const r = runEquityPath(SESSIONS, plan, bars, { startingEquityUsd: money(100_000) });
  assert(r.ok); if (!r.ok) return;
  assertEquals(r.summary.endingEquityUsd as number, 100_100);   // +$100
  assertEquals(r.rows[0].cashUsd as number, 99_000);            // -1000 slot
  assertEquals(r.rows[0].longMvUsd as number, 1000);            // mark 100 flat
  assertEquals(r.rows[0].equityUsd as number, 100_000);
  const last = r.rows[r.rows.length - 1];
  assertEquals(last.realizedTodayUsd as number, 100);
  assertEquals(last.openLots, 0);
  assertEquals(last.longMvUsd as number, 0);
  assertEquals(last.cashUsd as number, 100_100);
});

Deno.test('PIN (a) short round-trip: cash inflow at entry; cover at exit; sign-symmetric to long', () => {
  const barEntries: [string, string, number][] = [];
  for (const s of SESSIONS) barEntries.push(['TSLA', s, 100]);
  barEntries[barEntries.length - 1] = ['TSLA', SESSIONS[SESSIONS.length - 1], 90];
  const bars = makeBars(barEntries);
  const plan: SessionPlan[] = [
    { sessionDate: SESSIONS[0], entries: [entry({
        lotId: 'S1', ticker: 'TSLA', side: 'short', sharesN: 10, entryN: 100, slotN: 1000,
      })], exits: [] },
    { sessionDate: SESSIONS[SESSIONS.length - 1], entries: [], exits: [
      exitE({ lotId: 'S1', ticker: 'TSLA', side: 'short', sharesN: 10, entryN: 100, exitN: 90 }),
    ]},
  ];
  const r = runEquityPath(SESSIONS, plan, bars, { startingEquityUsd: money(100_000) });
  assert(r.ok); if (!r.ok) return;
  // Short profit of $100.
  assertEquals(r.summary.endingEquityUsd as number, 100_100);
  // Day 0: cash +1000 (short proceeds), shortMv -1000 (liability), equity 100_000.
  assertEquals(r.rows[0].cashUsd as number, 101_000);
  assertEquals(r.rows[0].shortMvUsd as number, -1000);
  assertEquals(r.rows[0].equityUsd as number, 100_000);
});

// -----------------------------------------------------------------------------
// PIN (b) — Margin carry only when cash<0; 1×-const path accrues ZERO
// -----------------------------------------------------------------------------

Deno.test('PIN (b) carry rate constant = (0.0050 × 12) / 252', () => {
  assertAlmostEquals(DAILY_CARRY_RATE, (0.0050 * 12) / 252, 1e-15);
  assertEquals(MARGIN_MONTHLY_RATE, 0.0050);
});

Deno.test('PIN (b) 1x-const path (cash never negative) accrues ZERO carry', () => {
  // 40 slots × $2,500 = $100,000; starting equity $100,000. Cash bottoms at 0.
  const bars: [string, string, number][] = [];
  for (const s of SESSIONS) bars.push(['X', s, 100]);
  const bs = makeBars(bars);
  const entries: EntryEvent[] = [];
  for (let i = 0; i < 40; i++) {
    entries.push(entry({
      lotId: `L${i}`, ticker: 'X', side: 'long',
      sharesN: 25, entryN: 100, slotN: 2500,
    }));
  }
  const plan: SessionPlan[] = [{ sessionDate: SESSIONS[0], entries, exits: [] }];
  const r = runEquityPath(SESSIONS, plan, bs, { startingEquityUsd: money(100_000) });
  assert(r.ok); if (!r.ok) return;
  for (const row of r.rows) assertEquals(row.carryTodayUsd as number, 0);
  assertEquals(r.summary.cumulativeCarryUsd as number, 0);
});

Deno.test('PIN (b) 2× overdraw path: carry = |debit| × DAILY_CARRY_RATE', () => {
  // Force cash < 0 with a single big long lot.
  const bars: [string, string, number][] = [];
  for (const s of SESSIONS) bars.push(['X', s, 100]);
  const bs = makeBars(bars);
  const plan: SessionPlan[] = [{
    sessionDate: SESSIONS[0],
    entries: [entry({ lotId: 'L', ticker: 'X', side: 'long',
      sharesN: 1500, entryN: 100, slotN: 150_000 })],   // $50k debit
    exits: [],
  }];
  const r = runEquityPath(SESSIONS, plan, bs, { startingEquityUsd: money(100_000) });
  assert(r.ok); if (!r.ok) return;
  // Day 0 debit = $50,000; carry ≈ 50_000 * DAILY_CARRY_RATE.
  const expectedDay0 = 50_000 * DAILY_CARRY_RATE;
  assertAlmostEquals(r.rows[0].carryTodayUsd as number, expectedDay0, 0.02);
  // Cumulative carry > 0.
  assert((r.summary.cumulativeCarryUsd as number) > 0);
});

// -----------------------------------------------------------------------------
// PIN (c) — DD walk: peak/trough/recovery + UNRECOVERED path
// -----------------------------------------------------------------------------

Deno.test('PIN (c) DD peak → trough → recovery reported correctly', () => {
  // Craft an equity path: up, down, back up.
  // 1 long lot; move mark: 100→110→90→115. Then close.
  const px: Record<string, number> = {
    [SESSIONS[0]]: 100, [SESSIONS[1]]: 110, [SESSIONS[2]]: 90,
    [SESSIONS[3]]: 100, [SESSIONS[4]]: 115, [SESSIONS[5]]: 115,
    [SESSIONS[6]]: 115, [SESSIONS[7]]: 115, [SESSIONS[8]]: 115,
    [SESSIONS[9]]: 115, [SESSIONS[10]]: 115,
  };
  const bs = makeBars(SESSIONS.map(s => ['X', s, px[s]] as [string, string, number]));
  const plan: SessionPlan[] = [{
    sessionDate: SESSIONS[0],
    entries: [entry({ lotId: 'L', ticker: 'X', side: 'long',
      sharesN: 10, entryN: 100, slotN: 1000 })],
    exits: [],
  }];
  const r = runEquityPath(SESSIONS, plan, bs, { startingEquityUsd: money(10_000) });
  assert(r.ok); if (!r.ok) return;
  // Peak equity at SESSIONS[1] (mark 110 → equity 10_100).
  assertEquals(r.rows[1].equityUsd as number, 10_100);
  assertEquals(r.rows[2].equityUsd as number, 9_900);   // trough
  assertEquals(r.summary.drawdown.peakDate, SESSIONS[1]);
  assertEquals(r.summary.drawdown.troughDate, SESSIONS[2]);
  assertAlmostEquals(r.summary.drawdown.maxDdPct, 200 / 10_100, 1e-6);
  assertEquals(r.summary.drawdown.recoveryDate, SESSIONS[4]);   // 115 mark → 10_150
  assertEquals(r.summary.drawdown.durationDays, 1);
  assertEquals(r.summary.drawdown.recoveryDays, 2);
});

Deno.test('PIN (c) UNRECOVERED path: recoveryDate = UNRECOVERED, recoveryDays = N/A-UNRECOVERED', () => {
  const px: Record<string, number> = {};
  for (const s of SESSIONS) px[s] = 90; // straight down
  px[SESSIONS[0]] = 100;
  const bs = makeBars(SESSIONS.map(s => ['X', s, px[s]] as [string, string, number]));
  const plan: SessionPlan[] = [{
    sessionDate: SESSIONS[0],
    entries: [entry({ lotId: 'L', ticker: 'X', side: 'long',
      sharesN: 10, entryN: 100, slotN: 1000 })],
    exits: [],
  }];
  const r = runEquityPath(SESSIONS, plan, bs, { startingEquityUsd: money(10_000) });
  assert(r.ok); if (!r.ok) return;
  assertEquals(r.summary.drawdown.recoveryDate, 'UNRECOVERED');
  assertEquals(r.summary.drawdown.recoveryDays, 'N/A-UNRECOVERED');
});

// -----------------------------------------------------------------------------
// PIN (e) — Ledger foot: Δequity = realized + Δunrealized − carry
// -----------------------------------------------------------------------------

Deno.test('PIN (e) LEDGER FOOT invariant to the cent across multi-lot synthetic path', () => {
  const px: Record<string, Record<string, number>> = {
    AAPL: { [SESSIONS[0]]: 100, [SESSIONS[1]]: 105, [SESSIONS[2]]: 102, [SESSIONS[3]]: 108,
            [SESSIONS[4]]: 110, [SESSIONS[5]]: 115, [SESSIONS[6]]: 112, [SESSIONS[7]]: 118,
            [SESSIONS[8]]: 120, [SESSIONS[9]]: 122, [SESSIONS[10]]: 125 },
    TSLA: { [SESSIONS[0]]: 200, [SESSIONS[1]]: 195, [SESSIONS[2]]: 205, [SESSIONS[3]]: 198,
            [SESSIONS[4]]: 210, [SESSIONS[5]]: 212, [SESSIONS[6]]: 208, [SESSIONS[7]]: 215,
            [SESSIONS[8]]: 218, [SESSIONS[9]]: 220, [SESSIONS[10]]: 225 },
  };
  const barList: [string, string, number][] = [];
  for (const t of Object.keys(px)) for (const s of SESSIONS) barList.push([t, s, px[t][s]]);
  const bs = makeBars(barList);
  const plan: SessionPlan[] = [
    { sessionDate: SESSIONS[0], entries: [
        entry({ lotId: 'A', ticker: 'AAPL', side: 'long', sharesN: 10, entryN: 100, slotN: 1000 }),
        entry({ lotId: 'T', ticker: 'TSLA', side: 'short', sharesN: 5, entryN: 200, slotN: 1000 }),
      ], exits: [] },
    { sessionDate: SESSIONS[5], entries: [], exits: [
        exitE({ lotId: 'A', ticker: 'AAPL', side: 'long', sharesN: 10, entryN: 100, exitN: 115 }),
      ]},
    { sessionDate: SESSIONS[10], entries: [], exits: [
        exitE({ lotId: 'T', ticker: 'TSLA', side: 'short', sharesN: 5, entryN: 200, exitN: 225 }),
      ]},
  ];
  const r = runEquityPath(SESSIONS, plan, bs, { startingEquityUsd: money(50_000) });
  assert(r.ok); if (!r.ok) return;

  // Independent unrealized calc per session (AFTER exits, AFTER entries).
  function unrealCentsAt(idx: number): number {
    let u = 0;
    // AAPL open at sessions 0..4 (exited on session 5).
    if (idx <= 4) {
      u += Math.round((px.AAPL[SESSIONS[idx]] - 100) * 10 * 100);
    }
    // TSLA open at sessions 0..9 (exited on session 10).
    if (idx <= 9) {
      u += Math.round((200 - px.TSLA[SESSIONS[idx]]) * 5 * 100);
    }
    return u;
  }

  let prevEquityCents = 50_000 * 100;
  let prevUnrealCents = 0;
  for (let i = 0; i < SESSIONS.length; i++) {
    const eqC = Math.round((r.rows[i].equityUsd as number) * 100);
    const realC = Math.round((r.rows[i].realizedTodayUsd as number) * 100);
    const carryC = Math.round((r.rows[i].carryTodayUsd as number) * 100);
    const uC = unrealCentsAt(i);
    // Δequity == realized + Δunrealized − carry (to the cent).
    assertEquals(eqC - prevEquityCents, realC + (uC - prevUnrealCents) - carryC,
      `foot mismatch at session ${SESSIONS[i]}`);
    prevEquityCents = eqC;
    prevUnrealCents = uC;
  }
});

// -----------------------------------------------------------------------------
// PIN (f) — Threading + validation
// -----------------------------------------------------------------------------

Deno.test('PIN (f) mark_gap_in_open_book: refuses honestly, does not fabricate equity', () => {
  // Enter a lot, then day 1 the bar is missing beyond maxCarry=0.
  const bars = makeBars([['X', SESSIONS[0], 100]]); // only day 0 priced
  const plan: SessionPlan[] = [{ sessionDate: SESSIONS[0],
    entries: [entry({ lotId: 'L', ticker: 'X', side: 'long',
      sharesN: 5, entryN: 100, slotN: 500 })], exits: [] }];
  const r = runEquityPath(SESSIONS, plan, bars, {
    startingEquityUsd: money(10_000), maxCarryDays: 0,
  });
  assert(!r.ok); if (r.ok) return;
  assertEquals(r.refusal, 'mark_gap_in_open_book');
  assertEquals(r.sessionDate, SESSIONS[1]);
  assertEquals(r.rowsBeforeFailure.length, 1);
});

Deno.test('PIN (f) rejects unsorted sessions', () => {
  const bs = new MapBarSource(new Map());
  assertThrows(() => runEquityPath(
    ['2024-05-03', '2024-05-02'], [], bs, { startingEquityUsd: money(1000) }));
  assertThrows(() => runEquityPath(
    ['2024-05-02', '2024-05-02'], [], bs, { startingEquityUsd: money(1000) }));
});

Deno.test('PIN (f) rejects plan for session not in sessions list', () => {
  const bs = new MapBarSource(new Map());
  assertThrows(() => runEquityPath(
    SESSIONS, [{ sessionDate: '1999-01-01', entries: [], exits: [] }],
    bs, { startingEquityUsd: money(1000) }));
});

Deno.test('PIN (f) rejects duplicate lotId or exit-for-unknown-lot', () => {
  const bs = makeBars(SESSIONS.map(s => ['X', s, 100] as [string, string, number]));
  assertThrows(() => runEquityPath(SESSIONS, [{
    sessionDate: SESSIONS[0],
    entries: [
      entry({ lotId: 'L', ticker: 'X', side: 'long', sharesN: 1, entryN: 100, slotN: 100 }),
      entry({ lotId: 'L', ticker: 'X', side: 'long', sharesN: 1, entryN: 100, slotN: 100 }),
    ],
    exits: [],
  }], bs, { startingEquityUsd: money(1000) }));

  assertThrows(() => runEquityPath(SESSIONS, [{
    sessionDate: SESSIONS[0], entries: [], exits: [
      exitE({ lotId: 'ghost', ticker: 'X', side: 'long', sharesN: 1, entryN: 100, exitN: 105 }),
    ],
  }], bs, { startingEquityUsd: money(1000) }));
});

// -----------------------------------------------------------------------------
// Docs-as-code sync — Module 7 policy summary lines + column IDs
// -----------------------------------------------------------------------------

Deno.test('docs-as-code: carry formula summary appears in equity.ts AND estimator-assumptions.md §12', async () => {
  const marker = 'carry(t) = max(0, -cash_end_of_day) × (0.0050 × 12 / 252)';
  const src = await Deno.readTextFile(new URL('./equity.ts', import.meta.url));
  const doc = await Deno.readTextFile(new URL('../estimator-assumptions.md', import.meta.url));
  assert(src.includes(marker), 'equity.ts missing carry-formula summary line');
  assert(doc.includes(marker), 'estimator-assumptions.md §12 missing carry-formula summary line');
  assert(doc.includes('## 12. Equity path + drawdown'),
    'estimator-assumptions.md missing §12 header');
});

Deno.test('docs-as-code: MATRIX_COLUMN_IDS all appear verbatim in config-matrix.md', async () => {
  const matrix = await Deno.readTextFile(new URL('../config-matrix.md', import.meta.url));
  for (const id of MATRIX_COLUMN_IDS) {
    assert(matrix.includes('`' + id + '`'),
      `config-matrix.md missing column ID \`${id}\``);
  }
});

// -----------------------------------------------------------------------------
// Anti-phantom lint — rule (d) discipline
// -----------------------------------------------------------------------------

Deno.test('anti-phantom: equity.ts contains no Date.now / new Date( / Math.random', async () => {
  const src = await Deno.readTextFile(new URL('./equity.ts', import.meta.url));
  assert(!src.includes('Date.now'), 'equity.ts must not use Date.now');
  assert(!src.includes('new Date('), 'equity.ts must not use new Date(');
  assert(!src.includes('Math.random'), 'equity.ts must not use Math.random');
});