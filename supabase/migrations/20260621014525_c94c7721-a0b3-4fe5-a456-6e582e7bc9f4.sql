CREATE OR REPLACE FUNCTION public.longshort_get_heal_date()
RETURNS date
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_heal date;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'longshort.view') THEN
    RAISE EXCEPTION 'insufficient_privilege: longshort.view required'
      USING ERRCODE = '42501';
  END IF;
  SELECT (value->>'heal_date')::date INTO v_heal
    FROM public.system_config
   WHERE key = 'dw_106_short_interest_heal_date';
  RETURN v_heal;
END;
$$;

GRANT EXECUTE ON FUNCTION public.longshort_get_heal_date() TO authenticated;