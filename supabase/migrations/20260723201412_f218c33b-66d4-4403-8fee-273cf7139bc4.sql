-- DEC-504-4 AMENDMENT (2026-07-23, INC-129) — reschedule overshoot SI compute
-- from twice-monthly (0 21 1,15 * *) to DAILY Mon–Fri (0 21 * * 1-5).
-- Function is idempotent (D3): no-op fires on non-publication days are safe.
-- job_registry.schedule byte-matched in the SAME transaction so cron.job ↔
-- job_registry stay drift-free (§22.5 DRIFT class).

BEGIN;

-- (1) Alter cron.job schedule in place. cron.alter_job preserves the
--     existing command/database/username so no secret round-trip is needed.
SELECT cron.alter_job(
  job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'overshoot-short-interest-compute'),
  schedule := '0 21 * * 1-5'
);

-- (2) Byte-match job_registry.schedule (§22.5.1 drift guard).
UPDATE public.job_registry
   SET schedule   = '0 21 * * 1-5',
       updated_at = now()
 WHERE id = 'overshoot.short_interest.compute';

-- (3) §22.5.1 read-back — both rows MUST report the amended schedule.
DO $$
DECLARE
  v_cron_sched  text;
  v_reg_sched   text;
BEGIN
  SELECT schedule INTO v_cron_sched
    FROM cron.job WHERE jobname = 'overshoot-short-interest-compute';
  SELECT schedule INTO v_reg_sched
    FROM public.job_registry WHERE id = 'overshoot.short_interest.compute';

  IF v_cron_sched IS DISTINCT FROM '0 21 * * 1-5' THEN
    RAISE EXCEPTION 'cron.job.schedule mismatch post-alter: got %', v_cron_sched;
  END IF;
  IF v_reg_sched IS DISTINCT FROM '0 21 * * 1-5' THEN
    RAISE EXCEPTION 'job_registry.schedule mismatch post-alter: got %', v_reg_sched;
  END IF;
  IF v_cron_sched IS DISTINCT FROM v_reg_sched THEN
    RAISE EXCEPTION 'cron.job ↔ job_registry drift: cron=% registry=%', v_cron_sched, v_reg_sched;
  END IF;
END $$;

COMMIT;