// @ts-nocheck — Deno test file; runs via `deno test`, not Vite/tsc.
/**
 * Tests for `model-artifact-loader.ts` (FP-052 3.3b-ii-A / ACT-287).
 *
 * Mock `supabase.storage.from(bucket).download(path)` so no network
 * I/O is needed. Covers:
 *   (mal-1) URI parser accepts the DEC-065 Clause 2 canonical form
 *           `storage://combiner-models/{model_id}/model.txt` and
 *           derives the sibling meta.json object path.
 *   (mal-2) URI parser refuses non-conforming URIs.
 *   (mal-3) Successful load: model.txt + meta.json downloaded;
 *           meta.feature_order_hash == live featureOrderHash() →
 *           returns {modelText, meta}.
 *   (mal-4) LOAD-BEARING refusal: meta.feature_order_hash != live
 *           hash → throws FeatureOrderHashMismatchError. This is the
 *           silent-inference-poisoning closure (DEC-064 Clause 4).
 *   (mal-5) Download error on model.txt → ArtifactDownloadError.
 *   (mal-6) Download error on meta.json → ArtifactDownloadError.
 *   (mal-7) meta.json missing feature_order_hash → ArtifactDownloadError.
 *   (mal-8) Gate 6 wall-clock self-scan on the loader source.
 */
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createModelArtifactLoader,
  parseArtifactUri,
  metaObjectPathFor,
  COMBINER_MODELS_BUCKET,
  ArtifactDownloadError,
  ArtifactUriParseError,
  FeatureOrderHashMismatchError,
} from './model-artifact-loader.ts';
import { featureOrderHash } from './lgbm-inference.ts';

/** Construct a mock SupabaseClient whose Storage `download()` returns
 *  the configured text bodies (or errors) per object path. */
function makeStorageStub(
  files: Record<string, { text?: string; error?: { message: string } }>,
) {
  return {
    storage: {
      from(bucket: string) {
        assertEquals(bucket, COMBINER_MODELS_BUCKET);
        return {
          async download(path: string) {
            const f = files[path];
            if (!f) {
              return { data: null, error: { message: `not_found: ${path}` } };
            }
            if (f.error) {
              return { data: null, error: f.error };
            }
            // Mimic the Blob shape — only .text() is consumed by the loader.
            return {
              data: { async text() { return f.text!; } },
              error: null,
            };
          },
        };
      },
    },
  } as unknown as Parameters<typeof createModelArtifactLoader>[0];
}

const URI = 'storage://combiner-models/abc-123/model.txt';
const MODEL_PATH = 'abc-123/model.txt';
const META_PATH = 'abc-123/meta.json';

Deno.test('(mal-1) parseArtifactUri accepts canonical DEC-065 Clause 2 form', () => {
  const { bucket, objectPath } = parseArtifactUri(URI);
  assertEquals(bucket, COMBINER_MODELS_BUCKET);
  assertEquals(objectPath, MODEL_PATH);
  assertEquals(metaObjectPathFor(objectPath), META_PATH);
});

Deno.test('(mal-2) parseArtifactUri refuses non-conforming URIs', () => {
  for (const bad of [
    '',
    'http://example.com/model.txt',
    'storage://other-bucket/m/model.txt',
    'storage://combiner-models/',
    'storage://combiner-models/m/something_else.bin',
  ]) {
    let caught: unknown;
    try { parseArtifactUri(bad); } catch (e) { caught = e; }
    assert(caught instanceof ArtifactUriParseError, `expected ArtifactUriParseError for '${bad}'`);
  }
});

Deno.test('(mal-3) successful load: hash match returns {modelText, meta}', async () => {
  const liveHash = await featureOrderHash();
  const supabase = makeStorageStub({
    [MODEL_PATH]: { text: 'tree=0\nnum_leaves=1\nleaf_value=0.0\n' },
    [META_PATH]: { text: JSON.stringify({ feature_order_hash: liveHash, trained_at: '2026-06-22T00:00:00Z' }) },
  });
  const loader = createModelArtifactLoader(supabase);
  const result = await loader(URI);
  assertStringIncludes(result.modelText, 'tree=0');
  assertEquals(result.meta.feature_order_hash, liveHash);
  assertEquals(result.meta.trained_at, '2026-06-22T00:00:00Z');
});

Deno.test('(mal-4) LOAD-BEARING refusal: hash mismatch throws FeatureOrderHashMismatchError', async () => {
  const supabase = makeStorageStub({
    [MODEL_PATH]: { text: 'tree=0\n' },
    [META_PATH]: { text: JSON.stringify({ feature_order_hash: 'deadbeef_definitely_not_the_live_hash' }) },
  });
  const loader = createModelArtifactLoader(supabase);
  const err = await assertRejects(
    () => loader(URI),
    FeatureOrderHashMismatchError,
    'FeatureOrderHashMismatch',
  );
  // Error carries the expected (live) hash + the actual (artifact-stamped) hash + the URI.
  assertEquals((err as FeatureOrderHashMismatchError).actual, 'deadbeef_definitely_not_the_live_hash');
  assertEquals((err as FeatureOrderHashMismatchError).artifact_uri, URI);
  const liveHash = await featureOrderHash();
  assertEquals((err as FeatureOrderHashMismatchError).expected, liveHash);
});

Deno.test('(mal-5) model.txt download error → ArtifactDownloadError', async () => {
  const supabase = makeStorageStub({
    [MODEL_PATH]: { error: { message: 'simulated_storage_500' } },
    [META_PATH]: { text: JSON.stringify({ feature_order_hash: 'x' }) },
  });
  const loader = createModelArtifactLoader(supabase);
  await assertRejects(() => loader(URI), ArtifactDownloadError, 'simulated_storage_500');
});

Deno.test('(mal-6) meta.json download error → ArtifactDownloadError', async () => {
  const supabase = makeStorageStub({
    [MODEL_PATH]: { text: 'tree=0\n' },
    [META_PATH]: { error: { message: 'simulated_meta_404' } },
  });
  const loader = createModelArtifactLoader(supabase);
  await assertRejects(() => loader(URI), ArtifactDownloadError, 'simulated_meta_404');
});

Deno.test('(mal-7) meta.json missing feature_order_hash → ArtifactDownloadError', async () => {
  const supabase = makeStorageStub({
    [MODEL_PATH]: { text: 'tree=0\n' },
    [META_PATH]: { text: JSON.stringify({ trained_at: '2026-06-22T00:00:00Z' }) },
  });
  const loader = createModelArtifactLoader(supabase);
  await assertRejects(
    () => loader(URI),
    ArtifactDownloadError,
    "missing required string field 'feature_order_hash'",
  );
});

Deno.test('(mal-8) Gate 6: loader module is wall-clock free', async () => {
  const src = await Deno.readTextFile(new URL('./model-artifact-loader.ts', import.meta.url));
  for (const banned of ['Date.now', 'new Date', 'performance.now']) {
    assert(!src.includes(banned), `model-artifact-loader.ts must not contain '${banned}' (Gate 6)`);
  }
});
