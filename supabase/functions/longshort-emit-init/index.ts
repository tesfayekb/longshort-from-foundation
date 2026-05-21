/**
 * longshort-emit-init — Initial audit-event emission probe for the long-short strategy.
 *
 * Purpose: prove the long-short audit pipeline end-to-end. Authenticates the caller,
 * checks longshort.view permission, and emits one audit event via the canonical
 * shared writer. First live exercise of `writeStrategyAuditEvent` (DEC-033 v4.1)
 * in production code path. AC-13 / AC-14 evidence surface.
 *
 * Audit-writer trap (T4) closure: this file imports `writeStrategyAuditEvent`
 * from `_shared/strategy-audit.ts`, NEVER `logAuditEvent` from `_shared/audit.ts`.
 * Direct INSERTs into longshort_audit_logs are also prohibited — the shared
 * helper is the sole sanctioned writer per DEC-033 v4.1 clause 4.
 *
 * Permission: longshort.view (NOT longshort.execute — execute is FP-006 territory
 * per DEC-032 clause 7).
 *
 * Method: POST (idempotent within a session via correlation_id propagation).
 */
import { createHandler, apiSuccess } from '../_shared/handler.ts'
import { authenticateRequest } from '../_shared/authenticate-request.ts'
import { checkPermissionOrThrow } from '../_shared/authorization.ts'
import { apiError } from '../_shared/api-error.ts'
import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts'

Deno.serve(createHandler(async (req: Request) => {
  if (req.method !== 'POST') {
    return apiError(405, 'Method not allowed', { correlationId: crypto.randomUUID() })
  }

  const ctx = await authenticateRequest(req)
  await checkPermissionOrThrow(ctx.user.id, 'longshort.view')

  // Emit the init audit event via the canonical shared writer (DEC-033 v4.1).
  // Fail-closed: if the audit write fails, return error rather than masking
  // the failure with a success response.
  const auditResult = await writeStrategyAuditEvent({
    strategyKey: 'longshort',
    action: 'longshort.init',
    actorId: ctx.user.id,
    correlationId: ctx.correlationId,
    ipAddress: ctx.ipAddress ?? undefined,
    userAgent: ctx.userAgent ?? undefined,
  })

  if (!auditResult.success) {
    return apiError(500, `Audit write failed: ${auditResult.code}`, {
      correlationId: auditResult.correlationId,
    })
  }

  return apiSuccess({
    audit_id: auditResult.auditId,
    correlation_id: auditResult.correlationId,
  })
}))