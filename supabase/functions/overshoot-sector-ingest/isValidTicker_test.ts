/**
 * Regression coverage for the `isValidTicker` regex after the
 * `no-useless-escape` lint fix (`[A-Z0-9.\-]` → `[A-Z0-9.-]`).
 * Behaviour must be identical: dotted (BRK.B) and hyphenated (MOG-A)
 * tickers still pass; garbage still rejected.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isValidTicker } from './index.ts';

Deno.test('isValidTicker — dotted + hyphenated tickers still pass post-lint-fix', () => {
  assertEquals(isValidTicker('BRK.B'), true);
  assertEquals(isValidTicker('MOG-A'), true);
  assertEquals(isValidTicker('AAPL'), true);
  assertEquals(isValidTicker(''), false);
  assertEquals(isValidTicker('lowercase'), false);
  assertEquals(isValidTicker('TOOLONGTICKER'), false);
  assertEquals(isValidTicker(null), false);
});