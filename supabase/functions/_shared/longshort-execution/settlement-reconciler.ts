/**
 * settlement-reconciler — FP-061 sub-step 4M.2 / ACT-377.
 *
 * The daily T+1 reconciler: reads open lots whose
 * `settlement_state='pending'` AND `expected_settlement_ts <= as_of`
 * (the T+1 elapse, using the EXISTING `expected_settlement_ts` stamp
 * from `lot-ledger-writer.writeOpenLot` per MIG-139 — NOT recomputed,
 * NO new trading calendar built); flips them to `settled` and stamps
 * `settled_at = as_of` (MIG-143).
 *
 * §2 AXIOM 4 — anti-phantom: the "is T+1 elapsed" comparison and the
 * `settled_at` stamp use the INJECTED `as_of`; the reconciler NEVER
 * calls `Date.now()` / `new Date()`. The caller (the edge-fn cron at
 * `supabase/functions/longshort-settlement-reconciler/index.ts`)
 * supplies wall-clock at the boundary via `productionClock.getWallClockTs()`.
 *
 * SOFT-DEPENDENT BROKER CROSS-CHECK (FP-062): the internal `settled_at`
 * stamped here is AUTHORITATIVE for the §7 buying-power read's
 * settled-vs-unsettled distinction. The broker settled-funds number
 * (Alpaca account.cash / cash_withdrawable) cross-check flips real
 * when the FP-062 `AlpacaBuyingPowerFetcher` lands; until then the
 * cross-check is a TODO in `preflight-composer.ts`'s BP gate.
 *
 * NO SIBLING TABLE — column-on-lots per DW-160; `settled_at` lives on
 * `longshort_lots` (MIG-143).
 */

import { supabaseAdmin } from '../supabase-admin.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Narrow Postgrest-like surface the reconciler needs. Mirrors the
 * structural-client pattern used by `LotLedgerClient` /
 * `FifoLotReaderClient` — keeps the `supabaseAdmin` cast off `any`
 * and ESLint-clean (no-explicit-any, ACT-375 lesson).
 */
