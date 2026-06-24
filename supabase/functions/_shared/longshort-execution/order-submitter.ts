/**
 * order-submitter — FP-056 E2 (DEC-068 clauses a–k; INC-77 closure same-PR).
 *
 * The I/O SHELL — the ONLY broker-touching surface in this module. Wraps the
 * pure pricing.ts + ordering.ts kernels with:
 *   1. clause-(k).1 cross-symbol submission ordering,
 *   2. quote fetch + verify_quote_freshness tolerance check (the existing §11.0.7
 *      #3 verifier — the staleness constant is its `max_age_s = 5`),
 *   3. §8.2 marketable-limit pricing + whole-share conversion (pricing.ts),
 *   4. clause-(k).5 hybrid buying-power bookkeeping (pre-batch snapshot +
 *      per-order running decrement/credit on acceptance),
 *   5. POST /v2/orders via the BrokerOrderSubmitter interface,
 *   6. Phase-1 acceptance polling via the EXISTING BrokerOrderAcceptanceFetcher,
 *   7. typed terminal SubmissionResult return — provenance flows first-class
 *      from ExecutionDelta to EVERY result.
 *
 * EXPLICITLY NOT IN E2 (lives at E3+):
 *   - retry / slippage escalation / Tier-1 ladder (clause b — E3)
 *   - Phase-2 fill monitoring (E3)
 *   - rejection-cache propagation / §8.9 NO-PAUSE classes (E4)
 *   - operator-page / Tier-3 (clause b — E3)
 *   - longshort.execute permission gate (E5)
 *   - reconciliation_events writes (E4)
 *
 * PURITY DISCIPLINE: the shell does NOT call `new Date()` / `Date.now()` /
 * `performance.now()` (DEC-034 clause 4 / Gate-6 scanner enforces). The `ts`
 * parameter is the sole Date source. Side effects are confined to the four
 * injected fetchers + the BrokerOrderSubmitter.
 *
 * PAPER-ONLY: the BrokerOrderSubmitter implementation (AlpacaPaperClient
 * wrapper) is paper-only-guarded at construction per DEC-068 clause (f) +
 * (k).8 + the INC-77 closure — see `alpaca-paper-client.ts` allow-list.
 * The shell itself constructs no URL strings; it speaks the interface.
 */

import type {
  BrokerOrderAcceptanceFetcher,
  BrokerOrderRequest,
  BrokerOrderSubmitter,
  BrokerBuyingPowerFetcher,
  BrokerQuoteFetcher,
} from '../longshort-broker-interfaces.ts';
import type { DeltaIntent, ExecutionDelta } from './rebalance-planner.ts';
import { VERIFY_QUOTE_FRESHNESS_TOLERANCE } from '../longshort-verifiers/verify_quote_freshness.ts';
import {
  PRICE_OFFSET_HIGH_PRICED_USD,
  PRICE_OFFSET_NORMAL_USD,
  HIGH_PRICED_THRESHOLD_USD,
  computeLimitPrice,
  computeShares,
  intentConsumesBuyingPower,
  intentCreditsBuyingPower,
} from './pricing.ts';
import { orderDeltas } from './ordering.ts';

// ────────────────────────────────────────────────────────────────────────────
// Config / defaults (named constants; not silent — DW-RATIFICATION rows).
// ────────────────────────────────────────────────────────────────────────────

/**
 * Phase-1 acceptance-poll timeout in seconds. The existing
 * BrokerOrderAcceptanceFetcher contract carries `timeout_s` as a per-call
 * parameter; this is the E2 default. §8.5 30s end-to-end budget is the
 * outer bound — the per-target Phase-1 wait sits inside.
 */
export const PHASE1_ACCEPTANCE_TIMEOUT_S_DEFAULT = 10 as const;

