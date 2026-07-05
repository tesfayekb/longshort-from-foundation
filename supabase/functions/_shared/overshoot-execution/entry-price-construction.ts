// FP-069 W3.6.e-i (ACT-464.e-i) — ENTRY PRICE CONSTRUCTION module.
//
// PURE MODULE. No DB, no network, no wall-clock. Mirrors the exit-price
// construction shape (W3.6.d-i) with SIDE-INVERTED cross semantics:
//
//   LONG entry  (BUY to open)         → cross the ASK upward by slippage
//       limit_price = ask * (1 + slippage_bps / 10_000)
//   SHORT entry (SELL_SHORT to open)  → cross the BID downward by slippage
//       limit_price = bid * (1 - slippage_bps / 10_000)
//
// Rounded HALF-EVEN to $0.01 (US equity tick). Non-negative check.
//
// ---- OPERATOR RATIFICATION (I2/A4, ACT-463 + ACT-464) --------------------
//   * Order shape: LIMIT + day-TIF (market orders REJECTED on principle).
//   * Price source: POLYGON ONLY (Stocks Advanced, POLYGON_API_KEY_PROD_PROBE
//     per ACT-462.a). Alpaca /v2/stocks/* / data.alpaca.markets FORBIDDEN
//     as a price source per the standing LIVE-PRICE SOURCE CONTRACT
//     (2026-07-04). This module never fetches; caller supplies the snap.
//   * Slippage cap: OVERSHOOT_ENTRY_MARKETABLE_LIMIT_SLIPPAGE_BPS = 50 as
//     the named default, matching the exit-side cap (single ratified
//     value across intents). W5 will measure realised entry slippage
//     against this cap; any future adjustment requires operator
//     ratification — no silent parameter drift.
//   * Non-fill path: day-TIF expiry → the entry run for that (ticker,side)
//     is DONE for the day (no retry — the alpha window has passed).
//     Handled by the entry engine, not this module.
//
// Four typed refusals (mirroring exit shape):
//   'polygon_snapshot_unavailable' — caller passed null (no snap fetched)
//   'polygon_snapshot_stale'       — snap.timestamp older than max age
//   'polygon_snapshot_malformed'   — bid/ask missing / non-finite / <= 0
//   'polygon_snapshot_crossed'     — bid >= ask (crossed / locked book)
// Refusals are NEVER silent zeros. Caller propagates to audit envelope.

import type { PolygonQuoteSnapshot } from './exit-price-construction.ts';

export const OVERSHOOT_ENTRY_MARKETABLE_LIMIT_SLIPPAGE_BPS = 50;

/** Max acceptable snapshot age at entry-order submission. 15s tolerates
 *  typical polling jitter but rejects stale caches. Matches exit-side. */
export const OVERSHOOT_ENTRY_SNAPSHOT_MAX_AGE_MS = 15_000;

export type EntrySide = 'LONG' | 'SHORT';

export type EntryPriceRefusalCode =
  | 'polygon_snapshot_unavailable'
  | 'polygon_snapshot_stale'
  | 'polygon_snapshot_malformed'
  | 'polygon_snapshot_crossed';

export interface EntryPriceRefusal {
  ok: false;
  refusal: EntryPriceRefusalCode;
  reason: string;
  side: EntrySide;
}

export interface EntryPriceOk {
  ok: true;
  side: EntrySide;
  limitPrice: number;
  referenceBid: number;
  referenceAsk: number;
  slippageBps: number;
  snapshotAgeMs: number;
  /** For auditability: 'buy' for LONG entry, 'sell_short' for SHORT. */
  orderSide: 'buy' | 'sell_short';
}

export type EntryPriceResult = EntryPriceOk | EntryPriceRefusal;

export interface ConstructEntryLimitPriceInput {
  snapshot: PolygonQuoteSnapshot | null;
  side: EntrySide;
  /** Injected clock (kernel purity). Used ONLY to compute snapshotAgeMs. */
  asOf: Date;
  /** Override for A/B evidence gathering only. NOT for production paths. */
  slippageBps?: number;
}

function roundToCent(x: number): number {
  return Math.round(x * 100) / 100;
}

export function constructEntryLimitPrice(
  input: ConstructEntryLimitPriceInput,
): EntryPriceResult {
  const { snapshot, side, asOf } = input;
  const slippageBps = input.slippageBps ?? OVERSHOOT_ENTRY_MARKETABLE_LIMIT_SLIPPAGE_BPS;

  if (snapshot === null) {
    return {
      ok: false, side,
      refusal: 'polygon_snapshot_unavailable',
      reason: 'no Polygon snapshot supplied to entry-price construction',
    };
  }

  const { bid, ask, capturedAt } = snapshot;
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) {
    return {
      ok: false, side,
      refusal: 'polygon_snapshot_malformed',
      reason: `bid/ask must be finite and > 0 (got bid=${bid} ask=${ask})`,
    };
  }
  if (bid >= ask) {
    return {
      ok: false, side,
      refusal: 'polygon_snapshot_crossed',
      reason: `crossed/locked book: bid=${bid} >= ask=${ask}`,
    };
  }

  const snapshotAgeMs = asOf.getTime() - capturedAt.getTime();
  if (!Number.isFinite(snapshotAgeMs) || snapshotAgeMs > OVERSHOOT_ENTRY_SNAPSHOT_MAX_AGE_MS || snapshotAgeMs < 0) {
    return {
      ok: false, side,
      refusal: 'polygon_snapshot_stale',
      reason: `snapshot age ${snapshotAgeMs}ms outside [0, ${OVERSHOOT_ENTRY_SNAPSHOT_MAX_AGE_MS}ms]`,
    };
  }

  const factor = slippageBps / 10_000;
  // SIDE-INVERTED vs exit: LONG entry crosses UP through ask; SHORT entry
  // crosses DOWN through bid. This is the ONLY semantic diff from the
  // exit constructor — enforced by dedicated tests.
  const raw = side === 'LONG' ? ask * (1 + factor) : bid * (1 - factor);
  const limitPrice = roundToCent(raw);

  if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
    return {
      ok: false, side,
      refusal: 'polygon_snapshot_malformed',
      reason: `computed limitPrice=${limitPrice} not finite/positive from bid=${bid} ask=${ask}`,
    };
  }

  return {
    ok: true, side,
    limitPrice,
    referenceBid: bid,
    referenceAsk: ask,
    slippageBps,
    snapshotAgeMs,
    orderSide: side === 'LONG' ? 'buy' : 'sell_short',
  };
}