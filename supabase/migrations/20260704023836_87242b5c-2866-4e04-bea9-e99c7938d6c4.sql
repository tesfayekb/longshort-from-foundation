-- FP-069 W3.1 (ACT-458) — overshoot execution-substrate schema.
-- Seven tables + RLS. Mirrors the longshort exemplars (audit, lots, reconciliation_state)
-- shape-for-shape; overshoot-namespaced per T2 separation.

-- ────────────────────────────────────────────────────────────────────────────
-- (1) overshoot_detection_runs — one row per EOD detection cron fire.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.overshoot_detection_runs (
  run_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of            date        NOT NULL,
  detected_at      timestamptz NOT NULL,
  outcome          text        NOT NULL,
  event_count      integer     NOT NULL DEFAULT 0,
  selected_count   integer     NOT NULL DEFAULT 0,
  durations_ms     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  correlation_id   text        NULL,
  git_sha          text        NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT overshoot_detection_runs_outcome_check
    CHECK (outcome IN ('running','completed','failed','no_op'))
);
CREATE INDEX IF NOT EXISTS overshoot_detection_runs_as_of_idx
  ON public.overshoot_detection_runs (as_of DESC);

GRANT SELECT ON public.overshoot_detection_runs TO authenticated;
GRANT ALL ON public.overshoot_detection_runs TO service_role;
ALTER TABLE public.overshoot_detection_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY overshoot_detection_runs_read
  ON public.overshoot_detection_runs FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));
CREATE POLICY overshoot_detection_runs_service_all
  ON public.overshoot_detection_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY overshoot_detection_runs_no_direct_write
  ON public.overshoot_detection_runs FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- ────────────────────────────────────────────────────────────────────────────
-- (2) overshoot_events — per-detection substrate; the W4 console table.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.overshoot_events (
  event_id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                   uuid        NOT NULL REFERENCES public.overshoot_detection_runs(run_id) ON DELETE CASCADE,
  as_of_date               date        NOT NULL,
  ticker                   text        NOT NULL,
  side                     text        NOT NULL,
  excess_w1                numeric     NULL,
  excess_w2                numeric     NULL,
  excess_w3                numeric     NULL,
  excess_w4                numeric     NULL,
  excess_w5                numeric     NULL,
  argmax_window_days       integer     NULL,
  momentum_quintile        integer     NULL,
  drawdown_bucket          integer     NULL,
  days_to_nearest_earnings integer     NULL,
  earnings_alias_used      text        NULL,
  filter_passes            jsonb       NOT NULL DEFAULT '{}'::jsonb,
  filter_refusal_reason    text        NULL,
  selected_for_entry       boolean     NOT NULL DEFAULT false,
  rank_score               numeric     NULL,
  study_cell_ref           jsonb       NULL,  -- P-B#4 lookup provenance (window/band/mq/db/xw)
  created_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT overshoot_events_side_check CHECK (side IN ('long','short'))
);
CREATE INDEX IF NOT EXISTS overshoot_events_run_id_idx
  ON public.overshoot_events (run_id);
CREATE INDEX IF NOT EXISTS overshoot_events_as_of_ticker_idx
  ON public.overshoot_events (as_of_date DESC, ticker);
CREATE INDEX IF NOT EXISTS overshoot_events_selected_idx
  ON public.overshoot_events (as_of_date DESC, side)
  WHERE selected_for_entry = true;

GRANT SELECT ON public.overshoot_events TO authenticated;
GRANT ALL ON public.overshoot_events TO service_role;
ALTER TABLE public.overshoot_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY overshoot_events_read
  ON public.overshoot_events FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));
CREATE POLICY overshoot_events_service_all
  ON public.overshoot_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY overshoot_events_no_direct_write
  ON public.overshoot_events FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- ────────────────────────────────────────────────────────────────────────────
