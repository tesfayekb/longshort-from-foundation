import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { classifyRejection } from './rejection-classifier.ts';

Deno.test('halted → tier2_skip', () => {
  assertEquals(classifyRejection('symbol halted by exchange', 'entry'), 'tier2_skip');
  assertEquals(classifyRejection('HALTED', 'entry'), 'tier2_skip');
});

Deno.test('htb / hard_to_borrow → tier2_skip', () => {
  assertEquals(classifyRejection('htb: no inventory', 'entry'), 'tier2_skip');
  assertEquals(classifyRejection('hard_to_borrow', 'entry'), 'tier2_skip');
  assertEquals(classifyRejection('hard-to-borrow', 'entry'), 'tier2_skip');
});

Deno.test('insufficient_buying_power → tier2_skip (v1 transient default; DW-144 persistent)', () => {
  assertEquals(classifyRejection('insufficient_buying_power', 'entry'), 'tier2_skip');
  assertEquals(classifyRejection('Insufficient Buying Power', 'rank_exit'), 'tier2_skip');
});

Deno.test('ssr_violation → tier3_pause', () => {
  assertEquals(classifyRejection('ssr_violation', 'entry'), 'tier3_pause');
  assertEquals(classifyRejection('SHORT_SALE_RESTRICTED', 'entry'), 'tier3_pause');
});

Deno.test('pdt_block → tier3_pause', () => {
  assertEquals(classifyRejection('pdt_block', 'entry'), 'tier3_pause');
  assertEquals(classifyRejection('pattern_day_trader rule', 'entry'), 'tier3_pause');
});

Deno.test('null / empty / unknown → tier3_pause (anti-phantom default)', () => {
  assertEquals(classifyRejection(null, 'entry'), 'tier3_pause');
  assertEquals(classifyRejection('', 'entry'), 'tier3_pause');
  assertEquals(classifyRejection('weird_broker_error_42', 'entry'), 'tier3_pause');
});

Deno.test('tier-2 precedence over tier-3 token (substring match order)', () => {
  // A reason containing BOTH 'halted' and 'ssr' should hit tier-2 first.
  assertEquals(classifyRejection('symbol halted; ssr context', 'entry'), 'tier2_skip');
});