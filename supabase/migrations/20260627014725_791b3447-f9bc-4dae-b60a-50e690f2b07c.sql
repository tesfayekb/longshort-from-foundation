UPDATE public.job_registry
   SET schedule = '55 13 * * 1-5',
       updated_at = now()
 WHERE id = 'longshort.pead.compute';