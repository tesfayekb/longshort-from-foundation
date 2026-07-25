// ACT-515 Kernel — Module 5 tests.
//
// Runner: Deno test, colocated (CI Gate-2 convention).

import { assertEquals, assert, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  markBook, makeBars, MapBarSource,
  type OpenLot, type PriorMark,
} from './mark.ts';
import { price, shares, money } from './types.ts';

// -----------------------------------------------------------------------------
// PIN (a) — BarSource injected; typed-absence returned as null
// -----------------------------------------------------------------------------

Deno.test('PIN (a) MapBarSource returns null on absent bar (no fabrication)', () => {
  const bars = makeBars([['AAPL', '2026-07-27', 200.00]]);
  assertEquals((bars.close('AAPL', '2026-07-27') as number), 200.00);
  assertEquals(bars.close('AAPL', '2026-07-28'), null);
  assertEquals(bars.close('MSFT', '2026-07-27'), null);
});

// -----------------------------------------------------------------------------
// PIN (b) — Sign conventions (grep-anchored to overshoot-equity-snapshot)
// -----------------------------------------------------------------------------

Deno.test('PIN (b) long unrealized = (mark - entry) * shares; MV positive', () => {
  const lots: OpenLot[] = [{
    lotId: 'L1', ticker: 'AAPL', side: 'long',
    shares: shares(10), entryPrice: price(100),
  }];
  const bars = makeBars([['AAPL', '2026-07-27', 110]]);
  const r = markBook(lots, '2026-07-27', bars);
  assert(r.perLot[0].ok);
  if (!r.perLot[0].ok) return;
  assertEquals(r.perLot[0].unrealizedUsd as number, 100);   // (110-100)*10
  assertEquals(r.perLot[0].marketValueUsd as number, 1100); // positive
  assertEquals(r.book.longMv as number, 1100);
  assertEquals(r.book.shortMv as number, 0);
  assertEquals(r.book.grossExposureUsd as number, 1100);
  assertEquals(r.book.netExposureUsd as number, 1100);
});

Deno.test('PIN (b) short unrealized = (entry - mark) * shares; MV NEGATIVE', () => {
  const lots: OpenLot[] = [{
    lotId: 'S1', ticker: 'TSLA', side: 'short',
    shares: shares(10), entryPrice: price(200),
  }];
  const bars = makeBars([['TSLA', '2026-07-27', 180]]);
  const r = markBook(lots, '2026-07-27', bars);
  assert(r.perLot[0].ok);
  if (!r.perLot[0].ok) return;
  assertEquals(r.perLot[0].unrealizedUsd as number, 200);    // (200-180)*10 = profit
  assertEquals(r.perLot[0].marketValueUsd as number, -1800); // NEGATIVE per prod
  assertEquals(r.book.longMv as number, 0);
  assertEquals(r.book.shortMv as number, -1800);
  assertEquals(r.book.grossExposureUsd as number, 1800);     // |shortMv|
  assertEquals(r.book.netExposureUsd as number, -1800);
});

Deno.test('PIN (b/e) sign symmetry — mirror positions produce negated unrealized', () => {
  // Same entry, same mark, same shares, opposite sides.
  const lots: OpenLot[] = [
    { lotId: 'A', ticker: 'X', side: 'long',  shares: shares(7), entryPrice: price(50) },
    { lotId: 'B', ticker: 'X', side: 'short', shares: shares(7), entryPrice: price(50) },
  ];
  const bars = makeBars([['X', '2026-07-27', 55]]);
  const r = markBook(lots, '2026-07-27', bars);
  assert(r.perLot[0].ok && r.perLot[1].ok);
  if (!(r.perLot[0].ok && r.perLot[1].ok)) return;
  assertEquals(
    r.perLot[0].unrealizedUsd as number,
    -(r.perLot[1].unrealizedUsd as number),
  );
  // Long MV positive, short MV negative, gross = 2× notional at mark.
  assertEquals(r.book.grossExposureUsd as number, 55 * 7 * 2);
  assertEquals(r.book.netExposureUsd as number, 0);
});

// -----------------------------------------------------------------------------
// PIN (c) — Missing-bar policy: carry-forward staleness ladder
// -----------------------------------------------------------------------------

