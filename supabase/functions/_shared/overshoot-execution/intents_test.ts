// FP-069 W3.6.a (ACT-463) — intent taxonomy + flow mapping tests.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  flowForIntent,
  isOvershootIntent,
  OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS,
  OVERSHOOT_INTENTS,
} from './intents.ts';

Deno.test('intents: exactly three ratified intents', () => {
  assertEquals(OVERSHOOT_INTENTS.length, 3);
  assertEquals([...OVERSHOOT_INTENTS].sort(), ['entry', 'exit_manual', 'exit_time']);
});

Deno.test('intents: T+5 uniform holding basis constant (P-B#3 corrected)', () => {
  assertEquals(OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS, 5);
});

Deno.test('intents: type-guard accepts ratified intents, rejects everything else', () => {
  for (const i of OVERSHOOT_INTENTS) assert(isOvershootIntent(i));
  assert(!isOvershootIntent('exit'));
  assert(!isOvershootIntent(''));
  assert(!isOvershootIntent(null));
});

Deno.test('intents: flow mapping honors long/short + entry/exit contract', () => {
  assertEquals(flowForIntent('entry', 'LONG'), 'buy');
  assertEquals(flowForIntent('entry', 'SHORT'), 'sell_short');
  assertEquals(flowForIntent('exit_time', 'LONG'), 'sell');
  assertEquals(flowForIntent('exit_time', 'SHORT'), 'buy_to_close');
  assertEquals(flowForIntent('exit_manual', 'LONG'), 'sell');
  assertEquals(flowForIntent('exit_manual', 'SHORT'), 'buy_to_close');
});