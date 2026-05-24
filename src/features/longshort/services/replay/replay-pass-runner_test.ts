import { assertEquals, assert, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { loadReplaySessionFromMemory } from './replay-engine.ts';
import { buildL2SyntheticDay1, serializeL2SyntheticDay1ToJsonl } from './l2-synthetic-day-1-generator.ts';
import { runReplayPassAgainstSession } from './replay-pass-runner.ts';

Deno.test("(1) L2 synthetic Day 1 fixture parses cleanly through engine", () => {
  const fixture = buildL2SyntheticDay1();
  const jsonl = serializeL2SyntheticDay1ToJsonl(fixture);
  const session = loadReplaySessionFromMemory({ jsonl });
  assertEquals(session.fixture.envelope.replay_day_id, 'l2-synthetic-day-1');
  assertEquals(session.fixture.events.length, 9); // 3 ticks × 3 streams
});

Deno.test("(2) replay-pass produces 3 collected events (1 per tick)", () => {
  const fixture = buildL2SyntheticDay1();
  const jsonl = serializeL2SyntheticDay1ToJsonl(fixture);
  const session = loadReplaySessionFromMemory({ jsonl });
  const events = runReplayPassAgainstSession(session);
  assertEquals(events.length, 3);
});

Deno.test("(3) tick 1 + tick 2 classify as false_positive_within_tolerance", () => {
  const fixture = buildL2SyntheticDay1();
  const session = loadReplaySessionFromMemory({ jsonl: serializeL2SyntheticDay1ToJsonl(fixture) });
  const events = runReplayPassAgainstSession(session);
  assertEquals(events[0].outcome, 'false_positive_within_tolerance');
  assertEquals(events[1].outcome, 'false_positive_within_tolerance');
});

Deno.test("(4) tick 3 classifies as failure_handled (10bp + 15¢ exceeds both thresholds)", () => {
  const fixture = buildL2SyntheticDay1();
  const session = loadReplaySessionFromMemory({ jsonl: serializeL2SyntheticDay1ToJsonl(fixture) });
  const events = runReplayPassAgainstSession(session);
  assertEquals(events[2].outcome, 'failure_handled');
  assertEquals(events[2].action_taken, 'logged_for_pattern_analysis');
});

Deno.test("(5) tick 3 max_pairwise_bps under 100 (not failure_escalated)", () => {
  const fixture = buildL2SyntheticDay1();
  const session = loadReplaySessionFromMemory({ jsonl: serializeL2SyntheticDay1ToJsonl(fixture) });
  const events = runReplayPassAgainstSession(session);
  const max = events[2].divergence.max_pairwise_bps as number;
  assert(max < 100, `expected max_pairwise_bps < 100, got ${max}`);
});

Deno.test("(6) §11.10.4 PASS — two runs produce byte-identical event sequences", () => {
  const fixture = buildL2SyntheticDay1();
  const jsonl = serializeL2SyntheticDay1ToJsonl(fixture);
  const session1 = loadReplaySessionFromMemory({ jsonl });
  const session2 = loadReplaySessionFromMemory({ jsonl });
  const events1 = runReplayPassAgainstSession(session1);
  const events2 = runReplayPassAgainstSession(session2);
  assertEquals(JSON.stringify(events1), JSON.stringify(events2));
});

Deno.test("(7) sanity check — different fixture content produces different events", () => {
  const fixture = buildL2SyntheticDay1();
  const jsonl1 = serializeL2SyntheticDay1ToJsonl(fixture);
  const session1 = loadReplaySessionFromMemory({ jsonl: jsonl1 });
  const events1 = runReplayPassAgainstSession(session1);

  // Mutate the fixture: change tick 3 recon quote to drop divergence under threshold
  const mutated = buildL2SyntheticDay1();
  mutated.events[8] = {
    ...(mutated.events[8] as { stream: 'reconciliation_quote'; ts: string; symbol: string; bid: number; ask: number; last: number; source: string }),
    last: 150.0001,  // negligible divergence
  };
  const jsonl2 = serializeL2SyntheticDay1ToJsonl(mutated);
  const session2 = loadReplaySessionFromMemory({ jsonl: jsonl2 });
  const events2 = runReplayPassAgainstSession(session2);

  assertNotEquals(JSON.stringify(events1), JSON.stringify(events2));
});