// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
/**
 * FP-010 Bucket A1 — Unit tests for the 3 monitoring predicates.
 *
 * Coverage (22 tests):
 *   checkSignalComputeFailed         — 8 tests
 *   checkSignalComputeLowWaterMark   — 7 tests
 *   checkSignalComputeStale          — 7 tests
 *
 * Test discipline mirrors FP-009 A1/A2/A3:
 *   - Frozen `asOf` Date; no wall-clock reads.
 *   - All boundary conditions pinned (off-by-one on the window edges).
 *   - Determinism asserted via re-invocation comparison (sans `alert_id`
 *     which is per-emit UUID by design).
 */
import {
  assert,
  assertEquals,
  assertNotEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  checkSignalComputeFailed,
  checkSignalComputeLowWaterMark,
  checkSignalComputeStale,
  type SignalComputeLogRow,
} from './check-signal-compute-failures.ts';

// ---------- helpers ----------

const SIGNAL_A = 'cross_sectional_momentum_12_1';
const SIGNAL_B = 'short_term_reversal';

/** Frozen reference time used across all tests. */
const AS_OF = new Date('2026-06-07T21:00:00.000Z');

/** Build a row with sensible defaults; spread to override per test. */
function row(overrides: Partial<SignalComputeLogRow>): SignalComputeLogRow {
  return {
    run_id: '00000000-0000-0000-0000-000000000001',
    signal_id: SIGNAL_A,
    as_of_date: '2026-06-06',
    outcome: 'completed',
    universe_size: 839,
    persisted_count: 834,
    skip_counts: null,
    failure_reason: null,
    started_at: '2026-06-06T20:00:00.000Z',
    completed_at: '2026-06-06T20:05:00.000Z',
    operator_id: '00000000-0000-0000-0000-000000000099',
    ...overrides,
  };
}

/** Offset AS_OF by `hours` (negative = past). */
function offset(hours: number, millis: number = 0): string {
  return new Date(AS_OF.getTime() + hours * 3600 * 1000 + millis).toISOString();
}

/** Strip alert_id for stable comparison across re-invocations. */
function strip(payloads: ReadonlyArray<{ alert_id: string }>): unknown[] {
  return payloads.map(({ alert_id: _ignored, ...rest }) => rest);
}

// ---------- checkSignalComputeFailed ----------

Deno.test('checkSignalComputeFailed: happy path — 1 failed row in window → 1 alert', () => {
  const rows = [row({ outcome: 'failed', failure_reason: 'polygon_404', completed_at: offset(-2) })];
  const alerts = checkSignalComputeFailed(rows, AS_OF);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].alert_type, 'signal_compute_failed');
  assertEquals(alerts[0].severity, 'critical');
  assertEquals(alerts[0].failure_reason, 'polygon_404');
  assertEquals(alerts[0].monitor_source, 'dedicated');
  assertEquals(alerts[0].detected_at, AS_OF.toISOString());
});

Deno.test('checkSignalComputeFailed: 2 failed rows in window → 2 alerts sorted by signal_id+as_of_date', () => {
  const rows = [
    row({ outcome: 'failed', signal_id: SIGNAL_B, as_of_date: '2026-06-06', completed_at: offset(-3) }),
    row({ outcome: 'failed', signal_id: SIGNAL_A, as_of_date: '2026-06-05', completed_at: offset(-5) }),
    row({ outcome: 'failed', signal_id: SIGNAL_A, as_of_date: '2026-06-06', completed_at: offset(-2) }),
  ];
  const alerts = checkSignalComputeFailed(rows, AS_OF);
  assertEquals(alerts.length, 3);
  assertEquals(alerts[0].signal_id, SIGNAL_A);
  assertEquals(alerts[0].as_of_date, '2026-06-05');
  assertEquals(alerts[1].signal_id, SIGNAL_A);
  assertEquals(alerts[1].as_of_date, '2026-06-06');
  assertEquals(alerts[2].signal_id, SIGNAL_B);
});

Deno.test('checkSignalComputeFailed: empty rows → empty alerts', () => {
  assertEquals(checkSignalComputeFailed([], AS_OF).length, 0);
});

