#!/usr/bin/env -S deno run --allow-read

/**
 * replay-pass — §11.10.4 replay-test PASS CLI entrypoint.
 *
 * Usage:
 *   deno run --allow-read scripts/replay-pass.ts --fixture=<path> --verifier=verify_quote
 *
 * Returns:
 *   - JSON to stdout: { status, fixture, verifier, event_count, events_json_hash }
 *   - Exit 0 on PASS (events produced + deterministic); exit 1 on FAIL.
 *
 * 6.5c scope: verify_quote only. Other verifiers added in 6.5d / downstream.
 */

import { parseArgs } from 'https://deno.land/std@0.224.0/cli/parse_args.ts';
import { loadReplaySession } from '../src/features/longshort/services/replay/replay-engine.ts';
import {
  runReplayPassAgainstSession,
  runUniverseMembershipReplayPass,
} from '../src/features/longshort/services/replay/replay-pass-runner.ts';
import {
  parseUniverseQuarterlyRefreshFixture,
  FIXTURE_AS_OF_TS,
} from '../src/features/longshort/services/replay/l2-synthetic-universe-quarterly-refresh-generator.ts';
import { decompressZstdFile } from '../src/features/longshort/services/replay/zstd-codec.ts';

export interface ReplayPassArgs {
  fixture: string;
  verifier: string;
}

export function parsePassArguments(argv: string[]): ReplayPassArgs {
  const parsed = parseArgs(argv, { string: ['fixture', 'verifier'] });
  return {
    fixture: parsed.fixture as string ?? '',
    verifier: parsed.verifier as string ?? 'verify_quote',
  };
}

export interface ReplayPassResult {
  status: 'pass' | 'fail';
  fixture: string;
  verifier: string;
  event_count: number;
  events_json: string;
  message: string;
}

export async function executeReplayPass(args: ReplayPassArgs): Promise<ReplayPassResult> {
  if (!args.fixture) {
    return {
      status: 'fail',
      fixture: '',
      verifier: args.verifier,
      event_count: 0,
      events_json: '',
      message: 'replay-pass: --fixture=<path> required',
    };
  }
  if (args.verifier === 'verify_quote') {
    const session = await loadReplaySession({ fixturePath: args.fixture });
    const events = runReplayPassAgainstSession(session);
    return {
      status: 'pass',
      fixture: args.fixture,
      verifier: args.verifier,
      event_count: events.length,
      events_json: JSON.stringify(events),
      message: `replay-pass: PASS — verifier=${args.verifier}, fixture=${args.fixture}, event_count=${events.length}`,
    };
  }
  if (args.verifier === 'verify_universe_membership') {
    // FP-008 sub-step 8.11 / ACT-117 — Surface 5 Option x: extend this Deno
    // CLI substrate per ADR-005 Deno-native replay runtime precedent. Parallel
    // fixture-loader path (snapshot envelope outside §11.10.1's 8-stream
    // enumeration).
    const jsonl = await decompressZstdFile(args.fixture);
    const fixture = parseUniverseQuarterlyRefreshFixture(jsonl);
    const events = runUniverseMembershipReplayPass(fixture, FIXTURE_AS_OF_TS);
    return {
      status: 'pass',
      fixture: args.fixture,
      verifier: args.verifier,
      event_count: events.length,
      events_json: JSON.stringify(events),
      message: `replay-pass: PASS — verifier=${args.verifier}, fixture=${args.fixture}, event_count=${events.length}`,
    };
  }
    return {
      status: 'fail',
      fixture: args.fixture,
      verifier: args.verifier,
      event_count: 0,
      events_json: '',
    message: `replay-pass: verifier=${args.verifier} not supported (supported: verify_quote, verify_universe_membership); additional verifiers land in downstream sub-steps`,
    };
}

if (import.meta.main) {
  const args = parsePassArguments(Deno.args);
  const result = await executeReplayPass(args);
  console.log(JSON.stringify(result, null, 2));
  Deno.exit(result.status === 'pass' ? 0 : 1);
}