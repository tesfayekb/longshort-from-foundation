// ACT-515 Kernel — Module 6 tests.
//
// Runner: Deno test, colocated (CI Gate-2 convention).

import { assertEquals, assert, assertThrows, assertAlmostEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  runExit, cashRequired, settleProceeds,
  ArraySessionCalendar, EXIT_ORDINAL_BY_TIER, HAIRCUT_BPS_BY_SIDE,
  type ExitInput,
} from './exit.ts';
import { makeBars, MapBarSource } from './mark.ts';
import { price, shares, money } from './types.ts';

// -----------------------------------------------------------------------------
// Fixture-anchored calendar (2024-05-02 hand-truth grid, event → ord-10)
// -----------------------------------------------------------------------------

const HAND_TRUTH_SESSIONS = [
  '2024-05-02', '2024-05-03', '2024-05-06', '2024-05-07', '2024-05-08',
  '2024-05-09', '2024-05-10', '2024-05-13', '2024-05-14', '2024-05-15', '2024-05-16',
  // buffer for deferral tests
  '2024-05-17', '2024-05-20', '2024-05-21',
] as const;

function handTruthCalendar() { return new ArraySessionCalendar(HAND_TRUTH_SESSIONS as unknown as string[]); }

// -----------------------------------------------------------------------------
// PIN (a) — ordinal-from-event; T2=ord-10 reproduces fixture header
// -----------------------------------------------------------------------------

Deno.test('PIN (a) T2 ord-10 from event 2024-05-02 = 2024-05-16 (fixture-provable)', () => {
  const cal = handTruthCalendar();
  assertEquals(cal.sessionAfter('2024-05-02', 1), '2024-05-03');
  assertEquals(cal.sessionAfter('2024-05-02', 10), '2024-05-16');
  assertEquals(EXIT_ORDINAL_BY_TIER.T2, 10);
  assertEquals(EXIT_ORDINAL_BY_TIER.T1, 6);
});

Deno.test('PIN (a) T2 fixture row ANF byte-exact under haircutMode:none', () => {
  // Hand-truth row: entry 126.62, exit 135.69, 19 shares, pnl 172.33
  const cal = handTruthCalendar();
  const bars = makeBars([['ANF', '2024-05-16', 135.69]]);
  const r = runExit({
    lotId: 'ANF#1', ticker: 'ANF', side: 'long', tier: 'T2',
    shares: shares(19), entryPrice: price(126.62), eventDate: '2024-05-02',
  }, cal, bars, { haircutMode: 'none' });
  assert(r.ok); if (!r.ok) return;
  assertEquals(r.scheduledExitDate, '2024-05-16');
  assertEquals(r.actualExitDate, '2024-05-16');
  assertEquals(r.stalenessDays, 0);
  assertEquals(r.haircutBpsPerSide, 0);
  assertEquals(r.grossRealizedUsd as number, 172.33);
  assertEquals(r.realizedUsd as number, 172.33);   // haircutMode:none → identical
});

Deno.test('PIN (a) T1 ord-6 reaches 2024-05-10 from same event', () => {
  const cal = handTruthCalendar();
  const bars = makeBars([['X', '2024-05-10', 105]]);
  const r = runExit({
    lotId: 'X#1', ticker: 'X', side: 'long', tier: 'T1',
    shares: shares(10), entryPrice: price(100), eventDate: '2024-05-02',
  }, cal, bars, { haircutMode: 'none' });
  assert(r.ok); if (!r.ok) return;
  assertEquals(r.scheduledExitDate, '2024-05-10');
  assertEquals(r.grossRealizedUsd as number, 50);
});

Deno.test('PIN (a) calendar exhausted → typed refusal (no clamp)', () => {
  const cal = new ArraySessionCalendar(['2024-05-02', '2024-05-03', '2024-05-06']);
  const bars = new MapBarSource(new Map());
  const r = runExit({
    lotId: 'X#1', ticker: 'X', side: 'long', tier: 'T2',
    shares: shares(1), entryPrice: price(10), eventDate: '2024-05-02',
  }, cal, bars);
  assert(!r.ok); if (r.ok) return;
  assertEquals(r.refusal, 'exit_calendar_exhausted');
  assertEquals(r.scheduledExitDate, null);
});

// -----------------------------------------------------------------------------
// PIN (b) — haircut applied per side; exit_price_unavailable deferral policy
// -----------------------------------------------------------------------------

