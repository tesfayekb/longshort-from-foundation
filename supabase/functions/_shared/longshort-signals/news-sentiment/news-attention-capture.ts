/**
 * DW-186a — news_attention_observations capture adapter.
 *
 * Persists ONLY the observationally-real meta field — `articleCount` —
 * as produced by `computeNewsSentiment` (compute-news-sentiment.ts:218).
 *
 * EXPLICITLY NOT WRITTEN (chartered as DW-186b):
 *   - `prExcludedCount` — structural-0 today because PR-excluded entries
 *     are dropped pre-stage in `fetchPage` (news-sentiment-queue-
 *     registration.ts:225, DEC-056 §(e)); they never reach the finalizer.
 *   - `unmappedPublisherCount` — structural-0 today because
 *     `tierMapped: true` is hardcoded at the feed-mode reconstruction
 *     (news-sentiment-queue-registration.ts:254); `FeedItemRecord` has
 *     no `tier_mapped` channel.
 *
 * Writing either of those as 0 (or as NULL with a NOT-NULL schema) would
 * persist a structurally-fabricated value — exactly the operator's
 * "every value real, no phantom" rule forbids. They are chartered to
 * land in DW-186b once the upstream `fetchPage` and
 * `signal_queue_feed_items` carry the missing channels.
 *
 * Capture-only: this write does NOT modify the news signal value, the
 * z-score path, the ranker, or PnL. It runs IN-PROCESS in the queue
 * finalizer (`runQueueFinalizer` § 1b) before z-score, on the same
 * staging set whose `meta` payload the kernel produced.
 *
 * Idempotency: the upsert key matches the table PK
 * `(operator_id, signal_id, as_of_date, ticker)` — a re-run of the same
 * slot is a same-bytes overwrite.
 *
 * Owner: longshort (DW-186a / FP-048 — Signal #8 attention capture).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NewsSentimentMeta } from './compute-news-sentiment.ts';

/**
 * Narrow runtime guard — returns the kernel-produced articleCount only
 * when the meta payload structurally matches `NewsSentimentMeta` AND
 * `articleCount` is a finite non-negative integer. Any other shape is
 * an upstream contract bug and yields `null` (no row written).
 */
function realArticleCount(meta: unknown): number | null {
  if (meta === null || typeof meta !== 'object') return null;
  const v = (meta as Partial<NewsSentimentMeta>).articleCount;
  if (typeof v !== 'number') return null;
  if (!Number.isFinite(v)) return null;
  if (!Number.isInteger(v)) return null;
  if (v < 0) return null;
  return v;
}

export interface NewsAttentionCaptureArgs {
  supabase: SupabaseClient;
  operator_id: string;
  signal_id: string;
  as_of_date: string;
  computed_at: string;
  rows: ReadonlyArray<{ ticker: string; meta: unknown }>;
}

/**
 * `FinalizeMetaCaptureFn`-compatible adapter. Filters to the rows that
 * carry a real `articleCount` and upserts them; rows without a usable
 * meta produce NO row (honest absence). Throws on persistence error so
 * the finalizer transitions the run to `failed` (no silent capture
 * loss).
 */
export async function captureNewsAttention(
  args: NewsAttentionCaptureArgs,
): Promise<void> {
  const { supabase, operator_id, signal_id, as_of_date, computed_at, rows } = args;

  const payload: Array<{
    operator_id: string;
    signal_id: string;
    as_of_date: string;
    ticker: string;
    article_count: number;
    computed_at: string;
  }> = [];

  for (const r of rows) {
    const count = realArticleCount(r.meta);
    if (count === null) continue;
    payload.push({
      operator_id,
      signal_id,
      as_of_date,
      ticker: r.ticker,
      article_count: count,
      computed_at,
    });
  }

  if (payload.length === 0) return;

  const { error } = await supabase
    .from('news_attention_observations')
    .upsert(payload, { onConflict: 'operator_id,signal_id,as_of_date,ticker' });

  if (error) {
    throw new Error(`news_attention_observations upsert failed: ${error.message}`);
  }
}