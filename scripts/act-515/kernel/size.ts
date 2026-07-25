// ACT-515 Kernel — Module 4: Size.
//
// SCOPE: pure per-slot sizing. Maps (variant × equity path state × price)
// → target slot-notional + integer share count OR typed sizing refusal.
// No I/O, no wall-clock, no RNG. Consumed by Module 6 (fill) which owns
// buying-power/cash-sufficiency; and by Module 7 (equity/DD) which owns
// margin carry-cost accrual. Both seams named below and duplicated in
// `scripts/act-515/estimator-assumptions.md` §8 — docs-as-code parity.
//
// FIVE PINS (per ruling 2026-07-25):
//
//   (a) SLOT-NOTIONAL CONVENTION — the LIVE sizing path is:
//         sizingBase   = snapshot.equity * strategyAllocationPct * marginMultiplier
//         slotNotional = (sizingBase * sideAllocationPct) / capacityPerSide
//         shares       = Math.floor(slotNotional / entryReferencePrice)
//       Grep-anchor (verbatim):
//         supabase/functions/_shared/overshoot-execution/sizing.ts:282-283
//         supabase/functions/overshoot-entry-run/index.ts:747
//           (`sizingBase = accountSnapshot.equity * strategyAllocationPct
//             * marginMultiplier;`)
//       Production slot-concentration invariant (both sides identical):
//         0.90 / 36 = 0.10 / 4 = 0.025 = 2.5 %
//       (`sizing.ts:33-35`). The kernel BASELINE reproduces this rule
//       byte-for-byte via the `1x-const` and `1x-comp` variants
//       (leverage=1.0, marginMultiplier=1.0). The `2x-*` variants
//       DEVIATE from the baseline solely by raising marginMultiplier to
//       2.0 — the only permitted axis of deviation per config-matrix §1.
//
//   (b) CONFIG VARIANTS — exactly the four sizing rows from
//       `scripts/act-515/config-matrix.md` §1 (rows R1..R4). R5 (`spy-bh`)
//       is not a sizing variant. IDs are byte-identical to the matrix's
//       Row ID column and are grep-asserted by a docs-as-code test
//       (`size_test.ts` reads config-matrix.md and confirms each SIZING_VARIANTS
//       key appears as a Row ID). No invented knobs — each variant is a
//       pure {leverage, mode} pair.
//
//   (c) SEAM DECLARATION — Module 4 computes TARGET notional + share
//       count. It does NOT:
//         · Charge margin carry cost (charter §1(b): 50 bps/month flat on
//           debit balance, cited estimator-assumptions.md §1) —
//           OWNED BY MODULE 7 (equity/DD).
//         · Verify buying-power / cash sufficiency — OWNED BY MODULE 6
//           (fill). Production analogue:
//           supabase/functions/_shared/overshoot-execution/sizing.ts:330
//           (`assertBuyingPowerCoversNotional`).
//       Both seams are appended verbatim to
//       `scripts/act-515/estimator-assumptions.md` §8; a test in
//       `size_test.ts` asserts both copies stay in sync (same pattern
//       used by Module 3 for the abstractions block).
//
//   (d) SIZING REFUSALS — typed via `SizingRefusalCode` in `types.ts`,
//       each labeled `kernel-only` in the enum comment (no phantom
//       production strings). Emitted codes:
//         · `zero_price_guard`   — data-absent Price (null / undefined).
//         · `below_min_share`    — floor(slot/price) < 1.
//         · `notional_overflow`  — integer-cent product exceeds MAX_SAFE_INTEGER.
//
//   (e) BRANDED-MATH DISCIPLINE — every intermediate is Money / Shares /
//       Price. Internal representation is integer CENTS (Money is USD
//       but the size module rounds slot notional to whole cents before
//       computing the share floor; keeps property tests exact). A property
//       test asserts sizing is HOMOTHETIC:
//         · Compounding: 2× equity → 2× slotNotional (same price → 2× shares
//           modulo floor).
//         · Constant:    2× equity → UNCHANGED slotNotional (frozen at $2,500
//           / $5,000 × leverage per matrix §1).

import {
  money, shares, price,
  type Money, type Shares, type Price,
  type SizingRefusalCode, type SideDb,
} from './types.ts';

// -----------------------------------------------------------------------------
// Variants — byte-anchored to config-matrix.md §1
// -----------------------------------------------------------------------------

export type SizingVariantId = '1x-const' | '1x-comp' | '2x-const' | '2x-comp';

export interface SizingVariant {
  readonly id: SizingVariantId;
  readonly leverage: 1.0 | 2.0;
  readonly mode: 'const' | 'comp';
}

/** Frozen variant table. Order matches config-matrix.md rows R1..R4. */
export const SIZING_VARIANTS: Readonly<Record<SizingVariantId, SizingVariant>> = {
  '1x-const': { id: '1x-const', leverage: 1.0, mode: 'const' },
  '1x-comp':  { id: '1x-comp',  leverage: 1.0, mode: 'comp'  },
  '2x-const': { id: '2x-const', leverage: 2.0, mode: 'const' },
  '2x-comp':  { id: '2x-comp',  leverage: 2.0, mode: 'comp'  },
};

