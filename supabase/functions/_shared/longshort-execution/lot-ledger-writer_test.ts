/**
 * lot-ledger-writer_test — FP-061 sub-step 4M.1 / DW-158 unit tests.
 *
 * Covers:
 *   1. writeOpenLot: fill → row written with correct fields + T+1 settlement stamp.
 *   2. closeLots: exit → status=closed + typed ClosedLot[] emitted.
 *   3. readInternalLotRecord: returns row matching verify_lot_record COMPARED_FIELDS.
 *
 * Uses an in-memory fake client implementing the narrow LotLedgerClient
 * surface (no DB, no supabase-js). Deno test runner.
 */

import {
  assertEquals,
  assertExists,
  assertRejects,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  writeOpenLot,
  closeLots,
  readInternalLotRecord,
  type LotLedgerClient,
} from './lot-ledger-writer.ts';
import type {
  BrokerFillResult,
  BrokerRealizedPnLConfirm,
  BrokerRealizedPnLFetcher,
} from '../longshort-broker-interfaces.ts';

function makeFetcher(confirmedPnl: number): BrokerRealizedPnLFetcher & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async fetchRealizedPnL(trade_id: string, ts: Date): Promise<BrokerRealizedPnLConfirm> {
      calls.push(trade_id);
      return {
        trade_id,
        symbol: 'X',
        broker_confirmed_pnl: confirmedPnl,
        trade_ts: ts,
        fetched_at: ts,
      };
    },
  };
}

