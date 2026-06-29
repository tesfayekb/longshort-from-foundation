/**
 * entry-lot-ledger-sink — ACT-403 (Finding-B Option-1).
 *
 * Production LotLedgerSink wiring for ENTRY fills only. The lifecycle
 * orchestrator fires `onTerminalFilled` on every `terminal_filled` order
 * (entry OR exit). This sink routes ENTRY intents (open / increase) to
 * `writeOpenLot`. Exit intents (close / decrease) require FIFO lot
 * selection + closeLots — sub-step 4M.4 follow-up; for now they are
 * logged + skipped (no double-write risk; no silent loss because the
 * orchestrator-emitted `longshort.execution.filled` row is the audit
 * source of truth and the next sub-step's closer will reconcile).
 *
 * Idempotency on source_order_id is enforced by `writeOpenLot`'s
 * pre-check + MIG-148 unique index — re-observation across the
 * overlapping 2× tick-interval reconstruction window records ONCE.
 */
import { writeOpenLot } from './lot-ledger-writer.ts';
import type { LotLedgerSink } from './lifecycle-orchestrator.ts';

export interface EntryLotLedgerSinkOptions {
  operator_id?: string;
}

const ENTRY_INTENTS = new Set(['open', 'increase']);

export function createEntryLotLedgerSink(
  opts: EntryLotLedgerSinkOptions = {},
): LotLedgerSink {
  return {
    async onTerminalFilled(order, fill, ts): Promise<void> {
      if (!ENTRY_INTENTS.has(order.intent)) {
        // Exit intent — FP-061 sub-step 4M.4 owns the closeLots seam.
        // Log the deferral so the gap is observable in the audit trail.
        console.warn(
          'longshort_lot_ledger_sink.exit_intent_skipped',
          JSON.stringify({
            order_id: order.order_id,
            symbol: order.symbol,
            intent: order.intent,
            ts: ts.toISOString(),
            note: 'ACT-403 entry-only sink; closeLots wiring is FP-061 4M.4',
          }),
        );
        return;
      }
      if (fill.avg_fill_price == null || !(fill.avg_fill_price > 0)) {
        // The orchestrator's precondition is normally met for
        // terminal_filled. Defensive: skip + log, do not throw
        // (the orchestrator already catches throws but we want a
        // structured signal here, not a generic "sink_threw").
        console.error(
          'longshort_lot_ledger_sink.fill_price_absent',
          JSON.stringify({
            order_id: order.order_id,
            symbol: order.symbol,
            filled_qty: fill.filled_qty,
            ts: ts.toISOString(),
          }),
        );
        return;
      }
      await writeOpenLot(
        {
          order_id: order.order_id,
          filled: true,
          filled_qty: fill.filled_qty,
          avg_fill_price: fill.avg_fill_price,
          fetched_at: fill.observed_at,
        },
        {
          operator_id: opts.operator_id,
          symbol: order.symbol,
          side: order.side,
          source_order_id: order.order_id,
        },
        fill.observed_at,
      );
    },
  };
}