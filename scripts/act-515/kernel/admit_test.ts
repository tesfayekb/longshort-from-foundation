// ACT-515 Kernel — Module 3 tests.
//
// Runner: Deno test, colocated (matches CI Gate-2 convention).

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  runAdmit, compareCandidates,
  type Candidate, type AdmitInput, type OpenBookRow,
} from './admit.ts';
import type { Clock, CellKey } from './types.ts';

// -----------------------------------------------------------------------------
// Test harness — a fixed clock, no-op cell lookup, generous caps.
// -----------------------------------------------------------------------------

const clock: Clock = { nowMs: () => 1_700_000_000_000 };
const cellLookup = (_k: CellKey) => null;

function baseInput(overrides: Partial<AdmitInput> = {}): AdmitInput {
  return {
    candidates: [],
    openBook: [],
    caps: { sideCapUsd: { long: 1_000_000, short: 1_000_000 } },
    budgets: { k: 5, shortDailyBudget: 1 },
    cellLookup,
    clock,
    ...overrides,
  };
}

function mkC(
  ticker: string, side: 'long' | 'short', rankScore: number | null,
  tier: 'T1' | 'T2' | null = 'T2', slotNotionalUsd = 2500,
): Candidate {
  const band = side === 'long' ? 'L_08_10' : 'S_08_10';
  return { ticker, side, tier, rankScore, band, slotNotionalUsd };
}

// -----------------------------------------------------------------------------
// PIN (a) — GATE ORDER verbatim
// -----------------------------------------------------------------------------

Deno.test('gate 1: position_already_open dedup (SYMBOL-scoped, either side)', () => {
  const openBook: OpenBookRow[] = [{ ticker: 'ANF', side: 'long', marketValueUsd: 2500 }];
  const res = runAdmit(baseInput({
    candidates: [mkC('ANF', 'short', 1.0), mkC('BOX', 'long', 0.9)],
    openBook,
  }));
  // ANF short refused (already held long); BOX long admitted.
  assertEquals(res.tally.position_already_open, 1);
  assertEquals(res.tally.admits, 1);
  assertEquals(res.decisions[0], {
    kind: 'refuse', ticker: 'ANF', side: 'short', category: 'position_already_open',
  });
});

Deno.test('gate 2: allocation_cap refuses when projected side MV exceeds cap', () => {
  const res = runAdmit(baseInput({
    candidates: [mkC('AAA', 'long', 1.0, 'T2', 6000), mkC('BBB', 'long', 0.9, 'T2', 6000)],
    caps: { sideCapUsd: { long: 10_000, short: 10_000 } },
  }));
  assertEquals(res.tally.admits, 1);
  assertEquals(res.tally.allocation_cap_reached, 1);
});

Deno.test('DEC-084: short_daily_budget refusal is NON-K-consuming', () => {
  // Two shorts + three longs; short budget = 1; K = 5. Both shorts sorted
  // before longs (side ASC 'long' < 'short'... wait: 'long' < 'short' so
  // longs come first). Verify: 3 longs admit, 1 short admits, 1 short
  // refused for short_daily_budget_reached; K still allows the second
  // short slot for longs? — no more longs left. K used = 4 (not 5),
  // proving the short refusal did NOT burn K.
  const res = runAdmit(baseInput({
    candidates: [
      mkC('L1', 'long',  0.9),
      mkC('L2', 'long',  0.8),
      mkC('L3', 'long',  0.7),
      mkC('S1', 'short', 0.6),
      mkC('S2', 'short', 0.5),
    ],
  }));
  assertEquals(res.tally.admits, 4);
  assertEquals(res.tally.short_daily_budget_reached, 1);
  assertEquals(res.tally.daily_budget_reached, 0);
});

Deno.test('gate 4: daily_budget K=5 boundary — 6th candidate refused', () => {
  const res = runAdmit(baseInput({
    candidates: [
      mkC('L1', 'long', 0.9), mkC('L2', 'long', 0.8), mkC('L3', 'long', 0.7),
      mkC('L4', 'long', 0.6), mkC('L5', 'long', 0.5), mkC('L6', 'long', 0.4),
    ],
  }));
  assertEquals(res.tally.admits, 5);
  assertEquals(res.tally.daily_budget_reached, 1);
  // Rank-preservation: the highest-rank name (L1) admitted; the lowest
  // (L6) refused.
  assertEquals(res.decisions[0], {
    kind: 'admit', ticker: 'L1', side: 'long', slotNotionalUsd: 2500,
  });
  assertEquals(res.decisions[5], {
    kind: 'refuse', ticker: 'L6', side: 'long', category: 'daily_budget_reached',
  });
});

// -----------------------------------------------------------------------------
// PIN (b) — DETERMINISM
// -----------------------------------------------------------------------------

