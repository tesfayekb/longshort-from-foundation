-- MIG-100 — FP-052 Phase 3.M (shadow measurement) foundation
-- Three additive tables; live 3.0c path (combiner_book / combiner_rankings /
-- combiner_feature_vectors / combiner_model_registry) is byte-untouched.
-- RLS template cloned verbatim from MIG-099 combiner_rankings/combiner_book:
-- GRANT SELECT TO authenticated + GRANT ALL TO service_role + ENABLE RLS +
-- 1 PERMISSIVE SELECT on longshort.view + 3 RESTRICTIVE per-command deny-writes.
-- No anon, no operator-scoped read (DEC-042). Idempotent.
-- Resolution rule for DW-109 pre-registered at DEC-059.

BEGIN;

-- =========================================================================
-- 1. combiner_book_shadow — adds variant to PK + UNIQUE so 12 variants coexist
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.combiner_book_shadow (
  operator_id      uuid        NOT NULL,
  as_of_date       date        NOT NULL,
  variant          text        NOT NULL,
  inclusion_rule   text        NOT NULL CHECK (inclusion_rule IN ('gated','criticals_required','no_gate')),
  k                integer     NOT NULL CHECK (k >= 0),
  side             text        NOT NULL CHECK (side IN ('long','short')),
  rank_within_side integer     NOT NULL CHECK (rank_within_side >= 1),
  ticker           text        NOT NULL,
  score            numeric     NOT NULL,
  ranker_source    text        NOT NULL,
  computed_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, as_of_date, variant, side, rank_within_side),
  UNIQUE (operator_id, as_of_date, variant, ticker)
);

GRANT SELECT ON public.combiner_book_shadow TO authenticated;
GRANT ALL    ON public.combiner_book_shadow TO service_role;

ALTER TABLE public.combiner_book_shadow ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS combiner_book_shadow_read_longshort_view ON public.combiner_book_shadow;
CREATE POLICY combiner_book_shadow_read_longshort_view
  ON public.combiner_book_shadow FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS combiner_book_shadow_deny_insert ON public.combiner_book_shadow;
CREATE POLICY combiner_book_shadow_deny_insert
  ON public.combiner_book_shadow AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS combiner_book_shadow_deny_update ON public.combiner_book_shadow;
CREATE POLICY combiner_book_shadow_deny_update
  ON public.combiner_book_shadow AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS combiner_book_shadow_deny_delete ON public.combiner_book_shadow;
CREATE POLICY combiner_book_shadow_deny_delete
  ON public.combiner_book_shadow AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_combiner_book_shadow_operator_asof_variant
  ON public.combiner_book_shadow (operator_id, as_of_date, variant);

-- =========================================================================
-- 2. combiner_forward_returns — typed-absence; NO -999, ever
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.combiner_forward_returns (
  operator_id          uuid        NOT NULL,
  source_table         text        NOT NULL CHECK (source_table IN ('combiner_book','combiner_book_shadow')),
  variant              text        NOT NULL,
  seed_as_of_date      date        NOT NULL,
  ticker               text        NOT NULL,
  horizon_td           integer     NOT NULL CHECK (horizon_td IN (1,5,20)),
  side                 text        NOT NULL CHECK (side IN ('long','short')),
  seed_score           numeric,
  raw_return           numeric,
  side_signed_return   numeric,
  horizon_close_date   date,
  price_source_status  text        NOT NULL CHECK (price_source_status IN ('success','polygon_404','fetch_error')),
  computed_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operator_id, source_table, variant, seed_as_of_date, ticker, horizon_td),
  CONSTRAINT combiner_forward_returns_typed_absence_chk CHECK (
    (price_source_status = 'success'
       AND raw_return IS NOT NULL
       AND side_signed_return IS NOT NULL
       AND horizon_close_date IS NOT NULL)
    OR
    (price_source_status <> 'success'
       AND raw_return IS NULL
       AND side_signed_return IS NULL)
  )
);

GRANT SELECT ON public.combiner_forward_returns TO authenticated;
GRANT ALL    ON public.combiner_forward_returns TO service_role;

ALTER TABLE public.combiner_forward_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS combiner_forward_returns_read_longshort_view ON public.combiner_forward_returns;
CREATE POLICY combiner_forward_returns_read_longshort_view
  ON public.combiner_forward_returns FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS combiner_forward_returns_deny_insert ON public.combiner_forward_returns;
CREATE POLICY combiner_forward_returns_deny_insert
  ON public.combiner_forward_returns AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS combiner_forward_returns_deny_update ON public.combiner_forward_returns;
CREATE POLICY combiner_forward_returns_deny_update
  ON public.combiner_forward_returns AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS combiner_forward_returns_deny_delete ON public.combiner_forward_returns;
CREATE POLICY combiner_forward_returns_deny_delete
  ON public.combiner_forward_returns AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_combiner_forward_returns_seed_horizon
  ON public.combiner_forward_returns (operator_id, seed_as_of_date, horizon_td);

CREATE INDEX IF NOT EXISTS idx_combiner_forward_returns_variant
  ON public.combiner_forward_returns (operator_id, source_table, variant, seed_as_of_date);

-- =========================================================================
-- 3. combiner_shadow_variant_config — config-driven family (12 seeded)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.combiner_shadow_variant_config (
  variant         text        PRIMARY KEY,
  inclusion_rule  text        NOT NULL CHECK (inclusion_rule IN ('gated','criticals_required','no_gate')),
  k               integer     NOT NULL CHECK (k >= 0),
  active          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.combiner_shadow_variant_config TO authenticated;
GRANT ALL    ON public.combiner_shadow_variant_config TO service_role;

ALTER TABLE public.combiner_shadow_variant_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS combiner_shadow_variant_config_read_longshort_view ON public.combiner_shadow_variant_config;
CREATE POLICY combiner_shadow_variant_config_read_longshort_view
  ON public.combiner_shadow_variant_config FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'longshort.view'));

DROP POLICY IF EXISTS combiner_shadow_variant_config_deny_insert ON public.combiner_shadow_variant_config;
CREATE POLICY combiner_shadow_variant_config_deny_insert
  ON public.combiner_shadow_variant_config AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS combiner_shadow_variant_config_deny_update ON public.combiner_shadow_variant_config;
CREATE POLICY combiner_shadow_variant_config_deny_update
  ON public.combiner_shadow_variant_config AS RESTRICTIVE FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS combiner_shadow_variant_config_deny_delete ON public.combiner_shadow_variant_config;
CREATE POLICY combiner_shadow_variant_config_deny_delete
  ON public.combiner_shadow_variant_config AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

-- Seed the 12 variants: {gated, criticals_required, no_gate} × {0, 3, 5, 10}
INSERT INTO public.combiner_shadow_variant_config (variant, inclusion_rule, k, active) VALUES
  ('gated_k0',               'gated',               0,  true),
  ('gated_k3',               'gated',               3,  true),
  ('gated_k5',               'gated',               5,  true),
  ('gated_k10',              'gated',               10, true),
  ('criticals_required_k0',  'criticals_required',  0,  true),
  ('criticals_required_k3',  'criticals_required',  3,  true),
  ('criticals_required_k5',  'criticals_required',  5,  true),
  ('criticals_required_k10', 'criticals_required',  10, true),
  ('no_gate_k0',             'no_gate',             0,  true),
  ('no_gate_k3',             'no_gate',             3,  true),
  ('no_gate_k5',             'no_gate',             5,  true),
  ('no_gate_k10',            'no_gate',             10, true)
ON CONFLICT (variant) DO NOTHING;

COMMIT;