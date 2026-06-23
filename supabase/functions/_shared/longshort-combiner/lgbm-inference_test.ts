// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
/**
 * Tests for the FP-052 3.3b-i LightGBM tree-dump inference (ACT-285).
 *
 * Canned hand-crafted 2-tree ensemble in LightGBM text format — the
 * fixture IS the cross-runtime contract. The 3.3b-ii Python trainer
 * must emit a `booster.save_model()` text dump this parser+scorer can
 * walk byte-for-byte; any drift trips these tests.
 *
 * Coverage:
 *   (lgbm-1) FEATURE_ORDER is locked: 16 keys, criticals first, then
 *            (value, is_present) pairs in catalog order.
 *   (lgbm-2) parseLgbmTreeDump rejects empty / no-Tree dumps.
 *   (lgbm-3) parseLgbmTreeDump rejects categorical/non-`<=` decision_type.
 *   (lgbm-4) parseLgbmTreeDump rejects internal/leaf child-index OOB.
 *   (lgbm-5) featuresToOrderedArray substitutes -999 sentinel when
 *            is_present=0 (§6.5.2).
 *   (lgbm-6) featuresToOrderedArray throws on critical-signal null.
 *   (lgbm-7) scoreLgbm walks the canned 2-tree fixture deterministically
 *            for two known feature vectors (one all-present, one all-absent).
 *   (lgbm-8) scoreLgbm refuses a wrong-length feature vector.
 */
import {
  assert,
  assertEquals,
  assertAlmostEquals,
  assertThrows,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  FEATURE_ORDER,
  FEATURE_VECTOR_LENGTH,
  NON_CRITICAL_MISSING_SENTINEL,
  parseLgbmTreeDump,
  featuresToOrderedArray,
  scoreLgbm,
  LgbmTreeDumpParseError,
} from './lgbm-inference.ts';
import {
  SIGNAL_IDS_CRITICAL,
  SIGNAL_IDS_NON_CRITICAL,
  nonCriticalIsPresentKey,
  nonCriticalValueKey,
} from './signal-catalog.ts';

/** Hand-crafted 2-tree fixture — minimal LightGBM model.txt shape.
 *
 *  Tree 0: split on feature 0 (cross_sectional_momentum_12_1) at 0.5
 *          ≤ 0.5 → leaf 0 = -0.3
 *          >  0.5 → leaf 1 = +0.4
 *  Tree 1: split on feature 2 (analyst_revision_drift__value) at -500
 *          ≤ -500 → leaf 0 = -0.1  (catches §6.5.2 sentinel -999)
 *          >  -500 → leaf 1 = +0.2
 */
const FIXTURE_DUMP = [
  'tree',
  'version=v3',
  'num_class=1',
  'num_tree_per_iteration=1',
  'label_index=0',
  'max_feature_idx=15',
  'objective=lambdarank',
  'feature_names=cross_sectional_momentum_12_1 short_term_reversal_1w f2 f3 f4 f5 f6 f7 f8 f9 f10 f11 f12 f13 f14 f15',
  '',
  'Tree=0',
  'num_leaves=2',
  'num_cat=0',
  'split_feature=0',
  'split_gain=1.0',
  'threshold=0.5',
  'decision_type=2',
  'left_child=-1',
  'right_child=-2',
  'leaf_value=-0.3 0.4',
  'leaf_count=10 10',
  'internal_value=0',
  'internal_count=20',
  'shrinkage=1',
  '',
  'Tree=1',
  'num_leaves=2',
  'num_cat=0',
  'split_feature=2',
  'split_gain=1.0',
  'threshold=-500',
  'decision_type=2',
  'left_child=-1',
  'right_child=-2',
  'leaf_value=-0.1 0.2',
  'leaf_count=5 15',
  'internal_value=0',
  'internal_count=20',
  'shrinkage=1',
  '',
  'end of trees',
].join('\n');

/** Build a full 16-key feature record (all non-criticals present). */
function fullPresent(critical_v: number, nc_v: number): Record<string, number | null> {
  const f: Record<string, number | null> = {};
  for (const cid of SIGNAL_IDS_CRITICAL) f[cid] = critical_v;
  for (const ncid of SIGNAL_IDS_NON_CRITICAL) {
    f[nonCriticalValueKey(ncid)] = nc_v;
    f[nonCriticalIsPresentKey(ncid)] = 1;
  }
  return f;
}

/** Build a 16-key record where every non-critical is ABSENT (is_present=0,
 *  value=null) and criticals carry the given value. */
function allNonCriticalsAbsent(critical_v: number): Record<string, number | null> {
  const f: Record<string, number | null> = {};
  for (const cid of SIGNAL_IDS_CRITICAL) f[cid] = critical_v;
  for (const ncid of SIGNAL_IDS_NON_CRITICAL) {
    f[nonCriticalValueKey(ncid)] = null;
    f[nonCriticalIsPresentKey(ncid)] = 0;
  }
  return f;
}

