/**
 * internal-corporate-action-status-fetcher — FP-061 sub-step 4M.4 / ACT-378.
 *
 * Adapts `corporate_actions.applied_at` (the internal authoritative source
 * of "did our applier run yet?") to the `BrokerCorporateActionFetcher`
 * interface so `verify_corporate_action_clean` can be exercised end-to-end
 * TODAY without waiting on the broker MOVE cluster.
 *
 * SOFT-DEPENDENT BROKER FLIP (FP-062 / DW-199):
 *   The corresponding real Alpaca fetcher (Alpaca
 *   `/v2/positions/{symbol}.avg_entry_price` compared against our internal
 *   mutated `cost_basis`) is the production cross-check path. Mirrors the
 *   FP-057 verify_rebalance_aggregate / FP-061 4M.5a BrokerRealizedPnLFetcher
 *   / 4M.2 internal-settlement-status-fetcher precedents.
 *
 * REPORTED SHAPE:
 *   - `recent_action_within_lookback` ← did we find a row for the symbol
 *     in [ts − lookback_days, ts]?
 *   - `action_type`                    ← from the row.
 *   - `action_ts`                      ← ex_date of the row.
 *   - `hours_since_action`             ← (ts − action_ts) in hours.
 *   - `broker_basis_adjusted`          ← `applied_at IS NOT NULL`. This is
 *     a TAUTOLOGICAL internal correctness proof ("the applier ran") rather
 *     than a real broker cross-check — FP-062 is where the real cross-check
 *     lands; until then the verifier's 4-outcome contract is exercised on
 *     INTERNAL substate.
 *   - `fetched_at`                     ← the INJECTED `ts` (no wall-clock).
 */

import { supabaseAdmin } from '../supabase-admin.ts';
import type {
  BrokerCorporateActionSnapshot,
  BrokerCorporateActionFetcher,
} from '../longshort-broker-interfaces.ts';

/** Narrow read surface (structural, no `as any`). */
export interface InternalCorporateActionClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        gte(col: string, val: string): {
          lte(col: string, val: string): {
            order(col: string, opts: { ascending: boolean }): {
              limit(n: number): Promise<{
                data: Array<Record<string, unknown>> | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    };
  };
}

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

export function createInternalCorporateActionStatusFetcher(args?: {
  client?: InternalCorporateActionClient;
}): BrokerCorporateActionFetcher {
  const client = args?.client ?? (supabaseAdmin as unknown as InternalCorporateActionClient);
  return {
    async fetchCorporateActionSnapshot(
      symbol: string,
      lookback_days: number,
      ts: Date,
    ): Promise<BrokerCorporateActionSnapshot> {
      const from = new Date(ts.getTime() - lookback_days * MS_PER_DAY);
      const fromYmd = from.toISOString().slice(0, 10);
      const toYmd = ts.toISOString().slice(0, 10);
      const { data, error } = await client
        .from('corporate_actions')
        .select('symbol, action_type, ex_date, applied_at')
        .eq('symbol', symbol)
        .gte('ex_date', fromYmd)
        .lte('ex_date', toYmd)
        .order('ex_date', { ascending: false })
        .limit(1);
      if (error) {
        throw new Error(`internal_corporate_action_read_failed: ${error.message}`);
      }
      const rows = (data ?? []) as Array<{
        symbol: string;
        action_type: string;
        ex_date: string;
        applied_at: string | null;
      }>;
      if (rows.length === 0) {
        return {
          symbol,
          recent_action_within_lookback: false,
          action_type: null,
          action_ts: null,
          broker_basis_adjusted: false,
          hours_since_action: null,
          fetched_at: ts,
        };
      }
      const r = rows[0];
      const actionTs = new Date(String(r.ex_date));
      const hours = (ts.getTime() - actionTs.getTime()) / MS_PER_HOUR;
      return {
        symbol: String(r.symbol),
        recent_action_within_lookback: true,
        action_type: String(r.action_type),
        action_ts: actionTs,
        // TODO(FP-062 / DW-199): replace with REAL broker cross-check
        // (Alpaca /v2/positions avg_entry_price vs internal cost_basis).
        // Until then, the internal applied_at stamp is our authoritative
        // proxy — the verifier's 4-outcome contract is exercised on
        // INTERNAL substate (FP-057 / 4M.2 / 4M.5a precedent).
        broker_basis_adjusted: r.applied_at != null,
        hours_since_action: hours,
        fetched_at: ts, // INJECTED — drives the verifier's window math
      };
    },
  };
}