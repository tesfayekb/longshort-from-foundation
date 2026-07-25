/**
 * check-ibkr-shadow-separation_test.ts — ACT-572 CI guard tests.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { scanFile, isShadowAllowed } from './check-ibkr-shadow-separation.ts';

Deno.test('violation: money-path handler imports shadow tree', () => {
  const src = `import { IbkrShadowClient } from '../_shared/overshoot-shadow-ibkr/cp-client.ts';\n`;
  const v = scanFile('supabase/functions/overshoot-entry-run/index.ts', src);
  assertEquals(v.length, 1);
  assertEquals(v[0].line, 1);
});

Deno.test('allowed: shadow mirror function imports shadow tree', () => {
  const src = `import { IbkrShadowClient } from '../_shared/overshoot-shadow-ibkr/cp-client.ts';\n`;
  const v = scanFile('supabase/functions/overshoot-ibkr-shadow-mirror/index.ts', src);
  assertEquals(v.length, 0);
});

Deno.test('allowed: intra-tree import', () => {
  const src = `import { X } from '../_shared/overshoot-shadow-ibkr/util.ts';\n`;
  const v = scanFile('supabase/functions/_shared/overshoot-shadow-ibkr/cp-client.ts', src);
  assertEquals(v.length, 0);
});

Deno.test('no false-positive on unrelated import', () => {
  const src = `import { createHandler } from '../_shared/handler.ts';\n`;
  const v = scanFile('supabase/functions/overshoot-entry-run/index.ts', src);
  assertEquals(v.length, 0);
});

Deno.test('isShadowAllowed predicate', () => {
  assertEquals(isShadowAllowed('supabase/functions/overshoot-ibkr-shadow-mirror/index.ts'), true);
  assertEquals(isShadowAllowed('supabase/functions/overshoot-ibkr-shadow-reconcile/index.ts'), true);
  assertEquals(isShadowAllowed('supabase/functions/_shared/overshoot-shadow-ibkr/cp-client.ts'), true);
  assertEquals(isShadowAllowed('scripts/check-ibkr-shadow-separation.ts'), true);
  assertEquals(isShadowAllowed('supabase/functions/overshoot-entry-run/index.ts'), false);
  assertEquals(isShadowAllowed('src/features/overshoot/hooks/useLots.ts'), false);
});