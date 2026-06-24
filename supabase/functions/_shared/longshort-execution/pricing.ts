/**
 * pricing — FP-056 E2 (DEC-068 clause k.3 §8.2 marketable-limit math).
 *
 * PURE COMPUTE. No I/O, no fetch, no broker import. The load-bearing pricing
 * decisions (tier-by-mid, 5¢-replaces-1¢, exact-held-qty close, decrease-cap)
 * live here so they are unit-testable from fixtures without broker mocks.
 *
 * §8.2 anchors (CROSSWIND_SPEC.md L756/758 — verbatim):
 *   "Buy: bid + 1¢. Sell: ask − 1¢. 30-second initial timeout. For high-priced
 *   names ($500+/share), use 5-cent buffer instead of 1-cent. Phase 0 validates
 *   buffer width."
 *
 * The 5¢ REPLACES the 1¢ for the high-priced tier — it is not additive. The
 * tier is selected by mid = (bid+ask)/2 per DEC-068 clause k.3 (operator-
 * affirmed resolution of the §8.2 silence on which observed price determines
 * tier eligibility — mid is asymmetry-insensitive at the $500 straddle edge,
 * e.g. bid $499.95 / ask $500.05 → mid $500.00 resolves deterministically).
 *
 * DW-RATIFICATION DEFERRAL — DW-146. The three buffer-width constants are
 * E2-noop-class NAMED EXPORTS (not silent defaults), ratified as v1 defaults
 * per DEC-068 clause (k).3 but slated for empirical-fill-evidence revision at
 * the E3-replay-evidence checkpoint per §8.2's own "Phase 0 validates buffer
 * width." Surfaced + flagged, not phantom-zero anti-pattern.
 *
 * UNIT FORK (DEC-067 line 108 + Option B reconciliation; rebalance-planner.ts
 * line 30). E1 emits NOTIONAL deltas; E2 converts to SHARES against the
 * order's decision-price basis (the limit price computed here). This module
 * is the conversion seam.
 */

import type { BrokerQuote } from '../longshort-broker-interfaces.ts';
import type { DeltaIntent } from './rebalance-planner.ts';

// ────────────────────────────────────────────────────────────────────────────
// DEC-068 clause (k).3 — §8.2 marketable-limit named constants.
// DW-146 reserves empirical-fill-evidence ratification at E3 replay checkpoint.
// ────────────────────────────────────────────────────────────────────────────

/** §8.2 L756 — "Buy: bid + 1¢. Sell: ask − 1¢" for prices < $500/share. */
export const PRICE_OFFSET_NORMAL_USD = 0.01 as const;

/**
 * §8.2 L758 — "For high-priced names ($500+/share), use 5-cent buffer instead
 * of 1-cent." REPLACES PRICE_OFFSET_NORMAL_USD (not additive — the buffer is
 * the spread the limit price sits inside, not a cumulative offset).
 */
export const PRICE_OFFSET_HIGH_PRICED_USD = 0.05 as const;

/**
 * §8.2 L758 — "$500+/share" interpreted as inclusive `≥ 500.00` (the `+` in
 * "$500+/share"). Tier selection uses mid = (bid+ask)/2 per DEC-068 clause
 * (k).3 (operator-affirmed resolution of the §8.2 spec gap).
 */
export const HIGH_PRICED_THRESHOLD_USD = 500.00 as const;

/** §8.2 marketable-limit posture; broker-acceptance-window discipline. */
export const TIF = 'day' as const;

// ────────────────────────────────────────────────────────────────────────────
// Typed signals (anti-phantom-defaults; no silent sentinels per DEC-034 (2)).
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pricing-computed share count was zero post-floor (small notional in a high-
 * price stock; the realistic race between E1's noop-band notional gate and the
 * submit-time floor against limit_price). NOT a throw — this is an EXPECTED
 * outcome. The submitter shell maps it to a `zero_share_skipped`
 * SubmissionResult; we NEVER POST a 0-qty order.
 */
export interface ZeroShareSignal {
  kind: 'zero_share';
  symbol: string;
  intent: DeltaIntent;
  reason: 'floor_to_zero' | 'decrease_below_one_share';
}

/**
 * Quote arithmetic produced a non-positive limit_price (degenerate quote with
 * crossed/inverted NBBO or |bid - ask| > 2 × offset on the wrong side). Throw,
 * not signal — this indicates a broker-side data defect that the submitter
 * cannot price against.
 */
