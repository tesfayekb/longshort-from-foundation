-- MIG-106 - FP-052 sub-step 3.0d / ACT-261: job_registry seeds for the
-- two LIVE combiner cron handlers (longshort-combiner-assemble +
-- longshort-combiner-rank).
--
-- DISARMED at seed (enabled=false) per the disarm-fire-enable convention
-- (MIG-066 / MIG-074 / MIG-076 / MIG-102 precedent). A SEPARATE operator-
-- run step (DEC-040) wires the crons via
-- sql/21_longshort_combiner_live_cron_schedule.sql and flips enabled=true
-- ONLY after end-to-end attestation:
--   1. cron.job rows verified clean (no PROJECT_REF residue)
--   2. one dry-fire returning outcome='skipped' / reason='job_disarmed'
--   3. then UPDATE job_registry SET enabled=true ... per sql/21 Step 3.
--
-- Handler paths:
--   supabase/functions/longshort-combiner-assemble/index.ts
--   supabase/functions/longshort-combiner-rank/index.ts
--
-- Schedules (byte-identical to sql/21):
--   longshort.combiner_assemble.compute -> '35 23 * * 1-5'
--   longshort.combiner_rank.compute     -> '50 23 * * 1-5'
--
-- Idempotent via ON CONFLICT (id) DO NOTHING.

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
  'longshort.combiner_assemble.compute',
  'longshort',
  'Daily weekday LIVE feature-vector assembly cron (FP-052 sub-step 3.0d). Wraps createFeatureAssemblyOrchestrator verbatim - cron sibling of longshort-combiner-assemble-manual. Three skip gates (kill-switch, job-disarmed). Writes combiner_feature_vectors (idempotent UPSERT keyed on operator_id/as_of_date/ticker; computed_at=as_of). Operator-armed at sub-step 3.0d-arm via sql/21.',
  'scheduled',
  '35 23 * * 1-5',
  false,
  'supabase/functions/longshort-combiner-assemble/index.ts',
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
  'longshort.combiner_rank.compute',
  'longshort',
  'Daily weekday LIVE ranker + book seeder cron (FP-052 sub-step 3.0d). Wraps createRankerOrchestrator verbatim - cron sibling of longshort-combiner-rank-manual. Stamps ranker_source=count_normalized_fallback on every row (inherited from ranker.ts:199, asserted at ranker_test.ts:37). Three skip gates (kill-switch, job-disarmed, assemble_incomplete_for_as_of - audit-event marker, per-as_of structural guarantee). Writes combiner_rankings + combiner_book (idempotent UPSERT). Operator-armed at sub-step 3.0d-arm via sql/21.',
  'scheduled',
  '50 23 * * 1-5',
  false,
  'supabase/functions/longshort-combiner-rank/index.ts',
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