Deno.test('PIN (b) long haircut = 5 bps/side; effective entry↑ + effective exit↓', () => {
  const cal = handTruthCalendar();
  const bars = makeBars([['X', '2024-05-16', 110]]);
  const r = runExit({
    lotId: 'X#1', ticker: 'X', side: 'long', tier: 'T2',
    shares: shares(100), entryPrice: price(100), eventDate: '2024-05-02',
  }, cal, bars);   // default haircutMode:'study'
  assert(r.ok); if (!r.ok) return;
  assertEquals(r.haircutBpsPerSide, 5);
  assertAlmostEquals(r.entryPricePostHaircut as number, 100 * 1.0005, 1e-9);
  assertAlmostEquals(r.exitClosePostHaircut  as number, 110 * 0.9995, 1e-9);
  // gross = 100*(110-100)=1000; realized ≈ 100*(110*0.9995 - 100*1.0005) = 100*(109.945 - 100.05)=989.5
  assertEquals(r.grossRealizedUsd as number, 1000);
  assertEquals(r.realizedUsd as number, 989.5);
});

Deno.test('PIN (b) short haircut = 15 bps/side; entry↓ + cover↑', () => {
  const cal = handTruthCalendar();
  const bars = makeBars([['X', '2024-05-16', 90]]);
  const r = runExit({
    lotId: 'X#1', ticker: 'X', side: 'short', tier: 'T2',
    shares: shares(100), entryPrice: price(100), eventDate: '2024-05-02',
  }, cal, bars);
  assert(r.ok); if (!r.ok) return;
  assertEquals(r.haircutBpsPerSide, 15);
  assertAlmostEquals(r.entryPricePostHaircut as number, 100 * 0.9985, 1e-9);
  assertAlmostEquals(r.exitClosePostHaircut  as number,  90 * 1.0015, 1e-9);
  assertEquals(HAIRCUT_BPS_BY_SIDE.short, 15);
  // gross short = 100*(100-90)=1000; realized = 100*(99.85 - 90.135)=971.5
  assertEquals(r.grossRealizedUsd as number, 1000);
  assertEquals(r.realizedUsd as number, 971.5);
});

Deno.test('PIN (b) exit-day bar missing → defers to next priced session with staleness stamp', () => {
  const cal = handTruthCalendar();
  // Scheduled = 05-16 absent; 05-17 present.
  const bars = makeBars([['X', '2024-05-17', 111]]);
  const r = runExit({
    lotId: 'X#1', ticker: 'X', side: 'long', tier: 'T2',
    shares: shares(10), entryPrice: price(100), eventDate: '2024-05-02',
  }, cal, bars, { haircutMode: 'none' });
  assert(r.ok); if (!r.ok) return;
  assertEquals(r.scheduledExitDate, '2024-05-16');
  assertEquals(r.actualExitDate, '2024-05-17');
  assertEquals(r.stalenessDays, 1);
  assertEquals(r.grossRealizedUsd as number, 110);
});

Deno.test('PIN (b) beyond maxCarryDays → typed exit_price_unavailable (no fabricated price)', () => {
  const cal = handTruthCalendar();
  const bars = new MapBarSource(new Map());   // nothing priced
  const r = runExit({
    lotId: 'X#1', ticker: 'X', side: 'long', tier: 'T2',
    shares: shares(1), entryPrice: price(10), eventDate: '2024-05-02',
  }, cal, bars, { maxCarryDays: 2 });
  assert(!r.ok); if (r.ok) return;
  assertEquals(r.refusal, 'exit_price_unavailable');
  assertEquals(r.scheduledExitDate, '2024-05-16');
});

Deno.test('PIN (b) maxCarryDays=0 refuses at first missing exit bar', () => {
  const cal = handTruthCalendar();
  const bars = makeBars([['X', '2024-05-17', 105]]);
  const r = runExit({
    lotId: 'X#1', ticker: 'X', side: 'long', tier: 'T2',
    shares: shares(1), entryPrice: price(10), eventDate: '2024-05-02',
  }, cal, bars, { maxCarryDays: 0 });
  assert(!r.ok); if (r.ok) return;
  assertEquals(r.refusal, 'exit_price_unavailable');
});

// -----------------------------------------------------------------------------
// PIN (c) — Declared abstractions: exitOverride hook default OFF
// -----------------------------------------------------------------------------