export interface SettlementReconcilerClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        eq(col: string, val: string): {
          lte(col: string, val: string): Promise<{
            data: Array<Record<string, unknown>> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
    update(patch: Record<string, unknown>): {
      in(col: string, vals: readonly string[]): {
        select(cols: string): Promise<{
          data: Array<Record<string, unknown>> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

export interface SettlementReconcilerInput {
  as_of: Date;
  /** Optional. Defaults to canonical operator uuid. */
  operator_id?: string;
  client?: SettlementReconcilerClient;
}

export interface SettledRow {
  lot_id: string;
  symbol: string;
  expected_settlement_ts: Date;
  settled_at: Date;
}

export interface SettlementReconcilerResult {
  /** Snapshot of the injected as_of (echoed for audit). */
  as_of: Date;
  /** Count of rows flipped pending -> settled this run. */
  flipped: number;
  /** Lot lineage of the flipped rows (audit + downstream telemetry). */
  settled_rows: readonly SettledRow[];
}

/**
 * Run one reconciler pass. Idempotent: re-running with the same `as_of`
 * (or a later one) is a no-op for rows already in `settled` state because
 * the SELECT filter only matches `settlement_state='pending'`.
 */
export async function runSettlementReconciler(
  input: SettlementReconcilerInput,
): Promise<SettlementReconcilerResult> {
  const operator_id = input.operator_id ?? DEFAULT_OPERATOR_ID;
  const client = input.client ?? (supabaseAdmin as unknown as SettlementReconcilerClient);

  // ── READ: pending rows with expected_settlement_ts <= as_of.
  //    Reuses the existing `expected_settlement_ts` stamp (MIG-139 — set
  //    by writeOpenLot via tradingDaysAfter(entry_ts, 1)). No recompute,
  //    no new trading calendar.
  const readResp = await client
    .from('longshort_lots')
    .select('lot_id, symbol, expected_settlement_ts')
    .eq('operator_id', operator_id)
    .eq('settlement_state', 'pending')
    .lte('expected_settlement_ts', input.as_of.toISOString());
  if (readResp.error) {
    throw new Error(`settlement_reconciler_read_failed: ${readResp.error.message}`);
  }
  const due = (readResp.data ?? []) as Array<{
    lot_id: string;
    symbol: string;
    expected_settlement_ts: string;
  }>;

  if (due.length === 0) {
    return { as_of: input.as_of, flipped: 0, settled_rows: [] };
  }

  // ── WRITE: flip + stamp. The UPDATE narrows on lot_id (PK) to keep
  //    the write set deterministic — even if a concurrent run already
  //    flipped a row (status would change away from 'pending' but the
  //    PK is still unique). RETURNING via .select() carries the post-
  //    write snapshot.
  const ids = due.map((r) => r.lot_id);
  const writeResp = await client
    .from('longshort_lots')
    .update({
      settlement_state: 'settled',
      settled_at: input.as_of.toISOString(),
    })
    .in('lot_id', ids)
    .select('lot_id, symbol, expected_settlement_ts, settled_at');
  if (writeResp.error) {
    throw new Error(`settlement_reconciler_write_failed: ${writeResp.error.message}`);
  }
  const rows = (writeResp.data ?? []) as Array<{
    lot_id: string;
    symbol: string;
    expected_settlement_ts: string;
    settled_at: string;
  }>;

  const settled_rows: SettledRow[] = rows.map((r) => ({
    lot_id: String(r.lot_id),
    symbol: String(r.symbol),
    expected_settlement_ts: new Date(String(r.expected_settlement_ts)),
    settled_at: new Date(String(r.settled_at)),
  }));

  return {
    as_of: input.as_of,
    flipped: settled_rows.length,
    settled_rows,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Unsettled-cash reader — §7 BP-read settled-vs-unsettled distinction.
//
// Sums `cost_basis * qty` over OPEN lots whose `settlement_state='pending'`
// (the deployed cash that has NOT yet settled and therefore is NOT
// available against new requests under T+1). The composer subtracts this
// from the broker-observed `available_bp` before the `bpInsufficient`
// check.
//
// INTERNAL-AUTHORITATIVE per scope; the broker settled-funds cross-check
// (Alpaca account.cash vs cash_withdrawable) is SOFT-DEPENDENT on FP-062
// (AlpacaBuyingPowerFetcher real path). Until then the composer logs a
// TODO at the BP-read site.
// ─────────────────────────────────────────────────────────────────────────

export interface UnsettledCashReader {
  /** Returns total deployed dollars on OPEN+pending lots for this operator. */
  readUnsettledDeployedCash(operator_id: string): Promise<number>;
}

export interface UnsettledCashReaderClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        eq(col: string, val: string): {
          eq(col: string, val: string): Promise<{
            data: Array<Record<string, unknown>> | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
}

export function createSupabaseUnsettledCashReader(): UnsettledCashReader {
  const client = supabaseAdmin as unknown as UnsettledCashReaderClient;
  return {
    async readUnsettledDeployedCash(operator_id) {
      const { data, error } = await client
        .from('longshort_lots')
        .select('qty, cost_basis')
        .eq('operator_id', operator_id)
        .eq('status', 'open')
        .eq('settlement_state', 'pending');
      if (error) {
        throw new Error(`unsettled_cash_read_failed: ${error.message}`);
      }
      const rows = (data ?? []) as Array<{ qty: number; cost_basis: number }>;
      let total = 0;
      for (const r of rows) {
        const qty = Number(r.qty);
        const cb = Number(r.cost_basis);
        if (Number.isFinite(qty) && Number.isFinite(cb)) {
          total += Math.abs(qty * cb);
        }
      }
      return total;
    },
  };
}