import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { findViolationInLine, scanRepository } from './check-unguarded-parsefloat.ts';

Deno.test('findViolationInLine — bare parseFloat flagged', () => {
  const v = findViolationInLine('  qty: parseFloat(resp.qty),', 'src/features/longshort/services/foo.ts', 1);
  assertEquals(v !== null, true);
});

Deno.test('findViolationInLine — parseFloat with Number.isFinite guard OK', () => {
  const v = findViolationInLine('  const n = parseFloat(x); if (!Number.isFinite(n)) throw new Error("bad");', 'src/features/longshort/services/foo.ts', 1);
  assertEquals(v, null);
});

Deno.test('findViolationInLine — parseFloat with Number.isNaN guard OK', () => {
  const v = findViolationInLine('  const n = parseFloat(x); if (Number.isNaN(n)) throw new Error("bad");', 'src/features/longshort/services/foo.ts', 1);
  assertEquals(v, null);
});

Deno.test('findViolationInLine — DW-058-B1 override annotation respected', () => {
  const v = findViolationInLine('  qty: parseFloat(resp.qty), // allow-bare-parsefloat: DW-058-B1', 'src/features/longshort/services/broker/alpaca/alpaca-position-fetcher.ts', 30);
  assertEquals(v, null);
});

Deno.test('findViolationInLine — ADR override annotation respected', () => {
  const v = findViolationInLine('  const n = parseFloat(x); // allow-bare-parsefloat: ADR-008', 'src/features/longshort/services/foo.ts', 1);
  assertEquals(v, null);
});

Deno.test('scanRepository — clean on current repo (DW-058-B1 annotations cover known sites)', async () => {
  const violations = await scanRepository();
  if (violations.length > 0) {
    console.error('UNEXPECTED VIOLATIONS:', violations);
  }
  assertEquals(violations.length, 0, 'Repository should be clean of unguarded parseFloat after DW-058-B1 annotations applied');
});