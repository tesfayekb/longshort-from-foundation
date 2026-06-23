import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  checkAllLockfiles,
  checkLockfileAt,
  checkLockfileVersion,
  EXPECTED_LOCKFILE_VERSION,
  REQUIRED_LOCKFILES,
} from './check-lockfile-versions.ts';

// CI Gate 2 (.github/workflows/strong-evidence.yml line 66) runs:
//   deno test --allow-read --allow-net --allow-env --lock=deno.lock scripts/
// NO --allow-write. This test file MUST NOT call Deno.makeTempDir / writeTextFile /
// Deno.remove / Deno.mkdir — those require --allow-write and produced CI #374
// (PermissionDenied: Requires write access). All fixtures are in-memory (the pure
// `checkLockfileVersion` predicate, which is `No I/O, no side effects`) or
// committed read-only files under `scripts/__fixtures__/`. Catalog #58 — widened
// at CI #374 to cover the sandbox-vs-CI PERMISSION-divergence class.

// ---------- Pure predicate: checkLockfileVersion (no I/O) ----------

Deno.test('checkLockfileVersion — v3 JSON passes', () => {
  assertEquals(checkLockfileVersion({ version: '3', packages: {} }, 'deno.lock'), null);
});

Deno.test('checkLockfileVersion — v5 JSON returns wrong-version violation with observed=5', () => {
  const v = checkLockfileVersion({ version: '5', packages: {} }, 'deno.lock');
  assertEquals(v?.kind, 'wrong-version');
  assertEquals(v?.observed, '5');
  assertEquals(v?.path, 'deno.lock');
});

Deno.test('checkLockfileVersion — root v5 path label preserved', () => {
  const v = checkLockfileVersion({ version: '5' }, 'deno.lock');
  assertEquals(v?.path, 'deno.lock');
  assertEquals(v?.kind, 'wrong-version');
});

Deno.test('checkLockfileVersion — functions v5 path label preserved', () => {
  const v = checkLockfileVersion({ version: '5' }, 'supabase/functions/deno.lock');
  assertEquals(v?.path, 'supabase/functions/deno.lock');
  assertEquals(v?.kind, 'wrong-version');
});

Deno.test('checkLockfileVersion — missing version field returns missing-version-field', () => {
  const v = checkLockfileVersion({ packages: {} }, 'deno.lock');
  assertEquals(v?.kind, 'missing-version-field');
  assertEquals(v?.observed, null);
});

Deno.test('checkLockfileVersion — null is rejected as not-a-JSON-object', () => {
  const v = checkLockfileVersion(null, 'deno.lock');
  assertEquals(v?.kind, 'missing-version-field');
});

Deno.test('checkLockfileVersion — string scalar is rejected as not-a-JSON-object', () => {
  const v = checkLockfileVersion('x', 'deno.lock');
  assertEquals(v?.kind, 'missing-version-field');
});

Deno.test('checkLockfileVersion — numeric version (3) is rejected — string equality required', () => {
  // CI's Deno 1.46.3 emits strings; defending against type drift.
  const v = checkLockfileVersion({ version: 3 }, 'deno.lock');
  assertEquals(v?.kind, 'missing-version-field');
});

Deno.test('checkLockfileVersion — numeric version (5) is rejected as non-string, not wrong-version', () => {
  const v = checkLockfileVersion({ version: 5 }, 'deno.lock');
  assertEquals(v?.kind, 'missing-version-field');
});

// ---------- I/O wrapper: checkLockfileAt (read-only paths only) ----------

Deno.test('checkLockfileAt — missing file returns missing-file violation (nonexistent path, read-only)', async () => {
  // Pure read of a path that doesn't exist — needs --allow-read only.
  const v = await checkLockfileAt(
    'scripts/__fixtures__/__nonexistent_lock_for_test__.lock',
    'deno.lock',
  );
  assertEquals(v?.kind, 'missing-file');
  assertEquals(v?.path, 'deno.lock');
});

Deno.test('checkLockfileAt — unparseable JSON returns unparseable-json violation (committed read-only fixture)', async () => {
  // Fixture `scripts/__fixtures__/unparseable.lock` is committed read-only (`{not json`);
  // checked into the repo so the test reads under --allow-read with no write step.
  const v = await checkLockfileAt(
    'scripts/__fixtures__/unparseable.lock',
    'unparseable.lock',
  );
  assertEquals(v?.kind, 'unparseable-json');
  assertEquals(v?.path, 'unparseable.lock');
});

// ---------- Aggregator: checkAllLockfiles (real repo, happy path only) ----------

Deno.test('checkAllLockfiles — current repo is CLEAN (both locks at v3)', async () => {
  // The real repo locks are both v3 (Catalog #58 invariant); this is the happy
  // path of `checkAllLockfiles` against the actual filesystem. v5-detection
  // coverage lives in the pure-predicate tests above — no need to fabricate a
  // v5 lock on disk (which would require --allow-write CI does not grant).
  const violations = await checkAllLockfiles();
  if (violations.length > 0) {
    console.error('UNEXPECTED VIOLATIONS:', violations);
  }
  assertEquals(violations.length, 0, 'Both repo lockfiles must be at v3 per Catalog #58');
});

// ---------- Constant pins ----------

Deno.test('REQUIRED_LOCKFILES — both Catalog #58 paths present', () => {
  assertEquals(REQUIRED_LOCKFILES.includes('deno.lock'), true);
  assertEquals(REQUIRED_LOCKFILES.includes('supabase/functions/deno.lock'), true);
  assertEquals(REQUIRED_LOCKFILES.length, 2);
});

Deno.test('EXPECTED_LOCKFILE_VERSION — pinned to "3" per CI Deno 1.46.3', () => {
  assertEquals(EXPECTED_LOCKFILE_VERSION, '3');
});