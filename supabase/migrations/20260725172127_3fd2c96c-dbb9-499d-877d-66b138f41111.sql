
CREATE TABLE IF NOT EXISTS public.ibkr_shadow_lots (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mirror_of_alpaca_lot_id           uuid NOT NULL,
  symbol                            text NOT NULL,
  side                              text NOT NULL CHECK (side IN ('long','short')),
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
DROP POLICY IF EXISTS "ibkr_shadow_lots select operator" ON public.ibkr_shadow_lots;
CREATE POLICY "ibkr_shadow_lots select operator"
  ON public.ibkr_shadow_lots FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));

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
  UNIQUE (mirror_of_alpaca_client_order_id, mirror_reason)
);
GRANT SELECT ON public.ibkr_shadow_orders TO authenticated;
GRANT ALL    ON public.ibkr_shadow_orders TO service_role;
ALTER TABLE public.ibkr_shadow_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ibkr_shadow_orders select operator" ON public.ibkr_shadow_orders;
CREATE POLICY "ibkr_shadow_orders select operator"
  ON public.ibkr_shadow_orders FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));

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
DROP POLICY IF EXISTS "ibkr_shadow_equity select operator" ON public.ibkr_shadow_equity;
CREATE POLICY "ibkr_shadow_equity select operator"
  ON public.ibkr_shadow_equity FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));

CREATE TABLE IF NOT EXISTS public.ibkr_shadow_reconciliation_events (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of_session_date                date NOT NULL,
  divergence_kind                   text NOT NULL,
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
DROP POLICY IF EXISTS "ibkr_shadow_recon_events select operator" ON public.ibkr_shadow_reconciliation_events;
CREATE POLICY "ibkr_shadow_recon_events select operator"
  ON public.ibkr_shadow_reconciliation_events FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'overshoot.view'));

INSERT INTO public.system_config (key, value, description)
VALUES (
  'ibkr_shadow_enabled',
  to_jsonb(false),
  'ACT-572 IBKR shadow-lane kill-switch. Default false; flipped to true only by operator once §4 TO-DO complete (paper account + gateway URL + 5 secrets). Primary money-path lane has NO reference to this flag.'
)
ON CONFLICT (key) DO NOTHING;
