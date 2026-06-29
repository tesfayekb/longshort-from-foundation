
-- ─────────────────────────────────────────────────────────────────────────
-- MIG-141 — FP-061 sub-step 4M.3 wash-sale infrastructure (ACT-374)
-- Two tables: wash_sale_events (authoritative) + wash_sale_pending_review
-- (Path B operator queue). Mirrors longshort_audit_logs RLS/GRANT pattern.
-- ─────────────────────────────────────────────────────────────────────────

-- (1) wash_sale_events ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wash_sale_events (
  event_id              UUID         NOT NULL DEFAULT gen_random_uuid(),
  operator_id           UUID         NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  symbol                TEXT         NOT NULL,
  exit_ts               TIMESTAMPTZ  NOT NULL,
  realized_loss         NUMERIC(20,4) NOT NULL,
  lot_ids_affected      UUID[]       NOT NULL,
  status                TEXT         NOT NULL,
  block_until           TIMESTAMPTZ  NULL,
  attached_to_lot_id    UUID         NULL REFERENCES public.longshort_lots(lot_id),
  outcome               TEXT         NOT NULL,
  disallowed_amount     NUMERIC(20,4) NULL,
  source_lot_ids        UUID[]       NOT NULL,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT wash_sale_events_pkey PRIMARY KEY (operator_id, event_id),
  CONSTRAINT wash_sale_events_status_check
    CHECK (status IN ('block_active','disallowed_loss_attached','expired')),
  CONSTRAINT wash_sale_events_outcome_check
    CHECK (outcome IN ('block_active','disallowed_loss_attached')),
  -- Mutual-exclusion: block_active carries block_until + NULL attached_to_lot_id;
  -- disallowed_loss_attached carries attached_to_lot_id + NULL block_until.
  CONSTRAINT wash_sale_events_mutex_check CHECK (
    (status = 'block_active'             AND block_until IS NOT NULL AND attached_to_lot_id IS NULL)
    OR
    (status = 'disallowed_loss_attached' AND attached_to_lot_id IS NOT NULL AND block_until IS NULL)
    OR
    (status = 'expired')
  )
);

GRANT SELECT ON public.wash_sale_events TO authenticated;
GRANT ALL ON public.wash_sale_events TO service_role;

ALTER TABLE public.wash_sale_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wash_sale_events_select_longshort_view"
  ON public.wash_sale_events FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

CREATE POLICY "wash_sale_events_service_role_all"
  ON public.wash_sale_events FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS wash_sale_events_symbol_status_block_until_idx
  ON public.wash_sale_events (symbol, status, block_until);

CREATE INDEX IF NOT EXISTS wash_sale_events_attached_to_lot_id_idx
  ON public.wash_sale_events (attached_to_lot_id)
  WHERE attached_to_lot_id IS NOT NULL;

CREATE TRIGGER wash_sale_events_set_updated_at
  BEFORE UPDATE ON public.wash_sale_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- (2) wash_sale_pending_review ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wash_sale_pending_review (
  pending_id            UUID         NOT NULL DEFAULT gen_random_uuid(),
  operator_id           UUID         NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  symbol                TEXT         NOT NULL,
  flagged_ts            TIMESTAMPTZ  NOT NULL,
  context               TEXT         NOT NULL,
  source_lot_ids        UUID[]       NOT NULL,
  internal_pnl          NUMERIC(20,4) NOT NULL,
  broker_pnl            NUMERIC(20,4) NULL,
  verify_outcome        TEXT         NULL,
  status                TEXT         NOT NULL DEFAULT 'open',
  resolution_event_id   UUID         NULL,
  resolved_at           TIMESTAMPTZ  NULL,
  resolved_by           UUID         NULL,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT wash_sale_pending_review_pkey PRIMARY KEY (operator_id, pending_id),
  CONSTRAINT wash_sale_pending_review_context_check
    CHECK (context IN ('full_exit','trim')),
  CONSTRAINT wash_sale_pending_review_status_check
    CHECK (status IN ('open','resolved_wrote_event','resolved_broker_error')),
  CONSTRAINT wash_sale_pending_review_resolution_fk
    FOREIGN KEY (operator_id, resolution_event_id)
    REFERENCES public.wash_sale_events (operator_id, event_id)
);

GRANT SELECT ON public.wash_sale_pending_review TO authenticated;
GRANT ALL ON public.wash_sale_pending_review TO service_role;

ALTER TABLE public.wash_sale_pending_review ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wash_sale_pending_review_select_longshort_view"
  ON public.wash_sale_pending_review FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

CREATE POLICY "wash_sale_pending_review_service_role_all"
  ON public.wash_sale_pending_review FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS wash_sale_pending_review_symbol_status_idx
  ON public.wash_sale_pending_review (symbol, status);

CREATE TRIGGER wash_sale_pending_review_set_updated_at
  BEFORE UPDATE ON public.wash_sale_pending_review
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
