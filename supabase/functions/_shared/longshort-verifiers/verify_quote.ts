/**
 * verify_quote — Reconciliation verifier #2 per CROSSWIND §11.0.7.
 *
 * Tier: medium (12-month retention per §11.0.10)
 * Tolerance class: noise_tolerant (5 firings within 1h rolling window escalates per §11.0.9)
 * Magnitude escalation: 100 bps absolute single-firing escalation per §11.0.9 (line 270)
 *
 * Per §11.0.7: "checks signal-source against reconciliation-source against broker-source per §11.0.3."
 * Per §11.0.9 initial tolerance (line 224): "5 bps absolute OR 1¢, whichever is greater, between
 * signal-source and reconciliation-source." Interpreted as: a firing occurs only when BOTH
 * thresholds are exceeded (the "whichever is greater" effectively gates by the looser bound).
 *
 * Divergence shape:
 *   {
 *     signal_vs_recon_bps, signal_vs_broker_bps, recon_vs_broker_bps,
 *     signal_vs_recon_abs_cents,
 *     max_pairwise_bps,                          // for 100bps magnitude escalation
 *   }
 *
 * classify_outcome rule:
 *   - max_pairwise_bps >= 100                                              → failure_escalated
 *   - signal_vs_recon_bps > 5 AND signal_vs_recon_abs_cents > 1.0          → failure_handled
 *   - otherwise                                                            → false_positive_within_tolerance
 *
 * failure_action (noise-tolerant medium tier): action_taken='logged_for_pattern_analysis' —
 * routine firings inform Phase 0B tuning aggregate; no symbol-halt.
 */

import { reconcile } from '../longshort-reconciliation-lifecycle.ts';
import type {
  ReconcileCallSpec,
  ReconcileResult,
  ReconciliationOutcome,

  FetcherSource,
} from '../longshort-reconciliation-types.ts';
import type {
  BrokerQuote,
  BrokerQuoteFetcher,
} from '../longshort-broker-interfaces.ts';

/** Triplet of quotes for one symbol from the three sources per §11.0.3. */
export interface QuoteTriplet {
  signal: BrokerQuote;    // signal-source (e.g., Polygon)
  recon: BrokerQuote;     // reconciliation-source (e.g., Tradier/Yahoo)
  broker: BrokerQuote;    // broker-source (e.g., Alpaca)
}

/** Tolerance configuration per §11.0.9 verbatim. */
export const VERIFY_QUOTE_TOLERANCE = {
  bps_threshold: 5,                  // §11.0.9 line 224: 5 bps absolute
  abs_cents_threshold: 1.0,          // §11.0.9 line 224: or 1¢
  magnitude_escalation_bps: 100,     // §11.0.9 line 270: 100 bps absolute single-firing escalation
};

interface QuoteDivergence extends Record<string, unknown> {
  signal_vs_recon_bps: number;
  signal_vs_broker_bps: number;
  recon_vs_broker_bps: number;
  signal_vs_recon_abs_cents: number;
  max_pairwise_bps: number;
}

function mid(q: BrokerQuote): number {
  // Mid price for bps denominator. Both bid+ask required by interface contract; no sentinel default.
  return (q.bid + q.ask) / 2;
}

function pairBps(a: BrokerQuote, b: BrokerQuote): number {
  const aMid = mid(a);
  const bMid = mid(b);
  const denom = (aMid + bMid) / 2;
  if (denom === 0) {
    // Explicit: both sides zero-mid means we cannot compute bps; surface as 0 divergence
    // (the abs-cents leg handles the firing decision when prices are tiny).
    return 0;
  }
  return (Math.abs(aMid - bMid) / denom) * 10000;
}

export function buildVerifyQuoteSpec(args: {
  symbol: string;
  operator_id: string;
}): ReconcileCallSpec<QuoteTriplet, QuoteTriplet> {
  return {
    call_name: 'verify_quote',
    operator_id: args.operator_id,
    symbol: args.symbol,
    tier: 'medium',
    tolerance_class: 'noise_tolerant',
    tolerance: { ...VERIFY_QUOTE_TOLERANCE },

    compute_divergence: (_expected, observed): QuoteDivergence => {
      const signal_vs_recon_bps = pairBps(observed.signal, observed.recon);
      const signal_vs_broker_bps = pairBps(observed.signal, observed.broker);
      const recon_vs_broker_bps = pairBps(observed.recon, observed.broker);
      const signal_vs_recon_abs_cents =
        Math.abs(mid(observed.signal) - mid(observed.recon)) * 100;
      const max_pairwise_bps = Math.max(
        signal_vs_recon_bps,
        signal_vs_broker_bps,
        recon_vs_broker_bps,
      );
      return {
        signal_vs_recon_bps,
        signal_vs_broker_bps,
        recon_vs_broker_bps,
        signal_vs_recon_abs_cents,
        max_pairwise_bps,
      };
    },

    classify_outcome: (divergence, tolerance): ReconciliationOutcome => {
      const d = divergence as QuoteDivergence;
      const bpsThr = tolerance.bps_threshold as number;
      const centsThr = tolerance.abs_cents_threshold as number;
      const magThr = tolerance.magnitude_escalation_bps as number;

      if (d.max_pairwise_bps >= magThr) {
        return 'failure_escalated';
      }
      if (
        d.signal_vs_recon_bps > bpsThr &&
        d.signal_vs_recon_abs_cents > centsThr
      ) {
        return 'failure_handled';
      }
      return 'false_positive_within_tolerance';
    },

    failure_action: async (_ctx) => {
      return {
        action_taken: 'logged_for_pattern_analysis',
        action_metadata: { symbol: args.symbol },
      };
    },
  };
}

export async function verifyQuote(
  args: {
    symbol: string;
    operator_id: string;
  },
  fetchers: {
    signal: BrokerQuoteFetcher;
    recon: BrokerQuoteFetcher;
    broker: BrokerQuoteFetcher;
  },
  ts: Date,
  fetcher_source: FetcherSource,
): Promise<ReconcileResult> {
  const spec = buildVerifyQuoteSpec({
    symbol: args.symbol,
    operator_id: args.operator_id,
  });
  return reconcile(
    spec,
    async (callTs) => {
      const [signal, recon, broker] = await Promise.all([
        fetchers.signal.fetchQuote(args.symbol, callTs),
        fetchers.recon.fetchQuote(args.symbol, callTs),
        fetchers.broker.fetchQuote(args.symbol, callTs),
      ]);
      const triplet: QuoteTriplet = { signal, recon, broker };
      return { expected: triplet, observed: triplet };
    },
    ts,
    fetcher_source,
  );
}
