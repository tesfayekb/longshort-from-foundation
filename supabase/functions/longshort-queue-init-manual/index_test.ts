// deno-lint-ignore-file no-import-prefix -- std assert import
// @ts-nocheck — source-sentinel test for longshort-queue-init-manual handler.
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const SRC = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('POST-only + JWT + longshort.manage gate', () => {
  assert(SRC.includes("req.method !== 'POST'"));
  assert(SRC.includes('authenticateRequest(req)'));
  assert(SRC.includes("checkPermissionOrThrow(authCtx.user.id, 'longshort.manage')"));
  // Manual path must NOT verifyCronSecret.
  assert(!SRC.includes('verifyCronSecret('));
});

Deno.test('as_of optional with parseAsOfDate + future-date guard', () => {
  assert(SRC.includes('parseAsOfDate(obj.as_of)'));
  assert(SRC.includes("'as_of_invalid_format_expected_YYYY_MM_DD'"));
  assert(SRC.includes("'as_of_in_future'"));
});

Deno.test('emits RUN_STARTED + RUN_FAILED with manual trigger metadata', () => {
  assert(SRC.includes("trigger: 'manual'"));
  assert(SRC.includes('QUEUE_AUDIT_EVENTS.RUN_STARTED'));
  assert(SRC.includes('QUEUE_AUDIT_EVENTS.RUN_FAILED'));
});

Deno.test('returns 202 on init result', () => {
  assert(/apiSuccess\([^)]*,\s*202\s*\)/.test(SRC));
});

Deno.test('no any / no eslint-disable / no Date.now', () => {
  assert(!/:\s*any\b/.test(SRC));
  assert(!SRC.includes('eslint-disable'));
  const code = SRC
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
  assert(!/Date\.now\s*\(/.test(code));
});