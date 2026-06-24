/**
 * pricing_test — FP-056 E2 (DEC-068 clause k.3 §8.2 marketable-limit math).
 *
 * Pure tests (no mocks). Covers tier-by-mid (including the $499.95/$500.05
 * straddle edge), 5¢-replaces-1¢ at ≥$500, floor-shares, exact-qty-close,
 * decrease-cap-at-qty−1, the 0-share guard, and the buy/sell mapping.
 * Plus a Gate-6 self-scan asserting pricing.ts contains no wall-clock.
 */

import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { BrokerQuote } from '../longshort-broker-interfaces.ts';
import {
  DegenerateQuoteError,
  HIGH_PRICED_THRESHOLD_USD,
  PRICE_OFFSET_HIGH_PRICED_USD,
  PRICE_OFFSET_NORMAL_USD,
  brokerSide,
  computeLimitPrice,
  computeShares,
  intentConsumesBuyingPower,
  intentCreditsBuyingPower,
} from './pricing.ts';

const TS = new Date('2026-06-24T20:30:00Z');

function quote(symbol: string, bid: number, ask: number): BrokerQuote {
  return { symbol, bid, ask, last: (bid + ask) / 2, ts: TS, source: 'alpaca' };
}

// ── brokerSide ───────────────────────────────────────────────────────────

Deno.test('brokerSide — open/increase long → buy', () => {
  assertEquals(brokerSide('open', 'long'), 'buy');
  assertEquals(brokerSide('increase', 'long'), 'buy');
});

Deno.test('brokerSide — open/increase short → sell (short-sell)', () => {
  assertEquals(brokerSide('open', 'short'), 'sell');
  assertEquals(brokerSide('increase', 'short'), 'sell');
});

Deno.test('brokerSide — close/decrease long → sell', () => {
  assertEquals(brokerSide('close', 'long'), 'sell');
  assertEquals(brokerSide('decrease', 'long'), 'sell');
});

Deno.test('brokerSide — close/decrease short → buy (buy-to-cover)', () => {
  assertEquals(brokerSide('close', 'short'), 'buy');
  assertEquals(brokerSide('decrease', 'short'), 'buy');
});

Deno.test('brokerSide — noop intent throws (defensive)', () => {
  assertThrows(() => brokerSide('noop', 'long'));
});

// ── computeLimitPrice: NORMAL tier (< $500) ──────────────────────────────

Deno.test('computeLimitPrice — NORMAL tier buy: bid + 1¢', () => {
  const r = computeLimitPrice({ side: 'long', intent: 'open', quote: quote('AAPL', 195.00, 195.05) });
  assertEquals(r.broker_side, 'buy');
  assertEquals(r.offset_applied_usd, PRICE_OFFSET_NORMAL_USD);
  assertEquals(r.limit_price, 195.01);
});

Deno.test('computeLimitPrice — NORMAL tier sell: ask − 1¢', () => {
  const r = computeLimitPrice({ side: 'long', intent: 'close', quote: quote('AAPL', 195.00, 195.05) });
  assertEquals(r.broker_side, 'sell');
  assertEquals(r.offset_applied_usd, PRICE_OFFSET_NORMAL_USD);
  assertEquals(r.limit_price, 195.04);
});

// ── computeLimitPrice: HIGH_PRICED tier (≥ $500) — 5¢ REPLACES 1¢ ────────

Deno.test('computeLimitPrice — HIGH_PRICED tier (mid ≥ $500) buy uses 5¢ (REPLACES, not additive)', () => {
  const r = computeLimitPrice({ side: 'long', intent: 'open', quote: quote('GOOG', 1500.00, 1500.20) });
  assertEquals(r.broker_side, 'buy');
  assertEquals(r.offset_applied_usd, PRICE_OFFSET_HIGH_PRICED_USD);
  assertEquals(r.limit_price, 1500.05);
  // NOT 1500.06 (would be 1¢ + 5¢ additive); the 5¢ REPLACES the 1¢.
});

Deno.test('computeLimitPrice — HIGH_PRICED tier sell: ask − 5¢', () => {
  const r = computeLimitPrice({ side: 'long', intent: 'close', quote: quote('GOOG', 1500.00, 1500.20) });
  assertEquals(r.broker_side, 'sell');
  assertEquals(r.limit_price, 1500.15);
});

// ── computeLimitPrice: $500 straddle edge — tier-selection-by-mid resolution ──

Deno.test('computeLimitPrice — $499.95/$500.05 straddle (mid=500.00) → HIGH_PRICED (inclusive)', () => {
  const r = computeLimitPrice({ side: 'long', intent: 'open', quote: quote('TLT', 499.95, 500.05) });
  assertEquals(r.tier_selection_mid_usd, 500.00);
  assertEquals(r.offset_applied_usd, PRICE_OFFSET_HIGH_PRICED_USD);
  // mid = 500.00 ≥ HIGH_PRICED_THRESHOLD_USD (inclusive per DEC-068 clause k.3).
  assertEquals(HIGH_PRICED_THRESHOLD_USD, 500.00);
});

Deno.test('computeLimitPrice — just-below-threshold $499.90/$499.94 (mid=499.92) → NORMAL', () => {
  const r = computeLimitPrice({ side: 'long', intent: 'open', quote: quote('XYZ', 499.90, 499.94) });
  assert(r.tier_selection_mid_usd < HIGH_PRICED_THRESHOLD_USD);
  assertEquals(r.offset_applied_usd, PRICE_OFFSET_NORMAL_USD);
});

