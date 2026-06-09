// @ts-nocheck — Deno test file.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { QUEUE_AUDIT_EVENTS } from './queue-audit-events.ts';

Deno.test('audit event names follow longshort.signal_queue.<sub>.<verb> convention', () => {
  for (const v of Object.values(QUEUE_AUDIT_EVENTS)) {
    assert(/^longshort\.signal_queue\.[a-z_]+\.[a-z_]+$/.test(v), `bad event name: ${v}`);
  }
});

Deno.test('audit event set is exactly the five expected names (FP-041 exact-match discipline)', () => {
  const got = Object.values(QUEUE_AUDIT_EVENTS).sort();
  const expected = [
    'longshort.signal_queue.run.completed',
    'longshort.signal_queue.run.failed',
    'longshort.signal_queue.run.started',
    'longshort.signal_queue.slice.completed',
    'longshort.signal_queue.slice.failed',
  ];
  assertEquals(got, expected);
});