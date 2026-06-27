/**
 * short-stop-evaluator — DW-149 (Component 1).
 *
 * The active squeeze circuit-breaker. Per-tick, BEFORE advanceTick:
 *
 *   1. List open broker positions (BROKER-TRUTH, fill-reality).
 *   2. For each SHORT (`qty < 0`) compute `loss% = (current_price −
 *      avg_entry_price) / avg_entry_price` — POSITIVE when underwater
 *      (price rose against the short).
 *   3. If `loss% ≥ SHORT_STOP_LOSS_THRESHOLD` (default 0.15, §8.6.2):
 *      a. If NO short-stop cover order is already in-flight for the
 *         symbol → submit MARKETABLE LIMIT cover at the +200bps elevated
 *         tilt (reuses the §8.6.2 elevated-200bps mechanic).
 *      b. If an existing limit cover has been in-flight ≥ 20s
 *         (§8.6.2:152 short-stop Phase-1 timeout) AND no parallel market
 *         leg is in-flight → submit a PARALLEL MARKET cover. The limit
 *         leg is NOT cancelled (the cancel-and-retry hazard: cancelling
 *         a just-accepted order can create phantom-rejection / retry-
 *         storm). Race the broker; the kernel + next-tick reconstruct
 *         cancel the loser when one fills.
 *
 * TIME DISCIPLINE: the breach trigger is a PRICE RATIO, not a clock.
 * `ts` enters only as (i) the `listOpenPositions(ts)` fetched_at source
 * and (ii) the audit/event stamp + the deterministic client_order_id
 * minute-bucket idempotency key. No wall-clock read.
 *
 * INDEPENDENCE: this evaluator runs in `runTick` (the ADVANCE path) —
 * NOT in `rebalance-planner` (the placement path). The stop fires
 * independently of the rebalance cadence; a squeeze cannot wait for the
 * next rebalance. DW-164 working-order visibility ensures the next
 * planner sees the pending cover and does not double-act on the symbol.
 *
 * IDEMPOTENCY: deterministic client_order_id keyed by
 * `(symbol, ts-minute-bucket)` so the next intra-minute tick does not
 * double-fire the same cover while the broker is working it. Cross-
 * minute repeats are guarded by the in-flight check (an existing pending
 * cover for the symbol blocks a fresh placement).
 *
 * THRESHOLD CONFIG: `SHORT_STOP_LOSS_THRESHOLD = 0.15` (single global
 * const). Env-overridable via `LONGSHORT_SHORT_STOP_THRESHOLD` with
 * strict numeric parse + range guard `0 < x < 1` — half-set / malformed
 * / out-of-range overrides revert to the default (operator footgun
 * prevention; DEC-048 tuning seam for the future Phase-7 per-name FP).
 */

import type {
  BrokerOrderSubmitter,
  BrokerPosition,
  BrokerPositionFetcher,
  BrokerOrderRequest,
} from '../longshort-broker-interfaces.ts';
import type { InFlightOrder } from './state-machine.ts';

/** Default §8.6.2 short-stop threshold — 15% adverse move on a short. */
export const SHORT_STOP_LOSS_THRESHOLD = 0.15 as const;

/** §8.6.2:152 parallel-market trigger: when the limit cover has been
 *  in-flight at least this many seconds with no fill, fire the market
 *  leg in parallel (DO NOT cancel the limit). Mirrors the kernel's
 *  STEP_FILL_WAIT_S_SHORT_STOP value. */
export const SHORT_STOP_PARALLEL_MARKET_AFTER_S = 20 as const;

/** §8.6.2 elevated cover tilt — buy-to-cover priced 200 bps above the
 *  current mark to drive marketable-limit fill on most names. */
export const SHORT_STOP_COVER_TILT_BPS = 200 as const;

/** Client-order-id prefixes — used as both the broker idempotency key AND
 *  the substring the evaluator scans `reconstructInFlight` for to detect
 *  an existing cover leg. KEEP STABLE — changing breaks idempotency. */
export const SHORT_STOP_LIMIT_COID_PREFIX = 'lsep-shortstop-' as const;
export const SHORT_STOP_MARKET_COID_PREFIX = 'lsep-shortstopmkt-' as const;

export interface ShortStopBreachRecord {
  symbol: string;
  qty: number;             // signed (negative)
  abs_shares: number;
  avg_entry_price: number;
  current_price: number;
  loss_pct: number;        // positive when underwater
}

export interface ShortStopFiredLeg {
  symbol: string;
  leg: 'limit' | 'market';
  order_id: string;
  client_order_id: string;
  shares: number;
  limit_price: number | null;   // null when leg='market'
}

