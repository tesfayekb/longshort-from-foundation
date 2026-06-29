/**
 * wash-sale-writer — FP-061 sub-step 4M.3 / ACT-374.
 *
 * The IRS wash-sale tax-bookkeeping surface. Consumes ClosedLot[] (the 4M.5a
 * seam emitted by `closeLots` in lot-ledger-writer.ts) and writes the
 * authoritative `wash_sale_events` rows + the Path B `wash_sale_pending_review`
 * operator queue. STRONG+ tier per CROSSWIND §11.0.10 — events retained
 * INDEFINITELY for year-end 1099-B / Form 8949 reconciliation.
 *
 * BRANCH STRUCTURE (the reconciled FP-061-ADD-01 build-shape):
 *
 *   For each ClosedLot c:
 *     1. c.realized_pnl >= 0 ........... no-op (§1.4 — PnL ≥ 0 = no wash sale).
 *     2. PATH B ⇔ c.broker_confirmed_pnl == null OR
 *                  c.verify_result?.outcome === 'failure_escalated':
 *        - DO NOT write wash_sale_events (§7.7 Path B prohibition — never
 *          write a wash-sale row from a non-broker-confirmed loss number;
 *          IRS consequences if the amount is wrong).
 *        - INSERT wash_sale_pending_review with context = is_trim ? 'trim'
 *          : 'full_exit' (discriminates trim_wash_sale_pending_review vs
 *          re_entry_blocked_pending_review per §7.9 R2 / §7.7 Path B).
 *        - Operator alert (Strong+).
 *     3. c.broker_confirmed_pnl >= 0 ... broker says it's not a loss → no-op.
 *     4. PATH A territory (broker-confirmed loss; the wash-sale amount IS
 *        c.broker_confirmed_pnl, NEVER c.realized_pnl):
 *        - is_trim (§7.9): write wash_sale_events(status='block_active',
 *          block_until=NULL — trim bypasses re-entry block); verify;
 *          DO NOT add to re_entry_blocked; ALWAYS chain apply_7_8 on
 *          remaining shares.
 *        - else (§7.7 Path A full exit): write wash_sale_events(
 *          status='block_active', block_until=exit_ts + 31 CALENDAR days);
 *          verify; the block_active row IS the re_entry_blocked set
 *          (composer reads it directly — no separate table).
 *        - In BOTH Path A sub-cases: apply_7_8 fires conditionally
 *          (§7.8 step 1 "on every loss-producing sale").
 *
 * §7.8 apply_7_8 (CONDITIONAL second write):
 *   - Detect: SELECT FIFO-earliest open lot for symbol in [exit_ts-30d,
 *     exit_ts+30d] excluding source lot_ids. BROADER than §1.4 re-entry
 *     (before OR after the sale date).
 *   - No candidate → no second row (the §7.8 second write is CONDITIONAL,
 *     not guaranteed — a full exit at a loss with no in-window held lot
 *     produces ONE wash_sale_events row, not two).
 *   - Candidate → UPDATE longshort_lots cost_basis (Strong+), verify_lot_record,
 *     write wash_sale_events(status='disallowed_loss_attached',
 *     attached_to_lot_id=target.lot_id, disallowed_amount=|loss|),
 *     verify_wash_sale_record.
 *
 * GATE-13 ANNOTATIONS (4 pre-identified mutation→verify pairs — all
 * spec-sanctioned post-mutation reconciliations per §7.7 / §7.8 / §7.9):
 *   - §7.7 Path A: insert wash_sale_events → verifyWashSaleRecord
 *   - §7.9 trim:   insert wash_sale_events → verifyWashSaleRecord
 *   - §7.8 step 5→6: update longshort_lots.cost_basis → verifyLotRecord
 *   - §7.8 step 7→8: insert wash_sale_events → verifyWashSaleRecord
 * (wash_sale_pending_review writes have NO paired verifier — Path B has no
 *  broker-confirmed truth to verify against; Gate 13 does not trip.)
 *
 * SOFT-DEPENDENT BROKER FETCHERS (BrokerWashSaleRecordFetcher,
 * BrokerLotRecordFetcher): per FP-062 / DW-058, the real Alpaca adapter
 * lands in the broker MOVE cluster. Until then verifyWashSaleRecord +
 * verifyLotRecord run against the contract-complete mock fetcher path —
 * the verifier event-write happens; the broker-side `observed` is mocked.
 * Mirrors FP-057 verify_rebalance_aggregate + FP-061 4M.5a precedents.
 *
 * PURITY:
 *   - I/O at the edge (DB + fetchers); per-ClosedLot classification logic
 *     is pure of wall-clock (DEC-034 (4)): the `ts` argument is the SOLE
 *     Date source. No `new Date()` / `Date.now()` / `performance.now()`.
 */

