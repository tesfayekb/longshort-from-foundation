import { assertEquals, assertThrows, assertNotEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  loadReplaySessionFromMemory,
  FixtureLoadError,
} from './replay-engine.ts';

// Helper: build a minimal valid JSONL fixture string in-memory
function buildJsonl(events: object[], envelopeOverrides: Record<string, unknown> = {}): string {
  const envelope = {
    envelope_marker: 'crosswind_replay_fixture_v1',
    format_version: 1,
    replay_day_id: 'test-day',
    captured_at: '2026-01-01T00:00:00Z',
    source_seed: 'deadbeef',
    event_count: events.length,
    symbols: ['AAPL', 'MSFT'],
    time_range: {
      start: events.length > 0 ? (events[0] as { ts: string }).ts : '2026-01-01T14:30:00Z',
      end: events.length > 0 ? (events[events.length - 1] as { ts: string }).ts : '2026-01-01T21:00:00Z',
    },
    ...envelopeOverrides,
  };
  return [JSON.stringify(envelope), ...events.map((e) => JSON.stringify(e))].join('\n');
}

Deno.test("(1) loads minimal valid fixture", () => {
  const jsonl = buildJsonl([
    { stream: 'broker_state', ts: '2026-01-01T14:30:00Z', kind: 'position_snapshot', payload: { symbol: 'AAPL', qty: 100 } },
  ]);
  const session = loadReplaySessionFromMemory({ jsonl });
  assertEquals(session.fixture.envelope.replay_day_id, 'test-day');
  assertEquals(session.fixture.events.length, 1);
});

Deno.test("(2) rejects malformed envelope (wrong format_version)", () => {
  const jsonl = buildJsonl([
    { stream: 'broker_state', ts: '2026-01-01T14:30:00Z', kind: 'position_snapshot', payload: { symbol: 'AAPL' } },
  ], { format_version: 2 });
  assertThrows(() => loadReplaySessionFromMemory({ jsonl }), FixtureLoadError, 'envelope');
});

Deno.test("(3) rejects event_count mismatch", () => {
  const jsonl = buildJsonl([
    { stream: 'broker_state', ts: '2026-01-01T14:30:00Z', kind: 'position_snapshot', payload: { symbol: 'AAPL' } },
  ], { event_count: 99 });
  assertThrows(() => loadReplaySessionFromMemory({ jsonl }), FixtureLoadError, 'event_count');
});

Deno.test("(4) rejects ordering violation", () => {
  const jsonl = buildJsonl([
    { stream: 'broker_state', ts: '2026-01-01T14:30:00Z', kind: 'position_snapshot', payload: { symbol: 'AAPL' } },
    { stream: 'broker_state', ts: '2026-01-01T14:29:00Z', kind: 'position_snapshot', payload: { symbol: 'AAPL' } },
  ]);
  assertThrows(() => loadReplaySessionFromMemory({ jsonl }), FixtureLoadError, 'order');
});

Deno.test("(5) fetchPositionAt returns most recent at-or-before", () => {
  const jsonl = buildJsonl([
    { stream: 'broker_state', ts: '2026-01-01T14:30:00Z', kind: 'position_snapshot', payload: { symbol: 'AAPL', qty: 100 } },
    { stream: 'broker_state', ts: '2026-01-01T14:35:00Z', kind: 'position_snapshot', payload: { symbol: 'AAPL', qty: 150 } },
    { stream: 'broker_state', ts: '2026-01-01T14:40:00Z', kind: 'position_snapshot', payload: { symbol: 'AAPL', qty: 200 } },
  ]);
  const session = loadReplaySessionFromMemory({ jsonl });
  const at_14_37 = session.fetchers.fetchPositionAt('2026-01-01T14:37:00Z', 'AAPL');
  assert(at_14_37 !== null);
  assertEquals((at_14_37.payload as { qty: number }).qty, 150);
});

Deno.test("(6) fetchPositionAt returns null for symbol not in fixture", () => {
  const jsonl = buildJsonl([
    { stream: 'broker_state', ts: '2026-01-01T14:30:00Z', kind: 'position_snapshot', payload: { symbol: 'AAPL', qty: 100 } },
  ]);
  const session = loadReplaySessionFromMemory({ jsonl });
  assertEquals(session.fetchers.fetchPositionAt('2026-01-01T14:35:00Z', 'MSFT'), null);
});

Deno.test("(7) fetchPositionAt returns null when query ts is before first event", () => {
  const jsonl = buildJsonl([
    { stream: 'broker_state', ts: '2026-01-01T14:30:00Z', kind: 'position_snapshot', payload: { symbol: 'AAPL', qty: 100 } },
  ]);
  const session = loadReplaySessionFromMemory({ jsonl });
  assertEquals(session.fetchers.fetchPositionAt('2026-01-01T14:00:00Z', 'AAPL'), null);
});

