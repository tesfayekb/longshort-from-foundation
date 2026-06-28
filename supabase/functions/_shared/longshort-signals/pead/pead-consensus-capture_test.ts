// deno-lint-ignore-file no-import-prefix require-await -- typed mocks + std import (DW-172)
// @ts-nocheck — Deno test file; runs via `deno test`.
/**
 * DW-172 — pead_consensus_observations capture test.
 *
 * Anti-fabrication pins:
 *   - Captured row equals the kernel's inputs_snapshot + sue/sigma_proxy
 *     /trading_days_since byte-for-byte (pure passthrough).
 *   - The 3 typed-absence skip reasons (pead_panel_below_floor /
 *     zero_dispersion / no_recent_earnings) produce NO row.
 *   - Conflict posture is ON CONFLICT DO NOTHING (ignoreDuplicates).
 *   - DB error throws.
 */
import {
  assert,
  assertEquals,
  assertStrictEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computePead } from './compute-pead.ts';
import { capturePeadConsensus } from './pead-consensus-capture.ts';

const AS_OF = new Date('2026-06-08T21:00:00Z');
const PERIOD = new Date('2026-05-01T00:00:00Z');

function makeMockSupabase(error: { message: string } | null = null) {
  const calls: Array<{ table: string; payload: unknown[]; opts: { onConflict?: string; ignoreDuplicates?: boolean } }> = [];
  const supabase: unknown = {
    from(table: string) {
      return {
        upsert(payload: unknown[], opts: { onConflict?: string; ignoreDuplicates?: boolean }) {
          calls.push({ table, payload, opts });
          return Promise.resolve({ error });
        },
      };
    },
  };
  return { supabase, calls };
}

// ── PIN 1: captured row equals compute snapshot + SUE byte-for-byte ────
Deno.test('capturePeadConsensus: row equals compute inputs_snapshot + SUE (real fixture)', async () => {
  const r = computePead({
    epsActual: 1.50, epsAvg: 1.40, epsHigh: 1.55, epsLow: 1.25,
    numberAnalysts: 8, reportPeriodDate: PERIOD, asOf: AS_OF,
  });
  assert(r.kind === 'value');
  if (r.kind !== 'value') return;

  const { supabase, calls } = makeMockSupabase();
  await capturePeadConsensus({
    supabase,
    operator_id: 'op-1',
    signal_id: 'pead_sue_20d',
    as_of_date: '2026-06-08',
    computed_at: AS_OF.toISOString(),
    rows: [{
      ticker: 'XYZ',
      snapshot: {
        report_period_date: '2026-05-01',
        eps_actual: r.inputs_snapshot.epsActual,
        consensus_eps_avg: r.inputs_snapshot.epsAvg,
        eps_high: r.inputs_snapshot.epsHigh,
        eps_low: r.inputs_snapshot.epsLow,
        number_analysts: r.inputs_snapshot.numberAnalysts,
        sigma_proxy: r.sigma_proxy,
        sue: r.sue,
        trading_days_since: r.trading_days_since,
      },
    }],
  });

  assertEquals(calls.length, 1);
  assertStrictEquals(calls[0].table, 'pead_consensus_observations');
  assertStrictEquals(calls[0].opts.onConflict, 'operator_id,signal_id,as_of_date,ticker');
  assertStrictEquals(calls[0].opts.ignoreDuplicates, true);
  assertEquals(calls[0].payload.length, 1);
  const p = calls[0].payload[0] as Record<string, unknown>;
  assertStrictEquals(p.operator_id, 'op-1');
  assertStrictEquals(p.signal_id, 'pead_sue_20d');
  assertStrictEquals(p.as_of_date, '2026-06-08');
  assertStrictEquals(p.ticker, 'XYZ');
  assertStrictEquals(p.report_period_date, '2026-05-01');
  assertStrictEquals(p.eps_actual, 1.50);
  assertStrictEquals(p.consensus_eps_avg, 1.40);
  assertStrictEquals(p.eps_high, 1.55);
  assertStrictEquals(p.eps_low, 1.25);
  assertStrictEquals(p.number_analysts, 8);
  assertStrictEquals(p.sigma_proxy, r.sigma_proxy);
  assertStrictEquals(p.sue, r.sue);
  assertStrictEquals(p.trading_days_since, r.trading_days_since);
  assertStrictEquals(p.computed_at, AS_OF.toISOString());
});

