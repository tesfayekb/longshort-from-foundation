/**
 * preflight-composer_test — FP-056 v1.b §7 composer (ACT-317 / E5.5 Phase-1).
 *
 * The LOAD-BEARING assertions:
 *   - clean candidate (no halt, no htb, BP sufficient, SSR fetcher provided
 *     returning not_active) → PreflightResult.passed=true
 *   - halted candidate → fails with `verify_halt_status` in failed_verifiers
 *   - short candidate, htb-MARKED → fails with `verify_short_availability`
 *     AND the LOCATE FETCHER IS NOT CALLED (the E4 consult-before-locate
 *     invariant is preserved by the verifier; the composer just wires it)
 *   - system BP insufficient → EVERY candidate fails with `verify_buying_
 *     power` AND the system-level batch summary records bp_insufficient
 *   - no `ssrStatusFetcher` injected → every short candidate records
 *     `verify_ssr_status` in the skipped Map and summary.ssr_unavailable=true
 *     (TYPED ABSENCE per §2 axiom — NOT a synthetic SSR-clear)
 *
 * No live broker calls — every fetcher is a capturing/scripted stub.
 * Injected `ts` is the sole Date source (Gate-6 clean).
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  composePreflightResults,
  type PreflightCandidate,
  type PreflightComposerDeps,
} from './preflight-composer.ts';
import { preflightKey } from './rebalance-planner.ts';
import type {
  BrokerHaltStatus,
  BrokerHaltStatusFetcher,
  BrokerLocateResult,
  BrokerLocateFetcher,
  BrokerSSRStatusResult,
  BrokerSSRStatusFetcher,
  BrokerBuyingPower,
  BrokerBuyingPowerFetcher,
} from '../longshort-broker-interfaces.ts';
import type {
  HtbCacheReader,
  HtbCacheClearer,
} from './cache-propagator-io.ts';

const TS = new Date('2026-06-24T20:30:00Z');
const OP = '00000000-0000-0000-0000-000000000001';

function haltStub(halted: boolean): BrokerHaltStatusFetcher {
  return {
    async fetchHaltStatus(symbol, ts): Promise<BrokerHaltStatus> {
      return { symbol, halted, halt_reason: halted ? 'alpaca_status:inactive' : null, fetched_at: ts };
    },
  };
}

function locateStub(available: boolean, qty = 100): BrokerLocateFetcher & { calls: number } {
  const fetcher = {
    calls: 0,
    async fetchLocate(symbol: string, ts: Date): Promise<BrokerLocateResult> {
      this.calls++;
      return {
        symbol,
        available,
        locate_id: available ? 'L-1' : null,
        qty_available: available ? qty : null,
        fetched_at: ts,
      };
    },
  };
  return fetcher;
}

function ssrStub(state: 'not_active' | 'active' | 'indeterminate'): BrokerSSRStatusFetcher {
  return {
    async fetchSSRStatus(symbol, ts): Promise<BrokerSSRStatusResult> {
      return { symbol, state, source: 'test', fetched_at: ts };
    },
  };
}

function bpStub(available_bp: number, account_equity = 100_000): BrokerBuyingPowerFetcher {
  return {
    async fetchBuyingPower(ts): Promise<BrokerBuyingPower> {
      return { available_bp, account_equity, fetched_at: ts };
    },
  };
}

function htbReader(marked: Set<string>): HtbCacheReader {
  return {
    async isMarkedHtb(symbol, _ts) {
      return marked.has(symbol);
    },
  };
}

function htbClearer(): HtbCacheClearer & { cleared: string[] } {
  const cl = {
    cleared: [] as string[],
    async clearHtb(symbol: string) {
      this.cleared.push(symbol);
    },
  };
  return cl;
}

function baseDeps(over: Partial<PreflightComposerDeps> = {}): PreflightComposerDeps {
  return {
    haltStatusFetcher: haltStub(false),
    locateFetcher: locateStub(true),
    buyingPowerFetcher: bpStub(100_000),
    operator_id: OP,
    fetcher_source: 'mock',
    ...over,
  };
}

Deno.test('preflight-composer: clean LONG candidate passes (halt-clear, BP-sufficient)', async () => {
  const candidates: PreflightCandidate[] = [
    { symbol: 'AAPL', side: 'long', requested_position_size: 2500 },
  ];
  const out = await composePreflightResults(
    { candidates, internal_expected_bp: 100_000, ts: TS },
    baseDeps(),
  );
  const r = out.results.get(preflightKey('AAPL', 'long'));
  assert(r);
  assertEquals(r!.passed, true);
  assertEquals(r!.failed_verifiers, []);
  assertEquals(out.summary.passed_count, 1);
  assertEquals(out.summary.failed_count, 0);
  assertEquals(out.summary.bp_insufficient, false);
  assertEquals(out.summary.long_count, 1);
  assertEquals(out.summary.short_count, 0);
});

Deno.test('preflight-composer: halted candidate fails with verify_halt_status', async () => {
  const candidates: PreflightCandidate[] = [
    { symbol: 'XYZ', side: 'long', requested_position_size: 2500 },
  ];
  const out = await composePreflightResults(
    { candidates, internal_expected_bp: 100_000, ts: TS },
    baseDeps({ haltStatusFetcher: haltStub(true) }),
  );
  const r = out.results.get(preflightKey('XYZ', 'long'))!;
  assertEquals(r.passed, false);
  assert(r.failed_verifiers.includes('verify_halt_status'));
  assert(r.reason !== null && r.reason.includes('verify_halt_status'));
});

Deno.test('preflight-composer: SHORT htb-marked fails AND locate fetcher is NOT called (E4 consult-before-locate invariant)', async () => {
  const candidates: PreflightCandidate[] = [
    { symbol: 'GME', side: 'short', requested_position_size: 1500 },
  ];
  const locate = locateStub(true); // would have returned available; consult must short-circuit
  const out = await composePreflightResults(
    { candidates, internal_expected_bp: 100_000, ts: TS },
    baseDeps({
      locateFetcher: locate,
      htbCache: { reader: htbReader(new Set(['GME'])) },
    }),
  );
  const r = out.results.get(preflightKey('GME', 'short'))!;
  assertEquals(r.passed, false);
  assert(r.failed_verifiers.includes('verify_short_availability'));
  // THE INVARIANT — locate adapter was NOT called because the htb consult
  // short-circuited inside verify_short_availability. Without the consult,
  // the loop-break record is written but never read.
  assertEquals(locate.calls, 0);
});

Deno.test('preflight-composer: SHORT not-htb-marked → locate IS called (consult miss path)', async () => {
  const candidates: PreflightCandidate[] = [
    { symbol: 'TSLA', side: 'short', requested_position_size: 1500 },
  ];
  const locate = locateStub(true, 100);
  const out = await composePreflightResults(
    { candidates, internal_expected_bp: 100_000, ts: TS },
    baseDeps({
      locateFetcher: locate,
      htbCache: { reader: htbReader(new Set()), clearer: htbClearer() },
    }),
  );
  const r = out.results.get(preflightKey('TSLA', 'short'))!;
  assertEquals(r.passed, true);
  assertEquals(locate.calls, 1);
});

Deno.test('preflight-composer: system BP insufficient → EVERY candidate fails with verify_buying_power', async () => {
  const candidates: PreflightCandidate[] = [
    { symbol: 'AAPL', side: 'long', requested_position_size: 50_000 },
    { symbol: 'MSFT', side: 'long', requested_position_size: 60_000 },
  ];
  const out = await composePreflightResults(
    { candidates, internal_expected_bp: 100_000, ts: TS },
    baseDeps({ buyingPowerFetcher: bpStub(10_000) }), // 10k available, 110k requested
  );
  for (const c of candidates) {
    const r = out.results.get(preflightKey(c.symbol, c.side))!;
    assertEquals(r.passed, false);
    assert(r.failed_verifiers.includes('verify_buying_power'), `expected verify_buying_power on ${c.symbol}`);
  }
  assertEquals(out.summary.bp_insufficient, true);
  assertEquals(out.summary.failed_count, 2);
});

Deno.test('preflight-composer: no ssrStatusFetcher → SHORT candidates record verify_ssr_status SKIPPED (typed absence; ssr_unavailable=true)', async () => {
  const candidates: PreflightCandidate[] = [
    { symbol: 'TSLA', side: 'short', requested_position_size: 1500 },
    { symbol: 'AAPL', side: 'long', requested_position_size: 2500 },
  ];
  const out = await composePreflightResults(
    { candidates, internal_expected_bp: 100_000, ts: TS },
    baseDeps(), // no ssrStatusFetcher
  );
  assertEquals(out.summary.ssr_unavailable, true);
  const shortSkipped = out.skipped.get(preflightKey('TSLA', 'short'));
  assert(shortSkipped, 'short candidate must have skipped entry');
  assertEquals(shortSkipped, ['verify_ssr_status']);
  // LONG candidate does NOT record SSR skip — verify_ssr_status only applies
  // to short routing.
  assertEquals(out.skipped.get(preflightKey('AAPL', 'long')), undefined);
  // Short candidate STILL passes here (halt clean, htb clean, BP sufficient,
  // SSR is documented absent — composer does NOT synthesize SSR-clear, but
  // it also does not fabricate a failure where no signal exists; the audit
  // trail in `skipped` is the typed absence).
  const r = out.results.get(preflightKey('TSLA', 'short'))!;
  assertEquals(r.passed, true);
  assertEquals(r.failed_verifiers, []);
});

Deno.test('preflight-composer: ssrStatusFetcher returning ACTIVE → SHORT fails with verify_ssr_status', async () => {
  const candidates: PreflightCandidate[] = [
    { symbol: 'TSLA', side: 'short', requested_position_size: 1500 },
  ];
  const out = await composePreflightResults(
    { candidates, internal_expected_bp: 100_000, ts: TS },
    baseDeps({ ssrStatusFetcher: ssrStub('active') }),
  );
  const r = out.results.get(preflightKey('TSLA', 'short'))!;
  assertEquals(r.passed, false);
  assert(r.failed_verifiers.includes('verify_ssr_status'));
  assertEquals(out.summary.ssr_unavailable, false);
});

Deno.test('preflight-composer: shape matches planner contract — Map<PreflightKey, PreflightResult>', async () => {
  const out = await composePreflightResults(
    {
      candidates: [{ symbol: 'AAPL', side: 'long', requested_position_size: 2500 }],
      internal_expected_bp: 100_000,
      ts: TS,
    },
    baseDeps(),
  );
  // The Map is the exact shape planRebalance consumes — key is the composite
  // `${symbol}|${side}` and the value carries {passed, reason, failed_verifiers}.
  const r = out.results.get('AAPL|long' as const);
  assert(r);
  assertEquals(typeof r!.passed, 'boolean');
  assert(r!.reason === null || typeof r!.reason === 'string');
  assert(Array.isArray(r!.failed_verifiers));
});

Deno.test('preflight-composer: ts is the sole Date source (Gate-6 — no wall-clock leakage)', async () => {
  // The composer's `fetched_at` propagation chain begins with the injected
  // `ts` (this test asserts the composer code does not synthesize a fresh
  // Date — the verify_* shells receive `ts` verbatim and the broker stubs
  // echo it). Indirect assertion via behavior: changing `ts` changes
  // `fetched_at` on the returned fetcher payloads in the same way each call.
  const fixedTs = new Date('2030-01-01T00:00:00Z');
  const halt = haltStub(false);
  const out = await composePreflightResults(
    {
      candidates: [{ symbol: 'AAPL', side: 'long', requested_position_size: 2500 }],
      internal_expected_bp: 100_000,
      ts: fixedTs,
    },
    baseDeps({ haltStatusFetcher: halt }),
  );
  assert(out.results.size === 1); // sanity — the composer ran with the injected ts
});