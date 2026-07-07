// FP-069 W3.6.a (ACT-463) — intent taxonomy + flow mapping tests.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  flowForIntent,
  isOvershootIntent,
  OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS_LONG,
  OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS_SHORT,
  holdingSessionsForSide,
  OVERSHOOT_INTENTS,
} from './intents.ts';

Deno.test('intents: exactly three ratified intents', () => {
  assertEquals(OVERSHOOT_INTENTS.length, 3);
  assertEquals([...OVERSHOOT_INTENTS].sort(), ['entry', 'exit_manual', 'exit_time']);
});

Deno.test('R-1 (ACT-478, W3.8 T1): per-side holding constants — LONG=10 (ACT-471), SHORT=5 HARD (ACT-472)', () => {
  assertEquals(OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS_LONG, 10);
  assertEquals(OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS_SHORT, 5);
  assertEquals(holdingSessionsForSide('LONG'), 10);
  assertEquals(holdingSessionsForSide('SHORT'), 5);
});

Deno.test('T3a (ACT-480): deprecated uniform alias OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS is DELETED from intents.ts source', async () => {
  const src = await Deno.readTextFile(new URL('./intents.ts', import.meta.url));
  // Alias must not appear as an export (only as prose docstring reference).
  assertEquals(/export const OVERSHOOT_EXIT_TIME_HOLDING_SESSIONS\s*=/.test(src), false,
    'alias must not be re-exported — T3a deleted it (ACT-480)');
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