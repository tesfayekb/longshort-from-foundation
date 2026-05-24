import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseArguments, executeReplay } from './replay-run.ts';

Deno.test("replay-run: --dry-run returns scaffold-ready", async () => {
  const args = parseArguments(['--fixture=day1.json', '--dry-run']);
  const result = await executeReplay(args);
  assertEquals(result.status, 'scaffold-ready');
});

Deno.test("replay-run: without --fixture and without --dry-run returns pending guard", async () => {
  const args = parseArguments([]);
  const result = await executeReplay(args);
  assertEquals(result.status, 'fixture-replay-pending-6.5');
});