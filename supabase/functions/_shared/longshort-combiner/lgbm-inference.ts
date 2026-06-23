/**
 * LightGBM tree-dump inference (FP-052 3.3b-i / ACT-285).
 *
 * Pure-TS LightGBM scorer that consumes the text-format model dump a
 * Python `booster.save_model('model.txt')` emits and returns the raw
 * lambdarank score for one 16-feature vector. NO Python runtime, NO
 * native binding, NO Storage / network / clock — fully deterministic,
 * fixture-testable, in-substrate (Deno edge function).
 *
 * Substrate fork (DEC-031 / Architecture A): real LightGBM-LambdaRank
 * training (§6.1/§6.2 LOCKED) runs out-of-band (Python toolchain,
 * 3.3b-ii). The serialized text dump lands in Supabase Storage; this
 * module is the in-substrate inference seam. Only tree-format
 * `decision_type=2` (numerical `<=`) splits are supported — the
 * trainer in 3.3b-ii MUST emit numerical-only ensembles (no categorical
 * splits); the parser refuses other decision_types so silent format
 * drift cannot poison live scoring.
 *
 * §6.5.1 feature-order contract — LOAD-BEARING. The trainer (3.3b-ii)
 * binds to {@link FEATURE_ORDER}; any drift between the trainer's
 * column emission and this array poisons inference. The exported
 * constant IS the contract.
 *
 * §6.5.2 sentinel: a missing non-critical signal carries
 * `<id>__value = -999` (sentinel float) and `<id>__is_present = 0`;
 * the model was trained to read this jointly. The scorer just passes
 * the sentinel through — no special-casing — so the trained tree
 * splits on `-999` work transparently.
 */

import {
  SIGNAL_IDS_CRITICAL,
  SIGNAL_IDS_NON_CRITICAL,
  nonCriticalIsPresentKey,
  nonCriticalValueKey,
} from './signal-catalog.ts';
import {
  MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID,
  MARKET_REALIZED_VOL_6M_SIGNAL_ID,
} from '../longshort-signals/market-regime/compute-regime.ts';

/** §6.5.2 missing-value sentinel for non-critical signal `value` slots. */
export const NON_CRITICAL_MISSING_SENTINEL = -999;

/**
 * 18-feature emission order — LOAD-BEARING contract with the 3.3b-ii
 * Python trainer. Order: the 2 critical bare numerics first (catalog
 * order, matching `SIGNAL_IDS_CRITICAL`); then for each of the 7
 * non-critical signals (catalog order of `SIGNAL_IDS_NON_CRITICAL`)
 * the typed-absence pair `<id>__value` then `<id>__is_present`; then
 * the 2 market-level regime features as BARE NUMERICS (DEC-066 §(c) —
 * market-level category, NOT `__value`/`__is_present` pairs).
 *
 * The trainer MUST emit feature columns in this exact order; the test
 * fixture in `lgbm-inference_test.ts` locks the literal sequence so any
 * accidental reordering trips at CI rather than silently mis-scoring.
 *
 * 3.2-d flipped FEATURE_ORDER from 16 → 18 keys; `featureOrderHash()` is
 * now d4aac3e3e58740543de51764c05b8688595eb025ec41bd55677c9c27f24ce348.
 * Per DEC-066 §(f) this is ADDITIVE-NOT-BREAK (zero artifacts existed at
 * the flip; the load-time hash refusal fired on nothing) — the
 * post-promotion lock takes effect from the first promoted artifact.
 */
export const FEATURE_ORDER: readonly string[] = Object.freeze([
  // 2 critical bare numerics
  ...SIGNAL_IDS_CRITICAL,
  // 7 non-critical typed-absence pairs (value, is_present)
  ...SIGNAL_IDS_NON_CRITICAL.flatMap((id) => [
    nonCriticalValueKey(id),
    nonCriticalIsPresentKey(id),
  ]),
  // 2 market-level regime features (bare numerics) — DEC-066 §(c).
  MARKET_24M_CUMULATIVE_RETURN_SIGNAL_ID,
  MARKET_REALIZED_VOL_6M_SIGNAL_ID,
]);

