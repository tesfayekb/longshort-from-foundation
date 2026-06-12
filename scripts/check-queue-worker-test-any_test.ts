// deno-lint-ignore-file no-import-prefix
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  findAnyInLine,
  scanQueueWorkerTests,
  stripCommentsAndStrings,
} from './check-queue-worker-test-any.ts';

Deno.test('findAnyInLine: flags : any', () => {
  assert(findAnyInLine('const x: any = 1;'));
});

Deno.test('findAnyInLine: flags as any', () => {
  assert(findAnyInLine('return v as any;'));
});

Deno.test('findAnyInLine: flags <any>', () => {
  assert(findAnyInLine('const a: Array<any> = [];'));
});

Deno.test('findAnyInLine: ignores identifiers containing any', () => {
  assert(!findAnyInLine('const company = "acme";'));
  assert(!findAnyInLine('Many results returned;'));
  assert(!findAnyInLine('Anything goes;'));
});

Deno.test('findAnyInLine: ignores any inside comments and strings', () => {
  assert(!findAnyInLine('// any here is fine'));
  assert(!findAnyInLine('const s = "any";'));
  assert(!findAnyInLine("const s = 'any';"));
  assert(!findAnyInLine('const s = `any`;'));
});

Deno.test('stripCommentsAndStrings: removes block comments', () => {
  assertEquals(stripCommentsAndStrings('let x = /* any */ 1;').includes('any'), false);
});

Deno.test('scanQueueWorkerTests: live repo scan is clean', async () => {
  const violations = await scanQueueWorkerTests();
  if (violations.length > 0) {
    console.error(violations);
  }
  assertEquals(violations.length, 0,
    'queue-worker test files must contain zero literal `any` tokens (use typed mocks per FP-041)');
});