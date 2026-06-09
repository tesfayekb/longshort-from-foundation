// @ts-nocheck — Deno test file.
import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createTestRegistry,
  productionQueueRegistry,
  type QueueSignalConfig,
} from './queue-config.ts';

function makeCfg(overrides: Partial<QueueSignalConfig> = {}): QueueSignalConfig {
  return {
    signalId: 'test_signal',
    jobId: 'job-test',
    ratePerSec: 1,
    callsPerName: 1,
    sliceSize: 10,
    heartbeatTimeoutSec: 300,
    stagingTtlSec: 86400,
    fetchAndCompute: async () => ({ kind: 'value', raw: 0 }),
    ...overrides,
  };
}

Deno.test('production registry ships empty in Phase 2', () => {
  assertEquals(productionQueueRegistry.listSignalIds(), []);
});

Deno.test('register + get round-trips', () => {
  const r = createTestRegistry();
  r.register(makeCfg());
  assertEquals(r.get('test_signal').signalId, 'test_signal');
  assert(r.has('test_signal'));
  assertEquals(r.listSignalIds(), ['test_signal']);
});

Deno.test('duplicate register throws', () => {
  const r = createTestRegistry();
  r.register(makeCfg());
  assertThrows(() => r.register(makeCfg()), Error, 'already registered');
});

Deno.test('get on missing throws (no silent fallback)', () => {
  const r = createTestRegistry();
  assertThrows(() => r.get('nope'), Error, 'no config registered');
});

Deno.test('listSignalIds is sorted (stable order for sweeper iteration)', () => {
  const r = createTestRegistry();
  r.register(makeCfg({ signalId: 'z' }));
  r.register(makeCfg({ signalId: 'a' }));
  r.register(makeCfg({ signalId: 'm' }));
  assertEquals(r.listSignalIds(), ['a', 'm', 'z']);
});

Deno.test('validates ratePerSec > 0', () => {
  const r = createTestRegistry();
  assertThrows(() => r.register(makeCfg({ ratePerSec: 0 })), Error, 'ratePerSec');
  assertThrows(() => r.register(makeCfg({ ratePerSec: -1 })), Error, 'ratePerSec');
});

Deno.test('validates integer fields', () => {
  const r = createTestRegistry();
  assertThrows(() => r.register(makeCfg({ callsPerName: 0 })), Error, 'callsPerName');
  assertThrows(() => r.register(makeCfg({ sliceSize: 1.5 })), Error, 'sliceSize');
  assertThrows(() => r.register(makeCfg({ heartbeatTimeoutSec: 0 })), Error, 'heartbeatTimeoutSec');
  assertThrows(() => r.register(makeCfg({ stagingTtlSec: -1 })), Error, 'stagingTtlSec');
});

Deno.test('validates required string fields', () => {
  const r = createTestRegistry();
  assertThrows(() => r.register(makeCfg({ signalId: '' })), Error, 'signalId');
  assertThrows(() => r.register(makeCfg({ jobId: '' })), Error, 'jobId');
});