/**
 * log-sudo-event — persist sudo-mode audit events.
 *
 * Owner: auth module (PLAN-AUTH-SUDO-001 / DEC-029 / FP-003)
 * Classification: security-relevant (write-only audit, no business effect)
 * Lifecycle: active
 *
 * POST /log-sudo-event
 * Body: { action: 'auth.sudo_granted' | 'auth.sensitive_action_performed', action_key: string }
 * Authorization: any authenticated user (writes a row keyed by their own auth.uid()).
 * Audit: writes a single audit_logs row; no further side-effects.
 *
 * Trust model:
 *   - actor_id is taken from the verified JWT, NEVER from the body.
 *   - action_key is a free-form identifier of WHAT the user did
 *     (e.g. "toggle_require_mfa_on", "mfa_enroll_route", "password_change").
 *     It is recorded as metadata only; it grants no privileges.
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts'
import { authenticateRequest } from '../_shared/authenticate-request.ts'
import { logAuditEvent } from '../_shared/audit.ts'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'
import { validateRequest } from '../_shared/validate-request.ts'

const BodySchema = z.object({
  action: z.enum(['auth.sudo_granted', 'auth.sensitive_action_performed']),
  action_key: z.string().min(1).max(128).regex(/^[a-z0-9_.:-]+$/i, {
    message: 'action_key must be alphanumeric with _ . : - only',
  }),
})

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'POST') {
    const { apiError } = await import('../_shared/api-error.ts')
    return apiError(405, 'Method not allowed', { correlationId: crypto.randomUUID() })
  }

  const ctx = await authenticateRequest(req)
  const body = await req.json()
  const { action, action_key } = validateRequest(BodySchema, body)

  const auditResult = await logAuditEvent({
    actorId: ctx.user.id,
    action,
    targetType: 'auth.sudo',
    targetId: ctx.user.id,
    metadata: { action_key },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
    correlationId: ctx.correlationId,
  })

  if (!auditResult.success) {
    console.error('[LOG-SUDO-EVENT] Audit write failed', auditResult)
    const { apiError } = await import('../_shared/api-error.ts')
    return apiError(500, 'Failed to persist audit event', { correlationId: ctx.correlationId })
  }

  return apiSuccess({ logged: true })
}))