/**
 * Options flow imbalance (Signal #3) per CROSSWIND §4.4.7 — v1 CHAIN-SNAPSHOT.
 *
 * ─────────────────────────── v1 WINDOW SCOPE (READ ME) ───────────────────────────
 * Spec literal:
 *   For each filtered trade in trailing 5 trading days:
 *     direction = +1 (call buy at ask) or (put sell at bid)
 *                 -1 (put buy at ask) or (call sell at bid)
 *     weight    = trade_notional × exp(-age_in_hours / 48)
 *   raw_signal_N = sum(direction × weight) / total_options_volume_N_5d
 *
 * v1 implements a SAME-DAY CHAIN-SNAPSHOT approximation of the spec, NOT a
 * 5-day per-trade reconstruction. Tradier's `/markets/options/chains`
 * endpoint returns one row per contract carrying current NBBO (`bid`,
 * `ask`), most-recent trade (`last`), cumulative DAY volume (`volume`),
 * `open_interest`, greeks, and per-field NBBO/trade timestamps
 * (`bid_date`, `ask_date`, `trade_date`). It is NOT a tape of executed
 * trades — there is no per-print direction signal in the chain endpoint.
 *
 * v1 collapses the per-trade direction classifier to a per-CONTRACT
 * direction proxy:
 *   - `last >= ask` (and ask > 0)  ⇒ aggressive BUY  (last clears the offer)
 *   - `last <= bid` (and bid > 0)  ⇒ aggressive SELL (last clears the bid)
 *   - otherwise                    ⇒ NOT aggressive (contract excluded)
 *
 * The §4.4.7 4-case direction sign table then keys off the proxy:
 *   call + buy-at-ask  → +1
 *   put  + buy-at-ask  → −1
 *   call + sell-at-bid → −1
 *   put  + sell-at-bid → +1
 *
 * Notional proxy:    contract_volume × last × 100  (100-share multiplier)
 * Age (hours):       (as_of − max(bid_date, ask_date, trade_date)) / hour,
 *                    clamped ≥ 0; contracts whose timestamps are ALL null
 *                    are excluded (no defensible age).
 * Decay:             exp(-age_hours / 48)  (spec-literal 48h half-life)
 * Denominator:       Σ contract.volume over the SAME chain snapshot
 *                    (per-symbol total options volume for the trading day),
 *                    which v1 substitutes for spec's
 *                    `total_options_volume_N_5d`.
 *
 * DEC-046 conscious-approximation discipline: this approximation is
 * documented in the orchestrator header AND in
 * docs/04-modules/longshort/<signal-3 doc>. The 5-day reconstruction
 * requires Tradier `/markets/timesales` per-contract pulls (DEC-046
 * Phase 2.7 P3) — deferred to a future revision.
 *
 * ────────────────────────── SMART-MONEY FILTER (§4.4.7) ──────────────────────────
 *   - contract.volume >= 100       (size filter; institutional-tape proxy)
 *   - DTE >= 7                     (excludes 0DTE / very-near-dated noise)
 *   - OTM/ATM via |delta| <= 0.65  (excludes deep-ITM stock-proxies)
 * Plus the at-or-thru-NBBO aggression proxy above. ALL must pass.
 *
 * ─────────────────────────── ANTI-PHANTOM / DEFENSIVE ────────────────────────────
 *   - `total_options_volume === 0` → return null (typed-absence; orchestrator
 *     surfaces `no_qualifying_flow`). NEVER divides by zero / returns NaN.
 *   - `qualifying_count < MIN_QUALIFYING_PRINTS (=5)` → return null
 *     (spec missing-data clause: "fewer than 5 qualifying smart-money
 *     prints"). Per-§4.3.5 non-critical degradation.
 *   - greeks==null OR delta==null → contract excluded (cannot run the
 *     OTM/ATM filter; never defaulted to 0/ATM).
 *   - bid/ask/last/volume==null → contract excluded (never defaulted to 0).
 *
 * ─────────────────────────── DETERMINISM (DEC-034 clause 4) ──────────────────────
 * Pure function. All time arithmetic derives from the injected `as_of: Date`
 * parameter. NO `Date.now()`, NO `performance.now()`, NO random, NO I/O.
 * Replay-deterministic.
 *
 * Owner: longshort (FP-043 — Signal #3 / Phase 2.7)
 */

import type { RawOptionContract } from '../shared/tradier-options-chain-fetcher.ts';

/** Spec-literal 48-hour half-life from §4.4.7. */
const DECAY_HALF_LIFE_HOURS = 48;
/** §4.4.7 smart-money size filter: ≥100 contracts. */
export const MIN_CONTRACT_VOLUME = 100;
/** §4.4.7 maturity filter: 7+ days to expiration. */
export const MIN_DTE_DAYS = 7;
/** OTM/ATM cutoff. |delta| ≤ 0.65 keeps ATM (~0.5) and modestly-OTM
 *  contracts while excluding deep-ITM stock-proxies (|delta| > ~0.7).
 *  Round number chosen for transparency; sensitivity is a future tuning DEC. */
export const OTM_ATM_DELTA_CAP = 0.65;
/** Spec missing-data clause: "fewer than 5 qualifying smart-money prints"
 *  → typed-absence. v1 chain-snapshot interprets "prints" as qualifying
 *  CONTRACTS that classify with a sign. */