export interface ShortStopEvaluateResult {
  /** Number of distinct symbols whose breach triggered ANY cover action
   *  this tick (initial limit OR parallel market). Surfaced into the
   *  tick-scheduler result so the aggregate-gate transient-vs-persistent
   *  annotation knows whether to demote a band-failure to log-only. */
  short_stop_fired_count: number;
  /** Per-symbol breach records (for audit / observability). */
  breaches: ShortStopBreachRecord[];
  /** Per-leg submission outcomes (for audit + the integration assertions). */
  fired_legs: ShortStopFiredLeg[];
  /** Per-symbol skipped reasons (already-covered, missing current_price, etc.). */
  skipped: Array<{ symbol: string; reason: string }>;
}

export interface EvaluateShortStopsParams {
  positionFetcher: BrokerPositionFetcher;
  submitter: BrokerOrderSubmitter;
  /** The advance-path in-flight orders THIS tick (the reconstructed set).
   *  Used to detect existing cover legs (by client_order_id prefix) so we
   *  don't double-fire while the broker is working a prior placement. */
  inFlight: readonly InFlightOrder[];
  ts: Date;
  /** Resolved threshold (caller passes the env-resolved value; production
   *  resolves via `readShortStopThreshold(Deno.env)`). */
  threshold?: number;
}

/** Env-driven threshold override. Strict: must parseFloat to finite + be
 *  strictly in (0, 1) — else revert to default. NO half-set acceptance. */
export function readShortStopThreshold(env: { get(name: string): string | undefined }): number {
  const raw = env.get('LONGSHORT_SHORT_STOP_THRESHOLD');
  if (raw === undefined || raw === '') return SHORT_STOP_LOSS_THRESHOLD;
  // allow-bare-parsefloat: DW-149 (explicit Number.isFinite + range guard below)
  const parsed = parseFloat(raw);
  if (!Number.isFinite(parsed)) return SHORT_STOP_LOSS_THRESHOLD;
  if (parsed <= 0 || parsed >= 1) return SHORT_STOP_LOSS_THRESHOLD;
  return parsed;
}

/** Compute loss% for a SHORT position. Positive when underwater. Returns
 *  null when current_price / avg_entry_price are absent or non-positive. */
export function computeShortLossPct(p: BrokerPosition): number | null {
  if (p.current_price === undefined) return null;
  if (!Number.isFinite(p.current_price) || !Number.isFinite(p.avg_entry_price)) return null;
  if (p.avg_entry_price <= 0 || p.current_price <= 0) return null;
  return (p.current_price - p.avg_entry_price) / p.avg_entry_price;
}

/** Minute-bucket idempotency suffix. Floors `ts` to the minute. */
export function tsMinuteBucket(ts: Date): string {
  const ms = ts.getTime();
  const minute = Math.floor(ms / 60_000);
  return String(minute);
}

export function buildShortStopLimitCoid(symbol: string, ts: Date): string {
  return `${SHORT_STOP_LIMIT_COID_PREFIX}${symbol}-${tsMinuteBucket(ts)}`;
}
export function buildShortStopMarketCoid(symbol: string, ts: Date): string {
  return `${SHORT_STOP_MARKET_COID_PREFIX}${symbol}-${tsMinuteBucket(ts)}`;
}

/** Existing short-stop cover (any leg) for `symbol` in the in-flight set,
 *  if any. Detection is by client_order_id prefix. Returned record carries
 *  `submitted_at` so the caller can decide whether the parallel-market
 *  Phase-1 timeout has elapsed. */
function findExistingCoverLeg(
  inFlight: readonly InFlightOrder[],
  symbol: string,
  prefix: string,
): InFlightOrder | undefined {
  return inFlight.find(
    (o) => o.symbol === symbol && o.client_order_id.startsWith(prefix),
  );
}

/** Compute the +200bps elevated cover limit price (buy-to-cover at the
 *  ask + tilt). Pure helper exported for the test surface. */
export function computeCoverLimitPrice(current_price: number): number {
  return current_price * (1 + SHORT_STOP_COVER_TILT_BPS / 10_000);
}

/** Round limit price to 2dp (Alpaca paper boundary; consistent with the
 *  E2 submitter's `toFixed(2)` path). */
