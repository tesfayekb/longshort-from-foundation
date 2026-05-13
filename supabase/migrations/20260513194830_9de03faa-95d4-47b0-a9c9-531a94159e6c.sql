INSERT INTO public.user_roles (user_id, role_id, assigned_by)
SELECT 'c0523131-8964-48c0-8a6a-76275acff631'::uuid, id, 'c0523131-8964-48c0-8a6a-76275acff631'::uuid
FROM public.roles WHERE key='superadmin'
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO public.audit_logs (action, actor_id, target_type, target_id, metadata)
VALUES ('rbac.role_assigned', 'c0523131-8964-48c0-8a6a-76275acff631'::uuid, 'user_roles',
  'c0523131-8964-48c0-8a6a-76275acff631'::uuid,
  jsonb_build_object('role_key','superadmin','reason','manual SQL grant by request'));