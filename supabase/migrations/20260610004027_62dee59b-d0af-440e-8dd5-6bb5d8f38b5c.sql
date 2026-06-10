-- MIG-085 — FP-045 Phase 4 / DEC-047 — Signal #3 (options-flow) revival on the
-- generalized cursor-drain queue-worker engine; closes DW-095.
--
-- Idempotent UPDATEs only. NO new rows: the MIG-078 row for
-- `longshort.options_flow.compute` is PRESERVED (handler_path + name kept per
-- the FP-045 §5 discipline; only the description is updated to reflect the
-- queue-shim handler shape + interim DEC-048 cadence language). The MIG-084
-- queue.slice + queue.sweeper rows are shared engine rows, signal-agnostic by
-- design — no per-signal duplication.
--
-- Stays DISARMED — the combined arm-up (PEAD + options-flow) is the next
-- operator step after Phase 4 validation per DEC-040 / DEC-043.

UPDATE public.job_registry
   SET description = 'FP-045 Phase 4 / DEC-047 — Signal #3 (Options Flow Imbalance, §4.4.7) ENQUEUE SHIM on the generalized cursor-drain queue-worker. Replaces the FP-043 chunked coordinator/worker architecture (DW-095 closed by FP-045 Phase 4): cron fires this handler which seeds a signal_queue_runs + signal_queue_cursor set via initQueueRun() and returns 202; compute drains across N subsequent longshort-queue-slice cron ticks (≈11 minutes for an ≈840-name universe at 80 tickers/slice × 2 Tradier calls/ticker / 1.7 rps), finalized in-process by the last slice handler. Tradier 120/min vendor cap honored via the engine''s token-bucket pacer (DEC-047 0.85 safety = 1.7 rps). Interim cadence per DEC-048 (NOT end-state; §4.4.7 5-minute intraday target deferred per DEC-046 v2). The longshort-options-flow-worker handler is deprecated (410 Gone) and the runOptionsFlowCoordinator path is retired; FP-043 compute (computeOptionsFlow + TradierOptionsChainFetcher) is reused VERBATIM through createOptionsFlowAdapter.',
       updated_at = now()
 WHERE id = 'longshort.options_flow.compute';

-- signal_registry: options_flow_imbalance_5d planned → live (DW-095 closed;
-- truth-in-telemetry — UI may advertise the live-on-queue cadence). Mirrors
-- the FP-044 / pead row's truth-in-telemetry precedent (cadence string names
-- the actual wall-time wait, names the interim DEC-048 state).
UPDATE public.signal_registry
   SET status = 'live',
       cadence = 'daily (after-close; queue-drained ~11 min; interim per DEC-048 — §4.4.7 5-min intraday target deferred per DEC-046 v2)',
       planned_phase = NULL,
       updated_at = now()
 WHERE signal_id = 'options_flow_imbalance_5d';