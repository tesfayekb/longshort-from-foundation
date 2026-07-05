// FP-069 W3.6.c (ACT-463.c) — overshoot execution SIZING module.
// FP-069 W3.6.e-i (ACT-464.e-i) — R-α / R-β / R-γ refactor.
//
// PURE MODULE. No DB, no network, no wall-clock. All inputs injected.
// Consumed by W3.6.e ENTRY engine at pre-open, immediately after fetching
// a FRESH account snapshot (see OvershootAlpacaAccountFetcher) and after
// the I5 Polygon pre-open re-check (default-deny) has passed. Sizing at
// entry time — not detection time — is deliberate: (a) equity used for
// slot notional must reflect the moment of commitment, not T-close of the
// prior session; (b) I5 refusals must kill an order BEFORE any sizing
// artifact is persisted; (c) target_positions schema has NOT NULL
// target_shares / target_notional with no provisional-flag, so the row
// UPSERT owns real numbers or is not written for that ticker/side.
//
// R-4 RECONCILIATION (operator-ratified, ACT-463.c):
//   - Detection handler is BYTE-UNTOUCHED this turn; the existing
//     target_shares=0 / target_notional=0 sentinel rows persist as
//     documented-provisional and are UPSERTed to real values by the
//     W3.6.e entry engine (or left unwritten when I5 refuses). The
//     residual sentinel-zero anti-phantom debt is logged as an incidental
//     finding for a follow-up schema/UX pass, not silently fixed here.
//
// I3 SIDE-ALLOCATION CONSTANTS (operator ROI-raising override,
//   ratified 2026-07-05 as R-α, ACT-464 charter):
//   Long side  : 50% of equity, distributed evenly across capacity slots.
//   Short side : 50% of equity, distributed evenly across capacity slots.
//   Combined nameplate exposure ≤ 100% of equity at any point in the T+5
//   holding window (before the margin_multiplier — R-β — is applied to the
//   sizingBase). PROVENANCE: this replaces the 0.25/0.25 conservative
//   first-light default with the full deployment-at-capacity numbers per
//   operator ROI-raising override; DO NOT revert to 0.25 without a
//   ratified counter-proposal. Downstream code MUST read from these
//   exported constants and MUST NOT redeclare numeric side allocations.
//
// R-β SIZING-BASE INJECTION (ACT-464.e-i):
//   Sizing consumes an already-composed `sizingBase` (dollars) rather
//   than raw `equity`. The composition rule is fixed and owned by the
//   entry engine (edge fn):
//       sizingBase = snapshot.equity * strategy_allocation_pct * margin_multiplier
//   where strategy_allocation_pct and margin_multiplier are loaded from
//   `overshoot_strategy_config` (W3.6.e-ii MIG-154). Both factors are
//   ECHOED in the OK result for auditability. This module refuses to
//   invent defaults on config absence — the caller must provide both
//   factors or short-circuit with `strategy_config_absent` upstream.
//
// R-γ INSUFFICIENT-BUYING-POWER GUARDRAIL (ACT-464.e-i):
//   Even with a valid sizingBase, an entry MUST NOT be submitted when
//   the fresh buying-power snapshot cannot cover the notional. The
//   guardrail helper `assertBuyingPowerCoversNotional` is exported for
//   the entry engine to invoke AFTER computeTargetSizing returns ok,
//   BEFORE order submission. Typed refusal `insufficient_buying_power`;
//   never a silent skip.

import type { OvershootAccountSnapshot } from '../overshoot-broker/alpaca-account-fetcher.ts';

export const OVERSHOOT_SIDE_ALLOCATION_PCT_LONG = 0.50;
export const OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT = 0.50;

export type OvershootSizeSide = 'LONG' | 'SHORT';

export interface ComputeTargetSizingInput {
  /** Fresh account snapshot at entry time (I7-#7). Refusal short-circuits.
   *  Kept on the input for the equity_snapshot_unavailable refusal
   *  passthrough; the numeric basis for sizing is `sizingBase`, not
   *  snapshot.equity (see R-β). */
  snapshot: OvershootAccountSnapshot;
  side: OvershootSizeSide;
  /** Number of capacity slots on THIS side (long or short) for the run. */
  capacityPerSide: number;
  /** Reference price for share computation. T-close for detection-time
   *  provisional preview; freshest NBBO/last-trade at entry commitment. */
  entryReferencePrice: number;
  /** R-β: pre-composed sizing base in dollars —
   *      snapshot.equity * strategyAllocationPct * marginMultiplier.
   *  Composed by the entry engine from overshoot_strategy_config;
   *  this module NEVER reads config or derives it internally. */
  sizingBase: number;
  /** R-β provenance: strategy allocation pct used in sizingBase (0..1]. */
  strategyAllocationPct: number;
  /** R-β provenance: margin multiplier used in sizingBase (>=1.00). */
  marginMultiplier: number;
}

export interface TargetSizingOk {
  ok: true;
  side: OvershootSizeSide;
  slotNotional: number;
  shares: number; // FLOOR(slotNotional / entryReferencePrice)
  /** Provenance echo — auditability of the allocation basis used. */
  sideAllocationPct: number;
  equityBasis: number;
  /** R-β provenance echoes — recorded on the target_positions UPSERT for audit. */
  sizingBase: number;
  strategyAllocationPct: number;
  marginMultiplier: number;
}

export type TargetSizingRefusalCode =
  | 'equity_snapshot_unavailable'
  | 'capacity_non_positive'
  | 'reference_price_non_positive'
  | 'reference_price_exceeds_slot_notional'
  | 'sizing_base_non_positive'
  | 'strategy_allocation_pct_out_of_range'
  | 'margin_multiplier_out_of_range';

