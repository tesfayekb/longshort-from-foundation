-- FP-052 sub-step 3.3b-ii-A / ACT-287 / MIG-116
-- DEC-065 Clause 3 + Clause 4: storage.objects RLS for the
-- `combiner-models/` bucket + pg_cron 12-week retention purge of
-- artifacts for retired models.
--
-- BUCKET PROVISIONING IS OPERATOR-ONLY (Dashboard → Storage). This
-- migration sets ONLY the RLS policies + the purge cron; the bucket
-- itself MUST be created by the operator (3.3b-ii-B) before any
-- artifact lands. Until the bucket exists, the policies are inert
-- (no rows in storage.objects WHERE bucket_id='combiner-models').

-- ── Step 1: RLS policies on storage.objects scoped to combiner-models ──
-- DEC-065 Clause 4:
--   INSERT/UPDATE/DELETE = service_role only (trainer + purge cron)
--   SELECT               = has_permission(auth.uid(), 'longshort.view')
-- The bucket is private; no anon access.

DROP POLICY IF EXISTS "combiner-models: service_role write" ON storage.objects;
CREATE POLICY "combiner-models: service_role write"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'combiner-models')
WITH CHECK (bucket_id = 'combiner-models');

DROP POLICY IF EXISTS "combiner-models: longshort.view read" ON storage.objects;
CREATE POLICY "combiner-models: longshort.view read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'combiner-models'
  AND public.has_permission(auth.uid(), 'longshort.view')
);

-- ── Step 2: 12-week retention purge function (DEC-065 Clause 3) ──
-- For each combiner_model_registry row WHERE status='retired' AND
-- retired_at < now() - interval '12 weeks', DELETE the two storage
-- objects under `{model_id}/`. Registry row stays (audit trail);
-- only the artifact bytes are purged. Idempotent — re-running on
-- already-purged rows is a no-op (objects already gone).
--
-- SECURITY DEFINER + service_role-only — invoked exclusively by the
-- pg_cron schedule below; no authenticated caller path.

CREATE OR REPLACE FUNCTION public.purge_retired_combiner_artifacts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now           timestamptz := now();
  v_cutoff        timestamptz := v_now - interval '12 weeks';
  v_model         record;
  v_deleted_count integer := 0;
  v_models_purged integer := 0;
  v_audit_id      uuid;
BEGIN
  -- service_role only — the pg_cron schedule below runs as
  -- postgres/service_role; reject any other caller defensively.
  IF COALESCE(
       NULLIF(current_setting('request.jwt.claim.role', true), ''),
       NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
     ) IS DISTINCT FROM 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin')
  THEN
    RAISE EXCEPTION 'purge_retired_combiner_artifacts requires service_role / postgres'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR v_model IN
    SELECT model_id
    FROM public.combiner_model_registry
    WHERE status = 'retired'
      AND retired_at IS NOT NULL
      AND retired_at < v_cutoff
  LOOP
    -- Storage backend cleanup is wired via storage.objects DELETE
    -- triggers (Supabase storage stack). Rows under bucket_id =
    -- 'combiner-models' with name prefix '{model_id}/' get cleaned.
    DELETE FROM storage.objects
    WHERE bucket_id = 'combiner-models'
      AND name LIKE v_model.model_id::text || '/%';

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count > 0 THEN
      v_models_purged := v_models_purged + 1;

      INSERT INTO public.audit_logs (id, actor_id, action, target_type, target_id, metadata, created_at)
      VALUES (
        gen_random_uuid(),
        NULL,
        'combiner.artifact_purged',
        'combiner_model_registry',
        v_model.model_id::text,
        jsonb_build_object(
          'objects_deleted', v_deleted_count,
          'cutoff', v_cutoff,
          'reason', 'retention_12_weeks_exceeded'
        ),
        v_now
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'cutoff', v_cutoff,
    'models_purged', v_models_purged,
    'ran_at', v_now
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_retired_combiner_artifacts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_retired_combiner_artifacts() TO service_role;

COMMENT ON FUNCTION public.purge_retired_combiner_artifacts() IS
  'DEC-065 Clause 3 — 12-week retention purge for combiner model artifacts. '
  'Deletes storage.objects under bucket=combiner-models for combiner_model_registry rows '
  'with status=retired AND retired_at < now() - 12 weeks. Idempotent. Audited via combiner.artifact_purged.';

-- ── Step 3: pg_cron daily purge schedule ──
-- Daily at 04:15 UTC (off the combiner compute / signal cron hours).
-- pg_cron extension already enabled per the platform foundation.
SELECT cron.unschedule('longshort.combiner.artifact_retention_purge')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'longshort.combiner.artifact_retention_purge'
);

SELECT cron.schedule(
  'longshort.combiner.artifact_retention_purge',
  '15 4 * * *',
  $cron$SELECT public.purge_retired_combiner_artifacts();$cron$
);