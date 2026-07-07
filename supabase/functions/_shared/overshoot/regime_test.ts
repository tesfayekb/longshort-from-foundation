// FP-069 W3.8 T1 (ACT-478) — SPY drawdown regime governor tests.
// PURE; no DB, no network, no wall-clock.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  computeRegime,
  OVERSHOOT_REGIME_BEAR_THRESHOLD,
  OVERSHOOT_REGIME_CORRECTION_THRESHOLD,
  shouldThrottleUnderRegime,
} from './regime.ts';

Deno.test('provenance: ratified band thresholds match ACT-473 Part IV', () => {
  assertEquals(OVERSHOOT_REGIME_CORRECTION_THRESHOLD, -0.05);
  assertEquals(OVERSHOOT_REGIME_BEAR_THRESHOLD, -0.15);
});

Deno.test('BAND BOUNDARY — exact -5% edge classifies as BULL (>= -0.05, strict less-than on CORRECTION floor)', () => {
  // peak=100, last=95 → dd = -0.05 exactly.
  const r = computeRegime({ spyClosesAscending: [100, 95] });
  assert(r.ok);
  assertEquals(r.regime, 'BULL');
  assertEquals(r.drawdownFromPeakPct, -0.05);
});

Deno.test('BAND BOUNDARY — just below -5% (dd = -0.0501) classifies as CORRECTION', () => {
  // peak=10000, last=9499 → dd = -0.0501.
  const r = computeRegime({ spyClosesAscending: [10_000, 9499] });
  assert(r.ok);
  assertEquals(r.regime, 'CORRECTION');
});

Deno.test('BAND BOUNDARY — exact -15% edge classifies as CORRECTION (>= -0.15, strict less-than on BEAR floor)', () => {
  // peak=100, last=85 → dd = -0.15 exactly.
  const r = computeRegime({ spyClosesAscending: [100, 85] });
  assert(r.ok);
  assertEquals(r.regime, 'CORRECTION');
  assertEquals(r.drawdownFromPeakPct, -0.15);
});

Deno.test('BAND BOUNDARY — just below -15% (dd = -0.1501) classifies as BEAR', () => {
  const r = computeRegime({ spyClosesAscending: [10_000, 8499] });
  assert(r.ok);
  assertEquals(r.regime, 'BEAR');
});

Deno.test('2022-shaped drawdown fixture — SPY 2022 rate-hike bear (peak 480 → -25.36% dd) → BEAR', () => {
  // Ratified worst BEAR dd from ACT-473 Part IV: -25.36 %.
  // peak=480.00, last=358.27 → (358.27 - 480) / 480 ≈ -0.25360...
  const r = computeRegime({ spyClosesAscending: [400, 440, 480, 470, 420, 380, 358.27] });
  assert(r.ok);
  assertEquals(r.regime, 'BEAR');
  assertEquals(r.peakClose, 480);
  assertEquals(r.lastClose, 358.27);
  assert(r.drawdownFromPeakPct < -0.25);
  assert(r.drawdownFromPeakPct > -0.26);
});

Deno.test('MONOTONIC PEAK TRACKING — peak advances with each new high; dip after peak measured from that peak', () => {
  // Ascending highs 100 → 110 → 125; then dip to 106.25 → dd = -15% off peak 125.
  const r = computeRegime({ spyClosesAscending: [100, 110, 125, 118, 106.25] });
  assert(r.ok);
  assertEquals(r.peakClose, 125);
  assertEquals(r.lastClose, 106.25);
  assertEquals(r.drawdownFromPeakPct, -0.15);
  assertEquals(r.regime, 'CORRECTION'); // -15% exactly = CORRECTION per strict-less-than BEAR floor
});

Deno.test('MONOTONIC PEAK — new all-time-high wipes drawdown; last=peak → dd=0 → BULL', () => {
  const r = computeRegime({ spyClosesAscending: [100, 90, 80, 120] });
  assert(r.ok);
  assertEquals(r.peakClose, 120);
  assertEquals(r.drawdownFromPeakPct, 0);
  assertEquals(r.regime, 'BULL');
});

Deno.test('DEGENERATE — empty array → typed refusal empty_input (never silently BULL)', () => {
  const r = computeRegime({ spyClosesAscending: [] });
  assert(!r.ok);
  assertEquals(r.refusal, 'empty_input');
});

Deno.test('DEGENERATE — single bar → typed refusal insufficient_bars (no drawdown context possible)', () => {
  const r = computeRegime({ spyClosesAscending: [450.12] });
  assert(!r.ok);
  assertEquals(r.refusal, 'insufficient_bars');
});

