// @ts-nocheck — Deno test file.
import {
  assert,
  assertAlmostEquals,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  classifyFlowDirection,
  computeOptionsFlow,
  contractAgeHours,
  daysToExpiration,
  MIN_CONTRACT_VOLUME,
  MIN_DTE_DAYS,
  MIN_QUALIFYING_PRINTS,
  OTM_ATM_DELTA_CAP,
  passesSmartMoneyFilter,
} from './compute-options-flow.ts';
import type { RawOptionContract } from '../shared/tradier-options-chain-fetcher.ts';

const AS_OF = new Date('2026-06-09T20:00:00Z');
const AS_OF_MS = AS_OF.getTime();

function contract(overrides: Partial<RawOptionContract> = {}): RawOptionContract {
  return {
    symbol: 'AAPL260619C00210000',
    underlying: 'AAPL',
    expiration_date: '2026-06-19', // 10 DTE from AS_OF
    strike: 210,
    option_type: 'call',
    bid: 1.00,
    ask: 1.10,
    last: 1.10,
    volume: 200,
    open_interest: 500,
    bid_date: AS_OF_MS - 2 * 60 * 60 * 1000, // 2h old
    ask_date: AS_OF_MS - 1 * 60 * 60 * 1000,
    trade_date: AS_OF_MS - 30 * 60 * 1000,
    greeks: {
      delta: 0.45, // ATM-ish for a call
      gamma: null, theta: null, vega: null, rho: null, phi: null,
      bid_iv: null, mid_iv: null, ask_iv: null, smv_vol: null, updated_at: null,
    },
    ...overrides,
  };
}

// ─── classifyFlowDirection: 4-case LOAD-BEARING sign table ────────────────

Deno.test('classifier: call BUY at ask → +1', () => {
  assertEquals(classifyFlowDirection('call', 1.00, 1.10, 1.10), 1);
  assertEquals(classifyFlowDirection('call', 1.00, 1.10, 1.15), 1); // last > ask
});

Deno.test('classifier: put BUY at ask → −1', () => {
  assertEquals(classifyFlowDirection('put', 1.00, 1.10, 1.10), -1);
  assertEquals(classifyFlowDirection('put', 1.00, 1.10, 1.20), -1);
});

Deno.test('classifier: call SELL at bid → −1', () => {
  assertEquals(classifyFlowDirection('call', 1.00, 1.10, 1.00), -1);
  assertEquals(classifyFlowDirection('call', 1.00, 1.10, 0.95), -1);
});

Deno.test('classifier: put SELL at bid → +1', () => {
  assertEquals(classifyFlowDirection('put', 1.00, 1.10, 1.00), 1);
  assertEquals(classifyFlowDirection('put', 1.00, 1.10, 0.90), 1);
});

Deno.test('classifier: last strictly inside spread → null (not aggressive)', () => {
  assertEquals(classifyFlowDirection('call', 1.00, 1.10, 1.05), null);
  assertEquals(classifyFlowDirection('put', 1.00, 1.10, 1.05), null);
});

Deno.test('classifier: missing/non-positive last → null', () => {
  assertEquals(classifyFlowDirection('call', 1.00, 1.10, null), null);
  assertEquals(classifyFlowDirection('call', 1.00, 1.10, 0), null);
  assertEquals(classifyFlowDirection('call', 1.00, 1.10, -1), null);
});

Deno.test('classifier: zero/null bid blocks sell-side classification', () => {
  // last <= bid path requires bid > 0; otherwise no classification.
  assertEquals(classifyFlowDirection('call', 0, 1.10, 0.5), null);
  assertEquals(classifyFlowDirection('call', null, 1.10, 0.5), null);
});

// ─── daysToExpiration / contractAgeHours / passesSmartMoneyFilter ─────────

Deno.test('daysToExpiration: positive forward, negative past', () => {
  // AS_OF is 2026-06-09T20:00Z; 2026-06-19T00:00Z is 9d4h away = 9.167d.
  assertAlmostEquals(daysToExpiration('2026-06-19', AS_OF), 9.167, 0.01);
  assert(daysToExpiration('2026-06-01', AS_OF) < 0);
});

