import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseArguments, executeReplay } from './replay-run.ts';

Deno.test("replay-run: --dry-run returns scaffold-ready", () => {
  const args = parseArguments(['--fixture=day1.json', '--dry-run']);
  const result = executeReplay(args);
  assertEquals(result.status, 'scaffold-ready');
});

Deno.test("replay-run: without --dry-run returns fixture-replay-pending-6.5", () => {
  const args = parseArguments(['--fixture=day1.json']);
  const result = executeReplay(args);
  assertEquals(result.status, 'fixture-replay-pending-6.5');
});