/**
 * Tests for zScoreNormalizeWithinSector — pure-math unit coverage.
 *
 * The data path through `universe_membership.gics_sector` is already
 * observationally proven by FP-009 Buckets 0 / 0.1 / 0.2; what these tests
 * cover is the z-score math, which deserves explicit synthetic inputs.
 */

import { assertEquals, assertAlmostEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  zScoreNormalizeWithinSector,
  type ZScoreInput,
  type ZScoreOutput,
} from './z-score-normalize.ts';

function byTicker(rows: ZScoreOutput[]): Map<string, ZScoreOutput> {
  return new Map(rows.map((r) => [r.ticker, r]));
}

Deno.test('two sectors, hand-computed z-scores within each sector', () => {
  // Tech: values [1,2,3] → mean=2, sample-std=1 → z=[-1,0,1]
  // Energy: values [10,20,30] → mean=20, sample-std=10 → z=[-1,0,1]
  const inputs: ZScoreInput[] = [
    { ticker: 'T1', value: 1, gics_sector: 'Tech' },
    { ticker: 'T2', value: 2, gics_sector: 'Tech' },
    { ticker: 'T3', value: 3, gics_sector: 'Tech' },
    { ticker: 'E1', value: 10, gics_sector: 'Energy' },
    { ticker: 'E2', value: 20, gics_sector: 'Energy' },
    { ticker: 'E3', value: 30, gics_sector: 'Energy' },
  ];
  const out = byTicker(zScoreNormalizeWithinSector(inputs));
  assertAlmostEquals(out.get('T1')!.value as number, -1, 1e-12);
  assertAlmostEquals(out.get('T2')!.value as number, 0, 1e-12);
  assertAlmostEquals(out.get('T3')!.value as number, 1, 1e-12);
  assertAlmostEquals(out.get('E1')!.value as number, -1, 1e-12);
  assertAlmostEquals(out.get('E2')!.value as number, 0, 1e-12);
  assertAlmostEquals(out.get('E3')!.value as number, 1, 1e-12);
});

Deno.test('zero-mean property: sum of z-scores within each sector ≈ 0', () => {
  const inputs: ZScoreInput[] = [
    { ticker: 'A', value: 5, gics_sector: 'S1' },
    { ticker: 'B', value: 7, gics_sector: 'S1' },
    { ticker: 'C', value: 11, gics_sector: 'S1' },
    { ticker: 'D', value: 13, gics_sector: 'S1' },
  ];
  const out = zScoreNormalizeWithinSector(inputs);
  const sum = out.reduce((a, r) => a + (r.value as number), 0);
  assertAlmostEquals(sum, 0, 1e-12);
});

Deno.test('clip lower bound at -3 for outliers below', () => {
  // 19 tickers at value=1, one at -1000 → raw z ≈ -4.25 → clipped to -3.
  const inputs: ZScoreInput[] = [];
  for (let i = 0; i < 19; i++) {
    inputs.push({ ticker: `N${i}`, value: 1, gics_sector: 'S' });
  }
  inputs.push({ ticker: 'OUT', value: -1000, gics_sector: 'S' });
  const out = byTicker(zScoreNormalizeWithinSector(inputs));
  assertEquals(out.get('OUT')!.value, -3);
});

Deno.test('clip upper bound at +3 for outliers above', () => {
  const inputs: ZScoreInput[] = [];
  for (let i = 0; i < 19; i++) {
    inputs.push({ ticker: `N${i}`, value: 1, gics_sector: 'S' });
  }
  inputs.push({ ticker: 'OUT', value: 1000, gics_sector: 'S' });
  const out = byTicker(zScoreNormalizeWithinSector(inputs));
  assertEquals(out.get('OUT')!.value, 3);
});

Deno.test('custom clipAt applies the supplied bounds', () => {
  const inputs: ZScoreInput[] = [];
  for (let i = 0; i < 19; i++) {
    inputs.push({ ticker: `N${i}`, value: 1, gics_sector: 'S' });
  }
  inputs.push({ ticker: 'HI', value: 1000, gics_sector: 'S' });
  inputs.push({ ticker: 'LO', value: -1000, gics_sector: 'S' });
  const out = byTicker(zScoreNormalizeWithinSector(inputs, { clipAt: 2 }));
  assertEquals(out.get('HI')!.value, 2);
  assertEquals(out.get('LO')!.value, -2);
});

Deno.test('singleton sector → value=null (z-score undefined)', () => {
  const inputs: ZScoreInput[] = [
    { ticker: 'SOLO', value: 42, gics_sector: 'Niche' },
    { ticker: 'A', value: 1, gics_sector: 'Big' },
    { ticker: 'B', value: 2, gics_sector: 'Big' },
  ];
  const out = byTicker(zScoreNormalizeWithinSector(inputs));
  assertEquals(out.get('SOLO')!.value, null);
  assertEquals(out.get('SOLO')!.gics_sector, 'Niche');
  // Big sector still produces valid z-scores
  assertAlmostEquals(out.get('A')!.value as number, -Math.SQRT1_2 * Math.SQRT2, 1e-12); // -1
  assertAlmostEquals(out.get('B')!.value as number, 1, 1e-12);
});

