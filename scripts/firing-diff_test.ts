import { assertEquals, assert, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildQuery, parseArguments } from './firing-diff.ts';

Deno.test("buildQuery: --since required", () => {
  assertThrows(() => buildQuery({ since: '', baselineCalls: [] }), Error, '--since=<ts> is required');
});

Deno.test("buildQuery: with baseline calls produces NOT IN clause", () => {
  const q = buildQuery({
    since: '2026-05-22T00:00:00Z',
    baselineCalls: ['verify_position', 'verify_quote'],
  });
  assert(q.sql.includes("NOT IN ('verify_position', 'verify_quote')"));
});

Deno.test("parseArguments: parses --since + --baseline-calls=comma-separated", () => {
  const args = parseArguments(['--since=2026-05-22T00:00:00Z', '--baseline-calls=verify_position,verify_quote']);
  assertEquals(args.since, '2026-05-22T00:00:00Z');
  assertEquals(args.baselineCalls, ['verify_position', 'verify_quote']);
});