Deno.test('DEGENERATE — non-positive close in the series → typed refusal non_positive_close', () => {
  const zero = computeRegime({ spyClosesAscending: [400, 0, 380] });
  const neg = computeRegime({ spyClosesAscending: [400, -1, 380] });
  const nan = computeRegime({ spyClosesAscending: [400, Number.NaN, 380] });
  assert(!zero.ok && !neg.ok && !nan.ok);
  assertEquals(zero.refusal, 'non_positive_close');
  assertEquals(neg.refusal, 'non_positive_close');
  assertEquals(nan.refusal, 'non_positive_close');
});

Deno.test('barsConsumed provenance echo matches input length', () => {
  const r = computeRegime({ spyClosesAscending: [100, 101, 102, 103, 104] });
  assert(r.ok);
  assertEquals(r.barsConsumed, 5);
});

// ─────────────────────────────────────────────────────────────────────────
// T3b (ACT-480) — REGIME ADMISSION HELPER pins.
// STRUCTURAL INVARIANT: regime_throttled_t2 reachable ONLY through
// regime.ok===true && regime==='BEAR' && tier==='T2'. Every other
// combination (indeterminate, BULL, CORRECTION, non-T2 tier) MUST admit.
// ─────────────────────────────────────────────────────────────────────────

Deno.test('T3b PIN: BEAR + T2 → throttled (regime_throttled_t2)', () => {
  const regime = computeRegime({ spyClosesAscending: [10_000, 8499] });
  assert(regime.ok);
  assertEquals(regime.regime, 'BEAR');
  const out = shouldThrottleUnderRegime(regime, 'T2');
  assertEquals(out.throttle, true);
  assertEquals(out.reason, 'regime_throttled_t2');
});

Deno.test('T3b PIN: BEAR + T1 → admitted (T1 immune to regime governor)', () => {
  const regime = computeRegime({ spyClosesAscending: [10_000, 8499] });
  assert(regime.ok);
  const out = shouldThrottleUnderRegime(regime, 'T1');
  assertEquals(out.throttle, false);
  assertEquals(out.reason, null);
});

Deno.test('T3b PIN: BEAR + null tier (SHORT path) → admitted (SHORT not gated by governor v1)', () => {
  const regime = computeRegime({ spyClosesAscending: [10_000, 8499] });
  assert(regime.ok);
  const out = shouldThrottleUnderRegime(regime, null);
  assertEquals(out.throttle, false);
});

Deno.test('T3b PIN: BULL + T2 → admitted (no throttle outside BEAR)', () => {
  const regime = computeRegime({ spyClosesAscending: [100, 101, 102] });
  assert(regime.ok);
  assertEquals(regime.regime, 'BULL');
  const out = shouldThrottleUnderRegime(regime, 'T2');
  assertEquals(out.throttle, false);
});

Deno.test('T3b PIN: CORRECTION + T2 → admitted (throttle bracket is BEAR-only)', () => {
  const regime = computeRegime({ spyClosesAscending: [10_000, 9499] });
  assert(regime.ok);
  assertEquals(regime.regime, 'CORRECTION');
  const out = shouldThrottleUnderRegime(regime, 'T2');
  assertEquals(out.throttle, false);
});

// PHANTOM-BEAR pin (operator-ratified). regime_throttled_t2 must NEVER
// fire on an indeterminate regime input; the input problem is surfaced
// via regime_indeterminate at the engine, not by silently gating T2 out
// as if the market were in BEAR. This test locks the "reachable ONLY
// through regime.ok===true" invariant regardless of downstream refusal
// class or reason text.
Deno.test('T3b PIN (phantom-BEAR): regime_indeterminate (regime.ok===false) NEVER throttles — even for T2', () => {
  for (const refusal of ['empty_input', 'insufficient_bars', 'non_positive_close'] as const) {
    const regime = { ok: false as const, refusal, reason: `synthetic-${refusal}` };
    for (const tier of ['T1', 'T2', null] as const) {
      const out = shouldThrottleUnderRegime(regime, tier);
      assertEquals(out.throttle, false,
        `phantom-BEAR VIOLATION: regime.ok=false (${refusal}) threw throttle=true on tier=${tier}. ` +
        `regime_throttled_t2 MUST be reachable ONLY through regime.ok===true.`);
      assertEquals(out.reason, null);
    }
  }
});