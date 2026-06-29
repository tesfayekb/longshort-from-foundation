/**
 * year-end-tax-aggregator_test — FP-061 4M.5b acceptance per FP-061-ADD-01.
 *
 * Synthetic tax year covering:
 *   - 1 Path-A blocked closed lot with §7.8 disallowance applied
 *     (wash_sale_adjustment > 0; net_pnl = realized_pnl + adj)
 *   - 1 Path-B pending-review (closed lot, no disallowance landed;
 *     wash_sale_adjustment = 0; net_pnl = realized_pnl)
 *   - 1 §7.9 trim with NO disallowance (clean partial close;
 *     wash_sale_adjustment = 0)
 *
 * Asserts: Form 8949 row count, sign-aware net_pnl, Schedule D
 * short/long-term totals, anti-phantom injected tax_year_end_ts.
 */

import {
  assertEquals,
  assertAlmostEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  aggregateYearEnd,
  type YearEndAggregatorClient,
} from './year-end-tax-aggregator.ts';
import {
  verifyYearEndTaxRecord,
  BrokerYearEndTaxFetcherNotProvisionedError,
} from '../longshort-verifiers/verify_year_end_tax_record.ts';
import type { BrokerYearEndTaxFetcher } from '../longshort-broker-interfaces.ts';

const OP = '00000000-0000-0000-0000-000000000001';

