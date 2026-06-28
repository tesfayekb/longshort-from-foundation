// deno-lint-ignore-file no-import-prefix require-await -- typed mocks + std import (DW-186a)
// @ts-nocheck — Deno test file.
/**
 * DW-186a — news_attention_observations capture test.
 *
 * Anti-fabrication pin: the captured `article_count` MUST equal the
 * kernel's `meta.articleCount` byte-for-byte; absent/invalid meta MUST
 * produce NO row (honest absence, never a fabricated 0).
 *
 * The compute → finalize → capture round-trip equality assertion is
 * driven from real `computeNewsSentiment` fixtures (the same kernel that
 * compute-news-sentiment_test.ts asserts on), so the test is grounded
 * in observed compute output, not a hand-rolled meta literal.
 */
import {
  assert,
  assertEquals,
  assertStrictEquals,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  classifyArticle,
  type ArticleClassification,
} from './news-filters.ts';
import {
  computeNewsSentiment,
  type NewsArticleEntry,
} from './compute-news-sentiment.ts';
import { captureNewsAttention } from './news-attention-capture.ts';

const AS_OF_MS = Date.UTC(2026, 5, 10, 21, 0, 0, 0);
const AS_OF = new Date(AS_OF_MS);
const MS_PER_HOUR = 3_600_000;

function entryAt(ageHours: number, classification: ArticleClassification): NewsArticleEntry {
  return {
    publishedAtMs: AS_OF_MS - ageHours * MS_PER_HOUR,
    classification,
  };
}

function makeMockSupabase() {
  const upserts: Array<{ payload: unknown; onConflict: string | undefined }> = [];
  const supabase: unknown = {
    from(table: string) {
      return {
        upsert(payload: unknown, opts?: { onConflict?: string }) {
          assertStrictEquals(table, 'news_attention_observations');
          upserts.push({ payload, onConflict: opts?.onConflict });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { supabase, upserts };
}

// ── PIN 1: captured article_count === kernel meta.articleCount ─────────
Deno.test('captureNewsAttention: captured article_count equals computeNewsSentiment meta.articleCount', async () => {
  // Three real Reuters positive entries inside the 7d window — the kernel
  // counts each as one scorable article (compute-news-sentiment.ts:179).
  const cls = classifyArticle({ publisherName: 'Reuters', sentimentCategory: 'positive' });
  const r = computeNewsSentiment({
    entries: [entryAt(0, cls), entryAt(24, cls), entryAt(48, cls)],
    asOf: AS_OF,
  });
  if (r.kind !== 'value') throw new Error(`expected value, got ${r.kind}`);
  assertStrictEquals(r.meta.articleCount, 3); // anchor from compute

  const { supabase, upserts } = makeMockSupabase();
  await captureNewsAttention({
    supabase,
    operator_id: 'op-1',
    signal_id: 'news_sentiment_7d',
    as_of_date: '2026-06-10',
    computed_at: '2026-06-10T21:00:00.000Z',
    rows: [{ ticker: 'AAPL', meta: r.meta }],
  });

  assertEquals(upserts.length, 1);
  const payload = upserts[0].payload as Array<Record<string, unknown>>;
  assertEquals(payload.length, 1);
  assertStrictEquals(payload[0].ticker, 'AAPL');
  // The binding constraint: captured equals computed, byte-for-byte.
  assertStrictEquals(payload[0].article_count, r.meta.articleCount);
  assertStrictEquals(payload[0].article_count, 3);
  assertStrictEquals(payload[0].operator_id, 'op-1');
  assertStrictEquals(payload[0].signal_id, 'news_sentiment_7d');
  assertStrictEquals(payload[0].as_of_date, '2026-06-10');
  assertStrictEquals(payload[0].computed_at, '2026-06-10T21:00:00.000Z');
  assertStrictEquals(upserts[0].onConflict, 'operator_id,signal_id,as_of_date,ticker');

  // Anti-phantom: the two structural-0 fields are NEVER written.
  assert(!('pr_excluded_count' in payload[0]));
  assert(!('unmapped_publisher_count' in payload[0]));
});

// ── PIN 2: absent / invalid meta → NO row (honest absence, no fabricated 0) ─
Deno.test('captureNewsAttention: absent or invalid meta yields NO row (no fabricated 0)', async () => {
  const { supabase, upserts } = makeMockSupabase();
  await captureNewsAttention({
    supabase,
    operator_id: 'op-1',
    signal_id: 'news_sentiment_7d',
    as_of_date: '2026-06-10',
    computed_at: '2026-06-10T21:00:00.000Z',
    rows: [
      { ticker: 'A', meta: undefined as unknown },
      { ticker: 'B', meta: null as unknown },
      { ticker: 'C', meta: { articleCount: 'three' } as unknown }, // wrong type
      { ticker: 'D', meta: { articleCount: -1 } as unknown }, // negative
      { ticker: 'E', meta: { articleCount: 1.5 } as unknown }, // non-integer
      { ticker: 'F', meta: { articleCount: Number.NaN } as unknown }, // non-finite
      { ticker: 'G', meta: {} as unknown }, // missing field
    ],
  });
  // No call should have been made — all rows rejected as non-real.
  assertEquals(upserts.length, 0);
});

// ── PIN 3: zero rows in → no DB call at all ───────────────────────────
Deno.test('captureNewsAttention: empty rows array makes no DB call', async () => {
  const { supabase, upserts } = makeMockSupabase();
  await captureNewsAttention({
    supabase,
    operator_id: 'op-1',
    signal_id: 'news_sentiment_7d',
    as_of_date: '2026-06-10',
    computed_at: '2026-06-10T21:00:00.000Z',
    rows: [],
  });
  assertEquals(upserts.length, 0);
});

// ── PIN 4: error from DB surfaces as throw (finalizer transitions to failed) ─
Deno.test('captureNewsAttention: DB error throws (caller transitions run to failed)', async () => {
  const supabase: unknown = {
    from(_t: string) {
      return {
        upsert(_p: unknown, _o?: unknown) {
          return Promise.resolve({ error: { message: 'boom' } });
        },
      };
    },
  };
  let threw = false;
  try {
    await captureNewsAttention({
      supabase,
      operator_id: 'op-1',
      signal_id: 'news_sentiment_7d',
      as_of_date: '2026-06-10',
      computed_at: '2026-06-10T21:00:00.000Z',
      rows: [{ ticker: 'X', meta: { articleCount: 1 } }],
    });
  } catch (e) {
    threw = true;
    assert(String((e as Error).message).includes('news_attention_observations upsert failed'));
    assert(String((e as Error).message).includes('boom'));
  }
  assert(threw, 'expected captureNewsAttention to throw on DB error');
});