Deno.test('checkSignalComputeFailed: boundary — at lower edge OUT, +1ms IN', () => {
  const onEdge = row({ outcome: 'failed', completed_at: offset(-24) });
  const justIn = row({ outcome: 'failed', signal_id: SIGNAL_B, completed_at: offset(-24, 1) });
  const alerts = checkSignalComputeFailed([onEdge, justIn], AS_OF, 24);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].signal_id, SIGNAL_B);
});

Deno.test('checkSignalComputeFailed: boundary — exactly at asOf is IN (inclusive upper bound)', () => {
  const atAsOf = row({ outcome: 'failed', completed_at: AS_OF.toISOString() });
  assertEquals(checkSignalComputeFailed([atAsOf], AS_OF).length, 1);
});

Deno.test('checkSignalComputeFailed: completed row in window → no alert (outcome filter)', () => {
  const rows = [row({ outcome: 'completed', completed_at: offset(-2) })];
  assertEquals(checkSignalComputeFailed(rows, AS_OF).length, 0);
});

Deno.test('checkSignalComputeFailed: populated_pct computed even for failed rows (forensic context)', () => {
  const rows = [row({ outcome: 'failed', persisted_count: 5, universe_size: 839, completed_at: offset(-1) })];
  const alerts = checkSignalComputeFailed(rows, AS_OF);
  assertEquals(alerts.length, 1);
  assert(alerts[0].populated_pct !== null);
  assertEquals(Math.round(alerts[0].populated_pct! * 1e6), Math.round((5 / 839) * 1e6));
});

Deno.test('checkSignalComputeFailed: universe_size=0 → populated_pct=null (div-by-zero guard, no NaN)', () => {
  const rows = [row({ outcome: 'failed', persisted_count: 0, universe_size: 0, completed_at: offset(-1) })];
  const alerts = checkSignalComputeFailed(rows, AS_OF);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].populated_pct, null);
});

// ---------- checkSignalComputeLowWaterMark ----------

Deno.test('checkLowWaterMark: 1 completed at 75% with threshold 0.80 → 1 alert', () => {
  const rows = [row({ outcome: 'completed', persisted_count: 750, universe_size: 1000, completed_at: offset(-2) })];
  const alerts = checkSignalComputeLowWaterMark(rows, AS_OF);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].alert_type, 'signal_compute_low_water_mark');
  assertEquals(alerts[0].severity, 'warning');
  assertEquals(alerts[0].populated_pct, 0.75);
});

Deno.test('checkLowWaterMark: 99.4% (Phase 2.1 actual fire) above threshold → no alert', () => {
  const rows = [row({ outcome: 'completed', persisted_count: 834, universe_size: 839, completed_at: offset(-2) })];
  assertEquals(checkSignalComputeLowWaterMark(rows, AS_OF).length, 0);
});

Deno.test('checkLowWaterMark: threshold parameter respected (0.70 → no alert at 75%)', () => {
  const rows = [row({ outcome: 'completed', persisted_count: 750, universe_size: 1000, completed_at: offset(-2) })];
  assertEquals(checkSignalComputeLowWaterMark(rows, AS_OF, 24, 0.70).length, 0);
});

Deno.test('checkLowWaterMark: failed row in window → no alert (outcome filter)', () => {
  const rows = [row({ outcome: 'failed', persisted_count: 100, universe_size: 1000, completed_at: offset(-2) })];
  assertEquals(checkSignalComputeLowWaterMark(rows, AS_OF).length, 0);
});

Deno.test('checkLowWaterMark: boundary — exactly at threshold (0.80) → no alert (strict <)', () => {
  const rows = [row({ outcome: 'completed', persisted_count: 800, universe_size: 1000, completed_at: offset(-2) })];
  assertEquals(checkSignalComputeLowWaterMark(rows, AS_OF, 24, 0.80).length, 0);
});

Deno.test('checkLowWaterMark: boundary — just below threshold (799/1000=0.799) → alert', () => {
  const rows = [row({ outcome: 'completed', persisted_count: 799, universe_size: 1000, completed_at: offset(-2) })];
  assertEquals(checkSignalComputeLowWaterMark(rows, AS_OF, 24, 0.80).length, 1);
});

Deno.test('checkLowWaterMark: universe_size=0 → no alert (populated_pct null cannot be below threshold)', () => {
  const rows = [row({ outcome: 'completed', persisted_count: 0, universe_size: 0, completed_at: offset(-2) })];
  assertEquals(checkSignalComputeLowWaterMark(rows, AS_OF).length, 0);
});