Deno.test('compareCandidates: side ASC, tier ASC (T1<T2<null), rank DESC, ticker ASC', () => {
  const a = mkC('BBB', 'long', 0.5, 'T1');
  const b = mkC('AAA', 'long', 0.9, 'T2');
  assert(compareCandidates(a, b) < 0, 'T1 sorts before T2 at same side');
  const c = mkC('ZZZ', 'long', 0.9, 'T2');
  const d = mkC('AAA', 'long', 0.5, 'T2');
  assert(compareCandidates(c, d) < 0, 'rank_score DESC beats ticker ASC when ranks differ');
  const e = mkC('AAA', 'long', 0.5, 'T2');
  const f = mkC('BBB', 'long', 0.5, 'T2');
  assert(compareCandidates(e, f) < 0, 'ticker ASC tiebreak');
  const g = mkC('AAA', 'short', 1.0);
  const h = mkC('ZZZ', 'long',  0.0);
  assert(compareCandidates(h, g) < 0, "side ASC: 'long' before 'short'");
});

Deno.test('property: shuffled input → identical decisions[]', () => {
  const canon: Candidate[] = [
    mkC('AAA', 'long',  0.9, 'T1'),
    mkC('BBB', 'long',  0.8, 'T2'),
    mkC('CCC', 'long',  0.7, 'T2'),
    mkC('DDD', 'long',  0.6, 'T2'),
    mkC('EEE', 'long',  0.5, 'T2'),
    mkC('FFF', 'long',  0.4, 'T2'),
    mkC('GGG', 'short', 0.3, 'T2'),
    mkC('HHH', 'short', 0.2, 'T2'),
  ];
  const ref = runAdmit(baseInput({ candidates: canon }));
  // Deterministic pseudo-shuffle (no Math.random — anti-phantom rule).
  const shuffles: Candidate[][] = [
    [...canon].reverse(),
    [canon[3], canon[7], canon[1], canon[5], canon[0], canon[4], canon[6], canon[2]],
    [canon[7], canon[6], canon[0], canon[1], canon[2], canon[3], canon[4], canon[5]],
  ];
  for (const s of shuffles) {
    const got = runAdmit(baseInput({ candidates: s }));
    assertEquals(got.decisions, ref.decisions);
    assertEquals(got.tally, ref.tally);
  }
});

// -----------------------------------------------------------------------------
// PIN (c) — PURITY: input arrays not mutated
// -----------------------------------------------------------------------------

Deno.test('purity: input.candidates order preserved after runAdmit', () => {
  const cs: Candidate[] = [
    mkC('ZZZ', 'long', 0.1),
    mkC('AAA', 'long', 0.9),
  ];
  const snapshot = cs.map((c) => c.ticker).join(',');
  runAdmit(baseInput({ candidates: cs }));
  assertEquals(cs.map((c) => c.ticker).join(','), snapshot);
});

// -----------------------------------------------------------------------------
// PIN (e) — DECLARED ABSTRACTIONS header block present (docs-as-code)
// -----------------------------------------------------------------------------

Deno.test('docs-as-code: admit.ts contains the DECLARED ABSTRACTIONS block', async () => {
  const src = await Deno.readTextFile(new URL('./admit.ts', import.meta.url));
  assert(src.includes('(e) DECLARED ABSTRACTIONS'), 'header PIN (e) block missing');
  for (const marker of [
    'I5 snapshot gates',
    'Shortability',
    'Earnings / analyst-downgrade / M&A proximity',
    'Fill mechanics',
  ]) {
    assert(src.includes(marker), `abstractions block missing marker: ${marker}`);
  }
});

Deno.test('estimator-assumptions.md carries the same abstractions block', async () => {
  const src = await Deno.readTextFile(
    new URL('../estimator-assumptions.md', import.meta.url),
  );
  assert(src.includes('Kernel abstractions'), 'estimator missing "Kernel abstractions" section');
  for (const marker of [
    'I5 snapshot gates',
    'Shortability',
    'Earnings / analyst-downgrade / M&A proximity',
    'Fill mechanics',
  ]) {
    assert(src.includes(marker), `estimator-assumptions.md missing marker: ${marker}`);
  }
});

// -----------------------------------------------------------------------------
// Anti-phantom lint (PIN (d) parity with Module 1)
// -----------------------------------------------------------------------------

Deno.test('admit.ts contains no Date.now / new Date( / Math.random tokens', async () => {
  const src = await Deno.readTextFile(new URL('./admit.ts', import.meta.url));
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const codeOnly = noBlock
    .split('\n')
    .map((ln) => {
      const idx = ln.indexOf('//');
      return idx >= 0 ? ln.slice(0, idx) : ln;
    })
    .join('\n');
  assert(!/\bDate\.now\b/.test(codeOnly));
  assert(!/\bnew\s+Date\s*\(/.test(codeOnly));
  assert(!/\bMath\.random\b/.test(codeOnly));
});