-- MIG-091 — FP-049 Phase 3b — Signal #9 (active_catalyst_flag) registry truth — DISARMED
--
-- Two-statement metadata-only migration (no DDL, no new tables, no
-- GRANT/RLS/policy changes). The Phase-3a substrate (orchestrator +
-- handlers + module doc, ACT-176) is the code counterpart; this
-- migration is purely the registry truth — the two rows admin tooling,
-- monitoring, and the FP-010 inheritance path read to discover the new
-- consumer.
--
-- Architecture (supervisor-ratified 2026-06-13): SINGLE-INVOCATION
-- (FP-047 shape). Arithmetic gate: 8-13 vendor calls per fire, news-page
-- sequential drain in Polygon bucket dominates at 31-42 s lower bound /
-- 40-55 s upper-bound robustness ceiling, ≥65 s headroom vs the 120 s
-- STOP gate and ≥95 s vs the 150 s HTTP wall. Signal #9 does NOT use
-- the FP-045 cursor-drain queue engine; per-vendor TokenBuckets are
-- constructed at the handler boundary (FMP 10.625 rps / Polygon 8.5 rps
-- per DEC-056 / Finnhub 4.25 rps / Tradier no bucket — typed-fallback
-- only per DEC-057 §(i)).
--
-- Schedule slot '45 21 * * 1-5' UTC — placed AFTER analyst (21:00 UTC)
-- and after news (21:30 UTC + its observed ~6 min queue drain →
-- typically wraps by ~21:36 UTC); placed BEFORE options-flow (22:00
-- UTC). No two init triggers fire on the same minute and the news
-- queue drain is finished before catalyst starts → no cross-signal
-- vendor-bucket contention.
--
-- DEC-048 interim-cadence discipline: §4.4.9 spec target is 5-min
-- intraday; v1 is daily after-close. Truth-in-telemetry cadence string
-- names the gap so admin tooling doesn't display the spec target as
-- the actual cadence.
--
-- NO cron.job changes. Cron wiring is operator-side at arm-up per
-- DEC-040 (byte-match attestation) + DEC-048 (operator-run enable
-- step); MIG-091 leaves the row DISARMED (`enabled=false`).
--
-- NO slice/sweeper job_registry rows — Signal #9 is single-invocation,
-- not a queue consumer; the MIG-084 shared engine rows do not apply.

-- ────────────────────────────────────────────────────────────────────
-- 1) job_registry — register longshort.catalyst.compute (DISARMED)
-- ────────────────────────────────────────────────────────────────────
INSERT INTO public.job_registry (
  id,
  owner_module,
  description,
  schedule,
  trigger_type,
  class,
  priority,
  execution_guarantee,
  timeout_seconds,
  max_retries,
  retry_policy,
  concurrency_policy,
  replay_safe,
  enabled,
  status,
  handler_path
) VALUES (
  'longshort.catalyst.compute',
  'longshort',
  'Daily Active Catalyst Flag (§4.4.9) signal computation — interim cadence per DEC-048 (NOT end-state; §4.4.9 spec target is 5-min intraday; Phase 7 picks final cadence). FP-049 Phase 3b: SINGLE-INVOCATION orchestrator (supervisor-ratified 2026-06-13 by arithmetic gate — 8-13 vendor calls per fire, news-page sequential drain dominates at 31-42 s lower-bound / 40-55 s upper-bound ceiling, ≥65 s headroom vs the 120 s STOP gate; does NOT use the FP-045 queue engine). Per-vendor TokenBuckets constructed at the handler boundary — FMP 10.625 rps shared by earnings + M&A + grades; Polygon 8.5 rps (DEC-056) shared by splits + dividends + news-keyword pages; Finnhub 4.25 rps for FDA-advisory; Tradier no bucket (DEC-057 §(i) typed-fallback only, 0 calls/fire in normal operation). Per CROSSWIND §4.4.9: trailing 5 trading days; per-event raw = catalyst_weight(tier 3.0/1.5/0.5) × exp(-age_h / half_life); within-sector GICS z-score normalization. DEC-057 ten-clause bindings — §(a) frozen half-life table; §(b) keyword + verb gate; §(c) decoupling from Signal #1 / #4 / #8; §(d) OCCURRED-ONLY look-ahead gate + v1 12:00 ET earnings session anchor approximation (DW-097); §(e) declaration_date is decay-origin (never ex-date); §(f) nthPrecedingTradingDay(as_of, 5) — v1 weekends-only approximation, US exchange holidays NOT modelled, bounded shortfall ≤1 trading day in double-holiday weeks (DW-098); §(g) v1 IN-set 10 types / OUT-set 5 types; §(h) 1h-bucket cross-vendor dedup with structured > keyword precedence + first-occurrence-wins; §(i) Tradier typed-fallback iff Polygon splits OR dividends unavailable; §(j) frozen keyword + verb-gate maps. Typed skips: no_catalyst_events_in_window / data_unavailable / missing_sector / singleton_sector. NO sentinel numerics. catalyst_meta carried in writeStrategyAuditEvent.metadata (signal_compute_log has no jsonb metadata column at v1).',
  '45 21 * * 1-5',
  'scheduled',
  'operational',
  'normal',
  'at_least_once',
  150,
  2,
  'standard',
  'forbid',
  true,
  false,                                                  -- DISARMED
  'registered',
  'supabase/functions/longshort-catalyst-compute/index.ts'
)
ON CONFLICT (id) DO UPDATE
  SET owner_module        = EXCLUDED.owner_module,
      description         = EXCLUDED.description,
      schedule            = EXCLUDED.schedule,
      trigger_type        = EXCLUDED.trigger_type,
      class               = EXCLUDED.class,
      priority            = EXCLUDED.priority,
      execution_guarantee = EXCLUDED.execution_guarantee,
      timeout_seconds     = EXCLUDED.timeout_seconds,
      max_retries         = EXCLUDED.max_retries,
      retry_policy        = EXCLUDED.retry_policy,
      concurrency_policy  = EXCLUDED.concurrency_policy,
      replay_safe         = EXCLUDED.replay_safe,
      enabled             = EXCLUDED.enabled,
      status              = EXCLUDED.status,
      handler_path        = EXCLUDED.handler_path,
      updated_at          = now();

-- ────────────────────────────────────────────────────────────────────
-- 2) signal_registry — flip active_catalyst_flag planned → live with
--    truth-in-telemetry cadence (DEC-048 interim discipline) and
--    job_registry_id wiring.
-- ────────────────────────────────────────────────────────────────────
UPDATE public.signal_registry
   SET status          = 'live',
       cadence         = 'daily (after-close; single-invocation ~31-55s; interim per DEC-048 — §4.4.9 spec target is 5-min intraday, Phase 7 picks final cadence)',
       planned_phase   = NULL,
       job_registry_id = 'longshort.catalyst.compute'
 WHERE signal_id = 'active_catalyst_flag';