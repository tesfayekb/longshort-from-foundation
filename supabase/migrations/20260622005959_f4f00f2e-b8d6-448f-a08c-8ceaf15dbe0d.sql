DO $smoke$
DECLARE
  v_sa_role uuid;
  v_role_to_touch uuid;
  v_old_ts timestamptz;
  v_new_ts timestamptz;
  v_err text;
  v_caught boolean := false;
  v_smoke6_ok boolean := false;
BEGIN
  -- ===== Smoke #4: prevent_last_superadmin_delete fires with business message =====
  SELECT id INTO v_sa_role FROM public.roles WHERE key = 'superadmin';
  IF v_sa_role IS NULL THEN
    RAISE EXCEPTION 'SMOKE_PRECOND_FAIL: superadmin role missing';
  END IF;

  BEGIN
    DELETE FROM public.user_roles WHERE role_id = v_sa_role;
    RAISE EXCEPTION 'SMOKE_FAIL_4_no_raise';
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      v_caught := true;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'SMOKE_FAIL_4: exception block not entered';
  END IF;
  IF v_err = 'SMOKE_FAIL_4_no_raise' THEN
    RAISE EXCEPTION 'SMOKE_FAIL_4: DELETE succeeded; guard did not fire';
  ELSIF v_err LIKE '%Cannot remove the last superadmin assignment%' THEN
    RAISE NOTICE 'SMOKE_OK_4: business message raised: %', v_err;
  ELSE
    RAISE EXCEPTION 'SMOKE_FAIL_4_schema_or_other: unexpected error: %', v_err;
  END IF;

  -- ===== Smoke #6: update_updated_at_column trigger fires on roles UPDATE =====
  SELECT id, updated_at INTO v_role_to_touch, v_old_ts
    FROM public.roles WHERE key = 'user';
  IF v_role_to_touch IS NULL THEN
    SELECT id, updated_at INTO v_role_to_touch, v_old_ts FROM public.roles LIMIT 1;
  END IF;
  IF v_role_to_touch IS NULL THEN
    RAISE EXCEPTION 'SMOKE_PRECOND_FAIL: no roles rows';
  END IF;

  -- Inner sub-block does UPDATE, captures new ts, then RAISEs a sentinel so
  -- the sub-block's DML is rolled back by the implicit savepoint. We carry the
  -- pass/fail decision out via v_smoke6_ok set BEFORE the sentinel raise.
  BEGIN
    PERFORM pg_sleep(0.01);
    UPDATE public.roles SET description = COALESCE(description, '') WHERE id = v_role_to_touch;
    SELECT updated_at INTO v_new_ts FROM public.roles WHERE id = v_role_to_touch;
    v_smoke6_ok := (v_new_ts IS NOT NULL AND v_new_ts > v_old_ts);
    RAISE EXCEPTION 'SMOKE_6_ROLLBACK_SENTINEL: old=% new=% ok=%', v_old_ts, v_new_ts, v_smoke6_ok;
  EXCEPTION
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      IF v_err NOT LIKE 'SMOKE_6_ROLLBACK_SENTINEL%' THEN
        RAISE EXCEPTION 'SMOKE_FAIL_6_unexpected: %', v_err;
      END IF;
  END;

  IF NOT v_smoke6_ok THEN
    RAISE EXCEPTION 'SMOKE_FAIL_6: updated_at not bumped (old=% new=%)', v_old_ts, v_new_ts;
  END IF;
  RAISE NOTICE 'SMOKE_OK_6: updated_at bumped (old=% new=%)', v_old_ts, v_new_ts;

  -- Confirm post-rollback state matches pre-smoke (no persistence)
  SELECT updated_at INTO v_new_ts FROM public.roles WHERE id = v_role_to_touch;
  IF v_new_ts <> v_old_ts THEN
    RAISE EXCEPTION 'SMOKE_FAIL_6_persist: rollback failed (old=% post=%)', v_old_ts, v_new_ts;
  END IF;
  RAISE NOTICE 'SMOKE_OK_NO_PERSIST: rollback clean (updated_at=%)', v_new_ts;

  RAISE NOTICE 'SMOKE_ALL_PASS: MIG-110 behavior verified under empty search_path';
END
$smoke$;