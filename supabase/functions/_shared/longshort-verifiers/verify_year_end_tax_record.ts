/**
 * verify_year_end_tax_record — Terminal year-end 1099-B / Form 8949
 * reconciliation verifier (FP-061 sub-step 4M.5b / ACT-376).
 *
 * Tier: STRONG+ (tax/regulatory retention indefinite).
 * Tolerance class: zero_tolerance — a 1099-B mismatch is an IRS-reporting
 * defect.
 *
 * SOFT-DEPENDENT: Alpaca paper issues NO 1099-B; the real Alpaca live
 * adapter for `BrokerYearEndTaxFetcher` lands when live trading is
 * provisioned. Until then the verifier guards against absence with a
 * NotProvisioned envelope, mirroring the FP-057
 * verify_rebalance_aggregate / FP-061 4M.5a precedents.
 *
 * DW-196 tracks the broker-gated activation of this verifier.
 */

import type {
  BrokerYearEndTaxConfirm,
  BrokerYearEndTaxFetcher,
} from '../longshort-broker-interfaces.ts';
import type {
  YearEndAggregation,
  ScheduleDSummary,
} from '../longshort-execution/year-end-tax-aggregator.ts';

/** Raised when the broker-1099-B fetcher is not yet provisioned (DW-196). */
export class BrokerYearEndTaxFetcherNotProvisionedError extends Error {
  constructor(tax_year: number) {
    super(
      `verify_year_end_tax_record: BrokerYearEndTaxFetcher not provisioned for tax_year=${tax_year} — ` +
        'Alpaca paper issues no 1099-B; activation tracked under DW-196.',
    );
    this.name = 'BrokerYearEndTaxFetcherNotProvisionedError';
  }
}

export interface YearEndTaxDivergence {
  tax_year: number;
  short_term_net_pnl_diff: number;
  long_term_net_pnl_diff: number;
  short_term_wash_sale_adjustment_diff: number;
  long_term_wash_sale_adjustment_diff: number;
  within_tolerance: boolean;
}

/** Aggregate-level outcome envelope (sibling shape to verify_rebalance_aggregate). */
export interface YearEndTaxVerifyResult {
  outcome: 'matched' | 'divergence_escalated' | 'not_provisioned';
  tax_year: number;
  divergence?: YearEndTaxDivergence;
  observed?: BrokerYearEndTaxConfirm;
  internal?: ScheduleDSummary;
}

const ZERO_TOLERANCE_DOLLARS = 0.01;

/**
 * Compare the internal year-end aggregation (year-end-tax-aggregator)
 * against the broker 1099-B confirm. If `fetcher == null` (the today
 * branch), returns a typed `not_provisioned` outcome — NEVER fabricates
 * a match, NEVER fabricates a divergence.
 */
export async function verifyYearEndTaxRecord(
  args: {
    operator_id: string;
    internal: YearEndAggregation;
  },
  fetcher: BrokerYearEndTaxFetcher | null,
  ts: Date,
): Promise<YearEndTaxVerifyResult> {
  void args.operator_id;
  void ts;
  if (fetcher == null) {
    // SOFT-DEPENDENT short-circuit. Per FP-057 / FP-061 4M.5a precedent —
    // do not throw at the call site (the aggregator is still useful for
    // operator export); surface the typed outcome.
    return {
      outcome: 'not_provisioned',
      tax_year: args.internal.tax_year,
      internal: args.internal.summary,
    };
  }
  let observed: BrokerYearEndTaxConfirm;
  try {
    observed = await fetcher.fetchYearEndTaxRecord(args.internal.tax_year, ts);
  } catch (e) {
    if (e instanceof BrokerYearEndTaxFetcherNotProvisionedError) {
      return {
        outcome: 'not_provisioned',
        tax_year: args.internal.tax_year,
        internal: args.internal.summary,
      };
    }
    throw e;
  }
  const s = args.internal.summary;
  const div: YearEndTaxDivergence = {
    tax_year: args.internal.tax_year,
    short_term_net_pnl_diff: s.short_term_net_pnl - observed.short_term_net_pnl,
    long_term_net_pnl_diff: s.long_term_net_pnl - observed.long_term_net_pnl,
    short_term_wash_sale_adjustment_diff:
      s.short_term_wash_sale_adjustment - observed.short_term_wash_sale_adjustment,
    long_term_wash_sale_adjustment_diff:
      s.long_term_wash_sale_adjustment - observed.long_term_wash_sale_adjustment,
    within_tolerance: false,
  };
  div.within_tolerance =
    Math.abs(div.short_term_net_pnl_diff) <= ZERO_TOLERANCE_DOLLARS &&
    Math.abs(div.long_term_net_pnl_diff) <= ZERO_TOLERANCE_DOLLARS &&
    Math.abs(div.short_term_wash_sale_adjustment_diff) <= ZERO_TOLERANCE_DOLLARS &&
    Math.abs(div.long_term_wash_sale_adjustment_diff) <= ZERO_TOLERANCE_DOLLARS;
  return {
    outcome: div.within_tolerance ? 'matched' : 'divergence_escalated',
    tax_year: args.internal.tax_year,
    divergence: div,
    observed,
    internal: s,
  };
}