-- MIG-102 — FP-053 / DW-106-c-ii: job_registry seed for the short-interest
-- carry-forward DAILY cron handler.
--
-- Registers `longshort.short_interest_carry.compute` on a weekday DAILY
-- schedule ('30 22 * * 1-5' = 22:30 UTC weekdays). Distinct id from the
-- native twice-monthly job `longshort.short_interest.compute` (MIG-076,
-- schedule '0 21 1,15 * *') -- the two cohabit by design: native publishes
-- on FINRA cycle, carry holds-forward on every other weekday.
--
-- DISARMED at creation (enabled=false) per the disarm-fire-enable
-- convention (MIG-066 / MIG-074 / MIG-076 precedent). A SEPARATE operator-
-- run step (DEC-040 + DEC-043) wires the cron via
-- sql/20_longshort_short_interest_carry_cron_schedule.sql and flips
-- enabled=true only after end-to-end attestation (200 + cron-attributable
-- first artifact -- in this case, the first
-- system_config.dw_106_short_interest_heal_date stamp gated on
-- carried_count >= 1, per DEC-060 paragraph iii).
--
-- Handler path: supabase/functions/longshort-short-interest-carry-compute/index.ts.
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
  'longshort.short_interest_carry.compute',
  'longshort',
  'Daily weekday carry-forward emission for Signal #9 (short_interest_change_30d). Pure-DB: reads signal_observations 35d priors, calls decideShortInterestCarry per universe ticker, persists carried_forward=true rows + typed-absence rows. First fire with carried_count>=1 stamps system_config.dw_106_short_interest_heal_date (DEC-060 paragraph iii, permanent / never overwritten) opening the DEC-059 n>=30 measurement window. NO Polygon. Operator-armed at DW-106-c-d.',
  'scheduled',
  '30 22 * * 1-5',
  false,
  'supabase/functions/longshort-short-interest-carry-compute/index.ts',
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