Deno.test('computeLimitPrice — degenerate quote (bid ≤ 0) throws DegenerateQuoteError', () => {
  assertThrows(
    () => computeLimitPrice({ side: 'long', intent: 'open', quote: quote('BAD', 0, 195.05) }),
    DegenerateQuoteError,
  );
});

Deno.test('computeLimitPrice — degenerate quote (sell ask − offset ≤ 0) throws', () => {
  // ask = 0.005, offset = 0.01 → limit = -0.005 → throws
  assertThrows(
    () => computeLimitPrice({ side: 'long', intent: 'close', quote: quote('PENNY', 0.001, 0.005) }),
    DegenerateQuoteError,
  );
});

// ── computeShares: open/increase floor ───────────────────────────────────

Deno.test('computeShares — open at $100 with $5000 notional → 50 shares', () => {
  const r = computeShares({ intent: 'open', delta_notional_abs: 5000, limit_price: 100, current_qty: 0 });
  assert(r.kind === 'shares');
  if (r.kind === 'shares') assertEquals(r.shares, 50);
});

Deno.test('computeShares — floor: $5000 / $103 = 48 (not 48.5)', () => {
  const r = computeShares({ intent: 'open', delta_notional_abs: 5000, limit_price: 103, current_qty: 0 });
  assert(r.kind === 'shares');
  if (r.kind === 'shares') assertEquals(r.shares, 48);
});

// ── computeShares: 0-share guard (load-bearing — race between E1 noop + E2 floor) ──

Deno.test('computeShares — 0-share guard fires when notional < limit_price (open)', () => {
  const r = computeShares({ intent: 'open', delta_notional_abs: 50, limit_price: 1500, current_qty: 0 });
  assertEquals(r.kind, 'zero_share');
  if (r.kind === 'zero_share') assertEquals(r.reason, 'floor_to_zero');
});

// ── computeShares: close = exact-held-qty (clause k.4 — flat, never notional-derived) ──

Deno.test('computeShares — close uses EXACT |current_qty| (not notional-derived)', () => {
  // Even with a notional that would suggest 99 shares at the price, close
  // submits 100 (the exact held qty). Prevents the 1-share-residual-stub.
  const r = computeShares({ intent: 'close', delta_notional_abs: 9900, limit_price: 100, current_qty: 100 });
  assert(r.kind === 'shares');
  if (r.kind === 'shares') assertEquals(r.shares, 100);
});

Deno.test('computeShares — close on short (negative qty) takes |qty|', () => {
  const r = computeShares({ intent: 'close', delta_notional_abs: 9900, limit_price: 100, current_qty: -50 });
  assert(r.kind === 'shares');
  if (r.kind === 'shares') assertEquals(r.shares, 50);
});

Deno.test('computeShares — close with 0 held qty → zero_share (defensive)', () => {
  const r = computeShares({ intent: 'close', delta_notional_abs: 0, limit_price: 100, current_qty: 0 });
  assertEquals(r.kind, 'zero_share');
});

// ── computeShares: decrease cap at qty−1 (clause k.4 — never accidentally close) ──

Deno.test('computeShares — decrease cap: notional says 50, held 30 → cap at qty−1 = 29', () => {
  const r = computeShares({ intent: 'decrease', delta_notional_abs: 5000, limit_price: 100, current_qty: 30 });
  assert(r.kind === 'shares');
  if (r.kind === 'shares') assertEquals(r.shares, 29);
});

Deno.test('computeShares — decrease below 1 share held → zero_share (cannot meaningfully decrease)', () => {
  const r = computeShares({ intent: 'decrease', delta_notional_abs: 100, limit_price: 50, current_qty: 1 });
  assertEquals(r.kind, 'zero_share');
  if (r.kind === 'zero_share') assertEquals(r.reason, 'decrease_below_one_share');
});

Deno.test('computeShares — decrease where notional is too small → zero_share floor_to_zero', () => {
  const r = computeShares({ intent: 'decrease', delta_notional_abs: 5, limit_price: 100, current_qty: 50 });
  assertEquals(r.kind, 'zero_share');
});

// ── BP intent helpers ─────────────────────────────────────────────────────

Deno.test('intentConsumesBuyingPower — open + increase consume; close + decrease do not', () => {
  assertEquals(intentConsumesBuyingPower('open'), true);
  assertEquals(intentConsumesBuyingPower('increase'), true);
  assertEquals(intentConsumesBuyingPower('close'), false);
  assertEquals(intentConsumesBuyingPower('decrease'), false);
  assertEquals(intentConsumesBuyingPower('noop'), false);
});

Deno.test('intentCreditsBuyingPower — close + decrease credit; open + increase do not', () => {
  assertEquals(intentCreditsBuyingPower('close'), true);
  assertEquals(intentCreditsBuyingPower('decrease'), true);
  assertEquals(intentCreditsBuyingPower('open'), false);
  assertEquals(intentCreditsBuyingPower('increase'), false);
});

// ── Gate-6 self-scan — pricing.ts MUST be wall-clock-free (DEC-034 (4)). ──

Deno.test('Gate-6 — pricing.ts contains no wall-clock leakage', async () => {
  const txt = await Deno.readTextFile(new URL('./pricing.ts', import.meta.url));
  assertEquals(/\bDate\.now\(\s*\)/.test(txt), false, 'Date.now() forbidden');
  assertEquals(/\bnew\s+Date\(\s*\)/.test(txt), false, 'new Date() no-arg forbidden');
  assertEquals(/\bperformance\.now\(\s*\)/.test(txt), false, 'performance.now() forbidden');
});