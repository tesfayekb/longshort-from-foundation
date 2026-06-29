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
import type { BrokerFillResult } from '../longshort-broker-interfaces.ts';

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
  const closed = await closeLots([opened.lot_id], closed_at, client);
  assertEquals(closed.length, 1);
  assertEquals(closed[0].lot_id, opened.lot_id);
  assertEquals(closed[0].symbol, 'MSFT');
  assertEquals(closed[0].side, 'long');
  assertEquals(closed[0].qty, 50);
  assertEquals(closed[0].cost_basis, 100);
  assertEquals(closed[0].entry_ts.toISOString(), entry_ts.toISOString());
  assertEquals(closed[0].closed_at.toISOString(), closed_at.toISOString());
  // Underlying row was mutated.
  assertEquals(client.rows[0].status, 'closed');
  assertEquals(client.rows[0].closed_at, closed_at.toISOString());
});

Deno.test('closeLots: empty input returns empty list (no DB call)', async () => {
  const client = makeFakeClient();
  const out = await closeLots([], new Date(), client);
  assertEquals(out, []);
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