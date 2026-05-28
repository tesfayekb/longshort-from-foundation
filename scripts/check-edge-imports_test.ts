import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  findViolationsInLines,
  isBannedSpecifier,
  scanRepository,
} from './check-edge-imports.ts';

Deno.test('isBannedSpecifier: relative import into src/ is banned', () => {
  assert(isBannedSpecifier('../../../src/features/longshort/services/universe/foo.ts'));
});

Deno.test('isBannedSpecifier: bare `src/...` specifier is banned', () => {
  assert(isBannedSpecifier('src/features/foo.ts'));
});

Deno.test('isBannedSpecifier: sibling _shared import is clean', () => {
  assertEquals(isBannedSpecifier('../_shared/longshort-universe/refresh-jobs/foo.ts'), null);
});

Deno.test('isBannedSpecifier: deno std URL is clean', () => {
  assertEquals(isBannedSpecifier('https://deno.land/std@0.224.0/assert/mod.ts'), null);
});

Deno.test('isBannedSpecifier: npm specifier is clean', () => {
  assertEquals(isBannedSpecifier('npm:@supabase/supabase-js@2'), null);
});

Deno.test('findViolationsInLines: flags banned import line', () => {
  const lines = [
    `import { x } from '../../../src/features/longshort/foo.ts';`,
    `import { y } from '../_shared/handler.ts';`,
  ];
  const v = findViolationsInLines(lines, 'supabase/functions/foo/index.ts');
  assertEquals(v.length, 1);
  assertEquals(v[0].line, 1);
});

Deno.test('scanRepository: repo is clean after FP-011 refactor', async () => {
  const violations = await scanRepository('.');
  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line} ${v.text}`);
    }
  }
  assertEquals(violations.length, 0, 'edge functions must not import from src/');
});