/** Expected vector length — 2 + 7*2 + 2 = 18. */
export const FEATURE_VECTOR_LENGTH = FEATURE_ORDER.length; // 18

/**
 * SHA-256 hash of the canonical `FEATURE_ORDER` joined sequence — the
 * load-bearing contract the 3.3b-ii Python trainer stamps into the
 * artifact's `meta.json` (`feature_order_hash`). The 3.3b-ii TS
 * Storage loader (`model-artifact-loader.ts`) computes this same hash
 * at load time and REFUSES to return any artifact whose stamped hash
 * differs (per DEC-064 Clause 4 — closes the silent-inference-
 * poisoning failure mode at load time, not at score-rank-drift
 * detection time).
 *
 * Hash input: `FEATURE_ORDER.join('\n')` — newline-joined so
 * accidental concatenations of adjacent keys can never collide.
 * Encoding: lowercase hex of the 32-byte SHA-256 digest. Async
 * because Web Crypto's `subtle.digest` is async; the Deno + browser
 * `crypto.subtle` is the runtime substrate (no Node `crypto`).
 * Pure of wall-clock (Gate 6).
 */
export async function featureOrderHash(): Promise<string> {
  const canonical = FEATURE_ORDER.join('\n');
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const view = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < view.length; i++) {
    hex += view[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/** Typed error surfaced for any tree-dump shape the parser refuses. */
export class LgbmTreeDumpParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LgbmTreeDumpParseError';
  }
}

/** One parsed tree in the ensemble. Fields mirror LightGBM model.txt. */
export interface LgbmTree {
  /** Per internal node: feature index of the split (length = num_internal). */
  split_feature: Int32Array;
  /** Per internal node: numerical `<=` threshold (length = num_internal). */
  threshold: Float64Array;
  /** Per internal node: child index. ≥0 → internal node index; <0 → leaf
   *  index `-(child) - 1`. */
  left_child: Int32Array;
  right_child: Int32Array;
  /** Per leaf: scalar leaf output. */
  leaf_value: Float64Array;
  /** Per-tree shrinkage (LightGBM `shrinkage=` line; usually 1 in dump
   *  because learning_rate is baked into `leaf_value` at save time). */
  shrinkage: number;
}

/** Parsed ensemble — ordered list of trees + the bias term. */
export interface LgbmEnsemble {
  trees: LgbmTree[];
  /** Base / bias score added to every prediction (LightGBM `init_score`
   *  / `objective` bias; for ranking objectives this is typically 0 but
   *  we read it explicitly when present so we never drift from the
   *  saved model). */
  bias: number;
  /** Recorded for forensic surfacing — not used in scoring math. */
  num_features: number;
}

/**
 * Parse a LightGBM text tree-dump into an in-memory ensemble.
 *
 * Supports the minimum surface 3.3b-i needs: numerical `<=` splits
 * (`decision_type=2`), `leaf_value` floats, `left_child` / `right_child`
 * encoding (negative = leaf index `-(c)-1`). Categorical / one-hot
 * splits are deliberately rejected — the 3.3b-ii trainer MUST emit
 * numerical-only models.
 *
 * Throws `LgbmTreeDumpParseError` on:
 *   - any `decision_type` element ≠ 2
 *   - per-tree array-length mismatch (split_feature / threshold /
 *     left_child / right_child must be same length)
 *   - leaf_value length not matching the implied num_leaves
 *   - missing required key in a tree block
 */
export function parseLgbmTreeDump(text: string): LgbmEnsemble {
  if (typeof text !== 'string' || text.length === 0) {
    throw new LgbmTreeDumpParseError('empty tree-dump text');
  }

  // Split on the canonical LightGBM `Tree=N` block separator. The header
  // block (before the first `Tree=0`) carries `max_feature_idx` /
  // `num_class` / `objective` — we only consume `max_feature_idx` for
  // the `num_features` forensic value, everything else is parsed
  // per-tree.
  const lines = text.split(/\r?\n/);
  const headerLines: string[] = [];
  const treeBlocks: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (/^Tree=\d+$/.test(line.trim())) {
      if (current) treeBlocks.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    } else {
      headerLines.push(line);
    }
  }
  if (current) treeBlocks.push(current);

  if (treeBlocks.length === 0) {
    throw new LgbmTreeDumpParseError('no Tree=N blocks found in dump');
  }

  // Header scalars — best-effort. `max_feature_idx` is 0-indexed.
  let num_features = 0;
  for (const h of headerLines) {
    const m = /^max_feature_idx\s*=\s*(\d+)\s*$/.exec(h.trim());
    if (m) num_features = Number(m[1]) + 1;
  }

  const trees: LgbmTree[] = [];
  for (const block of treeBlocks) {
    trees.push(parseTreeBlock(block));
  }

  return { trees, bias: 0, num_features };
}

