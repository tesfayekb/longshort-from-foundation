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