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
import type { BrokerRealizedPnLFetcher } from '../longshort-broker-interfaces.ts';
import type { FetcherSource, ReconcileResult } from '../longshort-reconciliation-types.ts';
import { verifyRealizedPnL } from '../longshort-verifiers/verify_realized_pnl.ts';

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
        // ACT-403 — idempotency pre-check on source_order_id. Returns
        // the (possibly null) existing row WITHOUT throwing on zero-rows
        // (distinct from `single()` which errors on PGRST116). Uses
        // limit(1) so the structural-client stays narrow.
        limit(n: number): Promise<{
          data: Array<Record<string, unknown>> | null;
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
  /** FP-061 sub-step 4M.5a — per-exit fields populated by closeLots.
   *  4M.3 consumes broker_confirmed_pnl + verify outcome to gate Path A
   *  (broker confirms loss → write wash_sale_events) vs Path B
   *  (broker disagrees → re_entry_blocked_pending_review). */
  exit_ts: Date;
  exit_price: number;
  realized_pnl: number;
  wash_sale_status: 'pending';
  broker_confirmed_pnl: number | null;
  verify_result: ReconcileResult | null;
  /** FP-061 sub-step 4M.3 — caller-supplied discriminator. `true` =
   *  partial-size reduction of a held position (§7.9 trim path: writes
   *  wash_sale_events record-portion but does NOT add to re_entry_blocked,
   *  always chains §7.8 on remaining shares). `false` = full exit (§7.7
   *  Path A: writes wash_sale_events + computes block_until = exit_ts + 31
   *  CALENDAR days + adds symbol to the derived re_entry_blocked set).
   *  Set by the lifecycle orchestrator at the terminal-fill seam where
   *  full-exit vs trim is known. */
  is_trim: boolean;
}

/**
 * FP-061 sub-step 4M.5a — per-lot exit context the close-writer requires.
 *
 *   - `exit_price`: comes from the broker exit fill. Typed-absence-throw if
 *     null/<=0 — NO sentinel/default per §11.0.7 anti-phantom + STOP-conditions.
 *   - `exit_trade_id`: the broker fill's trade_id; feeds verify_realized_pnl.
 */
