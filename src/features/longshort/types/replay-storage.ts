/**
 * Replay storage envelope contract per CROSSWIND §11.10.2.
 *
 * Storage format: JSONL (one JSON object per line) compressed with zstd (.jsonl.zst).
 * One file per captured day. Filename convention: `<replay_day_id>.jsonl.zst`.
 *
 * The envelope wraps the array of events with metadata required for replay determinism:
 * - format_version (breaking-change tracking)
 * - captured_at (when the capture was performed; not used for ordering)
 * - replay_day_id (canonical identifier)
 * - source_seed (captured seed for any randomness in signal generation; required for
 *   §11.10.3 deterministic replay)
 *
 * The actual events are encoded one per JSONL line for streamability (no need to load
 * entire day into memory; 6.5b engine consumes line-by-line).
 *
 * Per §11.10.2 verbatim: stored in `replay_storage/`. Retention: indefinite for Phase 0B
 * Day 1 + at least 12 weeks rolling for Phase 7+. Sub-step 6.5a establishes the contract;
 * actual storage management (rotation, archival to S3) is later-phase work.
 */

import type { ReplayDayId, ReplayTimestamp } from './replay-fixture.ts';
import { REPLAY_FIXTURE_FORMAT_VERSION } from './replay-fixture.ts';

/** Envelope written as the FIRST line of every .jsonl.zst fixture. */
export interface ReplayFixtureEnvelope {
  envelope_marker: 'crosswind_replay_fixture_v1';
  format_version: typeof REPLAY_FIXTURE_FORMAT_VERSION;
  replay_day_id: ReplayDayId;
  captured_at: ReplayTimestamp;
  source_seed: string;          // hex-encoded; required for signal-randomness determinism per §11.10.3
  event_count: number;          // total events in this fixture; informational
  symbols: string[];            // all symbols referenced in any event; informational
  time_range: {
    start: ReplayTimestamp;     // earliest event ts
    end: ReplayTimestamp;       // latest event ts
  };
}

/**
 * Storage layout summary:
 *
 *   replay_storage/
 *     <replay_day_id>.jsonl.zst    — first line: ReplayFixtureEnvelope (JSON)
 *                                    subsequent lines: ReplayFixtureEvent (JSON), one per line
 *
 * Subsequent sub-steps:
 * - 6.5b: replay engine reads `.jsonl.zst` files, validates envelope, consumes events in ts order
 * - 6.5c: capture script emits `<l2-synthetic-day-1>.jsonl.zst` per this contract
 * - 6.5d: AI-loop verification surface confirms two replay runs of the same fixture produce
 *   identical outputs
 */

/**
 * Compression encoding constants. Fixed at sub-step 6.5a; downstream sub-steps treat as canonical.
 */
export const REPLAY_FIXTURE_FILE_EXTENSION = '.jsonl.zst' as const;
export const REPLAY_FIXTURE_COMPRESSION = 'zstd' as const;

/**
 * Validate envelope shape. Pure function; no I/O. Used by 6.5b engine to reject malformed fixtures.
 */
export function isValidEnvelope(value: unknown): value is ReplayFixtureEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.envelope_marker === 'crosswind_replay_fixture_v1' &&
    v.format_version === REPLAY_FIXTURE_FORMAT_VERSION &&
    typeof v.replay_day_id === 'string' &&
    typeof v.captured_at === 'string' &&
    typeof v.source_seed === 'string' &&
    typeof v.event_count === 'number' &&
    Array.isArray(v.symbols) &&
    typeof v.time_range === 'object' &&
    v.time_range !== null
  );
}