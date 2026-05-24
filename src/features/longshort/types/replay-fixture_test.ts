import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  REPLAY_FIXTURE_FORMAT_VERSION,
  isBrokerStateEvent,
  isQuoteEvent,
  isHaltEvent,
  isLocateEvent,
  isCorporateActionEvent,
  isCombinerIOEvent,
  type ReplayFixtureEvent,
} from './replay-fixture.ts';
import { isValidEnvelope, REPLAY_FIXTURE_FILE_EXTENSION } from './replay-storage.ts';

Deno.test("(1) format version is 1", () => {
  assertEquals(REPLAY_FIXTURE_FORMAT_VERSION, 1);
});

Deno.test("(2) file extension is .jsonl.zst", () => {
  assertEquals(REPLAY_FIXTURE_FILE_EXTENSION, '.jsonl.zst');
});

Deno.test("(3) type guard isBrokerStateEvent narrows correctly", () => {
  const event: ReplayFixtureEvent = {
    stream: 'broker_state',
    ts: '2026-01-01T09:30:00Z',
    kind: 'position_snapshot',
    payload: { symbol: 'AAPL', qty: 100 },
  };
  assertEquals(isBrokerStateEvent(event), true);
  assertEquals(isQuoteEvent(event), false);
});

Deno.test("(4) type guard isQuoteEvent matches all 3 quote streams", () => {
  const signal: ReplayFixtureEvent = { stream: 'signal_quote', ts: 't', symbol: 'X', bid: 1, ask: 2, last: 1.5, source: 'polygon' };
  const recon: ReplayFixtureEvent = { stream: 'reconciliation_quote', ts: 't', symbol: 'X', bid: 1, ask: 2, last: 1.5, source: 'tradier' };
  const broker: ReplayFixtureEvent = { stream: 'broker_quote', ts: 't', symbol: 'X', bid: 1, ask: 2, last: 1.5, source: 'alpaca' };
  assertEquals(isQuoteEvent(signal), true);
  assertEquals(isQuoteEvent(recon), true);
  assertEquals(isQuoteEvent(broker), true);
});

Deno.test("(5) type guards mutually exclude", () => {
  const halt: ReplayFixtureEvent = { stream: 'halt_feed', ts: 't', symbol: 'X', halted: true };
  const locate: ReplayFixtureEvent = { stream: 'locate_feed', ts: 't', symbol: 'X', locate_id: 'L1', available: true };
  const corp: ReplayFixtureEvent = { stream: 'corporate_actions', ts: 't', symbol: 'X', action_type: 'split', ex_date: 't', payload: {} };
  const combiner: ReplayFixtureEvent = { stream: 'combiner_io', ts: 't', inputs: [], outputs: [] };

  assertEquals(isHaltEvent(halt), true);
  assertEquals(isHaltEvent(locate), false);
  assertEquals(isLocateEvent(locate), true);
  assertEquals(isLocateEvent(corp), false);
  assertEquals(isCorporateActionEvent(corp), true);
  assertEquals(isCorporateActionEvent(combiner), false);
  assertEquals(isCombinerIOEvent(combiner), true);
});

Deno.test("(6) isValidEnvelope accepts well-formed envelope", () => {
  const envelope = {
    envelope_marker: 'crosswind_replay_fixture_v1',
    format_version: 1,
    replay_day_id: 'l2-synthetic-day-1',
    captured_at: '2026-05-24T00:00:00Z',
    source_seed: 'deadbeef',
    event_count: 100,
    symbols: ['AAPL', 'MSFT'],
    time_range: { start: '2026-01-01T14:30:00Z', end: '2026-01-01T21:00:00Z' },
  };
  assert(isValidEnvelope(envelope));
});

Deno.test("(7) isValidEnvelope rejects wrong format_version", () => {
  const envelope = {
    envelope_marker: 'crosswind_replay_fixture_v1',
    format_version: 2,
    replay_day_id: 'x', captured_at: 't', source_seed: 's', event_count: 0,
    symbols: [], time_range: { start: 't', end: 't' },
  };
  assertEquals(isValidEnvelope(envelope), false);
});

Deno.test("(8) isValidEnvelope rejects missing envelope_marker", () => {
  const envelope = { format_version: 1 };
  assertEquals(isValidEnvelope(envelope), false);
});