-- (3) overshoot_lots — FIFO tax-lot ledger.
--   Mirrors public.longshort_lots byte-for-byte MINUS `locate_id` and the
--   wash_sale_* columns (dropped for v1 per FP-069 W3 investigation I3/I5:
--   overshoot detector priors do not require pre-trade locates and wash-sale
--   accounting is deferred to a later wave; the operator ratification pack
--   records the drop). Every other column and constraint preserved verbatim.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.overshoot_lots (
  lot_id                  uuid             NOT NULL DEFAULT gen_random_uuid(),
  operator_id             uuid             NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  symbol                  text             NOT NULL,
  entry_ts                timestamptz      NOT NULL,
  qty                     numeric          NOT NULL,
  cost_basis              numeric          NOT NULL,
  side                    text             NOT NULL,
  status                  text             NOT NULL DEFAULT 'open',
  settlement_state        text             NOT NULL DEFAULT 'pending',
  expected_settlement_ts  timestamptz      NULL,
  source_order_id         text             NULL,
  closed_at               timestamptz      NULL,
  created_at              timestamptz      NOT NULL DEFAULT now(),
  updated_at              timestamptz      NOT NULL DEFAULT now(),
  PRIMARY KEY (lot_id),
  CONSTRAINT overshoot_lots_qty_positive_check      CHECK (qty > 0),
  CONSTRAINT overshoot_lots_cost_basis_nonneg_check CHECK (cost_basis >= 0),
  CONSTRAINT overshoot_lots_side_check              CHECK (side IN ('long','short')),
  CONSTRAINT overshoot_lots_status_check            CHECK (status IN ('open','closed')),
  CONSTRAINT overshoot_lots_settlement_state_check  CHECK (settlement_state IN ('pending','settled','failed'))
);
COMMENT ON TABLE public.overshoot_lots IS
  'FP-069 W3.1 (ACT-458). FIFO tax-lot ledger for overshoot. Mirrors longshort_lots byte-for-byte MINUS locate_id and wash_sale_* (dropped v1 per W3 investigation I3/I5 — no pre-trade locate requirement in overshoot priors; wash-sale accounting deferred to a later wave).';

CREATE INDEX IF NOT EXISTS overshoot_lots_operator_symbol_status_idx
  ON public.overshoot_lots (operator_id, symbol, status);
CREATE INDEX IF NOT EXISTS overshoot_lots_operator_entry_ts_idx
  ON public.overshoot_lots (operator_id, entry_ts);
CREATE INDEX IF NOT EXISTS overshoot_lots_settlement_pending_idx
  ON public.overshoot_lots (operator_id, expected_settlement_ts)
  WHERE settlement_state = 'pending';

GRANT SELECT ON public.overshoot_lots TO authenticated;
GRANT ALL ON public.overshoot_lots TO service_role;
ALTER TABLE public.overshoot_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY overshoot_lots_service_all
  ON public.overshoot_lots FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY overshoot_lots_read
  ON public.overshoot_lots FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));
CREATE POLICY overshoot_lots_no_direct_write
  ON public.overshoot_lots FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- ────────────────────────────────────────────────────────────────────────────
-- (4) overshoot_target_positions — planned entries per detection run.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.overshoot_target_positions (
  run_id           uuid        NOT NULL REFERENCES public.overshoot_detection_runs(run_id) ON DELETE CASCADE,
  ticker           text        NOT NULL,
  side             text        NOT NULL,
  target_shares    numeric     NOT NULL,
  target_notional  numeric     NOT NULL,
  rank_score       numeric     NULL,
  computed_at      timestamptz NOT NULL,
  PRIMARY KEY (run_id, ticker, side),
  CONSTRAINT overshoot_target_positions_side_check CHECK (side IN ('long','short'))
);

GRANT SELECT ON public.overshoot_target_positions TO authenticated;
GRANT ALL ON public.overshoot_target_positions TO service_role;
ALTER TABLE public.overshoot_target_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY overshoot_target_positions_read
  ON public.overshoot_target_positions FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));
CREATE POLICY overshoot_target_positions_service_all
  ON public.overshoot_target_positions FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY overshoot_target_positions_no_direct_write
  ON public.overshoot_target_positions FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- ────────────────────────────────────────────────────────────────────────────
-- (5) overshoot_reconciliation_state — mirror of longshort_reconciliation_state (10 cols).
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.overshoot_reconciliation_state (
  operator_id              uuid        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  symbol                   text        NOT NULL,
  call_name                text        NOT NULL,
  rolling_window_count     integer     NOT NULL DEFAULT 0,
  rolling_window_start     timestamptz NOT NULL,
  last_firing_ts           timestamptz,
  cooldown_until           timestamptz,
  escalation_active        boolean     NOT NULL DEFAULT false,
  escalation_count_24h     integer     NOT NULL DEFAULT 0,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, symbol, call_name)
);
COMMENT ON TABLE public.overshoot_reconciliation_state IS
  'FP-069 W3.1 (ACT-458). Reconciliation engine state surface — overshoot mirror of longshort_reconciliation_state. State-as-projection: authoritative log is reconciliation_events; this table caches derived facts.';

