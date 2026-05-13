/**
 * update-mfa-policy — Superadmin-only update of per-panel MFA enforcement policy.
 *
 * Owner: auth module (PLAN-AUTH-MFA-POLICY-001 / DEC-028)
 * Classification: security-critical
 * Lifecycle: active
 *
 * PATCH /update-mfa-policy
 * Body: { panels: { [panelKey: string]: 'required' | 'optional' } }
 * Authorization: is_superadmin + admin.config + recent reauth (5 min).
 * Audit: system.mfa_policy_changed with { before, after, fields_changed }.
 *
 * Strict enum: only 'required' | 'optional' accepted. No 'disabled' value exists
 * by design (DEC-028) — production cannot weaken MFA via a misconfigured policy.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts'
import { authenticateRequest } from '../_shared/authenticate-request.ts'
import { checkPermissionOrThrow, requireRecentAuth } from '../_shared/authorization.ts'
import { logAuditEvent } from '../_shared/audit.ts'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { validateRequest } from '../_shared/validate-request.ts'

const PanelValue = z.enum(['required', 'optional'])
const BodySchema = z.object({
  panels: z.record(z.string().min(1).max(64), PanelValue).refine(
    (p) => Object.keys(p).length > 0,
    { message: 'At least one panel must be specified' },
  ),
})

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'PATCH') {
    const { apiError } = await import('../_shared/api-error.ts')
    return apiError(405, 'Method not allowed', { correlationId: crypto.randomUUID() })
  }

  const ctx = await authenticateRequest(req)

  // Defense in depth: superadmin AND admin.config AND recent reauth
  const { data: isSuperadmin } = await supabaseAdmin.rpc('is_superadmin', { _user_id: ctx.user.id })
  if (!isSuperadmin) {
    const { apiError } = await import('../_shared/api-error.ts')
    return apiError(403, 'Superadmin required', { code: 'AUTHZ_DENIED', correlationId: ctx.correlationId })
  }
  await checkPermissionOrThrow(ctx.user.id, 'admin.config')
  requireRecentAuth(ctx.user.lastSignInAt, 5 * 60 * 1000, ctx.user.id)

  const body = await req.json()
  const input = validateRequest(BodySchema, body)

  // Read current
  const { data: currentRow, error: readError } = await supabaseAdmin
    .from('system_config')
    .select('value')
    .eq('key', 'mfa_enforcement_policy')
    .maybeSingle()

  if (readError) {
    const { apiError } = await import('../_shared/api-error.ts')
    return apiError(500, 'Failed to read current policy', { correlationId: ctx.correlationId })
  }

  const before = (currentRow?.value as {
    version?: number
    panels?: Record<string, 'required' | 'optional'>
    notes?: string
  }) ?? { version: 1, panels: { admin: 'optional' } }

  // Merge — superadmin can patch any subset of panels
  const mergedPanels: Record<string, 'required' | 'optional'> = {
    ...(before.panels ?? {}),
    ...input.panels,
  }
  // Floor: 'admin' panel must always be present and a valid enum
  if (mergedPanels.admin !== 'required' && mergedPanels.admin !== 'optional') {
    mergedPanels.admin = 'optional'
  }

  const after = {
    version: before.version ?? 1,
    panels: mergedPanels,
    notes: before.notes ?? 'Panel-level MFA enrollment gate.',
  }

  // Compute changed fields for audit
  const fields_changed: string[] = []
  for (const key of Object.keys(input.panels)) {
    if ((before.panels ?? {})[key] !== mergedPanels[key]) {
      fields_changed.push(`panels.${key}`)
    }
  }

  if (fields_changed.length === 0) {
    return apiSuccess({ policy: after, changed: false })
  }

  // Upsert
  const { error: writeError } = await supabaseAdmin
    .from('system_config')
    .upsert({
      key: 'mfa_enforcement_policy',
      value: after,
      updated_by: ctx.user.id,
      updated_at: new Date().toISOString(),
      description: 'Per-panel MFA enrollment policy controlled by superadmin via /admin/security',
    }, { onConflict: 'key' })

  if (writeError) {
    const { apiError } = await import('../_shared/api-error.ts')
    return apiError(500, 'Failed to update policy', { correlationId: ctx.correlationId })
  }

  const auditResult = await logAuditEvent({
    actorId: ctx.user.id,
    action: 'system.mfa_policy_changed',
    targetType: 'system_config',
    targetId: undefined,
    metadata: { before, after, fields_changed },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    correlationId: ctx.correlationId,
  })

  if (!auditResult.success) {
    console.error('[UPDATE-MFA-POLICY] Audit write failed — policy was updated but audit trail incomplete', auditResult)
  }

  return apiSuccess({ policy: after, changed: true })
}))