function makeFakeClient(): LotLedgerClient & { rows: Record<string, unknown>[] } {
  const rows: Record<string, unknown>[] = [];
  const client = {
    rows,
    from(_table: string) {
      return {
        async insert(row: Record<string, unknown>) {
          rows.push({ ...row });
          return { error: null };
        },
        update(patch: Record<string, unknown>) {
          return {
            in(col: string, vals: readonly string[]) {
              return {
                async select(_cols: string) {
                  const updated: Record<string, unknown>[] = [];
                  for (const r of rows) {
                    if (vals.includes(String(r[col]))) {
                      Object.assign(r, patch);
                      updated.push({ ...r });
                    }
                  }
                  return { data: updated, error: null };
                },
              };
            },
          };
        },
        select(_cols: string) {
          return {
            eq(col: string, val: string) {
              return {
                // deno-lint-ignore require-await
                async single() {
                  const found = rows.find((r) => String(r[col]) === val);
                  return found
                    ? { data: { ...found }, error: null }
                    : { data: null, error: { message: 'not_found' } };
                },
                // ACT-403 — idempotency pre-check on source_order_id.
                // deno-lint-ignore require-await
                async limit(n: number) {
                  const found = rows.filter((r) => String(r[col]) === val).slice(0, n);
                  return { data: found.map((r) => ({ ...r })), error: null };
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

function makeFill(qty: number, px: number): BrokerFillResult {
  return {
    order_id: 'ord-1',
    filled: true,
    filled_qty: qty,
    avg_fill_price: px,
    fetched_at: new Date('2026-06-29T20:30:00Z'),
  };
}

Deno.test('writeOpenLot: writes row with COMPARED_FIELDS + T+1 settlement stamp', async () => {
  const client = makeFakeClient();
  // Monday 2026-06-29; T+1 = Tuesday 2026-06-30 (no holiday between).
  const entry_ts = new Date('2026-06-29T19:45:00Z');
  const lot = await writeOpenLot(
    makeFill(100, 42.5),
    {
      symbol: 'AAPL',
      side: 'long',
      source_order_id: 'ord-1',
      locate_id: null,
    },
    entry_ts,
    client,
  );
  assertEquals(client.rows.length, 1);
  const row = client.rows[0];
  assertEquals(row.symbol, 'AAPL');
  assertEquals(row.qty, 100);
  assertEquals(row.cost_basis, 42.5);
  assertEquals(row.side, 'long');
  assertEquals(row.status, 'open');
  assertEquals(row.locate_id, null);
  assertEquals(row.settlement_state, 'pending');
  assertEquals(row.source_order_id, 'ord-1');
  assertExists(row.lot_id);
  assertEquals(lot.lot_id, row.lot_id);
  // T+1 trading day on a Mon→Tue (no holiday) = next calendar day.
  assertEquals(
    (row.expected_settlement_ts as string).slice(0, 10),
    '2026-06-30',
  );
  assertEquals(lot.expected_settlement_ts.toISOString().slice(0, 10), '2026-06-30');
});

Deno.test('writeOpenLot: precondition violation throws', async () => {
  const client = makeFakeClient();
  await assertRejects(
    () =>
      writeOpenLot(
        { ...makeFill(0, 10), filled: false },
        { symbol: 'X', side: 'long', source_order_id: 'ord-x' },
        new Date('2026-06-29T19:45:00Z'),
        client,
      ),
    Error,
    'precondition violated',
  );
});

Deno.test('closeLots: marks status=closed and emits typed ClosedLot[]', async () => {
  const client = makeFakeClient();
  const entry_ts = new Date('2026-06-29T19:45:00Z');
  const opened = await writeOpenLot(
    makeFill(50, 100),
    { symbol: 'MSFT', side: 'long', source_order_id: 'ord-2' },
    entry_ts,
    client,
  );
  const closed_at = new Date('2026-06-30T15:00:00Z');
  const fetcher = makeFetcher(500);  // claimed = (110-100)*50 = 500
  const closed = await closeLots(
    [{ lot_id: opened.lot_id, exit_price: 110, exit_trade_id: 'trd-2' }],
    closed_at,
    fetcher,
    'mock',
    client,
  );
  assertEquals(closed.length, 1);
  assertEquals(closed[0].lot_id, opened.lot_id);
  assertEquals(closed[0].symbol, 'MSFT');
  assertEquals(closed[0].side, 'long');
  assertEquals(closed[0].qty, 50);
  assertEquals(closed[0].cost_basis, 100);
  assertEquals(closed[0].entry_ts.toISOString(), entry_ts.toISOString());
  assertEquals(closed[0].closed_at.toISOString(), closed_at.toISOString());
  // 4M.5a additions:
  assertEquals(closed[0].exit_price, 110);
  assertEquals(closed[0].exit_ts.toISOString(), closed_at.toISOString());
  assertEquals(closed[0].realized_pnl, 500);  // long: (110-100)*50
  assertEquals(closed[0].wash_sale_status, 'pending');
  assertEquals(closed[0].broker_confirmed_pnl, 500);
  // verify_result may be null in unit-test env (no DB-backed
  // reconciliation_events writer); broker_confirmed_pnl is the
  // ground-truth seam 4M.3 consumes and IS asserted above.
  // fetcher is called twice per lot: once directly for broker_confirmed_pnl,
  // once inside verifyRealizedPnL.
  assertEquals(fetcher.calls.length >= 1, true);
  assertEquals(fetcher.calls[0], 'trd-2');
  // Underlying row was mutated.
  assertEquals(client.rows[0].status, 'closed');
  assertEquals(client.rows[0].closed_at, closed_at.toISOString());
  assertEquals(client.rows[0].exit_price, 110);
  assertEquals(client.rows[0].realized_pnl, 500);
  assertEquals(client.rows[0].wash_sale_status, 'pending');
});

Deno.test('closeLots: empty input returns empty list (no DB call)', async () => {
  const client = makeFakeClient();
  const out = await closeLots([], new Date(), makeFetcher(0), 'mock', client);
  assertEquals(out, []);
});

Deno.test('closeLots: SHORT realized_pnl is sign-inverted (cost − exit) × qty', async () => {
  // Short opens at 50, covers at 40 → realized_pnl = (50 - 40) * 10 = +100 (gain).
  const client = makeFakeClient();
  const opened = await writeOpenLot(
    makeFill(10, 50),
    { symbol: 'TSLA', side: 'short', source_order_id: 'ord-s1', locate_id: 'loc-x' },
    new Date('2026-06-29T19:45:00Z'),
    client,
  );
  const fetcher = makeFetcher(100);
  const closed = await closeLots(
    [{ lot_id: opened.lot_id, exit_price: 40, exit_trade_id: 'trd-s1' }],
    new Date('2026-06-30T15:00:00Z'),
    fetcher,
    'mock',
    client,
  );
  assertEquals(closed[0].side, 'short');
  assertEquals(closed[0].realized_pnl, 100);  // short cover at lower price = gain

  // And a losing short: cover ABOVE entry → negative PnL.
  const opened2 = await writeOpenLot(
    makeFill(5, 20),
    { symbol: 'NVDA', side: 'short', source_order_id: 'ord-s2' },
    new Date('2026-06-29T19:45:00Z'),
    client,
  );
  const closed2 = await closeLots(
    [{ lot_id: opened2.lot_id, exit_price: 25, exit_trade_id: 'trd-s2' }],
    new Date('2026-06-30T15:00:00Z'),
    makeFetcher(-25),
    'mock',
    client,
  );
  assertEquals(closed2[0].realized_pnl, -25);  // (20-25)*5 = -25 (loss on cover)
});

Deno.test('closeLots: missing exit_price throws (no sentinel/default)', async () => {
  const client = makeFakeClient();
  const opened = await writeOpenLot(
    makeFill(10, 10),
    { symbol: 'A', side: 'long', source_order_id: 'ord-p' },
    new Date('2026-06-29T19:45:00Z'),
    client,
  );
  await assertRejects(
    () =>
      closeLots(
        // deno-lint-ignore no-explicit-any
        [{ lot_id: opened.lot_id, exit_price: null as any, exit_trade_id: 'trd-p' }],
        new Date(),
        makeFetcher(0),
        'mock',
        client,
      ),
    Error,
    'precondition violated',
  );
  await assertRejects(
    () =>
      closeLots(
        [{ lot_id: opened.lot_id, exit_price: 100, exit_trade_id: '' }],
        new Date(),
        makeFetcher(0),
        'mock',
        client,
      ),
    Error,
    'precondition violated',
  );
});

Deno.test('readInternalLotRecord: returns COMPARED_FIELDS-shaped record', async () => {
  const client = makeFakeClient();
  const entry_ts = new Date('2026-06-29T19:45:00Z');
  const opened = await writeOpenLot(
    makeFill(25, 17.25),
    { symbol: 'NVDA', side: 'short', source_order_id: 'ord-3', locate_id: 'loc-abc' },
    entry_ts,
    client,
  );
  const rec = await readInternalLotRecord(opened.lot_id, client);
  assertEquals(rec.lot_id, opened.lot_id);
  assertEquals(rec.symbol, 'NVDA');
  assertEquals(rec.entry_ts.toISOString(), entry_ts.toISOString());
  assertEquals(rec.qty, 25);
  assertEquals(rec.cost_basis, 17.25);
  assertEquals(rec.side, 'short');
  assertEquals(rec.status, 'open');
  assertEquals(rec.locate_id, 'loc-abc');
});

// ACT-403 (Finding-B Option-1) — idempotency on source_order_id.
// The recently-filled reconstruction window is overlapping (2× tick
// interval). A filled order re-observed on the next tick MUST record
// ONCE; writeOpenLot's pre-check returns the EXISTING lot rather than
// inserting a duplicate row.
Deno.test('writeOpenLot: dedups on source_order_id (Finding-B safety)', async () => {
  const client = makeFakeClient();
  const entry_ts = new Date('2026-06-29T19:45:00Z');
  const first = await writeOpenLot(
    makeFill(10, 50),
    { symbol: 'MSFT', side: 'long', source_order_id: 'broker-ord-42' },
    entry_ts,
    client,
  );
  assertEquals(client.rows.length, 1);

  // Same source_order_id → next tick re-observes the same fill.
  const second = await writeOpenLot(
    makeFill(10, 50),
    { symbol: 'MSFT', side: 'long', source_order_id: 'broker-ord-42' },
    new Date('2026-06-29T20:00:00Z'), // later tick
    client,
  );
  // EXACTLY one row in the ledger.
  assertEquals(client.rows.length, 1);
  // Same lot_id returned (caller sees the existing lineage).
  assertEquals(second.lot_id, first.lot_id);
  // entry_ts is the ORIGINAL entry, not the re-observation ts.
  assertEquals(second.entry_ts.toISOString(), entry_ts.toISOString());
});