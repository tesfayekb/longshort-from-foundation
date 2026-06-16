-- MIG-099 — FP-052 (3.0a) Combiner schema (ACT-233)
-- Five public.combiner_* tables consumed by Phase-4 portfolio sizing.
-- Schema reconciled + locked via dual independent investigation at ACT-232
-- (R1 two-ranking shape per CROSSWIND §1.4/§6.1/§6.2; R3a status text+CHECK
-- matching signal_registry precedent — no new enum type; R3b book_published
-- event added at 3.0a). RLS template cloned verbatim from MIG-075
-- (20260608152448_*.sql signal_registry): GRANT SELECT TO authenticated +
-- GRANT ALL TO service_role + ENABLE RLS + permissive read on
-- longshort.view + 3 RESTRICTIVE per-command deny-writes. No anon, no
-- operator-scoped read (DEC-042). Idempotent via IF NOT EXISTS + DROP POLICY
-- IF EXISTS. NO _shared/, NO edge functions, NO src/ (those are 3.0b–d).
-- NO sentinel literal -999 (ADR-008 assembler is 3.0b). NO model_version
-- columns on combiner_rankings (3.2 adds NULLable per-side).

BEGIN;

-- =========================================================================
-- 1. combiner_feature_vectors
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.combiner_feature_vectors (
  operator_id      uuid        NOT NULL,
  as_of_date       date        NOT NULL,
  ticker           text        NOT NULL,
  features         jsonb       NOT NULL CHECK (jsonb_typeof(features) = 'object'),
  gics_sector      text,
  coverage_count   integer     NOT NULL,
  excluded_reason  text        CHECK (
                       excluded_reason IS NULL
                    OR excluded_reason IN (
                         'missing_critical_signal_6',
                         'missing_critical_signal_7',
                         'below_coverage_threshold'
                       )
                    ),
  computed_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, as_of_date, ticker)
);

GRANT SELECT ON public.combiner_feature_vectors TO authenticated;
GRANT ALL    ON public.combiner_feature_vectors TO service_role;

ALTER TABLE public.combiner_feature_vectors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS combiner_feature_vectors_read_longshort_view ON public.combiner_feature_vectors;
CREATE POLICY combiner_feature_vectors_read_longshort_view
  ON public.combiner_feature_vectors FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS combiner_feature_vectors_deny_insert ON public.combiner_feature_vectors;
CREATE POLICY combiner_feature_vectors_deny_insert
  ON public.combiner_feature_vectors AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS combiner_feature_vectors_deny_update ON public.combiner_feature_vectors;
CREATE POLICY combiner_feature_vectors_deny_update
  ON public.combiner_feature_vectors AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS combiner_feature_vectors_deny_delete ON public.combiner_feature_vectors;
CREATE POLICY combiner_feature_vectors_deny_delete
  ON public.combiner_feature_vectors AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_combiner_feature_vectors_operator_asof
  ON public.combiner_feature_vectors (operator_id, as_of_date);

-- =========================================================================
-- 2. combiner_rankings — two-ranking shape (R1)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.combiner_rankings (
  operator_id    uuid        NOT NULL,
  as_of_date     date        NOT NULL,
  ticker         text        NOT NULL,
  long_score     numeric     NOT NULL,
  short_score    numeric     NOT NULL,
  long_rank      integer     NOT NULL CHECK (long_rank  >= 1),
  short_rank     integer     NOT NULL CHECK (short_rank >= 1),
  ranker_source  text        NOT NULL,
  gics_sector    text,
  computed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, as_of_date, ticker)
);

GRANT SELECT ON public.combiner_rankings TO authenticated;
GRANT ALL    ON public.combiner_rankings TO service_role;

ALTER TABLE public.combiner_rankings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS combiner_rankings_read_longshort_view ON public.combiner_rankings;
CREATE POLICY combiner_rankings_read_longshort_view
  ON public.combiner_rankings FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS combiner_rankings_deny_insert ON public.combiner_rankings;
CREATE POLICY combiner_rankings_deny_insert
  ON public.combiner_rankings AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS combiner_rankings_deny_update ON public.combiner_rankings;
CREATE POLICY combiner_rankings_deny_update
  ON public.combiner_rankings AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS combiner_rankings_deny_delete ON public.combiner_rankings;
CREATE POLICY combiner_rankings_deny_delete
  ON public.combiner_rankings AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_combiner_rankings_operator_asof_long
  ON public.combiner_rankings (operator_id, as_of_date, long_rank);
CREATE INDEX IF NOT EXISTS idx_combiner_rankings_operator_asof_short
  ON public.combiner_rankings (operator_id, as_of_date, short_rank);
CREATE INDEX IF NOT EXISTS idx_combiner_rankings_ranker_source_nonfallback
  ON public.combiner_rankings (ranker_source)
  WHERE ranker_source <> 'count_normalized_fallback';

