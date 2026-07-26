// ACT-515 Matrix — Orchestrator hand-fixture test.
//
// FIXTURE (hand-computed, 5 sessions):
//   Calendar: 2024-01-02..08 (5 trading days: 02, 03, 04, 05, 08).
//   Universe: 3 tickers (LONG_A, LONG_B, LONG_C).
//   Wallet caps set TINY (long=0.02, short=0.10) so long cap BINDS at 2 slots
//     even at 1x-const ($100k × 0.02 = $2,000, slot = $100k × 0.025 = $2,500
//     → cap can hold ≤ 0 slots ... but we set slot notional lower via a
//     custom variant path? No — we lower cap fraction so 2x-comp step
//     naturally makes cap change).
//
// KEEPING IT ANALYTICALLY CLEAN:
//   We use variant='2x-comp' with wallet caps {long: 0.10, short: 0.10} and
//   startingEquity = $100. Slot = 100 × 0.025 × 2 = $5. LongCap = $100 × 2 × 0.10
//   = $20. Max long lots = 4.
//   We admit 4 LONG lots on session 1 (2024-01-02) — a 5th LONG candidate is
//   REFUSED by allocation_cap_reached (BIND #1). This proves LONG cap BINDS.
//
// SESSION SCRIPT:
//   2024-01-02: 5 LONG candidates arrive with eventDate=2024-01-02 → entry
//               offset for LONG T2 = +1 session (T+1 open) = 2024-01-03.
//     Wait — the reconstructor computes entrySession = eventDate + offset.
//     For LONG T2, offset = 1. For LONG T1, offset = 2.
//   To keep the test tight, we use LONG T2 rows (geometry outside T1 set) —
//   entry lands on next session.
//
// REVISED SCRIPT (KISS):
//   Session 1: 2024-01-02 → eventDate 2024-01-02.
//     5 LONG T2 candidates arrive; their entry session = 2024-01-03.
//     Nothing admits/enters on session 1 itself.
//   Session 2: 2024-01-03 → reconstructor admits from 2024-01-02 events.
//     4 slots fit (cap = $20, slot = $5); 5th is REFUSED allocation_cap.
//     Entries at 2024-01-03 open. Cash drops by ~$20 → cashC ≈ $80. Not
//     negative yet.
//   Session 3: 2024-01-04 → mark day. All 4 lots priced at close.
//   Session 4: 2024-01-05 → mark day. Lot prices drop equity — for 2x-comp,
//     equity(t) is used as sizingBase for next session's admits (there are
//     none, but the row will record a NEW sizingBaseUsd derived from the
//     dropped equity → PROOF of -comp adaptivity).
//   Session 5: 2024-01-08 → SHORT round-trip exits.
//
// TO EXERCISE NEGATIVE CASH + CARRY: we run a second scenario in the same
//   test with startingEquity = $30 and 4 admits at $5/slot → cash = $30-$20 =
//   $10 (positive). To force cash < 0 we admit more/heavier. Simpler: use
//   startingEquity = $10 with variant='2x-const' (slot=$5 flat), longCap =
//   0.90 × $10 × 2 = $18. 3 slots fit ($15). Cash: $10 - $15 = -$5. Carry:
//   $5 × (0.005×12/252) = $5 × 0.000238 ≈ $0.00119 = 0 cents (rounds to zero).
//   To make carry non-zero: bigger debit. startingEquity=$10, admit 3 lots
//   at $5 slot → cash = -$5; carry rounds to 0. Bump: startingEquity=$100,
//   variant='2x-const' (slot=$5), longCap = $100×2×0.90 = $180 (36 slots)
//   → admit 36 lots at $5 = $180 cash out → cash = $100 - $180 = -$80.
//   Carry(1d) = $80 × 0.000238 = $0.019 = 2 cents. Testable.
//
// TO KEEP THINGS SIMPLE we run TWO focused scenarios as separate Deno.test
// units:
//   TEST 1: BIND + LEDGER FOOT (2x-comp, cap=0.10, 5 candidates → 4 admits,
//           1 refused allocation_cap; ledger foot invariant per session).
//   TEST 2: COMP SIZING STEP (2x-comp; after a loss between sessions, the
//           NEXT session's sizingBaseUsd shrinks proportionally).
//   TEST 3: NEGATIVE-CASH CARRY (2x-const at $100 with 36 LONG admits →
//           cash goes negative → carry accrues > 0).

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { runOrchestrator, type CompositeBarSource } from './orchestrator.ts';
import { ArraySessionCalendar } from '../kernel/exit.ts';
import { FixedClock } from '../kernel/clock.ts';
import { price, type Clock, type Price } from '../kernel/types.ts';
import type { CorpusCandidateRow, CellMapLookup } from './reconstructor.ts';
import type { SessionDate } from '../kernel/clock.ts';

