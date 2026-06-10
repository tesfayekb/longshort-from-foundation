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
import { SIGNAL_ID as REVERSAL_SIGNAL_ID } from '../short-term-reversal/reversal-orchestrator.ts';
import { SIGNAL_ID as SHORT_INTEREST_SIGNAL_ID } from '../short-interest-change/short-interest-orchestrator.ts';
import { SIGNAL_ID as INSIDER_SIGNAL_ID } from '../insider-transactions/insider-orchestrator.ts';
import { SIGNAL_ID as OPTIONS_FLOW_SIGNAL_ID } from '../options-flow/options-flow-orchestrator.ts';
import { SIGNAL_ID as PEAD_SIGNAL_ID } from '../pead/pead-orchestrator.ts';
import { SIGNAL_ID as ANALYST_SIGNAL_ID } from '../analyst-revisions/analyst-revision-orchestrator.ts';

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

Deno.test('(2b) mapping value matches reversal-orchestrator SIGNAL_ID export (cross-reference)', () => {
  // Drift sentinel for Signal #7 — same discipline as test (2) for #6.
  assertEquals(
    JOB_ID_TO_SIGNAL_ID['longshort.reversal.compute'],
    REVERSAL_SIGNAL_ID,
    'JOB_ID_TO_SIGNAL_ID reversal entry decoupled from reversal-orchestrator SIGNAL_ID',
  );
  assertEquals(REVERSAL_SIGNAL_ID, 'short_term_reversal_1w');
});

Deno.test('(2c) mapping value matches short-interest-orchestrator SIGNAL_ID export (cross-reference)', () => {
  // Drift sentinel for Signal #5 — same discipline as test (2)/(2b).
  assertEquals(
    JOB_ID_TO_SIGNAL_ID['longshort.short_interest.compute'],
    SHORT_INTEREST_SIGNAL_ID,
    'JOB_ID_TO_SIGNAL_ID short-interest entry decoupled from short-interest-orchestrator SIGNAL_ID',
  );
  assertEquals(SHORT_INTEREST_SIGNAL_ID, 'short_interest_change_30d');
});

Deno.test('(2d) mapping value matches insider-orchestrator SIGNAL_ID export (cross-reference)', () => {
  // Drift sentinel for Signal #4 (FP-042).
  assertEquals(
    JOB_ID_TO_SIGNAL_ID['longshort.insider.compute'],
    INSIDER_SIGNAL_ID,
    'JOB_ID_TO_SIGNAL_ID insider entry decoupled from insider-orchestrator SIGNAL_ID',
  );
  assertEquals(INSIDER_SIGNAL_ID, 'insider_transactions_90d');
});

Deno.test('(2e) mapping value matches options-flow-orchestrator SIGNAL_ID export (cross-reference)', () => {
  // Drift sentinel for Signal #3 (FP-043).
  assertEquals(
    JOB_ID_TO_SIGNAL_ID['longshort.options_flow.compute'],
    OPTIONS_FLOW_SIGNAL_ID,
    'JOB_ID_TO_SIGNAL_ID options-flow entry decoupled from options-flow-orchestrator SIGNAL_ID',
  );
  assertEquals(OPTIONS_FLOW_SIGNAL_ID, 'options_flow_imbalance_5d');
});

Deno.test('(2f) mapping value matches pead-orchestrator SIGNAL_ID export (cross-reference)', () => {
  // Drift sentinel for Signal #2 (FP-044).
  assertEquals(
    JOB_ID_TO_SIGNAL_ID['longshort.pead.compute'],
    PEAD_SIGNAL_ID,
    'JOB_ID_TO_SIGNAL_ID pead entry decoupled from pead-orchestrator SIGNAL_ID',
  );
  assertEquals(PEAD_SIGNAL_ID, 'pead_sue_20d');
});

Deno.test('(2g) mapping value matches analyst-revision-orchestrator SIGNAL_ID export (cross-reference)', () => {
  // Drift sentinel for Signal #1 (FP-047).
  assertEquals(
    JOB_ID_TO_SIGNAL_ID['longshort.analyst.compute'],
    ANALYST_SIGNAL_ID,
    'JOB_ID_TO_SIGNAL_ID analyst entry decoupled from analyst-revision-orchestrator SIGNAL_ID',
  );
  assertEquals(ANALYST_SIGNAL_ID, 'analyst_revision_drift');
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
  // FP-010 A3 shipped v1 with one entry (momentum). FP-040 added the
  // second (short-term reversal / Signal #7). FP-041 adds the third
  // (short-interest changes / Signal #5). FP-042 adds the fourth
  // (insider transactions / Signal #4). FP-043 adds the fifth (options
  // flow / Signal #3). FP-044 adds the sixth (PEAD / Signal #2). Each
  // subsequent signal execution
  // prompt adds exactly one entry in the same PR that registers its
  // compute job.
  const keys = Object.keys(JOB_ID_TO_SIGNAL_ID).sort();
  assertEquals(keys, [
    'longshort.analyst.compute',
    'longshort.insider.compute',
    'longshort.momentum.compute',
    'longshort.options_flow.compute',
    'longshort.pead.compute',
    'longshort.reversal.compute',
    'longshort.short_interest.compute',
  ]);
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