// ── PIN 2: empty rows → NO insert call ────────────────────────────────
Deno.test('capturePeadConsensus: empty rows array makes no DB call', async () => {
  const { supabase, calls } = makeMockSupabase();
  await capturePeadConsensus({
    supabase,
    operator_id: 'op-1', signal_id: 'pead_sue_20d',
    as_of_date: '2026-06-08', computed_at: AS_OF.toISOString(),
    rows: [],
  });
  assertEquals(calls.length, 0);
});

// ── PIN 3: the 3 typed-absence skip reasons produce NO snapshot ───────
// The compute kind:'skip' branch carries NO inputs_snapshot — the
// orchestrator never surfaces a snapshot to capture for these. Confirm
// by computing each skip case and verifying no inputs_snapshot exists.
Deno.test('capturePeadConsensus: pead_panel_below_floor skip yields no snapshot to capture', () => {
  const r = computePead({
    epsActual: 1.50, epsAvg: 1.40, epsHigh: 1.55, epsLow: 1.25,
    numberAnalysts: 1, reportPeriodDate: PERIOD, asOf: AS_OF,
  });
  assert(r.kind === 'skip');
  if (r.kind !== 'skip') return;
  assertStrictEquals(r.reason, 'pead_panel_below_floor');
  assertEquals((r as unknown as { inputs_snapshot?: unknown }).inputs_snapshot, undefined);
});

Deno.test('capturePeadConsensus: zero_dispersion skip yields no snapshot to capture', () => {
  const r = computePead({
    epsActual: 1.50, epsAvg: 1.40, epsHigh: 1.40, epsLow: 1.40,
    numberAnalysts: 8, reportPeriodDate: PERIOD, asOf: AS_OF,
  });
  assert(r.kind === 'skip');
  if (r.kind !== 'skip') return;
  assertStrictEquals(r.reason, 'zero_dispersion');
  assertEquals((r as unknown as { inputs_snapshot?: unknown }).inputs_snapshot, undefined);
});

Deno.test('capturePeadConsensus: no_recent_earnings skip yields no snapshot to capture', () => {
  const r = computePead({
    epsActual: 1.50, epsAvg: 1.40, epsHigh: 1.55, epsLow: 1.25,
    numberAnalysts: 8,
    reportPeriodDate: new Date('2026-01-01T00:00:00Z'),
    asOf: AS_OF,
  });
  assert(r.kind === 'skip');
  if (r.kind !== 'skip') return;
  assertStrictEquals(r.reason, 'no_recent_earnings');
  assertEquals((r as unknown as { inputs_snapshot?: unknown }).inputs_snapshot, undefined);
});

// ── PIN 4: malformed snapshot (defensive) is filtered, not fabricated ─
Deno.test('capturePeadConsensus: non-finite sue is filtered (no row), defensive', async () => {
  const { supabase, calls } = makeMockSupabase();
  await capturePeadConsensus({
    supabase,
    operator_id: 'op-1', signal_id: 'pead_sue_20d',
    as_of_date: '2026-06-08', computed_at: AS_OF.toISOString(),
    rows: [{
      ticker: 'BAD',
      snapshot: {
        report_period_date: '2026-05-01',
        eps_actual: 1.5, consensus_eps_avg: 1.4, eps_high: 1.4, eps_low: 1.4,
        number_analysts: 8, sigma_proxy: 0, sue: Number.NaN, trading_days_since: 5,
      },
    }],
  });
  assertEquals(calls.length, 0);
});

// ── PIN 5: DB error throws ────────────────────────────────────────────
Deno.test('capturePeadConsensus: persistence error throws', async () => {
  const { supabase } = makeMockSupabase({ message: 'boom' });
  let threw = false;
  try {
    await capturePeadConsensus({
      supabase,
      operator_id: 'op-1', signal_id: 'pead_sue_20d',
      as_of_date: '2026-06-08', computed_at: AS_OF.toISOString(),
      rows: [{
        ticker: 'XYZ',
        snapshot: {
          report_period_date: '2026-05-01',
          eps_actual: 1.5, consensus_eps_avg: 1.4, eps_high: 1.55, eps_low: 1.25,
          number_analysts: 8, sigma_proxy: 0.1112, sue: 0.9, trading_days_since: 26,
        },
      }],
    });
  } catch (e) {
    threw = true;
    assert(String(e).includes('pead_consensus_observations'));
  }
  assert(threw, 'expected throw on DB error');
});