export const MIN_QUALIFYING_PRINTS = 5;
/** Options contract multiplier (shares per contract). */
const OPTION_MULTIPLIER = 100;
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export type FlowDirection = 1 | -1;

/**
 * §4.4.7 4-case direction sign table — the LOAD-BEARING classifier. A sign
 * inversion here inverts the entire signal. Tested explicitly per FP-043
 * Phase 2 acceptance.
 *
 * Returns null when the contract is NOT aggressive (last sits between
 * bid and ask, or bid/ask/last is missing/non-positive).
 */
export function classifyFlowDirection(
  option_type: 'call' | 'put',
  bid: number | null,
  ask: number | null,
  last: number | null,
): FlowDirection | null {
  if (last === null || !Number.isFinite(last) || last <= 0) return null;
  // Aggressive BUY: trade clears the offer.
  if (ask !== null && Number.isFinite(ask) && ask > 0 && last >= ask) {
    return option_type === 'call' ? 1 : -1;
  }
  // Aggressive SELL: trade clears the bid.
  if (bid !== null && Number.isFinite(bid) && bid > 0 && last <= bid) {
    return option_type === 'call' ? -1 : 1;
  }
  return null;
}

/** Calendar-day DTE from `as_of` to the contract's expiration date. */
export function daysToExpiration(expiration_date: string, as_of: Date): number {
  const expMs = Date.parse(`${expiration_date}T00:00:00Z`);
  if (!Number.isFinite(expMs)) return Number.NEGATIVE_INFINITY;
  return (expMs - as_of.getTime()) / MS_PER_DAY;
}

/** Age in hours of the most-recent of the contract's NBBO/trade timestamps,
 *  relative to `as_of`. Returns null if ALL three timestamps are null. */
export function contractAgeHours(
  bid_date: number | null,
  ask_date: number | null,
  trade_date: number | null,
  as_of: Date,
): number | null {
  let mostRecent: number | null = null;
  for (const t of [bid_date, ask_date, trade_date]) {
    if (t !== null && Number.isFinite(t) && t > 0) {
      if (mostRecent === null || t > mostRecent) mostRecent = t;
    }
  }
  if (mostRecent === null) return null;
  const ageMs = as_of.getTime() - mostRecent;
  return ageMs > 0 ? ageMs / MS_PER_HOUR : 0;
}

/** Per-§4.4.7 smart-money filter (size + DTE + OTM/ATM). Pure boolean. */
export function passesSmartMoneyFilter(
  c: RawOptionContract,
  as_of: Date,
): boolean {
  if (c.volume === null || !Number.isFinite(c.volume) || c.volume < MIN_CONTRACT_VOLUME) {
    return false;
  }
  const dte = daysToExpiration(c.expiration_date, as_of);
  if (!Number.isFinite(dte) || dte < MIN_DTE_DAYS) return false;
  if (c.greeks === null) return false;
  const delta = c.greeks.delta;
  if (!Number.isFinite(delta)) return false;
  if (Math.abs(delta) > OTM_ATM_DELTA_CAP) return false;
  return true;
}

export interface OptionsFlowResult {
  raw_signal: number;
  qualifying_count: number;
  total_options_volume: number;
}

/**
 * Compute the §4.4.7 v1 chain-snapshot raw signal for one ticker.
 *
 * Returns `null` when:
 *   - `contracts` is empty;
 *   - total cumulative chain volume is 0 (div-by-zero guard → typed-absence);
 *   - fewer than `MIN_QUALIFYING_PRINTS` contracts survive smart-money +
 *     direction-classifier;
 *   - numerator/denominator produced a non-finite value (defensive).
 */
export function computeOptionsFlow(
  contracts: ReadonlyArray<RawOptionContract>,
  as_of: Date,
): OptionsFlowResult | null {
  if (contracts.length === 0) return null;

  // Denominator: total options volume across the snapshot (per-ticker).
  let total_options_volume = 0;
  for (const c of contracts) {
    if (c.volume !== null && Number.isFinite(c.volume) && c.volume > 0) {
      total_options_volume += c.volume;
    }
  }
  if (total_options_volume <= 0) return null; // div-by-zero guard

  let numerator = 0;
  let qualifying_count = 0;
  for (const c of contracts) {
    if (!passesSmartMoneyFilter(c, as_of)) continue;
    const direction = classifyFlowDirection(c.option_type, c.bid, c.ask, c.last);
    if (direction === null) continue;
    const age_hours = contractAgeHours(c.bid_date, c.ask_date, c.trade_date, as_of);
    if (age_hours === null) continue;
    // last/volume already null-checked by filter+classifier; re-assert non-null
    // for the numeric arithmetic.
    const last = c.last as number;
    const volume = c.volume as number;
    const notional = volume * last * OPTION_MULTIPLIER;
    if (!Number.isFinite(notional) || notional <= 0) continue;
    const decay = Math.exp(-age_hours / DECAY_HALF_LIFE_HOURS);
    numerator += direction * notional * decay;
    qualifying_count++;
  }

  if (qualifying_count < MIN_QUALIFYING_PRINTS) return null;

  const raw_signal = numerator / total_options_volume;
  if (!Number.isFinite(raw_signal)) return null;

  return { raw_signal, qualifying_count, total_options_volume };
}