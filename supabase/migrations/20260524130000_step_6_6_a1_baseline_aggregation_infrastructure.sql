-- MIG-047 — FP-006 sub-step 6.6
-- A1 sustained-anomaly baseline aggregation infrastructure per CROSSWIND §10.4 + §11.6.

-- View 1: daily aggregation per call_name per outcome
CREATE OR REPLACE VIEW public.reconciliation_events_daily_agg AS
SELECT
  date_trunc('day', ts) AS bucket_day,
  call_name,
  outcome,
  count(*) AS event_count
FROM public.reconciliation_events
GROUP BY date_trunc('day', ts), call_name, outcome;

-- View 2: weekly aggregation per call_name per outcome
CREATE OR REPLACE VIEW public.reconciliation_events_weekly_agg AS
SELECT
  date_trunc('week', ts) AS bucket_week,
  call_name,
  outcome,
  count(*) AS event_count
FROM public.reconciliation_events
GROUP BY date_trunc('week', ts), call_name, outcome;

-- View 3: monthly aggregation per call_name per outcome
CREATE OR REPLACE VIEW public.reconciliation_events_monthly_agg AS
SELECT
  date_trunc('month', ts) AS bucket_month,
  call_name,
  outcome,
  count(*) AS event_count
FROM public.reconciliation_events
GROUP BY date_trunc('month', ts), call_name, outcome;

-- Function: baseline-vs-current comparison per §11.6 sustained-anomaly kill condition
-- Excludes 'expected_divergence_handled' + 'false_positive_within_tolerance' per §11.6 verbatim.
CREATE OR REPLACE FUNCTION public.compare_reconciliation_baseline(
  p_call_name text,
  p_outcome reconciliation_outcome,
  p_window_days integer DEFAULT 7,
  p_baseline_days integer DEFAULT 90
)
RETURNS TABLE (
  current_rate_per_day numeric,
  baseline_rate_per_day numeric,
  ratio_current_vs_baseline numeric,
  exceeds_3x_threshold boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH
  current_window AS (
    SELECT count(*)::numeric / GREATEST(p_window_days, 1)::numeric AS rate
    FROM public.reconciliation_events
    WHERE call_name = p_call_name
      AND outcome = p_outcome
      AND outcome NOT IN ('expected_divergence_handled', 'false_positive_within_tolerance')
      AND ts >= now() - (p_window_days || ' days')::interval
  ),
  baseline_window AS (
    SELECT count(*)::numeric / GREATEST(p_baseline_days, 1)::numeric AS rate
    FROM public.reconciliation_events
    WHERE call_name = p_call_name
      AND outcome = p_outcome
      AND outcome NOT IN ('expected_divergence_handled', 'false_positive_within_tolerance')
      AND ts >= now() - (p_baseline_days || ' days')::interval
      AND ts <  now() - (p_window_days || ' days')::interval
  )
  SELECT
    c.rate AS current_rate_per_day,
    b.rate AS baseline_rate_per_day,
    CASE WHEN b.rate = 0 THEN NULL ELSE c.rate / b.rate END AS ratio_current_vs_baseline,
    CASE WHEN b.rate = 0 THEN false ELSE (c.rate / b.rate) > 3.0 END AS exceeds_3x_threshold
  FROM current_window c CROSS JOIN baseline_window b;
$$;

-- Grant SELECT on views to authenticated (longshort.view permission gate at view level not required;
-- underlying RLS on reconciliation_events already restricts to longshort.view-bearing users)
GRANT SELECT ON public.reconciliation_events_daily_agg   TO authenticated;
GRANT SELECT ON public.reconciliation_events_weekly_agg  TO authenticated;
GRANT SELECT ON public.reconciliation_events_monthly_agg TO authenticated;
GRANT EXECUTE ON FUNCTION public.compare_reconciliation_baseline(text, reconciliation_outcome, integer, integer) TO authenticated;

-- Per H1a precedent (INC-19): SECURITY INVOKER (not DEFINER); REVOKE from PUBLIC + anon
REVOKE EXECUTE ON FUNCTION public.compare_reconciliation_baseline(text, reconciliation_outcome, integer, integer) FROM PUBLIC, anon;
