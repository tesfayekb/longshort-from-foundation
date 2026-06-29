/**
 * lot-ledger-writer — FP-061 sub-step 4M.1 / DW-158.
 *
 * THE single open/close writer for `public.longshort_lots`. The orchestrator
 * (lifecycle-orchestrator.ts terminal-fill seam, line ~422) calls
 * `writeOpenLot` once per `terminal_filled` TerminalOrderResult; the exit
 * path calls `closeLots` with the FIFO-selected lot_ids.
 *
 * COLUMN BYTE-MATCH CONTRACT — the inserted row exactly populates the
 * verify_lot_record.InternalLotRecord COMPARED_FIELDS exact-match contract:
 *   lot_id, symbol, entry_ts, qty, cost_basis, side, status, locate_id.
 * Plus the DW-160 column-on-lots fields (settlement_state,
 * expected_settlement_ts) that 4M.2 will reconcile, and source_order_id
 * for broker-fill lineage (deliberately outside COMPARED_FIELDS).
 *
 * SETTLEMENT: US cash-equity T+1. Stamps expected_settlement_ts as
 * `tradingDaysAfter(entry_ts, 1)` using the EXISTING trading-calendar
 * helper at supabase/functions/_shared/longshort-universe/shared/
 * trading-days.ts (do NOT build a new calendar).
 *
 * VERIFIER WIRE: `readInternalLotRecord` returns the row shaped as
 * InternalLotRecord for verify_lot_record's `expected` input.
 *
 * SOFT-DEPENDENT BROKER FETCHER: the broker-side reader that
 * verify_lot_record's `observed` consumes is still the contract-complete
 * BrokerLotRecordFetcher interface; the real Alpaca adapter lands in
 * FP-062 (DW-058 broker MOVE cluster). FP-057's verify_rebalance_aggregate
 * precedent — wire what we can, mark TODO for the broker flip.
 */

import { supabaseAdmin } from '../supabase-admin.ts';
import { tradingDaysAfter } from '../longshort-universe/shared/trading-days.ts';
import type { BrokerFillResult } from '../longshort-broker-interfaces.ts';
import type { InternalLotRecord } from '../longshort-verifiers/verify_lot_record.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

