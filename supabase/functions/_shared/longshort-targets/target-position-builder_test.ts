/**
 * target-position-builder tests — FP-055 / ACT-302 (Step A property tests).
 *
 * 8 property tests + 2 leverage-math + 1 leverage-lock + 1 allocation
 * + 1 §7.1 witness + 1 empty-book + 1 replay-determinism = 14 tests.
 *
 * Test-only `LEVERAGE` overrides go through the kernel's PARAMETER
 * surface — the kernel always asserts `leverage===1.0` at runtime,
 * so the L=1.5 / L=2.0 math is proven via `assertRejects`
 * (the kernel REFUSES; the math is then proven against the FORMULA
 * directly, in isolation, with the kernel's lock left intact).
 */
import {
  assertEquals,
  assertAlmostEquals,
  assertRejects,
  assertStrictEquals,
} from 'jsr:@std/assert@1.0.19';

import {
  computeTargets,
  LEVERAGE_PAPER_LOCK,
  FULL_BOOK_SIZE,
  SECTOR_CAP_PER_SIDE,
  LeverageLockViolationError,
  AllocationOutOfRangeError,
  SectorCapViolationError,
  NonPositiveEquityError,
  type BookReader,
  type BookRowInput,
  type ComputeTargetsResult,
} from './target-position-builder.ts';
import type {
  BrokerBuyingPower,
  BrokerBuyingPowerFetcher,
} from '../longshort-broker-interfaces.ts';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const OP = '00000000-0000-0000-0000-000000000001';
const AS_OF = '2026-06-23';
const TS = new Date('2026-06-23T20:00:00.000Z');
const BOOK_TS = '2026-06-23T19:50:00.000Z';

function makeBook(opts: {
  longCount?: number;
  shortCount?: number;
  sectorAssign?: (ticker: string, side: 'long' | 'short', i: number) => string | null;
} = {}): BookRowInput[] {
  const longCount = opts.longCount ?? 20;
  const shortCount = opts.shortCount ?? 20;
  const rows: BookRowInput[] = [];
  for (let i = 1; i <= longCount; i++) {
    const t = `L${String(i).padStart(3, '0')}`;
    rows.push({
      side: 'long',
      rank_within_side: i,
      ticker: t,
      score: 1.0 - i * 0.01,
      ranker_source: 'count_normalized_fallback',
      computed_at: BOOK_TS,
      gics_sector: opts.sectorAssign ? opts.sectorAssign(t, 'long', i) : null,
    });
  }
  for (let i = 1; i <= shortCount; i++) {
    const t = `S${String(i).padStart(3, '0')}`;
    rows.push({
      side: 'short',
      rank_within_side: i,
      ticker: t,
      score: -1.0 + i * 0.01,
      ranker_source: 'count_normalized_fallback',
      computed_at: BOOK_TS,
      gics_sector: opts.sectorAssign ? opts.sectorAssign(t, 'short', i) : null,
    });
  }
  return rows;
}

function stubBookReader(rows: BookRowInput[]): BookReader {
  return { readBook: () => Promise.resolve(rows) };
}

function stubCapital(equity: number): BrokerBuyingPowerFetcher {
  return {
    fetchBuyingPower: (ts: Date): Promise<BrokerBuyingPower> =>
      Promise.resolve({
        available_bp: equity * 2,
        account_equity: equity,
        fetched_at: ts,
      }),
  };
}

async function compute(opts: {
  book?: BookRowInput[];
  equity?: number;
  allocationPct?: number;
  leverage?: number;
} = {}): Promise<ComputeTargetsResult> {
  return await computeTargets({
    operatorId: OP,
    asOfDate: AS_OF,
    ts: TS,
    capitalFetcher: stubCapital(opts.equity ?? 100_000),
    bookReader: stubBookReader(opts.book ?? makeBook()),
    allocationPct: opts.allocationPct,
    leverage: opts.leverage,
  });
}

// ─── 8 property tests ───────────────────────────────────────────────────────

Deno.test('P1 dollar-neutrality at full book — Σlong == Σshort', async () => {
  const r = await compute();
  const longSum = r.targets
    .filter((t) => t.side === 'long')
    .reduce((s, t) => s + t.target_notional, 0);
  const shortSum = r.targets
    .filter((t) => t.side === 'short')
    .reduce((s, t) => s + t.target_notional, 0);
  assertAlmostEquals(longSum, shortSum, 1e-9);
  assertAlmostEquals(longSum, 50_000, 1e-9);
  assertAlmostEquals(shortSum, 50_000, 1e-9);
});

