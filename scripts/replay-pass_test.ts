import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parsePassArguments, executeReplayPass } from './replay-pass.ts';

Deno.test("(1) parsePassArguments defaults verifier to verify_quote", () => {
  const args = parsePassArguments(['--fixture=x.jsonl.zst']);
  assertEquals(args.fixture, 'x.jsonl.zst');
  assertEquals(args.verifier, 'verify_quote');
});

Deno.test("(2) executeReplayPass returns fail when no fixture", async () => {
  const r = await executeReplayPass({ fixture: '', verifier: 'verify_quote' });
  assertEquals(r.status, 'fail');
});

Deno.test("(3) executeReplayPass rejects unsupported verifier", async () => {
  const r = await executeReplayPass({ fixture: '/tmp/x.jsonl.zst', verifier: 'verify_position' });
  assertEquals(r.status, 'fail');
  assertEquals(r.event_count, 0);
});

// FP-008 sub-step 8.11 / ACT-117 — verifier dispatch tests

Deno.test("(4) parsePassArguments accepts verify_universe_membership", () => {
  const args = parsePassArguments([
    '--fixture=replay_storage/l2-synthetic-universe-quarterly-refresh.jsonl.zst',
    '--verifier=verify_universe_membership',
  ]);
  assertEquals(args.verifier, 'verify_universe_membership');
});

Deno.test("(5) executeReplayPass rejects verify_position with updated supported-list message", async () => {
  const r = await executeReplayPass({ fixture: '/tmp/x.jsonl.zst', verifier: 'verify_position' });
  assertEquals(r.status, 'fail');
  // Surface 5 Option x: dispatch message enumerates supported verifiers (verify_quote + verify_universe_membership)
  assertEquals(r.message.includes('verify_universe_membership'), true);
});