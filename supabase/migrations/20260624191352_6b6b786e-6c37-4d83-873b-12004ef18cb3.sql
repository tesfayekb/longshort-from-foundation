-- FP-056 E5 / MIG-120: Seed `longshort.execute` permission.
--
-- Authorized by:
--   - DEC-068 clause (d) — `longshort.execute` introduction trigger AUTHORIZED;
--     introduction PERFORMED in the same PR as the first consumer's
--     `checkPermissionOrThrow(auth.uid(), 'longshort.execute')` callsite at
--     `supabase/functions/longshort-execute/index.ts`.
--   - DEC-032 clause (4) — *the key exists only when the code that consumes
--     it exists*. E1-E4 execution code has landed (ACT-307/309/311/312);
--     E5's edge function is the first consumer; the reservation is now
--     satisfied. Permission seed + first callsite ship together.
--   - DEC-031 sub-point 3 — two-segment key (`longshort.execute`).
--   - DEC-031 sub-point 10 — NO default role grants. The permission is
--     SEEDED here; granting it to any role is a SEPARATE operator action.
--     Superadmin inherits via the existing wildcard pattern.
--
-- Idempotency: INSERT uses ON CONFLICT (key) DO NOTHING. Safe to re-run.
-- Reversibility: rollback requires manual DELETE; not part of forward migrations.

INSERT INTO public.permissions (key, description) VALUES
  (
    'longshort.execute',
    'Gates the long-short execution edge function (longshort-execute) which drives the autonomous three-tier order lifecycle (E3 advanceTick) against the broker. Highest-privilege long-short permission — gates the MONEY PATH (paper order placement at v1 per DEC-068 clause (f); live trading is Phase 8+). Two-segment per DEC-031 sub-point 3. Reauth required (destructive trading action). Audit required — every execute-gated call writes to longshort_audit_logs via _shared/strategy-audit.ts. NO default role grants per DEC-031 sub-point 10 — granting requires explicit operator action. Charter: DEC-068 clause (d) + DEC-032 clause (4); seeded at FP-056 E5 (MIG-120, ACT-313). Depends transitively on trading.access (panel outer gate) and longshort.view (cannot execute what you cannot view).'
  )
ON CONFLICT (key) DO NOTHING;