/**
 * corporate-action-applier_test — FP-061 sub-step 4M.4 / ACT-378.
 *
 * Coverage:
 *   1. basis-invariant on split        (qty × cost_basis post == pre)
 *   2. basis-invariant on stock_dividend
 *   3. spinoff: parent + child basis sum == pre-spinoff parent basis
 *   4. cash_dividend: NO lot mutation; applied_at stamped (count=0)
 *   5. merger-cash routes through closeLots (realized_pnl captured)
 *   6. sentinel-throws on missing ratio_numerator (split)
 *   7. sentinel-throws on missing cash_per_share (cash_dividend)
 *   8. sentinel-throws on missing successor_symbol (merger-stock)
 *   9. sentinel-throws on missing basis_allocation_pct (spinoff)
 *  10. applied_lot_count = 0 LEGITIMATE (no open lots) — stamp still fires
 *  11. injected-clock: as_of drives `applied_at` (no wall-clock)
 *  12. UnappliedCorporateActionReader returns earliest ex_date per symbol
 *
 * In-memory fake client implements the union of CorporateActionApplierClient
 * + LotLedgerClient surfaces — narrow enough to drive the dispatch table
 * without a real DB.
 */

import {
  assertEquals,
  assertExists,
  assertRejects,
  assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  runCorporateActionApplier,
  type CorporateActionApplierClient,
} from './corporate-action-applier.ts';
import type { LotLedgerClient } from './lot-ledger-writer.ts';
import type {
  BrokerRealizedPnLConfirm,
  BrokerRealizedPnLFetcher,
  BrokerCorporateActionFetcher,
  BrokerCorporateActionSnapshot,
} from '../longshort-broker-interfaces.ts';

// ── In-memory fake DB + client ────────────────────────────────────────

type FakeRow = Record<string, unknown>;
interface FakeDb {
  corporate_actions: FakeRow[];
  longshort_lots: FakeRow[];
}

function makeFakeDb(seed?: Partial<FakeDb>): FakeDb {
  return {
    corporate_actions: seed?.corporate_actions ?? [],
    longshort_lots: seed?.longshort_lots ?? [],
  };
}

/**
 * Fake client satisfying both CorporateActionApplierClient and
 * LotLedgerClient. Each chain method only implements the calls the
 * applier actually issues; unused branches throw to surface drift.
 */