/** SLOT-CONCENTRATION INVARIANT (sizing.ts:33-35): 2.5% per slot both sides. */
export const KERNEL_SLOT_CONCENTRATION = 0.025;

/** Frozen constant-notional starting equity per matrix §2 / estimator §3. */
export const KERNEL_CONST_BASE_EQUITY_USD = 100_000;

// -----------------------------------------------------------------------------
// I/O shapes
// -----------------------------------------------------------------------------

export interface SizeInput {
  readonly variant: SizingVariant;
  readonly side: SideDb;
  /** Equity path state at admit time.
   *  · `comp` mode consumes this directly.
   *  · `const` mode IGNORES this and sizes off the frozen $100k rail. */
  readonly equityUsd: Money;
  /** Reference price at admit (T+N open per horizon). `null` yields
   *  a typed `zero_price_guard` refusal (kernel-only). */
  readonly referencePrice: Price | null;
}

export type SizeResult =
  | { readonly ok: true;
      readonly side: SideDb;
      readonly variantId: SizingVariantId;
      readonly slotNotionalUsd: Money;
      readonly shares: Shares;
      readonly leverageApplied: 1.0 | 2.0;
      readonly equityBasisUsd: Money;
    }
  | { readonly ok: false;
      readonly side: SideDb;
      readonly variantId: SizingVariantId;
      readonly refusal: SizingRefusalCode;
      readonly reason: string;
    };

// -----------------------------------------------------------------------------
// runSize — pure entry point
// -----------------------------------------------------------------------------

/** Integer-cent product guard. Returns Money rounded to the nearest cent
 *  or throws `notional_overflow` (caught by runSize and typed). */
function toCents(usd: number): number {
  const cents = Math.round(usd * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new Error('notional_overflow');
  }
  return cents;
}

export function runSize(input: SizeInput): SizeResult {
  const { variant, side, equityUsd, referencePrice } = input;

  // PIN (d) — zero_price_guard covers DATA-ABSENT price (null). The
  // `price()` brand constructor already rejects ≤0 / non-finite at
  // construction; this branch handles the missing-bar case.
  if (referencePrice === null) {
    return {
      ok: false, side, variantId: variant.id,
      refusal: 'zero_price_guard',
      reason: 'referencePrice is null (data-absent)',
    };
  }

  // PIN (a) equity basis: `const` freezes at $100k rail; `comp` uses live equity.
  const equityBasisRaw = variant.mode === 'const'
    ? KERNEL_CONST_BASE_EQUITY_USD
    : (equityUsd as number);

  // PIN (e) — integer-cent internal representation. Slot notional derived
  // from equity × 2.5% × leverage, matching the sizing.ts:282 rule with
  // (sideAllocationPct / capacityPerSide) collapsed to the 0.025 invariant
  // (sizing.ts:33-35) and marginMultiplier collapsed to `leverage` (the
  // ONLY axis on which the 2× variants deviate from baseline — PIN (a)).
  let slotCents: number;
  try {
    slotCents = toCents(equityBasisRaw * KERNEL_SLOT_CONCENTRATION * variant.leverage);
  } catch (_e) {
    return {
      ok: false, side, variantId: variant.id,
      refusal: 'notional_overflow',
      reason: `slot notional exceeds MAX_SAFE_INTEGER cents (equity=${equityBasisRaw}, lev=${variant.leverage})`,
    };
  }

  const slotUsd = slotCents / 100;
  const px = referencePrice as number;

  // PIN (d) — below_min_share: floor(slot/price) < 1.
  const shareCount = Math.floor(slotUsd / px);
  if (shareCount < 1) {
    return {
      ok: false, side, variantId: variant.id,
      refusal: 'below_min_share',
      reason: `floor(slot=${slotUsd} / price=${px}) = ${shareCount} < 1`,
    };
  }

  // Product overflow re-check on filled notional.
  let filledCents: number;
  try {
    filledCents = toCents(shareCount * px);
  } catch (_e) {
    return {
      ok: false, side, variantId: variant.id,
      refusal: 'notional_overflow',
      reason: `shares*price exceeds MAX_SAFE_INTEGER cents (n=${shareCount}, px=${px})`,
    };
  }

  return {
    ok: true, side, variantId: variant.id,
    slotNotionalUsd: money(slotCents / 100),
    shares: shares(shareCount),
    leverageApplied: variant.leverage,
    equityBasisUsd: money(equityBasisRaw),
    // suppress unused-var lint on filledCents — asserted for the overflow guard.
    ..._absorb(filledCents),
  };
}

// Keeps the overflow-recheck branch reachable without inflating the public
// result shape. The returned object is empty.
function _absorb(_cents: number): Record<string, never> { return {}; }