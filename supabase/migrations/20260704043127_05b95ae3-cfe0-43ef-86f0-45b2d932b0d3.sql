-- FP-069 W3.3.b.i (ACT-460.b.i): DISARMED job_registry seed for the
-- overshoot short-interest twice-monthly compute cron.
--
-- Mirrors MIG-106 (sql: supabase/migrations/20260621095443_ad15461d-*.sql)
-- 17-column INSERT shape VERBATIM. `enabled=false` at seed per the
-- disarm-fire-enable convention (MIG-066 / MIG-074 / MIG-076 / MIG-102 /
-- MIG-106 precedents). Cron.job row does NOT exist until the operator-run
-- arming step at sub-turn b.iii wires sql/30_overshoot_short_interest_cron_schedule.sql
-- and flips enabled=true per DEC-040 + DEC-043 attestation.
--
-- Schedule '0 21 1,15 * *' is byte-identical to sql/30's cron.schedule
-- (drift = paragraph 22.5 DRIFT-class defect). Idempotent via ON CONFLICT.

INSERT INTO public.job_registry (
  id,
  owner_module,
  description,
  trigger_type,
  schedule,
  enabled,
  handler_path,
  class,
  priority,
  execution_guarantee,
  timeout_seconds,
  max_retries,
  retry_policy,
  concurrency_policy,
  replay_safe,
  version,
  status
) VALUES (
  'overshoot.short_interest.compute',
  'overshoot',
  'Twice-monthly overshoot short-interest compute cron (FP-069 W3.3.b, ACT-460). Wraps `overshoot-short-interest-compute` — derives `si_pct_float = short_interest / shares` per the A3 contract (byte-verbatim to short-interest-orchestrator.ts:334, conscious approximation using current shares-outstanding to denominate historical SI counts) and idempotently upserts `overshoot_short_interest` on the (as_of_date, ticker) PK. Three skip gates (kill-switch, job-disarmed, probe-mode). DISARMED at seed (enabled=false); operator arms via sql/30_overshoot_short_interest_cron_schedule.sql at b.iii ONLY after end-to-end DEC-043 attestation (deploy + GATE-ZERO alpaca probe returns account_last4=AZD5 + GATE-ZERO polygon probe returns status=reports + first clean batch writes cron-attributable rows on overshoot_short_interest).',
  'scheduled',
  '0 21 1,15 * *',
  false,
  'supabase/functions/overshoot-short-interest-compute/index.ts',
  'operational',
  'normal',
  'at_least_once',
  600,
  2,
  'standard',
  'forbid',
  true,
  '1.0.0',
  'registered'
) ON CONFLICT (id) DO NOTHING;