import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  findViolationsInLine,
  isInScope,
  isExcluded,
  stripCommentsAndStrings,
  scanRepository,
} from './check-sentinel-patterns.ts';

Deno.test('isInScope — financial paths', () => {
  assertEquals(isInScope('src/features/longshort/services/foo.ts'), true);
  assertEquals(isInScope('src/features/longshort/api/bar.ts'), true);
  assertEquals(isInScope('supabase/functions/longshort-reconciliation-tick/index.ts'), true);
  assertEquals(isInScope('supabase/functions/_shared/strategy-reconciliation.ts'), true);
  assertEquals(isInScope('src/components/UnrelatedComponent.tsx'), false);
  assertEquals(isInScope('supabase/functions/_shared/auth.ts'), false);
});

Deno.test('isExcluded — test files and self', () => {
  assertEquals(isExcluded('scripts/check-sentinel-patterns.ts'), true);
  assertEquals(isExcluded('scripts/check-sentinel-patterns_test.ts'), true);
  assertEquals(isExcluded('src/features/longshort/services/foo_test.ts'), true);
  assertEquals(isExcluded('src/features/longshort/services/foo.ts'), false);
});

Deno.test('findViolationsInLine — ?? 0 banned', () => {
  const v = findViolationsInLine('const qty = resp.qty ?? 0;', 'src/features/longshort/services/foo.ts', 5);
  assertEquals(v.length, 1);
  assertEquals(v[0].pattern, '??-0');
});

Deno.test('findViolationsInLine — || 0 banned', () => {
  const v = findViolationsInLine('const price = parseFloat(resp.price) || 0;', 'src/features/longshort/services/foo.ts', 10);
  assertEquals(v.length, 2);
});

Deno.test('findViolationsInLine — parseFloat with || coercion', () => {
  const v = findViolationsInLine('parseFloat(x) || 0', 'src/features/longshort/services/foo.ts', 1);
  assertEquals(v.some(x => x.pattern === 'parseFloat-||'), true);
});

Deno.test('findViolationsInLine — hardcoded -1 return', () => {
  const v = findViolationsInLine('  return -1;', 'src/features/longshort/services/foo.ts', 1);
  assertEquals(v.length, 1);
  assertEquals(v[0].pattern, 'return-neg1');
});

Deno.test('findViolationsInLine — comments excluded', () => {
  const v = findViolationsInLine('// const qty = x ?? 0;', 'src/features/longshort/services/foo.ts', 1);
  assertEquals(v.length, 0);
});

Deno.test('findViolationsInLine — string literals excluded', () => {
  const v = findViolationsInLine('const msg = "qty ?? 0 is banned";', 'src/features/longshort/services/foo.ts', 1);
  assertEquals(v.length, 0);
});

Deno.test('findViolationsInLine — override annotation respected', () => {
  const v = findViolationsInLine('const qty = resp.qty ?? 0; // allow-sentinel-fallback: ADR-007', 'src/features/longshort/services/foo.ts', 1);
  assertEquals(v.length, 0);
});

Deno.test('stripCommentsAndStrings — basic cases', () => {
  assertEquals(stripCommentsAndStrings('code // comment ?? 0'), 'code ');
  assertEquals(stripCommentsAndStrings('"str ?? 0" + code'), ' + code');
  assertEquals(stripCommentsAndStrings('/* block */ code'), ' code');
});

Deno.test('scanRepository — clean on current repo', async () => {
  const violations = await scanRepository();
  if (violations.length > 0) {
    console.error('UNEXPECTED VIOLATIONS:', violations);
  }
  assertEquals(violations.length, 0, 'Repository should be clean of sentinel patterns at FP-006 closure boundary');
});