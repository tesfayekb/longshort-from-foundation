/**
 * wash-sale-writer_test — FP-061 sub-step 4M.3 / ACT-374 unit tests.
 *
 * Branch coverage:
 *   - realized_pnl >= 0 → no-op (no_loss).
 *   - PATH B: broker_confirmed_pnl == null → pending_review row written,
 *     NO wash_sale_events row.
 *   - PATH B: verify_result.outcome === 'failure_escalated' → pending_review,
 *     NO wash_sale_events.
 *   - broker_confirmed_pnl >= 0 (broker disagrees) → broker_confirms_no_loss.
 *   - PATH A full exit: wash_sale_events row, block_until = exit_ts + 31
 *     CALENDAR days, realized_loss = broker_confirmed_pnl (NEVER realized_pnl).
 *   - PATH A trim: wash_sale_events row, block_until = NULL.
 *   - §7.8 with NO in-window held lot: ONE row only (the §7.8 second write
 *     is CONDITIONAL).
 *   - §7.8 with in-window held lot: SECOND wash_sale_events row written,
 *     attached_to_lot_id set, cost_basis mutated.
 */

import {
  assertEquals,
  assertExists,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  evaluateWashSale,
  type WashSaleWriterClient,
} from './wash-sale-writer.ts';
import type { ClosedLot, LotLedgerClient, FifoLotReader } from './lot-ledger-writer.ts';
import type {
  BrokerWashSaleRecord,
  BrokerWashSaleRecordFetcher,
  BrokerLotRecord,
  BrokerLotRecordFetcher,
} from '../longshort-broker-interfaces.ts';

// ── Fakes ────────────────────────────────────────────────────────────────

function makeWriterClient(): WashSaleWriterClient & { rows: Record<string, Record<string, unknown>[]> } {
  const rows: Record<string, Record<string, unknown>[]> = {
    wash_sale_events: [],
    wash_sale_pending_review: [],
  };
  return {
    rows,
    from(table: string) {
      return {
        // deno-lint-ignore require-await
        async insert(row: Record<string, unknown>) {
          (rows[table] ??= []).push({ ...row });
          return { error: null };
        },
      };
    },
  };
}

function makeLotClient(initial: Record<string, unknown>[] = []): LotLedgerClient & { rows: Record<string, unknown>[] } {
  const rows: Record<string, unknown>[] = [...initial];
  const client = {
    rows,
    from(_t: string) {
      return {
        async insert(r: Record<string, unknown>) { rows.push({ ...r }); return { error: null }; },
        update(patch: Record<string, unknown>) {
          return {
            in(col: string, vals: readonly string[]) {
              return {
                // deno-lint-ignore require-await
                async select(_c: string) {
                  const upd: Record<string, unknown>[] = [];
                  for (const r of rows) if (vals.includes(String(r[col]))) { Object.assign(r, patch); upd.push({ ...r }); }
                  return { data: upd, error: null };
                },
              };
            },
          };
        },
        select(_c: string) {
          return {
            eq(col: string, val: string) {
              return {
                // deno-lint-ignore require-await
                async single() {
                  const f = rows.find((r) => String(r[col]) === val);
                  return f ? { data: { ...f }, error: null } : { data: null, error: { message: 'nf' } };
                },
              };
            },
          };
        },
      };
    },
  };
  return client as LotLedgerClient & { rows: Record<string, unknown>[] };
}

function fifoReader(found: { lot_id: string; entry_ts: Date; qty: number; cost_basis: number } | null): FifoLotReader & { calls: number } {
  const r = {
    calls: 0,
    async selectFifoEarliestOpenInWindow(_a: unknown) { r.calls++; return found; },
  };
  return r as FifoLotReader & { calls: number };
}

const washSaleFetcher: BrokerWashSaleRecordFetcher = {
  async fetchWashSaleRecord(event_id: string, _ts: Date): Promise<BrokerWashSaleRecord> {
    return {
      event_id,
      symbol: '',
      exit_ts: new Date(0),
      realized_loss: 0,
      lot_ids_affected: [],
      status: 'block_active',
      block_until: null,
      attached_to_lot_id: null,
      fetched_at: new Date(0),
    };
  },
};
const lotRecordFetcher: BrokerLotRecordFetcher = {
  async fetchLotRecord(lot_id: string, _ts: Date): Promise<BrokerLotRecord> {
    return {
      lot_id, symbol: '', entry_ts: new Date(0), qty: 0, cost_basis: 0,
      side: 'long', status: 'open', locate_id: null, fetched_at: new Date(0),
    };
  },
};

function mkClosed(overrides: Partial<ClosedLot>): ClosedLot {
  return {
    lot_id: 'L1',
    symbol: 'AAPL',
    side: 'long',
    qty: 100,
    cost_basis: 100,
    entry_ts: new Date('2026-06-01T15:00:00Z'),
    closed_at: new Date('2026-06-15T15:00:00Z'),
    exit_ts: new Date('2026-06-15T15:00:00Z'),
    exit_price: 90,
    realized_pnl: -1000,
    wash_sale_status: 'pending',
    broker_confirmed_pnl: -1000,
    verify_result: null,
    is_trim: false,
    ...overrides,
  };
}

const TS = new Date('2026-06-15T15:30:00Z');

// ── Tests ────────────────────────────────────────────────────────────────

Deno.test('no_loss: realized_pnl >= 0 short-circuits', async () => {
  const writer = makeWriterClient();
  const out = await evaluateWashSale(
    [mkClosed({ realized_pnl: 50, broker_confirmed_pnl: 50 })],
    TS,
    { client: writer, lotClient: makeLotClient(), fifoReader: fifoReader(null), washSaleFetcher, lotRecordFetcher },
  );
  assertEquals(out[0].outcome, 'no_loss');
  assertEquals(writer.rows.wash_sale_events.length, 0);
  assertEquals(writer.rows.wash_sale_pending_review.length, 0);
});

