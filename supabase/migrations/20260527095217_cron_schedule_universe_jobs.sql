-- FP-010 Phase A — wire pg_cron to invoke the 3 cron-eligible longshort
-- universe edge functions. (3.3b / 3.3c remain manual per their event-driven
-- design — not scheduled here.)
--
-- URL + cron-secret are sourced from Postgres GUCs set by the operator via
-- ALTER DATABASE (OOB SQL). This eliminates hardcoded supabase project refs
-- (which exist in 4 prior migrations as known debt; cleanup is a separate
-- hygiene task).
--
-- Auth: X-Cron-Secret header per _shared/cron-auth.ts. CRON_SECRET must be
-- set as both a database GUC (for cron.schedule to read at migration-apply
-- time) AND a Supabase edge-function secret (for verifyCronSecret to validate
-- against) with the same value.
--
-- Operational tradeoff: format(%L, ...) bakes the GUC values into the cron
-- job SQL at migration-apply time. Rotating the secret requires re-running
-- this migration (or manual cron.unschedule + cron.schedule).
--
-- Idempotent: cron.unschedule before cron.schedule.

DO $$
DECLARE
  base_url text := current_setting('app.supabase_url', true);
  secret text := current_setting('app.cron_secret', true);
BEGIN
  IF base_url IS NULL OR base_url = '' THEN
    RAISE EXCEPTION 'app.supabase_url GUC is not set — operator must run: ALTER DATABASE postgres SET app.supabase_url = ''https://<project-ref>.supabase.co''';
  END IF;
  IF secret IS NULL OR secret = '' THEN
    RAISE EXCEPTION 'app.cron_secret GUC is not set — operator must run: ALTER DATABASE postgres SET app.cron_secret = ''<random-hex-string>''';
  END IF;
END $$;

-- 1. Quarterly refresh — daily 09:00 UTC during first week of Jan/Apr/Jul/Oct.
--    Handler's bootstrap-aware guard ensures real work runs on first-ever
--    invocation (empty universe_refresh_log) OR on first trading day of
--    each quarter (steady-state).
SELECT cron.unschedule('longshort-universe-quarterly-refresh')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'longshort-universe-quarterly-refresh');

SELECT cron.schedule(
  'longshort-universe-quarterly-refresh',
  '0 9 1-7 1,4,7,10 *',
  format($cron$
    SELECT net.http_post(
      url := %L || '/functions/v1/longshort-universe-quarterly-refresh',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', %L
      ),
      body := jsonb_build_object('time', now())
    ) AS request_id;
  $cron$, current_setting('app.supabase_url'), current_setting('app.cron_secret'))
);

-- 2. Hard exclusion refresh — rule 3.3a (earnings window) — daily 09:00 UTC.
SELECT cron.unschedule('longshort-universe-hard-exclusion-refresh-3_3a')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'longshort-universe-hard-exclusion-refresh-3_3a');

SELECT cron.schedule(
  'longshort-universe-hard-exclusion-refresh-3_3a',
  '0 9 * * *',
  format($cron$
    SELECT net.http_post(
      url := %L || '/functions/v1/longshort-universe-hard-exclusion-refresh?rule=3.3a',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', %L
      ),
      body := jsonb_build_object('time', now())
    ) AS request_id;
  $cron$, current_setting('app.supabase_url'), current_setting('app.cron_secret'))
);

-- 3. Hard exclusion refresh — rule 3.3e (short interest) — daily 09:00 UTC.
SELECT cron.unschedule('longshort-universe-hard-exclusion-refresh-3_3e')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'longshort-universe-hard-exclusion-refresh-3_3e');

SELECT cron.schedule(
  'longshort-universe-hard-exclusion-refresh-3_3e',
  '0 9 * * *',
  format($cron$
    SELECT net.http_post(
      url := %L || '/functions/v1/longshort-universe-hard-exclusion-refresh?rule=3.3e',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Cron-Secret', %L
      ),
      body := jsonb_build_object('time', now())
    ) AS request_id;
  $cron$, current_setting('app.supabase_url'), current_setting('app.cron_secret'))
);
