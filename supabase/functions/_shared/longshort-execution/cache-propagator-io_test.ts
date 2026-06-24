/**
 * cache-propagator-io_test — FP-056 E4 (ACT-312). I/O shell tests via
 * injected writer + capturing event writer.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type {
  EmittedExecutionEvent,
  ReconciliationEventWriter,
} from './lifecycle-orchestrator.ts';
import {
  createRejectionPropagator,
  type HtbCacheWriter,
} from './cache-propagator-io.ts';
import type { HtbRecordWrite } from './cache-propagator.ts';

const T0 = new Date('2026-06-24T20:30:00Z');

function mkCapturingEventWriter(): { writer: ReconciliationEventWriter; events: EmittedExecutionEvent[] } {
  const events: EmittedExecutionEvent[] = [];
  return {
    events,
    writer: { async emit(e) { events.push(e); } },
  };
}

function mkCapturingHtbWriter(): { writer: HtbCacheWriter; writes: HtbRecordWrite[] } {
  const writes: HtbRecordWrite[] = [];
  return {
    writes,
    writer: { async upsertHtb(w) { writes.push(w); } },
  };
}

function mkFailingHtbWriter(message = 'boom'): HtbCacheWriter {
  return { async upsertHtb() { throw new Error(message); } };
}

// ── htb path: UPSERT fires + observability emit ───────────────────────

Deno.test('propagate(htb) — UPSERTs the row AND emits broker_rejection_propagation', async () => {
  const ew = mkCapturingEventWriter();
  const hw = mkCapturingHtbWriter();
  const p = createRejectionPropagator({ htbWriter: hw.writer, eventWriter: ew.writer });

  const decision = await p.propagate({
    symbol: 'GME',
    rejection_reason: 'htb',
    sameTickPasses: [],
    ts: T0,
    order_id: 'o-1',
    client_order_id: 'lse-A-open-1',
  });

  assertEquals(decision?.class, 'htb');
  assertEquals(decision?.persist, true);
  assertEquals(hw.writes.length, 1);
  assertEquals(hw.writes[0].table, 'longshort_short_availability_cache');
  assertEquals(hw.writes[0].row.symbol, 'GME');
  assertEquals(hw.writes[0].row.marked_htb_at, T0.toISOString());
  assertEquals(ew.events.length, 1);
  assertEquals(ew.events[0].call_name, 'broker_rejection_propagation');
  assertEquals(ew.events[0].tier, 'tier2');
  assertEquals(ew.events[0].outcome, 'failure_handled');
  assertEquals(ew.events[0].payload.propagation_class, 'htb');
  assertEquals(ew.events[0].payload.failure_action, 'short_availability_cache_updated_htb');
  assertEquals(ew.events[0].payload.persisted, true);
  assertEquals(ew.events[0].payload.htb_write_succeeded, true);
  assertEquals(ew.events[0].payload.order_id, 'o-1');
});

// ── halted path: NO write + observability emit only ───────────────────

Deno.test('propagate(halted) — NO htb write, observability emit only', async () => {
  const ew = mkCapturingEventWriter();
  const hw = mkCapturingHtbWriter();
  const p = createRejectionPropagator({ htbWriter: hw.writer, eventWriter: ew.writer });

  const decision = await p.propagate({
    symbol: 'AAPL', rejection_reason: 'halted', sameTickPasses: [], ts: T0,
  });

  assertEquals(decision?.class, 'halted');
  assertEquals(decision?.persist, false);
  assertEquals(hw.writes.length, 0); // NO write — live verify_halt_status authoritative
  assertEquals(ew.events.length, 1);
  assertEquals(ew.events[0].call_name, 'broker_rejection_propagation');
  assertEquals(ew.events[0].payload.propagation_class, 'halted');
  assertEquals(ew.events[0].payload.failure_action, 'halt_cache_updated_from_rejection');
  assertEquals(ew.events[0].payload.persisted, false);
});

// ── transient_bp path: NO write + observability emit only ─────────────

Deno.test('propagate(transient_bp) — NO htb write, observability emit only', async () => {
  const ew = mkCapturingEventWriter();
  const hw = mkCapturingHtbWriter();
  const p = createRejectionPropagator({ htbWriter: hw.writer, eventWriter: ew.writer });

  const decision = await p.propagate({
    symbol: 'MSFT', rejection_reason: 'insufficient_buying_power', sameTickPasses: [], ts: T0,
  });

  assertEquals(decision?.class, 'transient_bp');
  assertEquals(decision?.persist, false);
  assertEquals(hw.writes.length, 0);
  assertEquals(ew.events.length, 1);
  assertEquals(ew.events[0].payload.failure_action, 'buying_power_cache_refreshed');
  assertEquals(ew.events[0].payload.persisted, false);
});

// ── system_bug routing ────────────────────────────────────────────────

Deno.test('propagate(htb) with same-tick contradictory pass → tier=tier3 outcome=failure_escalated, write STILL happens', async () => {
  const ew = mkCapturingEventWriter();
  const hw = mkCapturingHtbWriter();
  const p = createRejectionPropagator({ htbWriter: hw.writer, eventWriter: ew.writer });

  const decision = await p.propagate({
    symbol: 'GME',
    rejection_reason: 'htb',
    sameTickPasses: [{ symbol: 'GME', class: 'htb' }],
    ts: T0,
  });

  assertEquals(decision?.outcome, 'system_bug');
  assertEquals(hw.writes.length, 1); // record still written — system_bug doesn't suppress loop-break
  assertEquals(ew.events[0].tier, 'tier3');
  assertEquals(ew.events[0].outcome, 'failure_escalated');
});

// ── unknown / pause-class reasons: no-op ──────────────────────────────

Deno.test('propagate(ssr_violation) — no-op (pause-class deferred, DW-150)', async () => {
  const ew = mkCapturingEventWriter();
  const hw = mkCapturingHtbWriter();
  const p = createRejectionPropagator({ htbWriter: hw.writer, eventWriter: ew.writer });

  const decision = await p.propagate({
    symbol: 'X', rejection_reason: 'ssr_violation', sameTickPasses: [], ts: T0,
  });

  assertEquals(decision, null);
  assertEquals(hw.writes.length, 0);
  assertEquals(ew.events.length, 0);
});

Deno.test('propagate(null reason) — no-op', async () => {
  const ew = mkCapturingEventWriter();
  const hw = mkCapturingHtbWriter();
  const p = createRejectionPropagator({ htbWriter: hw.writer, eventWriter: ew.writer });
  assertEquals(await p.propagate({ symbol: 'X', rejection_reason: null, sameTickPasses: [], ts: T0 }), null);
  assertEquals(ew.events.length, 0);
});

// ── htb write failure: tier-3 diagnostic event + propagation event with persisted=false ─

Deno.test('propagate(htb) with WRITE FAILURE — emits htb_cache_write_failed (tier3) AND propagation event with persisted=false', async () => {
  const ew = mkCapturingEventWriter();
  const p = createRejectionPropagator({
    htbWriter: mkFailingHtbWriter('connection refused'),
    eventWriter: ew.writer,
  });

  const decision = await p.propagate({
    symbol: 'GME', rejection_reason: 'htb', sameTickPasses: [], ts: T0, order_id: 'o-9',
  });

  // Decision still returned (the kernel's classification is sound; only the IO write failed).
  assertEquals(decision?.class, 'htb');

  // Two events: the write-failure diagnostic + the propagation record.
  assertEquals(ew.events.length, 2);
  assertEquals(ew.events[0].call_name, 'longshort.execution.htb_cache_write_failed');
  assertEquals(ew.events[0].tier, 'tier3');
  assertEquals(ew.events[0].outcome, 'failure_escalated');
  assertEquals(ew.events[0].payload.symbol, 'GME');

  assertEquals(ew.events[1].call_name, 'broker_rejection_propagation');
  assertEquals(ew.events[1].payload.persisted, false);
  assertEquals(ew.events[1].payload.htb_write_succeeded, false);
});

// ── Gate-6 wall-clock self-scan ───────────────────────────────────────

Deno.test('Gate-6 — cache-propagator-io.ts contains no wall-clock reads', async () => {
  const src = await Deno.readTextFile(new URL('./cache-propagator-io.ts', import.meta.url));
  assert(!src.includes('Date.now('), 'Date.now( found in I/O shell');
  assert(!src.includes('performance.now('), 'performance.now( found in I/O shell');
  const noArgNewDate = /new Date\(\s*\)/.test(src);
  assert(!noArgNewDate, 'no-arg `new Date()` found in I/O shell');
});