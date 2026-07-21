-- ACT-561 Option-C: Delete stale pre-rename job_registry row.
-- The `overshoot_equity_snapshot` (underscore) row is a legacy artifact
-- from 2026-07-09 that was superseded by `overshoot.equity_snapshot` (dot)
-- on 2026-07-10. The stale row has enabled=false and no matching cron.job
-- entry — it is not firing, but it confuses fresh clones searching by
-- underscore-form (triggered supervisor mis-diagnosis "snapshot writer is
-- unarmed" this session). Removed for hygiene.
--
-- §22.5.1 pre-state (read-back captured pre-migration):
--   id=overshoot_equity_snapshot  enabled=false schedule='30 21 * * 1-5'
--     updated_at=2026-07-09 14:08:16Z  (STALE — to be removed)
--   id=overshoot.equity_snapshot  enabled=true  schedule='10 21 * * 1-5'
--     updated_at=2026-07-10 04:13:47Z  (LIVE — preserved)
DELETE FROM public.job_registry
 WHERE id = 'overshoot_equity_snapshot'
   AND enabled = false
   AND schedule = '30 21 * * 1-5';