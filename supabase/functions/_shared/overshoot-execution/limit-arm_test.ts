// L-01 arm — unit tests. Pure module; no DB, no network.

import {
  assert,
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  OVERSHOOT_LIMIT_ARM_A_SLIPPAGE_BPS,
  OVERSHOOT_LIMIT_ARM_B_SLIPPAGE_BPS,
  pickLimitArm,
  slippageBpsForArm,
} from './limit-arm.ts';

Deno.test('L-01: arm A = 50 bps (current ratified), arm B = 40 bps (tighter by 10 bps)', () => {
  assertEquals(OVERSHOOT_LIMIT_ARM_A_SLIPPAGE_BPS, 50);
  assertEquals(OVERSHOOT_LIMIT_ARM_B_SLIPPAGE_BPS, 40);
  assertEquals(OVERSHOOT_LIMIT_ARM_A_SLIPPAGE_BPS - OVERSHOOT_LIMIT_ARM_B_SLIPPAGE_BPS, 10);
  assertEquals(slippageBpsForArm('A'), 50);
  assertEquals(slippageBpsForArm('B'), 40);
});

Deno.test('L-01: pickLimitArm is deterministic for identical inputs (replay-safe)', () => {
  const runId = '11111111-2222-3333-4444-555555555555';
  const a = pickLimitArm(runId, 'AAPL', 0);
  const b = pickLimitArm(runId, 'AAPL', 0);
  assertEquals(a.arm, b.arm);
  assertEquals(a.slippageBps, b.slippageBps);
});

Deno.test('L-01: arm ⇒ slippageBps mapping is enforced by pickLimitArm', () => {
  const runId = 'run-xyz';
  for (const ticker of ['AAPL','MSFT','NVDA','TSLA','META','GOOG','AMD','ORCL']) {
    for (let slot = 0; slot < 8; slot++) {
      const p = pickLimitArm(runId, ticker, slot);
      if (p.arm === 'A') assertEquals(p.slippageBps, 50);
      else               assertEquals(p.slippageBps, 40);
    }
  }
});

Deno.test('L-01: randomization is ≈50/50 across a large synthetic corpus (bounded fair-coin drift)', () => {
  // 20 runs × 100 tickers × 5 slots = 10 000 assignments. FNV-1a mod 2 is
  // an ordinary but effective hash — allow ±5% drift from 50/50.
  const tickers: string[] = [];
  for (let i = 0; i < 100; i++) tickers.push(`T${i.toString().padStart(3,'0')}`);
  let a = 0, b = 0;
  for (let r = 0; r < 20; r++) {
    const runId = `run-${r.toString(16).padStart(16, '0')}`;
    for (const t of tickers) {
      for (let s = 0; s < 5; s++) {
        const p = pickLimitArm(runId, t, s);
        if (p.arm === 'A') a += 1; else b += 1;
      }
    }
  }
  const total = a + b;
  assertEquals(total, 10_000);
  const drift = Math.abs(a - b) / total;
  assert(drift < 0.05, `arm distribution drift ${drift.toFixed(4)} exceeds 5% (a=${a} b=${b})`);
});

Deno.test('L-01: session-matched pairing — both arms appear across per-run admits (charter §3)', () => {
  // For any single run, iterating 20 tickers should hit BOTH arms — the
  // paired-t on G-3 depends on session-level (arm B mean − arm A mean).
  const runId = 'session-match-run';
  const arms = new Set<string>();
  for (const t of ['AAPL','MSFT','NVDA','TSLA','META','GOOG','AMD','ORCL','INTC','QCOM',
                   'CRM','ADBE','NFLX','AMZN','SNOW','DDOG','SHOP','UBER','LYFT','ABNB']) {
    arms.add(pickLimitArm(runId, t, 0).arm);
  }
  assertEquals(arms.size, 2, `expected both arms present in a single run; got ${[...arms].join(',')}`);
});

Deno.test('L-01: pickLimitArm typed-refuses degenerate inputs (no silent default)', () => {
  assertThrows(() => pickLimitArm('', 'AAPL', 0), Error, 'runId');
  assertThrows(() => pickLimitArm('r', '', 0),   Error, 'ticker');
  assertThrows(() => pickLimitArm('r', 'AAPL', -1),  Error, 'slot');
  assertThrows(() => pickLimitArm('r', 'AAPL', 0.5), Error, 'slot');
});