/**
 * replay-engine — top-level orchestration: load fixture, build index, expose fetchers.
 *
 * Sub-step 6.5b delivers the library + harness; sub-step 6.5c plugs the fetchers into
 * the reconciliation lifecycle to produce a full replay-test PASS against L2 synthetic
 * Day 1.
 *
 * Typical 6.5c usage (not exercised in 6.5b tests):
 *   const session = await loadReplaySession({ fixturePath: 'replay_storage/l2-synthetic-day-1.jsonl.zst' });
 *   for (const event of session.fixture.events) {
 *     if (event.stream === 'combiner_io') {
 *       // drive reconciliation lifecycle for each tick using session.fetchers
 *     }
 *   }
 *
 * Per §11.10.3 determinism: two calls to loadReplaySession with the same fixture produce
 * byte-identical session.fixture.events arrays + byte-identical fetcher responses for any (ts, symbol).
 */

import { decompressZstdFile } from './zstd-codec.ts';
import { parseFixture, type ParsedFixture } from './fixture-loader.ts';
import { buildEventIndex, type EventIndex } from './event-index.ts';
import { buildReplayBrokerFetchers, type ReplayBrokerFetchers } from './fixture-broker-fetchers.ts';

export interface ReplaySession {
  fixture: ParsedFixture;
  index: EventIndex;
  fetchers: ReplayBrokerFetchers;
}

export interface LoadReplaySessionFromPath {
  fixturePath: string;
}

export interface LoadReplaySessionFromMemory {
  jsonl: string;     // for in-memory testing without zstd compression overhead
}

/**
 * Load a replay session from a `.jsonl.zst` file on disk.
 *
 * Requires `--allow-read` Deno permission.
 */
export async function loadReplaySession(args: LoadReplaySessionFromPath): Promise<ReplaySession> {
  const jsonl = await decompressZstdFile(args.fixturePath);
  return buildSessionFromJsonl(jsonl);
}

/**
 * Load a replay session from an in-memory JSONL string. Used by 6.5b tests + any 6.5c+
 * code that wants to drive replay without round-tripping through filesystem.
 */
export function loadReplaySessionFromMemory(args: LoadReplaySessionFromMemory): ReplaySession {
  return buildSessionFromJsonl(args.jsonl);
}

function buildSessionFromJsonl(jsonl: string): ReplaySession {
  const fixture = parseFixture(jsonl);
  const index = buildEventIndex(fixture.events);
  const fetchers = buildReplayBrokerFetchers(index);
  return { fixture, index, fetchers };
}

// Re-export FixtureLoadError so callers can pattern-match on it without deep imports
export { FixtureLoadError } from './fixture-loader.ts';
export type { ParsedFixture } from './fixture-loader.ts';
export type { ReplayBrokerFetchers } from './fixture-broker-fetchers.ts';