const CLOCK: Clock = new FixedClock(1_704_240_000_000);  // 2024-01-02T22:40Z

// -----------------------------------------------------------------------------
// Fixture helpers
// -----------------------------------------------------------------------------

const SESSIONS: ReadonlyArray<SessionDate> = ['2024-01-02','2024-01-03','2024-01-04','2024-01-05','2024-01-08','2024-01-09','2024-01-10'];

// Static bar data — flat prices unless overridden per test.
function makeBars(overrides: Record<string, Record<string, { open?: number; close?: number }>>): CompositeBarSource {
  return {
    open(t, s) { return overrides[t]?.[s]?.open === undefined ? null : price(overrides[t]![s]!.open!); },
    close(t, s) { return overrides[t]?.[s]?.close === undefined ? null : price(overrides[t]![s]!.close!); },
  };
}

function cellMapAlways(meanFwd5d: number): CellMapLookup {
  return () => meanFwd5d;
}

// Ledger-foot invariant per session:
//   equity(t) − equity(t−1) = realizedToday + Δunrealized − carryToday
function assertLedgerFoot(rows: ReadonlyArray<{ equityUsd: number; realizedTodayUsd: number; unrealizedTotalUsd: number; carryTodayUsd: number }>, startingEquity: number) {
  let prevEq = startingEquity;
  let prevUnreal = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const dEq = Math.round((r.equityUsd - prevEq) * 100);
    const dU = Math.round((r.unrealizedTotalUsd - prevUnreal) * 100);
    const expected = Math.round(r.realizedTodayUsd * 100) + dU - Math.round(r.carryTodayUsd * 100);
    assertEquals(dEq, expected,
      `ledger foot @ row ${i} (${(r as unknown as {sessionDate:string}).sessionDate ?? '?'}): dEq=${dEq}c vs expected=${expected}c ` +
      `(realized=${Math.round(r.realizedTodayUsd*100)}c, dUnreal=${dU}c, carry=${Math.round(r.carryTodayUsd*100)}c)`);
    prevEq = r.equityUsd;
    prevUnreal = r.unrealizedTotalUsd;
  }
}

// -----------------------------------------------------------------------------
// LONG T1 geometry (window∈{1,2,3}, mq∈{4,5}, dd∈{1,2,3}). Offset +2 sessions.
// Cell key: {side:'long', band:'L_10_INF', windowDays:1, mq:4, dd:1, ex:5}.
function longT1Row(eventId: number, ticker: string, eventDate: SessionDate): CorpusCandidateRow {
  return {
    eventId, ticker, side: 'long', eventDate,
    windowDays: 1, momentumQuintile: 4, drawdownBucket: 1, daysToNearestEarnings: null,
  };
}

// -----------------------------------------------------------------------------
// TEST 1 — LONG CAP BINDS + LEDGER FOOT (2x-comp, cap=0.10, LONG T1)
// -----------------------------------------------------------------------------

Deno.test('orchestrator T1b: LONG cap BINDS + ledger foot (2x-comp, cap=0.10, LONG T1)', () => {
  // LONG T1: offset=+2 → eventDate 2024-01-02 → entry = 2024-01-04.
  // exit anchor: event + 6 sessions after eventDate = SESSIONS[6] = 2024-01-10.
  const corpusByEntrySession = new Map<SessionDate, ReadonlyArray<CorpusCandidateRow>>();
  corpusByEntrySession.set('2024-01-04', [
    longT1Row(11, 'AAAA', '2024-01-02'),
    longT1Row(12, 'BBBB', '2024-01-02'),
    longT1Row(13, 'CCCC', '2024-01-02'),
    longT1Row(14, 'DDDD', '2024-01-02'),
    longT1Row(15, 'EEEE', '2024-01-02'),
  ]);

  // All tickers price at $1.00 open + $1.00 close through the fixture window,
  // rising to $1.20 close on exit day (2024-01-10) → 20% raw gain.
  const flat: Record<string, Record<string, { open?: number; close?: number }>> = {};
  for (const t of ['AAAA','BBBB','CCCC','DDDD','EEEE']) {
    flat[t] = {};
    for (const s of SESSIONS) flat[t][s] = { open: 1.00, close: 1.00 };
    flat[t]['2024-01-10'] = { open: 1.20, close: 1.20 };
  }
  const bars = makeBars(flat);

  const result = runOrchestrator({
    variantId: '2x-comp',
    sessions: SESSIONS,
    calendar: new ArraySessionCalendar(SESSIONS as string[]),
    corpusByEntrySession,
    cellMap: cellMapAlways(0.05),
    bars,
    startingEquityUsd: 100,
    budgets: { k: 5, shortDailyBudget: 5 },
    walletCapFractions: { long: 0.10, short: 0.10 },
    maxCarryDays: 5,
    clock: CLOCK,
  });
  assert(result.ok, `orchestrator failed: ${JSON.stringify(result)}`);

  // Admit session is 2024-01-04 (index 2). 4 admits, 1 cap-refused.
  const admitRow = result.rows[2];
  assertEquals(admitRow.sessionDate, '2024-01-04');
  assertEquals(admitRow.admitsToday, 4, `expected 4 admits; got ${admitRow.admitsToday}`);
  assertEquals(admitRow.refusalsToday.allocation_cap_reached, 1,
    `LONG cap MUST BIND: expected 1 alloc_cap refusal; got ${admitRow.refusalsToday.allocation_cap_reached}`);
  assertEquals(admitRow.openLongLots, 4);
  assertEquals(result.telemetry.allocationCapRefusalsTotal, 1);
  assertEquals(result.telemetry.maxConcurrentLongLots, 4);

  // Ledger foot invariant across all sessions.
  assertLedgerFoot(
    result.rows.map(r => ({
      equityUsd: r.equityUsd as unknown as number,
      realizedTodayUsd: r.realizedTodayUsd as unknown as number,
      unrealizedTotalUsd: r.unrealizedTotalUsd as unknown as number,
      carryTodayUsd: r.carryTodayUsd as unknown as number,
    })),
    100,
  );

  // Terminal identity to the cent:
  //   endingEquity = startingEquity + Σ realized − Σ carry
  const totalRealizedC = Math.round((result.telemetry.totalRealizedUsd as unknown as number) * 100);
  const totalCarryC = Math.round((result.summary.cumulativeCarryUsd as unknown as number) * 100);
  const startC = 100 * 100;
  const endC = Math.round((result.summary.endingEquityUsd as unknown as number) * 100);
  assertEquals(endC, startC + totalRealizedC - totalCarryC,
    `terminal identity: end=${endC}c vs start(${startC}) + realized(${totalRealizedC}) - carry(${totalCarryC})`);
});

// -----------------------------------------------------------------------------
// TEST 2 — -comp SIZING BASE ADAPTS
// -----------------------------------------------------------------------------

