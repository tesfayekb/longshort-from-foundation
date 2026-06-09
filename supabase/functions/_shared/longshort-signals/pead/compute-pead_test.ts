// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assert,
  assertAlmostEquals,
  assertEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  computePead,
  PEAD_HALF_LIFE_TRADING_DAYS,
  PEAD_MIN_ANALYSTS,
  PEAD_STALENESS_WINDOW_TRADING_DAYS,
  RANGE_TO_SIGMA_DIVISOR,
} from './compute-pead.ts';

const AS_OF = new Date('2026-06-08T21:00:00Z'); // Mon

function baseInputs(over: Partial<Parameters<typeof computePead>[0]> = {}) {
  return {
    epsActual: 1.50,
    epsAvg: 1.40,
    epsHigh: 1.55,
    epsLow: 1.25,
    numberAnalysts: 8,
    reportPeriodDate: new Date('2026-05-01T00:00:00Z'), // ~26 trading days before AS_OF
    asOf: AS_OF,
    ...over,
  };
}

// ── DEC-051 / formula correctness ─────────────────────────────────────

Deno.test('computePead: produces SUE × decay value with expected arithmetic', () => {
  const r = computePead(baseInputs());
  assert(r.kind === 'value');
  if (r.kind !== 'value') return;
  const expected_sigma = (1.55 - 1.25) / RANGE_TO_SIGMA_DIVISOR;
  assertAlmostEquals(r.sigma_proxy, expected_sigma, 1e-12);
  const expected_sue = (1.50 - 1.40) / expected_sigma;
  assertAlmostEquals(r.sue, expected_sue, 1e-12);
  const expected_value =
    expected_sue * Math.exp(-r.trading_days_since / PEAD_HALF_LIFE_TRADING_DAYS);
  assertAlmostEquals(r.value, expected_value, 1e-12);
  assert(r.trading_days_since > 0);
});

Deno.test('computePead: positive surprise → positive signal; negative → negative', () => {
  const pos = computePead(baseInputs({ epsActual: 1.80, epsAvg: 1.40 }));
  const neg = computePead(baseInputs({ epsActual: 1.00, epsAvg: 1.40 }));
  assert(pos.kind === 'value' && pos.value > 0);
  assert(neg.kind === 'value' && neg.value < 0);
});

Deno.test('computePead: decay attenuates older reports', () => {
  const recent = computePead(baseInputs({
    reportPeriodDate: new Date('2026-06-01T00:00:00Z'), // ~5 trading days
  }));
  const older = computePead(baseInputs({
    reportPeriodDate: new Date('2026-04-13T00:00:00Z'), // ~40 trading days
  }));
  assert(recent.kind === 'value' && older.kind === 'value');
  if (recent.kind !== 'value' || older.kind !== 'value') return;
  assert(Math.abs(recent.value) > Math.abs(older.value));
});

// ── DEC-052 floor ──────────────────────────────────────────────────────

Deno.test('computePead: N<2 (DEC-052) → pead_panel_below_floor typed-absence skip', () => {
  const r = computePead(baseInputs({ numberAnalysts: 1 }));
  assert(r.kind === 'skip');
  if (r.kind !== 'skip') return;
  assertEquals(r.reason, 'pead_panel_below_floor');
  assert(r.detail.includes(`< ${PEAD_MIN_ANALYSTS}`));
});

Deno.test('computePead: N=2 (boundary) is accepted (strict ≥, not >)', () => {
  const r = computePead(baseInputs({ numberAnalysts: 2 }));
  assert(r.kind === 'value');
});

Deno.test('computePead: N=0 also skipped as pead_panel_below_floor', () => {
  const r = computePead(baseInputs({ numberAnalysts: 0 }));
  assert(r.kind === 'skip');
  if (r.kind !== 'skip') return;
  assertEquals(r.reason, 'pead_panel_below_floor');
});

// ── DEC-051 / DEC-053 zero-dispersion typed absence (NO ε-fallback) ───

Deno.test('computePead: epsHigh === epsLow → zero_dispersion typed-absence (NO ε-fallback)', () => {
  const r = computePead(baseInputs({ epsHigh: 1.40, epsLow: 1.40 }));
  assert(r.kind === 'skip');
  if (r.kind !== 'skip') return;
  assertEquals(r.reason, 'zero_dispersion');
  assert(r.detail.includes('ε-fallback forbidden'));
});

Deno.test('computePead: epsHigh < epsLow (vendor regression) → zero_dispersion', () => {
  const r = computePead(baseInputs({ epsHigh: 1.20, epsLow: 1.40 }));
  assert(r.kind === 'skip');
  if (r.kind !== 'skip') return;
  assertEquals(r.reason, 'zero_dispersion');
});

// ── §4.4.6 / DEC-048 staleness gate ────────────────────────────────────

Deno.test('computePead: report older than 60 trading days → no_recent_earnings', () => {
  const r = computePead(baseInputs({
    reportPeriodDate: new Date('2026-02-01T00:00:00Z'),
  }));
  assert(r.kind === 'skip');
  if (r.kind !== 'skip') return;
  assertEquals(r.reason, 'no_recent_earnings');
  assert(r.detail.includes(`> ${PEAD_STALENESS_WINDOW_TRADING_DAYS}`));
});

Deno.test('computePead: future-period defensive → no_recent_earnings', () => {
  const r = computePead(baseInputs({
    reportPeriodDate: new Date('2026-09-01T00:00:00Z'),
  }));
  assert(r.kind === 'skip');
  if (r.kind !== 'skip') return;
  assertEquals(r.reason, 'no_recent_earnings');
});

// ── Defensive: non-finite eps fields → typed absence, never NaN ───────

Deno.test('computePead: non-finite epsActual → no_recent_earnings skip (defensive)', () => {
  const r = computePead(baseInputs({ epsActual: Number.NaN }));
  assert(r.kind === 'skip');
  if (r.kind !== 'skip') return;
  assertEquals(r.reason, 'no_recent_earnings');
});

Deno.test('computePead: skip-reason discriminants are exactly the three DEC-052/053 enum values', () => {
  const reasons = new Set<string>();
  reasons.add((computePead(baseInputs({ numberAnalysts: 1 })) as { reason: string }).reason);
  reasons.add((computePead(baseInputs({ epsHigh: 1.4, epsLow: 1.4 })) as { reason: string }).reason);
  reasons.add((computePead(baseInputs({ reportPeriodDate: new Date('2025-01-01T00:00:00Z') })) as { reason: string }).reason);
  assertEquals(reasons, new Set(['pead_panel_below_floor', 'zero_dispersion', 'no_recent_earnings']));
});