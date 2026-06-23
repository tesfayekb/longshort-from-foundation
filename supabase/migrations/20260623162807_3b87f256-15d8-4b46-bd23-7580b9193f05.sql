-- MIG-117 — FP-052.2 / 3.2-b: market-regime signal_registry rows + DISARMED
-- cron seed for the SPY regime compute handler.
--
-- DEC-066 §6.5.1.1 adds a market-level structural category to the
-- feature-vector contract (§6.5.1.1 sub-clause; per-name §6.5.1 block
-- VERBATIM untouched). This migration is the ADDITIVE seed for that
-- category at the registry + job-scheduler layer:
--
--   (1) signal_registry: two NEW rows for the two grounded features
--       (market_24m_cumulative_return + market_realized_vol_6m). Both
--       are planned-status at seed time (status flips to 'live' at 3.2-d
--       when the assembler reads them; this preserves the existing
--       signal-FP "planned → live in the same migration that arms compute"
--       precedent — for 3.2-b the rows exist but no FEATURE_ORDER slot
--       references them yet; arming happens at 3.2-d). criticality is
--       NULL because the market-level structural category is neither
--       per-name 'critical' nor per-name 'non_critical' — the typed
--       fail-loud lives at the assemble layer per DEC-066 §(e).
--
--   (2) job_registry: cron handler
--       `longshort.spy_regime.compute` -> 19:00 UTC weekdays
--       ('0 19 * * 1-5') — a collision-free slot earlier than every
--       existing weekday cron (20:00 / 21:00 / 21:15 / 21:30 / 22:30).
--       Ordering rationale: regime rows must land in `signal_observations`
--       BEFORE the per-name signal computes + the combiner-assemble cron
--       run, because the 3.2-c regime-broadcaster reads from
--       signal_observations as part of feature assembly. Ordering becomes
--       LOAD-BEARING at 3.2-c — at 3.2-b the assembler is not yet wired,
--       so 19:00 is the seed slot that pre-positions correct ordering
--       without disturbing anything live.
--
--       DISARMED at creation (enabled=false) per the disarm-fire-enable
--       convention (MIG-066 / MIG-074 / MIG-076 / MIG-102 precedent). A
--       SEPARATE operator-run step (3.2-c-d / DEC-040 + DEC-043) flips
--       enabled=true + wires `cron.schedule(...)` only after end-to-end
--       attestation (200 + cron-attributable first artifact row under
--       sentinel ticker `__MARKET__`).
--
-- NO DDL on `signal_observations` (FP-052.2 / ACT-291 live probe
-- confirmed no widening needed: ticker NOT NULL → sentinel `__MARKET__`
-- satisfies; signal_id is free-text → both new IDs admissible; both
-- live CHECK constraints are satisfied by always-present fail-loud
-- regime rows). NO DDL on `signal_registry` itself (existing CHECK on
-- criticality admits NULL; this is the same pattern the existing
-- 'composite' row already uses). Gate-3.2 "without migration on
-- signal_observations" holds.
--
-- Idempotent: ON CONFLICT (signal_id) DO NOTHING + ON CONFLICT (id) DO
-- NOTHING. Re-applies are safe.

INSERT INTO public.signal_registry
  (signal_id, signal_num, display_name, spec_ref, cadence, status,
   criticality, stale_after_hours, planned_phase, job_registry_id, display_order)
VALUES
  ('market_24m_cumulative_return', NULL,
   'Market 24-month cumulative return (SPY, raw decimal; Daniel & Moskowitz 2016)',
   '§6.5.1.1', 'daily', 'planned', NULL, 36,
   'Phase 3.2', 'longshort.spy_regime.compute', 100),
  ('market_realized_vol_6m', NULL,
   'Market 6-month realized volatility (SPY, annualized sqrt(252)*stddev(log returns); Barroso & Santa-Clara 2015)',
   '§6.5.1.1', 'daily', 'planned', NULL, 36,
   'Phase 3.2', 'longshort.spy_regime.compute', 101)
ON CONFLICT (signal_id) DO NOTHING;

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
  'longshort.spy_regime.compute',
  'longshort',
  'Daily weekday SPY market-regime compute (DEC-066 §6.5.1.1 / FP-052.2). Fetches SPY adjusted-close history via PolygonPriceHistoryFetcher (730 cal-day window), computes the two grounded features (market_24m_cumulative_return per Daniel & Moskowitz 2016; market_realized_vol_6m per Barroso & Santa-Clara 2015), persists exactly two rows to signal_observations under sentinel ticker __MARKET__ (FP-052.2 / ACT-291). DEC-066 §(e) typed-fail-loud: distinct regime_data_missing_current_bar vs regime_data_insufficient_history reasons; NO silent empty, NO silent carry-forward. NO assembler wiring at 3.2-b — the rows are inert until 3.2-c lands the regime-broadcaster. Operator-armed at 3.2-c-d.',
  'scheduled',
  '0 19 * * 1-5',
  false,
  'supabase/functions/longshort-spy-regime-compute/index.ts',
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