/** Narrow Postgrest-like surface the writer needs. Lets tests inject a fake. */
export interface LotLedgerClient {
  from(table: string): {
    insert(row: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
    update(patch: Record<string, unknown>): {
      in(col: string, vals: readonly string[]): {
        select(cols: string): Promise<{
          data: Array<Record<string, unknown>> | null;
          error: { message: string } | null;
        }>;
      };
    };
    select(cols: string): {
      eq(col: string, val: string): {
        single(): Promise<{
          data: Record<string, unknown> | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

export interface OpenLotContext {
  /** Optional. Defaults to canonical operator uuid. */
  operator_id?: string;
  symbol: string;
  /** 'long' | 'short' — derived from the original strategy intent, not the
   *  Alpaca 'buy'|'sell' broker_side (a short-cover is broker_side='buy'
   *  but closes a short lot, not opens a long one — the open-writer is
   *  only called on entry fills, so 'long' = long-entry, 'short' = short-entry). */
  side: 'long' | 'short';
  /** Broker order_id lineage. Stored in source_order_id, outside COMPARED_FIELDS. */
  source_order_id: string;
  /** Optional broker locate id (short-side may carry one; long-side null). */
  locate_id?: string | null;
}

export interface OpenedLot {
  lot_id: string;
  symbol: string;
  entry_ts: Date;
  qty: number;
  cost_basis: number;
  side: 'long' | 'short';
  expected_settlement_ts: Date;
}

/**
 * The shape 4M.3 wash-sale + 4M.5 realized-PnL will consume. We emit it;
 * we do NOT build their consumers per FP-061 charter.
 */
export interface ClosedLot {
  lot_id: string;
  symbol: string;
  side: 'long' | 'short';
  qty: number;
  cost_basis: number;
  entry_ts: Date;
  closed_at: Date;
}

/**
 * Open-writer. Consumes a BrokerFillResult + entry context; writes a row
 * into public.longshort_lots; returns the OpenedLot summary.
 *
 * Pre-conditions (caller responsibility):
 *   - `fill.filled === true` AND `fill.filled_qty > 0`
 *   - `fill.avg_fill_price != null` AND > 0
 * The orchestrator only calls this on terminal_filled, so these hold.
 */
export async function writeOpenLot(
  fill: BrokerFillResult,
  ctx: OpenLotContext,
  entry_ts: Date,
  client: LotLedgerClient = supabaseAdmin as unknown as LotLedgerClient,
): Promise<OpenedLot> {
  if (!fill.filled || fill.filled_qty <= 0 || fill.avg_fill_price == null || fill.avg_fill_price <= 0) {
    throw new Error(
      `writeOpenLot: precondition violated — filled=${fill.filled} qty=${fill.filled_qty} px=${fill.avg_fill_price}`,
    );
  }
  const lot_id = crypto.randomUUID();
  const expected_settlement_ts = tradingDaysAfter(entry_ts, 1);
  const row = {
    lot_id,
    operator_id: ctx.operator_id ?? DEFAULT_OPERATOR_ID,
    symbol: ctx.symbol,
    entry_ts: entry_ts.toISOString(),
    qty: fill.filled_qty,
    cost_basis: fill.avg_fill_price,
    side: ctx.side,
    status: 'open',
    locate_id: ctx.locate_id ?? null,
    settlement_state: 'pending',
    expected_settlement_ts: expected_settlement_ts.toISOString(),
    source_order_id: ctx.source_order_id,
  };
  const { error } = await client.from('longshort_lots').insert(row);
  if (error) {
    // DEC-034 (3): propagate; no swallow + phantom-success.
    throw new Error(`longshort_lots_insert_failed: ${error.message}`);
  }
  return {
    lot_id,
    symbol: ctx.symbol,
    entry_ts,
    qty: fill.filled_qty,
    cost_basis: fill.avg_fill_price,
    side: ctx.side,
    expected_settlement_ts,
  };
}

/**
 * Close-writer. Marks the given open lot_ids as closed; emits the typed
 * ClosedLot[] that 4M.3 (wash-sale) + 4M.5 (realized-PnL) will consume.
 *
 * Note: this writer DOES NOT compute realized P&L or detect wash sales —
 * those are 4M.5 and 4M.3 respectively. It only flips status and returns
 * the lineage rows so the consumers can take it from here.
 */
export async function closeLots(
  lot_ids: readonly string[],
  closed_at: Date,
  client: LotLedgerClient = supabaseAdmin as unknown as LotLedgerClient,
): Promise<ClosedLot[]> {
  if (lot_ids.length === 0) return [];
  const { data, error } = await client
    .from('longshort_lots')
    .update({ status: 'closed', closed_at: closed_at.toISOString() })
    .in('lot_id', lot_ids)
    .select('lot_id, symbol, side, qty, cost_basis, entry_ts');
  if (error) {
    throw new Error(`longshort_lots_close_failed: ${error.message}`);
  }
  const rows = data ?? [];
  return rows.map((r) => ({
    lot_id: String(r.lot_id),
    symbol: String(r.symbol),
    side: r.side as 'long' | 'short',
    qty: Number(r.qty),
    cost_basis: Number(r.cost_basis),
    entry_ts: new Date(String(r.entry_ts)),
    closed_at,
  }));
}

/**
 * Verifier reader-wire. Returns the persisted lot row shaped as
 * InternalLotRecord — feeds verify_lot_record's `expected` input.
 *
 * TODO (FP-062 / DW-058 broker MOVE cluster): the corresponding
 * BrokerLotRecordFetcher (broker-side `observed`) is still
 * contract-complete only. Once FP-062 lands the Alpaca adapter, wire it
 * at the verify_lot_record call site. Pattern mirrors FP-057's
 * verify_rebalance_aggregate broker-truth flip.
 */
export async function readInternalLotRecord(
  lot_id: string,
  client: LotLedgerClient = supabaseAdmin as unknown as LotLedgerClient,
): Promise<InternalLotRecord> {
  const { data, error } = await client
    .from('longshort_lots')
    .select('lot_id, symbol, entry_ts, qty, cost_basis, side, status, locate_id')
    .eq('lot_id', lot_id)
    .single();
  if (error) {
    throw new Error(`longshort_lots_read_failed: ${error.message}`);
  }
  if (!data) {
    throw new Error(`longshort_lots_read_missing: lot_id=${lot_id}`);
  }
  return {
    lot_id: String(data.lot_id),
    symbol: String(data.symbol),
    entry_ts: new Date(String(data.entry_ts)),
    qty: Number(data.qty),
    cost_basis: Number(data.cost_basis),
    side: data.side as 'long' | 'short',
    status: String(data.status),
    locate_id: data.locate_id == null ? null : String(data.locate_id),
  };
}