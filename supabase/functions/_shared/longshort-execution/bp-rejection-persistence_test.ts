// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
/**
 * bp-rejection-persistence_test — FP-062 6I.6b / DW-152.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildBpRejectionPersistenceCheck,
  countBpRejectionsInWindow,
  DEFAULT_BP_PERSISTENCE_N,
  DEFAULT_BP_PERSISTENCE_WINDOW_S,
  parseBpPersistenceN,
  parseBpPersistenceWindowS,
  type BpRejectionHistoryReader,
  type BpRejectionRow,
  type IsAccountPausedFn,
  type PauseAccountFn,
} from './bp-rejection-persistence.ts';
import type {
  EmittedExecutionEvent,
  ReconciliationEventWriter,
} from './lifecycle-orchestrator.ts';

const T0 = new Date('2026-06-29T15:00:00Z');
const minutesBefore = (m: number) => new Date(T0.getTime() - m * 60_000);

function mkWriter() {
  const events: EmittedExecutionEvent[] = [];
  const writer: ReconciliationEventWriter = {
    emit: (ev) => { events.push(ev); return Promise.resolve(); },
  };
  return { writer, events };
}

const EMPTY_ENV = { get: (_: string) => undefined };
function envOf(map: Record<string, string>): { get(name: string): string | undefined } {
  return { get: (k) => map[k] };
}

function mkReader(rows: BpRejectionRow[]): BpRejectionHistoryReader {
  return { readRecent: (_t, _l) => Promise.resolve(rows.slice()) };
}

const okPause: PauseAccountFn = () => Promise.resolve();
const okIsPaused: IsAccountPausedFn = () => Promise.resolve(false);

// ── PURE ─────────────────────────────────────────────────────────────

Deno.test('countBpRejectionsInWindow — only rows ts>=windowStart count', () => {
  const rows: BpRejectionRow[] = [
    { ts: minutesBefore(5) }, { ts: minutesBefore(30) },
    { ts: minutesBefore(59) }, { ts: minutesBefore(61) }, // outside 60-min window
  ];
  const winStart = new Date(T0.getTime() - 60 * 60_000);
  assertEquals(countBpRejectionsInWindow(rows, winStart), 3);
});

Deno.test('countBpRejectionsInWindow — empty rows → 0', () => {
  assertEquals(countBpRejectionsInWindow([], T0), 0);
});

// ── ENV PARSING ──────────────────────────────────────────────────────

Deno.test('parseBpPersistenceN — defaults + validation', () => {
  assertEquals(parseBpPersistenceN(EMPTY_ENV), DEFAULT_BP_PERSISTENCE_N);
  assertEquals(parseBpPersistenceN(envOf({ LONGSHORT_BP_PERSISTENCE_N: '5' })), 5);
  let threw = false;
  try { parseBpPersistenceN(envOf({ LONGSHORT_BP_PERSISTENCE_N: '0' })); }
  catch { threw = true; }
  assert(threw);
  threw = false;
  try { parseBpPersistenceN(envOf({ LONGSHORT_BP_PERSISTENCE_N: 'abc' })); }
  catch { threw = true; }
  assert(threw);
});

Deno.test('parseBpPersistenceWindowS — defaults + validation', () => {
  assertEquals(parseBpPersistenceWindowS(EMPTY_ENV), DEFAULT_BP_PERSISTENCE_WINDOW_S);
  assertEquals(parseBpPersistenceWindowS(envOf({ LONGSHORT_BP_PERSISTENCE_WINDOW_S: '1800' })), 1800);
  let threw = false;
  try { parseBpPersistenceWindowS(envOf({ LONGSHORT_BP_PERSISTENCE_WINDOW_S: '0' })); }
  catch { threw = true; }
  assert(threw);
});

// ── IO SHELL ─────────────────────────────────────────────────────────

Deno.test('below threshold (2 rows in window) → not escalated, no pause, no emit', async () => {
  const reader = mkReader([{ ts: minutesBefore(5) }, { ts: minutesBefore(30) }]);
  const { writer, events } = mkWriter();
  let pauseCalls = 0;
  const check = buildBpRejectionPersistenceCheck({
    reader, eventWriter: writer,
    pauseFn: () => { pauseCalls += 1; return Promise.resolve(); },
    isAccountPausedFn: okIsPaused, env: EMPTY_ENV,
  });
  const r = await check(T0);
  assertEquals(r.escalated, false);
  if (!r.escalated) assertEquals(r.reason, 'below_threshold');
  assertEquals(pauseCalls, 0);
  assertEquals(events.length, 0);
});

Deno.test('3-in-1h → escalates, pauses, emits success event with source_ref', async () => {
  const reader = mkReader([
    { ts: minutesBefore(5), event_id: 'evt-latest' },
    { ts: minutesBefore(20) },
    { ts: minutesBefore(45) },
  ]);
  const { writer, events } = mkWriter();
  let captured: { reason: string; source_ref: string } | null = null;
  const pauseFn: PauseAccountFn = (i) => { captured = i; return Promise.resolve(); };
  const check = buildBpRejectionPersistenceCheck({
    reader, eventWriter: writer, pauseFn,
    isAccountPausedFn: okIsPaused, env: EMPTY_ENV,
  });
  const r = await check(T0);
  assert(r.escalated);
  if (r.escalated) {
    assertEquals(r.count, 3);
    assertEquals(r.threshold, 3);
    assertEquals(r.window_s, 3600);
    assert(r.source_ref.startsWith('persistent_bp:n=3:window_s=3600:last_ts='));
  }
  assert(captured);
  if (captured) {
    assert(captured.reason.includes('3 broker rejections within 3600s'));
    assert(captured.source_ref.includes('last_ts='));
  }
  assertEquals(events.length, 1);
  assertEquals(events[0].call_name, 'longshort.execution.account_paused_persistent_bp');
  assertEquals(events[0].outcome, 'failure_handled');
  assertEquals(events[0].tier, 'tier2');
  const payload = events[0].payload as Record<string, unknown>;
  assertEquals(payload.pause_class, 'persistent_bp');
  assertEquals(payload.count, 3);
  assertEquals(payload.last_event_id, 'evt-latest');
});

Deno.test('3 rows but oldest outside 1h window → counts 2 → below threshold', async () => {
  const reader = mkReader([
    { ts: minutesBefore(5) },
    { ts: minutesBefore(40) },
    { ts: minutesBefore(75) }, // outside 60-min window
  ]);
  const { writer, events } = mkWriter();
  let pauseCalls = 0;
  const check = buildBpRejectionPersistenceCheck({
    reader, eventWriter: writer,
    pauseFn: () => { pauseCalls += 1; return Promise.resolve(); },
    isAccountPausedFn: okIsPaused, env: EMPTY_ENV,
  });
  const r = await check(T0);
  assertEquals(r.escalated, false);
  if (!r.escalated) {
    assertEquals(r.reason, 'below_threshold');
    assertEquals(r.count, 2);
  }
  assertEquals(pauseCalls, 0);
  assertEquals(events.length, 0);
});

Deno.test('latch — count crosses but already paused → no pause re-fire, no emit', async () => {
  const reader = mkReader([
    { ts: minutesBefore(5) }, { ts: minutesBefore(20) }, { ts: minutesBefore(45) },
  ]);
  const { writer, events } = mkWriter();
  let pauseCalls = 0;
  const check = buildBpRejectionPersistenceCheck({
    reader, eventWriter: writer,
    pauseFn: () => { pauseCalls += 1; return Promise.resolve(); },
    isAccountPausedFn: () => Promise.resolve(true),
    env: EMPTY_ENV,
  });
  const r = await check(T0);
  assertEquals(r.escalated, false);
  if (!r.escalated) assertEquals(r.reason, 'latched_already_paused');
  assertEquals(pauseCalls, 0);
  assertEquals(events.length, 0);
});

Deno.test('pauseFn throws → failure_escalated event emitted, returns pause_failed', async () => {
  const reader = mkReader([
    { ts: minutesBefore(5) }, { ts: minutesBefore(20) }, { ts: minutesBefore(45) },
  ]);
  const { writer, events } = mkWriter();
  const check = buildBpRejectionPersistenceCheck({
    reader, eventWriter: writer,
    pauseFn: () => Promise.reject(new Error('RPC down')),
    isAccountPausedFn: okIsPaused, env: EMPTY_ENV,
  });
  const r = await check(T0);
  assertEquals(r.escalated, false);
  if (!r.escalated && r.reason === 'pause_failed') {
    assertEquals(r.error, 'RPC down');
  } else {
    throw new Error(`expected pause_failed, got ${JSON.stringify(r)}`);
  }
  assertEquals(events.length, 1);
  assertEquals(events[0].call_name, 'longshort.execution.account_pause_failed');
  assertEquals(events[0].outcome, 'failure_escalated');
  assertEquals(events[0].tier, 'tier3');
});

Deno.test('custom env knobs honored (N=2, window=600)', async () => {
  const reader = mkReader([
    { ts: minutesBefore(2) }, { ts: minutesBefore(8) },
    { ts: minutesBefore(15) }, // outside 600s (10min) window
  ]);
  const { writer, events } = mkWriter();
  let pauseCalls = 0;
  const check = buildBpRejectionPersistenceCheck({
    reader, eventWriter: writer,
    pauseFn: () => { pauseCalls += 1; return Promise.resolve(); },
    isAccountPausedFn: okIsPaused,
    env: envOf({
      LONGSHORT_BP_PERSISTENCE_N: '2',
      LONGSHORT_BP_PERSISTENCE_WINDOW_S: '600',
    }),
  });
  const r = await check(T0);
  assert(r.escalated);
  if (r.escalated) {
    assertEquals(r.count, 2);
    assertEquals(r.threshold, 2);
    assertEquals(r.window_s, 600);
  }
  assertEquals(pauseCalls, 1);
  assertEquals(events.length, 1);
});

Deno.test('reader receives bounded limit (max(N*4, 12))', async () => {
  let observedLimit = 0;
  const reader: BpRejectionHistoryReader = {
    readRecent: (_t, l) => { observedLimit = l; return Promise.resolve([]); },
  };
  const { writer } = mkWriter();
  const check = buildBpRejectionPersistenceCheck({
    reader, eventWriter: writer, pauseFn: okPause, isAccountPausedFn: okIsPaused,
    env: envOf({ LONGSHORT_BP_PERSISTENCE_N: '3' }),
  });
  await check(T0);
  assertEquals(observedLimit, 12); // max(3*4=12, 12)=12

  const check2 = buildBpRejectionPersistenceCheck({
    reader, eventWriter: writer, pauseFn: okPause, isAccountPausedFn: okIsPaused,
    env: envOf({ LONGSHORT_BP_PERSISTENCE_N: '10' }),
  });
  await check2(T0);
  assertEquals(observedLimit, 40); // max(10*4=40, 12)=40
});