-- =========================================================================
-- 3. combiner_book
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.combiner_book (
  operator_id      uuid        NOT NULL,
  as_of_date       date        NOT NULL,
  side             text        NOT NULL CHECK (side IN ('long','short')),
  rank_within_side integer     NOT NULL CHECK (rank_within_side >= 1),
  ticker           text        NOT NULL,
  score            numeric     NOT NULL,
  ranker_source    text        NOT NULL,
  computed_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, as_of_date, side, rank_within_side),
  UNIQUE (operator_id, as_of_date, ticker)
);

GRANT SELECT ON public.combiner_book TO authenticated;
GRANT ALL    ON public.combiner_book TO service_role;

ALTER TABLE public.combiner_book ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS combiner_book_read_longshort_view ON public.combiner_book;
CREATE POLICY combiner_book_read_longshort_view
  ON public.combiner_book FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS combiner_book_deny_insert ON public.combiner_book;
CREATE POLICY combiner_book_deny_insert
  ON public.combiner_book AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS combiner_book_deny_update ON public.combiner_book;
CREATE POLICY combiner_book_deny_update
  ON public.combiner_book AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS combiner_book_deny_delete ON public.combiner_book;
CREATE POLICY combiner_book_deny_delete
  ON public.combiner_book AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_combiner_book_operator_asof
  ON public.combiner_book (operator_id, as_of_date);

-- =========================================================================
-- 4. combiner_model_registry — status text+CHECK (R3a; no enum)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.combiner_model_registry (
  model_id      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key     text        NOT NULL,
  side          text        NOT NULL CHECK (side   IN ('long','short')),
  status        text        NOT NULL CHECK (status IN ('active','candidate','retired')),
  version       text        NOT NULL,
  artifact_uri  text,
  trained_at    timestamptz,
  promoted_at   timestamptz,
  retired_at    timestamptz,
  metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.combiner_model_registry TO authenticated;
GRANT ALL    ON public.combiner_model_registry TO service_role;

ALTER TABLE public.combiner_model_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS combiner_model_registry_read_longshort_view ON public.combiner_model_registry;
CREATE POLICY combiner_model_registry_read_longshort_view
  ON public.combiner_model_registry FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS combiner_model_registry_deny_insert ON public.combiner_model_registry;
CREATE POLICY combiner_model_registry_deny_insert
  ON public.combiner_model_registry AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS combiner_model_registry_deny_update ON public.combiner_model_registry;
CREATE POLICY combiner_model_registry_deny_update
  ON public.combiner_model_registry AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS combiner_model_registry_deny_delete ON public.combiner_model_registry;
CREATE POLICY combiner_model_registry_deny_delete
  ON public.combiner_model_registry AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- Single-active-per-side invariant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_combiner_model_registry_active_per_side
  ON public.combiner_model_registry (side) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_combiner_model_registry_status_side
  ON public.combiner_model_registry (status, side);

DROP TRIGGER IF EXISTS trg_combiner_model_registry_updated_at ON public.combiner_model_registry;
CREATE TRIGGER trg_combiner_model_registry_updated_at
  BEFORE UPDATE ON public.combiner_model_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================================
-- 5. combiner_shap_attribution — FK CASCADE to combiner_rankings
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.combiner_shap_attribution (
  operator_id   uuid        NOT NULL,
  as_of_date    date        NOT NULL,
  ticker        text        NOT NULL,
  attributions  jsonb       NOT NULL CHECK (jsonb_typeof(attributions) = 'object'),
  model_id      uuid        REFERENCES public.combiner_model_registry(model_id) ON DELETE SET NULL,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, as_of_date, ticker),
  FOREIGN KEY (operator_id, as_of_date, ticker)
    REFERENCES public.combiner_rankings (operator_id, as_of_date, ticker)
    ON DELETE CASCADE
);

GRANT SELECT ON public.combiner_shap_attribution TO authenticated;
GRANT ALL    ON public.combiner_shap_attribution TO service_role;

ALTER TABLE public.combiner_shap_attribution ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS combiner_shap_attribution_read_longshort_view ON public.combiner_shap_attribution;
CREATE POLICY combiner_shap_attribution_read_longshort_view
  ON public.combiner_shap_attribution FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS combiner_shap_attribution_deny_insert ON public.combiner_shap_attribution;
CREATE POLICY combiner_shap_attribution_deny_insert
  ON public.combiner_shap_attribution AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS combiner_shap_attribution_deny_update ON public.combiner_shap_attribution;
CREATE POLICY combiner_shap_attribution_deny_update
  ON public.combiner_shap_attribution AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS combiner_shap_attribution_deny_delete ON public.combiner_shap_attribution;
CREATE POLICY combiner_shap_attribution_deny_delete
  ON public.combiner_shap_attribution AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMIT;