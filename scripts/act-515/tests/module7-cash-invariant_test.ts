// ACT-515 Module-7 STRUCTURAL INVARIANT — class-killer for the CASH SEAM
// RENAME bug family diagnosed on 2026-07-25 (GATE-(iii) TIER-A repair).
//
// CLASS OF BUG: any implementation where the equity walker moves a
// non-executed quantity (raw slot notional, aspirational size, pre-fill
// buying-power target) into the cash ledger at entry — for either side.
// Symptom: cash(t) drifts from Σ executed flows by a growing, side-signed
// residue as more lots enter.
//
// STRUCTURAL PROPERTY (permanent guard, independent of any fixture):
//   Over an arbitrary randomized mixed long/short book with heterogeneous
//   shares × entryPrice combinations (partial-slot fills, non-round prices),
//   for every session t emitted by `runEquityPath`:
//     cash(t) === startingCash + Σ_{lots entered by t} entryCash(side, sh, px)
//                                + Σ_{lots exited  by t} settleProceeds(side, sh, exitPx)
//     to the CENT.
//   Mark-to-market only affects longMv/shortMv, never cash.
//
// Deterministic seeded RNG — no wall-clock, no Date.now(), no Math.random()
// unseeded (see equity.ts ANTI-PHANTOM). Uses a linear-congruential PRNG.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  money, price, shares as sharesBrand, type SideDb,
} from '../kernel/types.ts';
import { ArraySessionCalendar } from '../kernel/exit.ts';
import { entryCash, settleProceeds } from '../kernel/exit.ts';
import { MapBarSource } from '../kernel/mark.ts';
import {
  runEquityPath, type SessionPlan, type EntryEvent, type ExitEventScheduled,
} from '../kernel/equity.ts';
import type { SessionDate } from '../kernel/clock.ts';

// Seeded LCG — Numerical Recipes constants; deterministic across runs.
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

function toCents(n: number): number { return Math.round(n * 100); }

// A dense 40-session calendar of business-like dates (fabricated; kernel is
// calendar-agnostic — only ordering matters).
function makeCalendar(n: number): SessionDate[] {
  const out: SessionDate[] = [];
  let y = 2025, m = 1, d = 1;
  while (out.length < n) {
    const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` as SessionDate;
    out.push(s);
    d++;
    if (d > 28) { d = 1; m++; }
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

interface SyntheticLot {
  readonly lotId: string;
  readonly ticker: string;
  readonly side: SideDb;
  readonly sharesN: number;
  readonly entryPx: number;
  readonly exitPx: number;
  readonly entryIdx: number;
  readonly exitIdx: number;
  readonly slotUsd: number;   // aspirational — MUST NOT influence ledger
}

Deno.test('CLASS-KILLER — Module-7 cash(t) === startingCash + Σ executed flows, every session, mixed L/S book', () => {
  const sessions = makeCalendar(40);
  const cal = new ArraySessionCalendar(sessions);
  const rand = lcg(0xC0FFEE);
  const N_LOTS = 24;
  const startingUsd = 100_000;

  // Build synthetic lots — deliberate partial-slot fills (floor(slot/px) shares)
  // and non-round prices so any residue-vs-executed drift will manifest.
  const lots: SyntheticLot[] = [];
  const barMap = new Map<string, ReturnType<typeof price>>();
  for (let i = 0; i < N_LOTS; i++) {
    const side: SideDb = rand() < 0.4 ? 'short' : 'long';
    const entryIdx = Math.floor(rand() * 20);            // sessions 0..19
    const exitIdx = entryIdx + 1 + Math.floor(rand() * 15); // 1..15 sessions later
    const entryPx = +((10 + rand() * 490).toFixed(3));   // $10..$500, 3-dec
    // exit price ±10% of entry
    const exitPx = +(entryPx * (0.9 + rand() * 0.2)).toFixed(3);
    const slotUsd = 10_000;                              // aspirational
    const sharesN = Math.floor(slotUsd / entryPx);       // floor-fill
    const ticker = `SYN${i}`;
    lots.push({
      lotId: `syn-${i}`, ticker, side, sharesN, entryPx, exitPx,
      entryIdx, exitIdx, slotUsd,
    });
    barMap.set(MapBarSource.key(ticker, sessions[exitIdx]), price(exitPx));
    // Also seed intermediate marks so markBook doesn't refuse — carry-forward
    // handles gaps, but we plant a mark at every session in [entry, exit] for
    // safety.
    for (let s = entryIdx; s <= exitIdx; s++) {
      const k = MapBarSource.key(ticker, sessions[s]);
      if (!barMap.has(k)) {
        const t = (s - entryIdx) / Math.max(1, exitIdx - entryIdx);
        const px = +(entryPx + t * (exitPx - entryPx)).toFixed(3);
        barMap.set(k, price(px));
      }
    }
  }
  const barSource = new MapBarSource(barMap);

  // Assemble SessionPlan[] — entries at entryIdx, exits at exitIdx.
  const entriesByDate = new Map<SessionDate, EntryEvent[]>();
  const exitsByDate = new Map<SessionDate, ExitEventScheduled[]>();
  for (const l of lots) {
    const ent: EntryEvent = {
      lotId: l.lotId, ticker: l.ticker, side: l.side,
      shares: sharesBrand(l.sharesN),
      entryPrice: price(l.entryPx),
      slotNotional: money(l.slotUsd),   // aspirational — must NOT leak
    };
    const realizedN = l.side === 'long'
      ? l.sharesN * (l.exitPx - l.entryPx)
      : l.sharesN * (l.entryPx - l.exitPx);
    const ex: ExitEventScheduled = {
      lotId: l.lotId, ticker: l.ticker, side: l.side,
      shares: sharesBrand(l.sharesN),
      entryPrice: price(l.entryPx),
      exitClosePostHaircut: price(l.exitPx),
      realizedUsd: money(realizedN),
    };
    const eD = sessions[l.entryIdx];
    const xD = sessions[l.exitIdx];
    if (!entriesByDate.has(eD)) entriesByDate.set(eD, []);
    entriesByDate.get(eD)!.push(ent);
    if (!exitsByDate.has(xD)) exitsByDate.set(xD, []);
    exitsByDate.get(xD)!.push(ex);
  }
  const plan: SessionPlan[] = [];
  for (const d of sessions) {
    plan.push({
      sessionDate: d,
      entries: entriesByDate.get(d) ?? [],
      exits: exitsByDate.get(d) ?? [],
    });
  }

  const eq = runEquityPath(sessions, plan, barSource, {
    startingEquityUsd: money(startingUsd), maxCarryDays: 40,
  });
  assert(eq.ok, `runEquityPath refused: ${!eq.ok ? eq.reason : ''}`);
  if (!eq.ok) return;

  // Cent-exact per-session cash reconciliation.
  const startCents = toCents(startingUsd);
  let violations = 0;
  for (let t = 0; t < sessions.length; t++) {
    const dt = sessions[t];
    let expectedCents = startCents;
    // Sum entryCash for every lot with entryIdx ≤ t.
    for (const l of lots) {
      if (l.entryIdx <= t) {
        expectedCents += toCents(entryCash(l.side, sharesBrand(l.sharesN), price(l.entryPx)) as number);
      }
      if (l.exitIdx <= t) {
        expectedCents += toCents(settleProceeds(l.side, sharesBrand(l.sharesN), price(l.exitPx)) as number);
      }
    }
    // Subtract any accrued carry the walker booked (carry is legitimate cash
    // decrement, not a flow bug — invariant permits it explicitly).
    let cumCarry = 0;
    for (let u = 0; u <= t; u++) {
      cumCarry += toCents(eq.rows[u].carryTodayUsd as number);
    }
    expectedCents -= cumCarry;
    const actualCents = toCents(eq.rows[t].cashUsd as number);
    if (actualCents !== expectedCents) {
      violations++;
      if (violations <= 3) {
        console.log(`t=${t} ${dt}: cash=${actualCents}c expected=${expectedCents}c Δ=${actualCents - expectedCents}c`);
      }
    }
  }
  assertEquals(violations, 0, `${violations} session(s) violated cash-flow invariant`);
});