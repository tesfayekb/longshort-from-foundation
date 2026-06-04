import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  findViolationsInLines,
  isInScope,
  isSanctioned,
  scanRepository,
} from './check-verify-after-mutation.ts';

Deno.test('isInScope — long-short server paths only', () => {
  assertEquals(isInScope('supabase/functions/longshort-reconciliation-tick/index.ts'), true);
  assertEquals(isInScope('supabase/functions/_shared/longshort-reconciliation-lifecycle.ts'), true);
  assertEquals(isInScope('supabase/functions/_shared/audit.ts'), false);
  assertEquals(isInScope('src/features/longshort/services/foo.ts'), false);
});

Deno.test('isSanctioned — lifecycle entrypoint + tests sanctioned', () => {
  assertEquals(isSanctioned('supabase/functions/_shared/longshort-reconciliation-lifecycle.ts'), true);
  assertEquals(isSanctioned('supabase/functions/longshort-reconciliation-tick/index_test.ts'), true);
  assertEquals(isSanctioned('supabase/functions/longshort-reconciliation-tick/index.ts'), false);
});

Deno.test('findViolationsInLines — mutation then verify wrapper → flagged', () => {
  const lines = [
    "await supabaseAdmin.from('orders').insert({ symbol: 'AAPL' });",
    "const r = await verifyPosition(args, fetcher, ts);",
  ];
  const v = findViolationsInLines(lines, 'supabase/functions/longshort-order-submit/index.ts');
  assertEquals(v.length, 1);
  assertEquals(v[0].mutation_line, 1);
  assertEquals(v[0].verify_line, 2);
});

Deno.test('findViolationsInLines — mutation then reconcile() → flagged', () => {
  const lines = [
    "await client.from('lots').upsert([{ id: 1 }]);",
    "const r = await reconcile(spec, invoke, ts);",
  ];
  const v = findViolationsInLines(lines, 'supabase/functions/longshort-fill-handler/index.ts');
  assertEquals(v.length, 1);
});

Deno.test('findViolationsInLines — override annotation on verify line escapes', () => {
  const lines = [
    "await supabaseAdmin.from('orders').insert({ symbol: 'AAPL' });",
    "const r = await verifyPosition(args, fetcher, ts); // gate-13-allow: post-mutation verify per §7.6 — post-fill confirm",
  ];
  const v = findViolationsInLines(lines, 'supabase/functions/longshort-fill-handler/index.ts');
  assertEquals(v.length, 0);
});

Deno.test('findViolationsInLines — override annotation on preceding line escapes', () => {
  const lines = [
    "await supabaseAdmin.from('orders').insert({ symbol: 'AAPL' });",
    "// gate-13-allow: post-mutation verify per §7.6 — post-fill confirm",
    "const r = await verifyLotRecord(args, fetcher, ts);",
  ];
  const v = findViolationsInLines(lines, 'supabase/functions/longshort-fill-handler/index.ts');
  assertEquals(v.length, 0);
});

Deno.test('findViolationsInLines — verify before mutation → clean (pre-mutation gate)', () => {
  const lines = [
    "const r = await verifyBuyingPower(args, fetcher, ts);",
    "if (r.outcome !== 'failure_escalated') {",
    "  await supabaseAdmin.from('orders').insert({ symbol: 'AAPL' });",
    "}",
  ];
  const v = findViolationsInLines(lines, 'supabase/functions/longshort-order-submit/index.ts');
  assertEquals(v.length, 0);
});

Deno.test('findViolationsInLines — mutation in string/comment ignored', () => {
  const lines = [
    "// docs: .insert( is the supabase-js mutation method",
    "const r = await verifyPosition(args, fetcher, ts);",
  ];
  const v = findViolationsInLines(lines, 'supabase/functions/longshort-reconciliation-tick/index.ts');
  assertEquals(v.length, 0);
});

Deno.test('scanRepository — current HEAD is clean (no live verify-after-mutation)', async () => {
  const violations = await scanRepository();
  if (violations.length > 0) {
    console.error('Unexpected violations:');
    for (const v of violations) {
      console.error(`  ${v.file}: mutation L${v.mutation_line} → verify L${v.verify_line}`);
    }
  }
  assertEquals(violations.length, 0);
});