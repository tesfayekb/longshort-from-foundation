/**
 * fixture-loader — parses a decompressed JSONL fixture per CROSSWIND §11.10.2 + 6.5a v1 spec.
 *
 * Responsibilities:
 *   - Split JSONL into lines
 *   - First line: parse + validate as ReplayFixtureEnvelope via isValidEnvelope()
 *   - Subsequent lines: parse as ReplayFixtureEvent; preserve order
 *   - Verify event_count matches actual events parsed (envelope sanity check)
 *   - Verify time_range.start <= first event ts; time_range.end >= last event ts
 *   - Verify events are non-decreasing in ts (per 6.5a §11.10.3 ordering invariant)
 *
 * Per DEC-034 clauses (2)(3): no sentinel coercion, no error swallowing.
 * Per §11.9 + DEC-034 clause (4): no wall-clock reads.
 */

import type { ReplayFixtureEvent } from '../../types/replay-fixture.ts';
import type { ReplayFixtureEnvelope } from '../../types/replay-storage.ts';
import { isValidEnvelope } from '../../types/replay-storage.ts';

export interface ParsedFixture {
  envelope: ReplayFixtureEnvelope;
  events: ReplayFixtureEvent[];
}

export class FixtureLoadError extends Error {
  constructor(message: string, public readonly kind: 'envelope_invalid' | 'event_count_mismatch' | 'ordering_violation' | 'time_range_violation' | 'parse_error') {
    super(message);
    this.name = 'FixtureLoadError';
  }
}

/**
 * Parse JSONL fixture content into envelope + events.
 *
 * @param jsonl - decompressed JSONL string (first line = envelope; subsequent lines = events)
 * @throws FixtureLoadError on any validation failure (caller decides disposition)
 */
export function parseFixture(jsonl: string): ParsedFixture {
  const lines = jsonl.split('\n').filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new FixtureLoadError('Empty fixture content', 'parse_error');
  }

  // First line: envelope
  let envelopeRaw: unknown;
  try {
    envelopeRaw = JSON.parse(lines[0]);
  } catch (e) {
    throw new FixtureLoadError(`Envelope JSON parse failed: ${e instanceof Error ? e.message : String(e)}`, 'parse_error');
  }

  if (!isValidEnvelope(envelopeRaw)) {
    throw new FixtureLoadError('Envelope does not conform to ReplayFixtureEnvelope shape', 'envelope_invalid');
  }
  const envelope = envelopeRaw;

  // Subsequent lines: events
  const events: ReplayFixtureEvent[] = [];
  for (let i = 1; i < lines.length; i++) {
    let event: ReplayFixtureEvent;
    try {
      event = JSON.parse(lines[i]) as ReplayFixtureEvent;
    } catch (e) {
      throw new FixtureLoadError(`Event JSON parse failed at line ${i + 1}: ${e instanceof Error ? e.message : String(e)}`, 'parse_error');
    }
    events.push(event);
  }

  // Validation: event_count matches actual
  if (envelope.event_count !== events.length) {
    throw new FixtureLoadError(
      `Envelope event_count=${envelope.event_count} does not match actual events parsed=${events.length}`,
      'event_count_mismatch',
    );
  }

  // Validation: events non-decreasing in ts
  for (let i = 1; i < events.length; i++) {
    if (events[i].ts < events[i - 1].ts) {
      throw new FixtureLoadError(
        `Events not in ascending ts order at index ${i}: prev=${events[i - 1].ts}, curr=${events[i].ts}`,
        'ordering_violation',
      );
    }
  }

  // Validation: time_range bounds events
  if (events.length > 0) {
    if (events[0].ts < envelope.time_range.start) {
      throw new FixtureLoadError(
        `First event ts=${events[0].ts} before envelope time_range.start=${envelope.time_range.start}`,
        'time_range_violation',
      );
    }
    if (events[events.length - 1].ts > envelope.time_range.end) {
      throw new FixtureLoadError(
        `Last event ts=${events[events.length - 1].ts} after envelope time_range.end=${envelope.time_range.end}`,
        'time_range_violation',
      );
    }
  }

  return { envelope, events };
}