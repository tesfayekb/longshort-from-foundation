import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { findViolationsInLines, isInScope, isExcluded, scanRepository } from './check-wall-clock.ts';

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

Deno.test('findViolationsInLines — Date.now() banned', () => {
  const v = findViolationsInLines(['const ts = Date.now();'], 'src/features/longshort/services/foo.ts');
  assertEquals(v.length, 1);
  assertEquals(v[0].pattern, 'Date.now');
});

Deno.test('findViolationsInLines — new Date() banned', () => {
  const v = findViolationsInLines(['const d = new Date();'], 'src/features/longshort/services/foo.ts');
  assertEquals(v.length, 1);
  assertEquals(v[0].pattern, 'new-Date-noarg');
});

Deno.test('findViolationsInLines — new Date(arg) acceptable', () => {
  const v = findViolationsInLines(['const d = new Date(isoString);'], 'src/features/longshort/services/foo.ts');
  assertEquals(v.length, 0);
});

Deno.test('findViolationsInLines — performance.now() banned', () => {
  const v = findViolationsInLines(['const t = performance.now();'], 'src/features/longshort/services/foo.ts');
  assertEquals(v.length, 1);
  assertEquals(v[0].pattern, 'performance.now');
});

Deno.test('findViolationsInLines — Temporal.Now banned', () => {
  const v = findViolationsInLines(['const inst = Temporal.Now.instant();'], 'src/features/longshort/services/foo.ts');
  assertEquals(v.length, 1);
  assertEquals(v[0].pattern, 'Temporal.Now');
});

Deno.test('findViolationsInLines — single-line comments excluded', () => {
  const v = findViolationsInLines(['// use Date.now() instead'], 'src/features/longshort/services/foo.ts');
  assertEquals(v.length, 0);
});

Deno.test('findViolationsInLines — override annotation respected', () => {
  const v = findViolationsInLines(
    ['return new Date(); // allow-now-in-business-logic: ADR-007'],
    'src/features/longshort/services/foo.ts'
  );
  assertEquals(v.length, 0);
});

Deno.test('findViolationsInLines — multi-line JSDoc prose mentioning Date.now() NOT flagged', () => {
  const lines = [
    '/**',
    ' * Per DEC-034 clause (4) banned patterns:',
    ' *   - Date.now() / new Date() outside of injected ts',
    ' *   - performance.now()',
    ' */',
    'export function foo() { return 42; }',
  ];
  const v = findViolationsInLines(lines, 'src/features/longshort/services/foo.ts');
  assertEquals(v.length, 0, 'JSDoc prose mentioning banned patterns must not be flagged');
});

Deno.test('findViolationsInLines — code AFTER multi-line JSDoc still detected', () => {
  const lines = [
    '/**',
    ' * This docstring mentions Date.now() in prose.',
    ' */',
    'const ts = Date.now();',
  ];
  const v = findViolationsInLines(lines, 'src/features/longshort/services/foo.ts');
  assertEquals(v.length, 1, 'Real code after JSDoc must still be detected');
  assertEquals(v[0].line, 4);
  assertEquals(v[0].pattern, 'Date.now');
});

Deno.test('findViolationsInLines — block-comment-then-code-on-same-line: code part detected', () => {
  const v = findViolationsInLines(
    ['/* setup */ const ts = Date.now();'],
    'src/features/longshort/services/foo.ts'
  );
  assertEquals(v.length, 1);
  assertEquals(v[0].pattern, 'Date.now');
});

Deno.test('scanRepository — clean on current repo', async () => {
  const violations = await scanRepository();
  if (violations.length > 0) {
    console.error('UNEXPECTED VIOLATIONS:', violations);
  }
  assertEquals(violations.length, 0, 'Repository should be clean of wall-clock leakage at FP-006 closure boundary');
});