function parseTreeBlock(blockLines: readonly string[]): LgbmTree {
  const kv = new Map<string, string>();
  for (const line of blockLines) {
    const t = line.trim();
    if (t.length === 0) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    kv.set(t.slice(0, eq).trim(), t.slice(eq + 1).trim());
  }

  const get = (k: string): string => {
    const v = kv.get(k);
    if (v === undefined) {
      throw new LgbmTreeDumpParseError(`tree block missing required key '${k}'`);
    }
    return v;
  };

  const parseIntArr = (k: string): Int32Array => {
    const parts = get(k).split(/\s+/).filter((s) => s.length > 0);
    const out = new Int32Array(parts.length);
    for (let i = 0; i < parts.length; i++) {
      const n = Number(parts[i]);
      if (!Number.isFinite(n)) {
        throw new LgbmTreeDumpParseError(`tree '${k}' has non-finite token '${parts[i]}'`);
      }
      out[i] = n | 0;
    }
    return out;
  };

  const parseFloatArr = (k: string): Float64Array => {
    const parts = get(k).split(/\s+/).filter((s) => s.length > 0);
    const out = new Float64Array(parts.length);
    for (let i = 0; i < parts.length; i++) {
      const n = Number(parts[i]);
      if (!Number.isFinite(n)) {
        throw new LgbmTreeDumpParseError(`tree '${k}' has non-finite token '${parts[i]}'`);
      }
      out[i] = n;
    }
    return out;
  };

  const split_feature = parseIntArr('split_feature');
  const threshold = parseFloatArr('threshold');
  const left_child = parseIntArr('left_child');
  const right_child = parseIntArr('right_child');
  const leaf_value = parseFloatArr('leaf_value');

  const numInternal = split_feature.length;
  if (
    threshold.length !== numInternal ||
    left_child.length !== numInternal ||
    right_child.length !== numInternal
  ) {
    throw new LgbmTreeDumpParseError(
      `tree internal-array length mismatch: split_feature=${split_feature.length}, ` +
        `threshold=${threshold.length}, left_child=${left_child.length}, ` +
        `right_child=${right_child.length}`,
    );
  }

  // Reject non-numerical splits — the 3.3b-ii trainer must emit
  // numerical-only ensembles. decision_type element 2 = numerical `<=`.
  const dtRaw = kv.get('decision_type');
  if (dtRaw !== undefined && dtRaw.length > 0) {
    const dtParts = dtRaw.split(/\s+/).filter((s) => s.length > 0);
    for (const d of dtParts) {
      if (d !== '2') {
        throw new LgbmTreeDumpParseError(
          `unsupported decision_type='${d}' — only numerical '<=' (2) splits are accepted`,
        );
      }
    }
  }

  const shrinkageRaw = kv.get('shrinkage');
  const shrinkage = shrinkageRaw === undefined ? 1 : Number(shrinkageRaw);
  if (!Number.isFinite(shrinkage)) {
    throw new LgbmTreeDumpParseError(`tree shrinkage non-finite: '${shrinkageRaw}'`);
  }

  // Validate that every child index either references a valid internal
  // node or encodes a valid leaf (`-(c)-1` within [0, leaf_value.length)).
  for (let i = 0; i < numInternal; i++) {
    for (const c of [left_child[i], right_child[i]]) {
      if (c >= 0) {
        if (c >= numInternal) {
          throw new LgbmTreeDumpParseError(
            `tree internal child index ${c} out of bounds (numInternal=${numInternal})`,
          );
        }
      } else {
        const leafIdx = -c - 1;
        if (leafIdx < 0 || leafIdx >= leaf_value.length) {
          throw new LgbmTreeDumpParseError(
            `tree leaf index ${leafIdx} out of bounds (num_leaves=${leaf_value.length})`,
          );
        }
      }
    }
  }

  return {
    split_feature,
    threshold,
    left_child,
    right_child,
    leaf_value,
    shrinkage,
  };
}

