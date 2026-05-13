-- MIG-022: audit_logs.correlation_id fast trace lookup index — idempotent guard + DDL self-check.
-- PLAN-AUTH-SUDO-001 / DEC-029 / FP-003 / RW-019 / RW-020.
-- Safe to re-run; index already exists from MIG-001 (sql/01_rbac_schema.sql).

CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation_id
  ON public.audit_logs (correlation_id)
  WHERE correlation_id IS NOT NULL;

COMMENT ON INDEX public.idx_audit_logs_correlation_id IS
  'Partial btree index on audit_logs.correlation_id for fast cross-system trace lookup (sudo-mode and other correlated audit chains). Owner: audit-logging module. PLAN-AUTH-SUDO-001 / RW-019 / RW-020.';

-- DDL self-check — fail the migration if the canonical shape is missing/wrong.
DO $$
DECLARE
  _idxdef TEXT;
BEGIN
  SELECT indexdef INTO _idxdef
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename  = 'audit_logs'
    AND indexname  = 'idx_audit_logs_correlation_id';

  IF _idxdef IS NULL THEN
    RAISE EXCEPTION 'DDL check failed: index public.idx_audit_logs_correlation_id is missing on audit_logs';
  END IF;

  IF _idxdef NOT LIKE '%USING btree (correlation_id)%' THEN
    RAISE EXCEPTION 'DDL check failed: idx_audit_logs_correlation_id must be a btree on (correlation_id). Got: %', _idxdef;
  END IF;

  IF _idxdef NOT LIKE '%WHERE (correlation_id IS NOT NULL)%' THEN
    RAISE EXCEPTION 'DDL check failed: idx_audit_logs_correlation_id must be partial WHERE correlation_id IS NOT NULL. Got: %', _idxdef;
  END IF;

  RAISE NOTICE 'DDL check passed: %', _idxdef;
END $$;