/**
 * update-mfa-self-pref — User updates their own profiles.require_mfa_for_self.
 *
 * Owner: auth module (PLAN-AUTH-MFA-POLICY-001 / DEC-028)
 * Classification: security-relevant
 * Lifecycle: active
 *
 * PATCH /update-mfa-self-pref
 * Body: { require_mfa_for_self: boolean }
 * Authorization: any authenticated user (operates only on their own row).
 * Audit: user.mfa_self_pref_changed with { before, after }.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts'
import { authenticateRequest } from '../_shared/authenticate-request.ts'
import { logAuditEvent } from '../_shared/audit.ts'
import { supabaseAdmin } from '../_shared/supabase-admin.ts'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { validateRequest } from '../_shared/validate-request.ts'

const BodySchema = z.object({
  require_mfa_for_self: z.boolean(),
})

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'PATCH') {
    const { apiError } = await import('../_shared/api-error.ts')
    return apiError(405, 'Method not allowed', { correlationId: crypto.randomUUID() })
  }

  const ctx = await authenticateRequest(req)
  const body = await req.json()
  const { require_mfa_for_self } = validateRequest(BodySchema, body)

  const { data: current, error: readError } = await supabaseAdmin
    .from('profiles')
    .select('require_mfa_for_self')
    .eq('id', ctx.user.id)
    .maybeSingle()

  if (readError) {
    const { apiError } = await import('../_shared/api-error.ts')
    return apiError(500, 'Failed to read profile', { correlationId: ctx.correlationId })
  }

  const before = !!current?.require_mfa_for_self
  if (before === require_mfa_for_self) {
    return apiSuccess({ require_mfa_for_self, changed: false })
  }

  const { error: writeError } = await supabaseAdmin
    .from('profiles')
    .update({ require_mfa_for_self, updated_at: new Date().toISOString() })
    .eq('id', ctx.user.id)

  if (writeError) {
    const { apiError } = await import('../_shared/api-error.ts')
    return apiError(500, 'Failed to update preference', { correlationId: ctx.correlationId })
  }

  const auditResult = await logAuditEvent({
    actorId: ctx.user.id,
    action: 'user.mfa_self_pref_changed',
    targetType: 'profiles',
    targetId: ctx.user.id,
    metadata: { before, after: require_mfa_for_self },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    correlationId: ctx.correlationId,
  })

  if (!auditResult.success) {
    console.error('[UPDATE-MFA-SELF-PREF] Audit write failed', auditResult)
  }

  return apiSuccess({ require_mfa_for_self, changed: true })
}))