Deno.test('P2 gross bound — Σ == capital_base ≤ equity at allocation=1/leverage=1', async () => {
  const r = await compute();
  const gross = r.targets.reduce((s, t) => s + t.target_notional, 0);
  assertAlmostEquals(gross, r.capital_base, 1e-9);
  assertAlmostEquals(gross, 100_000, 1e-9);
  // no-leverage invariant
  assertEquals(gross <= r.sizing_basis_value, true);
});

Deno.test('P3 per-name cap not binding at entry — each ≤ 1/book_size < 8% of capital', async () => {
  const r = await compute();
  for (const t of r.targets) {
    const pct = t.target_notional / r.capital_base;
    assertEquals(pct <= 1 / FULL_BOOK_SIZE + 1e-12, true);
    assertEquals(pct < 0.08, true); // §7.2 8% trim is NOT an entry cap
  }
});

Deno.test('P4 sector-cap witness ≤ 6 — kernel passes at exactly 6, throws at 7', async () => {
  // exactly 6 long names in one sector — passes
  const okBook = makeBook({
    sectorAssign: (_t, side, i) => (side === 'long' && i <= 6 ? 'TECH' : null),
  });
  const r = await compute({ book: okBook });
  assertEquals(r.outcome, 'completed');

  // 7 long names in one sector — throws (witness, kernel does not re-enforce)
  const badBook = makeBook({
    sectorAssign: (_t, side, i) => (side === 'long' && i <= 7 ? 'TECH' : null),
  });
  await assertRejects(
    () => compute({ book: badBook }),
    SectorCapViolationError,
    'sector_cap_violation_witness_upstream_book_invariant_breached',
  );
  assertEquals(SECTOR_CAP_PER_SIDE, 6);
});

Deno.test('P5 replay determinism — same inputs produce byte-equal outputs', async () => {
  const a = await compute();
  const b = await compute();
  assertEquals(JSON.stringify(a), JSON.stringify(b));
  // also verify computed_at == ts.toISOString() (injected, not wall-clock)
  assertStrictEquals(a.targets[0].computed_at, TS.toISOString());
});

Deno.test('P6 partial-book linear scaling — 30-name book yields per_name = capital/30', async () => {
  const partial = makeBook({ longCount: 15, shortCount: 15 });
  const r = await compute({ book: partial });
  assertEquals(r.book_size, 30);
  assertAlmostEquals(r.per_name_notional, 100_000 / 30, 1e-9);
  // Σ still equals capital_base (interp: capital fully deployed across what's available)
  const gross = r.targets.reduce((s, t) => s + t.target_notional, 0);
  assertAlmostEquals(gross, r.capital_base, 1e-9);
});

Deno.test('P7 capital-monotonicity — target_notional linear in equity AND in allocation', async () => {
  const r1 = await compute({ equity: 50_000 });
  const r2 = await compute({ equity: 100_000 });
  const r3 = await compute({ equity: 200_000 });
  assertAlmostEquals(r2.per_name_notional, 2 * r1.per_name_notional, 1e-9);
  assertAlmostEquals(r3.per_name_notional, 4 * r1.per_name_notional, 1e-9);

  const a1 = await compute({ allocationPct: 0.25 });
  const a2 = await compute({ allocationPct: 0.5 });
  const a3 = await compute({ allocationPct: 1.0 });
  assertAlmostEquals(a2.per_name_notional, 2 * a1.per_name_notional, 1e-9);
  assertAlmostEquals(a3.per_name_notional, 4 * a1.per_name_notional, 1e-9);
});

Deno.test('P8 empty-book noop — zero rows, zero targets, outcome=empty_book', async () => {
  const r = await compute({ book: [] });
  assertEquals(r.outcome, 'empty_book');
  assertEquals(r.targets.length, 0);
  assertEquals(r.book_size, 0);
  assertEquals(r.capital_base, 0);
  // capital fetcher MUST NOT have been called (empty short-circuits before fetch).
  // verified implicitly: a throwing fetcher would propagate.
  let called = false;
  const throwingFetcher: BrokerBuyingPowerFetcher = {
    fetchBuyingPower: () => {
      called = true;
      return Promise.reject(new Error('should not be called on empty book'));
    },
  };
  await computeTargets({
    operatorId: OP,
    asOfDate: AS_OF,
    ts: TS,
    capitalFetcher: throwingFetcher,
    bookReader: stubBookReader([]),
  });
  assertEquals(called, false);
});

