import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  checkAllLockfiles,
  checkLockfileAt,
  checkLockfileVersion,
  EXPECTED_LOCKFILE_VERSION,
  REQUIRED_LOCKFILES,
} from './check-lockfile-versions.ts';

Deno.test('checkLockfileVersion — v3 JSON passes', () => {
  const v = checkLockfileVersion({ version: '3', packages: {} }, 'deno.lock');
  assertEquals(v, null);
});

Deno.test('checkLockfileVersion — v5 JSON returns wrong-version violation with observed=5', () => {
  const v = checkLockfileVersion({ version: '5', packages: {} }, 'deno.lock');
  assertEquals(v?.kind, 'wrong-version');
  assertEquals(v?.observed, '5');
  assertEquals(v?.path, 'deno.lock');
});

Deno.test('checkLockfileVersion — missing version field returns missing-version-field', () => {
  const v = checkLockfileVersion({ packages: {} }, 'deno.lock');
  assertEquals(v?.kind, 'missing-version-field');
  assertEquals(v?.observed, null);
});

Deno.test('checkLockfileVersion — non-object input returns missing-version-field', () => {
  const v = checkLockfileVersion(null, 'deno.lock');
  assertEquals(v?.kind, 'missing-version-field');
});

Deno.test('checkLockfileVersion — numeric version (3) is rejected — string equality required', () => {
  // CI's Deno 1.46.3 emits strings; defending against type drift.
  const v = checkLockfileVersion({ version: 3 }, 'deno.lock');
  assertEquals(v?.kind, 'missing-version-field');
});

Deno.test('checkLockfileAt — missing file returns missing-file violation', async () => {
  const tmp = await Deno.makeTempDir();
  try {
    const v = await checkLockfileAt(`${tmp}/does-not-exist.lock`, 'deno.lock');
    assertEquals(v?.kind, 'missing-file');
    assertEquals(v?.path, 'deno.lock');
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test('checkLockfileAt — unparseable JSON returns unparseable-json violation', async () => {
  const tmp = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${tmp}/deno.lock`, '{not json');
    const v = await checkLockfileAt(`${tmp}/deno.lock`, 'deno.lock');
    assertEquals(v?.kind, 'unparseable-json');
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test('checkAllLockfiles — both locks v3 → empty violations (tmp fixture)', async () => {
  const tmp = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${tmp}/deno.lock`, JSON.stringify({ version: '3' }));
    await Deno.mkdir(`${tmp}/supabase/functions`, { recursive: true });
    await Deno.writeTextFile(
      `${tmp}/supabase/functions/deno.lock`,
      JSON.stringify({ version: '3' }),
    );
    const violations = await checkAllLockfiles(tmp);
    assertEquals(violations.length, 0);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test('checkAllLockfiles — root v5 + functions v3 → exactly one wrong-version violation on root', async () => {
  const tmp = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${tmp}/deno.lock`, JSON.stringify({ version: '5' }));
    await Deno.mkdir(`${tmp}/supabase/functions`, { recursive: true });
    await Deno.writeTextFile(
      `${tmp}/supabase/functions/deno.lock`,
      JSON.stringify({ version: '3' }),
    );
    const violations = await checkAllLockfiles(tmp);
    assertEquals(violations.length, 1);
    assertEquals(violations[0].kind, 'wrong-version');
    assertEquals(violations[0].path, 'deno.lock');
    assertEquals(violations[0].observed, '5');
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test('checkAllLockfiles — root v3 + functions v5 → exactly one wrong-version violation on functions', async () => {
  const tmp = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${tmp}/deno.lock`, JSON.stringify({ version: '3' }));
    await Deno.mkdir(`${tmp}/supabase/functions`, { recursive: true });
    await Deno.writeTextFile(
      `${tmp}/supabase/functions/deno.lock`,
      JSON.stringify({ version: '5' }),
    );
    const violations = await checkAllLockfiles(tmp);
    assertEquals(violations.length, 1);
    assertEquals(violations[0].kind, 'wrong-version');
    assertEquals(violations[0].path, 'supabase/functions/deno.lock');
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test('checkAllLockfiles — both missing → two missing-file violations', async () => {
  const tmp = await Deno.makeTempDir();
  try {
    const violations = await checkAllLockfiles(tmp);
    assertEquals(violations.length, 2);
    assertEquals(violations.every(v => v.kind === 'missing-file'), true);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test('REQUIRED_LOCKFILES — both Catalog #58 paths present', () => {
  assertEquals(REQUIRED_LOCKFILES.includes('deno.lock'), true);
  assertEquals(REQUIRED_LOCKFILES.includes('supabase/functions/deno.lock'), true);
  assertEquals(REQUIRED_LOCKFILES.length, 2);
});

Deno.test('EXPECTED_LOCKFILE_VERSION — pinned to "3" per CI Deno 1.46.3', () => {
  assertEquals(EXPECTED_LOCKFILE_VERSION, '3');
});

Deno.test('checkAllLockfiles — current repo is CLEAN (both locks at v3)', async () => {
  const violations = await checkAllLockfiles();
  if (violations.length > 0) {
    console.error('UNEXPECTED VIOLATIONS:', violations);
  }
  assertEquals(violations.length, 0, 'Both repo lockfiles must be at v3 per Catalog #58');
});