Deno.test('PATH B: broker_confirmed_pnl null → pending_review only, NO events row', async () => {
  const writer = makeWriterClient();
  const out = await evaluateWashSale(
    [mkClosed({ broker_confirmed_pnl: null })],
    TS,
    { client: writer, lotClient: makeLotClient(), fifoReader: fifoReader(null), washSaleFetcher, lotRecordFetcher },
  );
  assertEquals(out[0].outcome, 'pending_review');
  assertEquals(writer.rows.wash_sale_events.length, 0);
  assertEquals(writer.rows.wash_sale_pending_review.length, 1);
  assertEquals(writer.rows.wash_sale_pending_review[0].context, 'full_exit');
});

Deno.test('PATH B: verify failure_escalated → pending_review (trim context)', async () => {
  const writer = makeWriterClient();
  const out = await evaluateWashSale(
    [mkClosed({
      is_trim: true,
      verify_result: { outcome: 'failure_escalated' } as ClosedLot['verify_result'],
    })],
    TS,
    { client: writer, lotClient: makeLotClient(), fifoReader: fifoReader(null), washSaleFetcher, lotRecordFetcher },
  );
  assertEquals(out[0].outcome, 'pending_review');
  assertEquals(writer.rows.wash_sale_events.length, 0);
  assertEquals(writer.rows.wash_sale_pending_review[0].context, 'trim');
});

Deno.test('broker_confirms_no_loss: broker says PnL >= 0 → no-op', async () => {
  const writer = makeWriterClient();
  const out = await evaluateWashSale(
    [mkClosed({ realized_pnl: -1000, broker_confirmed_pnl: 25 })],
    TS,
    { client: writer, lotClient: makeLotClient(), fifoReader: fifoReader(null), washSaleFetcher, lotRecordFetcher },
  );
  assertEquals(out[0].outcome, 'broker_confirms_no_loss');
  assertEquals(writer.rows.wash_sale_events.length, 0);
});

Deno.test('PATH A full exit + §7.8 no held lot: ONE wash_sale_events row, block_until = exit_ts + 31 calendar days, loss = broker_confirmed_pnl', async () => {
  const writer = makeWriterClient();
  const out = await evaluateWashSale(
    [mkClosed({ realized_pnl: -1234, broker_confirmed_pnl: -999 })],
    TS,
    { client: writer, lotClient: makeLotClient(), fifoReader: fifoReader(null), washSaleFetcher, lotRecordFetcher },
  );
  assertEquals(out[0].outcome, 'full_exit_blocked');
  assertEquals(writer.rows.wash_sale_events.length, 1);
  const ev = writer.rows.wash_sale_events[0];
  // Loss amount = broker_confirmed_pnl, NEVER realized_pnl (STOP condition).
  assertEquals(ev.realized_loss, -999);
  assertEquals(ev.status, 'block_active');
  assertEquals(ev.attached_to_lot_id, null);
  // 31 CALENDAR days after exit_ts (2026-06-15 → 2026-07-16).
  assertEquals(String(ev.block_until).slice(0, 10), '2026-07-16');
  assertEquals(out[0].retroactive?.outcome, 'no_retroactive_attachment');
});

Deno.test('PATH A full exit + §7.8 WITH in-window held lot: TWO wash_sale_events rows, cost_basis mutated', async () => {
  const writer = makeWriterClient();
  const heldEntry = new Date('2026-06-10T15:00:00Z'); // 5 days before exit
  const lotClient = makeLotClient([
    { lot_id: 'L2', symbol: 'AAPL', entry_ts: heldEntry.toISOString(), qty: 50, cost_basis: 80, side: 'long', status: 'open', locate_id: null },
  ]);
  const out = await evaluateWashSale(
    [mkClosed({ broker_confirmed_pnl: -500 })],
    TS,
    {
      client: writer,
      lotClient,
      fifoReader: fifoReader({ lot_id: 'L2', entry_ts: heldEntry, qty: 50, cost_basis: 80 }),
      washSaleFetcher,
      lotRecordFetcher,
    },
  );
  assertEquals(out[0].outcome, 'full_exit_blocked');
  assertEquals(writer.rows.wash_sale_events.length, 2);
  const attached = writer.rows.wash_sale_events[1];
  assertEquals(attached.status, 'disallowed_loss_attached');
  assertEquals(attached.attached_to_lot_id, 'L2');
  assertEquals(attached.disallowed_amount, 500);
  assertEquals(attached.block_until, null);
  // cost_basis mutated: 80 + 500/50 = 90.
  const held = lotClient.rows.find((r) => r.lot_id === 'L2');
  assertExists(held);
  assertEquals(held!.cost_basis, 90);
  assertEquals(out[0].retroactive?.outcome, 'attached');
  assertEquals(out[0].retroactive?.attached_to_lot_id, 'L2');
});

Deno.test('PATH A trim: block_until is NULL (§7.9 bypasses re-entry block); §7.8 still chains', async () => {
  const writer = makeWriterClient();
  const out = await evaluateWashSale(
    [mkClosed({ is_trim: true, broker_confirmed_pnl: -250 })],
    TS,
    { client: writer, lotClient: makeLotClient(), fifoReader: fifoReader(null), washSaleFetcher, lotRecordFetcher },
  );
  assertEquals(out[0].outcome, 'trim_recorded');
  assertEquals(writer.rows.wash_sale_events.length, 1);
  assertEquals(writer.rows.wash_sale_events[0].block_until, null);
  assertEquals(writer.rows.wash_sale_events[0].status, 'block_active');
});