export interface TargetSizingRefusal {
  ok: false;
  refusal: TargetSizingRefusalCode;
  reason: string;
  side: OvershootSizeSide;
}

export type TargetSizingResult = TargetSizingOk | TargetSizingRefusal;

export function sideAllocationPct(side: OvershootSizeSide): number {
  return side === 'LONG'
    ? OVERSHOOT_SIDE_ALLOCATION_PCT_LONG
    : OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT;
}

export function computeTargetSizing(input: ComputeTargetSizingInput): TargetSizingResult {
  const {
    snapshot, side, capacityPerSide, entryReferencePrice,
    sizingBase, strategyAllocationPct, marginMultiplier,
  } = input;

  // Refusal passthrough — per the account-fetcher consumer contract, an
  // ok=false snapshot MUST short-circuit sizing. No phantom sizing.
  if (snapshot.ok === false) {
    return {
      ok: false,
      refusal: 'equity_snapshot_unavailable',
      reason: `account snapshot refused: ${snapshot.reason}`,
      side,
    };
  }

  if (!Number.isFinite(strategyAllocationPct) || strategyAllocationPct <= 0 || strategyAllocationPct > 1) {
    return {
      ok: false,
      refusal: 'strategy_allocation_pct_out_of_range',
      reason: `strategyAllocationPct must be in (0, 1] (got ${strategyAllocationPct})`,
      side,
    };
  }

  if (!Number.isFinite(marginMultiplier) || marginMultiplier < 1) {
    return {
      ok: false,
      refusal: 'margin_multiplier_out_of_range',
      reason: `marginMultiplier must be >= 1.00 (got ${marginMultiplier})`,
      side,
    };
  }

  if (!Number.isFinite(sizingBase) || sizingBase <= 0) {
    return {
      ok: false,
      refusal: 'sizing_base_non_positive',
      reason: `sizingBase must be > 0 (got ${sizingBase})`,
      side,
    };
  }

  if (!Number.isFinite(capacityPerSide) || capacityPerSide <= 0) {
    return {
      ok: false,
      refusal: 'capacity_non_positive',
      reason: `capacityPerSide must be > 0 (got ${capacityPerSide})`,
      side,
    };
  }

  if (!Number.isFinite(entryReferencePrice) || entryReferencePrice <= 0) {
    return {
      ok: false,
      refusal: 'reference_price_non_positive',
      reason: `entryReferencePrice must be > 0 (got ${entryReferencePrice})`,
      side,
    };
  }

  const pct = sideAllocationPct(side);
  // R-β: slotNotional is a pure slice of the injected sizingBase. Side
  // allocation is applied to the sizingBase (which already includes
  // strategy_allocation_pct and margin_multiplier); the side-pct is the
  // long/short partition within the strategy allocation.
  const slotNotional = (sizingBase * pct) / capacityPerSide;
  const shares = Math.floor(slotNotional / entryReferencePrice);

  if (shares <= 0) {
    // Typed outcome, not a silent zero — the entry engine treats this as a
    // refusal (do not write a 0-share target_positions row; do not order).
    return {
      ok: false,
      refusal: 'reference_price_exceeds_slot_notional',
      reason: `slotNotional=${slotNotional} < entryReferencePrice=${entryReferencePrice}; shares would floor to 0`,
      side,
    };
  }

  return {
    ok: true,
    side,
    slotNotional,
    shares,
    sideAllocationPct: pct,
    equityBasis: snapshot.equity,
    sizingBase,
    strategyAllocationPct,
    marginMultiplier,
  };
}

// ─── R-γ BUYING-POWER GUARDRAIL ────────────────────────────────────────────

export interface BuyingPowerCheckInput {
  /** Same snapshot passed to computeTargetSizing (must be ok=true here). */
  snapshot: OvershootAccountSnapshot;
  /** Total dollar notional the engine intends to submit this run
   *  (Σ slotNotional across all approved (ticker, side) pairs). */
  intendedNotional: number;
}

export type BuyingPowerCheckResult =
  | { ok: true; buyingPower: number; intendedNotional: number; headroom: number }
  | { ok: false; refusal: 'insufficient_buying_power' | 'equity_snapshot_unavailable';
      reason: string; buyingPower: number | null; intendedNotional: number };

/**
 * R-γ guardrail. Called by the entry engine AFTER all per-slot sizings
 * resolve ok, BEFORE any order submission. Refuses the run (or the
 * subset above BP) with `insufficient_buying_power` — never a silent
 * partial. Pure; no wall-clock; no net.
 */
export function assertBuyingPowerCoversNotional(
  input: BuyingPowerCheckInput,
): BuyingPowerCheckResult {
  const { snapshot, intendedNotional } = input;
  if (snapshot.ok === false) {
    return {
      ok: false, refusal: 'equity_snapshot_unavailable',
      reason: `account snapshot refused: ${snapshot.reason}`,
      buyingPower: null, intendedNotional,
    };
  }
  if (!Number.isFinite(intendedNotional) || intendedNotional < 0) {
    return {
      ok: false, refusal: 'insufficient_buying_power',
      reason: `intendedNotional must be finite and >= 0 (got ${intendedNotional})`,
      buyingPower: snapshot.buying_power, intendedNotional,
    };
  }
  const headroom = snapshot.buying_power - intendedNotional;
  if (headroom < 0) {
    return {
      ok: false, refusal: 'insufficient_buying_power',
      reason: `intendedNotional=${intendedNotional} exceeds buying_power=${snapshot.buying_power} (headroom=${headroom})`,
      buyingPower: snapshot.buying_power, intendedNotional,
    };
  }
  return { ok: true, buyingPower: snapshot.buying_power, intendedNotional, headroom };
}