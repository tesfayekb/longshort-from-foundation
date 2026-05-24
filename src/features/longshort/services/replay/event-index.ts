/**
 * event-index — per-stream lookup indices for O(log n) point-in-time queries.
 *
 * Replay determinism per CROSSWIND §11.10.3 requires that at any captured ts the engine
 * can answer "what was the state of stream X for symbol Y at ts Z" without scanning the
 * full event list. We build per-stream sorted arrays keyed by ts at fixture-load time
 * and use binary search at query time.
 *
 * Lookup semantics:
 *   - findAtOrBefore(stream, ts, predicate): returns the most recent event matching
 *     `predicate` with event.ts <= ts. Used for "what was the broker's view of AAPL
 *     position at 14:35:00" — answered by most recent BrokerStateEvent before 14:35:00
 *     that matches symbol AAPL.
 *   - findExactAt(stream, ts, predicate): returns an event at exactly ts. Used for
 *     halt feed where halts are point-in-time events.
 *
 * Per DEC-034 clause (2): no sentinel coercion. If no match, returns null; caller
 * decides disposition.
 *
 * Per DEC-034 clause (4): no wall-clock reads.
 */

import type { ReplayFixtureEvent, ReplayStreamName, ReplayTimestamp } from '../../types/replay-fixture.ts';

export interface EventIndex {
  byStream: Map<ReplayStreamName, ReplayFixtureEvent[]>;
}

/**
 * Build per-stream sorted arrays from the canonical event list.
 *
 * Input events MUST be in ascending ts order globally (validated by fixture-loader).
 * Per-stream arrays inherit that order (since stable filter preserves it).
 */
export function buildEventIndex(events: ReplayFixtureEvent[]): EventIndex {
  const byStream = new Map<ReplayStreamName, ReplayFixtureEvent[]>();
  const allStreams: ReplayStreamName[] = [
    'broker_state',
    'signal_quote',
    'reconciliation_quote',
    'broker_quote',
    'halt_feed',
    'locate_feed',
    'corporate_actions',
    'combiner_io',
  ];
  for (const s of allStreams) byStream.set(s, []);

  for (const e of events) {
    const arr = byStream.get(e.stream);
    if (arr === undefined) {
      // Discriminator-typed; this branch is unreachable but explicit for type narrowing
      continue;
    }
    arr.push(e);
  }
  return { byStream };
}

/**
 * Binary search for the most recent event at or before ts in a sorted array.
 *
 * Returns the index of the rightmost event with event.ts <= ts, or -1 if no such event.
 */
function binarySearchAtOrBefore(events: ReplayFixtureEvent[], ts: ReplayTimestamp): number {
  let lo = 0;
  let hi = events.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid].ts <= ts) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

/**
 * Find the most recent event in `stream` at or before `ts` matching `predicate`.
 *
 * Walks backward from the binary-search upper bound to find the most recent matching event.
 * For typical use cases (filtering by symbol on a stream with N events), this is O(log N + K)
 * where K is the number of events between the matching event and `ts` (typically very small).
 */
export function findAtOrBefore<E extends ReplayFixtureEvent>(
  index: EventIndex,
  stream: ReplayStreamName,
  ts: ReplayTimestamp,
  predicate: (e: ReplayFixtureEvent) => e is E,
): E | null {
  const events = index.byStream.get(stream);
  if (!events || events.length === 0) return null;

  const upperIdx = binarySearchAtOrBefore(events, ts);
  if (upperIdx < 0) return null;

  for (let i = upperIdx; i >= 0; i--) {
    if (predicate(events[i])) return events[i];
  }
  return null;
}

/**
 * Find an event in `stream` at exactly `ts` matching `predicate`.
 */
export function findExactAt<E extends ReplayFixtureEvent>(
  index: EventIndex,
  stream: ReplayStreamName,
  ts: ReplayTimestamp,
  predicate: (e: ReplayFixtureEvent) => e is E,
): E | null {
  const events = index.byStream.get(stream);
  if (!events || events.length === 0) return null;

  // Binary search for first ts >= target, then check exact match
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid].ts < ts) lo = mid + 1;
    else hi = mid;
  }

  // Walk forward over all events at exactly ts looking for a match
  for (let i = lo; i < events.length && events[i].ts === ts; i++) {
    if (predicate(events[i])) return events[i];
  }
  return null;
}