function makeClient(rows: Array<Record<string, unknown>>): YearEndAggregatorClient {
  return {
    from(_t: string) {
      return {
        select(_c: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                gte(_c1: string, _v1: string) {
                  return {
                    // deno-lint-ignore require-await
                    async lte(_c2: string, _v2: string) {
                      return { data: rows, error: null };
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

Deno.test('4M.5b — synthetic tax year: Path-A blocked + Path-B pending-review + §7.9 trim', async () => {
  // Path A: long closed at $90, basis $100, qty 10 → realized_pnl=-100,
  //   §7.8 disallowance attached 100 → wash_sale_adjustment=100, net_pnl=0.
  //   Held <1y → short-term.
  // Path B: long closed at $80, basis $100, qty 5 → realized_pnl=-100,
  //   broker disagreed; no disallowance applied → wash_sale_adjustment=0,
  //   net_pnl=-100. Held <1y → short-term.
  // §7.9 trim: long closed at $120, basis $100, qty 4 → realized_pnl=+80,
  //   no disallowance → wash_sale_adjustment=0, net_pnl=+80.
  //   Held >1y → long-term.
  const rows: Array<Record<string, unknown>> = [
    {
      lot_id: 'A', symbol: 'AAA', side: 'long', qty: 10, cost_basis: 100,
      entry_ts: '2026-06-01T14:30:00Z', exit_ts: '2026-09-15T14:30:00Z',
      exit_price: 90, realized_pnl: -100, wash_sale_adjustment: 100,
      net_pnl: 0, status: 'closed', operator_id: OP,
    },
    {
      lot_id: 'B', symbol: 'BBB', side: 'long', qty: 5, cost_basis: 100,
      entry_ts: '2026-05-10T14:30:00Z', exit_ts: '2026-10-20T14:30:00Z',
      exit_price: 80, realized_pnl: -100, wash_sale_adjustment: 0,
      net_pnl: -100, status: 'closed', operator_id: OP,
    },
    {
      lot_id: 'C', symbol: 'CCC', side: 'long', qty: 4, cost_basis: 100,
      entry_ts: '2024-12-01T14:30:00Z', exit_ts: '2026-06-15T14:30:00Z',
      exit_price: 120, realized_pnl: 80, wash_sale_adjustment: 0,
      net_pnl: 80, status: 'closed', operator_id: OP,
    },
  ];
  const client = makeClient(rows);
  const agg = await aggregateYearEnd(
    {
      tax_year: 2026,
      tax_year_start_ts: new Date('2026-01-01T00:00:00Z'),
      tax_year_end_ts: new Date('2026-12-31T23:59:59Z'),
      operator_id: OP,
    },
    client,
  );

  assertEquals(agg.rows.length, 3);
  assertEquals(agg.tax_year, 2026);

  // Path A — short-term, net_pnl=0 (loss + disallowance)
  const a = agg.rows.find((r) => r.lot_id === 'A')!;
  assertEquals(a.holding_period, 'short_term');
  assertAlmostEquals(a.gain_loss, 0);
  assertAlmostEquals(a.wash_sale_adjustment, 100);
  assertAlmostEquals(a.proceeds, 900);
  assertAlmostEquals(a.cost_basis, 1000);

  // Path B — short-term, net_pnl=-100 (loss, no disallowance)
  const b = agg.rows.find((r) => r.lot_id === 'B')!;
  assertEquals(b.holding_period, 'short_term');
  assertAlmostEquals(b.gain_loss, -100);
  assertAlmostEquals(b.wash_sale_adjustment, 0);

  // §7.9 trim — long-term gain
  const c = agg.rows.find((r) => r.lot_id === 'C')!;
  assertEquals(c.holding_period, 'long_term');
  assertAlmostEquals(c.gain_loss, 80);

  // Schedule D totals
  assertAlmostEquals(agg.summary.short_term_net_pnl, -100); // 0 + (-100)
  assertAlmostEquals(agg.summary.short_term_wash_sale_adjustment, 100);
  assertAlmostEquals(agg.summary.long_term_net_pnl, 80);
  assertAlmostEquals(agg.summary.long_term_wash_sale_adjustment, 0);
});

Deno.test('4M.5b — aggregator falls back to realized_pnl + adj when net_pnl is null (pre-MIG-142 rows)', async () => {
  const rows: Array<Record<string, unknown>> = [
    {
      lot_id: 'X', symbol: 'XXX', side: 'long', qty: 1, cost_basis: 50,
      entry_ts: '2026-01-02T14:30:00Z', exit_ts: '2026-03-02T14:30:00Z',
      exit_price: 40, realized_pnl: -10, wash_sale_adjustment: 10,
      net_pnl: null, status: 'closed', operator_id: OP,
    },
  ];
  const agg = await aggregateYearEnd(
    {
      tax_year: 2026,
      tax_year_start_ts: new Date('2026-01-01T00:00:00Z'),
      tax_year_end_ts: new Date('2026-12-31T23:59:59Z'),
      operator_id: OP,
    },
    makeClient(rows),
  );
  assertAlmostEquals(agg.rows[0].gain_loss, 0); // -10 + 10
});

Deno.test('4M.5b — operator scoping filters out other operators', async () => {
  const rows: Array<Record<string, unknown>> = [
    {
      lot_id: 'X', symbol: 'XXX', side: 'long', qty: 1, cost_basis: 10,
      entry_ts: '2026-01-01T00:00:00Z', exit_ts: '2026-02-01T00:00:00Z',
      exit_price: 20, realized_pnl: 10, wash_sale_adjustment: 0,
      net_pnl: 10, status: 'closed', operator_id: 'other-op',
    },
  ];
  const agg = await aggregateYearEnd(
    {
      tax_year: 2026,
      tax_year_start_ts: new Date('2026-01-01T00:00:00Z'),
      tax_year_end_ts: new Date('2026-12-31T23:59:59Z'),
      operator_id: OP,
    },
    makeClient(rows),
  );
  assertEquals(agg.rows.length, 0);
});

Deno.test('4M.5b — verify_year_end_tax_record returns not_provisioned when fetcher is null', async () => {
  const agg = await aggregateYearEnd(
    {
      tax_year: 2026,
      tax_year_start_ts: new Date('2026-01-01T00:00:00Z'),
      tax_year_end_ts: new Date('2026-12-31T23:59:59Z'),
      operator_id: OP,
    },
    makeClient([]),
  );
  const res = await verifyYearEndTaxRecord(
    { operator_id: OP, internal: agg },
    null,
    new Date('2027-01-15T00:00:00Z'),
  );
  assertEquals(res.outcome, 'not_provisioned');
  assertEquals(res.tax_year, 2026);
});

Deno.test('4M.5b — verify_year_end_tax_record matches when broker confirm equals internal', async () => {
  const rows: Array<Record<string, unknown>> = [
    {
      lot_id: 'A', symbol: 'AAA', side: 'long', qty: 1, cost_basis: 100,
      entry_ts: '2026-01-01T00:00:00Z', exit_ts: '2026-06-01T00:00:00Z',
      exit_price: 90, realized_pnl: -10, wash_sale_adjustment: 10,
      net_pnl: 0, status: 'closed', operator_id: OP,
    },
  ];
  const agg = await aggregateYearEnd(
    {
      tax_year: 2026,
      tax_year_start_ts: new Date('2026-01-01T00:00:00Z'),
      tax_year_end_ts: new Date('2026-12-31T23:59:59Z'),
      operator_id: OP,
    },
    makeClient(rows),
  );
  const fetcher: BrokerYearEndTaxFetcher = {
    // deno-lint-ignore require-await
    async fetchYearEndTaxRecord(tax_year, ts) {
      return {
        tax_year,
        short_term_proceeds: 90,
        short_term_cost_basis: 100,
        short_term_wash_sale_adjustment: 10,
        short_term_net_pnl: 0,
        long_term_proceeds: 0,
        long_term_cost_basis: 0,
        long_term_wash_sale_adjustment: 0,
        long_term_net_pnl: 0,
        fetched_at: ts,
      };
    },
  };
  const res = await verifyYearEndTaxRecord(
    { operator_id: OP, internal: agg },
    fetcher,
    new Date('2027-01-15T00:00:00Z'),
  );
  assertEquals(res.outcome, 'matched');
});

Deno.test('4M.5b — verify_year_end_tax_record escalates on broker mismatch', async () => {
  const rows: Array<Record<string, unknown>> = [
    {
      lot_id: 'A', symbol: 'AAA', side: 'long', qty: 1, cost_basis: 100,
      entry_ts: '2026-01-01T00:00:00Z', exit_ts: '2026-06-01T00:00:00Z',
      exit_price: 90, realized_pnl: -10, wash_sale_adjustment: 10,
      net_pnl: 0, status: 'closed', operator_id: OP,
    },
  ];
  const agg = await aggregateYearEnd(
    {
      tax_year: 2026,
      tax_year_start_ts: new Date('2026-01-01T00:00:00Z'),
      tax_year_end_ts: new Date('2026-12-31T23:59:59Z'),
      operator_id: OP,
    },
    makeClient(rows),
  );
  const fetcher: BrokerYearEndTaxFetcher = {
    // deno-lint-ignore require-await
    async fetchYearEndTaxRecord(tax_year, ts) {
      return {
        tax_year,
        short_term_proceeds: 90,
        short_term_cost_basis: 100,
        short_term_wash_sale_adjustment: 10,
        short_term_net_pnl: -50, // diverges from internal 0
        long_term_proceeds: 0,
        long_term_cost_basis: 0,
        long_term_wash_sale_adjustment: 0,
        long_term_net_pnl: 0,
        fetched_at: ts,
      };
    },
  };
  const res = await verifyYearEndTaxRecord(
    { operator_id: OP, internal: agg },
    fetcher,
    new Date('2027-01-15T00:00:00Z'),
  );
  assertEquals(res.outcome, 'divergence_escalated');
});

Deno.test('4M.5b — NotProvisionedError surfaces as not_provisioned outcome', async () => {
  const agg = await aggregateYearEnd(
    {
      tax_year: 2026,
      tax_year_start_ts: new Date('2026-01-01T00:00:00Z'),
      tax_year_end_ts: new Date('2026-12-31T23:59:59Z'),
      operator_id: OP,
    },
    makeClient([]),
  );
  const fetcher: BrokerYearEndTaxFetcher = {
    fetchYearEndTaxRecord(tax_year) {
      throw new BrokerYearEndTaxFetcherNotProvisionedError(tax_year);
    },
  };
  const res = await verifyYearEndTaxRecord(
    { operator_id: OP, internal: agg },
    fetcher,
    new Date('2027-01-15T00:00:00Z'),
  );
  assertEquals(res.outcome, 'not_provisioned');
});