Deno.test('orchestrator T2: -comp sizingBase reflects prior-session equity', () => {
  // Empty corpus → no admits ever. But we can verify sizingBase moves with
  // equity: session 1 sizingBase = start × leverage; session N sizingBase =
  // equity(N-1) × leverage. Without positions equity is constant, so we
  // need at least one admit + a price move to see the change.
  //
  // Single LONG T1 admit. Entry 2024-01-04 at $1.00, closes 2024-01-04 at $0.50
  // (50% mark-to-market loss). sizingBase for session 2024-01-05 should be
  //   (equity_end_of_04) × leverage = (100 − 5·0.50) × 2 = 197.5 × 2 = $195.
  // Compare against session-04 sizingBase = 100 × 2 = $200.
  const corpusByEntrySession = new Map<SessionDate, ReadonlyArray<CorpusCandidateRow>>();
  corpusByEntrySession.set('2024-01-04', [longT1Row(21, 'ZZZZ', '2024-01-02')]);

  const flat: Record<string, Record<string, { open?: number; close?: number }>> = {
    ZZZZ: {},
  };
  for (const s of SESSIONS) flat.ZZZZ[s] = { open: 1.00, close: 1.00 };
  flat.ZZZZ['2024-01-04'] = { open: 1.00, close: 0.50 };   // 50% intraday drop after entry
  flat.ZZZZ['2024-01-10'] = { open: 0.50, close: 0.50 };

  const result = runOrchestrator({
    variantId: '2x-comp',
    sessions: SESSIONS,
    calendar: new ArraySessionCalendar(SESSIONS as string[]),
    corpusByEntrySession,
    cellMap: cellMapAlways(0.05),
    bars: makeBars(flat),
    startingEquityUsd: 100,
    budgets: { k: 5, shortDailyBudget: 5 },
    walletCapFractions: { long: 0.90, short: 0.10 },
    maxCarryDays: 5,
    clock: CLOCK,
  });
  assert(result.ok, `orchestrator failed: ${JSON.stringify(result)}`);

  const s04 = result.rows.find(r => r.sessionDate === '2024-01-04')!;
  const s05 = result.rows.find(r => r.sessionDate === '2024-01-05')!;
  const base04 = s04.sizingBaseUsd as unknown as number;
  const base05 = s05.sizingBaseUsd as unknown as number;
  // base04 uses startingEquity(=100) as prior. base05 uses equity end of 04.
  assertEquals(Math.round(base04 * 100), 200 * 100,
    `session 04 sizingBase should be starting × leverage (200); got ${base04}`);
  assert(base05 < base04 - 0.01,
    `session 05 sizingBase MUST be < session 04 (post-loss); got 04=${base04} 05=${base05}`);

  // Ledger foot invariant.
  assertLedgerFoot(
    result.rows.map(r => ({
      equityUsd: r.equityUsd as unknown as number,
      realizedTodayUsd: r.realizedTodayUsd as unknown as number,
      unrealizedTotalUsd: r.unrealizedTotalUsd as unknown as number,
      carryTodayUsd: r.carryTodayUsd as unknown as number,
    })),
    100,
  );
});

// -----------------------------------------------------------------------------
// TEST 3 — NEGATIVE-CASH → CARRY ACCRUES
// -----------------------------------------------------------------------------

