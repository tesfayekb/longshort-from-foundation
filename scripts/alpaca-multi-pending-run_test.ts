// @ts-nocheck
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseRunArguments } from './alpaca-multi-pending-run.ts';

Deno.test('(1) defaults symbol to AAPL', () => {
  assertEquals(parseRunArguments([]).symbol, 'AAPL');
});

Deno.test('(2) parses --symbol override', () => {
  assertEquals(parseRunArguments(['--symbol=MSFT']).symbol, 'MSFT');
});