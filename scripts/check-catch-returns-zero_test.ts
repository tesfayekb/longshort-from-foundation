import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { findViolationsInLines, scanRepository } from './check-catch-returns-zero.ts';

Deno.test('findViolationsInLines — catch { return 0 } flagged', () => {
  const lines = [
    'function foo() {',
    '  try {',
    '    return computeValue();',
    '  } catch (e) {',
    '    return 0;',
    '  }',
    '}',
  ];
  const v = findViolationsInLines(lines, 'src/features/longshort/services/foo.ts');
  assertEquals(v.length, 1);
  assertEquals(v[0].line, 4);
});

Deno.test('findViolationsInLines — catch { throw e } NOT flagged', () => {
  const lines = [
    'function foo() {',
    '  try {',
    '    return computeValue();',
    '  } catch (e) {',
    '    throw new AlpacaSchemaError(e);',
    '  }',
    '}',
  ];
  const v = findViolationsInLines(lines, 'src/features/longshort/services/foo.ts');
  assertEquals(v.length, 0);
});

Deno.test('findViolationsInLines — catch { log; return result } NOT flagged (return not zero)', () => {
  const lines = [
    'function foo() {',
    '  try {',
    '    return computeValue();',
    '  } catch (e) {',
    '    return result;',
    '  }',
    '}',
  ];
  const v = findViolationsInLines(lines, 'src/features/longshort/services/foo.ts');
  assertEquals(v.length, 0);
});

Deno.test('findViolationsInLines — override annotation respected', () => {
  const lines = [
    'function foo() {',
    '  try {',
    '    return computeValue();',
    '  } catch (e) { // allow-catch-zero: ADR-008',
    '    return 0;',
    '  }',
    '}',
  ];
  const v = findViolationsInLines(lines, 'src/features/longshort/services/foo.ts');
  assertEquals(v.length, 0);
});

Deno.test('scanRepository — clean on current repo', async () => {
  const violations = await scanRepository();
  if (violations.length > 0) {
    console.error('UNEXPECTED VIOLATIONS:', violations);
  }
  assertEquals(violations.length, 0, 'Repository should be clean of catch-returns-zero at FP-006 closure boundary');
});