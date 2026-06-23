/**
 * Combiner model-artifact loader — FP-052 3.3b-ii-A (ACT-287).
 *
 * Real `LoadModelArtifact` implementation: fetches the
 * `storage://combiner-models/{model_id}/model.txt` LightGBM text
 * tree-dump + the sibling `meta.json` (per DEC-065 Clause 2) from the
 * Supabase Storage `combiner-models/` bucket and returns the pair as
 * `{modelText, meta}` for the ranker-orchestrator to parse via
 * `parseLgbmTreeDump` + score via `scoreLgbm` (per 3.3b-i / ACT-285).
 *
 * DEC-064 Clause 4 — LOAD-BEARING refusal: every load computes
 * `featureOrderHash()` over the LIVE `FEATURE_ORDER` and compares it
 * to `meta.json.feature_order_hash`. ANY mismatch throws
 * `FeatureOrderHashMismatchError` — the model was trained against a
 * different feature contract; silently scoring against it would
 * produce a silently-poisoned ranking (model splits on feature index
 * `k` would resolve against the wrong feature column, with no runtime
 * error, only a silent score-rank drift). Refuse at load time.
 *
 * NO wall-clock (Gate 6). The only I/O is the Storage `download()`
 * calls. The bucket itself is operator-provisioned (Dashboard /
 * Storage CLI, per DEC-065 Clause 4 — out-of-scope for this code);
 * this loader only consumes it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { FEATURE_ORDER, featureOrderHash } from './lgbm-inference.ts';

/** Bucket name per DEC-065 Clause 1. Operator-provisioned. */
export const COMBINER_MODELS_BUCKET = 'combiner-models';

/** Object suffix for the LightGBM text tree-dump (per DEC-065 Clause 2). */
export const ARTIFACT_MODEL_FILE = 'model.txt';

/** Object suffix for the training-metadata sidecar (per DEC-065 Clause 2). */
export const ARTIFACT_META_FILE = 'meta.json';

/** Parsed payload returned from a successful artifact load. */
export interface LoadedModelArtifact {
  /** Raw LightGBM `booster.save_model('model.txt')` text dump. */
  modelText: string;
  /** Parsed sidecar metadata. `feature_order_hash` is load-bearing
   *  per DEC-064 Clause 4 (compared at load time); the trainer is
   *  free to add additional fields without breaking the loader. */
  meta: ModelMetaJson;
}

/** Minimal meta.json contract — `feature_order_hash` is REQUIRED;
 *  other fields are forwarded opaquely to the caller for surfacing.
 *  Tightening this contract is a 3.3b-ii-B trainer-side change. */
export interface ModelMetaJson {
  feature_order_hash: string;
  trained_at?: string;
  training_window_start?: string;
  training_window_end?: string;
  training_row_count?: number;
  [key: string]: unknown;
}

/** Typed error — surfaces the load failure shape the orchestrator
 *  can pattern-match for an explicit `failure_reason`. */
export class ArtifactUriParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArtifactUriParseError';
  }
}

/** Typed error — DEC-064 Clause 4 refusal. THROWN means: the live
 *  `FEATURE_ORDER` hash does NOT match the artifact's stamped hash;
 *  the model was trained against a different feature contract and
 *  MUST NOT be scored. Load-bearing — there is no silent path. */
export class FeatureOrderHashMismatchError extends Error {
  readonly expected: string;
  readonly actual: string;
  readonly artifact_uri: string;
  constructor(args: { expected: string; actual: string; artifact_uri: string }) {
    super(
      `FeatureOrderHashMismatch: artifact at '${args.artifact_uri}' was trained ` +
        `against a different feature contract — expected feature_order_hash='${args.expected}' ` +
        `(live FEATURE_ORDER, length=${FEATURE_ORDER.length}), got '${args.actual}'. ` +
        `Refusing to score (DEC-064 Clause 4 — silent inference poisoning closed at load time).`,
    );
    this.name = 'FeatureOrderHashMismatchError';
    this.expected = args.expected;
    this.actual = args.actual;
    this.artifact_uri = args.artifact_uri;
  }
}

/** Typed error — Storage `download()` failure for the model.txt or
 *  meta.json half of the pair. */
export class ArtifactDownloadError extends Error {
  readonly artifact_uri: string;
  readonly object_path: string;
  constructor(args: { artifact_uri: string; object_path: string; cause: string }) {
    super(
      `ArtifactDownloadError: failed to download '${args.object_path}' from bucket ` +
        `'${COMBINER_MODELS_BUCKET}' (artifact_uri='${args.artifact_uri}'): ${args.cause}`,
    );
    this.name = 'ArtifactDownloadError';
    this.artifact_uri = args.artifact_uri;
    this.object_path = args.object_path;
  }
}

