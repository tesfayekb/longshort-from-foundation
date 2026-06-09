// @ts-nocheck — Deno test file.
import {
  assert,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createOptionsFlowOrchestrator,
  pickQualifyingExpiration,
  SIGNAL_ID,
} from './options-flow-orchestrator.ts';
import { SignalComputationError } from '../shared/signal-types.ts';
import type { SignalRow } from '../shared/signal-types.ts';
import type {
  OptionChainResult,
  OptionExpirationsResult,
  RawOptionContract,
} from '../shared/tradier-options-chain-fetcher.ts';

const OPERATOR_ID = '00000000-0000-0000-0000-000000000001';
const AS_OF = new Date('2026-06-09T20:00:00Z');
const AS_OF_DATE = '2026-06-09';
const AS_OF_MS = AS_OF.getTime();
const LATEST_SNAPSHOT = '2026-06-05';

function makeSupabase(opts: {
  universe?: Array<{ ticker: string; gics_sector: string | null }>;
  upsertError?: { message: string } | null;
}) {
  const upsertPayloads: SignalRow[][] = [];
  const universe = opts.universe ?? [];
  const latestDate = universe.length > 0 ? LATEST_SNAPSHOT : null;
  const supabase = {
    from(table: string) {
      if (table === 'universe_membership') {
        let mode: 'latest' | 'rows' = 'rows';
        const builder: Record<string, unknown> = {
          select(cols: string) {
            mode = cols === 'as_of_date' ? 'latest' : 'rows';
            return builder;
          },
          eq() { return builder; },
          order() { return builder; },
          limit() { return resolve(); },
          then(onFul: unknown, onRej: unknown) { return resolve().then(onFul, onRej); },
        };
        const resolve = () => {
          if (mode === 'latest') {
            return Promise.resolve({ data: latestDate ? [{ as_of_date: latestDate }] : [], error: null });
          }
          return Promise.resolve({ data: universe, error: null });
        };
        return builder;
      }
      if (table === 'signal_observations') {
        return {
          upsert(payload: SignalRow[]) {
            upsertPayloads.push(payload);
            return Promise.resolve({
              error: opts.upsertError ?? null,
              count: opts.upsertError ? null : payload.length,
            });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { supabase, upsertPayloads };
}

type TradierBehavior =
  | { kind: 'ok'; expirations: string[]; chain: RawOptionContract[] }
  | { kind: 'unavailable_expirations'; reason: 'subscription_gated' | 'data_unavailable' }
  | { kind: 'unavailable_chain'; reason: 'subscription_gated' | 'data_unavailable'; expirations: string[] }
  | { kind: 'throw'; err: unknown };

function makeTradier(behaviors: Record<string, TradierBehavior>) {
  return {
    async fetchExpirations(ticker: string): Promise<OptionExpirationsResult> {
      const b = behaviors[ticker];
      if (!b) throw new Error(`unexpected ticker ${ticker}`);
      if (b.kind === 'throw') throw b.err;
      if (b.kind === 'unavailable_expirations') {
        return { kind: 'unavailable', reason: b.reason };
      }
      if (b.kind === 'unavailable_chain') {
        return { kind: 'expirations', expirations: b.expirations };
      }
      return { kind: 'expirations', expirations: b.expirations };
    },
    async fetchChain(ticker: string, _expiration: string): Promise<OptionChainResult> {
      const b = behaviors[ticker];
      if (b.kind === 'unavailable_chain') {
        return { kind: 'unavailable', reason: b.reason };
      }
      if (b.kind === 'ok') {
        return { kind: 'chain', contracts: b.chain };
      }
      throw new Error('unreachable');
    },
  };
}

function buyContract(symbol: string, opts: Partial<RawOptionContract> = {}): RawOptionContract {
  return {
    symbol,
    underlying: opts.underlying ?? 'AAPL',
    expiration_date: '2026-06-19',
    strike: 210,
    option_type: 'call',
    bid: 1.00, ask: 1.10, last: 1.10,
    volume: 200, open_interest: 500,
    bid_date: AS_OF_MS - 60_000,
    ask_date: AS_OF_MS - 60_000,
    trade_date: AS_OF_MS - 60_000,
    greeks: {
      delta: 0.45,
      gamma: null, theta: null, vega: null, rho: null, phi: null,
      bid_iv: null, mid_iv: null, ask_iv: null, smv_vol: null, updated_at: null,
    },
    ...opts,
  };
}

function manyBuys(prefix: string, n: number): RawOptionContract[] {
  const out: RawOptionContract[] = [];
  for (let i = 0; i < n; i++) out.push(buyContract(`${prefix}${i}`));
  return out;
}

// ─── pickQualifyingExpiration ─────────────────────────────────────────────

Deno.test('pickQualifyingExpiration: picks first expiration with DTE ≥ 7', () => {
  assertEquals(
    pickQualifyingExpiration(['2026-06-12', '2026-06-15', '2026-06-17', '2026-06-26'], AS_OF),
    '2026-06-17',
  );
});

Deno.test('pickQualifyingExpiration: returns null when none qualify', () => {
  assertEquals(pickQualifyingExpiration(['2026-06-10', '2026-06-12'], AS_OF), null);
  assertEquals(pickQualifyingExpiration([], AS_OF), null);
});

// ─── orchestrator end-to-end ──────────────────────────────────────────────

Deno.test('orchestrator: empty universe → failed/empty_universe', async () => {
  const { supabase } = makeSupabase({ universe: [] });
  const tradier = makeTradier({});
  const orch = createOptionsFlowOrchestrator({
    supabase: supabase as never,
    tradier: tradier as never,
    priceHistory: null as never,
    operator_id: OPERATOR_ID,
  });
  const res = await orch.run(AS_OF);
  assertEquals(res.outcome, 'failed');
  assertEquals(res.failure_reason, 'empty_universe');
  assertEquals(res.signal_id, SIGNAL_ID);
  assertEquals(res.as_of_date, AS_OF_DATE);
});

Deno.test('orchestrator: end-to-end completes; sector z-scores 2 names; emits skips', async () => {
  // Two sector-A names (gives valid z-score pair), one sector-gated ticker
  // for an unavailable expirations branch, one for a no-qualifying-flow.
  const universe = [
    { ticker: 'AAPL', gics_sector: 'Information Technology' },
    { ticker: 'MSFT', gics_sector: 'Information Technology' },
    { ticker: 'TSLA', gics_sector: 'Consumer Discretionary' }, // singleton
    { ticker: 'GATED', gics_sector: 'Energy' },
    { ticker: 'NOFLOW', gics_sector: 'Health Care' },
    { ticker: 'BOOM', gics_sector: 'Financials' },
  ];
  const tradier = makeTradier({
    AAPL: { kind: 'ok', expirations: ['2026-06-17'], chain: manyBuys('A', 6) },
    MSFT: {
      kind: 'ok', expirations: ['2026-06-17'],
      // Negative-flow side: 6 put-buys (last == ask → put buy → −1)
      chain: Array.from({ length: 6 }, (_, i) => buyContract(`M${i}`, {
        option_type: 'put',
        greeks: { ...buyContract('x').greeks!, delta: -0.45 },
      })),
    },
    TSLA: { kind: 'ok', expirations: ['2026-06-17'], chain: manyBuys('T', 6) },
    GATED: { kind: 'unavailable_expirations', reason: 'subscription_gated' },
    NOFLOW: {
      kind: 'ok', expirations: ['2026-06-17'],
      // High volume on contracts that are NOT aggressive (last mid-spread).
      chain: Array.from({ length: 5 }, (_, i) => buyContract(`N${i}`, { last: 1.05 })),
    },
    BOOM: { kind: 'throw', err: new SignalComputationError('tradier_options_chain', 'BOOM', 'HTTP 502') },
  });
  const { supabase, upsertPayloads } = makeSupabase({ universe });
  const orch = createOptionsFlowOrchestrator({
    supabase: supabase as never,
    tradier: tradier as never,
    priceHistory: null as never,
    operator_id: OPERATOR_ID,
    concurrency: 3,
  });
  const res = await orch.run(AS_OF);

  assertEquals(res.outcome, 'completed');
  assertEquals(res.universe_size, 6);
  // AAPL + MSFT z-score within IT sector (2 members → valid).
  // TSLA is singleton → null → singleton_sector skip.
  assertEquals(res.persisted_count, 2);

  // Skip ledger sanity.
  const reasons = res.skipped.map((s) => s.reason).sort();
  assertEquals(reasons, [
    'data_unavailable',  // intentionally not present? actually no — see below
    'fetch_error',       // BOOM
    'no_qualifying_flow', // NOFLOW
    'singleton_sector',  // TSLA
    'subscription_gated', // GATED
  ].filter((r) => r !== 'data_unavailable').sort());
  // Verify each expected reason exactly once.
  const counts: Record<string, number> = {};
  for (const s of res.skipped) counts[s.reason] = (counts[s.reason] ?? 0) + 1;
  assertEquals(counts['subscription_gated'], 1);
  assertEquals(counts['fetch_error'], 1);
  assertEquals(counts['no_qualifying_flow'], 1);
  assertEquals(counts['singleton_sector'], 1);

  // Persistence shape.
  assertEquals(upsertPayloads.length, 1);
  const written = upsertPayloads[0];
  assertEquals(written.length, 2);
  for (const r of written) {
    assertEquals(r.operator_id, OPERATOR_ID);
    assertEquals(r.signal_id, SIGNAL_ID);
    assertEquals(r.as_of_date, AS_OF_DATE);
    assertEquals(r.is_present, true);
    assert(r.value !== null);
  }
  // Within-sector z-scores must sum to ~0 (mean-zero), confirming AAPL+
  // MSFT pair was normalized (and that the put-buy MSFT signal came out
  // OPPOSITE-SIGN of the call-buy AAPL signal — sign-table integrity).
  const sum = (written[0].value as number) + (written[1].value as number);
  assert(Math.abs(sum) < 1e-9, `expected z-score sum ~0, got ${sum}`);
  assert((written.find((r) => r.ticker === 'AAPL')!.value as number) > 0,
    'AAPL (call-buys) should z-score positive');
  assert((written.find((r) => r.ticker === 'MSFT')!.value as number) < 0,
    'MSFT (put-buys) should z-score negative');
});

Deno.test('orchestrator: persistence error → failed/persist_reason', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
  ];
  const tradier = makeTradier({
    AAPL: { kind: 'ok', expirations: ['2026-06-17'], chain: manyBuys('A', 6) },
    MSFT: { kind: 'ok', expirations: ['2026-06-17'], chain: manyBuys('M', 6) },
  });
  const { supabase } = makeSupabase({ universe, upsertError: { message: 'permission denied' } });
  const orch = createOptionsFlowOrchestrator({
    supabase: supabase as never,
    tradier: tradier as never,
    priceHistory: null as never,
    operator_id: OPERATOR_ID,
  });
  const res = await orch.run(AS_OF);
  assertEquals(res.outcome, 'failed');
  assert(res.failure_reason && res.failure_reason.includes('permission denied'));
});

Deno.test('orchestrator: no qualifying expiration → data_unavailable skip', async () => {
  const universe = [
    { ticker: 'AAPL', gics_sector: 'IT' },
    { ticker: 'MSFT', gics_sector: 'IT' },
  ];
  const tradier = makeTradier({
    AAPL: { kind: 'ok', expirations: ['2026-06-11', '2026-06-12'], chain: [] },
    MSFT: { kind: 'ok', expirations: ['2026-06-17'], chain: manyBuys('M', 6) },
  });
  const { supabase } = makeSupabase({ universe });
  const orch = createOptionsFlowOrchestrator({
    supabase: supabase as never,
    tradier: tradier as never,
    priceHistory: null as never,
    operator_id: OPERATOR_ID,
  });
  const res = await orch.run(AS_OF);
  // AAPL → data_unavailable (no DTE≥7); MSFT → singleton (only IT name with value)
  const aapl = res.skipped.find((s) => s.ticker === 'AAPL');
  assertEquals(aapl?.reason, 'data_unavailable');
  assert(aapl?.detail?.includes('DTE'));
});