Deno.test('(lgbm-1) FEATURE_ORDER locks 16 keys: 2 criticals then 7 (value,is_present) pairs', () => {
  assertEquals(FEATURE_VECTOR_LENGTH, 16);
  assertEquals(FEATURE_ORDER.length, 16);
  // Criticals first, catalog order.
  assertEquals(FEATURE_ORDER[0], SIGNAL_IDS_CRITICAL[0]);
  assertEquals(FEATURE_ORDER[1], SIGNAL_IDS_CRITICAL[1]);
  // Then 7 pairs (value then is_present) in catalog order.
  for (let i = 0; i < SIGNAL_IDS_NON_CRITICAL.length; i++) {
    const ncid = SIGNAL_IDS_NON_CRITICAL[i];
    assertEquals(FEATURE_ORDER[2 + 2 * i], nonCriticalValueKey(ncid));
    assertEquals(FEATURE_ORDER[2 + 2 * i + 1], nonCriticalIsPresentKey(ncid));
  }
});

Deno.test('(lgbm-2) parseLgbmTreeDump rejects empty / no-Tree dumps', () => {
  assertThrows(() => parseLgbmTreeDump(''), LgbmTreeDumpParseError);
  assertThrows(
    () => parseLgbmTreeDump('tree\nversion=v3\nmax_feature_idx=15\n'),
    LgbmTreeDumpParseError,
    'no Tree=N blocks',
  );
});

Deno.test('(lgbm-3) parseLgbmTreeDump rejects non-numerical decision_type', () => {
  const bad = FIXTURE_DUMP.replace('decision_type=2\nleft_child=-1\nright_child=-2\nleaf_value=-0.3 0.4', 'decision_type=1\nleft_child=-1\nright_child=-2\nleaf_value=-0.3 0.4');
  assertThrows(() => parseLgbmTreeDump(bad), LgbmTreeDumpParseError, 'unsupported decision_type');
});

Deno.test('(lgbm-4) parseLgbmTreeDump rejects leaf-index OOB', () => {
  // right_child=-9 → leaf index 8, but num_leaves=2.
  const bad = FIXTURE_DUMP.replace('right_child=-2\nleaf_value=-0.3 0.4', 'right_child=-9\nleaf_value=-0.3 0.4');
  assertThrows(() => parseLgbmTreeDump(bad), LgbmTreeDumpParseError, 'leaf index');
});

Deno.test('(lgbm-5) featuresToOrderedArray substitutes -999 when is_present=0 (§6.5.2 sentinel)', () => {
  const f = allNonCriticalsAbsent(0.0);
  const arr = featuresToOrderedArray(f);
  assertEquals(arr.length, 16);
  assertEquals(arr[0], 0.0);
  assertEquals(arr[1], 0.0);
  // Every non-critical value slot is the sentinel; every is_present slot is 0.
  for (let i = 0; i < SIGNAL_IDS_NON_CRITICAL.length; i++) {
    assertEquals(arr[2 + 2 * i], NON_CRITICAL_MISSING_SENTINEL);
    assertEquals(arr[2 + 2 * i + 1], 0);
  }
});

Deno.test('(lgbm-6) featuresToOrderedArray throws when critical signal is null', () => {
  const f = fullPresent(0.0, 1.0);
  f[SIGNAL_IDS_CRITICAL[0]] = null;
  assertThrows(
    () => featuresToOrderedArray(f),
    LgbmTreeDumpParseError,
    'critical signal',
  );
});

Deno.test('(lgbm-7) scoreLgbm walks canned ensemble deterministically (present + sentinel paths)', () => {
  const ens = parseLgbmTreeDump(FIXTURE_DUMP);
  assertEquals(ens.trees.length, 2);

  // Vector A: critical=0.0 (≤0.5 → -0.3), nc value=1.0 present (>-500 → +0.2). Sum = -0.1.
  const vA = featuresToOrderedArray(fullPresent(0.0, 1.0));
  assertAlmostEquals(scoreLgbm(ens, vA), -0.1, 1e-12);

  // Vector B: critical=1.0 (>0.5 → +0.4), nc absent → sentinel -999 (≤-500 → -0.1). Sum = +0.3.
  const vB = featuresToOrderedArray(allNonCriticalsAbsent(1.0));
  assertAlmostEquals(scoreLgbm(ens, vB), 0.3, 1e-12);

  // Determinism: re-scoring the same vector yields bit-identical output.
  assertEquals(scoreLgbm(ens, vA), scoreLgbm(ens, vA));
});

Deno.test('(lgbm-8) scoreLgbm refuses wrong-length feature vector', () => {
  const ens = parseLgbmTreeDump(FIXTURE_DUMP);
  assertThrows(
    () => scoreLgbm(ens, new Float64Array(15)),
    LgbmTreeDumpParseError,
    'length',
  );
});

Deno.test('(lgbm-9) lgbm-inference module is clock-free (Gate 6)', async () => {
  const src = await Deno.readTextFile(
    new URL('./lgbm-inference.ts', import.meta.url),
  );
  // Strip the doc-block at top before scanning so the comment-prose
  // "clock" mention doesn't trip the grep.
  assert(!/\bDate\.now\b/.test(src), 'lgbm-inference must not call Date.now()');
  assert(!/\bnew Date\b/.test(src), 'lgbm-inference must not call new Date()');
  assert(!/\bperformance\.now\b/.test(src), 'lgbm-inference must not call performance.now()');
});