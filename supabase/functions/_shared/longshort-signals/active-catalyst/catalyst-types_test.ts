// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
import {
  assertEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  applyLookAheadGate,
  applyWindowLowerBound,
  type RawCatalystEventInput,
} from './catalyst-types.ts';

function row(event_at: string): RawCatalystEventInput {
  return {
    ticker: 'AAPL',
    event_type: 'earnings',
    event_at,
    source: 'structured',
    vendor: 'fmp',
  };
}

Deno.test('(1) applyLookAheadGate drops future-dated rows and counts them', () => {
  const as_of = new Date('2026-06-10T20:00:00Z');
  const candidates = [
    row('2026-06-09T13:30:00Z'),
    row('2026-06-10T20:00:00Z'), // equal — kept
    row('2026-06-10T20:00:01Z'), // 1ms after — excluded
    row('2026-06-11T13:30:00Z'),
  ];
  const out = applyLookAheadGate(candidates, as_of);
  assertEquals(out.rows.length, 2);
  assertEquals(out.future_event_excluded, 2);
});

Deno.test('(2) applyLookAheadGate counts invalid event_at as excluded (never silent)', () => {
  const as_of = new Date('2026-06-10T20:00:00Z');
  const out = applyLookAheadGate(
    [row('not-a-date'), row('2026-06-09T13:30:00Z')],
    as_of,
  );
  assertEquals(out.rows.length, 1);
  assertEquals(out.future_event_excluded, 1);
});

Deno.test('(3) applyLookAheadGate throws on invalid as_of (anti-phantom)', () => {
  assertThrows(() => applyLookAheadGate([row('2026-06-09T13:30:00Z')], new Date('xxx')));
});

Deno.test('(4) applyWindowLowerBound drops rows before the floor (inclusive)', () => {
  const start = new Date('2026-06-05T00:00:00Z');
  const out = applyWindowLowerBound(
    [
      row('2026-06-04T23:59:59Z'),
      row('2026-06-05T00:00:00Z'),
      row('2026-06-07T12:00:00Z'),
    ],
    start,
  );
  assertEquals(out.length, 2);
});

Deno.test('(5) applyWindowLowerBound throws on invalid window_start_at', () => {
  assertThrows(() => applyWindowLowerBound([], new Date('nope')));
});