Deno.test('contractAgeHours: picks most-recent timestamp', () => {
  const age = contractAgeHours(
    AS_OF_MS - 5 * 60 * 60 * 1000,
    AS_OF_MS - 2 * 60 * 60 * 1000,
    AS_OF_MS - 10 * 60 * 60 * 1000,
    AS_OF,
  );
  assertAlmostEquals(age!, 2, 0.01);
});

Deno.test('contractAgeHours: all null → null (no defensible age)', () => {
  assertEquals(contractAgeHours(null, null, null, AS_OF), null);
});

Deno.test('contractAgeHours: future ts clamped to 0', () => {
  const age = contractAgeHours(AS_OF_MS + 60_000, null, null, AS_OF);
  assertEquals(age, 0);
});

Deno.test('filter: boundary — 99 contracts excluded, 100 included', () => {
  assertEquals(passesSmartMoneyFilter(contract({ volume: 99 }), AS_OF), false);
  assertEquals(passesSmartMoneyFilter(contract({ volume: 100 }), AS_OF), true);
  assertEquals(passesSmartMoneyFilter(contract({ volume: MIN_CONTRACT_VOLUME }), AS_OF), true);
});

Deno.test('filter: boundary — 6 DTE excluded, 7+ DTE included', () => {
  // AS_OF = 2026-06-09T20:00Z. Exp midnight UTC:
  //   2026-06-16 → 6.167d (< 7, excluded)
  //   2026-06-17 → 7.167d (≥ 7, included)
  assertEquals(passesSmartMoneyFilter(contract({ expiration_date: '2026-06-16' }), AS_OF), false);
  assertEquals(passesSmartMoneyFilter(contract({ expiration_date: '2026-06-17' }), AS_OF), true);
  assertEquals(MIN_DTE_DAYS, 7);
});

Deno.test('filter: boundary — deep-ITM excluded, ATM included', () => {
  const deepItm = contract({ greeks: { ...contract().greeks!, delta: 0.85 } });
  const atm = contract({ greeks: { ...contract().greeks!, delta: 0.50 } });
  const edge = contract({ greeks: { ...contract().greeks!, delta: OTM_ATM_DELTA_CAP } });
  const justOver = contract({ greeks: { ...contract().greeks!, delta: OTM_ATM_DELTA_CAP + 0.001 } });
  assertEquals(passesSmartMoneyFilter(deepItm, AS_OF), false);
  assertEquals(passesSmartMoneyFilter(atm, AS_OF), true);
  assertEquals(passesSmartMoneyFilter(edge, AS_OF), true);  // ≤ cap
  assertEquals(passesSmartMoneyFilter(justOver, AS_OF), false);
});

Deno.test('filter: deep-ITM put (delta=-0.85) excluded via abs(delta)', () => {
  const deepItmPut = contract({
    option_type: 'put',
    greeks: { ...contract().greeks!, delta: -0.85 },
  });
  assertEquals(passesSmartMoneyFilter(deepItmPut, AS_OF), false);
});

Deno.test('filter: greeks null → excluded (cannot run OTM/ATM filter)', () => {
  assertEquals(passesSmartMoneyFilter(contract({ greeks: null }), AS_OF), false);
});

Deno.test('filter: volume null → excluded (never defaulted to 0)', () => {
  assertEquals(passesSmartMoneyFilter(contract({ volume: null }), AS_OF), false);
});

// ─── computeOptionsFlow: end-to-end + guards ──────────────────────────────

Deno.test('compute: div-by-zero guard — total volume 0 → null (typed-absence)', () => {
  const zeroVol = [
    contract({ volume: 0 }),
    contract({ volume: null }),
  ];
  assertEquals(computeOptionsFlow(zeroVol, AS_OF), null);
});

Deno.test('compute: empty chain → null', () => {
  assertEquals(computeOptionsFlow([], AS_OF), null);
});

