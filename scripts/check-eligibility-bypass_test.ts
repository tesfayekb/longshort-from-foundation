import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  findViolationsInLines,
  isInScope,
  isSanctioned,
  scanRepository,
} from './check-eligibility-bypass.ts';

Deno.test('isInScope — long-short paths', () => {
  assertEquals(isInScope('src/features/longshort/services/foo.ts'), true);
  assertEquals(isInScope('supabase/functions/longshort-signal-tick/index.ts'), true);
  assertEquals(isInScope('supabase/functions/_shared/longshort-universe/get-eligibility.ts'), true);
  assertEquals(isInScope('src/components/Header.tsx'), false);
  assertEquals(isInScope('supabase/functions/_shared/audit.ts'), false);
});

Deno.test('isSanctioned — wrapper, producer, persister, verifier, engine, replay, tests', () => {
  assertEquals(isSanctioned('supabase/functions/_shared/longshort-universe/get-eligibility.ts'), true);
  assertEquals(isSanctioned('supabase/functions/_shared/longshort-universe/hard-exclusions/apply-hard-exclusions.ts'), true);
  assertEquals(isSanctioned('supabase/functions/_shared/longshort-universe/refresh-jobs/universe-membership-persister.ts'), true);
  assertEquals(isSanctioned('supabase/functions/_shared/longshort-universe/verify-membership/universe-membership-fetcher.ts'), true);
  assertEquals(isSanctioned('supabase/functions/longshort-universe-enrich-and-filter/index.ts'), true);
  assertEquals(isSanctioned('src/features/longshort/services/replay/l2-synthetic.ts'), true);
  assertEquals(isSanctioned('src/features/longshort/services/signals/momentum_test.ts'), true);
  assertEquals(isSanctioned('scripts/check-eligibility-bypass.ts'), true);
});

Deno.test('isSanctioned — Phase 2+ downstream consumer NOT sanctioned', () => {
  assertEquals(isSanctioned('src/features/longshort/services/signals/momentum-ranker.ts'), false);
  assertEquals(isSanctioned('src/features/longshort/services/sizing/equal-weight.ts'), false);
  assertEquals(isSanctioned('supabase/functions/longshort-signal-tick/index.ts'), false);
});

Deno.test('findViolationsInLines — direct .long_eligible access flagged', () => {
  const v = findViolationsInLines(
    ['const x = row.long_eligible;'],
    'src/features/longshort/services/signals/momentum-ranker.ts',
  );
  assertEquals(v.length, 1);
  assertEquals(v[0].pattern, 'long_eligible');
});

Deno.test('findViolationsInLines — direct .short_eligible access flagged', () => {
  const v = findViolationsInLines(
    ['if (e.short_eligible === true) entries.push(e);'],
    'src/features/longshort/services/signals/momentum-ranker.ts',
  );
  assertEquals(v.length, 1);
  assertEquals(v[0].pattern, 'short_eligible');
});

Deno.test('findViolationsInLines — both tokens on one line → two violations', () => {
  const v = findViolationsInLines(
    ['return { long_eligible: r.long_eligible, short_eligible: r.short_eligible };'],
    'src/features/longshort/services/signals/momentum-ranker.ts',
  );
  assertEquals(v.length, 2);
});

Deno.test('findViolationsInLines — strings/comments excluded', () => {
  const v = findViolationsInLines(
    [
      "const note = 'long_eligible documentation reference';",
      '// long_eligible mentioned in a comment',
      'const x = 1; // sets x to short_eligible default',
    ],
    'src/features/longshort/services/signals/momentum-ranker.ts',
  );
  assertEquals(v.length, 0);
});

Deno.test('findViolationsInLines — block comment spanning lines excluded', () => {
  const v = findViolationsInLines(
    [
      '/*',
      ' * long_eligible appears in JSDoc',
      ' * short_eligible too',
      ' */',
      'const x = 1;',
    ],
    'src/features/longshort/services/signals/momentum-ranker.ts',
  );
  assertEquals(v.length, 0);
});

Deno.test('scanRepository — current HEAD is clean (sanctioned files cover existing usages)', async () => {
  const violations = await scanRepository();
  if (violations.length > 0) {
    console.error('Unexpected violations:');
    for (const v of violations) console.error(`  ${v.file}:${v.line} [${v.pattern}] ${v.text}`);
  }
  assertEquals(violations.length, 0);
});
