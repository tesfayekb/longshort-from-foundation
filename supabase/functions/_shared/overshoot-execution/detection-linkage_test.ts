// FP-069 W3.6.e-i (ACT-464.e-i) — detection-linkage tests. Pure; no net.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  resolveDetectionRunForEntry,
  computePriorSpySessionDate,
  type OvershootDetectionRunRow,
} from './detection-linkage.ts';

const RUN = (o: Partial<OvershootDetectionRunRow> & { as_of: string; outcome: string }): OvershootDetectionRunRow => ({
  run_id: o.run_id ?? '00000000-0000-0000-0000-000000000001',
  as_of: o.as_of,
  outcome: o.outcome,
  selected_count: o.selected_count ?? 3,
});

Deno.test('happy path — prior SPY session found, run matches, outcome completed', () => {
  const r = resolveDetectionRunForEntry({
    asOf: '2026-07-07',
    spyPriorSessionDates: ['2026-07-02', '2026-07-06'],
    detectionRun: RUN({ as_of: '2026-07-06', outcome: 'completed_with_events' }),
  });
  assert(r.ok);
  assertEquals(r.priorSessionExpected, '2026-07-06');
  assertEquals(r.runAsOf, '2026-07-06');
  assertEquals(r.selectedCount, 3);
});

Deno.test('happy path — completed with no events still valid (empty selection is a real signal)', () => {
  const r = resolveDetectionRunForEntry({
    asOf: '2026-07-07',
    spyPriorSessionDates: ['2026-07-06'],
    detectionRun: RUN({ as_of: '2026-07-06', outcome: 'completed', selected_count: 0 }),
  });
  assert(r.ok);
  assertEquals(r.selectedCount, 0);
});

Deno.test('PIN-1 reuse — holiday (Jul 3 Fri closed) — prior SPY session is Wed Jul 2, weekend collapses naturally', () => {
  // asOf = Mon 2026-07-06 (Fri 2026-07-03 US holiday); SPY bars: Wed 2026-07-01, Wed 2026-07-02.
  const prior = computePriorSpySessionDate('2026-07-06', ['2026-07-01', '2026-07-02']);
  assertEquals(prior, '2026-07-02');
  const r = resolveDetectionRunForEntry({
    asOf: '2026-07-06',
    spyPriorSessionDates: ['2026-07-01', '2026-07-02'],
    detectionRun: RUN({ as_of: '2026-07-02', outcome: 'completed_with_events' }),
  });
  assert(r.ok);
  assertEquals(r.priorSessionExpected, '2026-07-02');
});

Deno.test('typed refusal — detection_run_missing_for_prior_session when run row is null', () => {
  const r = resolveDetectionRunForEntry({
    asOf: '2026-07-07',
    spyPriorSessionDates: ['2026-07-06'],
    detectionRun: null,
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'detection_run_missing_for_prior_session');
  assertEquals(r.priorSessionExpected, '2026-07-06');
});

Deno.test('typed refusal — detection_run_stale when run.as_of predates the prior SPY session', () => {
  const r = resolveDetectionRunForEntry({
    asOf: '2026-07-07',
    spyPriorSessionDates: ['2026-07-02', '2026-07-06'],
    detectionRun: RUN({ as_of: '2026-07-02', outcome: 'completed_with_events' }),
  });
  assert(!r.ok);
  assertEquals(r.refusal, 'detection_run_stale');
  assertEquals(r.priorSessionExpected, '2026-07-06');
  assertEquals(r.runAsOfActual, '2026-07-02');
});

Deno.test('typed refusal — detection_run_not_completed on non-completed outcome (skipped/error)', () => {
  for (const outcome of ['skipped', 'error', 'aborted', 'partial']) {
    const r = resolveDetectionRunForEntry({
      asOf: '2026-07-07',
      spyPriorSessionDates: ['2026-07-06'],
      detectionRun: RUN({ as_of: '2026-07-06', outcome }),
    });
    assert(!r.ok, `expected refusal for outcome=${outcome}`);
    assertEquals(r.refusal, 'detection_run_not_completed');
  }
});

Deno.test('typed refusal — no_prior_spy_session when supplied bars are empty or all >= asOf', () => {
  const empty = resolveDetectionRunForEntry({
    asOf: '2026-07-07', spyPriorSessionDates: [], detectionRun: null,
  });
  const future = resolveDetectionRunForEntry({
    asOf: '2026-07-07', spyPriorSessionDates: ['2026-07-07', '2026-07-08'], detectionRun: null,
  });
  assert(!empty.ok);
  assert(!future.ok);
  assertEquals(empty.refusal, 'no_prior_spy_session');
  assertEquals(future.refusal, 'no_prior_spy_session');
});

Deno.test('typed refusal — malformed_session_date on bad asOf or bar entry', () => {
  const bad = resolveDetectionRunForEntry({
    asOf: '2026/07/07' as string,
    spyPriorSessionDates: ['2026-07-06'],
    detectionRun: null,
  });
  assert(!bad.ok);
  assertEquals(bad.refusal, 'malformed_session_date');
});