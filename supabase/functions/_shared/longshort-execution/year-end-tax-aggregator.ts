/**
 * year-end-tax-aggregator — FP-061 sub-step 4M.5b / ACT-376.
 *
 * Internal Form 8949 / Schedule D rollup over closed `longshort_lots`
 * rows within an injected tax-year window. PURE READ — no mutation, no
 * verifier on the aggregator itself (it is a derivation of the lot-level
 * source of truth populated by MIG-140 + MIG-142).
 *
 * ANTI-PHANTOM (DEC-034 (4)): the tax-year boundary is an INJECTED
 * parameter `tax_year_end_ts`. NO Date.now() / new Date() / wall-clock
 * reads in this module — the boundary is operator/caller responsibility.
 *
 * Broker-1099-B reconciliation is SOFT-DEPENDENT (DW-196 / Alpaca paper
 * issues no 1099-B); see verify_year_end_tax_record.ts shell.
 */

import { supabaseAdmin } from '../supabase-admin.ts';

/** ≤ 365 days held = short-term, > 365 = long-term (§1222 / 8949 split). */
export type HoldingPeriod = 'short_term' | 'long_term';

/** One row of Form 8949 (per closed lot). */
export interface Form8949Row {
  lot_id: string;
  symbol: string;
  side: 'long' | 'short';
  acquired_date: Date;        // entry_ts
  sold_date: Date;            // exit_ts
  qty: number;
  proceeds: number;           // exit_price × qty
  cost_basis: number;         // post-§7.8 cost_basis × qty (adjusted basis already on the row)
  wash_sale_adjustment: number; // positive magnitude
  gain_loss: number;          // net_pnl (= realized_pnl + wash_sale_adjustment)
  holding_period: HoldingPeriod;
}

/** Schedule D short-term / long-term totals. */
export interface ScheduleDSummary {
  short_term_proceeds: number;
  short_term_cost_basis: number;
  short_term_wash_sale_adjustment: number;
  short_term_net_pnl: number;
  long_term_proceeds: number;
  long_term_cost_basis: number;
  long_term_wash_sale_adjustment: number;
  long_term_net_pnl: number;
}

export interface YearEndAggregation {
  tax_year: number;
  tax_year_start_ts: Date;
  tax_year_end_ts: Date;
  rows: Form8949Row[];
  summary: ScheduleDSummary;
}

/** Narrow read surface for the aggregator. Tests inject an in-memory fake. */
export interface YearEndAggregatorClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        gte(col: string, val: string): {
          lte(col: string, val: string): Promise<{
            data: Array<Record<string, unknown>> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

function holdingPeriod(entry_ts: Date, exit_ts: Date): HoldingPeriod {
  const days = Math.floor((exit_ts.getTime() - entry_ts.getTime()) / MILLIS_PER_DAY);
  // §1222: > 1 year (i.e. > 365 days) = long-term. Exactly 365 = short-term.
  return days > 365 ? 'long_term' : 'short_term';
}

/**
 * Build the Form 8949 + Schedule D aggregation for one tax year.
 *
 * @param args.tax_year         — calendar year (e.g. 2026).
 * @param args.tax_year_start_ts — INJECTED window lower bound (inclusive).
 * @param args.tax_year_end_ts   — INJECTED window upper bound (inclusive). NO Date.now().
 * @param args.operator_id       — scope to one operator.
 * @param client                 — Supabase reader; defaults to supabaseAdmin.
 */
export async function aggregateYearEnd(
  args: {
    tax_year: number;
    tax_year_start_ts: Date;
    tax_year_end_ts: Date;
    operator_id: string;
  },
  client: YearEndAggregatorClient = supabaseAdmin as unknown as YearEndAggregatorClient,
): Promise<YearEndAggregation> {
  const { data, error } = await client
    .from('longshort_lots')
    .select('lot_id, symbol, side, qty, cost_basis, entry_ts, exit_ts, exit_price, realized_pnl, wash_sale_adjustment, net_pnl, status, operator_id')
    .eq('status', 'closed')
    .gte('exit_ts', args.tax_year_start_ts.toISOString())
    .lte('exit_ts', args.tax_year_end_ts.toISOString());
  if (error) {
    throw new Error(`year_end_aggregate_read_failed: ${error.message}`);
  }
  const raw = (data ?? []) as Array<Record<string, unknown>>;

  const rows: Form8949Row[] = [];
  const summary: ScheduleDSummary = {
    short_term_proceeds: 0,
    short_term_cost_basis: 0,
    short_term_wash_sale_adjustment: 0,
    short_term_net_pnl: 0,
    long_term_proceeds: 0,
    long_term_cost_basis: 0,
    long_term_wash_sale_adjustment: 0,
    long_term_net_pnl: 0,
  };

  for (const r of raw) {
    if (String(r.operator_id) !== args.operator_id) continue;
    if (r.exit_ts == null || r.exit_price == null) continue;
    const entry_ts = new Date(String(r.entry_ts));
    const exit_ts = new Date(String(r.exit_ts));
    const qty = Number(r.qty);
    const exit_price = Number(r.exit_price);
    const cost_basis_per_share = Number(r.cost_basis);
    const adj = Number(r.wash_sale_adjustment ?? 0);
    // Prefer the writer-populated net_pnl (post-MIG-142). Fallback to
    // realized_pnl + adj for any pre-4M.5b-deployed rows whose net_pnl
    // was never written (typed-absence — we recompute the projection
    // deterministically rather than emit a sentinel).
    const realized_pnl = Number(r.realized_pnl ?? 0);
    const net_pnl = r.net_pnl == null ? realized_pnl + adj : Number(r.net_pnl);
    const proceeds = exit_price * qty;
    const cost_basis_total = cost_basis_per_share * qty;
    const hp = holdingPeriod(entry_ts, exit_ts);
    rows.push({
      lot_id: String(r.lot_id),
      symbol: String(r.symbol),
      side: r.side as 'long' | 'short',
      acquired_date: entry_ts,
      sold_date: exit_ts,
      qty,
      proceeds,
      cost_basis: cost_basis_total,
      wash_sale_adjustment: adj,
      gain_loss: net_pnl,
      holding_period: hp,
    });
    if (hp === 'short_term') {
      summary.short_term_proceeds += proceeds;
      summary.short_term_cost_basis += cost_basis_total;
      summary.short_term_wash_sale_adjustment += adj;
      summary.short_term_net_pnl += net_pnl;
    } else {
      summary.long_term_proceeds += proceeds;
      summary.long_term_cost_basis += cost_basis_total;
      summary.long_term_wash_sale_adjustment += adj;
      summary.long_term_net_pnl += net_pnl;
    }
  }

  return {
    tax_year: args.tax_year,
    tax_year_start_ts: args.tax_year_start_ts,
    tax_year_end_ts: args.tax_year_end_ts,
    rows,
    summary,
  };
}