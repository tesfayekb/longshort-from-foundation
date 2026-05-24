INSERT INTO public.user_roles (user_id, role_id)
SELECT '8f8dfd8a-81bb-42f3-bb87-c58e33748b1b'::uuid, r.id
FROM public.roles r
WHERE r.key = 'superadmin'
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO public.audit_logs (action, actor_id, target_type, target_id, metadata)
SELECT 'rbac.role_assigned', '8f8dfd8a-81bb-42f3-bb87-c58e33748b1b'::uuid, 'user_roles', '8f8dfd8a-81bb-42f3-bb87-c58e33748b1b'::uuid,
  jsonb_build_object('role_key','superadmin','reason','ACT-084 v2 smoke test — operator authenticated superadmin for kill_switch RPC active cycle','email','tesfayekb@me.com');