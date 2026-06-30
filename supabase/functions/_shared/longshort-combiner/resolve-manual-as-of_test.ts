import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  resolveManualAsOf,
  readReplayFlag,
} from './resolve-manual-as-of.ts';

const midnight = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

Deno.test('today + no replay → wall-clock now (matches cron freshness semantics)', () => {
  const today = midnight('2026-06-30');
  const now = new Date('2026-06-30T14:30:05.123Z');
  const out = resolveManualAsOf(today, now, false);
  assertEquals(out.getTime(), now.getTime());
  // as_of_date derived from ISO slice still maps to today — correct.
  assertEquals(out.toISOString().slice(0, 10), '2026-06-30');
});

Deno.test('today + replay:true → midnight (T8 determinism preserved)', () => {
  const today = midnight('2026-06-30');
  const now = new Date('2026-06-30T14:30:05.123Z');
  const out = resolveManualAsOf(today, now, true);
  assertEquals(out.toISOString(), '2026-06-30T00:00:00.000Z');
});

Deno.test('prior day + no replay → midnight (historical replay semantics)', () => {
  const prior = midnight('2026-06-29');
  const now = new Date('2026-06-30T14:30:05.123Z');
  const out = resolveManualAsOf(prior, now, false);
  assertEquals(out.toISOString(), '2026-06-29T00:00:00.000Z');
});

Deno.test('prior day + replay:true → midnight (still determinism)', () => {
  const prior = midnight('2026-06-29');
  const now = new Date('2026-06-30T14:30:05.123Z');
  const out = resolveManualAsOf(prior, now, true);
  assertEquals(out.toISOString(), '2026-06-29T00:00:00.000Z');
});

Deno.test('UTC date-boundary: now=23:59:59Z, parsed=same day → wall-clock', () => {
  const today = midnight('2026-06-30');
  const now = new Date('2026-06-30T23:59:59.999Z');
  const out = resolveManualAsOf(today, now, false);
  assertEquals(out.getTime(), now.getTime());
});

Deno.test('UTC date-boundary: now=00:00:00.001Z next day, parsed=prior → midnight', () => {
  const prior = midnight('2026-06-30');
  const now = new Date('2026-07-01T00:00:00.001Z');
  const out = resolveManualAsOf(prior, now, false);
  assertEquals(out.toISOString(), '2026-06-30T00:00:00.000Z');
});

Deno.test('readReplayFlag: missing → false', () => {
  assertEquals(readReplayFlag({}), false);
  assertEquals(readReplayFlag({ as_of: '2026-06-30' }), false);
});

Deno.test('readReplayFlag: replay:true → true', () => {
  assertEquals(readReplayFlag({ as_of: '2026-06-30', replay: true }), true);
});

Deno.test('readReplayFlag: non-boolean truthy → false (strict === true)', () => {
  assertEquals(readReplayFlag({ replay: 'true' }), false);
  assertEquals(readReplayFlag({ replay: 1 }), false);
  assertEquals(readReplayFlag({ replay: 'yes' }), false);
});

Deno.test('readReplayFlag: null / non-object → false', () => {
  assertEquals(readReplayFlag(null), false);
  assertEquals(readReplayFlag(undefined), false);
  assertEquals(readReplayFlag('replay'), false);
  assertEquals(readReplayFlag(42), false);
});