// ---------- checkSignalComputeStale ----------

Deno.test('checkStale: row 24h old, staleHours=36 → no alert (within freshness window)', () => {
  const rows = [row({ completed_at: offset(-24) })];
  assertEquals(checkSignalComputeStale(rows, AS_OF, 36, [SIGNAL_A]).length, 0);
});

Deno.test('checkStale: row 48h old, staleHours=36 → 1 alert', () => {
  const rows = [row({ completed_at: offset(-48) })];
  const alerts = checkSignalComputeStale(rows, AS_OF, 36, [SIGNAL_A]);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].alert_type, 'signal_compute_stale');
  assertEquals(alerts[0].severity, 'critical');
});

Deno.test('checkStale: no rows for signal → 1 alert (absence-of-evidence triggers)', () => {
  const alerts = checkSignalComputeStale([], AS_OF, 36, [SIGNAL_A]);
  assertEquals(alerts.length, 1);
  assertEquals(alerts[0].signal_id, SIGNAL_A);
});

Deno.test('checkStale: multi-signal — 2 fresh + 1 stale + 1 absent → 2 alerts (stale + absent), sorted', () => {
  const rows = [
    row({ signal_id: 'a_fresh', completed_at: offset(-5) }),
    row({ signal_id: 'b_fresh', completed_at: offset(-10) }),
    row({ signal_id: 'c_stale', completed_at: offset(-50) }),
  ];
  const alerts = checkSignalComputeStale(rows, AS_OF, 36, [
    'a_fresh', 'b_fresh', 'c_stale', 'd_absent',
  ]);
  assertEquals(alerts.length, 2);
  assertEquals(alerts[0].signal_id, 'c_stale');
  assertEquals(alerts[1].signal_id, 'd_absent');
});

Deno.test('checkStale: boundary — row exactly at asOf - staleHours → IS stale (<= boundary)', () => {
  const rows = [row({ completed_at: offset(-36) })];
  assertEquals(checkSignalComputeStale(rows, AS_OF, 36, [SIGNAL_A]).length, 1);
});

Deno.test('checkStale: boundary — row at asOf - staleHours + 1ms → NOT stale', () => {
  const rows = [row({ completed_at: offset(-36, 1) })];
  assertEquals(checkSignalComputeStale(rows, AS_OF, 36, [SIGNAL_A]).length, 0);
});

Deno.test('checkStale: stale-alert payload field-availability — all inspection fields null', () => {
  const alerts = checkSignalComputeStale([], AS_OF, 36, [SIGNAL_A]);
  assertEquals(alerts.length, 1);
  const p = alerts[0];
  assertEquals(p.run_id, null);
  assertEquals(p.as_of_date, null);
  assertEquals(p.failure_reason, null);
  assertEquals(p.persisted_count, null);
  assertEquals(p.universe_size, null);
  assertEquals(p.populated_pct, null);
});

// ---------- determinism (cross-predicate) ----------

Deno.test('determinism: same inputs produce byte-identical outputs (ignoring per-emit alert_id)', () => {
  const rows = [
    row({ outcome: 'failed', signal_id: SIGNAL_A, completed_at: offset(-2) }),
    row({ outcome: 'completed', signal_id: SIGNAL_B, persisted_count: 100, universe_size: 1000, completed_at: offset(-3) }),
  ];
  const f1 = checkSignalComputeFailed(rows, AS_OF);
  const f2 = checkSignalComputeFailed(rows, AS_OF);
  assertEquals(strip(f1), strip(f2));

  const l1 = checkSignalComputeLowWaterMark(rows, AS_OF);
  const l2 = checkSignalComputeLowWaterMark(rows, AS_OF);
  assertEquals(strip(l1), strip(l2));

  const s1 = checkSignalComputeStale(rows, AS_OF, 36, [SIGNAL_A, SIGNAL_B]);
  const s2 = checkSignalComputeStale(rows, AS_OF, 36, [SIGNAL_A, SIGNAL_B]);
  assertEquals(strip(s1), strip(s2));

  // alert_id must still be per-emit unique
  if (f1.length > 0 && f2.length > 0) {
    assertNotEquals(f1[0].alert_id, f2[0].alert_id);
  }
});