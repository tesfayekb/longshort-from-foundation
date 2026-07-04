// FP-069 W3.6.a (ACT-463) — state-machine reachability + absorbing-terminal
// + retry-shape tests. Every 6 terminals reachable; illegal moves throw.

import {
  assert,
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  isOvershootTerminal,
  legalTerminalsFor,
  newAttempt,
  OVERSHOOT_EXECUTION_TERMINALS,
  retryShape,
  transition,
  type OvershootExecutionTerminal,
} from './state-machine.ts';
import { OVERSHOOT_INTENTS } from './intents.ts';

Deno.test('state-machine: exactly six ratified terminals', () => {
  assertEquals(OVERSHOOT_EXECUTION_TERMINALS.length, 6);
  assertEquals([...OVERSHOOT_EXECUTION_TERMINALS].sort(), [
    'entry_refused_pre_open',
    'exit_failed',
    'exited',
    'expired',
    'filled',
    'rejected',
  ]);
});

Deno.test('state-machine: every terminal reachable from at least one intent', () => {
  const reached = new Set<OvershootExecutionTerminal>();
  for (const intent of OVERSHOOT_INTENTS) {
    for (const t of legalTerminalsFor(intent)) {
      const a = newAttempt(intent, 0);
      const done = transition(a, t);
      assertEquals(done.state, t);
      assert(isOvershootTerminal(done.state));
      reached.add(t);
    }
  }
  assertEquals(reached.size, OVERSHOOT_EXECUTION_TERMINALS.length);
});

Deno.test('state-machine: entry cannot exit; exit cannot fill; entry_refused only for entry', () => {
  assertThrows(() => transition(newAttempt('entry', 0), 'exited'), Error, 'illegal transition');
  assertThrows(() => transition(newAttempt('entry', 0), 'exit_failed'), Error, 'illegal transition');
  assertThrows(() => transition(newAttempt('exit_time', 0), 'filled'), Error, 'illegal transition');
  assertThrows(
    () => transition(newAttempt('exit_manual', 0), 'entry_refused_pre_open'),
    Error,
    'illegal transition',
  );
});

Deno.test('state-machine: terminals are absorbing (no transition out)', () => {
  const filled = transition(newAttempt('entry', 0), 'filled');
  assertThrows(() => transition(filled, 'rejected'), Error, 'absorbing-terminal');
});

Deno.test('state-machine: newAttempt rejects negative / non-integer attempt', () => {
  assertThrows(() => newAttempt('entry', -1), Error, 'attempt');
  assertThrows(() => newAttempt('entry', 0.5), Error, 'attempt');
});

Deno.test('state-machine: retryShape increments attempt and preserves intent (tuple-idempotency shape)', () => {
  const rejected = transition(newAttempt('entry', 3), 'rejected');
  const next = retryShape(rejected);
  assertEquals(next.intent, 'entry');
  assertEquals(next.attempt, 4);
});

Deno.test('state-machine: retryShape refuses non-terminal input (never silent-pass)', () => {
  assertThrows(() => retryShape(newAttempt('entry', 0)), Error, 'terminated');
});