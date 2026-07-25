// ACT-515 Kernel — Module 4 tests.
//
// Runner: Deno test, colocated (matches CI Gate-2 convention).

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  runSize, SIZING_VARIANTS, KERNEL_SLOT_CONCENTRATION,
  KERNEL_CONST_BASE_EQUITY_USD,
  type SizingVariantId,
} from './size.ts';
import { money, price } from './types.ts';

// -----------------------------------------------------------------------------
// PIN (a) — slot-notional convention: baseline reproduces production
// -----------------------------------------------------------------------------

Deno.test('PIN (a) 1x-const baseline reproduces prod slot notional', () => {
  // Production: sizingBase = 100_000 * 1.0 * 1.0 = 100_000
  //             slot       = 100_000 * 0.90 / 36 = 2_500  (long)
  //                        = 100_000 * 0.10 /  4 = 2_500  (short)
  // Kernel collapses (sideAllocationPct / capacity) to 0.025 invariant.
  const r = runSize({
    variant: SIZING_VARIANTS['1x-const'], side: 'long',
    equityUsd: money(999_999), // ignored in const mode
    referencePrice: price(100),
  });
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.slotNotionalUsd as number, 2500);
  assertEquals(r.shares as number, 25);
});

Deno.test('PIN (a) 2x-const slot doubles to $5,000', () => {
  const r = runSize({
    variant: SIZING_VARIANTS['2x-const'], side: 'short',
    equityUsd: money(50_000),
    referencePrice: price(50),
  });
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.slotNotionalUsd as number, 5000);
  assertEquals(r.shares as number, 100);
});

// -----------------------------------------------------------------------------
// PIN (b) — variant ids exist byte-identically in config-matrix.md
// -----------------------------------------------------------------------------

Deno.test('PIN (b) SIZING_VARIANTS ids appear as Row IDs in config-matrix.md', async () => {
  const src = await Deno.readTextFile(
    new URL('../config-matrix.md', import.meta.url),
  );
  for (const id of Object.keys(SIZING_VARIANTS) as SizingVariantId[]) {
    assert(src.includes('`' + id + '`'), `config-matrix.md missing row id: ${id}`);
  }
});

Deno.test('PIN (b) exactly four sizing variants (R5 spy-bh excluded)', () => {
  assertEquals(Object.keys(SIZING_VARIANTS).length, 4);
});

// -----------------------------------------------------------------------------
// PIN (c) — seam declaration duplicated in estimator-assumptions.md §8
// -----------------------------------------------------------------------------

Deno.test('PIN (c) size.ts seams duplicated in estimator-assumptions.md §8', async () => {
  const est = await Deno.readTextFile(
    new URL('../estimator-assumptions.md', import.meta.url),
  );
  assert(est.includes('## 8. Kernel seams (ACT-515 Module 4 — Size)'),
    'estimator §8 header missing');
  const lower = est.toLowerCase();
  assert(lower.includes('margin carry cost'), 'carry-cost seam missing from §8');
  assert(lower.includes('buying-power'), 'buying-power seam missing from §8');
  assert(lower.includes('module 7'), 'Module 7 handoff missing from §8');
  assert(lower.includes('module 6'), 'Module 6 handoff missing from §8');
});

// -----------------------------------------------------------------------------
// PIN (d) — typed refusals
// -----------------------------------------------------------------------------

Deno.test('PIN (d) zero_price_guard on null price (data-absent)', () => {
  const r = runSize({
    variant: SIZING_VARIANTS['1x-const'], side: 'long',
    equityUsd: money(100_000), referencePrice: null,
  });
  assert(!r.ok);
  if (r.ok) return;
  assertEquals(r.refusal, 'zero_price_guard');
});

