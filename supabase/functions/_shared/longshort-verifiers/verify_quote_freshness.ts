/**
 * verify_quote_freshness — Reconciliation verifier #3 per CROSSWIND §11.0.7.
 *
 * Tier: medium
 * Tolerance class: noise_tolerant (5 firings in 1h)
 *
 * Per §11.0.7 verbatim: "fails if quote being used is older than max_age_s. Default max_age_s = 5.
 * Failure action: skip MTM this cycle, mark MTM stale; do NOT fall back to last-known price."
 *
 * Divergence shape: { quote_age_s, max_age_s, age_exceeded_by_s }
 *
 * classify_outcome rule:
 *   - quote_age_s > max_age_s    → failure_handled
 *   - otherwise                  → false_positive_within_tolerance
 *
 * failure_action: action_taken='mtm_skipped_quote_stale'. MTM-loop integration lands later.
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

export const VERIFY_QUOTE_FRESHNESS_TOLERANCE = {
  max_age_s: 5,   // §11.0.7 #3 default max_age_s = 5
};

interface FreshnessExpected {
  max_age_s: number;
}

interface FreshnessDivergence extends Record<string, unknown> {
  quote_age_s: number;
  max_age_s: number;
  age_exceeded_by_s: number;
}

export function buildVerifyQuoteFreshnessSpec(args: {
  symbol: string;
  operator_id: string;
  max_age_s?: number;
}): ReconcileCallSpec<FreshnessExpected, BrokerQuote> {
  const max_age_s = args.max_age_s ?? VERIFY_QUOTE_FRESHNESS_TOLERANCE.max_age_s;
  return {
    call_name: 'verify_quote_freshness',
    operator_id: args.operator_id,
    symbol: args.symbol,
    tier: 'medium',
    tolerance_class: 'noise_tolerant',
    tolerance: { max_age_s },

    compute_divergence: (_expected, observed): FreshnessDivergence => {
      // ts is the verifier-call ts (passed into reconcile()); observed.ts is the quote's broker-side ts.
      // We can't read the current ts here (pure function); divergence is computed against observed.ts
      // and the invoke() function attaches the verifier-call ts into observed via a wrapper.
      // Per the wrapper below, observed.ts is set to broker-quote ts and we get the call ts via the
      // `_expected` payload (we stash call_ts there via the invoke wrapper).
      const call_ts_ms = (_expected as unknown as { call_ts_ms: number }).call_ts_ms;
      const quote_age_s = Math.max(0, (call_ts_ms - observed.ts.getTime()) / 1000);
      const age_exceeded_by_s = quote_age_s - _expected.max_age_s;
      return {
        quote_age_s,
        max_age_s: _expected.max_age_s,
        age_exceeded_by_s,
      };
    },

    classify_outcome: (divergence, _tolerance): ReconciliationOutcome => {
      const d = divergence as FreshnessDivergence;
      if (d.quote_age_s > d.max_age_s) {
        return 'failure_handled';
      }
      return 'false_positive_within_tolerance';
    },

    failure_action: async (_ctx) => {
      return {
        action_taken: 'mtm_skipped_quote_stale',
        action_metadata: { symbol: args.symbol },
      };
    },
  };
}

export async function verifyQuoteFreshness(
  args: {
    symbol: string;
    operator_id: string;
    max_age_s?: number;
  },
  fetcher: BrokerQuoteFetcher,
  ts: Date,
  fetcher_source: FetcherSource,
): Promise<ReconcileResult> {
  const max_age_s = args.max_age_s ?? VERIFY_QUOTE_FRESHNESS_TOLERANCE.max_age_s;
  const spec = buildVerifyQuoteFreshnessSpec({
    symbol: args.symbol,
    operator_id: args.operator_id,
    max_age_s,
  });
  return reconcile(
    spec,
    async (callTs) => {
      const quote = await fetcher.fetchQuote(args.symbol, callTs);
      return {
        // Stash call-ts so compute_divergence (pure) can compute age.
        expected: { max_age_s, call_ts_ms: callTs.getTime() } as FreshnessExpected,
        observed: quote,
      };
    },
    ts,
    fetcher_source,
  );
}
