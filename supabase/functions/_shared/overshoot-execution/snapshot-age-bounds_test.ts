// ACT-486 (INC-91) — source-sentinel tests for the single-home
// snapshot-age bounds. Enforces that (a) the ratified values are
// present and unchanged, and (b) no sibling module in
// _shared/overshoot-execution/ ships a numeric-literal age comparison
// that would silently drift away from the shared home.
//
// This is the INC-90 CI-grep pattern applied to the snapshot-age
// bound class. If a new snapshot-age comparison site is added, it
// MUST import OVERSHOOT_SNAPSHOT_MIN_AGE_MS / MAX_AGE_MS from
// ./snapshot-age-bounds.ts.

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  OVERSHOOT_SNAPSHOT_MIN_AGE_MS,
  OVERSHOOT_SNAPSHOT_MAX_AGE_MS,
} from './snapshot-age-bounds.ts';

Deno.test('ratified pair: MIN=-1000ms, MAX=15000ms', () => {
  assertEquals(OVERSHOOT_SNAPSHOT_MIN_AGE_MS, -1_000);
  assertEquals(OVERSHOOT_SNAPSHOT_MAX_AGE_MS, 15_000);
});

// Files in _shared/overshoot-execution/ that MUST route their
// snapshot-age comparisons through the single-home constants.
const AGE_SITES = [
  './i5-recheck.ts',
  './entry-price-construction.ts',
  './exit-price-construction.ts',
];

Deno.test('source-sentinel: no numeric-literal age bound at any sibling site', async () => {
  // Any line containing `snapshotAgeMs` compared to a numeric literal
  // (positive OR negative, with or without underscore separators) is a
  // drift risk. Forbid it outside the shared home.
  const DRIFT = /snapshotAgeMs\s*[<>]=?\s*-?\d[\d_]*/;
  for (const rel of AGE_SITES) {
    const src = await Deno.readTextFile(new URL(rel, import.meta.url));
    for (const line of src.split('\n')) {
      assert(
        !DRIFT.test(line),
        `INC-91 drift risk in ${rel}: numeric-literal snapshot-age bound found → "${line.trim()}". Import OVERSHOOT_SNAPSHOT_{MIN,MAX}_AGE_MS from ./snapshot-age-bounds.ts instead.`,
      );
    }
  }
});

Deno.test('source-sentinel: every sibling site imports the shared bounds', async () => {
  const NEEDLE_MIN = 'OVERSHOOT_SNAPSHOT_MIN_AGE_MS';
  const NEEDLE_MAX = 'OVERSHOOT_SNAPSHOT_MAX_AGE_MS';
  const NEEDLE_HOME = './snapshot-age-bounds.ts';
  for (const rel of AGE_SITES) {
    const src = await Deno.readTextFile(new URL(rel, import.meta.url));
    assert(src.includes(NEEDLE_HOME), `${rel} MUST import from ${NEEDLE_HOME}`);
    assert(src.includes(NEEDLE_MIN),  `${rel} MUST reference ${NEEDLE_MIN}`);
    assert(src.includes(NEEDLE_MAX),  `${rel} MUST reference ${NEEDLE_MAX}`);
  }
});