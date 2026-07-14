
-- ACT-523: API provider registry (superadmin-only)

CREATE TABLE IF NOT EXISTS public.api_provider_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  product_tier text NOT NULL,
  endpoint_classes text[] NOT NULL DEFAULT '{}',
  env_key_names text[] NOT NULL DEFAULT '{}',
  consumers text[] NOT NULL DEFAULT '{}',
  strategy text NOT NULL,
  feeds text NOT NULL,
  freshness_source text NOT NULL,
  cost_surface boolean NOT NULL DEFAULT true,
  cost_monthly_usd numeric(10,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, product_tier)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_provider_registry TO authenticated;
GRANT ALL ON public.api_provider_registry TO service_role;

ALTER TABLE public.api_provider_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "superadmin read api_provider_registry"
  ON public.api_provider_registry FOR SELECT
  TO authenticated
  USING (public.is_superadmin(auth.uid()));

CREATE POLICY "superadmin write api_provider_registry"
  ON public.api_provider_registry FOR UPDATE
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));

CREATE POLICY "superadmin insert api_provider_registry"
  ON public.api_provider_registry FOR INSERT
  TO authenticated
  WITH CHECK (public.is_superadmin(auth.uid()));

CREATE POLICY "superadmin delete api_provider_registry"
  ON public.api_provider_registry FOR DELETE
  TO authenticated
  USING (public.is_superadmin(auth.uid()));

DROP TRIGGER IF EXISTS trg_api_provider_registry_updated_at ON public.api_provider_registry;
CREATE TRIGGER trg_api_provider_registry_updated_at
  BEFORE UPDATE ON public.api_provider_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Freshness derived from declared telemetry sources. Best-effort per row;
