/**
 * Regression coverage for the `isValidTicker` regex after the
 * `no-useless-escape` lint fix (`[A-Z0-9.\-]` → `[A-Z0-9.-]`).
 * Behaviour must be identical: dotted (BRK.B) and hyphenated (MOG-A)
 * tickers still pass; garbage still rejected.
 *
 * CONTRACT: `isValidTicker` NORMALIZES then VALIDATES — it applies
 * `.trim().toUpperCase()` before the regex test. So `'lowercase'` becomes
 * `'LOWERCASE'` (9 chars, [A-Z]-lead) and is CORRECTLY accepted. The
 * probeTicker path at index.ts:206 relies on this normalize-then-validate
 * contract (accepted tickers are subsequently trimmed+upper-cased at
 * index.ts:261). Invalid samples must therefore be genuinely invalid AFTER
 * normalization: contain whitespace/punctuation, start with a digit, be
 * empty, non-string, or exceed the 10-char length cap.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isValidTicker } from './index.ts';

Deno.test('isValidTicker — dotted + hyphenated tickers still pass post-lint-fix', () => {
  assertEquals(isValidTicker('BRK.B'), true);
  assertEquals(isValidTicker('MOG-A'), true);
  assertEquals(isValidTicker('AAPL'), true);
  // Normalize-then-validate contract: lowercase input is upper-cased before regex.
  assertEquals(isValidTicker('lowercase'), true);
  // Genuinely-invalid samples (invalid AFTER normalization):
  assertEquals(isValidTicker(''), false);
  assertEquals(isValidTicker('BAD TICKER'), false); // whitespace inside
  assertEquals(isValidTicker('1ABC'), false);       // digit-first violates [A-Z]-lead
  assertEquals(isValidTicker('TOOLONGTICKER13'), false); // exceeds 10-char cap
  assertEquals(isValidTicker(null), false);
});