export interface CloseLotInput {
  lot_id: string;
  exit_price: number;
  exit_trade_id: string;
  /** FP-061 sub-step 4M.3 — see ClosedLot.is_trim. Optional on the input
   *  surface for backwards-compatibility with 4M.5a callers; defaults to
   *  `false` (full-exit semantics). The lifecycle orchestrator MUST pass
   *  `true` explicitly for §7.9 trim closes. */
  is_trim?: boolean;
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
  // ACT-403 (Finding-B Option-1) — IDEMPOTENCY on source_order_id.
  // The reconstruction path now re-feeds recently-filled broker orders
  // across an overlapping 2× tick-interval window. A filled order seen
  // on two consecutive ticks MUST record ONCE. DB safety net = MIG-148
  // partial unique index `longshort_lots(source_order_id) WHERE
  // source_order_id IS NOT NULL`; this in-code pre-check is the
  // user-visible early return (no throw, no double-insert race).
  if (ctx.source_order_id) {
    const existing = await client
      .from('longshort_lots')
      .select('lot_id, entry_ts, qty, cost_basis, side, expected_settlement_ts')
      .eq('source_order_id', ctx.source_order_id)
      .limit(1);
    if (existing.error) {
      throw new Error(`longshort_lots_dedup_read_failed: ${existing.error.message}`);
    }
    const prior = existing.data && existing.data.length > 0 ? existing.data[0] : null;
    if (prior) {
      return {
        lot_id: String(prior.lot_id),
        symbol: ctx.symbol,
        entry_ts: new Date(String(prior.entry_ts)),
        qty: Number(prior.qty),
        cost_basis: Number(prior.cost_basis),
        side: String(prior.side) as 'long' | 'short',
        expected_settlement_ts: new Date(String(prior.expected_settlement_ts)),
      };
    }
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
/**
 * Close-writer (FP-061 sub-step 4M.5a — extended from the 4M.1 stub).
 *
 * Per CloseLotInput, exit_price + exit_trade_id come from the BROKER exit
 * fill. The writer:
 *
 *   1. Per-lot, computes sign-aware realized_pnl off ClosedLot.side
 *      (the strategy-intent side, NOT broker_side — a short-cover is
 *      broker_side='buy' but closes a 'short' lot):
 *        long:  (exit_price − cost_basis) × qty
 *        short: (cost_basis − exit_price) × qty
 *
 *   2. UPDATEs the row with status='closed', exit_ts, exit_price,
 *      realized_pnl, wash_sale_status='pending' (§7.6 step 8 — 4M.3 later
 *      resolves to 'clean' or 'disallowed').
 *
 *   3. Fires `verify_realized_pnl` per closed lot — SOFT-DEPENDENT on the
 *      real BrokerRealizedPnLFetcher per FP-061 charter (mock path until
 *      FP-062 / DW-058 lands; mirrors FP-057 verify_rebalance_aggregate
 *      precedent).
 *
 *   4. Surfaces broker_confirmed_pnl + verify_result on the returned
 *      ClosedLot — the seam 4M.3 reads to choose Path A vs Path B. This
 *      writer does NOT implement wash-sale logic.
 *
 * Pre-conditions (throw, no sentinel):
 *   - inputs.length === 0 → return [] (short-circuit, no DB call, no fetch)
 *   - any input with exit_price == null OR exit_price <= 0 → throw
 *   - exit_trade_id required (non-empty) → throw
 *
 * `closed_at` here is the exit_ts the rows are stamped with: it comes from
 * the broker fill, NOT from Date.now() — caller responsibility.
 */
export async function closeLots(
  inputs: readonly CloseLotInput[],
  closed_at: Date,
  fetcher: BrokerRealizedPnLFetcher,
  fetcher_source: FetcherSource,
  client: LotLedgerClient = supabaseAdmin as unknown as LotLedgerClient,
): Promise<ClosedLot[]> {
  if (inputs.length === 0) return [];

  // Per-input precondition — typed absence, no defaulting.
  for (const inp of inputs) {
    if (inp.exit_price == null || !(inp.exit_price > 0)) {
      throw new Error(
        `closeLots: precondition violated — lot_id=${inp.lot_id} exit_price=${inp.exit_price}`,
      );
    }
    if (!inp.exit_trade_id || inp.exit_trade_id.length === 0) {
      throw new Error(
        `closeLots: precondition violated — lot_id=${inp.lot_id} missing exit_trade_id`,
      );
    }
  }

  const byLotId = new Map(inputs.map((i) => [i.lot_id, i] as const));
  const lot_ids = inputs.map((i) => i.lot_id);

  // Two-phase UPDATE: we need each row's side+cost_basis+qty BEFORE we can
  // compute realized_pnl, so first read the existing rows, then write per-lot
  // exits one by one (a single UPDATE can't apply per-row computed values
  // through this narrow client). The pre-read also surfaces missing lots.
  const closed: ClosedLot[] = [];
  for (const lot_id of lot_ids) {
    const inp = byLotId.get(lot_id)!;
    const existing = await client
      .from('longshort_lots')
      .select('lot_id, symbol, side, qty, cost_basis, entry_ts')
      .eq('lot_id', lot_id)
      .single();
    if (existing.error) {
      throw new Error(`longshort_lots_read_for_close_failed: ${existing.error.message}`);
    }
    if (!existing.data) {
      throw new Error(`longshort_lots_close_missing: lot_id=${lot_id}`);
    }
    const side = existing.data.side as 'long' | 'short';
    const qty = Number(existing.data.qty);
    const cost_basis = Number(existing.data.cost_basis);
    const realized_pnl = side === 'long'
      ? (inp.exit_price - cost_basis) * qty
      : (cost_basis - inp.exit_price) * qty;

    const upd = await client
      .from('longshort_lots')
      .update({
        status: 'closed',
        closed_at: closed_at.toISOString(),
        exit_ts: closed_at.toISOString(),
        exit_price: inp.exit_price,
        realized_pnl,
        wash_sale_status: 'pending',
        // FP-061 4M.5b / MIG-142 — seed net_pnl = realized_pnl at close.
        // wash_sale_adjustment defaults 0 (no disallowance known at close).
        // applyNetPnlAdjustment (wash-sale-writer) updates BOTH columns
        // when §7.8 fires asynchronously after the close-write.
        wash_sale_adjustment: 0,
        net_pnl: realized_pnl,
      })
      .in('lot_id', [lot_id])
      .select('lot_id, symbol, side, qty, cost_basis, entry_ts');
    if (upd.error) {
      throw new Error(`longshort_lots_close_failed: ${upd.error.message}`);
    }

    // FP-061 SOFT-DEPENDENT BROKER FETCHER — see FP-057
    // verify_rebalance_aggregate precedent. The real Alpaca-paper
    // BrokerRealizedPnLFetcher lands in FP-062 / DW-058. Until then we
    // read broker_confirmed_pnl from the contract-complete mock-fetcher
    // path; verify_realized_pnl is fired SEPARATELY for the
    // reconciliation_events audit write.
    //
    // TODO(FP-062): flip the injected `fetcher` to the real Alpaca
    // broker-side reader at the call site; this writer is unchanged.
    //
    // (1) read broker-confirmed PnL directly so 4M.3 always has a
    //     ground-truth number, even if the verifier event-write fails.
    let broker_confirmed_pnl: number | null = null;
    try {
      const confirm = await fetcher.fetchRealizedPnL(inp.exit_trade_id, closed_at);
      if (typeof confirm.broker_confirmed_pnl === 'number') {
        broker_confirmed_pnl = confirm.broker_confirmed_pnl;
      }
    } catch (e) {
      // 4M.3 will see broker_confirmed_pnl===null and route to Path B
      // (re_entry_blocked_pending_review). DEC-034 narrow exception:
      // observation surface, not the source-of-truth write.
      broker_confirmed_pnl = null;
      void e;
    }

    // (2) fire the verifier for the audit-event write. Errors here are
    //     diagnostic-only — they do NOT clear broker_confirmed_pnl.
    let verify_result: ReconcileResult | null = null;
    try {
      // gate-13-allow: post-mutation verify per §7.6 step 7-8 — verify_realized_pnl reconciles the realized-PnL number AFTER the exit is recorded on the lot (realized PnL is not knowable until close); this is the spec-sanctioned post-mutation reconcile, not a verify-after-mutation defect.
      verify_result = await verifyRealizedPnL(
        {
          trade_id: inp.exit_trade_id,
          symbol: String(existing.data.symbol),
          claimed_pnl: realized_pnl,
          operator_id: '00000000-0000-0000-0000-000000000001',
        },
        fetcher,
        closed_at,
        fetcher_source,
      );
    } catch (e) {
      verify_result = null;
      void e;
    }

    closed.push({
      lot_id,
      symbol: String(existing.data.symbol),
      side,
      qty,
      cost_basis,
      entry_ts: new Date(String(existing.data.entry_ts)),
      closed_at,
      exit_ts: closed_at,
      exit_price: inp.exit_price,
      realized_pnl,
      wash_sale_status: 'pending',
      broker_confirmed_pnl,
      verify_result,
      is_trim: inp.is_trim ?? false,
    });
  }
  return closed;
}

// ─────────────────────────────────────────────────────────────────────────
// FP-061 sub-step 4M.3 — FIFO-earliest-open-lot helper.
//
// EXTRACTED HERE (not in wash-sale-writer.ts) so future sub-step 4M.4
// (the lot-selector for exits) inherits the same §7.4 FIFO ordering
// invariant: ORDER BY entry_ts ASC, lot_id ASC (UUID tiebreaker per
// CROSSWIND §7.4 V1 Option B). Grep-confirmed at FP-061 4M.3 investigation
// time: NO FIFO helper existed prior to this sub-step.
//
// Used by §7.8 retroactive cost-basis attachment (wash-sale-writer.ts
// apply_7_8) to find the earliest still-held lot in the 30-day window.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Narrow read surface the FIFO helper needs. Distinct from LotLedgerClient
 * because the helper does a range query (gte / lte) + a NOT-IN exclude
 * that the writer-flavored client doesn't expose. Tests inject a fake.
 */
export interface FifoLotReader {
  /**
   * Returns the FIFO-earliest open lot for `symbol` whose `entry_ts`
   * falls inside `[from_ts, to_ts]` (inclusive) AND whose lot_id is NOT
   * in `exclude_lot_ids`. Returns `null` if no such lot exists.
   *
   * Ordering MUST be: ORDER BY entry_ts ASC, lot_id ASC LIMIT 1 (§7.4
   * FIFO + UUID tiebreaker). The lot_id tiebreaker keeps the helper
   * deterministic when two lots share the same entry_ts.
   */
  selectFifoEarliestOpenInWindow(args: {
    symbol: string;
    from_ts: Date;
    to_ts: Date;
    exclude_lot_ids: readonly string[];
  }): Promise<{
    lot_id: string;
    entry_ts: Date;
    qty: number;
    cost_basis: number;
  } | null>;
}

/**
 * Default `FifoLotReader` backed by `supabaseAdmin`. Caller-facing
 * convenience — tests should inject the interface directly.
 */
/**
 * Narrow read surface for the FIFO helper. Mirrors the structural-client
 * pattern used by LotLedgerClient — keeps the supabaseAdmin cast off `any`
 * and ESLint-clean (no-explicit-any).
 */
export interface FifoLotReaderClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        eq(col: string, val: string): {
          gte(col: string, val: string): {
            lte(col: string, val: string): FifoLotReaderQuery;
          };
        };
      };
    };
  };
}
interface FifoLotReaderQuery {
  not(col: string, op: string, val: string): FifoLotReaderQuery;
  order(col: string, opts: { ascending: boolean }): FifoLotReaderQuery;
  limit(n: number): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
}