Deno.test('PIN (c) staleness ladder 0 → 1 → 5, refuse at 6 (default maxCarryDays=5)', () => {
  const lots: OpenLot[] = [{
    lotId: 'L1', ticker: 'AAPL', side: 'long',
    shares: shares(10), entryPrice: price(100),
  }];
  // Day 0 fresh, days 1-6 absent.
  const bars = makeBars([['AAPL', '2026-07-27', 120]]);
  const dates = ['2026-07-27','2026-07-28','2026-07-29','2026-07-30','2026-07-31','2026-08-03','2026-08-04'];
  const stalenessSeen: Array<number | 'refused'> = [];
  let prior = new Map<string, PriorMark>();
  for (const d of dates) {
    const r = markBook(lots, d, bars, { priorMarks: prior });
    const lm = r.perLot[0];
    if (lm.ok) stalenessSeen.push(lm.stalenessDays);
    else stalenessSeen.push('refused');
    prior = new Map(r.nextPriorMarks);
  }
  assertEquals(stalenessSeen, [0, 1, 2, 3, 4, 5, 'refused']);
});

Deno.test('PIN (c) refused day breaks the carry chain (next fresh bar resets staleness=0)', () => {
  const lots: OpenLot[] = [{
    lotId: 'L1', ticker: 'AAPL', side: 'long',
    shares: shares(1), entryPrice: price(100),
  }];
  const bars = makeBars([
    ['AAPL', '2026-07-27', 100],
    // 6 missing days → refusal on day 7
    ['AAPL', '2026-08-05', 105],
  ]);
  const dates = ['2026-07-27','2026-07-28','2026-07-29','2026-07-30','2026-07-31','2026-08-03','2026-08-04','2026-08-05'];
  let prior = new Map<string, PriorMark>();
  let last: ReturnType<typeof markBook> | null = null;
  for (const d of dates) {
    last = markBook(lots, d, bars, { priorMarks: prior });
    prior = new Map(last.nextPriorMarks);
  }
  assert(last);
  assert(last!.perLot[0].ok);
  if (!last!.perLot[0].ok) return;
  assertEquals(last!.perLot[0].source, 'fresh');
  assertEquals(last!.perLot[0].stalenessDays, 0);
});

Deno.test('PIN (c) maxCarryDays=0 refuses immediately on missing bar', () => {
  const lots: OpenLot[] = [{
    lotId: 'L1', ticker: 'X', side: 'long', shares: shares(1), entryPrice: price(10),
  }];
  const bars = makeBars([['X', '2026-07-27', 10]]);
  const r1 = markBook(lots, '2026-07-27', bars, { maxCarryDays: 0 });
  const r2 = markBook(lots, '2026-07-28', bars, { maxCarryDays: 0, priorMarks: r1.nextPriorMarks });
  assert(!r2.perLot[0].ok);
  if (r2.perLot[0].ok) return;
  assertEquals(r2.perLot[0].refusal, 'mark_unavailable');
});

Deno.test('PIN (c) entry-day missing bar yields mark_unavailable, NOT entry echo', () => {
  const lots: OpenLot[] = [{
    lotId: 'L1', ticker: 'NEW', side: 'long',
    shares: shares(5), entryPrice: price(50),
  }];
  const bars = new MapBarSource(new Map());  // empty
  const r = markBook(lots, '2026-07-27', bars);
  assert(!r.perLot[0].ok);
  if (r.perLot[0].ok) return;
  assertEquals(r.perLot[0].refusal, 'mark_unavailable');
  assertEquals(r.perLot[0].stalenessDays, 0);
  assertEquals(r.book.unavailableLots, 1);
  assertEquals(r.book.pricedLots, 0);
  assertEquals(r.book.longMv as number, 0);
});

Deno.test('PIN (c) negative or non-integer maxCarryDays rejected', () => {
  const lots: OpenLot[] = [];
  const bars = new MapBarSource(new Map());
  assertThrows(() => markBook(lots, '2026-07-27', bars, { maxCarryDays: -1 }));
  assertThrows(() => markBook(lots, '2026-07-27', bars, { maxCarryDays: 1.5 }));
});

// -----------------------------------------------------------------------------
// PIN (d) — Output shape + aggregate foot to per-lot sums to the cent
// -----------------------------------------------------------------------------