Deno.test('all-equal values within sector (std=0) → value=null for all members', () => {
  const inputs: ZScoreInput[] = [
    { ticker: 'X', value: 0.1, gics_sector: 'Flat' },
    { ticker: 'Y', value: 0.1, gics_sector: 'Flat' },
    { ticker: 'Z', value: 0.1, gics_sector: 'Flat' },
  ];
  const out = byTicker(zScoreNormalizeWithinSector(inputs));
  assertEquals(out.get('X')!.value, null);
  assertEquals(out.get('Y')!.value, null);
  assertEquals(out.get('Z')!.value, null);
});

Deno.test('null sector passthrough → value=null, gics_sector preserved as null', () => {
  const inputs: ZScoreInput[] = [
    { ticker: 'UNCAT', value: 99, gics_sector: null },
    { ticker: 'A', value: 1, gics_sector: 'S' },
    { ticker: 'B', value: 2, gics_sector: 'S' },
  ];
  const out = byTicker(zScoreNormalizeWithinSector(inputs));
  assertEquals(out.get('UNCAT')!.value, null);
  assertEquals(out.get('UNCAT')!.gics_sector, null);
});

Deno.test('null value passthrough (insufficient history upstream) → value=null', () => {
  const inputs: ZScoreInput[] = [
    { ticker: 'NEW', value: null, gics_sector: 'S' },
    { ticker: 'A', value: 1, gics_sector: 'S' },
    { ticker: 'B', value: 2, gics_sector: 'S' },
  ];
  const out = byTicker(zScoreNormalizeWithinSector(inputs));
  assertEquals(out.get('NEW')!.value, null);
  assertEquals(out.get('NEW')!.gics_sector, 'S');
  // The non-null members compute against themselves only (n=2)
  assertAlmostEquals(out.get('A')!.value as number, -Math.SQRT1_2 * Math.SQRT2, 1e-12);
  assertAlmostEquals(out.get('B')!.value as number, 1, 1e-12);
});

Deno.test('empty input → empty output', () => {
  assertEquals(zScoreNormalizeWithinSector([]), []);
});

Deno.test('mixed sector sizes: no cross-sector contamination', () => {
  // Sector A: 100 members with values 1..100; Sector B: 3 members with values 1000,2000,3000.
  const inputs: ZScoreInput[] = [];
  for (let i = 1; i <= 100; i++) {
    inputs.push({ ticker: `A${i}`, value: i, gics_sector: 'A' });
  }
  inputs.push({ ticker: 'B1', value: 1000, gics_sector: 'B' });
  inputs.push({ ticker: 'B2', value: 2000, gics_sector: 'B' });
  inputs.push({ ticker: 'B3', value: 3000, gics_sector: 'B' });
  const out = byTicker(zScoreNormalizeWithinSector(inputs));
  // Sector B z-scores match the canonical [1,2,3]-shape (mean=2000, std=1000).
  assertAlmostEquals(out.get('B1')!.value as number, -1, 1e-12);
  assertAlmostEquals(out.get('B2')!.value as number, 0, 1e-12);
  assertAlmostEquals(out.get('B3')!.value as number, 1, 1e-12);
  // Sector A: middle value (50.5) → z ≈ 0; bounds within ±3 (101-member uniform).
  const a50 = out.get('A50')!.value as number;
  const a51 = out.get('A51')!.value as number;
  // A50 and A51 are nearest the mean (50.5); both should be small in magnitude.
  if (Math.abs(a50) > 0.1 || Math.abs(a51) > 0.1) {
    throw new Error(`mid-bucket z-scores too large: a50=${a50} a51=${a51}`);
  }
  // All sector-A z-scores must be within ±3.
  for (let i = 1; i <= 100; i++) {
    const z = out.get(`A${i}`)!.value as number;
    if (z < -3 || z > 3) throw new Error(`A${i} z=${z} outside ±3`);
  }
});

Deno.test('determinism: same input twice → byte-identical output', () => {
  const inputs: ZScoreInput[] = [
    { ticker: 'A', value: 1, gics_sector: 'S1' },
    { ticker: 'B', value: 2, gics_sector: 'S1' },
    { ticker: 'C', value: 3, gics_sector: 'S1' },
    { ticker: 'D', value: null, gics_sector: 'S1' },
    { ticker: 'E', value: 7, gics_sector: null },
    { ticker: 'F', value: 99, gics_sector: 'Solo' },
  ];
  const a = zScoreNormalizeWithinSector(inputs);
  const b = zScoreNormalizeWithinSector(inputs);
  assertEquals(JSON.stringify(a), JSON.stringify(b));
});