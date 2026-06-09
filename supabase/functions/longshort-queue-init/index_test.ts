// deno-lint-ignore-file no-import-prefix -- std assert import
// @ts-nocheck — source-sentinel test for longshort-queue-init handler.
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const SRC = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('POST-only + verifyCronSecret precede any DB work', () => {
  assert(SRC.includes("req.method !== 'POST'"));
  assert(SRC.includes('verifyCronSecret(req)'));
  // No JWT authentication on this cron path.
  assert(!SRC.includes('authenticateRequest('));
});

Deno.test('body validation: signal_id_required + unknown_signal_id paths', () => {
  assert(SRC.includes("'signal_id_required'"));
  assert(SRC.includes("'unknown_signal_id'"));
});

Deno.test('uses productionQueueRegistry + productionClock (no Date.now)', () => {
  assert(SRC.includes('productionQueueRegistry'));
  assert(SRC.includes('productionClock.getWallClockTs()'));
  const code = SRC
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/Date\.now\s*\(/.test(code));
  assert(!/new\s+Date\s*\(\s*\)/.test(code));
});

Deno.test('emits RUN_STARTED + RUN_FAILED via QUEUE_AUDIT_EVENTS (no string literals)', () => {
  assert(SRC.includes('QUEUE_AUDIT_EVENTS.RUN_STARTED'));
  assert(SRC.includes('QUEUE_AUDIT_EVENTS.RUN_FAILED'));
  assert(!SRC.includes("'longshort.signal_queue.run.started'"));
});

Deno.test('returns 202 on init result (cursor-drain runs async)', () => {
  assert(/apiSuccess\([^)]*,\s*202\s*\)/.test(SRC));
});

Deno.test('no any / no eslint-disable / no deno-lint-ignore', () => {
  assert(!/:\s*any\b/.test(SRC));
  assert(!SRC.includes('eslint-disable'));
  assert(!SRC.includes('deno-lint-ignore'));
});