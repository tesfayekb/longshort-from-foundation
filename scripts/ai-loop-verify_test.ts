import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseAILoopArguments } from './ai-loop-verify.ts';

Deno.test("(1) parses --fixture argument", () => {
  const args = parseAILoopArguments(['--fixture=/tmp/x.jsonl.zst']);
  assertEquals(args.fixture, '/tmp/x.jsonl.zst');
});

Deno.test("(2) defaults to empty fixture when arg absent", () => {
  const args = parseAILoopArguments([]);
  assertEquals(args.fixture, '');
});