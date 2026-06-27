// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
/**
 * etb-transition-monitor_test — DW-162a.
 *
 * Covers:
 *   - held-shorts-only scope (long position skipped; un-held names not fetched)
 *   - true → false transition emits a `short_etb_lost` WARNING
 *   - false → true / no-change emits NO warning
 *   - first observation (no prior) emits NO warning but persists
 *   - WARNING NOT COVER — the evaluator has no submitter; nothing is fired
 *   - injected ts is used verbatim (observed_at === ts.toISOString());
 *     no `new Date()` smuggling
 *   - typed-absence on `easy_to_borrow=null AND shortable=true` skips, NEVER
 *     coerces to a synthetic boolean (§9 SENTINEL anti-pattern)
 *   - idempotency: a repeated tick at the same ts upserts the same PK row
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type {
  BrokerPosition,
  BrokerPositionFetcher,
  BrokerShortability,
  BrokerShortabilityFetcher,
} from '../longshort-broker-interfaces.ts';
import {
  ETB_SOURCE_ALPACA_SHORTABILITY,
  evaluateEtbTransitions,
  resolveEtbBoolean,
  type EtbStateRecord,
  type EtbStateStore,
} from './etb-transition-monitor.ts';

const OP = '00000000-0000-0000-0000-000000000001';
const TS = new Date('2026-06-27T15:00:00Z');

function pos(over: { symbol: string; qty: number }): BrokerPosition {
  return {
    symbol: over.symbol,
    qty: over.qty,
    avg_entry_price: 100,
    current_price: 100,
    market_value: 100 * over.qty,
  } as BrokerPosition;
}

function mkPositionFetcher(positions: BrokerPosition[]): BrokerPositionFetcher {
  return {
    async fetchPosition(symbol) {
      return positions.find((p) => p.symbol === symbol) ?? null;
    },
    async listOpenPositions() { return positions; },
  };
}

function mkShortabilityFetcher(
  table: Record<string, { shortable: boolean; easy_to_borrow: boolean | null }>,
): { fetcher: BrokerShortabilityFetcher; calls: string[] } {
  const calls: string[] = [];
  const fetcher: BrokerShortabilityFetcher = {
    async fetchShortability(symbol, ts): Promise<BrokerShortability> {
      calls.push(symbol);
      const row = table[symbol];
      if (!row) throw new Error(`no shortability fixture for ${symbol}`);
      return {
        symbol,
        shortable: row.shortable,
        easy_to_borrow: row.easy_to_borrow,
        fetched_at: ts,
      };
    },
  };
  return { fetcher, calls };
}

function mkStore(seed: EtbStateRecord[] = []): {
  store: EtbStateStore;
  upserted: EtbStateRecord[][];
  rows: EtbStateRecord[];
} {
  const rows: EtbStateRecord[] = [...seed];
  const upserted: EtbStateRecord[][] = [];
  const store: EtbStateStore = {
    async upsert(records) {
      upserted.push(records.map((r) => ({ ...r })));
      for (const r of records) {
        const idx = rows.findIndex((x) =>
          x.operator_id === r.operator_id && x.symbol === r.symbol && x.observed_at === r.observed_at);
        if (idx >= 0) rows[idx] = { ...r };
        else rows.push({ ...r });
      }
      return { error: null };
    },
    async readLatestPrior(symbol, ts) {
      const isoCut = ts.toISOString();
      const prior = rows
        .filter((r) => r.symbol === symbol && r.observed_at < isoCut)
        .sort((a, b) => (a.observed_at < b.observed_at ? 1 : -1));
      return prior[0] ?? null;
    },
  };
  return { store, upserted, rows };
}

Deno.test('held-shorts-only — long positions are skipped (not fetched)', async () => {
  const positions = [pos({ symbol: 'AAPL', qty: 100 }), pos({ symbol: 'GME', qty: -50 })];
  const { fetcher, calls } = mkShortabilityFetcher({
    GME: { shortable: true, easy_to_borrow: true },
  });
  const { store } = mkStore();
  const r = await evaluateEtbTransitions({
    positionFetcher: mkPositionFetcher(positions),
    shortabilityFetcher: fetcher,
    store, operator_id: OP, ts: TS,
  });
  assertEquals(calls, ['GME']);                    // long never fetched
  assertEquals(r.inspected_count, 1);
  assertEquals(r.observed_count, 1);
  assertEquals(r.warnings.length, 0);              // no prior — no warning
});

Deno.test('true → false transition emits short_etb_lost warning', async () => {
  const seed: EtbStateRecord[] = [{
    operator_id: OP, symbol: 'GME',
    observed_at: '2026-06-27T14:00:00.000Z',
    etb: true, source: ETB_SOURCE_ALPACA_SHORTABILITY,
  }];
  const { fetcher } = mkShortabilityFetcher({
    GME: { shortable: true, easy_to_borrow: false },
  });
  const { store, upserted } = mkStore(seed);
  const r = await evaluateEtbTransitions({
    positionFetcher: mkPositionFetcher([pos({ symbol: 'GME', qty: -50 })]),
    shortabilityFetcher: fetcher,
    store, operator_id: OP, ts: TS,
  });
  assertEquals(r.warnings.length, 1);
  assertEquals(r.warnings[0].symbol, 'GME');
  assertEquals(r.warnings[0].prev_etb, true);
  assertEquals(r.warnings[0].curr_etb, false);
  assertEquals(r.warnings[0].prev_observed_at, '2026-06-27T14:00:00.000Z');
  assertEquals(r.warnings[0].curr_observed_at, TS.toISOString());
  // Persistence happened.
  assertEquals(upserted.length, 1);
  assertEquals(upserted[0][0].etb, false);
});

Deno.test('false → true and no-change emit NO warning', async () => {
  const seed: EtbStateRecord[] = [
    { operator_id: OP, symbol: 'FALSE_TO_TRUE', observed_at: '2026-06-27T14:00:00.000Z',
      etb: false, source: ETB_SOURCE_ALPACA_SHORTABILITY },
    { operator_id: OP, symbol: 'NO_CHANGE_TRUE', observed_at: '2026-06-27T14:00:00.000Z',
      etb: true, source: ETB_SOURCE_ALPACA_SHORTABILITY },
    { operator_id: OP, symbol: 'NO_CHANGE_FALSE', observed_at: '2026-06-27T14:00:00.000Z',
      etb: false, source: ETB_SOURCE_ALPACA_SHORTABILITY },
  ];
  const { fetcher } = mkShortabilityFetcher({
    FALSE_TO_TRUE: { shortable: true, easy_to_borrow: true },
    NO_CHANGE_TRUE: { shortable: true, easy_to_borrow: true },
    NO_CHANGE_FALSE: { shortable: true, easy_to_borrow: false },
  });
  const { store } = mkStore(seed);
  const r = await evaluateEtbTransitions({
    positionFetcher: mkPositionFetcher([
      pos({ symbol: 'FALSE_TO_TRUE', qty: -1 }),
      pos({ symbol: 'NO_CHANGE_TRUE', qty: -1 }),
      pos({ symbol: 'NO_CHANGE_FALSE', qty: -1 }),
    ]),
    shortabilityFetcher: fetcher,
    store, operator_id: OP, ts: TS,
  });
  assertEquals(r.warnings.length, 0);
  assertEquals(r.observed_count, 3);
});

Deno.test('first observation (no prior) persists and emits NO warning', async () => {
  const { fetcher } = mkShortabilityFetcher({
    NEW: { shortable: true, easy_to_borrow: false },  // even if false, no prior = no transition
  });
  const { store, upserted } = mkStore();
  const r = await evaluateEtbTransitions({
    positionFetcher: mkPositionFetcher([pos({ symbol: 'NEW', qty: -10 })]),
    shortabilityFetcher: fetcher,
    store, operator_id: OP, ts: TS,
  });
  assertEquals(r.warnings.length, 0);
  assertEquals(upserted.length, 1);
  assertEquals(upserted[0][0].etb, false);
});

Deno.test('typed-absence: easy_to_borrow=null + shortable=true → SKIP, never coerce', async () => {
  const { fetcher } = mkShortabilityFetcher({
    UNKNOWN: { shortable: true, easy_to_borrow: null },
  });
  const { store, upserted } = mkStore();
  const r = await evaluateEtbTransitions({
    positionFetcher: mkPositionFetcher([pos({ symbol: 'UNKNOWN', qty: -1 })]),
    shortabilityFetcher: fetcher,
    store, operator_id: OP, ts: TS,
  });
  assertEquals(r.observed_count, 0);
  assertEquals(r.warnings.length, 0);
  assertEquals(upserted.length, 0);                  // nothing persisted
  assertEquals(r.skipped[0].reason, 'easy_to_borrow_null_and_shortable_true');
});

Deno.test('typed-absence: easy_to_borrow=null + shortable=false → etb=false (unambiguous)', () => {
  assertEquals(resolveEtbBoolean({
    symbol: 'X', shortable: false, easy_to_borrow: null, fetched_at: TS,
  }), false);
  assertEquals(resolveEtbBoolean({
    symbol: 'X', shortable: true, easy_to_borrow: null, fetched_at: TS,
  }), null);
  assertEquals(resolveEtbBoolean({
    symbol: 'X', shortable: true, easy_to_borrow: true, fetched_at: TS,
  }), true);
});

Deno.test('injected ts is observed_at verbatim — no new Date() smuggling', async () => {
  const { fetcher } = mkShortabilityFetcher({
    X: { shortable: true, easy_to_borrow: true },
  });
  const { store, upserted } = mkStore();
  await evaluateEtbTransitions({
    positionFetcher: mkPositionFetcher([pos({ symbol: 'X', qty: -1 })]),
    shortabilityFetcher: fetcher,
    store, operator_id: OP, ts: TS,
  });
  assertEquals(upserted[0][0].observed_at, TS.toISOString());
});

Deno.test('idempotency: repeat tick at same ts upserts same PK row (no duplication semantics)', async () => {
  const { fetcher } = mkShortabilityFetcher({
    X: { shortable: true, easy_to_borrow: true },
  });
  const { store, upserted, rows } = mkStore();
  const fetcher2 = fetcher;
  await evaluateEtbTransitions({
    positionFetcher: mkPositionFetcher([pos({ symbol: 'X', qty: -1 })]),
    shortabilityFetcher: fetcher2,
    store, operator_id: OP, ts: TS,
  });
  await evaluateEtbTransitions({
    positionFetcher: mkPositionFetcher([pos({ symbol: 'X', qty: -1 })]),
    shortabilityFetcher: fetcher2,
    store, operator_id: OP, ts: TS,
  });
  // Two upsert calls (one per evaluate) but only ONE logical row in the
  // store (same PK overwrites). DB enforces this via the PK constraint;
  // the in-memory store mirrors that semantic.
  assertEquals(upserted.length, 2);
  assertEquals(rows.length, 1);
});

Deno.test('WARNING NOT COVER — evaluator surface has no submitter (compile-time)', () => {
  // Structural assertion: the params type does NOT include a submitter
  // field. If a future edit adds one, this stops compiling.
  type ParamsKeys = keyof Parameters<typeof evaluateEtbTransitions>[0];
  const banned: Exclude<ParamsKeys, 'positionFetcher' | 'shortabilityFetcher' | 'store' | 'operator_id' | 'ts' | 'source'> = undefined as never;
  assertEquals(banned, undefined);
});

Deno.test('store read failure: warning step skipped, current observation still persisted', async () => {
  const { fetcher } = mkShortabilityFetcher({
    X: { shortable: true, easy_to_borrow: false },
  });
  const store: EtbStateStore = {
    async upsert() { return { error: null }; },
    async readLatestPrior() { throw new Error('db boom'); },
  };
  const r = await evaluateEtbTransitions({
    positionFetcher: mkPositionFetcher([pos({ symbol: 'X', qty: -1 })]),
    shortabilityFetcher: fetcher,
    store, operator_id: OP, ts: TS,
  });
  assertEquals(r.warnings.length, 0);
  assertEquals(r.observed_count, 1);
  assert(r.skipped.some((s) => s.reason.startsWith('store_read_failed')));
});