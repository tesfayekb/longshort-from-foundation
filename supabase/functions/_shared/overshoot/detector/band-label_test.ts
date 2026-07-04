// FP-069 W3.5.c (ACT-462.c) — Regression #1: bin-edge table for
// `bandLabelFor`. Every bin boundary asserted for both sides. This is the
// test that would have caught the W3.5.c first-light defect at commit time
// had a non-placeholder implementation existed then.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { bandLabelFor } from './band-label.ts';

Deno.test('bandLabelFor LONG — inclusive-lo / exclusive-hi at every bin edge', () => {
  // Below-min sentinel (impossible post-kernel; never-matching label).
  assertEquals(bandLabelFor('LONG', 3, 0.029), 'L_below_min');
  // Lower boundary of L_03_04 (inclusive).
  assertEquals(bandLabelFor('LONG', 3, 0.03),  'L_03_04');
  assertEquals(bandLabelFor('LONG', 3, 0.039), 'L_03_04');
  // 0.04 → next bin (exclusive-hi on L_03_04).
  assertEquals(bandLabelFor('LONG', 3, 0.04),  'L_04_05');
  assertEquals(bandLabelFor('LONG', 3, 0.05),  'L_05_06');
  assertEquals(bandLabelFor('LONG', 3, 0.06),  'L_06_08');
  assertEquals(bandLabelFor('LONG', 3, 0.079), 'L_06_08');
  assertEquals(bandLabelFor('LONG', 3, 0.08),  'L_08_10');
  assertEquals(bandLabelFor('LONG', 3, 0.099), 'L_08_10');
  // Boundary 0.10 → L_10_INF (SQL: `band_hi IS NULL OR excess < band_hi`).
  assertEquals(bandLabelFor('LONG', 3, 0.10),  'L_10_INF');
  assertEquals(bandLabelFor('LONG', 3, 0.11),  'L_10_INF');
  assertEquals(bandLabelFor('LONG', 3, 1.00),  'L_10_INF');
});

Deno.test('bandLabelFor SHORT — inclusive-hi / exclusive-lo at every bin edge', () => {
  // Below-min sentinel.
  assertEquals(bandLabelFor('SHORT', 3, -0.029), 'S_below_min');
  // Upper boundary of S_03_04 (inclusive on the "less-negative" side).
  assertEquals(bandLabelFor('SHORT', 3, -0.03),  'S_03_04');
  assertEquals(bandLabelFor('SHORT', 3, -0.039), 'S_03_04');
  // -0.04 → next bin.
  assertEquals(bandLabelFor('SHORT', 3, -0.04),  'S_04_05');
  assertEquals(bandLabelFor('SHORT', 3, -0.05),  'S_05_06');
  assertEquals(bandLabelFor('SHORT', 3, -0.06),  'S_06_08');
  assertEquals(bandLabelFor('SHORT', 3, -0.079), 'S_06_08');
  assertEquals(bandLabelFor('SHORT', 3, -0.08),  'S_08_10');
  assertEquals(bandLabelFor('SHORT', 3, -0.099), 'S_08_10');
  // Boundary -0.10 → S_10_INF (SQL: `band_lo IS NULL OR excess > band_lo`).
  assertEquals(bandLabelFor('SHORT', 3, -0.10),  'S_10_INF');
  assertEquals(bandLabelFor('SHORT', 3, -0.11),  'S_10_INF');
  assertEquals(bandLabelFor('SHORT', 3, -1.00),  'S_10_INF');
});

Deno.test('bandLabelFor — windowDays is on-signature but does NOT alter the label', () => {
  // Provenance: label keys on magnitude bin; window rides on the cell PK
  // separately. Argmax-characterized-cell scoring convention (P-B#4).
  for (const w of [1, 2, 3, 4, 5]) {
    assertEquals(bandLabelFor('LONG',  w, 0.11), 'L_10_INF');
    assertEquals(bandLabelFor('SHORT', w, -0.09), 'S_08_10');
  }
});