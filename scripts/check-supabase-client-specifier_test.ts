import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  findViolationsInLines,
  isBannedSupabaseSpecifier,
  scanRepository,
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