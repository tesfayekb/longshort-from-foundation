import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { findViolationsInLine, isInScope, isExcluded, scanRepository } from './check-wall-clock.ts';

Deno.test('isInScope — financial paths', () => {
  assertEquals(isInScope('src/features/longshort/services/foo.ts'), true);
  assertEquals(isInScope('supabase/functions/longshort-reconciliation-tick/index.ts'), true);
  assertEquals(isInScope('supabase/functions/_shared/longshort-verifiers/verify_position.ts'), true);
  assertEquals(isInScope('src/components/Header.tsx'), false);
});

Deno.test('isExcluded — sanctioned clock files', () => {
  assertEquals(isExcluded('supabase/functions/_shared/longshort-clock.ts'), true);
  assertEquals(isExcluded('src/features/longshort/utils/clock.ts'), true);
  assertEquals(isExcluded('scripts/check-wall-clock.ts'), true);
  assertEquals(isExcluded('scripts/check-wall-clock_test.ts'), true);
  assertEquals(isExcluded('src/features/longshort/services/foo_test.ts'), true);
});

Deno.test('findViolationsInLine — Date.now() banned', () => {
  const v = findViolationsInLine('const ts = Date.now();', 'src/features/longshort/services/foo.ts', 1);
  assertEquals(v.length, 1);
  assertEquals(v[0].pattern, 'Date.now');
});

Deno.test('findViolationsInLine — new Date() banned', () => {
  const v = findViolationsInLine('const d = new Date();', 'src/features/longshort/services/foo.ts', 1);
  assertEquals(v.length, 1);
  assertEquals(v[0].pattern, 'new-Date-noarg');
});

Deno.test('findViolationsInLine — new Date(arg) acceptable', () => {
  const v = findViolationsInLine('const d = new Date(isoString);', 'src/features/longshort/services/foo.ts', 1);
  assertEquals(v.length, 0);
});

Deno.test('findViolationsInLine — performance.now() banned', () => {
  const v = findViolationsInLine('const t = performance.now();', 'src/features/longshort/services/foo.ts', 1);
  assertEquals(v.length, 1);
  assertEquals(v[0].pattern, 'performance.now');
});

Deno.test('findViolationsInLine — Temporal.Now banned', () => {
  const v = findViolationsInLine('const inst = Temporal.Now.instant();', 'src/features/longshort/services/foo.ts', 1);
  assertEquals(v.length, 1);
  assertEquals(v[0].pattern, 'Temporal.Now');
});

Deno.test('findViolationsInLine — comments excluded', () => {
  const v = findViolationsInLine('// use Date.now() instead', 'src/features/longshort/services/foo.ts', 1);
  assertEquals(v.length, 0);
});

Deno.test('findViolationsInLine — override annotation respected', () => {
  const v = findViolationsInLine('return new Date(); // allow-now-in-business-logic: ADR-002', 'src/features/longshort/services/foo.ts', 1);
  assertEquals(v.length, 0);
});

Deno.test('scanRepository — clean on current repo', async () => {
  const violations = await scanRepository();
  if (violations.length > 0) {
    console.error('UNEXPECTED VIOLATIONS:', violations);
  }
  assertEquals(violations.length, 0, 'Repository should be clean of wall-clock leakage at FP-006 closure boundary');
});