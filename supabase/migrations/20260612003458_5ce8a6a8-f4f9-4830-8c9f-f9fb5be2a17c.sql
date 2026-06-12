-- MIG-089b — FP-048 Phase 3b — Signal #8 (news_sentiment_7d) registry truth — DISARMED
--
-- Two-statement metadata-only migration (no DDL, no new tables, no
-- GRANT/RLS/policy changes). The Phase 3a substrate (MIG-089a:
-- signal_queue_feed_items + feed_cursor + feed_pages_fetched) is the
-- DDL counterpart; this migration is purely the registry truth — the
-- two rows admin tooling, monitoring, and the FP-010 inheritance path
-- read to discover the new consumer.
--
-- Architecture (operator-ratified 2026-06-11): sequential-feed on the
-- FP-045 engine. Single-invocation disqualified by Phase-0 evidence
-- (35-70 pages × 6.3s = 220-441s vs the 120s STOP gate + 150s HTTP
-- wall). Consumer wiring lives in
-- `_shared/longshort-signals/news-sentiment/news-sentiment-queue-registration.ts`;
-- the handler is `supabase/functions/longshort-news-compute/index.ts`
-- (cron) and the manual sibling is `longshort-news-compute-manual`.
--
-- Schedule slot 30 21 * * 1-5 UTC — placed after analyst (21:00 UTC)
-- and before options-flow (22:00 UTC) so no two init triggers fire on
-- the same minute (the shared queue-engine slice/sweeper rows fire
-- every minute regardless and drain whichever runs are open).
--
-- DEC-048 interim-cadence discipline: §4.4.8 spec target is 5-min
-- intraday; v1 is daily after-close. Truth-in-telemetry cadence string
-- names the gap so admin tooling doesn't display the spec target as
-- the actual cadence.
--
-- NO new slice/sweeper job_registry rows. The MIG-084 rows
-- (`longshort.queue.slice`, `longshort.queue.sweeper`) are SHARED
-- engine rows — signal-agnostic by design; they already serve PEAD,
-- options-flow, and now news without modification.
--
-- NO cron.job changes. Cron wiring is operator-side at arm-up per
-- DEC-040 (byte-match attestation) + DEC-048 (operator-run enable
-- step); MIG-089b leaves the row DISARMED (`enabled=false`).

-- ────────────────────────────────────────────────────────────────────
-- 1) job_registry — register longshort.news.compute (DISARMED)
-- ────────────────────────────────────────────────────────────────────
INSERT INTO public.job_registry (
  id,
  owner_module,
  description,
  schedule,
  trigger_type,
  class,
  priority,
  execution_guarantee,
  timeout_seconds,
  max_retries,
  retry_policy,
  concurrency_policy,
  replay_safe,
  enabled,
  status,
  handler_path
) VALUES (
  'longshort.news.compute',
  'longshort',
  'Daily News Sentiment Momentum (§4.4.8) signal computation — interim cadence per DEC-048 (NOT end-state; §4.4.8 spec target is 5-min intraday; Phase 7 picks final cadence). FP-048 Phase 3b: SEQUENTIAL-FEED consumer on the FP-045 cursor-drain queue engine (Option 1 operator-ratified 2026-06-11 after Phase-0 evidence — 35-70 pages × 6.3s sequential = 220-441s — disqualified single-invocation against the 120s STOP gate and 150s HTTP wall). Handler is an enqueue shim that seeds a feed-mode signal_queue_runs row + one synthetic signal_queue_cursor row (__feed__, gics_sector=NULL) via the shared queue-init module and returns 202; the longshort-queue-slice cron drains the Polygon /v2/reference/news global feed across N subsequent ticks (15 pages/slice × 6.3s observed = 94.5s, SAFE vs the 120s STOP gate); the longshort-queue-finalizer aggregates signal_queue_feed_items by universe ticker via computeFromItems → computeNewsSentiment per CROSSWIND §4.4.8 (signal = Σ sentiment × tier_weight × exp(-age_h/24)). Rate cap: self-imposed 10 rps × 0.85 = 8.5 rps per DEC-056 cap-provenance addendum (operator dashboard reads "unlimited" — self-imposed engineering cap per anti-phantom discipline). Typed skips: no_articles_in_window / data_unavailable / fetch_error / missing_sector / singleton_sector. NO sentinel numerics — all-neutral coverage emits raw=0.0 (genuine information), not a skip.',
  '30 21 * * 1-5',
  'scheduled',
  'operational',
  'normal',
  'at_least_once',
  150,
  2,
  'standard',
  'forbid',
  true,
  false,                                                  -- DISARMED
  'registered',
  'supabase/functions/longshort-news-compute/index.ts'
)
ON CONFLICT (id) DO UPDATE
  SET owner_module        = EXCLUDED.owner_module,
      description         = EXCLUDED.description,
      schedule            = EXCLUDED.schedule,
      trigger_type        = EXCLUDED.trigger_type,
      class               = EXCLUDED.class,
      priority            = EXCLUDED.priority,
      execution_guarantee = EXCLUDED.execution_guarantee,
      timeout_seconds     = EXCLUDED.timeout_seconds,
      max_retries         = EXCLUDED.max_retries,
      retry_policy        = EXCLUDED.retry_policy,
      concurrency_policy  = EXCLUDED.concurrency_policy,
      replay_safe         = EXCLUDED.replay_safe,
      enabled             = EXCLUDED.enabled,
      status              = EXCLUDED.status,
      handler_path        = EXCLUDED.handler_path,
      updated_at          = now();

-- ────────────────────────────────────────────────────────────────────
-- 2) signal_registry — flip news_sentiment_7d planned → live with
--    truth-in-telemetry cadence (DEC-048 interim discipline)
-- ────────────────────────────────────────────────────────────────────
UPDATE public.signal_registry
   SET status        = 'live',
       cadence       = 'daily (after-close; queue-drained ~3-6 min; §4.4.8 5-min intraday target deferred per DEC-048)',
       planned_phase = NULL
 WHERE signal_id = 'news_sentiment_7d';