-- unknown/none sources return NULL. Superadmin-only per capability gate.
CREATE OR REPLACE FUNCTION public.get_api_provider_freshness()
RETURNS TABLE(provider text, product_tier text, freshness_source text, last_seen_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_last timestamptz;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'get_api_provider_freshness requires superadmin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR r IN SELECT id, api_provider_registry.provider, api_provider_registry.product_tier, api_provider_registry.freshness_source
             FROM public.api_provider_registry
  LOOP
    v_last := NULL;
    BEGIN
      IF r.freshness_source = 'overshoot_daily_bars.created_at' THEN
        SELECT MAX(created_at) INTO v_last FROM public.overshoot_daily_bars;
      ELSIF r.freshness_source = 'overshoot_entry_runs.created_at' THEN
        SELECT MAX(created_at) INTO v_last FROM public.overshoot_entry_runs;
      ELSIF r.freshness_source = 'overshoot_earnings_calendar.fmp' THEN
        SELECT MAX(created_at) INTO v_last FROM public.overshoot_earnings_calendar WHERE source = 'fmp';
      ELSIF r.freshness_source = 'overshoot_earnings_calendar.finnhub' THEN
        SELECT MAX(created_at) INTO v_last FROM public.overshoot_earnings_calendar WHERE source = 'finnhub';
      ELSIF r.freshness_source = 'longshort_equity_snapshots.ts' THEN
        SELECT MAX(ts) INTO v_last FROM public.longshort_equity_snapshots;
      ELSIF r.freshness_source = 'overshoot_equity_snapshots.fetched_at' THEN
        SELECT MAX(fetched_at) INTO v_last FROM public.overshoot_equity_snapshots;
      ELSIF r.freshness_source = 'overshoot_alert_dispatch.dispatched_at' THEN
        SELECT MAX(dispatched_at) INTO v_last FROM public.overshoot_alert_dispatch;
      ELSIF r.freshness_source = 'insider_form4_rows.ingested_at' THEN
        SELECT MAX(ingested_at) INTO v_last FROM public.insider_form4_rows;
      ELSIF r.freshness_source = 'indirect_audit' THEN
        SELECT MAX(created_at) INTO v_last FROM public.audit_logs
          WHERE action ILIKE '%turnstile%' OR action ILIKE 'auth.%';
      ELSIF r.freshness_source = 'indirect_via_resend' THEN
        SELECT MAX(dispatched_at) INTO v_last FROM public.overshoot_alert_dispatch;
      ELSE
        v_last := NULL;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_last := NULL;
    END;

    provider := r.provider;
    product_tier := r.product_tier;
    freshness_source := r.freshness_source;
    last_seen_at := v_last;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_api_provider_freshness() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_api_provider_freshness() TO authenticated;

-- Seed 12 providers (idempotent)
INSERT INTO public.api_provider_registry
  (provider, product_tier, endpoint_classes, env_key_names, consumers, strategy, feeds, freshness_source, cost_surface, notes)
VALUES
  ('Polygon (main)','Stocks Advanced (real-time)',
    ARRAY['/v2/aggs/*','/v3/reference/tickers','/v2/snapshot/*'],
    ARRAY['POLYGON_API_KEY'],
    ARRAY['longshort-* edge fns','overshoot backfill/detection'],
    'longshort+overshoot',
    'Signal inputs, universe enrichment, forward-return labels, quote source, backfill/SI',
    'overshoot_daily_bars.created_at', true, NULL),
  ('Polygon (prod-probe)','Stocks Advanced (real-time)',
    ARRAY['/v2/snapshot/locale/us/markets/stocks/tickers/{sym}'],
    ARRAY['POLYGON_API_KEY_PROD_PROBE'],
    ARRAY['overshoot-entry-run','overshoot-exit-run','overshoot-detection-run'],
    'overshoot',
    'Live execution price reads',
    'overshoot_entry_runs.created_at', true, NULL),
  ('FMP','/stable/*',
    ARRAY['Earnings calendar','M&A','Grades','Price-target feed'],
    ARRAY['FMP_API_KEY'],
    ARRAY['longshort-catalyst-compute','overshoot-detection-run','earnings-calendar fetcher','price-target revision'],
    'longshort+overshoot',
    'Catalyst signals, analyst revisions, earnings calendar',
    'overshoot_earnings_calendar.fmp', true, NULL),
  ('Finnhub','/api/v1/*',
    ARRAY['Earnings calendar','EPS estimates'],
    ARRAY['FINNHUB_API_KEY'],
    ARRAY['longshort-catalyst-compute','overshoot-backfill-earnings'],
    'longshort+overshoot',
    'Earnings calendar, EPS estimates, corroboration',
    'overshoot_earnings_calendar.finnhub', true, NULL),
  ('Alpaca (longshort)','Paper Trading',
    ARRAY['paper-api.alpaca.markets/*'],
    ARRAY['ALPACA_PAPER_KEY','ALPACA_PAPER_SECRET'],
    ARRAY['_shared/longshort-broker/alpaca-paper-client.ts','alpaca-paper-connection-test'],
    'longshort',
    'Broker truth (fills, positions, equity). Data fenced per INC-77.',
    'longshort_equity_snapshots.ts', true, NULL),
  ('Alpaca (overshoot)','Paper Trading',
    ARRAY['paper-api.alpaca.markets/*'],
    ARRAY['ALPACA_PAPER_KEY_OVERSHOOT','ALPACA_PAPER_SECRET_OVERSHOOT'],
    ARRAY['_shared/overshoot-broker/alpaca-paper-client.ts','overshoot-entry-run'],
    'overshoot',
    'Broker truth for overshoot sleeve',
    'overshoot_equity_snapshots.fetched_at', true, NULL),
  ('Tradier','Dormant',
    ARRAY['(not currently called)'],
    ARRAY['TRADIER_API_KEY'],
    ARRAY['(no live consumers)'],
    'shelved',
    'Would feed real IV/Greeks if F1–F4 activate. ACT-520 SHELF-UNLESS-REAL-IV.',
    'none', true, 'Dormant per ACT-520 shelf verdict.'),
  ('Resend','Transactional email',
    ARRAY['connector-gateway.lovable.dev/resend/emails'],
    ARRAY['(managed by connector)'],
    ARRAY['overshoot-alerts-dispatcher'],
    'platform',
    'Alert delivery, reconciliation notifications',
    'overshoot_alert_dispatch.dispatched_at', true, NULL),
  ('SEC EDGAR','Public filings',
    ARRAY['sec.gov/*'],
    ARRAY['EDGAR_CONTACT_EMAIL'],
    ARRAY['insider-discovery workflow','_shared insider fetchers'],
    'longshort',
    'Insider-buying signals (Form 4)',
    'insider_form4_rows.ingested_at', true, 'Free (User-Agent identity only).'),
  ('Cloudflare Turnstile','CAPTCHA',
    ARRAY['challenges.cloudflare.com'],
    ARRAY['TURNSTILE_SECRET_KEY','TURNSTILE_SITE_KEY'],
    ARRAY['sign-in','invite acceptance'],
    'platform',
    'Bot mitigation on auth flows',
    'indirect_audit', false, 'Platform infra — free tier.'),
  ('Lovable AI Gateway','Meta-gateway auth',
    ARRAY['connector-gateway.lovable.dev/*'],
    ARRAY['LOVABLE_API_KEY'],
    ARRAY['(indirect via Resend path)'],
    'platform',
    'Gateway auth header for connector calls',
    'indirect_via_resend', false, 'Platform infra.'),
  ('Supabase (self)','Platform',
    ARRAY['REST','Auth','Storage','Realtime'],
    ARRAY['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'],
    ARRAY['(everything)'],
    'platform',
    'Backend platform — excluded from external-API-cost view by default',
    'n_a_self', false, 'Self — billed by Supabase directly.')
ON CONFLICT (provider, product_tier) DO NOTHING;
