// FP-069 W3.6.c (ACT-463.c) — overshoot execution SIZING module.
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
// I3 SIDE-ALLOCATION CONSTANTS (operator-ratified conservative first-light):
//   Long side  : 25% of equity, distributed evenly across capacity slots.
//   Short side : 25% of equity, distributed evenly across capacity slots.
//   Combined nameplate exposure ≤ 50% of equity at any point in the
//   T+5 holding window. Raise ONLY on evidenced first-light outcomes
//   (per-side realised ROI + drawdown surfaces) via an operator-ratified
//   proposal — NOT by silent parameter drift. This provenance stanza is
//   the single source of truth; downstream code MUST read from the
//   exported constants and MUST NOT redeclare numeric side allocations.

import type { OvershootAccountSnapshot } from '../overshoot-broker/alpaca-account-fetcher.ts';

export const OVERSHOOT_SIDE_ALLOCATION_PCT_LONG = 0.25;
export const OVERSHOOT_SIDE_ALLOCATION_PCT_SHORT = 0.25;

export type OvershootSizeSide = 'LONG' | 'SHORT';

export interface ComputeTargetSizingInput {
  /** Fresh account snapshot at entry time (I7-#7). Refusal short-circuits. */
  snapshot: OvershootAccountSnapshot;
  side: OvershootSizeSide;
  /** Number of capacity slots on THIS side (long or short) for the run. */
  capacityPerSide: number;
  /** Reference price for share computation. T-close for detection-time
   *  provisional preview; freshest NBBO/last-trade at entry commitment. */
  entryReferencePrice: number;
}

export interface TargetSizingOk {
  ok: true;
  side: OvershootSizeSide;
  slotNotional: number;
  shares: number; // FLOOR(slotNotional / entryReferencePrice)
  /** Provenance echo — auditability of the allocation basis used. */
  sideAllocationPct: number;
  equityBasis: number;
}

export type TargetSizingRefusalCode =
  | 'equity_snapshot_unavailable'
  | 'capacity_non_positive'
  | 'reference_price_non_positive'
  | 'reference_price_exceeds_slot_notional';

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
  const { snapshot, side, capacityPerSide, entryReferencePrice } = input;

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
  const slotNotional = (snapshot.equity * pct) / capacityPerSide;
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
  };
}