function roundLimit(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function evaluateShortStops(
  p: EvaluateShortStopsParams,
): Promise<ShortStopEvaluateResult> {
  const threshold = p.threshold ?? SHORT_STOP_LOSS_THRESHOLD;
  const listOpenPositions = p.positionFetcher.listOpenPositions;
  if (!listOpenPositions) {
    // Typed-absence: the live AlpacaPositionFetcher always provides this;
    // a test/legacy fetcher that omits it disables the stop (with an
    // explicit skip record — NOT a silent no-op).
    return {
      short_stop_fired_count: 0,
      breaches: [],
      fired_legs: [],
      skipped: [{ symbol: '*', reason: 'position_fetcher_missing_listOpenPositions' }],
    };
  }

  const positions = await listOpenPositions.call(p.positionFetcher, p.ts);
  const breaches: ShortStopBreachRecord[] = [];
  const skipped: Array<{ symbol: string; reason: string }> = [];

  for (const pos of positions) {
    if (pos.qty >= 0) continue; // long position — never short-stopped
    const lossPct = computeShortLossPct(pos);
    if (lossPct === null) {
      skipped.push({ symbol: pos.symbol, reason: 'missing_current_price_or_avg_entry' });
      continue;
    }
    if (lossPct < threshold) continue;
    breaches.push({
      symbol: pos.symbol,
      qty: pos.qty,
      abs_shares: Math.abs(Math.trunc(pos.qty)),
      avg_entry_price: pos.avg_entry_price,
      current_price: pos.current_price!,
      loss_pct: lossPct,
    });
  }

  const firedLegs: ShortStopFiredLeg[] = [];
  const firedSymbols = new Set<string>();

  for (const breach of breaches) {
    if (breach.abs_shares <= 0) {
      skipped.push({ symbol: breach.symbol, reason: 'non_integer_or_zero_short_qty' });
      continue;
    }

    const existingLimit = findExistingCoverLeg(p.inFlight, breach.symbol, SHORT_STOP_LIMIT_COID_PREFIX);
    const existingMarket = findExistingCoverLeg(p.inFlight, breach.symbol, SHORT_STOP_MARKET_COID_PREFIX);

    // (a) No cover in-flight → place initial marketable-limit at +200bps.
    if (!existingLimit && !existingMarket) {
      const limitPrice = roundLimit(computeCoverLimitPrice(breach.current_price));
      const coid = buildShortStopLimitCoid(breach.symbol, p.ts);
      const req: BrokerOrderRequest = {
        symbol: breach.symbol,
        qty: breach.abs_shares,
        side: 'buy',
        type: 'limit',
        time_in_force: 'day',
        limit_price: limitPrice,
        client_order_id: coid,
      };
      try {
        const ack = await p.submitter.submitOrder(req, p.ts);
        firedLegs.push({
          symbol: breach.symbol,
          leg: 'limit',
          order_id: ack.order_id,
          client_order_id: ack.client_order_id,
          shares: breach.abs_shares,
          limit_price: limitPrice,
        });
        firedSymbols.add(breach.symbol);
      } catch (err) {
        skipped.push({
          symbol: breach.symbol,
          reason: `limit_submit_failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      continue;
    }

    // (b) Limit in-flight but no market leg yet → check parallel trigger.
    if (existingLimit && !existingMarket) {
      const elapsedS = Math.max(0, (p.ts.getTime() - existingLimit.submitted_at.getTime()) / 1000);
      if (elapsedS >= SHORT_STOP_PARALLEL_MARKET_AFTER_S) {
        const coid = buildShortStopMarketCoid(breach.symbol, p.ts);
        const req: BrokerOrderRequest = {
          symbol: breach.symbol,
          qty: breach.abs_shares,
          side: 'buy',
          type: 'market',
          time_in_force: 'day',
          limit_price: 0, // ignored — market type
          client_order_id: coid,
        };
        try {
          const ack = await p.submitter.submitOrder(req, p.ts);
          firedLegs.push({
            symbol: breach.symbol,
            leg: 'market',
            order_id: ack.order_id,
            client_order_id: ack.client_order_id,
            shares: breach.abs_shares,
            limit_price: null,
          });
          firedSymbols.add(breach.symbol);
        } catch (err) {
          skipped.push({
            symbol: breach.symbol,
            reason: `market_submit_failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      } else {
        skipped.push({
          symbol: breach.symbol,
          reason: `cover_in_flight_within_parallel_window (elapsed_s=${elapsedS.toFixed(1)})`,
        });
      }
      continue;
    }

    // (c) Both legs already in-flight → broker is racing them; no action.
    skipped.push({ symbol: breach.symbol, reason: 'both_legs_already_in_flight' });
  }

  return {
    short_stop_fired_count: firedSymbols.size,
    breaches,
    fired_legs: firedLegs,
    skipped,
  };
}