export class DegenerateQuoteError extends Error {
  readonly symbol: string;
  readonly bid: number;
  readonly ask: number;
  readonly proposed_limit: number;
  constructor(symbol: string, bid: number, ask: number, proposed_limit: number) {
    super(
      `degenerate_quote_limit_non_positive (symbol=${symbol} bid=${bid} ` +
        `ask=${ask} proposed_limit=${proposed_limit}) — broker quote crossed ` +
        `or arithmetic underflowed; cannot price marketable-limit order`,
    );
    this.name = 'DegenerateQuoteError';
    this.symbol = symbol;
    this.bid = bid;
    this.ask = ask;
    this.proposed_limit = proposed_limit;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// brokerSide — pure intent + side → broker buy/sell mapping.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Maps (intent, position-side) → broker order side.
 *
 *   open/increase + long   → BUY  (adds long exposure)
 *   open/increase + short  → SELL (adds short exposure — short-sell)
 *   decrease/close + long  → SELL (reduces long exposure)
 *   decrease/close + short → BUY  (reduces short exposure — buy-to-cover)
 *
 * `noop` intent must never reach this function — it short-circuits at the
 * submitter shell. We throw rather than return a sentinel.
 */
export function brokerSide(
  intent: DeltaIntent,
  side: 'long' | 'short',
): 'buy' | 'sell' {
  if (intent === 'noop') {
    throw new Error(`brokerSide: noop intent must not reach broker mapping (side=${side})`);
  }
  const isOpenOrIncrease = intent === 'open' || intent === 'increase';
  if (isOpenOrIncrease) return side === 'long' ? 'buy' : 'sell';
  // decrease | close
  return side === 'long' ? 'sell' : 'buy';
}

// ────────────────────────────────────────────────────────────────────────────
// computeLimitPrice — DEC-068 clause (k).3 marketable-limit pricing.
// ────────────────────────────────────────────────────────────────────────────

export interface ComputeLimitPriceParams {
  /** Position side (drives buy/sell via `brokerSide`). */
  side: 'long' | 'short';
  /** Intent (drives buy/sell direction). `noop` rejected at the submitter shell. */
  intent: Exclude<DeltaIntent, 'noop'>;
  /** Current NBBO from the broker (Alpaca). */
  quote: BrokerQuote;
  /** Optional override block — defaults to the DEC-068 clause (k).3 named constants. */
  constants?: {
    PRICE_OFFSET_NORMAL_USD?: number;
    PRICE_OFFSET_HIGH_PRICED_USD?: number;
    HIGH_PRICED_THRESHOLD_USD?: number;
  };
}

export interface ComputeLimitPriceResult {
  limit_price: number;
  broker_side: 'buy' | 'sell';
  /** Offset actually applied (NORMAL or HIGH_PRICED) — for audit / SubmissionResult. */
  offset_applied_usd: number;
  /** mid = (bid+ask)/2 used for tier selection — surfaced for audit. */
  tier_selection_mid_usd: number;
}

export function computeLimitPrice(p: ComputeLimitPriceParams): ComputeLimitPriceResult {
  const offNormal = p.constants?.PRICE_OFFSET_NORMAL_USD ?? PRICE_OFFSET_NORMAL_USD;
  const offHigh = p.constants?.PRICE_OFFSET_HIGH_PRICED_USD ?? PRICE_OFFSET_HIGH_PRICED_USD;
  const threshold = p.constants?.HIGH_PRICED_THRESHOLD_USD ?? HIGH_PRICED_THRESHOLD_USD;

  const { bid, ask } = p.quote;
  if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0) {
    throw new DegenerateQuoteError(p.quote.symbol, bid, ask, NaN);
  }

  // Tier selection by mid (DEC-068 clause k.3 — operator-affirmed resolution
  // of the §8.2 spec gap; asymmetry-insensitive at the $500 straddle edge).
  const mid = (bid + ask) / 2;
  // 5¢ REPLACES 1¢ at ≥ $500 (not additive — buffer is the spread the limit
  // sits inside). Threshold inclusive: $500+/share → mid ≥ 500.00.
  const offset = mid >= threshold ? offHigh : offNormal;

  const side = brokerSide(p.intent, p.side);
  // Marketable-limit shape per §8.2 L756: buy bid+offset / sell ask-offset.
  const limit = side === 'buy' ? bid + offset : ask - offset;

  if (!(limit > 0) || !Number.isFinite(limit)) {
    throw new DegenerateQuoteError(p.quote.symbol, bid, ask, limit);
  }

  return {
    limit_price: limit,
    broker_side: side,
    offset_applied_usd: offset,
    tier_selection_mid_usd: mid,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// computeShares — DEC-068 clause (k).3/(k).4 whole-share + close-path rules.
// ────────────────────────────────────────────────────────────────────────────

export interface ComputeSharesParams {
  intent: Exclude<DeltaIntent, 'noop'>;
  /** Absolute notional (dollars) to spend on this leg — from ExecutionDelta.delta_notional, abs'd. */
  delta_notional_abs: number;
  /** Limit price from computeLimitPrice. */
  limit_price: number;
  /** Signed current qty held (negative for shorts). */
  current_qty: number;
}

export type ComputeSharesResult =
  | { kind: 'shares'; shares: number }
  | ZeroShareSignal;

/**
 * Convert a notional leg into whole shares per DEC-068 clause (k).3/(k).4.
 *
 *   open / increase: floor(|delta_notional| / limit_price)
 *   close:           |current_qty| EXACTLY (clause k.4 — a close is FLAT,
 *                    never notional-derived; prevents 1-share residual stubs)
 *   decrease:        min(floor(|delta_notional| / limit_price), |current_qty| − 1)
 *                    (NEVER accidentally close via a decrease; the qty-aware
 *                    cap is the clause-k.4 1-share-stub defense at the
 *                    decrease boundary)
 *
 * 0-share guard (load-bearing — DEC-034 (2) anti-phantom): if the floor of
 * `|delta_notional|/limit_price` is 0 (small notional in a high-price stock),
 * return a typed `ZeroShareSignal`. We NEVER POST a 0-qty order — the
 * submitter shell maps the signal to a `zero_share_skipped` SubmissionResult.
 * The race between E1's noop-band (notional) and submit-time floor (price) is
 * EXPECTED, not exceptional.
 */
export function computeShares(p: ComputeSharesParams): ComputeSharesResult {
  if (!(p.limit_price > 0) || !Number.isFinite(p.limit_price)) {
    throw new Error(
      `computeShares: invalid limit_price=${p.limit_price} (must be finite > 0)`,
    );
  }
  const absQty = Math.abs(p.current_qty);

  if (p.intent === 'close') {
    // Clause k.4: exact-held-qty. A close is FLAT.
    if (absQty === 0) {
      // Defensive: a close with no held qty is an upstream bug — but rather
      // than throwing here (and breaking the whole batch), surface as zero-
      // share so the submitter shell skips this one row.
      return { kind: 'zero_share', symbol: '', intent: 'close', reason: 'floor_to_zero' };
    }
    return { kind: 'shares', shares: absQty };
  }

  // open / increase / decrease — start from the notional floor against limit_price.
  const notionalShares = Math.floor(p.delta_notional_abs / p.limit_price);

  if (p.intent === 'decrease') {
    // Clause k.4 — cap at qty − 1 to avoid accidentally flat-closing via decrease.
    if (absQty <= 1) {
      // Cannot meaningfully decrease a 1-share-or-fewer position without
      // closing — surface as zero-share so the submitter skips (a close
      // intent would have been emitted by E1 if a flat were intended).
      return { kind: 'zero_share', symbol: '', intent: 'decrease', reason: 'decrease_below_one_share' };
    }
    const capped = Math.min(notionalShares, absQty - 1);
    if (capped <= 0) {
      return { kind: 'zero_share', symbol: '', intent: 'decrease', reason: 'floor_to_zero' };
    }
    return { kind: 'shares', shares: capped };
  }

  // open / increase
  if (notionalShares <= 0) {
    return { kind: 'zero_share', symbol: '', intent: p.intent, reason: 'floor_to_zero' };
  }
  return { kind: 'shares', shares: notionalShares };
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers exposed for the submitter shell + tests.
// ────────────────────────────────────────────────────────────────────────────

/** True iff this intent CONSUMES buying power on broker acceptance (open/increase).
 *  Closes/decreases CREDIT BP back per DEC-068 clause (k).5 hybrid model. */
export function intentConsumesBuyingPower(intent: DeltaIntent): boolean {
  return intent === 'open' || intent === 'increase';
}

/** True iff this intent CREDITS buying power on broker acceptance (close/decrease).
 *  Alpaca paper updates BP on ACCEPTANCE not fill — the running counter mirrors. */
export function intentCreditsBuyingPower(intent: DeltaIntent): boolean {
  return intent === 'close' || intent === 'decrease';
}