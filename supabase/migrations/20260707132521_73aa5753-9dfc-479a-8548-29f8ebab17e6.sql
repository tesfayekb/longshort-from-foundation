INSERT INTO public.overshoot_audit_logs (operator_id, action, metadata)
VALUES (
  'c0523131-8964-48c0-8a6a-76275acff631'::uuid,
  'overshoot.entry.manual_triggered',
  jsonb_build_object(
    'confirm_token','c6c5cce561020b7fc64e881a638e4c3c81deabda6761629edefb59a957f398eb',
    'phase','dry_run',
    'as_of','2026-07-07'
  )
);