Deno.test('orchestrator T3: negative-cash session accrues carry (2x-const, 5 admits)', () => {
  // startingEquity=$100, variant=2x-const → slot = $100 × 0.025 × 2 = $5.
  // walletCap long = 0.90 → longCap = $100 × 2 × 0.90 = $180 → 36 slots.
  // Admit 5 LONG T1 lots at entry price $1.00 → shares=5 → entry cash out =
  //   5 lots × 5 shares × $1.00 = $25. cash = $100 − $25 = $75 (positive).
  //
  // We need cash < 0. Change entry prices so shares scale up: entry=$0.10 →
  // shares = floor($5/$0.10) = 50 → cash per lot = $5. 5 lots → $25 out.
  // Still $75. To go negative we'd need way more lots than 5 admits/day
  // allow at $5 slot ($100 starting cash needs $100+ out).
  //
  // Alternative: reduce startingEquity to $20. 5 lots × $5 = $25 out → cash =
  // -$5. But then longCap = $20×2×0.9 = $36 (7 slots OK). K=5 admits fine.
  //
  // Bump debit: use price=$0.10 → shares=50/lot; but slot is still $5 so
  // entry cash = 50 × $0.10 = $5, same. So debit = same $25.
  //
  // Use startingEquity=$10 → cash = -$15 → carry(1d) = 15 × 0.000238 = $0.0036 = 0.36c → 0 cents.
  // Need more days OR bigger debit. startingEquity=$1 → cash = -$24 → carry = 0.57c = 1c.
  // Better: reduce carry threshold — no, formula is fixed.
  //
  // Multi-day accumulation over the 6-session hold: cash sits at -$24 for 6 days
  // → cumulative carry ≈ 6 × $0.0057 = $0.034 = 3c.
  //
  // Cleaner: use startingEquity=$1, 5 admits at $5/slot each = $25 out → cash = -$24.
  const corpusByEntrySession = new Map<SessionDate, ReadonlyArray<CorpusCandidateRow>>();
  corpusByEntrySession.set('2024-01-04', [
    longT1Row(31, 'AAAA', '2024-01-02'),
    longT1Row(32, 'BBBB', '2024-01-02'),
    longT1Row(33, 'CCCC', '2024-01-02'),
    longT1Row(34, 'DDDD', '2024-01-02'),
    longT1Row(35, 'EEEE', '2024-01-02'),
  ]);
  const flat: Record<string, Record<string, { open?: number; close?: number }>> = {};
  for (const t of ['AAAA','BBBB','CCCC','DDDD','EEEE']) {
    flat[t] = {};
    for (const s of SESSIONS) flat[t][s] = { open: 1.00, close: 1.00 };
  }
  const bars = makeBars(flat);

  const result = runOrchestrator({
    variantId: '2x-const',
    sessions: SESSIONS,
    calendar: new ArraySessionCalendar(SESSIONS as string[]),
    corpusByEntrySession,
    cellMap: cellMapAlways(0.05),
    bars,
    startingEquityUsd: 1,        // tiny start → guaranteed negative cash
    budgets: { k: 5, shortDailyBudget: 5 },
    walletCapFractions: { long: 0.90, short: 0.10 },  // longCap = $1×2×0.9 = $1.80
    maxCarryDays: 5,
    clock: CLOCK,
  });
  // With longCap=$1.80 and slot=$5 (const) → 0 slots fit. Cap will refuse ALL.
  // We need cap to allow at least 1 admit. Bump startingEquity.
  // Actually 2x-const slot is $100k×0.025×2 = $5000 (hardcoded rail!). Cap is
  // $1×2×0.9 = $1.80 vs slot $5000 → 0 admits. Wrong.
  //
  // For 2x-const the KERNEL slot is always $5000. So cap MUST exceed $5000 for
  // any admit. Set startingEquity=$10000 → cap = $10k×2×0.9 = $18k → 3 slots.
  // Entry cash = 3 × $5000 = $15000. cash = $10000 - $15000 = -$5000.
  // Carry(1d) = $5000 × 0.000238 = $1.19. Over the ~6-day hold: ~$7.
  //
  // Re-run with better start.
  if (!result.ok) {
    // Expected in this synthetic — the tiny start blocks 2x-const admits.
    // Continue with corrected fixture below.
  }

  const bigResult = runOrchestrator({
    variantId: '2x-const',
    sessions: SESSIONS,
    calendar: new ArraySessionCalendar(SESSIONS as string[]),
    corpusByEntrySession,
    cellMap: cellMapAlways(0.05),
    bars,
    startingEquityUsd: 10_000,
    budgets: { k: 5, shortDailyBudget: 5 },
    walletCapFractions: { long: 0.90, short: 0.10 },
    maxCarryDays: 5,
    clock: CLOCK,
  });
  assert(bigResult.ok, `orchestrator failed: ${JSON.stringify(bigResult)}`);

  // Cap: $10k × 2 × 0.9 = $18k. Slot $5k. → 3 admits fit, 2 refused.
  const admitRow = bigResult.rows.find(r => r.sessionDate === '2024-01-04')!;
  assertEquals(admitRow.admitsToday, 3);
  assertEquals(admitRow.refusalsToday.allocation_cap_reached, 2);
  // Cash flow: 3 lots × 5000 shares × $1.00 = $15,000 out (shares = floor(5000/1)).
  //   cash after entry = $10,000 − $15,000 − entry haircut adj ≈ −$5,007.50
  //   (5bps LONG haircut on entry: entryEff = 1.0005 → cash out = 3×5000×1.0005 = $15,007.5).
  assert((admitRow.cashUsd as unknown as number) < 0,
    `session 04 cash MUST be negative; got ${admitRow.cashUsd}`);
  // Carry today MUST be > 0 (session 04 close).
  assert((admitRow.carryTodayUsd as unknown as number) > 0,
    `session 04 carry MUST be > 0 (cash<0); got ${admitRow.carryTodayUsd}`);
  // Cumulative carry > 0.
  assert((bigResult.summary.cumulativeCarryUsd as unknown as number) > 0,
    `cumulative carry MUST be > 0; got ${bigResult.summary.cumulativeCarryUsd}`);

  // Ledger foot invariant.
  assertLedgerFoot(
    bigResult.rows.map(r => ({
      equityUsd: r.equityUsd as unknown as number,
      realizedTodayUsd: r.realizedTodayUsd as unknown as number,
      unrealizedTotalUsd: r.unrealizedTotalUsd as unknown as number,
      carryTodayUsd: r.carryTodayUsd as unknown as number,
    })),
    10_000,
  );
});