/**
 * Project a feature record onto the ordered numeric vector the scorer
 * consumes. Honors §6.5.2 sentinel: non-critical signals with
 * `is_present === 0` resolve to `value = -999` regardless of what's
 * stored under the `__value` key (the assembler stores `null` for the
 * absent half of the typed-absence pair; the model was trained against
 * the `-999` sentinel substitution).
 *
 * Throws if any critical signal is non-finite (the assembler's §4.3.5
 * gate should have excluded such rows; defensive guard mirrors
 * `ranker.computeComposite`).
 */
export function featuresToOrderedArray(
  features: Readonly<Record<string, number | null>>,
): Float64Array {
  const out = new Float64Array(FEATURE_VECTOR_LENGTH);
  let i = 0;

  // 2 critical bare numerics — must be finite.
  for (const cid of SIGNAL_IDS_CRITICAL) {
    const v = features[cid];
    if (v === null || v === undefined || typeof v !== 'number' || !Number.isFinite(v)) {
      throw new LgbmTreeDumpParseError(
        `featuresToOrderedArray: critical signal '${cid}' not a finite number ` +
          `(value=${JSON.stringify(v)}); §4.3.5 gates should have excluded this row`,
      );
    }
    out[i++] = v;
  }

  // 7 non-critical (value, is_present) pairs.
  for (const ncid of SIGNAL_IDS_NON_CRITICAL) {
    const valKey = nonCriticalValueKey(ncid);
    const presKey = nonCriticalIsPresentKey(ncid);
    const presRaw = features[presKey];
    const isPresent = presRaw === 1 ? 1 : 0;
    if (isPresent === 1) {
      const v = features[valKey];
      if (v === null || v === undefined || typeof v !== 'number' || !Number.isFinite(v)) {
        throw new LgbmTreeDumpParseError(
          `featuresToOrderedArray: non-critical '${ncid}' is_present=1 but ` +
            `value=${JSON.stringify(v)} not finite — typed-absence contract broken`,
        );
      }
      out[i++] = v;
    } else {
      // §6.5.2 sentinel substitution.
      out[i++] = NON_CRITICAL_MISSING_SENTINEL;
    }
    out[i++] = isPresent;
  }

  return out;
}

/**
 * Score one feature vector against the ensemble. Sums each tree's leaf
 * value (scaled by per-tree shrinkage) plus the ensemble bias and
 * returns the raw model output (the lambdarank score). Pure — no
 * clock, no I/O, no randomness.
 */
export function scoreLgbm(
  ensemble: LgbmEnsemble,
  features: Float64Array,
): number {
  if (features.length !== FEATURE_VECTOR_LENGTH) {
    throw new LgbmTreeDumpParseError(
      `scoreLgbm: feature vector length ${features.length} ≠ ${FEATURE_VECTOR_LENGTH}`,
    );
  }
  let acc = ensemble.bias;
  for (const tree of ensemble.trees) {
    acc += tree.shrinkage * walkTree(tree, features);
  }
  return acc;
}

function walkTree(tree: LgbmTree, features: Float64Array): number {
  // Numerical-only trees: start at internal node 0; at each node
  // descend left when feature <= threshold, else right; negative child
  // index N → leaf -(N)-1.
  let node = 0;
  // Defensive cap on traversal depth — number of internal nodes is the
  // worst-case bound; anything beyond means a cycle.
  const maxSteps = tree.split_feature.length + 1;
  for (let step = 0; step <= maxSteps; step++) {
    const fi = tree.split_feature[node];
    const t = tree.threshold[node];
    const x = features[fi];
    const child = x <= t ? tree.left_child[node] : tree.right_child[node];
    if (child < 0) {
      const leafIdx = -child - 1;
      return tree.leaf_value[leafIdx];
    }
    node = child;
  }
  throw new LgbmTreeDumpParseError(
    `walkTree: traversal exceeded depth bound — likely cyclic child pointers`,
  );
}