Deno.test('compute: < 5 qualifying prints → null (spec missing-data clause)', () => {
  // 4 qualifying call-buy-at-ask contracts; plus 1 high-vol non-aggressive
  // contract to give non-zero total_options_volume.
  const cs: RawOptionContract[] = [];
  for (let i = 0; i < MIN_QUALIFYING_PRINTS - 1; i++) {
    cs.push(contract({ symbol: `X${i}`, volume: 150 }));
  }
  cs.push(contract({ symbol: 'PAD', last: 1.05, volume: 500 })); // mid-spread → not aggressive
  assertEquals(computeOptionsFlow(cs, AS_OF), null);
});

Deno.test('compute: 5 aggressive call-buys → positive raw_signal', () => {
  const cs: RawOptionContract[] = [];
  for (let i = 0; i < 5; i++) {
    cs.push(contract({ symbol: `B${i}`, volume: 200, last: 1.10 })); // last == ask → buy
  }
  const res = computeOptionsFlow(cs, AS_OF);
  assert(res !== null);
  assertEquals(res!.qualifying_count, 5);
  assert(res!.raw_signal > 0, `expected positive, got ${res!.raw_signal}`);
  assertEquals(res!.total_options_volume, 1000);
});

Deno.test('compute: 5 aggressive put-buys → negative raw_signal (sign-table inversion check)', () => {
  const cs: RawOptionContract[] = [];
  for (let i = 0; i < 5; i++) {
    cs.push(contract({
      symbol: `P${i}`,
      option_type: 'put',
      greeks: { ...contract().greeks!, delta: -0.45 },
      volume: 200,
      last: 1.10, // last == ask → put buy → −1
    }));
  }
  const res = computeOptionsFlow(cs, AS_OF);
  assert(res !== null);
  assert(res!.raw_signal < 0, `expected negative, got ${res!.raw_signal}`);
});

Deno.test('compute: equal-and-opposite call-buys vs put-buys → zero (sign cancellation)', () => {
  const cs: RawOptionContract[] = [];
  for (let i = 0; i < 5; i++) {
    cs.push(contract({ symbol: `C${i}`, volume: 200, last: 1.10 }));
    cs.push(contract({
      symbol: `P${i}`, option_type: 'put',
      greeks: { ...contract().greeks!, delta: -0.45 },
      volume: 200, last: 1.10,
    }));
  }
  const res = computeOptionsFlow(cs, AS_OF);
  assert(res !== null);
  assertAlmostEquals(res!.raw_signal, 0, 1e-9);
  assertEquals(res!.qualifying_count, 10);
});

Deno.test('compute: decay derived from per-contract timestamps, not wall-clock', () => {
  // Two identical contracts except for stamp age. Older contract gets
  // smaller decay → smaller absolute contribution.
  const fresh = contract({
    symbol: 'F0', volume: 200, last: 1.10,
    bid_date: AS_OF_MS - 60_000, ask_date: AS_OF_MS - 60_000, trade_date: AS_OF_MS - 60_000,
  });
  const stale = contract({
    symbol: 'S0', volume: 200, last: 1.10,
    bid_date: AS_OF_MS - 48 * 60 * 60 * 1000, // 48h → decay = e^-1 ≈ 0.368
    ask_date: AS_OF_MS - 48 * 60 * 60 * 1000,
    trade_date: AS_OF_MS - 48 * 60 * 60 * 1000,
  });
  // Need 5 qualifying contracts for compute to return non-null; pad with 4 fresh.
  const csFresh = [fresh, fresh, fresh, fresh, fresh];
  const csStale = [stale, fresh, fresh, fresh, fresh];
  const rFresh = computeOptionsFlow(csFresh, AS_OF)!;
  const rStale = computeOptionsFlow(csStale, AS_OF)!;
  assert(rStale.raw_signal < rFresh.raw_signal,
    `stale (${rStale.raw_signal}) should contribute less than fresh (${rFresh.raw_signal})`);
});

Deno.test('compute: contracts with all timestamps null excluded (no defensible age)', () => {
  const noStamp = contract({
    bid_date: null, ask_date: null, trade_date: null,
    volume: 200, last: 1.10,
  });
  // 5 timestamp-less + 1 normal padding: only 1 should qualify → < 5 → null.
  const cs = [noStamp, noStamp, noStamp, noStamp, noStamp, contract({ volume: 200, last: 1.10 })];
  assertEquals(computeOptionsFlow(cs, AS_OF), null);
});