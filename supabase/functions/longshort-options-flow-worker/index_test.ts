/**
 * Source-sentinel test for `longshort-options-flow-worker` — DEPRECATED
 * by FP-045 Phase 4. The handler now returns 410 Gone with a structured
 * pointer at the queue-worker enqueue paths. The original FP-043 worker
 * body is removed; the chunk-runner module remains in the tree (FP-043
 * preservation promise) and is mirrored by the queue adapter.
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('(1) returns 410 Gone with deprecation envelope', () => {
  assert(HANDLER_SOURCE.includes('status: 410'));
  assert(HANDLER_SOURCE.includes("'options_flow_worker_deprecated'"));
  assert(HANDLER_SOURCE.includes('replaced_by'));
});

Deno.test('(2) FP-043 worker body REMOVED — no Tradier fetcher / token-bucket / chunk runner imports', () => {
  assert(!HANDLER_SOURCE.includes('TradierOptionsChainFetcher'));
  assert(!HANDLER_SOURCE.includes('new TokenBucket'));
  assert(!HANDLER_SOURCE.includes('runOptionsFlowChunk'));
  assert(!HANDLER_SOURCE.includes('verifyCronSecret'),
    'deprecated handler should not require cron-secret — it serves 410 unconditionally');
});

Deno.test('(3) pointer to queue enqueue paths present in response body', () => {
  assert(HANDLER_SOURCE.includes('/functions/v1/longshort-options-flow-compute'));
  assert(HANDLER_SOURCE.includes('longshort-queue-slice'));
});

Deno.test('(4) no any / no eslint-disable / no deno-lint-ignore', () => {
  assert(!/:\s*any\b/.test(HANDLER_SOURCE));
  assert(!HANDLER_SOURCE.includes('eslint-disable'));
  assert(!HANDLER_SOURCE.includes('deno-lint-ignore'));
});