Deno.test('PIN (c) exitOverride replaces ordinal exit; reason=override', () => {
  const cal = handTruthCalendar();
  const bars = makeBars([['X', '2024-05-07', 108]]);
  const r = runExit({
    lotId: 'X#1', ticker: 'X', side: 'long', tier: 'T2',
    shares: shares(10), entryPrice: price(100), eventDate: '2024-05-02',
  }, cal, bars, {
    haircutMode: 'none',
    exitOverride: () => ({ exitDate: '2024-05-07', reason: 'dd_stop' }),
  });
  assert(r.ok); if (!r.ok) return;
  assertEquals(r.exitReason, 'override');
  assertEquals(r.actualExitDate, '2024-05-07');
  assertEquals(r.grossRealizedUsd as number, 80);
});

Deno.test('PIN (c) no exitOverride by default; exitReason=ordinal_scheduled', () => {
  const cal = handTruthCalendar();
  const bars = makeBars([['X', '2024-05-16', 100]]);
  const r = runExit({
    lotId: 'X#1', ticker: 'X', side: 'long', tier: 'T2',
    shares: shares(1), entryPrice: price(100), eventDate: '2024-05-02',
  }, cal, bars);
  assert(r.ok); if (!r.ok) return;
  assertEquals(r.exitReason, 'ordinal_scheduled');
});

// -----------------------------------------------------------------------------
// PIN (d) — Cash seam
// -----------------------------------------------------------------------------

Deno.test('PIN (d) cashRequired: long +slot; short −slot', () => {
  assertEquals(cashRequired('long',  money(2500)) as number,  2500);
  assertEquals(cashRequired('short', money(2500)) as number, -2500);
});

Deno.test('PIN (d) settleProceeds: long +proceeds; short −cover-cost', () => {
  assertEquals(settleProceeds('long',  shares(10), price(50)) as number,  500);
  assertEquals(settleProceeds('short', shares(10), price(50)) as number, -500);
});

Deno.test('PIN (d) round-trip: realized = settleProceeds − cashRequired (both sides)', () => {
  const cal = handTruthCalendar();
  const bars = makeBars([['X', '2024-05-16', 110]]);

  // LONG at entry 100, 25 shares, slot 2500 (constant-notional prod baseline).
  const rl = runExit({
    lotId: 'L', ticker: 'X', side: 'long', tier: 'T2',
    shares: shares(25), entryPrice: price(100), eventDate: '2024-05-02',
  }, cal, bars, { haircutMode: 'none' });
  assert(rl.ok); if (!rl.ok) return;
  const cashL = cashRequired('long', money(2500)) as number;             //  2500
  const proceedsL = settleProceeds('long', shares(25), rl.exitClosePostHaircut) as number;  // 2750
  assertEquals(proceedsL - cashL, rl.realizedUsd as number);

  // SHORT mirror.
  const rs = runExit({
    lotId: 'S', ticker: 'X', side: 'short', tier: 'T2',
    shares: shares(25), entryPrice: price(100), eventDate: '2024-05-02',
  }, cal, bars, { haircutMode: 'none' });
  assert(rs.ok); if (!rs.ok) return;
  const cashS = cashRequired('short', money(2500)) as number;            // -2500
  const proceedsS = settleProceeds('short', shares(25), rs.exitClosePostHaircut) as number; // -2750
  assertEquals(proceedsS - cashS, rs.realizedUsd as number);
});

// -----------------------------------------------------------------------------
// PIN (e) — Long/short symmetry vs Module 5 sign conventions
// -----------------------------------------------------------------------------

Deno.test('PIN (e) mirror positions (long vs short, same entry/exit) → negated realized', () => {
  const cal = handTruthCalendar();
  const bars = makeBars([['X', '2024-05-16', 108]]);
  const rl = runExit({
    lotId: 'L', ticker: 'X', side: 'long', tier: 'T2',
    shares: shares(7), entryPrice: price(100), eventDate: '2024-05-02',
  }, cal, bars, { haircutMode: 'none' });
  const rs = runExit({
    lotId: 'S', ticker: 'X', side: 'short', tier: 'T2',
    shares: shares(7), entryPrice: price(100), eventDate: '2024-05-02',
  }, cal, bars, { haircutMode: 'none' });
  assert(rl.ok && rs.ok); if (!(rl.ok && rs.ok)) return;
  assertEquals(rl.grossRealizedUsd as number, -(rs.grossRealizedUsd as number));
  assertEquals(rl.realizedUsd as number,      -(rs.realizedUsd as number));
});

