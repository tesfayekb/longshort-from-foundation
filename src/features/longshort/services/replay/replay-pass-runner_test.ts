import { assertEquals, assert, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { loadReplaySessionFromMemory } from './replay-engine.ts';
import { buildL2SyntheticDay1, serializeL2SyntheticDay1ToJsonl } from './l2-synthetic-day-1-generator.ts';
import { runReplayPassAgainstSession, runUniverseMembershipReplayPass } from './replay-pass-runner.ts';
import {
  buildL2SyntheticUniverseQuarterlyRefresh,
  serializeL2SyntheticUniverseQuarterlyRefreshToJsonl,
  parseUniverseQuarterlyRefreshFixture,
  FIXTURE_AS_OF_TS,
} from './l2-synthetic-universe-quarterly-refresh-generator.ts';

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

// =============================================================================
// FP-008 sub-step 8.11 / ACT-117 — verify_universe_membership replay tests
// =============================================================================

Deno.test("(U1) universe-membership fixture parses through parallel loader", () => {
  const fixture = buildL2SyntheticUniverseQuarterlyRefresh();
  const jsonl = serializeL2SyntheticUniverseQuarterlyRefreshToJsonl(fixture);
  const parsed = parseUniverseQuarterlyRefreshFixture(jsonl);
  assertEquals(parsed.envelope.replay_day_id, 'l2-synthetic-universe-quarterly-refresh');
  assertEquals(parsed.events.length, 10);
});

Deno.test("(U2) replay-pass produces 10 collected events (1 per ticker)", () => {
  const fixture = buildL2SyntheticUniverseQuarterlyRefresh();
  const events = runUniverseMembershipReplayPass(fixture, FIXTURE_AS_OF_TS);
  assertEquals(events.length, 10);
});

Deno.test("(U3) eligibility classification distribution: 8 false_positive + 0 failure_handled + 2 failure_escalated", () => {
  const fixture = buildL2SyntheticUniverseQuarterlyRefresh();
  const events = runUniverseMembershipReplayPass(fixture, FIXTURE_AS_OF_TS);
  const fp = events.filter((e) => e.outcome === 'false_positive_within_tolerance').length;
  const fh = events.filter((e) => e.outcome === 'failure_handled').length;
  const fe = events.filter((e) => e.outcome === 'failure_escalated').length;
  assertEquals(fp, 8);
  assertEquals(fh, 0);
  assertEquals(fe, 2);
});

Deno.test("(U4) materially-excluded tickers (XYZM in_ma, HALT halted_5d_plus) escalate", () => {
  const fixture = buildL2SyntheticUniverseQuarterlyRefresh();
  const events = runUniverseMembershipReplayPass(fixture, FIXTURE_AS_OF_TS);
  const xyzm = events.find((e) => e.symbol === 'XYZM');
  const halt = events.find((e) => e.symbol === 'HALT');
  assert(xyzm, 'XYZM missing');
  assert(halt, 'HALT missing');
  assertEquals(xyzm.outcome, 'failure_escalated');
  assertEquals(xyzm.action_taken, 'entry_blocked_materially_excluded');
  assertEquals(halt.outcome, 'failure_escalated');
  assertEquals(halt.action_taken, 'entry_blocked_materially_excluded');
});

Deno.test("(U5) AC-22 determinism — two runs produce byte-identical event sequences", () => {
  const fixture1 = buildL2SyntheticUniverseQuarterlyRefresh();
  const fixture2 = buildL2SyntheticUniverseQuarterlyRefresh();
  const events1 = runUniverseMembershipReplayPass(fixture1, FIXTURE_AS_OF_TS);
  const events2 = runUniverseMembershipReplayPass(fixture2, FIXTURE_AS_OF_TS);
  assertEquals(JSON.stringify(events1), JSON.stringify(events2));
});

Deno.test("(U6) AC-21 round-trip — serialize → parse → replay yields identical outcomes", () => {
  const fixture = buildL2SyntheticUniverseQuarterlyRefresh();
  const direct = runUniverseMembershipReplayPass(fixture, FIXTURE_AS_OF_TS);
  const jsonl = serializeL2SyntheticUniverseQuarterlyRefreshToJsonl(fixture);
  const reparsed = parseUniverseQuarterlyRefreshFixture(jsonl);
  const roundTripped = runUniverseMembershipReplayPass(reparsed, FIXTURE_AS_OF_TS);
  assertEquals(JSON.stringify(direct), JSON.stringify(roundTripped));
});