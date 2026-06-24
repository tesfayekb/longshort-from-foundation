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
//
// Mechanism note (Gate-2b revision-fix): these tests previously built a temp
// tree via Deno.makeTempDir/writeTextFile, which requires --allow-write. CI
// Gate-2 + Gate-2b run scripts/ tests with --allow-read --allow-net --allow-env
// (NO --allow-write) by deliberate hardening — see strong-evidence.yml line
// 51-58 ("the permission-divergence axis"). The tests now consume a committed
// read-only fixture tree at scripts/__fixtures__/inc77-scan-roots/ instead.
// The fixture tree mirrors both SCAN_ROOTS and is invisible to a default
// scanRepository('.') run because scripts/__fixtures__/ is outside SCAN_ROOTS.
// Pattern parallels scripts/__fixtures__/unparseable.lock.
// ────────────────────────────────────────────────────────────────────────────

const INC77_FIXTURE_ROOT = 'scripts/__fixtures__/inc77-scan-roots';

Deno.test('SCAN_ROOT expansion — catches live URL under supabase/functions/', async () => {
  // Exercise the multi-root walk by pointing scanRepository at the committed
  // fixture tree. Proves the supabase/functions/** SCAN_ROOT resolves and
  // the live-URL pattern is detected under it.
  const violations = await scanRepository(INC77_FIXTURE_ROOT);
  const fnViolations = violations.filter((v) =>
    v.file.includes('supabase/functions/_shared/longshort-execution/__lint_fixture__/fixture.ts')
  );
  assertEquals(fnViolations.length, 1, 'expanded SCAN_ROOT must catch the fixture under supabase/functions/');
});

Deno.test('SCAN_ROOT — still covers src/features/longshort/ (original root preserved)', async () => {
  // Same fixture-tree mechanism; assert the src/features/longshort root is
  // still walked (regression guard for the multi-root expansion).
  const violations = await scanRepository(INC77_FIXTURE_ROOT);
  const srcViolations = violations.filter((v) =>
    v.file.includes('src/features/longshort/services/__lint_fixture__/fixture.ts')
  );
  assertEquals(srcViolations.length, 1, 'original src/features/longshort SCAN_ROOT must still be walked');
});