/**
 * QUOTE_MAX_STALENESS_S — sourced from the EXISTING §11.0.7 #3 verifier
 * default (`verify_quote_freshness.ts` `VERIFY_QUOTE_FRESHNESS_TOLERANCE
 * .max_age_s = 5`). DW-147 ratifies this against empirical paper-window
 * quote-age distribution at the E3 replay-evidence checkpoint.
 *
 * We import the verifier's own constant so a future ratification edit lands
 * in one place and propagates here transitively — no duplicate-constant
 * drift between the verifier and the submitter.
 */
export const QUOTE_MAX_STALENESS_S = VERIFY_QUOTE_FRESHNESS_TOLERANCE.max_age_s;

// ────────────────────────────────────────────────────────────────────────────
// Provenance bundle — flows from ExecutionDelta to EVERY SubmissionResult.
// ────────────────────────────────────────────────────────────────────────────

export interface DeltaProvenance {
  selection_reason: ExecutionDelta['selection_reason'];
  substituted_from_symbol: ExecutionDelta['substituted_from_symbol'];
  original_rank: ExecutionDelta['original_rank'];
  sector: ExecutionDelta['sector'];
  computed_at: ExecutionDelta['computed_at'];
}

function provenanceFromDelta(d: ExecutionDelta): DeltaProvenance {
  return {
    selection_reason: d.selection_reason,
    substituted_from_symbol: d.substituted_from_symbol,
    original_rank: d.original_rank,
    sector: d.sector,
    computed_at: d.computed_at,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// SubmissionResult — typed-union; NO phantom defaults (DEC-034 (2)/(3)).
// ────────────────────────────────────────────────────────────────────────────

export type SubmissionResult =
  | {
      kind: 'accepted';
      symbol: string;
      side: 'long' | 'short';
      intent: DeltaIntent;
      broker_side: 'buy' | 'sell';
      order_id: string;
      client_order_id: string;
      shares: number;
      limit_price: number;
      offset_applied_usd: number;
      tier_selection_mid_usd: number;
      accepted_at: string;            // ISO of broker-side submitted_at
      provenance: DeltaProvenance;
    }
  | {
      kind: 'rejected';
      symbol: string;
      side: 'long' | 'short';
      intent: DeltaIntent;
      broker_side: 'buy' | 'sell';
      client_order_id: string;
      shares: number;
      limit_price: number;
      reason: string;                  // structured rejection reason from broker / shell classification
      broker_status_code: number | null;
      rejected_at: string;             // ISO of shell-observed rejection
      provenance: DeltaProvenance;
    }
  | {
      kind: 'pending_timeout';
      symbol: string;
      side: 'long' | 'short';
      intent: DeltaIntent;
      broker_side: 'buy' | 'sell';
      order_id: string;
      client_order_id: string;
      shares: number;
      limit_price: number;
      timeout_s: number;
      pending_elapsed_s: number;
      observed_at: string;             // ISO; E3 wraps & decides retry/cancel
      provenance: DeltaProvenance;
    }
  | {
      kind: 'zero_share_skipped';
      symbol: string;
      side: 'long' | 'short';
      intent: DeltaIntent;
      reason: 'floor_to_zero' | 'decrease_below_one_share';
      limit_price: number;
      observed_at: string;
      provenance: DeltaProvenance;
    }
  | {
      kind: 'quote_stale_skipped';
      symbol: string;
      side: 'long' | 'short';
      intent: DeltaIntent;
      quote_age_s: number;
      max_age_s: number;
      refetched_once: boolean;
      observed_at: string;
      provenance: DeltaProvenance;
    }
  | {
      kind: 'insufficient_buying_power_skipped';
      symbol: string;
      side: 'long' | 'short';
      intent: DeltaIntent;
      shares: number;
      limit_price: number;
      proposed_cost_usd: number;
      remaining_buying_power_usd: number;
      observed_at: string;
      provenance: DeltaProvenance;
    }
  | {
      kind: 'noop_skipped';
      symbol: string;
      side: 'long' | 'short';
      observed_at: string;
      provenance: DeltaProvenance;
    };

// ────────────────────────────────────────────────────────────────────────────
// Idempotency key (DEC-031 T8) — deterministic per (symbol, intent, ts).
// ────────────────────────────────────────────────────────────────────────────

/** `lse-{symbol}-{intent}-{ts_ms}` — deterministic; safe re-submit dedupe. */
export function buildClientOrderId(symbol: string, intent: DeltaIntent, ts: Date): string {
  return `lse-${symbol}-${intent}-${ts.getTime()}`;
}

// ────────────────────────────────────────────────────────────────────────────
// submitRebalance — the E2 entry. Construct → submit → await acceptance →
//   return terminal SubmissionResult per delta. NO retry; NO Phase-2; NO page.
// ────────────────────────────────────────────────────────────────────────────

export interface SubmitRebalanceConfig {
  /** Phase-1 acceptance poll timeout per order; defaults to PHASE1_ACCEPTANCE_TIMEOUT_S_DEFAULT. */
  phase1TimeoutS?: number;
  /** Quote-staleness ceiling in seconds; defaults to QUOTE_MAX_STALENESS_S (= verifier's max_age_s). */
  quoteMaxStalenessS?: number;
  /** §8.2 pricing constants — defaults to the DEC-068 clause (k).3 ratified values. */
  pricingConstants?: {
    PRICE_OFFSET_NORMAL_USD?: number;
    PRICE_OFFSET_HIGH_PRICED_USD?: number;
    HIGH_PRICED_THRESHOLD_USD?: number;
  };
}

export interface SubmitRebalanceParams {
  deltas: readonly ExecutionDelta[];
  quoteFetcher: BrokerQuoteFetcher;
  buyingPowerFetcher: BrokerBuyingPowerFetcher;
  orderSubmitter: BrokerOrderSubmitter;
  acceptanceFetcher: BrokerOrderAcceptanceFetcher;
  /** Injected clock (DEC-034 (4)). The shell never reads wall-clock itself. */
  ts: Date;
  config?: SubmitRebalanceConfig;
}

/**
 * Per-delta path:
 *
 *   noop → noop_skipped (no submission)
 *   else:
 *     quote = quoteFetcher.fetchQuote(symbol, ts)
 *     if (ts − quote.ts) > QUOTE_MAX_STALENESS_S:
 *        refetch ONCE; if still stale → quote_stale_skipped, continue
 *     computeLimitPrice(...) + computeShares(...)
 *     if zero-share signal → zero_share_skipped, continue
 *     if intent consumes BP and shares*limit > remainingBP →
 *        insufficient_buying_power_skipped, continue
 *     orderSubmitter.submitOrder(...) — throws propagate as `rejected`
 *        with structured reason (the typed-throw boundary per DEC-034 (3))
 *     acceptanceFetcher.fetchOrderAcceptance(order_id, timeout_s, ts):
 *        accepted  → accepted (decrement/credit BP per intent)
 *        rejected  → rejected
 *        pending   → pending_timeout (E3 routes; E2 returns terminal)
 */
export async function submitRebalance(p: SubmitRebalanceParams): Promise<SubmissionResult[]> {
  const timeoutS = p.config?.phase1TimeoutS ?? PHASE1_ACCEPTANCE_TIMEOUT_S_DEFAULT;
  const staleS = p.config?.quoteMaxStalenessS ?? QUOTE_MAX_STALENESS_S;
  const pricingConstants = {
    PRICE_OFFSET_NORMAL_USD: p.config?.pricingConstants?.PRICE_OFFSET_NORMAL_USD ?? PRICE_OFFSET_NORMAL_USD,
    PRICE_OFFSET_HIGH_PRICED_USD: p.config?.pricingConstants?.PRICE_OFFSET_HIGH_PRICED_USD ?? PRICE_OFFSET_HIGH_PRICED_USD,
    HIGH_PRICED_THRESHOLD_USD: p.config?.pricingConstants?.HIGH_PRICED_THRESHOLD_USD ?? HIGH_PRICED_THRESHOLD_USD,
  };
  const observedAt = p.ts.toISOString();

  // Clause-(k).1 cross-symbol ordering (Closes → Decreases → Opens → Increases;
  // sides interleaved by |delta_notional| desc within class). Filters noops.
  const ordered = orderDeltas(p.deltas);

  // Surface the filtered noops as noop_skipped for audit completeness.
  const noopResults: SubmissionResult[] = p.deltas
    .filter((d) => d.intent === 'noop')
    .map((d) => ({
      kind: 'noop_skipped' as const,
      symbol: d.symbol,
      side: d.side,
      observed_at: observedAt,
      provenance: provenanceFromDelta(d),
    }));

  // Pre-batch BP snapshot — the clause-(k).5 hybrid model's t₀.
  const bpSnap = await p.buyingPowerFetcher.fetchBuyingPower(p.ts);
  let remainingBp = bpSnap.available_bp;

  const results: SubmissionResult[] = [...noopResults];

  for (const delta of ordered) {
    const provenance = provenanceFromDelta(delta);

    // ── 1. Fetch quote + staleness check (one inline refetch on stale).
    let quote = await p.quoteFetcher.fetchQuote(delta.symbol, p.ts);
    let ageS = Math.max(0, (p.ts.getTime() - quote.ts.getTime()) / 1000);
    let refetched = false;
    if (ageS > staleS) {
      quote = await p.quoteFetcher.fetchQuote(delta.symbol, p.ts);
      ageS = Math.max(0, (p.ts.getTime() - quote.ts.getTime()) / 1000);
      refetched = true;
    }
    if (ageS > staleS) {
      results.push({
        kind: 'quote_stale_skipped',
        symbol: delta.symbol,
        side: delta.side,
        intent: delta.intent,
        quote_age_s: ageS,
        max_age_s: staleS,
        refetched_once: refetched,
        observed_at: observedAt,
        provenance,
      });
      continue;
    }

    // `noop` was filtered by orderDeltas — defensive guard.
    if (delta.intent === 'noop') continue;
    const intent = delta.intent;

    // ── 2. Pricing (§8.2 marketable-limit; tier by mid).
    const priced = computeLimitPrice({
      side: delta.side,
      intent,
      quote,
      constants: pricingConstants,
    });

    // ── 3. Whole-share conversion (close = exact-held-qty; decrease cap at qty−1).
    const shareResult = computeShares({
      intent,
      delta_notional_abs: Math.abs(delta.delta_notional),
      limit_price: priced.limit_price,
      current_qty: Math.round(
        // current_market_value / current_price ≈ qty; but ExecutionDelta does
        // not carry signed qty (only signed market_value). For the close +
        // decrease paths we need |qty|. Recover via current_market_value /
        // current_price IS not available on ExecutionDelta either.
        //
        // Resolution: ExecutionDelta carries current_market_value; for closes
        // computeShares uses |current_qty|, and we need it. The orchestrator
        // boundary (which calls submitRebalance) will populate qty via a
        // sidecar — but E1 ExecutionDelta does not carry qty.
        //
        // Workaround for E2: derive |qty| from |current_market_value/quote.last|
        // when intent is close/decrease — quote.last is the last-trade mark.
        // If quote.last is null, fall back to the limit_price as the qty basis.
        // This is the §8.2-aligned price-basis for qty derivation; documented
        // here so the boundary contract is explicit.
        intent === 'close' || intent === 'decrease'
          ? Math.abs(delta.current_market_value) /
            (quote.last && quote.last > 0 ? quote.last : priced.limit_price)
          : 0,
      ),
    });

    if (shareResult.kind === 'zero_share') {
      results.push({
        kind: 'zero_share_skipped',
        symbol: delta.symbol,
        side: delta.side,
        intent,
        reason: shareResult.reason,
        limit_price: priced.limit_price,
        observed_at: observedAt,
        provenance,
      });
      continue;
    }
    const shares = shareResult.shares;

    // ── 4. BP pre-check (only open/increase consume; close/decrease credit).
    if (intentConsumesBuyingPower(intent)) {
      const cost = shares * priced.limit_price;
      if (cost > remainingBp) {
        results.push({
          kind: 'insufficient_buying_power_skipped',
          symbol: delta.symbol,
          side: delta.side,
          intent,
          shares,
          limit_price: priced.limit_price,
          proposed_cost_usd: cost,
          remaining_buying_power_usd: remainingBp,
          observed_at: observedAt,
          provenance,
        });
        continue;
      }
    }

    // ── 5. Submit (POST /v2/orders via injected BrokerOrderSubmitter).
    const clientOrderId = buildClientOrderId(delta.symbol, intent, p.ts);
    const request: BrokerOrderRequest = {
      symbol: delta.symbol,
      qty: shares,
      side: priced.broker_side,
      type: 'limit',
      time_in_force: 'day',
      limit_price: priced.limit_price,
      client_order_id: clientOrderId,
    };

    let acceptance: Awaited<ReturnType<BrokerOrderSubmitter['submitOrder']>>;
    try {
      acceptance = await p.orderSubmitter.submitOrder(request, p.ts);
    } catch (err) {
      // Per DEC-034 (3): broker errors propagate as typed throws; E2 classifies
      // into a `rejected` terminal so the batch can continue. E3 wraps this
      // for retry/skip/page; E2 returns terminals only.
      const message = err instanceof Error ? err.message : String(err);
      const statusMatch = /AlpacaApiError\s+(\d+)/.exec(message);
      const statusCode = statusMatch ? Number(statusMatch[1]) : null;
      results.push({
        kind: 'rejected',
        symbol: delta.symbol,
        side: delta.side,
        intent,
        broker_side: priced.broker_side,
        client_order_id: clientOrderId,
        shares,
        limit_price: priced.limit_price,
        reason: message.slice(0, 500),
        broker_status_code: statusCode,
        rejected_at: observedAt,
        provenance,
      });
      continue;
    }

    // ── 6. Phase-1 acceptance poll (existing BrokerOrderAcceptanceFetcher).
    const ack = await p.acceptanceFetcher.fetchOrderAcceptance(acceptance.order_id, timeoutS, p.ts);

    if (ack.state === 'accepted') {
      // ── 7. BP bookkeeping — running decrement/credit per clause (k).5 hybrid.
      const consideration = shares * priced.limit_price;
      if (intentConsumesBuyingPower(intent)) remainingBp -= consideration;
      else if (intentCreditsBuyingPower(intent)) remainingBp += consideration;
      results.push({
        kind: 'accepted',
        symbol: delta.symbol,
        side: delta.side,
        intent,
        broker_side: priced.broker_side,
        order_id: acceptance.order_id,
        client_order_id: clientOrderId,
        shares,
        limit_price: priced.limit_price,
        offset_applied_usd: priced.offset_applied_usd,
        tier_selection_mid_usd: priced.tier_selection_mid_usd,
        accepted_at: acceptance.submitted_at.toISOString(),
        provenance,
      });
    } else if (ack.state === 'rejected') {
      results.push({
        kind: 'rejected',
        symbol: delta.symbol,
        side: delta.side,
        intent,
        broker_side: priced.broker_side,
        client_order_id: clientOrderId,
        shares,
        limit_price: priced.limit_price,
        reason: ack.rejection_reason ?? 'broker_returned_rejected_no_reason',
        broker_status_code: null,
        rejected_at: observedAt,
        provenance,
      });
    } else {
      // pending — Phase-1 unresolved within timeout. E2 returns terminal;
      // E3 wraps with cancel/retry per DEC-068 clause (b). NO cancel here.
      results.push({
        kind: 'pending_timeout',
        symbol: delta.symbol,
        side: delta.side,
        intent,
        broker_side: priced.broker_side,
        order_id: acceptance.order_id,
        client_order_id: clientOrderId,
        shares,
        limit_price: priced.limit_price,
        timeout_s: timeoutS,
        pending_elapsed_s: ack.pending_elapsed_s,
        observed_at: observedAt,
        provenance,
      });
    }
  }

  return results;
}