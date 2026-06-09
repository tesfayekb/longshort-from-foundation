// @ts-nocheck — source-sentinel test for longshort-queue-slice handler.
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const SRC = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('POST-only + verifyCronSecret', () => {
  assert(SRC.includes("req.method !== 'POST'"));
  assert(SRC.includes('verifyCronSecret(req)'));
  assert(!SRC.includes('authenticateRequest('));
});

Deno.test('picks oldest running run across ALL signals (addendum §5 serialization)', () => {
  assert(SRC.includes('pickOldestRunningRun(supabaseAdmin, productionQueueRegistry)'));
});

Deno.test('runs slice → emits SLICE_COMPLETED', () => {
  assert(SRC.includes('runQueueSlice('));
  assert(SRC.includes('QUEUE_AUDIT_EVENTS.SLICE_COMPLETED'));
  assert(SRC.includes('QUEUE_AUDIT_EVENTS.SLICE_FAILED'));
});

Deno.test('finalizer invoked in-process on CAS win', () => {
  assert(SRC.includes('sliceResult.cas_won'));
  assert(SRC.includes('runQueueFinalizer('));
  assert(SRC.includes('QUEUE_AUDIT_EVENTS.RUN_COMPLETED'));
  assert(SRC.includes('QUEUE_AUDIT_EVENTS.RUN_FAILED'));
});

Deno.test('no any / no eslint-disable / no Date.now / no new Date()', () => {
  assert(!/:\s*any\b/.test(SRC));
  assert(!SRC.includes('eslint-disable'));
  const code = SRC
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/Date\.now\s*\(/.test(code));
  assert(!/new\s+Date\s*\(\s*\)/.test(code));
});