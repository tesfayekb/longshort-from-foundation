// FP-069 W3.6.d-i (ACT-463.d-i) — EXIT PRICE CONSTRUCTION module.
//
// PURE MODULE. No DB, no network, no wall-clock. Consumes a Polygon
// snapshot (bid/ask) injected by the caller; returns a marketable-limit
// price OR one of four typed refusals. Consumed by the W3.6.d-ii exit
// engine when submitting T+5 time-stop closes.
//
// ---- OPERATOR RATIFICATION (A4, ACT-463.d ruling 2) -----------------------
//   * Order shape: LIMIT + day-TIF (market orders REJECTED on principle).
//   * Price source: POLYGON ONLY (Stocks Advanced, POLYGON_API_KEY_PROD_PROBE
//     per ACT-462.a). Alpaca /v2/stocks/* / data.alpaca.markets FORBIDDEN
//     as a price source per the standing LIVE-PRICE SOURCE CONTRACT
//     (2026-07-04). This module never fetches; caller supplies the snap.
//   * Slippage cap: OVERSHOOT_EXIT_MARKETABLE_LIMIT_SLIPPAGE_BPS = 50 as
//     the named default. Provenance: operator ratification 2026-07-04
//     alongside PIN-2. W5 will measure realized exit slippage against
//     this cap and produce evidence for any future adjustment (no silent
//     parameter drift; adjustment requires operator ratification).
//   * Non-fill path: day-TIF expiry → expired terminal → next cron
//     retries at attempt+1 (state-machine-owned; not this module's
//     concern).
//
// Marketable-limit construction:
//   LONG exit (SELL to close long) → cross the bid downward by slippage
//     limit_price = bid  * (1 - slippage_bps / 10_000)
//   SHORT exit (BUY to close short) → cross the ask upward by slippage
//     limit_price = ask  * (1 + slippage_bps / 10_000)
//   Rounded HALF-EVEN to $0.01 (US equity tick). Non-negative check.
//
// Four typed refusals (ratified A4):
//   'polygon_snapshot_unavailable' — caller passed null (no snap fetched)
//   'polygon_snapshot_stale'       — snap.timestamp older than max age
//   'polygon_snapshot_malformed'   — bid/ask missing / non-finite / <= 0
//   'polygon_snapshot_crossed'     — bid >= ask (crossed / locked book)
// Refusals are NEVER silent zeros. Caller propagates to exit event.

export const OVERSHOOT_EXIT_MARKETABLE_LIMIT_SLIPPAGE_BPS = 50;

/** Maximum acceptable snapshot age at the moment of exit-order submission.
 *  15 seconds tolerates typical polling jitter but rejects stale caches. */
export const OVERSHOOT_EXIT_SNAPSHOT_MAX_AGE_MS = 15_000;

export type ExitSide = 'LONG' | 'SHORT';

/** Injected Polygon quote snapshot. Caller (edge fn) constructs from
 *  Polygon /v3/quotes or /v2/snapshot; this module does not touch net. */
export interface PolygonQuoteSnapshot {
  symbol: string;
  bid: number;
  ask: number;
  /** Snapshot capture time (Polygon `sip_timestamp` or equivalent). */
  capturedAt: Date;
}

export type ExitPriceRefusalCode =
  | 'polygon_snapshot_unavailable'
  | 'polygon_snapshot_stale'
  | 'polygon_snapshot_malformed'
  | 'polygon_snapshot_crossed';

export interface ExitPriceRefusal {
  ok: false;
  refusal: ExitPriceRefusalCode;
  reason: string;
  side: ExitSide;
}

export interface ExitPriceOk {
  ok: true;
  side: ExitSide;
  limitPrice: number;
  referenceBid: number;
  referenceAsk: number;
  slippageBps: number;
  snapshotAgeMs: number;
  /** Cross side for auditability: 'sell' for LONG exit, 'buy' for SHORT. */
  orderSide: 'sell' | 'buy';
}

export type ExitPriceResult = ExitPriceOk | ExitPriceRefusal;

export interface ConstructExitLimitPriceInput {
  snapshot: PolygonQuoteSnapshot | null;
  side: ExitSide;
  /** Cron-tick clock (injected — kernel purity). Used only to compute
   *  snapshotAgeMs and enforce staleness. NEVER read via wall-clock. */
  asOf: Date;
  /** Override the default slippage cap. Callers should NOT override
   *  in production paths — provided only for A/B evidence gathering. */
  slippageBps?: number;
}

function roundToCent(x: number): number {
  return Math.round(x * 100) / 100;
}

export function constructExitLimitPrice(
  input: ConstructExitLimitPriceInput,
): ExitPriceResult {
  const { snapshot, side, asOf } = input;
  const slippageBps = input.slippageBps ?? OVERSHOOT_EXIT_MARKETABLE_LIMIT_SLIPPAGE_BPS;

  if (snapshot === null) {
    return {
      ok: false, side,
      refusal: 'polygon_snapshot_unavailable',
      reason: 'no Polygon snapshot supplied to exit-price construction',
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
  if (!Number.isFinite(snapshotAgeMs) || snapshotAgeMs > OVERSHOOT_EXIT_SNAPSHOT_MAX_AGE_MS || snapshotAgeMs < 0) {
    return {
      ok: false, side,
      refusal: 'polygon_snapshot_stale',
      reason: `snapshot age ${snapshotAgeMs}ms outside [0, ${OVERSHOOT_EXIT_SNAPSHOT_MAX_AGE_MS}ms]`,
    };
  }

  const factor = slippageBps / 10_000;
  const raw = side === 'LONG' ? bid * (1 - factor) : ask * (1 + factor);
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
    orderSide: side === 'LONG' ? 'sell' : 'buy',
  };
}
