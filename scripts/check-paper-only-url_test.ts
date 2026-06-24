import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { findViolationInLine, isExcluded, scanRepository } from './check-paper-only-url.ts';

Deno.test('isExcluded — self and test files', () => {
  assertEquals(isExcluded('scripts/check-paper-only-url.ts'), true);
  assertEquals(isExcluded('scripts/check-paper-only-url_test.ts'), true);
  assertEquals(isExcluded('src/features/longshort/services/foo_test.ts'), true);
  assertEquals(isExcluded('src/features/longshort/services/foo.ts'), false);
});

Deno.test('findViolationInLine — live URL inside double-quoted string detected', () => {
  const v = findViolationInLine(
    'const url = "https://api.alpaca.markets/v2/orders";',
    'src/features/longshort/services/foo.ts',
    1
  );
  assertEquals(v !== null, true, 'Live URL inside string literal must be detected (defect #19 regression)');
});

Deno.test('findViolationInLine — live URL inside single-quoted string detected', () => {
  const v = findViolationInLine(
    "const url = 'https://api.alpaca.markets/v2/orders';",
    'src/features/longshort/services/foo.ts',
    1
  );
  assertEquals(v !== null, true);
});

Deno.test('findViolationInLine — live URL inside template string detected', () => {
  const v = findViolationInLine(
    'const url = `https://api.alpaca.markets/v2/orders/${id}`;',
    'src/features/longshort/services/foo.ts',
    1
  );
  assertEquals(v !== null, true);
});

Deno.test('findViolationInLine — paper URL acceptable (string)', () => {
  const v = findViolationInLine(
    'const url = "https://paper-api.alpaca.markets/v2/orders";',
    'src/features/longshort/services/foo.ts',
    1
  );
  assertEquals(v, null);
});

Deno.test('findViolationInLine — data URL acceptable (string)', () => {
  const v = findViolationInLine(
    'const dataUrl = "https://data.alpaca.markets/v2/stocks";',
    'src/features/longshort/services/foo.ts',
    1
  );
  assertEquals(v, null);
});

Deno.test('findViolationInLine — live URL inside line comment excluded', () => {
  const v = findViolationInLine(
    '// live URL would be https://api.alpaca.markets — banned per DEC-036 (2)',
    'src/features/longshort/services/foo.ts',
    1
  );
  assertEquals(v, null);
});

Deno.test('findViolationInLine — override annotation respected', () => {
  const v = findViolationInLine(
    'const url = "https://api.alpaca.markets"; // allow-live-alpaca-url: ADR-007',
    'src/features/longshort/services/foo.ts',
    1
  );
  assertEquals(v, null);
});

Deno.test('findViolationInLine — code-then-comment: violation in code part flagged', () => {
  const v = findViolationInLine(
    'const url = "https://api.alpaca.markets"; // paper would be safer',
    'src/features/longshort/services/foo.ts',
    1
  );
  assertEquals(v !== null, true, 'URL in code (pre-comment) must be flagged even when trailing comment exists');
});

Deno.test('scanRepository — clean on current repo', async () => {
  const violations = await scanRepository();
  if (violations.length > 0) {
    console.error('UNEXPECTED VIOLATIONS:', violations);
  }
  assertEquals(violations.length, 0, 'Repository should be clean of live Alpaca URLs at FP-006 closure boundary');
});

// ────────────────────────────────────────────────────────────────────────────
// INC-77 closure (DEC-068 clause f + k.8) — SCAN_ROOT expansion to
// supabase/functions/** so the E2 submitter + _shared/longshort-execution/
// live inside the static-lint coverage.
// ────────────────────────────────────────────────────────────────────────────

Deno.test('SCAN_ROOT expansion — catches live URL under supabase/functions/', async () => {
  // Build a temp tree mirroring the expanded SCAN_ROOTS so we exercise the
  // walk over BOTH scan roots without polluting the real repo. The test
  // proves the new supabase/functions root is covered.
  const tmp = await Deno.makeTempDir({ prefix: 'check-paper-only-url-scan-root-' });
  try {
    const fnDir = `${tmp}/supabase/functions/_shared/longshort-execution/__lint_fixture__`;
    await Deno.mkdir(fnDir, { recursive: true });
    // Build the literal live URL via concatenation so this test file itself
    // never contains the banned literal (kept inert under SELF_EXCLUDE +
    // _test.ts exclude semantics).
    const liveUrl = 'https://' + 'api.' + 'alpaca.markets/v2/orders';
    await Deno.writeTextFile(
      `${fnDir}/fixture.ts`,
      `// INC-77 SCAN_ROOT-expansion lint fixture — must be caught by scanRepository.\n` +
        `export const FIXTURE_URL = "${liveUrl}";\n`,
    );
    const violations = await scanRepository(tmp);
    assertEquals(violations.length, 1, 'expanded SCAN_ROOT must catch the fixture under supabase/functions/');
    assertEquals(violations[0].file.endsWith('fixture.ts'), true);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test('SCAN_ROOT — still covers src/features/longshort/ (original root preserved)', async () => {
  const tmp = await Deno.makeTempDir({ prefix: 'check-paper-only-url-orig-root-' });
  try {
    const dir = `${tmp}/src/features/longshort/services/__lint_fixture__`;
    await Deno.mkdir(dir, { recursive: true });
    const liveUrl = 'https://' + 'api.' + 'alpaca.markets';
    await Deno.writeTextFile(`${dir}/fixture.ts`, `export const X = "${liveUrl}";\n`);
    const violations = await scanRepository(tmp);
    assertEquals(violations.length, 1);
    assertEquals(violations[0].file.endsWith('fixture.ts'), true);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});