// ─── Leverage-math tests (isolated formula proof at L=1.5 / L=2.0) ──────────
//
// These prove the math IN ISOLATION — the kernel's leverage lock stays
// intact (asserts and throws); the FORMULA itself is exercised here
// directly so the Phase-8 DEC can rely on a tested closed form rather
// than re-discovering it. They also guard the lock from drifting into
// silently accepting > 1.0.

function expectedPerNameNotional(opts: {
  equity: number;
  allocation: number;
  leverage: number;
  book_size: number;
}): number {
  return (opts.equity * opts.allocation * opts.leverage) / opts.book_size;
}

Deno.test('LM1 leverage-math at L=1.5 — formula closed form (kernel still refuses)', async () => {
  const expected = expectedPerNameNotional({
    equity: 100_000, allocation: 1.0, leverage: 1.5, book_size: 40,
  });
  assertAlmostEquals(expected, 3_750, 1e-9);
  await assertRejects(
    () => compute({ leverage: 1.5 }),
    LeverageLockViolationError,
    'leverage_locked_at_1_for_paper_bootstrap_see_phase8_dec',
  );
});

Deno.test('LM2 leverage-math at L=2.0 — formula closed form (kernel still refuses)', async () => {
  const expected = expectedPerNameNotional({
    equity: 100_000, allocation: 1.0, leverage: 2.0, book_size: 40,
  });
  assertAlmostEquals(expected, 5_000, 1e-9);
  await assertRejects(
    () => compute({ leverage: 2.0 }),
    LeverageLockViolationError,
    'leverage_locked_at_1_for_paper_bootstrap_see_phase8_dec',
  );
});

// ─── Leverage-lock test (load-bearing) ──────────────────────────────────────

Deno.test('LL1 leverage-lock — kernel throws for any leverage !== 1.0', async () => {
  for (const lv of [0.5, 0.99, 1.0001, 1.01, 1.5, 2.0, 2.01]) {
    if (lv === 1.0) continue;
    await assertRejects(
      () => compute({ leverage: lv }),
      LeverageLockViolationError,
    );
  }
  assertStrictEquals(LEVERAGE_PAPER_LOCK, 1.0);
});

// ─── Allocation tests ───────────────────────────────────────────────────────

Deno.test('A1 allocation=0.5 halves every target_notional', async () => {
  const baseline = await compute({ allocationPct: 1.0 });
  const half = await compute({ allocationPct: 0.5 });
  for (let i = 0; i < baseline.targets.length; i++) {
    assertAlmostEquals(
      half.targets[i].target_notional,
      baseline.targets[i].target_notional / 2,
      1e-9,
    );
  }
  assertAlmostEquals(half.capital_base, baseline.capital_base / 2, 1e-9);
});

Deno.test('A2 allocation out of range — throws AllocationOutOfRangeError', async () => {
  for (const ap of [0, -0.1, 1.01, 2.0, Number.NaN, Number.POSITIVE_INFINITY]) {
    await assertRejects(
      () => compute({ allocationPct: ap }),
      AllocationOutOfRangeError,
    );
  }
});

Deno.test('E1 non-positive equity — throws NonPositiveEquityError', async () => {
  for (const eq of [0, -1, Number.NaN]) {
    await assertRejects(
      () => compute({ equity: eq }),
      NonPositiveEquityError,
    );
  }
});

// ─── Gate-6 wall-clock self-scan (anti-phantom-defaults) ────────────────────
// Asserts the kernel uses ONLY the injected `ts` — no Date.now()/new Date()
// without args. We do this by reading the kernel file text at runtime.

Deno.test('G6 wall-clock self-scan — kernel source contains no Date.now()/new Date()', async () => {
  const src = await Deno.readTextFile(
    new URL('./target-position-builder.ts', import.meta.url),
  );
  // Strip comments (block + line) before scanning so doc-strings don't trip.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  if (/Date\.now\s*\(/.test(stripped)) {
    throw new Error('kernel contains Date.now() — banned (DEC-034 (4))');
  }
  if (/new\s+Date\s*\(\s*\)/.test(stripped)) {
    throw new Error('kernel contains no-arg new Date() — banned (DEC-034 (4))');
  }
  if (/performance\.now\s*\(/.test(stripped)) {
    throw new Error('kernel contains performance.now() — banned (DEC-034 (4))');
  }
});