import { supabaseAdmin } from '../supabase-admin.ts';
import type { ClosedLot, LotLedgerClient } from './lot-ledger-writer.ts';
import { readInternalLotRecord, type FifoLotReader } from './lot-ledger-writer.ts';
import { verifyWashSaleRecord } from '../longshort-verifiers/verify_wash_sale_record.ts';
import { verifyLotRecord } from '../longshort-verifiers/verify_lot_record.ts';
import type {
  BrokerWashSaleRecordFetcher,
  BrokerLotRecordFetcher,
} from '../longshort-broker-interfaces.ts';
import type { FetcherSource, ReconcileResult } from '../longshort-reconciliation-types.ts';

const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001';

/**
 * 31 CALENDAR days per §7.7 Path A step 1 verbatim. CALENDAR, not trading.
 * The IRS wash-sale window is a calendar-day rule.
 */
const BLOCK_WINDOW_DAYS = 31;
/** §7.8 detection window — 30 CALENDAR days before OR after the loss sale. */
const SECTION_7_8_WINDOW_DAYS = 30;

function addCalendarDays(ts: Date, days: number): Date {
  const out = new Date(ts.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/**
 * Narrow write surface for `wash_sale_events` + `wash_sale_pending_review`.
 * Sibling shape to `LotLedgerClient`; tests inject an in-memory fake.
 */
export interface WashSaleWriterClient {
  from(table: string): {
    insert(row: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
  };
}

/** Optional operator-alert hook (Strong+ tier per §7.7 Path B + §7.9 R2). */
export interface WashSaleOperatorAlerter {
  alert(args: {
    kind: 'wash_sale_path_b_full_exit' | 'wash_sale_path_b_trim';
    symbol: string;
    pending_id: string;
    internal_pnl: number;
    broker_pnl: number | null;
    verify_outcome: string | null;
  }): Promise<void>;
}

export interface WashSaleWriterDeps {
  /** Writer client for the two new tables. Defaults to supabaseAdmin. */
  client?: WashSaleWriterClient;
  /** Reader client used by §7.8 to mutate longshort_lots cost_basis and by
   *  the verify_lot_record reader-wire. Defaults to supabaseAdmin. */
  lotClient?: LotLedgerClient;
  /** §7.8 FIFO-earliest-in-window lot reader. Defaults to a supabaseAdmin-
   *  backed implementation. */
  fifoReader: FifoLotReader;
  /** Soft-dependent (FP-062). Drives verify_wash_sale_record's broker-side
   *  `observed` — contract-complete mock today, flip to Alpaca later. */
  washSaleFetcher: BrokerWashSaleRecordFetcher;
  /** Soft-dependent (FP-062). Drives verify_lot_record's broker-side
   *  `observed` after §7.8 cost-basis mutation. */
  lotRecordFetcher: BrokerLotRecordFetcher;
  /** Wired into verify_* shells as `fetcher_source`. Default 'live'. */
  fetcher_source?: FetcherSource;
  /** Optional operator alerter — Phase 5 alert pipeline lands here. When
   *  omitted, Path B writes the pending-review row without an alert
   *  dispatch (the row IS the durable record). */
  operatorAlerter?: WashSaleOperatorAlerter;
  operator_id?: string;
}

/** Single-ClosedLot evaluation result (audit + diagnostic shape). */
export type WashSaleEvaluationOutcome =
  | 'no_loss'
  | 'pending_review'
  | 'broker_confirms_no_loss'
  | 'full_exit_blocked'
  | 'trim_recorded';

export interface RetroactiveAttachmentResult {
  outcome: 'no_retroactive_attachment' | 'attached';
  attached_to_lot_id?: string;
  attached_event_id?: string;
  disallowed_amount?: number;
  lot_verify_result?: ReconcileResult | null;
  wash_verify_result?: ReconcileResult | null;
}

export interface WashSaleEvaluation {
  lot_id: string;
  symbol: string;
  outcome: WashSaleEvaluationOutcome;
  /** Path A — the wash_sale_events row written for the closed lot. */
  event_id?: string;
  /** Path B — the wash_sale_pending_review row written. */
  pending_id?: string;
  /** Path A + Path B — surfaced for audit. */
  broker_confirmed_pnl?: number | null;
  /** Path A — verifier outcome for the wash_sale_events row. */
  wash_verify_result?: ReconcileResult | null;
  /** §7.8 outcome — present whenever apply_7_8 ran (every Path A loss). */
  retroactive?: RetroactiveAttachmentResult;
}

// ─────────────────────────────────────────────────────────────────────────
// Entry point.
// ─────────────────────────────────────────────────────────────────────────

export async function evaluateWashSale(
  closed: readonly ClosedLot[],
  ts: Date,
  deps: WashSaleWriterDeps,
): Promise<WashSaleEvaluation[]> {
  const client = (deps.client ?? (supabaseAdmin as unknown as WashSaleWriterClient));
  const lotClient = (deps.lotClient ?? (supabaseAdmin as unknown as LotLedgerClient));
  const fetcher_source: FetcherSource = deps.fetcher_source ?? 'live';
  const operator_id = deps.operator_id ?? DEFAULT_OPERATOR_ID;

  const out: WashSaleEvaluation[] = [];
  for (const c of closed) {
    out.push(
      await evaluateOne(c, ts, {
        client,
        lotClient,
        fifoReader: deps.fifoReader,
        washSaleFetcher: deps.washSaleFetcher,
        lotRecordFetcher: deps.lotRecordFetcher,
        operator_id,
        fetcher_source,
        operatorAlerter: deps.operatorAlerter,
      }),
    );
  }
  return out;
}

interface ResolvedDeps {
  client: WashSaleWriterClient;
  lotClient: LotLedgerClient;
  fifoReader: FifoLotReader;
  washSaleFetcher: BrokerWashSaleRecordFetcher;
  lotRecordFetcher: BrokerLotRecordFetcher;
  operator_id: string;
  fetcher_source: FetcherSource;
  operatorAlerter?: WashSaleOperatorAlerter;
}

async function evaluateOne(
  c: ClosedLot,
  ts: Date,
  deps: ResolvedDeps,
): Promise<WashSaleEvaluation> {
  // §1.4 — PnL ≥ 0 produces no wash sale at all. Short-circuit before any DB write.
  if (c.realized_pnl >= 0) {
    return { lot_id: c.lot_id, symbol: c.symbol, outcome: 'no_loss' };
  }

  // PATH B discriminator (§7.7 Path B / §7.9 R2):
  //   broker_confirmed_pnl missing (fetch failed) OR verifier escalated
  //   (broker disagreed) → never write wash_sale_events.
  const pathB =
    c.broker_confirmed_pnl == null ||
    c.verify_result?.outcome === 'failure_escalated';
  if (pathB) {
    const pending_id = crypto.randomUUID();
    const row = {
      pending_id,
      operator_id: deps.operator_id,
      symbol: c.symbol,
      flagged_ts: c.exit_ts.toISOString(),
      context: c.is_trim ? 'trim' : 'full_exit',
      source_lot_ids: [c.lot_id],
      internal_pnl: c.realized_pnl,
      broker_pnl: c.broker_confirmed_pnl,
      verify_outcome: c.verify_result?.outcome ?? null,
      status: 'open',
    };
    const { error } = await deps.client.from('wash_sale_pending_review').insert(row);
    if (error) throw new Error(`wash_sale_pending_review_insert_failed: ${error.message}`);
    if (deps.operatorAlerter) {
      try {
        await deps.operatorAlerter.alert({
          kind: c.is_trim ? 'wash_sale_path_b_trim' : 'wash_sale_path_b_full_exit',
          symbol: c.symbol,
          pending_id,
          internal_pnl: c.realized_pnl,
          broker_pnl: c.broker_confirmed_pnl,
          verify_outcome: c.verify_result?.outcome ?? null,
        });
      } catch (_e) { /* diagnostic — the durable row is the record */ }
    }
    void ts;
    return {
      lot_id: c.lot_id,
      symbol: c.symbol,
      outcome: 'pending_review',
      pending_id,
      broker_confirmed_pnl: c.broker_confirmed_pnl,
    };
  }

  // PATH A territory: broker_confirmed_pnl is non-null AND verifier did NOT
  // escalate. If broker says PnL ≥ 0, no wash sale (engine + broker simply
  // disagree on sign, but broker is authoritative for the wash-sale test).
  const brokerPnl = c.broker_confirmed_pnl as number;
  if (brokerPnl >= 0) {
    return {
      lot_id: c.lot_id,
      symbol: c.symbol,
      outcome: 'broker_confirms_no_loss',
      broker_confirmed_pnl: brokerPnl,
    };
  }

  // Path A LOSS — the wash-sale amount written is broker_confirmed_pnl,
  // NEVER realized_pnl. §7.7 Path B prohibition.
  const event_id = crypto.randomUUID();
  const block_until = c.is_trim ? null : addCalendarDays(c.exit_ts, BLOCK_WINDOW_DAYS);
  const eventRow = {
    event_id,
    operator_id: deps.operator_id,
    symbol: c.symbol,
    exit_ts: c.exit_ts.toISOString(),
    realized_loss: brokerPnl,
    lot_ids_affected: [c.lot_id],
    status: 'block_active',
    block_until: block_until ? block_until.toISOString() : null,
    attached_to_lot_id: null,
    outcome: 'block_active',
    disallowed_amount: null,
    source_lot_ids: [c.lot_id],
  };
  const ins = await deps.client.from('wash_sale_events').insert(eventRow);
  if (ins.error) throw new Error(`wash_sale_events_insert_failed: ${ins.error.message}`);

  // gate-13-allow: post-mutation verify per §7.7 step 1→2 (full exit) /
  // §7.9 step 2 → §7.7 step 1-2 (trim record-portion) — wash_sale_events
  // row is verified for persistence immediately after write; the verifier
  // IS the post-write reconciliation, not a verify-after-mutation defect.
  let wash_verify_result: ReconcileResult | null = null;
  try {
    // gate-13-allow: post-mutation verify per §7.7 step 1→2 / §7.9 step 2 — wash_sale_events row verified for persistence immediately after write.
    wash_verify_result = await verifyWashSaleRecord(
      {
        operator_id: deps.operator_id,
        expected: {
          event_id,
          symbol: c.symbol,
          exit_ts: c.exit_ts,
          realized_loss: brokerPnl,
          lot_ids_affected: [c.lot_id],
          status: 'block_active',
          block_until,
          attached_to_lot_id: null,
        },
      },
      deps.washSaleFetcher,
      ts,
      deps.fetcher_source,
    );
  } catch (_e) { wash_verify_result = null; }

  // §7.8 retroactive — ALWAYS fires on every Path A loss-producing sale
  // (§7.8 step 1 verbatim: "on every loss-producing sale"). CONDITIONAL
  // write: if no in-window held lot, no second wash_sale_events row.
  const retroactive = await applySection7_8(
    {
      symbol: c.symbol,
      disallowed_loss: brokerPnl,
      exit_ts: c.exit_ts,
      exclude_lot_ids: [c.lot_id],
      operator_id: deps.operator_id,
    },
    ts,
    deps,
  );

  return {
    lot_id: c.lot_id,
    symbol: c.symbol,
    outcome: c.is_trim ? 'trim_recorded' : 'full_exit_blocked',
    event_id,
    broker_confirmed_pnl: brokerPnl,
    wash_verify_result,
    retroactive,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// §7.8 retroactive cost-basis attachment.
// ─────────────────────────────────────────────────────────────────────────

async function applySection7_8(
  args: {
    symbol: string;
    disallowed_loss: number;   // broker-confirmed; negative number
    exit_ts: Date;
    exclude_lot_ids: readonly string[];
    operator_id: string;
  },
  ts: Date,
  deps: ResolvedDeps,
): Promise<RetroactiveAttachmentResult> {
  const from_ts = addCalendarDays(args.exit_ts, -SECTION_7_8_WINDOW_DAYS);
  const to_ts = addCalendarDays(args.exit_ts, SECTION_7_8_WINDOW_DAYS);

  const target = await deps.fifoReader.selectFifoEarliestOpenInWindow({
    symbol: args.symbol,
    from_ts,
    to_ts,
    exclude_lot_ids: args.exclude_lot_ids,
  });
  if (target == null) {
    return { outcome: 'no_retroactive_attachment' };
  }

  // Compute adjusted basis per §7.8 step 4:
  // new_cost_basis = original_cost_basis + |disallowed_loss| / qty.
  const absLoss = Math.abs(args.disallowed_loss);
  const new_cost_basis = target.cost_basis + absLoss / target.qty;

  // §7.8 step 5: MUTATE cost_basis (Strong+).
  const upd = await deps.lotClient
    .from('longshort_lots')
    .update({ cost_basis: new_cost_basis })
    .in('lot_id', [target.lot_id])
    .select('lot_id');
  if (upd.error) throw new Error(`section_7_8_cost_basis_update_failed: ${upd.error.message}`);

  // gate-13-allow: post-mutation verify per §7.8 step 5→6 — cost-basis
  // adjustment is persisted before verify_lot_record reconciles; the
  // adjustment IS the action being verified, not a verify-after-mutation
  // defect.
  let lot_verify_result: ReconcileResult | null = null;
  try {
    const expected = await readInternalLotRecord(target.lot_id, deps.lotClient);
    // gate-13-allow: post-mutation verify per §7.8 step 5→6 — cost-basis adjustment IS the action being verified.
    lot_verify_result = await verifyLotRecord(
      { operator_id: args.operator_id, expected },
      deps.lotRecordFetcher,
      ts,
      deps.fetcher_source,
    );
  } catch (_e) { lot_verify_result = null; }

  // §7.8 step 7: write wash_sale_events(status='disallowed_loss_attached').
  const event_id = crypto.randomUUID();
  const row = {
    event_id,
    operator_id: args.operator_id,
    symbol: args.symbol,
    exit_ts: args.exit_ts.toISOString(),
    realized_loss: args.disallowed_loss,
    lot_ids_affected: [target.lot_id],
    status: 'disallowed_loss_attached',
    block_until: null,
    attached_to_lot_id: target.lot_id,
    outcome: 'disallowed_loss_attached',
    disallowed_amount: absLoss,
    source_lot_ids: args.exclude_lot_ids,
  };
  const ins = await deps.client.from('wash_sale_events').insert(row);
  if (ins.error) throw new Error(`section_7_8_wash_sale_events_insert_failed: ${ins.error.message}`);

  // FP-061 4M.5b / MIG-142 — apply the net-PnL adjustment to the CLOSED
  // source lot (NOT the held target — the target receives the cost-basis
  // bump above; the disallowed loss attributes to the lot whose loss it
  // was). Join on source_lot_ids per the spec: the closed lot's
  // deductible loss is reduced by the positive disallowed_amount.
  //   net_pnl = realized_pnl + wash_sale_adjustment  (PLUS, not minus —
  //   −500 loss + 500 disallowance = 0 net taxable; sign error = 1099-B
  //   defect.) Failures here are observation-surface (audit trail will
  //   still carry the wash_sale_events row); the per-lot column update
  //   is the derived 1099-B projection.
  for (const source_lot_id of args.exclude_lot_ids) {
    try {
      await applyNetPnlAdjustment(source_lot_id, absLoss, deps.lotClient);
    } catch (_e) { /* projection-update failure is non-fatal — wash_sale_events row is the durable record */ }
  }

  // gate-13-allow: post-mutation verify per §7.8 step 7→8 — wash_sale_events
  // row verified for persistence immediately after write; spec-sanctioned
  // post-mutation reconcile per §7.8.
  let wash_verify_result: ReconcileResult | null = null;
  try {
    // gate-13-allow: post-mutation verify per §7.8 step 7→8 — wash_sale_events disallowed_loss_attached row verified after write.
    wash_verify_result = await verifyWashSaleRecord(
      {
        operator_id: args.operator_id,
        expected: {
          event_id,
          symbol: args.symbol,
          exit_ts: args.exit_ts,
          realized_loss: args.disallowed_loss,
          lot_ids_affected: [target.lot_id],
          status: 'disallowed_loss_attached',
          block_until: null,
          attached_to_lot_id: target.lot_id,
        },
      },
      deps.washSaleFetcher,
      ts,
      deps.fetcher_source,
    );
  } catch (_e) { wash_verify_result = null; }

  return {
    outcome: 'attached',
    attached_to_lot_id: target.lot_id,
    attached_event_id: event_id,
    disallowed_amount: absLoss,
    lot_verify_result,
    wash_verify_result,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// FP-061 sub-step 4M.5b / MIG-142 — net-PnL writer.
//
// Updates the CLOSED source lot's wash_sale_adjustment + net_pnl columns
// when a §7.8 disallowance attributes a positive magnitude to it.
//
// SIGN DISCIPLINE (IRS crux):
//   - disallowed_amount: stored POSITIVE magnitude (Math.abs at the caller).
//   - realized_pnl:      signed (negative = loss).
//   - net_pnl = realized_pnl + wash_sale_adjustment.
//     A −500 loss + 500 disallowance = 0 net taxable. PLUS, never minus.
//
// Pure DB write — no verify pair, no Gate-13 surface (net_pnl is a derived
// 1099-B projection, not a verify_*-gated mutation).
// ─────────────────────────────────────────────────────────────────────────

export async function applyNetPnlAdjustment(
  source_closed_lot_id: string,
  disallowed_amount: number,
  client: LotLedgerClient,
): Promise<void> {
  if (!(disallowed_amount >= 0)) {
    throw new Error(
      `applyNetPnlAdjustment: disallowed_amount must be positive magnitude (got ${disallowed_amount})`,
    );
  }
  // Read first to compute the new value (the narrow LotLedgerClient does
  // not expose UPDATE...FROM/SET col = col + $; a read-then-write is
  // adequate — §7.8 is per-loss-sale single-writer, not high-concurrency).
  const read = await client
    .from('longshort_lots')
    .select('lot_id, realized_pnl, wash_sale_adjustment')
    .eq('lot_id', source_closed_lot_id)
    .single();
  if (read.error) {
    throw new Error(`applyNetPnlAdjustment_read_failed: ${read.error.message}`);
  }
  if (!read.data) {
    throw new Error(`applyNetPnlAdjustment_missing: lot_id=${source_closed_lot_id}`);
  }
  const realized_pnl = Number(read.data.realized_pnl ?? 0);
  const prior_adj = Number(read.data.wash_sale_adjustment ?? 0);
  const new_adj = prior_adj + disallowed_amount;
  const new_net = realized_pnl + new_adj;
  const upd = await client
    .from('longshort_lots')
    .update({ wash_sale_adjustment: new_adj, net_pnl: new_net })
    .in('lot_id', [source_closed_lot_id])
    .select('lot_id');
  if (upd.error) {
    throw new Error(`applyNetPnlAdjustment_update_failed: ${upd.error.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Reader surface for the §7 composer BLOCK (preflight-composer wire).
// ─────────────────────────────────────────────────────────────────────────

/**
 * The composer-side reader. LONG-only consumer (§1.4 re-entry block
 * applies to re-establishing the long position; the short side has its own
 * DTC + ETB squeeze gates). Typed-absence optional dep at the composer.
 */
export interface WashSaleBlockReader {
  /** TRUE iff `wash_sale_events` has any row for `symbol` with
   *  status='block_active' AND block_until > ts. */
  hasActiveBlock(symbol: string, ts: Date): Promise<boolean>;
  /** TRUE iff `wash_sale_pending_review` has any open row for `symbol`. */
  hasPendingReview(symbol: string): Promise<boolean>;
}

/** Narrow read surface for the composer block reader. */
export interface WashSaleBlockReaderClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        eq(col: string, val: string): {
          gt(col: string, val: string): {
            limit(n: number): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
          };
          limit(n: number): Promise<{ data: unknown[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
}

/**
 * Default supabaseAdmin-backed reader. Implementation does two narrow
 * table-local SELECTs (`wash_sale_events` block-active rows;
 * `wash_sale_pending_review` open rows) — zero broker calls, indexed.
 */
export function createSupabaseWashSaleBlockReader(): WashSaleBlockReader {
  const client = supabaseAdmin as unknown as WashSaleBlockReaderClient;
  return {
    async hasActiveBlock(symbol, ts) {
      const { data, error } = await client
        .from('wash_sale_events')
        .select('event_id')
        .eq('symbol', symbol)
        .eq('status', 'block_active')
        .gt('block_until', ts.toISOString())
        .limit(1);
      if (error) throw new Error(`wash_sale_events_block_read_failed: ${error.message}`);
      return (data ?? []).length > 0;
    },
    async hasPendingReview(symbol) {
      const { data, error } = await client
        .from('wash_sale_pending_review')
        .select('pending_id')
        .eq('symbol', symbol)
        .eq('status', 'open')
        .limit(1);
      if (error) throw new Error(`wash_sale_pending_review_read_failed: ${error.message}`);
      return (data ?? []).length > 0;
    },
  };
}