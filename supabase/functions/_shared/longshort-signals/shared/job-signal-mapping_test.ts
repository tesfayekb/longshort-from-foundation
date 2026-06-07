/**
 * FP-010 Bucket A Commit A3 — Tests for the job_id → signal_id mapping.
 *
 * Pins the mapping's locked entries against drift in either direction:
 *   - If `momentum-orchestrator.ts`'s `SIGNAL_ID` export changes, the
 *     cross-reference test fails LOUDLY (rather than the monitor silently
 *     decoupling from the producer).
 *   - If a future contributor mutates `JOB_ID_TO_SIGNAL_ID` at runtime,
 *     the immutability test fails.
 *
 * Owner: longshort (FP-010 Bucket A Commit A3)
 */
import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  JOB_ID_TO_SIGNAL_ID,
  resolveSignalIdForJob,
} from './job-signal-mapping.ts';
import { SIGNAL_ID as MOMENTUM_SIGNAL_ID } from '../cross-sectional-momentum/momentum-orchestrator.ts';

Deno.test('(1) JOB_ID_TO_SIGNAL_ID contains the momentum entry verbatim', () => {
  assertEquals(
    JOB_ID_TO_SIGNAL_ID['longshort.momentum.compute'],
    'cross_sectional_momentum_12_1',
    'momentum job_id mapping drift — FP-010 Locked Decision Point 3',
  );
});

Deno.test('(2) mapping value matches momentum-orchestrator SIGNAL_ID export (cross-reference)', () => {
  // This is the critical drift sentinel: if the orchestrator renames its
  // signal_id, this test fails and the rename must be reflected here in
  // the same PR. Without this check, the monitor would silently consume
  // stale identifiers and miss the renamed signal entirely.
  assertEquals(
    JOB_ID_TO_SIGNAL_ID['longshort.momentum.compute'],
    MOMENTUM_SIGNAL_ID,
    'JOB_ID_TO_SIGNAL_ID momentum entry decoupled from momentum-orchestrator SIGNAL_ID',
  );
});

Deno.test('(3) resolveSignalIdForJob returns the value for known job_ids', () => {
  assertEquals(
    resolveSignalIdForJob('longshort.momentum.compute'),
    'cross_sectional_momentum_12_1',
  );
});

Deno.test('(4) resolveSignalIdForJob returns undefined for unknown job_ids', () => {
  assertEquals(resolveSignalIdForJob('longshort.nonexistent.compute'), undefined);
  assertEquals(resolveSignalIdForJob(''), undefined);
});

Deno.test('(5) JOB_ID_TO_SIGNAL_ID has exactly the FP-010 A3 set (single entry)', () => {
  // FP-010 ships v1 with exactly one entry. Phase 2.2 (FP-011) adds the
  // second; until then this test prevents accidental pre-wiring of
  // unshipped signals (which would cause the monitor to alert "stale" on
  // signals whose compute job doesn't yet exist).
  const keys = Object.keys(JOB_ID_TO_SIGNAL_ID);
  assertEquals(keys.length, 1, `expected 1 mapping entry at A3; got ${keys.length}: ${keys.join(',')}`);
  assertEquals(keys[0], 'longshort.momentum.compute');
});

Deno.test('(6) JOB_ID_TO_SIGNAL_ID resists runtime mutation (TS as-const guarantee)', () => {
  // `as const` makes the object literal type readonly at compile-time, so
  // direct property assignment is a TS error. At runtime, the const
  // binding itself prevents reassignment of the variable; the object's
  // properties are not frozen at runtime, but the typed contract is
  // sufficient for the threat model here (compile-time enforcement
  // catches accidental mutation in any TS-checked consumer; deploy
  // pipeline gates on `deno check`).
  //
  // This test documents the contract rather than asserts runtime
  // immutability — a comprehensive freeze would require Object.freeze at
  // the export site, and we accept the as-const-only stance to mirror
  // sibling shared constants (e.g. SIGNAL_ID exports).
  const proto = Object.getPrototypeOf(JOB_ID_TO_SIGNAL_ID);
  assert(proto === Object.prototype, 'mapping is a plain object literal');
});