-- MIG-093: FP-050 Phase 3 — Signal #4 (insider_transactions_90d) registry truth (DISARMED)
-- One commit: job_registry schedule retune + signal_registry planned→live with DEC-048 interim cadence.
-- enabled stays FALSE; Signal #4 STAYS DISARMED through Phase 3 — arm-up is Phase 4.

UPDATE public.job_registry
   SET schedule     = '15 21 * * 1-5',
       handler_path = 'supabase/functions/longshort-insider-compute/index.ts',
       enabled      = false,
       updated_at   = now()
 WHERE id = 'longshort.insider.compute';

UPDATE public.signal_registry
   SET status         = 'live',
       cadence        = 'daily (after-close; single-invocation ~18s/fire incremental; acceptance-gated per DEC-058 §(b) — late-accepted filings carried to next fire; interim per DEC-048 — §4.4.4 30-min intraday revisit is a future enhancement-FP, Phase 7 picks final cadence)',
       planned_phase  = NULL,
       job_registry_id = 'longshort.insider.compute',
       updated_at     = now()
 WHERE signal_id = 'insider_transactions_90d';