Deno.test("(8) quote streams correctly distinguished by source", () => {
  const jsonl = buildJsonl([
    { stream: 'signal_quote', ts: '2026-01-01T14:30:00Z', symbol: 'AAPL', bid: 150, ask: 151, last: 150.5, source: 'polygon' },
    { stream: 'reconciliation_quote', ts: '2026-01-01T14:30:00Z', symbol: 'AAPL', bid: 150.1, ask: 151.1, last: 150.6, source: 'tradier' },
    { stream: 'broker_quote', ts: '2026-01-01T14:30:00Z', symbol: 'AAPL', bid: 150.2, ask: 151.2, last: 150.7, source: 'alpaca' },
  ]);
  const session = loadReplaySessionFromMemory({ jsonl });
  const signal = session.fetchers.fetchSignalQuoteAt('2026-01-01T14:30:00Z', 'AAPL');
  const recon = session.fetchers.fetchReconciliationQuoteAt('2026-01-01T14:30:00Z', 'AAPL');
  const broker = session.fetchers.fetchBrokerQuoteAt('2026-01-01T14:30:00Z', 'AAPL');
  assertEquals(signal?.source, 'polygon');
  assertEquals(recon?.source, 'tradier');
  assertEquals(broker?.source, 'alpaca');
});

Deno.test("(9) DETERMINISM HARNESS: two loads of identical jsonl produce byte-identical fixture+events", () => {
  const events = [
    { stream: 'broker_state', ts: '2026-01-01T14:30:00Z', kind: 'position_snapshot', payload: { symbol: 'AAPL', qty: 100 } },
    { stream: 'signal_quote', ts: '2026-01-01T14:30:00Z', symbol: 'AAPL', bid: 150, ask: 151, last: 150.5, source: 'polygon' },
    { stream: 'halt_feed', ts: '2026-01-01T14:35:00Z', symbol: 'AAPL', halted: true, halt_code: 'LUDP' },
    { stream: 'locate_feed', ts: '2026-01-01T14:30:00Z', symbol: 'AAPL', locate_id: 'L1', available: true },
  ];
  const jsonl = buildJsonl(events);
  const session1 = loadReplaySessionFromMemory({ jsonl });
  const session2 = loadReplaySessionFromMemory({ jsonl });

  assertEquals(JSON.stringify(session1.fixture.envelope), JSON.stringify(session2.fixture.envelope));
  assertEquals(JSON.stringify(session1.fixture.events), JSON.stringify(session2.fixture.events));
  const q1 = session1.fetchers.fetchPositionAt('2026-01-01T14:35:00Z', 'AAPL');
  const q2 = session2.fetchers.fetchPositionAt('2026-01-01T14:35:00Z', 'AAPL');
  assertEquals(JSON.stringify(q1), JSON.stringify(q2));
});

Deno.test("(10) DETERMINISM HARNESS: different fixture content produces non-identical outputs (sanity check)", () => {
  const jsonl1 = buildJsonl([
    { stream: 'broker_state', ts: '2026-01-01T14:30:00Z', kind: 'position_snapshot', payload: { symbol: 'AAPL', qty: 100 } },
  ]);
  const jsonl2 = buildJsonl([
    { stream: 'broker_state', ts: '2026-01-01T14:30:00Z', kind: 'position_snapshot', payload: { symbol: 'AAPL', qty: 200 } },
  ]);
  const session1 = loadReplaySessionFromMemory({ jsonl: jsonl1 });
  const session2 = loadReplaySessionFromMemory({ jsonl: jsonl2 });
  assertNotEquals(JSON.stringify(session1.fixture.events), JSON.stringify(session2.fixture.events));
});

Deno.test("(11) empty event list with event_count=0 is accepted", () => {
  const jsonl = buildJsonl([], { event_count: 0, time_range: { start: '2026-01-01T14:30:00Z', end: '2026-01-01T21:00:00Z' } });
  const session = loadReplaySessionFromMemory({ jsonl });
  assertEquals(session.fixture.events.length, 0);
  assertEquals(session.fetchers.fetchPositionAt('2026-01-01T14:30:00Z', 'AAPL'), null);
});

Deno.test("(12) corporate-actions + combiner-io events parse correctly", () => {
  const jsonl = buildJsonl([
    { stream: 'corporate_actions', ts: '2026-01-01T14:30:00Z', symbol: 'AAPL', action_type: 'split', ex_date: '2026-01-05T00:00:00Z', payload: { ratio: '4:1' } },
    { stream: 'combiner_io', ts: '2026-01-01T14:31:00Z', inputs: [{ symbol: 'AAPL', signal_id: 'mom', value: 0.5, is_present: true, ts: '2026-01-01T14:30:55Z' }], outputs: [{ symbol: 'AAPL', rank: 1, score: 2.0, shap_attribution: { mom: 1.5 } }] },
  ]);
  const session = loadReplaySessionFromMemory({ jsonl });
  assertEquals(session.fixture.events.length, 2);
  assertEquals(session.fixture.events[0].stream, 'corporate_actions');
  assertEquals(session.fixture.events[1].stream, 'combiner_io');
});