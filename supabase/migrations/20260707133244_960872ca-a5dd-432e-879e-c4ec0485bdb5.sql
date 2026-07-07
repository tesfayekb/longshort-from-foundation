INSERT INTO public.overshoot_audit_logs (operator_id, action, metadata)
VALUES (
  'c0523131-8964-48c0-8a6a-76275acff631'::uuid,
  'overshoot.entry.manual_triggered',
  jsonb_build_object(
    'confirm_token','8d2d93eaf57baeeebafa84fb0c2824c90c8ec625204b3f5c141dbd62d7ca31de',
    'phase','live',
    'as_of','2026-07-07'
  )
);