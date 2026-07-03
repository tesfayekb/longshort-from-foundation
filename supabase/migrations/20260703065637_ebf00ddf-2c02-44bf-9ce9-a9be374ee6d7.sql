-- FP-069 OVERSHOOT W1b reconciling migration (ACT-456)
-- Codifies live-DB state applied out-of-migration during W1a (INC-classed as
-- applied-not-committed). Idempotent by design: this migration MUST produce
-- ZERO live-DB delta on apply. It exists so that a from-scratch re-apply of
-- the repo migrations reaches the same state the live DB is already in.
--
-- Scope (schema-only reconciliation):
--   (a) Seed permission 'overshoot.manage'
--   (b) Grant BOTH overshoot.view and overshoot.manage to role 'admin'
--       (Administrator per current role registry key)
--
-- Explicitly NOT in scope (data, not schema):
--   - The 839-row overshoot_universe seed (data path via insert tool; the
--     attribution gap is recorded in ACT-456 rather than fabricated here).

-- (a) overshoot.manage permission seed — idempotent.
INSERT INTO public.permissions (key, description)
VALUES (
  'overshoot.manage',
  'Gates the OVERSHOOT strategy MANUAL BACKFILL surfaces (edge functions overshoot-backfill-bars-manual and overshoot-backfill-earnings-manual). Reserved for future W3+ mutating admin surfaces. Two-segment per DEC-031 sub-point 3. No default role grants outside admin per DEC-031 sub-point 10. Authority: ACT-456 (W1b reconciliation of W1a live state).'
)
ON CONFLICT (key) DO NOTHING;

-- (b) Administrator grants — idempotent by NOT EXISTS predicate against
--     (role_id, permission_id) composite. Uses role.key='admin' (registry key
--     for the Administrator role) and the newly-guaranteed permission keys.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.key IN ('overshoot.view','overshoot.manage')
WHERE r.key = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );