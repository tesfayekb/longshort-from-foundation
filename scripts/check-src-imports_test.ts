import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  findViolationsInLines,
  isBannedSpecifier,
  scanRepository,
} from './check-src-imports.ts';

Deno.test('isBannedSpecifier: relative import into supabase/functions/ is banned', () => {
  assert(isBannedSpecifier('../../../../supabase/functions/_shared/foo.ts'));
});

Deno.test('isBannedSpecifier: bare `supabase/functions/...` specifier is banned', () => {
  assert(isBannedSpecifier('supabase/functions/_shared/foo.ts'));
});

Deno.test('isBannedSpecifier: intra-src relative is clean', () => {
  assertEquals(isBannedSpecifier('../../components/Foo.tsx'), null);
});

Deno.test('isBannedSpecifier: npm specifier is clean', () => {
  assertEquals(isBannedSpecifier('npm:@supabase/supabase-js@2'), null);
});

Deno.test('isBannedSpecifier: https URL is clean', () => {
  assertEquals(isBannedSpecifier('https://deno.land/std@0.224.0/assert/mod.ts'), null);
});

Deno.test('findViolationsInLines: flags banned import line', () => {
  const lines = [
    `import { x } from '../../../../supabase/functions/_shared/foo.ts';`,
    `import { y } from './sibling.ts';`,
  ];
  const v = findViolationsInLines(lines, 'src/features/foo/bar.ts');
  assertEquals(v.length, 1);
  assertEquals(v[0].line, 1);
});

Deno.test('scanRepository: repo is clean after ACT-316 (src/ does not import supabase/functions/)', async () => {
  const violations = await scanRepository('.');
  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line} ${v.text}`);
    }
  }
  assertEquals(violations.length, 0, 'src/ must not import from supabase/functions/');
});