/** Parse `storage://combiner-models/{model_id}/model.txt` into the
 *  bucket + the object key (`{model_id}/model.txt`). The model_id
 *  itself isn't structurally validated here (the registry FK is the
 *  source of truth); we only assert the scheme + bucket prefix +
 *  trailing `model.txt` so the meta.json sibling derivation is safe. */
export function parseArtifactUri(uri: string): { bucket: string; objectPath: string } {
  if (typeof uri !== 'string' || uri.length === 0) {
    throw new ArtifactUriParseError(`empty artifact_uri`);
  }
  const prefix = `storage://${COMBINER_MODELS_BUCKET}/`;
  if (!uri.startsWith(prefix)) {
    throw new ArtifactUriParseError(
      `artifact_uri '${uri}' must start with '${prefix}' (DEC-065 Clause 2 URI format)`,
    );
  }
  const objectPath = uri.slice(prefix.length);
  if (objectPath.length === 0 || objectPath.startsWith('/')) {
    throw new ArtifactUriParseError(`artifact_uri '${uri}' missing object path after bucket`);
  }
  if (!objectPath.endsWith(`/${ARTIFACT_MODEL_FILE}`)) {
    throw new ArtifactUriParseError(
      `artifact_uri '${uri}' must end with '/${ARTIFACT_MODEL_FILE}' (DEC-065 Clause 2)`,
    );
  }
  return { bucket: COMBINER_MODELS_BUCKET, objectPath };
}

/** Derive the sibling meta.json object path from the model.txt path:
 *  `{model_id}/model.txt` -> `{model_id}/meta.json`. */
export function metaObjectPathFor(modelObjectPath: string): string {
  const idx = modelObjectPath.lastIndexOf(`/${ARTIFACT_MODEL_FILE}`);
  // parseArtifactUri already asserts the suffix, but defend in depth.
  if (idx < 0) {
    throw new ArtifactUriParseError(
      `model object path '${modelObjectPath}' missing /${ARTIFACT_MODEL_FILE} suffix`,
    );
  }
  return modelObjectPath.slice(0, idx) + `/${ARTIFACT_META_FILE}`;
}

/**
 * Build the real `LoadModelArtifact` callback bound to a Supabase
 * client. Returns a function the ranker-orchestrator wires into
 * `RankerOrchestratorContext.loadArtifact`.
 *
 * The Supabase client MUST be service-role-keyed in production — the
 * `combiner-models/` bucket's `INSERT/UPDATE/DELETE` RLS is
 * `service_role`-only and `SELECT` is gated on
 * `has_permission(auth.uid(), 'longshort.view')` (per DEC-065 Clause 4
 * — bucket RLS migration lands same PR as this loader).
 */
export function createModelArtifactLoader(supabase: SupabaseClient): (
  artifact_uri: string,
) => Promise<LoadedModelArtifact> {
  return async (artifact_uri: string): Promise<LoadedModelArtifact> => {
    const { bucket, objectPath } = parseArtifactUri(artifact_uri);
    const metaPath = metaObjectPathFor(objectPath);

    // Download both objects in parallel. Storage `download()` returns
    // { data: Blob | null, error: StorageError | null }.
    const [modelRes, metaRes] = await Promise.all([
      supabase.storage.from(bucket).download(objectPath),
      supabase.storage.from(bucket).download(metaPath),
    ]);

    if (modelRes.error || !modelRes.data) {
      throw new ArtifactDownloadError({
        artifact_uri,
        object_path: objectPath,
        cause: modelRes.error?.message ?? 'no data',
      });
    }
    if (metaRes.error || !metaRes.data) {
      throw new ArtifactDownloadError({
        artifact_uri,
        object_path: metaPath,
        cause: metaRes.error?.message ?? 'no data',
      });
    }

    const modelText = await modelRes.data.text();
    const metaText = await metaRes.data.text();

    let meta: ModelMetaJson;
    try {
      meta = JSON.parse(metaText) as ModelMetaJson;
    } catch (e) {
      throw new ArtifactDownloadError({
        artifact_uri,
        object_path: metaPath,
        cause: `meta.json parse failed: ${(e as Error).message}`,
      });
    }
    if (typeof meta.feature_order_hash !== 'string' || meta.feature_order_hash.length === 0) {
      throw new ArtifactDownloadError({
        artifact_uri,
        object_path: metaPath,
        cause: `meta.json missing required string field 'feature_order_hash' (DEC-064 Clause 4)`,
      });
    }

    // DEC-064 Clause 4 — LOAD-BEARING hash refusal.
    const liveHash = await featureOrderHash();
    if (meta.feature_order_hash !== liveHash) {
      throw new FeatureOrderHashMismatchError({
        expected: liveHash,
        actual: meta.feature_order_hash,
        artifact_uri,
      });
    }

    return { modelText, meta };
  };
}
