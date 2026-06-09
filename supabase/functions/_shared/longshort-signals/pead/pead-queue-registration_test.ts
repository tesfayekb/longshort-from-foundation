// deno-lint-ignore-file no-import-prefix -- std import per FP-045 Phase 3 sentinel pattern
// @ts-nocheck — Deno test file.
/**
 * Drift sentinels for the PEAD queue-worker registration (FP-045 Phase 3).
 *
 * Pins (so a "helpful refactor" cannot silently move them):
 *   - signal_id is `pead_sue_20d` (matches SIGNAL_ID export + DB
 *     `signal_registry` row updated in MIG-081).
 *   - jobId is `longshort.pead.compute` (matches MIG-081 row + the
 *     JOB_ID_TO_SIGNAL_ID mapping used by `longshort-signal-monitor`).
 *   - pre-flight arithmetic budget < 150s HTTP wall (addendum §6).
 *   - registry side-effect aggregator imports the registration module
 *     (so the four edge handlers see PEAD at boot).
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { PEAD_QUEUE_CONFIG, PEAD_QUEUE_JOB_ID } from './pead-queue-registration.ts';
import { SIGNAL_ID } from './pead-orchestrator.ts';
import { JOB_ID_TO_SIGNAL_ID } from '../shared/job-signal-mapping.ts';

Deno.test('PEAD queue: signalId equals the orchestrator SIGNAL_ID export (no drift)', () => {
  assertEquals(PEAD_QUEUE_CONFIG.signalId, SIGNAL_ID);
  assertEquals(PEAD_QUEUE_CONFIG.signalId, 'pead_sue_20d');
});

Deno.test('PEAD queue: jobId matches MIG-081 job_registry row', () => {
  assertEquals(PEAD_QUEUE_JOB_ID, 'longshort.pead.compute');
  assertEquals(PEAD_QUEUE_CONFIG.jobId, 'longshort.pead.compute');
});

Deno.test('signal-monitor mapping: PEAD job_id → pead_sue_20d (no drift)', () => {
  assertEquals(JOB_ID_TO_SIGNAL_ID[PEAD_QUEUE_JOB_ID], PEAD_QUEUE_CONFIG.signalId);
});

Deno.test('PEAD queue: pre-flight arithmetic row fits inside 150s HTTP wall', () => {
  const { sliceSize, callsPerName, ratePerSec } = PEAD_QUEUE_CONFIG;
  const perSlice = (sliceSize * callsPerName) / ratePerSec;
  assert(perSlice < 150,
    `per-slice budget ${perSlice.toFixed(1)}s breaches 150s HTTP wall`);
  // Documented row: 100 × 2 / 4.25 ≈ 47.1s. Pin to one decimal so a tweak
  // to any input requires a deliberate update of the doc + this test.
  assertEquals(Math.round(perSlice * 10) / 10, 47.1);
});

Deno.test('PEAD queue: vendor-cap headroom — ratePerSec ≤ 0.85 × Finnhub cap', () => {
  // Finnhub Estimate-1 cap = 300/min = 5/s. 0.85 × 5 = 4.25.
  assert(PEAD_QUEUE_CONFIG.ratePerSec <= 4.25 + 1e-9,
    `ratePerSec ${PEAD_QUEUE_CONFIG.ratePerSec} exceeds the DEC-047 0.85 safety margin`);
});

Deno.test('production-registrations aggregator imports the PEAD registration', async () => {
  // Read the aggregator source verbatim — guards against a future edit
  // that removes the PEAD line (which would silently un-register PEAD
  // from every handler that imports the aggregator).
  const src = await Deno.readTextFile(new URL(
    '../shared/queue-worker/production-registrations.ts', import.meta.url,
  ));
  assert(src.includes("from '../../pead/pead-queue-registration.ts'"),
    'aggregator must import pead-queue-registration');
  assert(src.includes('registerPeadQueueConsumer()'),
    'aggregator must invoke registerPeadQueueConsumer()');
});