/**
 * cache-propagator_test — FP-056 E4 (ACT-312). Pure classifier + write-spec.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  classifyRejectionPropagation,
  computeHtbRecordWrite,
  FAILURE_ACTIONS,
  HTB_TTL_SECONDS,
  type SameTickContradictoryPass,
} from './cache-propagator.ts';

const T0 = new Date('2026-06-24T20:30:00Z');

// ── Classifier: class detection (lowercase substring) ─────────────────

Deno.test('classify — halted reason → class=halted, persist=false, failure_action verbatim', () => {
  const d = classifyRejectionPropagation({ symbol: 'AAPL', rejection_reason: 'halted', sameTickPasses: [] });
  assert(d);
  assertEquals(d.class, 'halted');
  assertEquals(d.persist, false);
  assertEquals(d.failure_action, 'halt_cache_updated_from_rejection');
  assertEquals(d.failure_action, FAILURE_ACTIONS.halted);
});

Deno.test('classify — case-insensitive HALT match', () => {
  const d = classifyRejectionPropagation({ symbol: 'X', rejection_reason: 'Symbol HALTED by exchange', sameTickPasses: [] });
  assertEquals(d?.class, 'halted');
});

Deno.test('classify — htb reason → class=htb, persist=true, failure_action verbatim', () => {
  const d = classifyRejectionPropagation({ symbol: 'GME', rejection_reason: 'htb', sameTickPasses: [] });
  assert(d);
  assertEquals(d.class, 'htb');
  assertEquals(d.persist, true);
  assertEquals(d.failure_action, 'short_availability_cache_updated_htb');
});

Deno.test('classify — hard_to_borrow alias → class=htb', () => {
  assertEquals(
    classifyRejectionPropagation({ symbol: 'X', rejection_reason: 'hard_to_borrow', sameTickPasses: [] })?.class,
    'htb',
  );
});

Deno.test('classify — hard-to-borrow alias → class=htb', () => {
  assertEquals(
    classifyRejectionPropagation({ symbol: 'X', rejection_reason: 'Hard-To-Borrow security', sameTickPasses: [] })?.class,
    'htb',
  );
});

Deno.test('classify — insufficient_buying_power → class=transient_bp, persist=false, failure_action verbatim', () => {
  const d = classifyRejectionPropagation({ symbol: 'X', rejection_reason: 'insufficient_buying_power', sameTickPasses: [] });
  assert(d);
  assertEquals(d.class, 'transient_bp');
  assertEquals(d.persist, false);
  assertEquals(d.failure_action, 'buying_power_cache_refreshed');
});

Deno.test('classify — insufficient buying power (spaces variant) → class=transient_bp', () => {
  assertEquals(
    classifyRejectionPropagation({ symbol: 'X', rejection_reason: 'insufficient buying power for short', sameTickPasses: [] })?.class,
    'transient_bp',
  );
});

// ── Classifier: unmatched / null / empty → null (NOT propagator's surface) ─

Deno.test('classify — null reason → null (no propagation)', () => {
  assertEquals(classifyRejectionPropagation({ symbol: 'X', rejection_reason: null, sameTickPasses: [] }), null);
});

Deno.test('classify — empty reason → null', () => {
  assertEquals(classifyRejectionPropagation({ symbol: 'X', rejection_reason: '', sameTickPasses: [] }), null);
});

Deno.test('classify — ssr_violation (pause-class, NOT in NO-PAUSE scope) → null', () => {
  assertEquals(
    classifyRejectionPropagation({ symbol: 'X', rejection_reason: 'ssr_violation', sameTickPasses: [] }),
    null,
  );
});

Deno.test('classify — pdt_block → null (DW-151 deferred)', () => {
  assertEquals(
    classifyRejectionPropagation({ symbol: 'X', rejection_reason: 'pdt_block', sameTickPasses: [] }),
    null,
  );
});

Deno.test('classify — unknown reason → null', () => {
  assertEquals(
    classifyRejectionPropagation({ symbol: 'X', rejection_reason: 'unknown_alpaca_error', sameTickPasses: [] }),
    null,
  );
});

// ── Classifier: system_bug via same-tick contradiction ────────────────

Deno.test('classify — same-tick contradictory pass on same symbol+class → outcome=system_bug', () => {
  const passes: SameTickContradictoryPass[] = [{ symbol: 'GME', class: 'htb' }];
  const d = classifyRejectionPropagation({ symbol: 'GME', rejection_reason: 'htb', sameTickPasses: passes });
  assertEquals(d?.outcome, 'system_bug');
  assertEquals(d?.persist, true); // still persists — system_bug doesn't suppress the loop-break record
});

Deno.test('classify — contradictory pass on DIFFERENT symbol → outcome=failure_handled (no contradiction for THIS rejection)', () => {
  const passes: SameTickContradictoryPass[] = [{ symbol: 'AAPL', class: 'htb' }];
  const d = classifyRejectionPropagation({ symbol: 'GME', rejection_reason: 'htb', sameTickPasses: passes });
  assertEquals(d?.outcome, 'failure_handled');
});

Deno.test('classify — contradictory pass on DIFFERENT class → outcome=failure_handled', () => {
  const passes: SameTickContradictoryPass[] = [{ symbol: 'GME', class: 'halted' }];
  const d = classifyRejectionPropagation({ symbol: 'GME', rejection_reason: 'htb', sameTickPasses: passes });
  assertEquals(d?.outcome, 'failure_handled');
});

Deno.test('classify — empty sameTickPasses → outcome=failure_handled', () => {
  const d = classifyRejectionPropagation({ symbol: 'X', rejection_reason: 'halted', sameTickPasses: [] });
  assertEquals(d?.outcome, 'failure_handled');
});

// ── computeHtbRecordWrite ─────────────────────────────────────────────

Deno.test('computeHtbRecordWrite — table + row.symbol + ISO marked_htb_at', () => {
  const w = computeHtbRecordWrite('GME', T0);
  assertEquals(w.table, 'longshort_short_availability_cache');
  assertEquals(w.row.symbol, 'GME');
  assertEquals(w.row.marked_htb_at, T0.toISOString());
});

Deno.test('computeHtbRecordWrite — expires_at = marked_htb_at + HTB_TTL_SECONDS (24h)', () => {
  const w = computeHtbRecordWrite('GME', T0);
  const expected = new Date(T0.getTime() + HTB_TTL_SECONDS * 1000).toISOString();
  assertEquals(w.row.expires_at, expected);
  assertEquals(HTB_TTL_SECONDS, 86400);
});

Deno.test('computeHtbRecordWrite — deterministic on ts (no Date.now)', () => {
  const w1 = computeHtbRecordWrite('X', T0);
  const w2 = computeHtbRecordWrite('X', T0);
  assertEquals(w1, w2);
});

// ── Gate-6 wall-clock self-scan (pure module) ─────────────────────────

Deno.test('Gate-6 — cache-propagator.ts contains no wall-clock reads', async () => {
  const src = await Deno.readTextFile(new URL('./cache-propagator.ts', import.meta.url));
  assert(!src.includes('Date.now('), 'Date.now( found in pure module');
  assert(!src.includes('performance.now('), 'performance.now( found in pure module');
  // no-arg `new Date()` would be a wall-clock read; injected `ts` is the only Date source.
  // Regex avoids matching `new Date(ts...)` / `new Date(ts.getTime()+...)`.
  const noArgNewDate = /new Date\(\s*\)/.test(src);
  assert(!noArgNewDate, 'no-arg `new Date()` found in pure module');
});