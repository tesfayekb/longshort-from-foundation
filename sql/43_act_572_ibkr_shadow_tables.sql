-- sql/43 — ACT-572 skeleton: IBKR shadow lane isolated tables.
-- MIG ledger row will be added in docs/07-reference/database-migration-ledger.md
-- alongside this file (next-turn ledger sweep).
--
-- Design (charter §2):
--   - Complete schema isolation from money-path tables (no FKs into
--     overshoot_lots / overshoot_events / overshoot_equity_snapshots).
--   - service_role writes ONLY (edge fn service key). authenticated
--     users get SELECT (operator read via UI/read-only queries).
--   - RLS enabled; no policy exposes writes to authenticated/anon.
--   - Every write row carries mirror_of_alpaca_client_order_id + SOURCE_VERSION.
--
-- Idempotency (D3): every CREATE uses IF NOT EXISTS.
-- No DROPs, no destructive ALTERs.

-- =========================================================================
-- ibkr_shadow_lots — mirror of overshoot_lots (subset of columns; own PK)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.ibkr_shadow_lots (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mirror_of_alpaca_lot_id           uuid NOT NULL,
  symbol                            text NOT NULL,
  side                              text NOT NULL CHECK (side IN ('long','short')),  -- INC-138 lowercase invariant
  qty                               numeric NOT NULL,
  ibkr_cost_basis                   numeric,
  ibkr_entry_ts                     timestamptz,
  status                            text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','cancelled','errored')),
  ibkr_source_version               text NOT NULL,
  notes                             text,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mirror_of_alpaca_lot_id)
);

GRANT SELECT ON public.ibkr_shadow_lots TO authenticated;
GRANT ALL    ON public.ibkr_shadow_lots TO service_role;

ALTER TABLE public.ibkr_shadow_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ibkr_shadow_lots select operator"
  ON public.ibkr_shadow_lots FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));

-- =========================================================================
-- ibkr_shadow_orders — every IBKR submit attempt (accepted or refused)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.ibkr_shadow_orders (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mirror_of_alpaca_client_order_id  text NOT NULL,
  mirror_of_alpaca_lot_id           uuid,
  mirror_reason                     text NOT NULL CHECK (mirror_reason IN ('admit','exit_senior','exit_morning','exit_kill')),
  symbol                            text NOT NULL,
  side                              text NOT NULL CHECK (side IN ('long','short')),
  submitted_qty                     numeric NOT NULL,
  ibkr_order_id                     text,
  ibkr_submit_ts                    timestamptz,
  ibkr_fill_ts                      timestamptz,
  ibkr_fill_px                      numeric,
  ibkr_fill_qty                     numeric,
  status                            text NOT NULL,
  refusal_reason                    text,
  ibkr_source_version               text NOT NULL,
  raw_response                      jsonb,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mirror_of_alpaca_client_order_id, mirror_reason)  -- idempotency key
);

GRANT SELECT ON public.ibkr_shadow_orders TO authenticated;
GRANT ALL    ON public.ibkr_shadow_orders TO service_role;

ALTER TABLE public.ibkr_shadow_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ibkr_shadow_orders select operator"
  ON public.ibkr_shadow_orders FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));

-- =========================================================================
-- ibkr_shadow_equity — nightly ledger snapshot (mirror of overshoot_equity_snapshots)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.ibkr_shadow_equity (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of_session_date                date NOT NULL,
  ibkr_cash                         numeric,
  ibkr_equity                       numeric,
  ibkr_gross_position_value         numeric,
  ibkr_source_version               text NOT NULL,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (as_of_session_date)
);

GRANT SELECT ON public.ibkr_shadow_equity TO authenticated;
GRANT ALL    ON public.ibkr_shadow_equity TO service_role;

ALTER TABLE public.ibkr_shadow_equity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ibkr_shadow_equity select operator"
  ON public.ibkr_shadow_equity FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));

-- =========================================================================
-- ibkr_shadow_reconciliation_events — typed-logged divergences ONLY
-- (NEVER pages MEDIUM+ on the primary rail — charter §1.5).
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.ibkr_shadow_reconciliation_events (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of_session_date                date NOT NULL,
  divergence_kind                   text NOT NULL,   -- e.g. 'position_qty_mismatch' | 'cash_delta_over_tolerance'
  symbol                            text,
  alpaca_value                      jsonb,
  ibkr_value                        jsonb,
  severity                          text NOT NULL DEFAULT 'shadow_low' CHECK (severity IN ('shadow_low','shadow_medium','shadow_high')),
  ibkr_source_version               text NOT NULL,
  notes                             text,
  created_at                        timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ibkr_shadow_reconciliation_events TO authenticated;
GRANT ALL    ON public.ibkr_shadow_reconciliation_events TO service_role;

ALTER TABLE public.ibkr_shadow_reconciliation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ibkr_shadow_recon_events select operator"
  ON public.ibkr_shadow_reconciliation_events FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));

-- =========================================================================
-- Kill-switch seed — dormant by default (charter §2 + §4 operator gate)
-- =========================================================================
INSERT INTO public.system_config (key, value, description)
VALUES (
  'ibkr_shadow_enabled',
  to_jsonb(false),
  'ACT-572 IBKR shadow-lane kill-switch. Default false; flipped to true only by operator once §4 TO-DO complete (paper account + gateway URL + 5 secrets). Primary money-path lane has NO reference to this flag.'
)
ON CONFLICT (key) DO NOTHING;