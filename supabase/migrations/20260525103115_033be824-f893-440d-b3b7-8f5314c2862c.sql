-- MIG-049 — FP-008 sub-step 8.5 / ACT-109
-- Continuous hard-exclusion refresh job_registry seeds per DEC-038.1 clause (4) verbatim:
--   "longshort.universe.hard_exclusion_refresh_<rule> for each §3.3 rule
--    (cadences per §3.4; exactly_once for daily/twice-monthly cadences,
--    at_least_once for continuous; forbid concurrency for refresh batches,
--    allow for event-triggered; enabled=false initially)"
--
-- 4 rows seeded:
--   3.3a earnings window (daily 09:00 UTC; exactly_once; forbid)
--   3.3b M&A (event-triggered placeholder schedule='manual'; at_least_once; allow)
--   3.3c halts (deferred-placeholder per R4 + DW-063; schedule='manual'; exactly_once; forbid)
--   3.3e short interest (daily cron + handler-internal twice-monthly cadence gating
--                        via isShortInterestTriggerDay; exactly_once; forbid)
--
-- Per §3.3 spec NOT seeded:
--   3.3d HTB (pre-trade check at order-execution layer per §3.3d; not continuous refresh)
--   3.3f / 3.3g / 3.3h (N/A v1 per §3.3 spec)
--
-- All rows ship enabled=false per DEC-038.1 clause (4); activated operationally when
-- sub-step 8.13 closes + handler dispatch verified end-to-end.
--
-- Idempotent: ON CONFLICT (id) DO NOTHING per MIG-044 + MIG-048 precedent.

INSERT INTO public.job_registry (
  id, version, owner_module, description, schedule, trigger_type,
  class, priority, execution_guarantee, timeout_seconds, max_retries,
  retry_policy, concurrency_policy, replay_safe, enabled, status
) VALUES
  (
    'longshort.universe.hard_exclusion_refresh_3_3a',
    '1.0.0',
    'longshort',
    'Daily continuous-refresh job for §3.3a earnings-window hard exclusion per CROSSWIND §3.4 + DEC-038.1 clause (4). Invokes one-dispatcher edge function longshort-universe-hard-exclusion-refresh with rule=3.3a; queries earnings calendar via PolygonEarningsCalendarFetcher (ACT-107); applies rule-3-3a-earnings-window logic against current eligible universe (sourced from universe_refresh_log at sub-step 8.5; switches to universe_membership query at sub-step 8.7). Per DEC-038.1 clause (4): execution_guarantee=exactly_once, concurrency_policy=forbid. Ships enabled=false (ACT-109).',
    '0 9 * * *',
    'scheduled',
    'system_critical',
    'high',
    'exactly_once',
    300,
    3,
    'standard',
    'forbid',
    true,
    false,
    'registered'
  ),
  (
    'longshort.universe.hard_exclusion_refresh_3_3b',
    '1.0.0',
    'longshort',
    'Event-triggered refresh job for §3.3b M&A hard exclusion per CROSSWIND §3.4 + DEC-038.1 clause (4). Per §3.3 spec: "M&A announcements update on press release." Invokes one-dispatcher edge function with rule=3.3b. Per DEC-038.1 clause (4): execution_guarantee=at_least_once, concurrency_policy=allow (event-triggered). Trigger source TBD at sub-step 8.13 closure (Polygon corporate-actions polling OR webhook); schedule field set to manual until trigger source operational. Ships enabled=false (ACT-109).',
    'manual',
    'manual',
    'system_critical',
    'high',
    'at_least_once',
    300,
    3,
    'standard',
    'allow',
    true,
    false,
    'registered'
  ),
  (
    'longshort.universe.hard_exclusion_refresh_3_3c',
    '1.0.0',
    'longshort',
    'Deferred-placeholder row for §3.3c halt 5-trading-day lookback per R4 risk-register mitigation + DW-063 (registered at ACT-107). Real implementation lands when Phase 7 halt-feed work completes per DW-058 B2 Phase-7-blocking dependency. v1 row exists for FP-008 closure document attestation per R4: FP-008 closure document attests which v1 hard-exclusion rules are real-feed-backed vs deferred-placeholder. Schedule manual reflects deferred status. Per DEC-038.1 clause (4): execution_guarantee=exactly_once, concurrency_policy=forbid (matches real-time halts update cadence from §3.4 once real feed lands). Ships enabled=false; activation gated by DW-058 B2 resolution (ACT-109).',
    'manual',
    'manual',
    'system_critical',
    'high',
    'exactly_once',
    300,
    3,
    'standard',
    'forbid',
    true,
    false,
    'registered'
  ),
  (
    'longshort.universe.hard_exclusion_refresh_3_3e',
    '1.0.0',
    'longshort',
    'Twice-monthly refresh job for §3.3e short-interest hard exclusion per CROSSWIND §3.4 + DEC-038.1 clause (4). Per §3.3 spec: "short-interest exclusions update twice monthly with SEC reports" (FINRA actual publisher; 15th + EOM with T+1 publish). Schedule = daily cron + handler-internal cadence gating via shared/trading-days.ts isShortInterestTriggerDay(d) helper — handler runs daily but only invokes rule logic on T+1-after-15th + T+1-after-EOM trading days; other days emit skipped audit event (Option 2α at ACT-109 operator-confirmed). Invokes FinraShortInterestFetcher (ACT-107) + rule-3-3e-short-interest logic against current eligible universe. Per DEC-038.1 clause (4): execution_guarantee=exactly_once, concurrency_policy=forbid. Ships enabled=false (ACT-109).',
    '0 9 * * *',
    'scheduled',
    'system_critical',
    'high',
    'exactly_once',
    300,
    3,
    'standard',
    'forbid',
    true,
    false,
    'registered'
  )
ON CONFLICT (id) DO NOTHING;