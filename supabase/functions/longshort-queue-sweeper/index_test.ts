// deno-lint-ignore-file no-import-prefix -- std assert import
// @ts-nocheck — source-sentinel test for longshort-queue-sweeper handler.
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const SRC = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('POST-only + verifyCronSecret', () => {
  assert(SRC.includes("req.method !== 'POST'"));
  assert(SRC.includes('verifyCronSecret(req)'));
});

Deno.test('invokes runQueueSweeper with productionQueueRegistry', () => {
  assert(SRC.includes('runQueueSweeper('));
  assert(SRC.includes('registry: productionQueueRegistry'));
});

Deno.test('emits RUN_FAILED per signal with failed_out > 0 (stale_heartbeat reason)', () => {
  assert(SRC.includes('QUEUE_AUDIT_EVENTS.RUN_FAILED'));
  assert(SRC.includes("failure_reason: 'stale_heartbeat'"));
});

Deno.test('no any / no eslint-disable / no Date.now', () => {
  assert(!/:\s*any\b/.test(SRC));
  assert(!SRC.includes('eslint-disable'));
  const code = SRC
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/Date\.now\s*\(/.test(code));
});