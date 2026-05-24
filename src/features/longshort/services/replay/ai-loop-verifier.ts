/**
 * ai-loop-verifier — §11.10.5 replay-driven AI-loop verification surface.
 *
 * Per CROSSWIND §11.10.5 verbatim:
 *   "The replay framework is the independent verification surface for the AI loop per
 *    §11.0.1 architectural commitment. Where executor + supervisor share blind spots,
 *    the replay framework runs against captured external state — a verification source
 *    neither AI can manipulate or pre-cache."
 *
 * Concrete realization at sub-step 6.5d: a meta-runner that invokes replay-pass-runner
 * TWICE against the same fixture + asserts byte-identical outputs. Produces an
 * `AILoopVerificationResult` artifact suitable for §12.5 evidence bundles.
 *
 * Two AI sessions producing different outputs against the same fixture → AI-loop FAIL.
 * Determinism is the contract; the verifier surface is the audit-trail of that contract
 * being honored for any given PR's replay evidence claim.
 *
 * Scope discipline: 6.5d verifies the engine's determinism property end-to-end (load →
 * run → compare). It is NOT a replay-test PASS comparison (§11.10.4) — that's 6.5c's
 * replay-pass-runner. AI-loop is the layer ABOVE replay-test PASS: it confirms two
 * independent invocations of replay-test PASS agree.
 */

import { loadReplaySession, loadReplaySessionFromMemory } from './replay-engine.ts';
import { runReplayPassAgainstSession } from './replay-pass-runner.ts';
import type { CollectedReconciliationEvent } from './in-memory-event-collector.ts';

export interface AILoopVerificationResult {
  status: 'agree' | 'disagree';
  fixture_id: string;
  run_count: 2;
  event_count: number;
  events_run_1_json_hash: string;     // SHA-256 hex of JSON-serialized events from run 1
  events_run_2_json_hash: string;     // SHA-256 hex of JSON-serialized events from run 2
  divergence_summary: string | null;  // null on agree; human-readable diff on disagree
}

/** Compute SHA-256 hex digest of a string. Determinism-safe; uses Deno crypto API. */
async function sha256Hex(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compute a human-readable divergence summary between two event arrays. */
function describeDivergence(a: CollectedReconciliationEvent[], b: CollectedReconciliationEvent[]): string {
  if (a.length !== b.length) return `event_count mismatch: run_1=${a.length}, run_2=${b.length}`;
  const diffs: string[] = [];
  for (let i = 0; i < a.length; i++) {
    const aStr = JSON.stringify(a[i]);
    const bStr = JSON.stringify(b[i]);
    if (aStr !== bStr) diffs.push(`index ${i}: run_1=${aStr}, run_2=${bStr}`);
  }
  return diffs.length === 0 ? 'no per-event diff (but JSON-hash mismatch — investigate ordering / whitespace)' : diffs.join(' ;; ');
}

/**
 * Run AI-loop verification against an in-memory JSONL fixture.
 *
 * Two independent loads + two independent PASS runs + byte comparison.
 * Pure function for in-memory fixtures; suitable for unit testing.
 */
export async function verifyAILoopFromMemory(jsonl: string, fixture_id: string): Promise<AILoopVerificationResult> {
  const session1 = loadReplaySessionFromMemory({ jsonl });
  const session2 = loadReplaySessionFromMemory({ jsonl });
  const events1 = runReplayPassAgainstSession(session1);
  const events2 = runReplayPassAgainstSession(session2);

  const json1 = JSON.stringify(events1);
  const json2 = JSON.stringify(events2);
  const hash1 = await sha256Hex(json1);
  const hash2 = await sha256Hex(json2);

  const agree = hash1 === hash2;
  return {
    status: agree ? 'agree' : 'disagree',
    fixture_id,
    run_count: 2,
    event_count: events1.length,
    events_run_1_json_hash: hash1,
    events_run_2_json_hash: hash2,
    divergence_summary: agree ? null : describeDivergence(events1, events2),
  };
}

/**
 * Run AI-loop verification against an on-disk `.jsonl.zst` fixture.
 *
 * Requires `--allow-read` Deno permission.
 */
export async function verifyAILoopFromPath(fixturePath: string): Promise<AILoopVerificationResult> {
  const session1 = await loadReplaySession({ fixturePath });
  const session2 = await loadReplaySession({ fixturePath });
  const events1 = runReplayPassAgainstSession(session1);
  const events2 = runReplayPassAgainstSession(session2);

  const json1 = JSON.stringify(events1);
  const json2 = JSON.stringify(events2);
  const hash1 = await sha256Hex(json1);
  const hash2 = await sha256Hex(json2);

  const agree = hash1 === hash2;
  return {
    status: agree ? 'agree' : 'disagree',
    fixture_id: session1.fixture.envelope.replay_day_id,
    run_count: 2,
    event_count: events1.length,
    events_run_1_json_hash: hash1,
    events_run_2_json_hash: hash2,
    divergence_summary: agree ? null : describeDivergence(events1, events2),
  };
}