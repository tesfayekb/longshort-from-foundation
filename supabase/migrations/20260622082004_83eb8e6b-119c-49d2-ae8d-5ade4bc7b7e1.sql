-- MIG-111: Defect 2 (observability-fidelity cluster) / ACT-274 / DW-130
-- Bind signal_registry.news_sentiment_7d.job_registry_id to the existing
-- job 'longshort.news.compute' so the All-Signals dashboard's
-- deriveStaleness can use the cron-aware path instead of falling through
-- to 'n/a'. Oversight in MIG-089b (planned->live flip set status/cadence
-- but did not populate job_registry_id; job 'longshort.news.compute'
-- with schedule '30 21 * * 1-5' has been live and firing).
-- Scope: single UPDATE on one signal_registry row. No schema change,
-- no other rows touched, no job_registry change. Idempotent (re-runs
-- produce no diff). Replay-determinism: the seed migration sequence
-- (MIG-089b) is the original truth-source; this MIG is the corrective
-- forward delta. A fresh-DB replay applies seeds then this MIG and
-- converges to the same bound state.

UPDATE public.signal_registry
   SET job_registry_id = 'longshort.news.compute',
       updated_at      = now()
 WHERE signal_id       = 'news_sentiment_7d'
   AND (job_registry_id IS DISTINCT FROM 'longshort.news.compute');