Deno.test('PIN (d/e) aggregates foot to per-lot sums to the cent', () => {
  const lots: OpenLot[] = [
    { lotId: 'A', ticker: 'X', side: 'long',  shares: shares(3), entryPrice: price(10.11) },
    { lotId: 'B', ticker: 'Y', side: 'long',  shares: shares(7), entryPrice: price(33.33) },
    { lotId: 'C', ticker: 'Z', side: 'short', shares: shares(5), entryPrice: price(21.21) },
  ];
  const bars = makeBars([
    ['X', '2026-07-27', 12.34],
    ['Y', '2026-07-27', 30.00],
    ['Z', '2026-07-27', 20.20],
  ]);
  const r = markBook(lots, '2026-07-27', bars);
  // Sum per-lot in cents; compare to aggregate in cents.
  const cents = (u: number) => Math.round(u * 100);
  let longCents = 0, shortCents = 0, unrealCents = 0;
  for (const l of r.perLot) {
    assert(l.ok);
    if (!l.ok) return;
    unrealCents += cents(l.unrealizedUsd as number);
    if (l.side === 'long') longCents += cents(l.marketValueUsd as number);
    else shortCents += cents(l.marketValueUsd as number);
  }
  assertEquals(cents(r.book.longMv as number), longCents);
  assertEquals(cents(r.book.shortMv as number), shortCents);
  assertEquals(cents(r.book.unrealizedTotalUsd as number), unrealCents);
  assertEquals(
    cents(r.book.grossExposureUsd as number),
    longCents + Math.abs(shortCents),
  );
  assertEquals(cents(r.book.netExposureUsd as number), longCents + shortCents);
  assertEquals(r.book.pricedLots, 3);
  assertEquals(r.book.staleLots, 0);
  assertEquals(r.book.unavailableLots, 0);
});

Deno.test('PIN (d) carry-forward counted as stale, not fresh; aggregates mix cleanly', () => {
  const lots: OpenLot[] = [
    { lotId: 'A', ticker: 'X', side: 'long', shares: shares(1), entryPrice: price(10) },
    { lotId: 'B', ticker: 'Y', side: 'long', shares: shares(1), entryPrice: price(10) },
  ];
  const bars = makeBars([
    ['X', '2026-07-27', 11], ['Y', '2026-07-27', 11],
    ['X', '2026-07-28', 12], // Y absent
  ]);
  const r1 = markBook(lots, '2026-07-27', bars);
  const r2 = markBook(lots, '2026-07-28', bars, { priorMarks: r1.nextPriorMarks });
  assertEquals(r2.book.pricedLots, 2);
  assertEquals(r2.book.staleLots, 1);
  assertEquals(r2.book.unavailableLots, 0);
});

// -----------------------------------------------------------------------------
// Docs-as-code sync — Module 5 policy summary line duplicated in
// estimator-assumptions.md §9 (same pattern as Module 3 §7 / Module 4 §8).
// -----------------------------------------------------------------------------

Deno.test('docs-as-code: missing-bar policy summary appears in both mark.ts and estimator-assumptions.md §9', async () => {
  const marker =
    'Carry-forward-last-close is allowed up to `maxCarryDays`';
  const src = await Deno.readTextFile(new URL('./mark.ts', import.meta.url));
  const md = await Deno.readTextFile(new URL('../estimator-assumptions.md', import.meta.url));
  assert(src.includes(marker), 'mark.ts must carry the policy summary line');
  assert(md.includes(marker), 'estimator-assumptions.md §9 must carry the same line');
  assert(/## 9\. Missing-bar policy \(ACT-515 Module 5 — Mark\)/.test(md),
    'estimator-assumptions.md must contain §9 header for Module 5');
});

// -----------------------------------------------------------------------------
// PIN (d)-adjacent — anti-phantom lint: no wall-clock / RNG in the kernel module.
// -----------------------------------------------------------------------------

Deno.test('mark.ts contains no Date.now / new Date( / Math.random tokens', async () => {
  const src = await Deno.readTextFile(new URL('./mark.ts', import.meta.url));
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const codeOnly = noBlock
    .split('\n')
    .map((ln) => {
      const idx = ln.indexOf('//');
      return idx >= 0 ? ln.slice(0, idx) : ln;
    })
    .join('\n');
  assert(!/\bDate\.now\b/.test(codeOnly), 'Date.now forbidden in kernel');
  assert(!/\bnew\s+Date\s*\(/.test(codeOnly), 'new Date( forbidden in kernel');
  assert(!/\bMath\.random\b/.test(codeOnly), 'Math.random forbidden in kernel');
});