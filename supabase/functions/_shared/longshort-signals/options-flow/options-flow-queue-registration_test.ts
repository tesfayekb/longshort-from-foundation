// deno-lint-ignore-file no-import-prefix -- std import per FP-045 sentinel pattern
// @ts-nocheck — Deno test file.
/**
 * Drift sentinels for the options-flow queue-worker registration
 * (FP-045 Phase 4 — Signal #3 revival; closes DW-095).
 *
 * Pins:
 *   - signal_id is `options_flow_imbalance_5d` (matches SIGNAL_ID
 *     export + DB `signal_registry` row).
 *   - jobId is `longshort.options_flow.compute` (matches MIG-078 row +
 *     the JOB_ID_TO_SIGNAL_ID mapping used by `longshort-signal-monitor`).
 *   - pre-flight arithmetic budget < 150s HTTP wall.
 *   - vendor-cap headroom ≤ 0.85 × 120/min Tradier cap (ACT-157).
 *   - registry side-effect aggregator imports the registration module.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  OPTIONS_FLOW_QUEUE_CONFIG,
  OPTIONS_FLOW_QUEUE_JOB_ID,
} from './options-flow-queue-registration.ts';
import { SIGNAL_ID } from './options-flow-orchestrator.ts';
import { JOB_ID_TO_SIGNAL_ID } from '../shared/job-signal-mapping.ts';

Deno.test('options-flow queue: signalId equals the orchestrator SIGNAL_ID export (no drift)', () => {
  assertEquals(OPTIONS_FLOW_QUEUE_CONFIG.signalId, SIGNAL_ID);
  assertEquals(OPTIONS_FLOW_QUEUE_CONFIG.signalId, 'options_flow_imbalance_5d');
});

Deno.test('options-flow queue: jobId matches MIG-078 job_registry row', () => {
  assertEquals(OPTIONS_FLOW_QUEUE_JOB_ID, 'longshort.options_flow.compute');
  assertEquals(OPTIONS_FLOW_QUEUE_CONFIG.jobId, 'longshort.options_flow.compute');
});

Deno.test('signal-monitor mapping: options-flow job_id → options_flow_imbalance_5d (no drift)', () => {
  assertEquals(
    JOB_ID_TO_SIGNAL_ID[OPTIONS_FLOW_QUEUE_JOB_ID],
    OPTIONS_FLOW_QUEUE_CONFIG.signalId,
  );
});

Deno.test('options-flow queue: pre-flight arithmetic row fits inside 150s HTTP wall', () => {
  const { sliceSize, ratePerSec } = OPTIONS_FLOW_QUEUE_CONFIG;
  // Wire-call budget (the binding constraint — 2 wire calls per ticker
  // sequentialized through the token-bucket).
  const perSliceWire = (sliceSize * 2) / ratePerSec;
  assert(perSliceWire < 150,
    `per-slice wire budget ${perSliceWire.toFixed(1)}s breaches 150s HTTP wall`);
  // Documented row: 80 × 2 / 1.7 ≈ 94.1s. Pin to one decimal so a tweak
  // requires a deliberate update of the doc + this test.
  assertEquals(Math.round(perSliceWire * 10) / 10, 94.1);
});

Deno.test('options-flow queue: vendor-cap headroom — ratePerSec ≤ 0.85 × Tradier cap', () => {
  // Tradier production market-data cap = 120/min = 2/s. 0.85 × 2 = 1.7.
  assert(
    OPTIONS_FLOW_QUEUE_CONFIG.ratePerSec <= 1.7 + 1e-9,
    `ratePerSec ${OPTIONS_FLOW_QUEUE_CONFIG.ratePerSec} exceeds the DEC-047 0.85 safety margin (ACT-157 120/min cap)`,
  );
});

Deno.test('production-registrations aggregator imports the options-flow registration', async () => {
  const src = await Deno.readTextFile(new URL(
    '../shared/queue-worker/production-registrations.ts', import.meta.url,
  ));
  assert(src.includes("from '../../options-flow/options-flow-queue-registration.ts'"),
    'aggregator must import options-flow-queue-registration');
  assert(src.includes('registerOptionsFlowQueueConsumer()'),
    'aggregator must invoke registerOptionsFlowQueueConsumer()');
});