CREATE INDEX IF NOT EXISTS overshoot_reconciliation_state_operator_idx
  ON public.overshoot_reconciliation_state (operator_id, updated_at DESC);

GRANT SELECT ON public.overshoot_reconciliation_state TO authenticated;
GRANT ALL ON public.overshoot_reconciliation_state TO service_role;
ALTER TABLE public.overshoot_reconciliation_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY overshoot_reconciliation_state_read
  ON public.overshoot_reconciliation_state FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));
CREATE POLICY overshoot_reconciliation_state_no_direct_write
  ON public.overshoot_reconciliation_state FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- ────────────────────────────────────────────────────────────────────────────
-- (6) overshoot_short_interest — Polygon-derived SI% cache.
--   si_pct_float is DERIVED = raw_short_interest / current shares_outstanding.
--   CONSCIOUS APPROXIMATION (verbatim spirit of the longshort precedent
--   documented in _shared/longshort-signals/short-interest-change/
--   short-interest-orchestrator.ts): shares-outstanding is slow-moving
--   (corporate actions on quarter/year scale) relative to short-interest
--   (twice-monthly). A common current-shares-out denominator is not silent —
--   it is pinned here in the schema comment, in the sibling fetcher, and in
--   the module doc. Approximations are acceptable; hidden approximations are
--   not.
--   Typed absence: NULL on si_pct_float / dtc means the boundary source did
--   not provide the field (entitlement-gated or unpublished); NEVER coerced
--   to 0 (§9 SENTINEL anti-pattern).
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.overshoot_short_interest (
  as_of_date      date        NOT NULL,
  ticker          text        NOT NULL,
  si_pct_float    numeric     NULL,
  dtc             numeric     NULL,
  source_run_id   uuid        NULL,
  computed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (as_of_date, ticker)
);
COMMENT ON TABLE public.overshoot_short_interest IS
  'FP-069 W3.1 (ACT-458). Overshoot-owned Polygon SI cache. si_pct_float derived from current shares_outstanding (documented conscious approximation, mirrors longshort short-interest precedent). Typed absence via NULL — NEVER a fabricated zero.';

GRANT SELECT ON public.overshoot_short_interest TO authenticated;
GRANT ALL ON public.overshoot_short_interest TO service_role;
ALTER TABLE public.overshoot_short_interest ENABLE ROW LEVEL SECURITY;

CREATE POLICY overshoot_short_interest_read
  ON public.overshoot_short_interest FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));
CREATE POLICY overshoot_short_interest_service_all
  ON public.overshoot_short_interest FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE POLICY overshoot_short_interest_no_direct_write
  ON public.overshoot_short_interest FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- ────────────────────────────────────────────────────────────────────────────
-- (7) overshoot_audit_logs — per-strategy audit sink (mirrors longshort_audit_logs).
--   Sole sanctioned writer is _shared/strategy-audit.ts writeStrategyAuditEvent
--   with strategyKey='overshoot'. Append-only: INSERT allowed, no UPDATE/DELETE
--   policies (RLS-enabled → deny by default).
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.overshoot_audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id     uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  action          text NOT NULL,
  target_type     text,
  target_id       text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address      text,
  user_agent      text,
  correlation_id  uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.overshoot_audit_logs TO authenticated;
GRANT ALL ON public.overshoot_audit_logs TO service_role;
ALTER TABLE public.overshoot_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY overshoot_audit_logs_read
  ON public.overshoot_audit_logs FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));
CREATE POLICY overshoot_audit_logs_insert
  ON public.overshoot_audit_logs FOR INSERT TO authenticated
  WITH CHECK (true);
-- Absence of UPDATE/DELETE policies = append-only enforced by RLS.

CREATE INDEX IF NOT EXISTS overshoot_audit_logs_correlation_id_idx
  ON public.overshoot_audit_logs (correlation_id)
  WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS overshoot_audit_logs_created_at_idx
  ON public.overshoot_audit_logs (created_at DESC);