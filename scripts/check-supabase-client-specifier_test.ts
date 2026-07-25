import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  findViolationsInLines,
  findViolationsInText,
  isBannedSupabaseSpecifier,
  scanRepository,
  stripComments,
} from './check-supabase-client-specifier.ts';

Deno.test('isBannedSupabaseSpecifier — esm.sh supabase-js runtime import is banned', () => {
  assert(isBannedSupabaseSpecifier('https://esm.sh/@supabase/supabase-js@2'));
});

Deno.test('isBannedSupabaseSpecifier — esm.sh supabase-js type path is banned', () => {
  assert(isBannedSupabaseSpecifier('https://esm.sh/@supabase/supabase-js@2.107.0'));
});

Deno.test('isBannedSupabaseSpecifier — canonical import-map specifier is clean', () => {
  assertEquals(isBannedSupabaseSpecifier('@supabase/supabase-js'), false);
});

Deno.test('findViolationsInLines — flags import type from esm.sh', () => {
  const lines = [
    "import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';",
    "import { createClient } from '@supabase/supabase-js';",
  ];
  const v = findViolationsInLines(lines, 'supabase/functions/_shared/example.ts');
  assertEquals(v.length, 1);
  assertEquals(v[0].line, 1);
});

Deno.test('findViolationsInLines — flags dynamic import from esm.sh', () => {
  const lines = [
    "const sdk = await import('https://esm.sh/@supabase/supabase-js@2');",
  ];
  const v = findViolationsInLines(lines, 'supabase/functions/_shared/example.ts');
  assertEquals(v.length, 1);
});

Deno.test('scanRepository — edge-function tree has no esm.sh supabase-js imports', async () => {
  const violations = await scanRepository();
  if (violations.length > 0) {
    for (const v of violations) console.error(`${v.file}:${v.line} ${v.text}`);
  }
  assertEquals(violations.length, 0);
});

// Comment-mention negative: prose that contains the literal
// "from 'https://esm.sh/@supabase/supabase-js@2'" inside a line comment
// or a block comment MUST NOT be flagged. This is the CI-scanner-fix
// regression fixture (owed from prior ruling).
Deno.test('findViolationsInText — line-comment mention of banned specifier is IGNORED', () => {
  const fixture = [
    "// historical note: we used to write `from 'https://esm.sh/@supabase/supabase-js@2'`",
    "import { createClient } from '@supabase/supabase-js';",
  ].join('\n');
  const v = findViolationsInText(fixture, 'fixture/comment-mention.ts');
  assertEquals(v.length, 0);
});

Deno.test('findViolationsInText — block-comment mention of banned specifier is IGNORED', () => {
  const fixture = [
    '/**',
    " * DO NOT import from 'https://esm.sh/@supabase/supabase-js@2' —",
    ' * use the canonical import-map specifier instead.',
    ' */',
    "import { createClient } from '@supabase/supabase-js';",
  ].join('\n');
  const v = findViolationsInText(fixture, 'fixture/block-comment-mention.ts');
  assertEquals(v.length, 0);
});

// Real-import positive via fixture string: a genuine `import ... from
// 'https://esm.sh/@supabase/supabase-js@2'` MUST still be flagged, on
// the correct 1-based line, so the fix does not blunt Gate 14.
Deno.test('findViolationsInText — real import of banned specifier is FLAGGED with correct line', () => {
  const fixture = [
    '// leading comment line',
    '',
    "import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';",
    "import type { SupabaseClient } from '@supabase/supabase-js';",
  ].join('\n');
  const v = findViolationsInText(fixture, 'fixture/real-import.ts');
  assertEquals(v.length, 1);
  assertEquals(v[0].line, 3);
  assert(v[0].specifier.startsWith('https://esm.sh/@supabase/supabase-js'));
});

Deno.test('stripComments — preserves string literal that looks like a comment', () => {
  const src = "const s = '// not a comment'; import x from 'https://esm.sh/@supabase/supabase-js@2';";
  const stripped = stripComments(src);
  // string preserved, import specifier still present
  assert(stripped.includes("'// not a comment'"));
  assert(stripped.includes('esm.sh/@supabase/supabase-js'));
});