#!/usr/bin/env -S deno run --allow-read --allow-env

/**
 * replay-run — One-command replay execution entrypoint per CROSSWIND §11.10 + §11.0.13.
 *
 * Sub-step 6.4 scope: CLI scaffold with --dry-run as operative mode. Sub-step 6.5 lands the
 * actual fixture-consumption logic.
 */

import { parseArgs } from 'https://deno.land/std@0.224.0/cli/parse_args.ts';
import { loadReplaySession, FixtureLoadError } from '../src/features/longshort/services/replay/replay-engine.ts';

export interface ReplayRunArgs {
  fixture: string;
  dryRun: boolean;
}

export function parseArguments(argv: string[]): ReplayRunArgs {
  const parsed = parseArgs(argv, {
    string: ['fixture'],
    boolean: ['dry-run'],
  });
  return {
    fixture: parsed.fixture as string ?? '',
    dryRun: parsed['dry-run'] as boolean,
  };
}

export interface ReplayRunResult {
  status: 'scaffold-ready' | 'fixture-replay-pending-6.5';
  fixture: string;
  message: string;
}

export interface ReplayLoadedResult {
  status: 'fixture-loaded';
  fixture: string;
  envelope_replay_day_id: string;
  event_count: number;
  symbols_count: number;
  message: string;
}

export interface ReplayLoadErrorResult {
  status: 'fixture-load-error';
  fixture: string;
  error_kind: string;
  error_message: string;
  message: string;
}

export type AnyReplayResult = ReplayRunResult | ReplayLoadedResult | ReplayLoadErrorResult;

export async function executeReplay(args: ReplayRunArgs): Promise<AnyReplayResult> {
  if (args.dryRun) {
    return {
      status: 'scaffold-ready',
      fixture: args.fixture,
      message: 'replay-run: scaffold ready (dry-run mode; no fixture loaded)',
    };
  }
  if (!args.fixture) {
    return {
      status: 'fixture-replay-pending-6.5',
      fixture: '',
      message: 'replay-run: --fixture=<path> required when not in --dry-run mode',
    };
  }

  try {
    const session = await loadReplaySession({ fixturePath: args.fixture });
    return {
      status: 'fixture-loaded',
      fixture: args.fixture,
      envelope_replay_day_id: session.fixture.envelope.replay_day_id,
      event_count: session.fixture.events.length,
      symbols_count: session.fixture.envelope.symbols.length,
      message: `replay-run: fixture loaded — replay_day_id=${session.fixture.envelope.replay_day_id}, event_count=${session.fixture.events.length}, symbols=${session.fixture.envelope.symbols.length}. Sub-step 6.5c integrates this session into the reconciliation lifecycle.`,
    };
  } catch (e) {
    if (e instanceof FixtureLoadError) {
      return {
        status: 'fixture-load-error',
        fixture: args.fixture,
        error_kind: e.kind,
        error_message: e.message,
        message: `replay-run: fixture load FAILED — kind=${e.kind}, message=${e.message}`,
      };
    }
    throw e;
  }
}

if (import.meta.main) {
  const args = parseArguments(Deno.args);
  const result = await executeReplay(args);
  console.log(result.message);
  const exitCleanly = result.status === 'scaffold-ready' || result.status === 'fixture-loaded';
  Deno.exit(exitCleanly ? 0 : 1);
}