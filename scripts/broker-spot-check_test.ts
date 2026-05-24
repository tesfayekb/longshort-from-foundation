import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { runSpotCheck } from './broker-spot-check.ts';

Deno.test("broker-spot-check: --check + --symbol required", () => {
  assertThrows(() => runSpotCheck({ check: '', symbol: '', provider: 'mock' }), Error, 'required');
});

Deno.test("broker-spot-check: --provider=alpaca surfaces deferred-to-6.7", () => {
  const result = runSpotCheck({ check: 'verify_position', symbol: 'AAPL', provider: 'alpaca' });
  assertEquals(result.provider, 'alpaca');
  assertEquals(result.result, null);
  assertEquals(result.message.includes('sub-step 6.7'), true);
});

Deno.test("broker-spot-check: --provider=mock returns canned response", () => {
  const result = runSpotCheck({ check: 'verify_quote', symbol: 'AAPL', provider: 'mock' });
  assertEquals(result.provider, 'mock');
  assertEquals(typeof result.result, 'object');
});