Deno.test('PIN (d) below_min_share when price > slot notional', () => {
  // 1x-const slot = $2,500; price = $3,000 → shares floors to 0.
  const r = runSize({
    variant: SIZING_VARIANTS['1x-const'], side: 'long',
    equityUsd: money(100_000), referencePrice: price(3000),
  });
  assert(!r.ok);
  if (r.ok) return;
  assertEquals(r.refusal, 'below_min_share');
});

Deno.test('PIN (d) notional_overflow on pathological equity', () => {
  // equity so large that slot cents exceeds MAX_SAFE_INTEGER (~9.007e15).
  // Slot = equity * 0.025 * 2.0 in cents → equity ~ 1.8e17 crosses the line.
  const r = runSize({
    variant: SIZING_VARIANTS['2x-comp'], side: 'long',
    equityUsd: money(1e18), referencePrice: price(1),
  });
  assert(!r.ok);
  if (r.ok) return;
  assertEquals(r.refusal, 'notional_overflow');
});

// -----------------------------------------------------------------------------
// PIN (e) — branded math + homothetic property
// -----------------------------------------------------------------------------

Deno.test('PIN (e) compounding is homothetic: 2× equity → 2× slot notional', () => {
  const px = price(50);
  const a = runSize({
    variant: SIZING_VARIANTS['1x-comp'], side: 'long',
    equityUsd: money(100_000), referencePrice: px,
  });
  const b = runSize({
    variant: SIZING_VARIANTS['1x-comp'], side: 'long',
    equityUsd: money(200_000), referencePrice: px,
  });
  assert(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  assertEquals((b.slotNotionalUsd as number), (a.slotNotionalUsd as number) * 2);
  assertEquals((b.shares as number), (a.shares as number) * 2);
});

Deno.test('PIN (e) constant is EQUITY-INVARIANT: 2× equity → unchanged slot', () => {
  const px = price(50);
  const a = runSize({
    variant: SIZING_VARIANTS['1x-const'], side: 'long',
    equityUsd: money(100_000), referencePrice: px,
  });
  const b = runSize({
    variant: SIZING_VARIANTS['1x-const'], side: 'long',
    equityUsd: money(200_000), referencePrice: px,
  });
  assert(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  assertEquals((b.slotNotionalUsd as number), (a.slotNotionalUsd as number));
  assertEquals((b.shares as number), (a.shares as number));
});

Deno.test('PIN (e) leverage doubles slot notional (const 1x → 2x)', () => {
  const px = price(50);
  const a = runSize({
    variant: SIZING_VARIANTS['1x-const'], side: 'long',
    equityUsd: money(100_000), referencePrice: px,
  });
  const b = runSize({
    variant: SIZING_VARIANTS['2x-const'], side: 'long',
    equityUsd: money(100_000), referencePrice: px,
  });
  assert(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  assertEquals((b.slotNotionalUsd as number), (a.slotNotionalUsd as number) * 2);
});

Deno.test('slot-concentration invariant is 2.5% (sizing.ts:33-35 parity)', () => {
  assertEquals(KERNEL_SLOT_CONCENTRATION, 0.025);
  assertEquals(0.90 / 36, KERNEL_SLOT_CONCENTRATION);
  assertEquals(0.10 /  4, KERNEL_SLOT_CONCENTRATION);
});

Deno.test('const-mode uses frozen $100k rail regardless of equity input', () => {
  assertEquals(KERNEL_CONST_BASE_EQUITY_USD, 100_000);
  const r = runSize({
    variant: SIZING_VARIANTS['2x-const'], side: 'long',
    equityUsd: money(1), // absurd
    referencePrice: price(100),
  });
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.equityBasisUsd as number, 100_000);
  assertEquals(r.slotNotionalUsd as number, 5000);
});

// -----------------------------------------------------------------------------
// Anti-phantom lint — size.ts contains no wall-clock / RNG tokens.
// -----------------------------------------------------------------------------

Deno.test('size.ts contains no Date.now / new Date( / Math.random tokens', async () => {
  const src = await Deno.readTextFile(new URL('./size.ts', import.meta.url));
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