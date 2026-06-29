/**
 * settlement-reconciler_test — FP-061 sub-step 4M.2 / ACT-377 unit tests.
 *
 * Covers:
 *   (1) Reconciler flips pending → settled + stamps `settled_at` when
 *       `as_of >= expected_settlement_ts` (T+1 elapsed).
 *   (2) Reconciler LEAVES pending untouched when `as_of < expected` (pre-T+1).
 *   (3) verify_settlement_status reader returns the three contract outcomes
 *       under the internal-source fetcher adapter:
 *           settled            → false_positive_within_tolerance
 *           pre-T+1 unsettled  → expected_divergence_handled  (NOT failure)
 *           post-T+1 unsettled → failure_escalated             (Zero-tolerance)
 *   (4) Injected-clock invariant: no Date.now() leakage — reconciler stamps
 *       use the injected as_of verbatim.
 *   (5) §7 BP-read settled-vs-unsettled: UnsettledCashReader sums
 *       `cost_basis * qty` over pending lots, excludes settled lots.
 *
 * In-memory fakes mirror the `lot-ledger-writer_test.ts` pattern. Deno test runner.
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  runSettlementReconciler,
  type SettlementReconcilerClient,
  type UnsettledCashReader,
} from './settlement-reconciler.ts';
import { createInternalSettlementStatusFetcher } from './internal-settlement-status-fetcher.ts';
import { buildVerifySettlementStatusSpec } from '../longshort-verifiers/verify_settlement_status.ts';
import type { BrokerSettlementStatus } from '../longshort-broker-interfaces.ts';

const OP = '00000000-0000-0000-0000-000000000001';

type LotRow = {
  lot_id: string;
  operator_id: string;
  symbol: string;
  side: 'long' | 'short';
  status: string;
  qty: number;
  cost_basis: number;
  entry_ts: string;
  settlement_state: string;
  expected_settlement_ts: string | null;
  settled_at: string | null;
};

function makeReconClient(rows: LotRow[]): SettlementReconcilerClient {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(opCol: string, opVal: string) {
              return {
                eq(stateCol: string, stateVal: string) {
                  return {
                    lte(_tsCol: string, tsVal: string) {
                      const out = rows.filter((r) => {
                        if (r[opCol as keyof LotRow] !== opVal) return false;
                        if (r[stateCol as keyof LotRow] !== stateVal) return false;
                        if (r.expected_settlement_ts == null) return false;
                        return r.expected_settlement_ts <= tsVal;
                      }).map((r) => ({
                        lot_id: r.lot_id,
                        symbol: r.symbol,
                        expected_settlement_ts: r.expected_settlement_ts,
                      }));
                      return Promise.resolve({ data: out, error: null });
                    },
                  };
                },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            in(col: string, vals: readonly string[]) {
              return {
                select(_cols: string) {
                  const written: Array<Record<string, unknown>> = [];
                  for (const r of rows) {
                    if (vals.includes(r[col as keyof LotRow] as string)) {
                      r.settlement_state = String(patch.settlement_state);
                      r.settled_at = String(patch.settled_at);
                      written.push({
                        lot_id: r.lot_id,
                        symbol: r.symbol,
                        expected_settlement_ts: r.expected_settlement_ts,
                        settled_at: r.settled_at,
                      });
                    }
                  }
                  return Promise.resolve({ data: written, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
}

function mkRow(overrides: Partial<LotRow> & { lot_id: string }): LotRow {
  return {
    operator_id: OP,
    symbol: 'AAPL',
    side: 'long',
    status: 'open',
    qty: 10,
    cost_basis: 100,
    entry_ts: '2026-01-01T15:30:00Z',
    settlement_state: 'pending',
    expected_settlement_ts: '2026-01-02T15:30:00Z',
    settled_at: null,
    ...overrides,
  };
}

// ── AC-1: reconciler flips pending → settled when as_of >= expected_settlement_ts.
Deno.test('AC-1: reconciler flips pending → settled + stamps settled_at when T+1 elapsed', async () => {
  const rows: LotRow[] = [
    mkRow({ lot_id: 'a', expected_settlement_ts: '2026-01-02T15:30:00Z' }),
    mkRow({ lot_id: 'b', expected_settlement_ts: '2026-01-02T15:30:00Z' }),
  ];
  const as_of = new Date('2026-01-03T00:00:00Z'); // > expected
  const result = await runSettlementReconciler({
    as_of, operator_id: OP, client: makeReconClient(rows),
  });
  assertEquals(result.flipped, 2);
  assertEquals(rows.every((r) => r.settlement_state === 'settled'), true);
  // Injected-as_of stamp invariant — settled_at equals the injected as_of byte-for-byte.
  assertEquals(rows[0].settled_at, as_of.toISOString());
  assertEquals(rows[1].settled_at, as_of.toISOString());
  assertEquals(result.settled_rows.length, 2);
});

// ── AC-2: reconciler leaves pending untouched when as_of < expected (pre-T+1).
Deno.test('AC-2: reconciler leaves pending pre-T+1 (no flip when as_of < expected)', async () => {
  const rows: LotRow[] = [
    mkRow({ lot_id: 'a', expected_settlement_ts: '2026-01-02T15:30:00Z' }),
  ];
  const as_of = new Date('2026-01-02T10:00:00Z'); // before expected
  const result = await runSettlementReconciler({
    as_of, operator_id: OP, client: makeReconClient(rows),
  });
  assertEquals(result.flipped, 0);
  assertEquals(rows[0].settlement_state, 'pending');
  assertEquals(rows[0].settled_at, null);
});

// ── AC-3a: verify_settlement_status — settled → false_positive_within_tolerance.
Deno.test('AC-3a: verifier — settled lot returns FPWT via internal fetcher', async () => {
  const rows: LotRow[] = [
    mkRow({
      lot_id: 'a',
      settlement_state: 'settled',
      settled_at: '2026-01-03T00:00:00Z',
      expected_settlement_ts: '2026-01-02T15:30:00Z',
    }),
  ];
  const fetcher = createInternalSettlementStatusFetcher({
    client: makeInternalClient(rows),
  });
  const spec = buildVerifySettlementStatusSpec({ symbol: 'AAPL', side: 'long', operator_id: OP });
  const observed = await fetcher.fetchSettlementStatus(
    'AAPL', 'long', new Date('2026-01-01T15:30:00Z'), new Date('2026-01-03T01:00:00Z'),
  );
  const div = spec.compute_divergence!(null, observed);
  const outcome = spec.classify_outcome!(div, spec.tolerance);
  assertEquals(outcome, 'false_positive_within_tolerance');
});

// ── AC-3b: verifier — pre-T+1 unsettled → expected_divergence_handled (NOT failure).
Deno.test('AC-3b: verifier — pre-T+1 unsettled → expected_divergence_handled', async () => {
  const rows: LotRow[] = [
    mkRow({ lot_id: 'a', settlement_state: 'pending', expected_settlement_ts: '2026-01-02T15:30:00Z' }),
  ];
  const fetcher = createInternalSettlementStatusFetcher({ client: makeInternalClient(rows) });
  const spec = buildVerifySettlementStatusSpec({ symbol: 'AAPL', side: 'long', operator_id: OP });
  const observed = await fetcher.fetchSettlementStatus(
    'AAPL', 'long', new Date('2026-01-01T15:30:00Z'), new Date('2026-01-02T10:00:00Z'), // before expected
  );
  const div = spec.compute_divergence!(null, observed) as { pre_t1_window: boolean; hours_past_expected: number };
  assertEquals(div.pre_t1_window, true);
  // hours_past_expected must be NEGATIVE pre-T+1.
  assertEquals(div.hours_past_expected < 0, true);
  const outcome = spec.classify_outcome!(div, spec.tolerance);
  assertEquals(outcome, 'expected_divergence_handled');
});

// ── AC-3c: verifier — post-T+1 unsettled → failure_escalated.
Deno.test('AC-3c: verifier — post-T+1 unsettled → failure_escalated (Zero-tolerance per §11.0.9 line 235)', async () => {
  const rows: LotRow[] = [
    mkRow({ lot_id: 'a', settlement_state: 'pending', expected_settlement_ts: '2026-01-02T15:30:00Z' }),
  ];
  const fetcher = createInternalSettlementStatusFetcher({ client: makeInternalClient(rows) });
  const spec = buildVerifySettlementStatusSpec({ symbol: 'AAPL', side: 'long', operator_id: OP });
  const observed = await fetcher.fetchSettlementStatus(
    'AAPL', 'long', new Date('2026-01-01T15:30:00Z'), new Date('2026-01-03T20:00:00Z'), // post expected
  );
  const div = spec.compute_divergence!(null, observed) as { pre_t1_window: boolean; hours_past_expected: number };
  assertEquals(div.pre_t1_window, false);
  assertEquals(div.hours_past_expected > 0, true);
  const outcome = spec.classify_outcome!(div, spec.tolerance);
  assertEquals(outcome, 'failure_escalated');
});

// ── AC-4: BP-read settled-vs-unsettled — UnsettledCashReader sums pending only.
Deno.test('AC-4: §7 BP-read — unsettled cash sums pending lots, excludes settled', async () => {
  const rows: LotRow[] = [
    mkRow({ lot_id: 'a', qty: 10, cost_basis: 100, settlement_state: 'pending' }),  // 1000 deployed
    mkRow({ lot_id: 'b', qty: 5,  cost_basis: 200, settlement_state: 'pending' }),  // 1000 deployed
    mkRow({ lot_id: 'c', qty: 10, cost_basis: 50,  settlement_state: 'settled' }),  // excluded
  ];
  const reader: UnsettledCashReader = {
    async readUnsettledDeployedCash(operator_id: string) {
      let total = 0;
      for (const r of rows) {
        if (r.operator_id === operator_id && r.status === 'open' && r.settlement_state === 'pending') {
          total += Math.abs(r.qty * r.cost_basis);
        }
      }
      return total;
    },
  };
  const total = await reader.readUnsettledDeployedCash(OP);
  assertEquals(total, 2000);
});

// ─── helpers for the internal fetcher's read shape ───────────────────────

type InternalClient = Parameters<typeof createInternalSettlementStatusFetcher>[0] extends { client?: infer C } | undefined
  ? C
  : never;

function makeInternalClient(rows: LotRow[]): NonNullable<InternalClient> {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(symCol: string, symVal: string) {
              return {
                eq(sideCol: string, sideVal: string) {
                  return {
                    order(_col: string, _opts: { ascending: boolean }) {
                      return {
                        limit(_n: number) {
                          const out = rows
                            .filter((r) => r[symCol as keyof LotRow] === symVal && r[sideCol as keyof LotRow] === sideVal)
                            .map((r) => ({
                              symbol: r.symbol,
                              side: r.side,
                              entry_ts: r.entry_ts,
                              settlement_state: r.settlement_state,
                              expected_settlement_ts: r.expected_settlement_ts,
                            }));
                          return Promise.resolve({ data: out.slice(0, 1), error: null });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

// Silence "unused" until consumed at runtime above.
void ({} as BrokerSettlementStatus);