export function createSupabaseFifoLotReader(): FifoLotReader {
  const client = supabaseAdmin as unknown as FifoLotReaderClient;
  return {
    async selectFifoEarliestOpenInWindow({ symbol, from_ts, to_ts, exclude_lot_ids }) {
      let q = client
        .from('longshort_lots')
        .select('lot_id, entry_ts, qty, cost_basis')
        .eq('symbol', symbol)
        .eq('status', 'open')
        .gte('entry_ts', from_ts.toISOString())
        .lte('entry_ts', to_ts.toISOString());
      if (exclude_lot_ids.length > 0) {
        // PostgREST `not.in.(...)` filter.
        q = q.not('lot_id', 'in', `(${exclude_lot_ids.map((id) => `"${id}"`).join(',')})`);
      }
      const { data, error } = await q
        .order('entry_ts', { ascending: true })
        .order('lot_id', { ascending: true })
        .limit(1);
      if (error) {
        throw new Error(`selectFifoEarliestOpenInWindow_failed: ${(error as { message?: string }).message ?? 'unknown'}`);
      }
      const rows = (data ?? []) as Array<{ lot_id: string; entry_ts: string; qty: number; cost_basis: number }>;
      if (rows.length === 0) return null;
      const r = rows[0];
      return {
        lot_id: String(r.lot_id),
        entry_ts: new Date(String(r.entry_ts)),
        qty: Number(r.qty),
        cost_basis: Number(r.cost_basis),
      };
    },
  };
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
    .select('lot_id, symbol, entry_ts, qty, cost_basis, side, status, locate_id, exit_ts, exit_price, realized_pnl, wash_sale_status')
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
    // FP-061 sub-step 4M.5a additive — NOT in verify_lot_record COMPARED_FIELDS
    // (verifier exact-match contract unchanged); surfaced for 4M.3 consumption.
    exit_ts: data.exit_ts == null ? null : new Date(String(data.exit_ts)),
    exit_price: data.exit_price == null ? null : Number(data.exit_price),
    realized_pnl: data.realized_pnl == null ? null : Number(data.realized_pnl),
    wash_sale_status: data.wash_sale_status == null
      ? null
      : (String(data.wash_sale_status) as 'pending' | 'clean' | 'disallowed'),
  };
}