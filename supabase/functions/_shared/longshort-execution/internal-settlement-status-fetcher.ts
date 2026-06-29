/**
 * internal-settlement-status-fetcher — FP-061 sub-step 4M.2 / ACT-377.
 *
 * Adapts `longshort_lots` (the internal authoritative source) to the
 * `BrokerSettlementStatusFetcher` interface so the
 * `verify_settlement_status` verifier (sub-step 6.3c) can be exercised
 * end-to-end TODAY without waiting on the broker MOVE cluster.
 *
 * SOFT-DEPENDENT BROKER FLIP (FP-062 / DW-058): the corresponding real
 * Alpaca fetcher (an `AlpacaSettlementStatusFetcher` reading the broker's
 * `settle_date` field per filled order) is the production cross-check
 * path. Until it lands, this internal fetcher routes verifier calls
 * through OUR own column state: `settlement_state` + `expected_settlement_ts`
 * + `settled_at` (MIG-143). Mirrors the FP-057
 * `verify_rebalance_aggregate` NotProvisioned precedent / FP-061 4M.5a
 * `BrokerRealizedPnLFetcher` soft-dependent pattern.
 *
 * EXPECTED-DIVERGENCE-AWARE CONTRACT: the returned shape supplies the
 * three fields the verifier's `classify_outcome` consumes:
 *
 *   - `settled`                 — derived from `settlement_state==='settled'`.
 *   - `expected_settlement_ts`  — verbatim from the row.
 *   - `fetched_at`              — the INJECTED `as_of` (NOT Date.now()).
 *
 * The verifier computes:
 *   - `hours_past_expected = (fetched_at − expected_settlement_ts) / 3600000`
 *     → negative when pre-T+1 (the `expected_divergence_handled` path).
 *   - `pre_t1_window = fetched_at < expected_settlement_ts`.
 */

import { supabaseAdmin } from '../supabase-admin.ts';
import type {
  BrokerSettlementStatus,
  BrokerSettlementStatusFetcher,
} from '../longshort-broker-interfaces.ts';

/** Narrow read surface (structural, no `as any`). */
export interface InternalSettlementClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        eq(col: string, val: string): {
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
}

export function createInternalSettlementStatusFetcher(args?: {
  client?: InternalSettlementClient;
}): BrokerSettlementStatusFetcher {
  const client = args?.client ?? (supabaseAdmin as unknown as InternalSettlementClient);
  return {
    async fetchSettlementStatus(
      symbol: string,
      side: 'long' | 'short',
      trade_ts: Date,
      ts: Date,
    ): Promise<BrokerSettlementStatus> {
      // Locate the most-recent open/pending lot for (symbol, side) at or before
      // trade_ts. We match the lifecycle convention: `entry_ts` ≈ `trade_ts`.
      const { data, error } = await client
        .from('longshort_lots')
        .select(
          'lot_id, symbol, side, entry_ts, settlement_state, expected_settlement_ts, settled_at',
        )
        .eq('symbol', symbol)
        .eq('side', side)
        .order('entry_ts', { ascending: false })
        .limit(1);
      if (error) {
        throw new Error(`internal_settlement_status_read_failed: ${error.message}`);
      }
      const rows = (data ?? []) as Array<{
        symbol: string;
        side: 'long' | 'short';
        entry_ts: string;
        settlement_state: string;
        expected_settlement_ts: string | null;
      }>;
      if (rows.length === 0) {
        throw new Error(
          `internal_settlement_status_missing_lot: symbol=${symbol} side=${side} trade_ts=${trade_ts.toISOString()}`,
        );
      }
      const r = rows[0];
      // Typed-absence: a lot without expected_settlement_ts cannot be
      // classified pre-T+1 vs post-T+1 — throw rather than sentinel.
      if (r.expected_settlement_ts == null) {
        throw new Error(
          `internal_settlement_status_missing_expected_ts: symbol=${symbol} side=${side}`,
        );
      }
      return {
        symbol: String(r.symbol),
        side: r.side,
        trade_ts: new Date(String(r.entry_ts)),
        settled: r.settlement_state === 'settled',
        expected_settlement_ts: new Date(String(r.expected_settlement_ts)),
        fetched_at: ts, // INJECTED — drives verifier's pre_t1_window
      };
    },
  };
}