UPDATE public.job_registry
   SET enabled = true,
       updated_at = now()
 WHERE id = 'longshort.catalyst.compute';