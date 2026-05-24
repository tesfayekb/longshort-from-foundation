import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { verifyAILoopFromMemory } from './ai-loop-verifier.ts';
import { buildL2SyntheticDay1, serializeL2SyntheticDay1ToJsonl } from './l2-synthetic-day-1-generator.ts';

Deno.test("(1) AI-loop verification on L2 Day 1 → agree", async () => {
  const fixture = buildL2SyntheticDay1();
  const jsonl = serializeL2SyntheticDay1ToJsonl(fixture);
  const result = await verifyAILoopFromMemory(jsonl, 'l2-synthetic-day-1');
  assertEquals(result.status, 'agree');
  assertEquals(result.run_count, 2);
  assertEquals(result.divergence_summary, null);
});

Deno.test("(2) hashes are non-empty hex strings", async () => {
  const fixture = buildL2SyntheticDay1();
  const result = await verifyAILoopFromMemory(serializeL2SyntheticDay1ToJsonl(fixture), 'l2-synthetic-day-1');
  assert(/^[0-9a-f]{64}$/.test(result.events_run_1_json_hash));
  assert(/^[0-9a-f]{64}$/.test(result.events_run_2_json_hash));
});

Deno.test("(3) agree implies hash1 === hash2", async () => {
  const fixture = buildL2SyntheticDay1();
  const result = await verifyAILoopFromMemory(serializeL2SyntheticDay1ToJsonl(fixture), 'l2-synthetic-day-1');
  assertEquals(result.events_run_1_json_hash, result.events_run_2_json_hash);
});

Deno.test("(4) event_count matches replay-pass output (3 ticks)", async () => {
  const fixture = buildL2SyntheticDay1();
  const result = await verifyAILoopFromMemory(serializeL2SyntheticDay1ToJsonl(fixture), 'l2-synthetic-day-1');
  assertEquals(result.event_count, 3);
});

Deno.test("(5) fixture_id round-trips through result", async () => {
  const fixture = buildL2SyntheticDay1();
  const result = await verifyAILoopFromMemory(serializeL2SyntheticDay1ToJsonl(fixture), 'custom-id-xyz');
  assertEquals(result.fixture_id, 'custom-id-xyz');
});

Deno.test("(6) AI-loop verification is itself deterministic — two invocations agree on the result shape", async () => {
  const fixture = buildL2SyntheticDay1();
  const jsonl = serializeL2SyntheticDay1ToJsonl(fixture);
  const r1 = await verifyAILoopFromMemory(jsonl, 'l2-synthetic-day-1');
  const r2 = await verifyAILoopFromMemory(jsonl, 'l2-synthetic-day-1');
  assertEquals(JSON.stringify(r1), JSON.stringify(r2));
});