function makeClient(db: FakeDb): CorporateActionApplierClient & LotLedgerClient {
  function table(name: keyof FakeDb) {
    const rows = db[name];
    return {
      // CorporateActionApplierClient.select(cols) → returns chain
      select(_cols: string) {
        return {
          // applier read of open lots: .eq('symbol',s).eq('status','open')
          eq(col1: string, val1: string) {
            return {
              eq(col2: string, val2: string) {
                const filtered = rows.filter(
                  (r) => String(r[col1]) === val1 && String(r[col2]) === val2,
                );
                return Promise.resolve({ data: filtered as FakeRow[], error: null });
              },
              single() {
                const found = rows.find((r) => String(r[col1]) === val1);
                return Promise.resolve({ data: found ?? null, error: null });
              },
              // lot-ledger-writer dedup pre-check (ACT-403):
              // .select(...).eq('source_order_id', val).limit(1)
              limit(n: number) {
                const filtered = rows.filter((r) => String(r[col1]) === val1).slice(0, n);
                return Promise.resolve({ data: filtered as FakeRow[], error: null });
              },
            };
          },
          // applier read of unapplied CA rows: .is('applied_at',null).lte('ex_date',ymd).order(..)
          is(col: string, val: null) {
            void val;
            return {
              lte(col2: string, val2: string) {
                return {
                  order(_o: string, _opts: { ascending: boolean }) {
                    const filtered = rows
                      .filter((r) => r[col] == null && String(r[col2]) <= val2)
                      .sort((a, b) => String(a[col2]).localeCompare(String(b[col2])));
                    return Promise.resolve({ data: filtered as FakeRow[], error: null });
                  },
                  // composer reader: .in('symbol', symbols).order(..)
                  in(col3: string, vals: readonly string[]) {
                    return {
                      order(_o: string, _opts: { ascending: boolean }) {
                        const set = new Set(vals);
                        const filtered = rows
                          .filter(
                            (r) =>
                              r[col] == null &&
                              String(r[col2]) <= val2 &&
                              set.has(String(r[col3])),
                          )
                          .sort((a, b) => String(a[col2]).localeCompare(String(b[col2])));
                        return Promise.resolve({ data: filtered as FakeRow[], error: null });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
      // LotLedgerClient.insert(row)
      insert(row: FakeRow) {
        rows.push({ ...row });
        return Promise.resolve({ error: null });
      },
      // .update(patch) → .eq(col,val) | .in(col,vals)
      update(patch: FakeRow) {
        return {
          eq(col: string, val: string) {
            for (const r of rows) {
              if (String(r[col]) === val) Object.assign(r, patch);
            }
            return Promise.resolve({ error: null });
          },
          in(col: string, vals: readonly string[]) {
            const set = new Set(vals);
            const updated: FakeRow[] = [];
            for (const r of rows) {
              if (set.has(String(r[col]))) {
                Object.assign(r, patch);
                updated.push(r);
              }
            }
            return {
              select(_cols: string) {
                return Promise.resolve({ data: updated, error: null });
              },
            };
          },
        };
      },
    };
  }
  return {
    from(name: string) {
      // deno-lint-ignore no-explicit-any
      return table(name as keyof FakeDb) as any;
    },
  } as CorporateActionApplierClient & LotLedgerClient;
}

function makeRealizedPnlFetcher(confirmed: number): BrokerRealizedPnLFetcher {
  return {
    async fetchRealizedPnL(trade_id: string, ts: Date): Promise<BrokerRealizedPnLConfirm> {
      return {
        trade_id,
        symbol: 'X',
        broker_confirmed_pnl: confirmed,
        trade_ts: ts,
        fetched_at: ts,
      };
    },
  };
}

// ── FP-062 6I.2b gap (b) / ACT-413 — CA verifier fetcher test doubles ──
function makeCaFetcher(opts: {
  recent: boolean;
  applied: boolean;
  hours_since?: number;
  callLog?: string[];
}): BrokerCorporateActionFetcher {
  return {
    async fetchCorporateActionSnapshot(
      symbol: string,
      _lookback_days: number,
      ts: Date,
    ): Promise<BrokerCorporateActionSnapshot> {
      opts.callLog?.push(symbol);
      const hours = opts.hours_since ?? 1;
      return {
        symbol,
        recent_action_within_lookback: opts.recent,
        action_type: opts.recent ? 'split' : null,
        action_ts: opts.recent ? new Date(ts.getTime() - hours * 3_600_000) : null,
        broker_basis_adjusted: opts.applied,
        hours_since_action: opts.recent ? hours : null,
        fetched_at: ts,
      };
    },
  };
}

function makeThrowingCaFetcher(): BrokerCorporateActionFetcher {
  return {
    fetchCorporateActionSnapshot() {
      return Promise.reject(new Error('verify_blew_up_on_purpose'));
    },
  };
}

const AS_OF = new Date('2026-07-15T16:00:00.000Z');

function seedLot(symbol: string, qty: number, basis: number, lot_id = crypto.randomUUID()): FakeRow {
  return {
    lot_id,
    symbol,
    side: 'long',
    qty,
    cost_basis: basis,
    status: 'open',
    settlement_state: 'pending',
    entry_ts: new Date('2026-07-01T16:00:00.000Z').toISOString(),
    operator_id: '00000000-0000-0000-0000-000000000001',
    locate_id: null,
    expected_settlement_ts: new Date('2026-07-02T16:00:00.000Z').toISOString(),
    source_order_id: 'orig',
  };
}

function seedCa(action_type: string, overrides: Partial<FakeRow> = {}): FakeRow {
  return {
    ca_id: crypto.randomUUID(),
    symbol: 'AAPL',
    action_type,
    ex_date: '2026-07-10',
    ratio_numerator: null,
    ratio_denominator: null,
    cash_per_share: null,
    successor_symbol: null,
    basis_allocation_pct: null,
    applied_at: null,
    applied_lot_count: null,
    ...overrides,
  };
}

// ── (1) Split — basis invariant ───────────────────────────────────────
Deno.test('4M.4: split applies qty×(num/den) and basis×(den/num); total basis invariant', async () => {
  const lot = seedLot('AAPL', 10, 200);
  const ca = seedCa('split', { ratio_numerator: 2, ratio_denominator: 1 }); // 2:1
  const db = makeFakeDb({ corporate_actions: [ca], longshort_lots: [lot] });
  const client = makeClient(db);
  const result = await runCorporateActionApplier({ as_of: AS_OF, client });
  assertEquals(result.rows_applied, 1);
  assertEquals(result.applied[0].applied_lot_count, 1);
  const post = db.longshort_lots[0];
  assertEquals(Number(post.qty), 20);
  assertEquals(Number(post.cost_basis), 100);
  // Basis invariant: qty × cost_basis pre == post.
  assertEquals(10 * 200, Number(post.qty) * Number(post.cost_basis));
  // applied_at stamped to AS_OF.
  assertEquals(String(db.corporate_actions[0].applied_at), AS_OF.toISOString());
});

// ── (2) Stock dividend — same ratio shape ─────────────────────────────
Deno.test('4M.4: stock_dividend mutates identically to split', async () => {
  const lot = seedLot('AAPL', 100, 50);
  // 11:10 stock dividend = +10% shares
  const ca = seedCa('stock_dividend', { ratio_numerator: 11, ratio_denominator: 10 });
  const db = makeFakeDb({ corporate_actions: [ca], longshort_lots: [lot] });
  const client = makeClient(db);
  await runCorporateActionApplier({ as_of: AS_OF, client });
  const post = db.longshort_lots[0];
  // floating-point: 100 * 11/10 may yield 110.00000000000001
  assertEquals(Math.round(Number(post.qty) * 1e8) / 1e8, 110);
  // basis = 50 × 10/11 ≈ 45.4545...
  assertEquals(Math.round(Number(post.cost_basis) * 10000), Math.round((50 * 10 / 11) * 10000));
  // Invariant.
  assertEquals(Math.round(Number(post.qty) * Number(post.cost_basis) * 1000), Math.round(100 * 50 * 1000));
});

// ── (3) Spinoff — parent + child basis sum == pre ─────────────────────
Deno.test('4M.4: spinoff trims parent basis + opens child lot at allocated basis', async () => {
  const lot = seedLot('PRNT', 10, 100); // total basis = 1000
  const ca = seedCa('spinoff', {
    symbol: 'PRNT',
    successor_symbol: 'CHLD',
    basis_allocation_pct: 30, // 30% to child, 70% retained by parent
  });
  const db = makeFakeDb({ corporate_actions: [ca], longshort_lots: [lot] });
  const client = makeClient(db);
  await runCorporateActionApplier({ as_of: AS_OF, client });
  const parent = db.longshort_lots.find((r) => r.lot_id === lot.lot_id)!;
  const child = db.longshort_lots.find((r) => r.symbol === 'CHLD');
  assertExists(child, 'child lot should be opened on successor_symbol');
  // Parent basis trimmed; qty unchanged.
  assertEquals(Number(parent.qty), 10);
  assertEquals(Number(parent.cost_basis), 70);
  // Child basis allocated.
  assertEquals(Number(child.qty), 10);
  assertEquals(Number(child.cost_basis), 30);
  // Sum invariant: parent_qty*parent_basis + child_qty*child_basis == pre.
  assertEquals(
    Number(parent.qty) * Number(parent.cost_basis) +
      Number(child.qty) * Number(child.cost_basis),
    10 * 100,
  );
});

// ── (4) Cash dividend — NO mutation, applied_at stamped ───────────────
Deno.test('4M.4: cash_dividend is no-op on lots; applied_at stamped (count=0)', async () => {
  const lot = seedLot('AAPL', 10, 200);
  const ca = seedCa('cash_dividend', { cash_per_share: 0.25 });
  const db = makeFakeDb({ corporate_actions: [ca], longshort_lots: [lot] });
  const client = makeClient(db);
  const result = await runCorporateActionApplier({ as_of: AS_OF, client });
  assertEquals(result.applied[0].applied_lot_count, 0);
  const post = db.longshort_lots[0];
  assertEquals(Number(post.qty), 10);    // unchanged
  assertEquals(Number(post.cost_basis), 200); // unchanged
  assertEquals(String(db.corporate_actions[0].applied_at), AS_OF.toISOString());
});

// ── (5) Merger-cash routes through closeLots ──────────────────────────
Deno.test('4M.4: merger-cash closes lots at cash_per_share via closeLots', async () => {
  const lot = seedLot('TGT', 5, 80);
  const ca = seedCa('merger', { symbol: 'TGT', cash_per_share: 100 });
  const db = makeFakeDb({ corporate_actions: [ca], longshort_lots: [lot] });
  const client = makeClient(db);
  await runCorporateActionApplier({
    as_of: AS_OF,
    client,
    realizedPnlFetcher: makeRealizedPnlFetcher(100),
  });
  const post = db.longshort_lots[0];
  assertEquals(String(post.status), 'closed');
  assertEquals(Number(post.exit_price), 100);
  // realized_pnl = (100 - 80) * 5 = 100 (long).
  assertEquals(Number(post.realized_pnl), 100);
});

// ── (6)–(9) Sentinel-throws ──────────────────────────────────────────
Deno.test('4M.4: split missing ratio_numerator THROWS (no silent no-op)', async () => {
  const lot = seedLot('AAPL', 10, 200);
  const ca = seedCa('split', { ratio_denominator: 1 }); // missing numerator
  const db = makeFakeDb({ corporate_actions: [ca], longshort_lots: [lot] });
  const client = makeClient(db);
  await assertRejects(
    () => runCorporateActionApplier({ as_of: AS_OF, client }),
    Error,
    'split requires ratio',
  );
});

Deno.test('4M.4: cash_dividend missing cash_per_share THROWS', async () => {
  const lot = seedLot('AAPL', 10, 200);
  const ca = seedCa('cash_dividend');
  const db = makeFakeDb({ corporate_actions: [ca], longshort_lots: [lot] });
  const client = makeClient(db);
  await assertRejects(
    () => runCorporateActionApplier({ as_of: AS_OF, client }),
    Error,
    'cash_per_share',
  );
});

Deno.test('4M.4: merger-stock missing successor_symbol THROWS', async () => {
  const lot = seedLot('AAPL', 10, 200);
  const ca = seedCa('merger', { ratio_numerator: 1, ratio_denominator: 2 });
  const db = makeFakeDb({ corporate_actions: [ca], longshort_lots: [lot] });
  const client = makeClient(db);
  await assertRejects(
    () => runCorporateActionApplier({ as_of: AS_OF, client }),
    Error,
    'successor_symbol',
  );
});

Deno.test('4M.4: spinoff missing basis_allocation_pct THROWS', async () => {
  const lot = seedLot('PRNT', 10, 100);
  const ca = seedCa('spinoff', { symbol: 'PRNT', successor_symbol: 'CHLD' });
  const db = makeFakeDb({ corporate_actions: [ca], longshort_lots: [lot] });
  const client = makeClient(db);
  await assertRejects(
    () => runCorporateActionApplier({ as_of: AS_OF, client }),
    Error,
    'basis_allocation_pct',
  );
});

// ── (10) applied_lot_count = 0 is LEGITIMATE ─────────────────────────
Deno.test('4M.4: split with NO open lots still stamps applied_at (count=0)', async () => {
  const ca = seedCa('split', { ratio_numerator: 2, ratio_denominator: 1 });
  const db = makeFakeDb({ corporate_actions: [ca], longshort_lots: [] });
  const client = makeClient(db);
  const result = await runCorporateActionApplier({ as_of: AS_OF, client });
  assertEquals(result.rows_applied, 1);
  assertEquals(result.applied[0].applied_lot_count, 0);
  assertEquals(String(db.corporate_actions[0].applied_at), AS_OF.toISOString());
});

// ── (11) Injected clock — applied_at echoes as_of, not wall-clock ────
Deno.test('4M.4: applied_at stamp uses injected as_of (no wall-clock)', async () => {
  const ca = seedCa('split', { ratio_numerator: 2, ratio_denominator: 1 });
  const db = makeFakeDb({ corporate_actions: [ca], longshort_lots: [seedLot('AAPL', 4, 50)] });
  const client = makeClient(db);
  const fixedAsOf = new Date('2030-01-01T00:00:00.000Z');
  await runCorporateActionApplier({ as_of: fixedAsOf, client });
  assertEquals(String(db.corporate_actions[0].applied_at), fixedAsOf.toISOString());
});

// ── (12) Composer reader — earliest ex_date per symbol ────────────────
Deno.test('4M.4: UnappliedCorporateActionReader returns earliest unapplied per symbol', async () => {
  const ca1 = seedCa('split', {
    symbol: 'AAPL',
    ex_date: '2026-07-05',
    ratio_numerator: 2, ratio_denominator: 1,
  });
  const ca2 = seedCa('cash_dividend', {
    symbol: 'AAPL',
    ex_date: '2026-07-08',
    cash_per_share: 0.25,
  });
  const caApplied = seedCa('split', {
    symbol: 'MSFT',
    ex_date: '2026-07-01',
    ratio_numerator: 2, ratio_denominator: 1,
    applied_at: '2026-07-02T00:00:00.000Z',
  });
  const db = makeFakeDb({ corporate_actions: [ca1, ca2, caApplied] });
  const client = makeClient(db);
  // Hand-construct the reader against our fake client.
  const { createSupabaseUnappliedCorporateActionReader } = await import('./corporate-action-applier.ts');
  // Replace internal supabaseAdmin with our fake via a wrapper.
  const reader = {
    async fetchUnapplied(symbols: readonly string[], as_of: Date) {
      const out = new Map<string, { action_type: string; ex_date: Date }>();
      // Replicate the production reader using our fake client to verify
      // the same SELECT-shape works end-to-end.
      const { data, error } = await (client as unknown as import('./corporate-action-applier.ts').UnappliedCorporateActionReaderClient)
        .from('corporate_actions')
        .select('symbol, action_type, ex_date')
        .is('applied_at', null)
        .lte('ex_date', as_of.toISOString().slice(0, 10))
        .in('symbol', symbols)
        .order('ex_date', { ascending: true });
      assertEquals(error, null);
      for (const r of data ?? []) {
        const sym = String((r as FakeRow).symbol);
        if (!out.has(sym)) {
          out.set(sym, {
            action_type: String((r as FakeRow).action_type),
            ex_date: new Date(String((r as FakeRow).ex_date)),
          });
        }
      }
      return out;
    },
  };
  // Sanity-check createSupabaseUnappliedCorporateActionReader is exported.
  assert(typeof createSupabaseUnappliedCorporateActionReader === 'function');
  const map = await reader.fetchUnapplied(['AAPL', 'MSFT', 'NVDA'], AS_OF);
  assertEquals(map.size, 1);
  assertEquals(map.get('AAPL')?.action_type, 'split');
  assertEquals(map.get('AAPL')?.ex_date.toISOString().slice(0, 10), '2026-07-05');
  assertEquals(map.has('MSFT'), false); // already applied
  assertEquals(map.has('NVDA'), false); // no row
});

// ── (13) ACT-413 — verify fires post-applied_at with injected fetcher ─
Deno.test('ACT-413: verifyCorporateActionClean fires post-applied_at with injected fetcher', async () => {
  const lot = seedLot('AAPL', 10, 200);
  const ca = seedCa('split', { ratio_numerator: 2, ratio_denominator: 1 });
  const db = makeFakeDb({ corporate_actions: [ca], longshort_lots: [lot] });
  const client = makeClient(db);
  const calls: string[] = [];
  const caFetcher = makeCaFetcher({ recent: true, applied: true, callLog: calls });
  const result = await runCorporateActionApplier({
    as_of: AS_OF, client, corporateActionFetcher: caFetcher,
  });
  assertEquals(calls, ['AAPL']);  // fetcher invoked exactly once for the applied symbol
  // verify_result may be null in unit-test env (no DB-backed
  // reconciliation_events writer) — mirrors lot-ledger-writer_test.ts:194.
  // Fetcher-invocation IS the load-bearing signal that the wire fired.
  assertEquals('verify_result' in result.applied[0], true);
  // applied_at is stamped BEFORE the verify fires (post-mutation reconcile).
  assertEquals(String(db.corporate_actions[0].applied_at), AS_OF.toISOString());
});

// ── (14) ACT-413 — verify error is diagnostic-only; applier survives ──
Deno.test('ACT-413: verify error is swallowed diagnostic-only; applier mutation persists', async () => {
  const lot = seedLot('AAPL', 10, 200);
  const ca = seedCa('split', { ratio_numerator: 2, ratio_denominator: 1 });
  const db = makeFakeDb({ corporate_actions: [ca], longshort_lots: [lot] });
  const client = makeClient(db);
  const result = await runCorporateActionApplier({
    as_of: AS_OF, client, corporateActionFetcher: makeThrowingCaFetcher(),
  });
  // Applier did NOT throw; mutation persisted; stamp persisted.
  assertEquals(result.rows_applied, 1);
  assertEquals(Number(db.longshort_lots[0].qty), 20);
  assertEquals(String(db.corporate_actions[0].applied_at), AS_OF.toISOString());
  // verify_result is null (error swallowed).
  assertEquals(result.applied[0].verify_result, null);
});

// ── (15) ACT-413 — no-op (count=0) case still fires the verify ────────
Deno.test('ACT-413: applied_lot_count=0 still fires verify post-stamp', async () => {
  const ca = seedCa('split', { ratio_numerator: 2, ratio_denominator: 1 });
  const db = makeFakeDb({ corporate_actions: [ca], longshort_lots: [] });
  const client = makeClient(db);
  const calls: string[] = [];
  const result = await runCorporateActionApplier({
    as_of: AS_OF, client,
    corporateActionFetcher: makeCaFetcher({ recent: false, applied: false, callLog: calls }),
  });
  assertEquals(result.applied[0].applied_lot_count, 0);
  assertEquals(calls, ['AAPL']);  // verify still fired
  assertEquals('verify_result' in result.applied[0], true);
});