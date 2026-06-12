-- MIG-089a — FP-048 Phase 3a — Sequential-feed extension to the FP-045 queue engine
--
-- Adds the two columns + one table the engine needs to operate Signal #8
-- (`news_sentiment_7d`, CROSSWIND §4.4.8) as a sequential-feed consumer
-- of the existing cursor-drain queue engine (DEC-047 / MIG-082 / MIG-083).
--
-- Architecture (DEC-056 cap-provenance addendum + operator ratification
-- 2026-06-11): Polygon `/v2/reference/news` rate cap reads "unlimited"
-- per the operator dashboard → self-imposed engineering cap 10 req/s
-- (rate-bound trivially non-binding); Phase-0 evidence pinned 35-70
-- pages × 6.3s sequential = 220-441s latency-bound, BOTH breaching the
-- 120s STOP gate and the 150s HTTP wall → single-invocation disqualified;
-- the queue-engine sequential-feed variant is the ratified architecture
-- (Option 1 in the Phase-3 fork). FP-048 Phase 3a ships the engine
-- extension; Phase 3b ships the news consumer + wiring.
--
-- Per-mode discipline (engine union by `mode?: 'per-ticker' |
-- 'sequential-feed'` with default `per-ticker`): existing PEAD/options
-- consumers omit the field and remain on per-ticker; the news consumer
-- explicitly sets `sequential-feed`. The DB columns introduced here are
-- NULL / 0 by default — per-ticker rows never read or write them, so
-- this migration is regression-clean for PEAD + options-flow runs.
--
-- Pre-condition (no-op assertion): `signal_queue_cursor.gics_sector` is
-- already nullable in MIG-082 (column declared `gics_sector text`,
-- no NOT NULL constraint), which lets the feed-mode init seed the
-- synthetic-ticker cursor row with `gics_sector = NULL` rather than
-- inventing a sentinel sector string (anti-phantom discipline). This
-- migration adds a DO-block sanity check that surfaces a clear error if
-- a future migration silently tightened the column.

-- ────────────────────────────────────────────────────────────────────────────
-- 0) Pre-condition assertion (cursor.gics_sector nullable — MIG-082 invariant)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_is_nullable text;
BEGIN
  SELECT is_nullable INTO v_is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'signal_queue_cursor'
    AND column_name  = 'gics_sector';
  IF v_is_nullable IS NULL THEN
    RAISE EXCEPTION 'MIG-089a precondition: signal_queue_cursor.gics_sector column not found';
  END IF;
  IF v_is_nullable <> 'YES' THEN
    RAISE EXCEPTION 'MIG-089a precondition violated: signal_queue_cursor.gics_sector is NOT NULL (must be nullable for feed-mode synthetic cursor row)';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) signal_queue_runs — feed-mode run-state columns
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.signal_queue_runs
  ADD COLUMN IF NOT EXISTS feed_cursor        text,
  ADD COLUMN IF NOT EXISTS feed_pages_fetched integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.signal_queue_runs.feed_cursor IS
  'FP-048 Phase 3a / MIG-089a. Opaque vendor pagination token for sequential-feed mode (Polygon next_url for Signal #8). NULL means "fetch first page" at start, or feed exhausted at finalize. Per-ticker runs leave this NULL.';
COMMENT ON COLUMN public.signal_queue_runs.feed_pages_fetched IS
  'FP-048 Phase 3a / MIG-089a. Cumulative pages fetched across all slices for this feed run. Per-ticker runs leave this 0. Slice-worker fails the run with reason max_pages_exceeded when this reaches QueueSignalConfig.maxPages.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2) signal_queue_feed_items — durable per-(article,ticker) record
-- ────────────────────────────────────────────────────────────────────────────
--
-- The slice-worker upserts here on every page; the finalizer reads the
-- complete set, groups by ticker, and calls computeFromItems per universe
-- name. PK (run_id, article_id, ticker) makes page-retry idempotent at
-- the DB layer (a transient blip or manual replay re-upserts the same
-- bytes; sentiment_num / tier_weight / published_utc are frozen per the
-- Phase-1 classify contract — there is no race where two slice runs
-- could write different values for the same key).

CREATE TABLE IF NOT EXISTS public.signal_queue_feed_items (
  run_id        uuid NOT NULL REFERENCES public.signal_queue_runs(run_id) ON DELETE CASCADE,
  article_id    text NOT NULL,
  ticker        text NOT NULL,
  sentiment_num numeric NOT NULL,
  tier_weight   numeric NOT NULL,
  published_utc timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, article_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_signal_queue_feed_items_run_ticker
  ON public.signal_queue_feed_items (run_id, ticker);

GRANT SELECT ON public.signal_queue_feed_items TO authenticated;
GRANT ALL    ON public.signal_queue_feed_items TO service_role;

ALTER TABLE public.signal_queue_feed_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signal_queue_feed_items_longshort_view_read ON public.signal_queue_feed_items;
CREATE POLICY signal_queue_feed_items_longshort_view_read
  ON public.signal_queue_feed_items
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS signal_queue_feed_items_deny_authenticated_insert ON public.signal_queue_feed_items;
CREATE POLICY signal_queue_feed_items_deny_authenticated_insert
  ON public.signal_queue_feed_items
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS signal_queue_feed_items_deny_authenticated_update ON public.signal_queue_feed_items;
CREATE POLICY signal_queue_feed_items_deny_authenticated_update
  ON public.signal_queue_feed_items
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS signal_queue_feed_items_deny_authenticated_delete ON public.signal_queue_feed_items;
CREATE POLICY signal_queue_feed_items_deny_authenticated_delete
  ON public.signal_queue_feed_items
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (false);

COMMENT ON TABLE public.signal_queue_feed_items IS
  'FP-048 Phase 3a / MIG-089a / DEC-056 §(architecture). Durable per-(article,ticker) record for sequential-feed signals (Signal #8 news_sentiment_7d v1). Slice-worker upserts each page (PK idempotent on retry); finalizer groups by ticker for per-name compute. Sweeper TTL prunes alongside staging/skips on terminal-run cleanup. Read via longshort.view; writes service-role only (queue-worker engine).';