Deno.test('PIN (e) property — realized sign follows convention across a price grid', () => {
  const cal = handTruthCalendar();
  const entries = [50, 100, 200];
  const exits   = [40, 100, 250];
  for (const e of entries) {
    for (const x of exits) {
      const bars = makeBars([['X', '2024-05-16', x]]);
      const rl = runExit({
        lotId: 'L', ticker: 'X', side: 'long', tier: 'T2',
        shares: shares(3), entryPrice: price(e), eventDate: '2024-05-02',
      }, cal, bars, { haircutMode: 'none' });
      const rs = runExit({
        lotId: 'S', ticker: 'X', side: 'short', tier: 'T2',
        shares: shares(3), entryPrice: price(e), eventDate: '2024-05-02',
      }, cal, bars, { haircutMode: 'none' });
      assert(rl.ok && rs.ok); if (!(rl.ok && rs.ok)) return;
      // Sign identity: long_realized = 3*(x-e); short_realized = 3*(e-x)
      assertEquals(rl.grossRealizedUsd as number, 3 * (x - e));
      assertEquals(rs.grossRealizedUsd as number, 3 * (e - x));
    }
  }
});

// -----------------------------------------------------------------------------
// Guardrails on injected inputs
// -----------------------------------------------------------------------------

Deno.test('runExit rejects negative / non-integer maxCarryDays', () => {
  const cal = handTruthCalendar();
  const bars = new MapBarSource(new Map());
  const input: ExitInput = {
    lotId: 'X', ticker: 'X', side: 'long', tier: 'T2',
    shares: shares(1), entryPrice: price(10), eventDate: '2024-05-02',
  };
  assertThrows(() => runExit(input, cal, bars, { maxCarryDays: -1 }));
  assertThrows(() => runExit(input, cal, bars, { maxCarryDays: 1.5 }));
});

Deno.test('ArraySessionCalendar rejects duplicates + non-positive n', () => {
  assertThrows(() => new ArraySessionCalendar(['2024-05-02', '2024-05-02']));
  const cal = handTruthCalendar();
  assertThrows(() => cal.sessionAfter('2024-05-02', 0));
  assertThrows(() => cal.sessionAfter('2024-05-02', 1.5));
});

// -----------------------------------------------------------------------------
// Docs-as-code sync — Module 6 policy line duplicated in
// estimator-assumptions.md §10 (same pattern as Modules 3/4/5).
// -----------------------------------------------------------------------------

Deno.test('docs-as-code: exit-basis summary appears in both exit.ts and estimator-assumptions.md §10', async () => {
  const marker = 'up to `maxCarryDays`';   // shared with Module 5; §10 must also contain header
  const src = await Deno.readTextFile(new URL('./exit.ts', import.meta.url));
  const md  = await Deno.readTextFile(new URL('../estimator-assumptions.md', import.meta.url));
  assert(src.includes(marker), 'exit.ts must carry the exit-basis summary line');
  assert(md.includes(marker),  'estimator-assumptions.md §10 must carry the same line');
  assert(/## 10\. Exit basis \+ cash seam \(ACT-515 Module 6 — Exit\)/.test(md),
    'estimator-assumptions.md must contain §10 header for Module 6');
  // Cross-module abstractions block: DEC-083 must be named as NOT-modeled.
  assert(/DEC-083/.test(src), 'exit.ts must cite DEC-083 as declared-not-modeled');
  assert(/DEC-083/.test(md),  'estimator-assumptions.md §10 must cite DEC-083 as not-modeled');
});

// -----------------------------------------------------------------------------
// Anti-phantom lint (rule (d))
// -----------------------------------------------------------------------------

Deno.test('exit.ts contains no Date.now / new Date( / Math.random tokens', async () => {
  const src = await Deno.readTextFile(new URL('./exit.ts', import.meta.url));
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const codeOnly = noBlock.split('\n').map((ln) => {
    const idx = ln.indexOf('//');
    return idx >= 0 ? ln.slice(0, idx) : ln;
  }).join('\n');
  assert(!/\bDate\.now\b/.test(codeOnly), 'Date.now forbidden in kernel');
  assert(!/\bnew\s+Date\s*\(/.test(codeOnly), 'new Date( forbidden in kernel');
  assert(!/\bMath\.random\b/.test(codeOnly), 'Math.random forbidden in kernel');
});