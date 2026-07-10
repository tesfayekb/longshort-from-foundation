/**
 * writeStrategyAuditEvent — Append-only writer for per-strategy audit tables.
 *
 * Owner: strategy-module-pattern (platform-tier helper; sibling to audit-logging
 *        per DEC-033 v4.1 clause 1).
 * Classification: audit-critical
 * Lifecycle: active
 *
 * Sole sanctioned writer for any `<strategy>_audit_logs` table. Closes the T4
 * audit-writer trap: strategy code MUST NOT import `logAuditEvent` from
 * `_shared/audit.ts` (which is hardcoded to platform `audit_logs`). Per
 * DEC-033 v4.1 clause 4, per-strategy local writers are PROHIBITED.
 *
 * Contract (DEC-033 v4.1 clause 2):
 *   - Target table is `${strategyKey}_audit_logs`, resolved from a static
 *     module-load-time registry of known strategy keys.
 *   - Metadata sanitization mirrors platform `_shared/audit.ts` allowlist
 *     (parity-by-duplication; sanitizeMetadata is not exported from audit.ts).
 *   - Returns a structured discriminated union; never throws.
 *   - Failures emit a `strategy_audit.write_failed` console log carrying
 *     `{ strategyKey, action, correlationId, code, reason }`.
 *   - `correlation_id` is written to BOTH the top-level column and inside
 *     metadata JSON (mirrors audit.ts).
 *   - Append-only is enforced at the DB level via RLS (see MIG-038); the
 *     helper exposes no UPDATE / DELETE path.
 *   - Action-name format `<strategy>.<verb>` is NOT validated at runtime;
 *     enforcement is via event-index.md pre-registration (per AC-04).
 *
 * Column mapping (per FP-005 AC-10 + DEC-032 clause 1):
 *   - `params.actorId` → `operator_id` column (NOT `actor_id`).
 *   - When `actorId` is absent, the default operator UUID is used.
 */
import { supabaseAdmin } from './supabase-admin.ts'

// ─── Public contract (DEC-033 v4.1 clause 2 — interface surface locked) ─────

export interface WriteStrategyAuditEventParams {
  strategyKey: string
  action: string
  actorId?: string
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
  correlationId: string
  ipAddress?: string
  userAgent?: string
}

export type StrategyAuditWriteResult =
  | { success: true; auditId: string; correlationId: string }
  | { success: false; code: string; reason: string; correlationId: string }

// ─── Registry of known strategy keys ────────────────────────────────────────
// Static, module-load-time set. A typo here surfaces at module load (deploy
// time) per DEC-033 v4.1 clause 3. Unknown keys at call time return a
// structured failure with code `'unknown_strategy_key'` — they do NOT throw.

export const KNOWN_STRATEGY_KEYS: ReadonlySet<string> = new Set<string>([
  'longshort',
  'overshoot',
])

// Default operator UUID for system-originated events (per FP-005 AC-10 +
// DEC-032 clause 1 + DEC-031 sub-point 5). Used when `params.actorId` is
// absent.
export const DEFAULT_OPERATOR_ID = '00000000-0000-0000-0000-000000000001'

// ─── Pure helpers (exported for unit testing per AC-05) ─────────────────────

/** Resolve the per-strategy audit table name from a known strategy key. */
export function resolveStrategyAuditTable(strategyKey: string): string {
  return `${strategyKey}_audit_logs`
}

/** Whether the given strategy key is registered. */
export function isKnownStrategyKey(strategyKey: string): boolean {
  return KNOWN_STRATEGY_KEYS.has(strategyKey)
}

/** Forbidden keys that must never appear in audit metadata (platform parity). */
const FORBIDDEN_METADATA_KEYS = new Set([
  'password', 'token', 'secret', 'access_token', 'refresh_token',
  'mfa_secret', 'totp_secret', 'api_key', 'service_role_key',
  'code_hash', 'recovery_code', 'otp', 'otp_code', 'totp_code',
  'private_key', 'private_key_id', 'client_secret', 'webhook_secret',
])

/** Redact forbidden keys in metadata (mirrors _shared/audit.ts). */
export function sanitizeStrategyMetadata(
  metadata: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]'
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

// ─── Main export ────────────────────────────────────────────────────────────

export async function writeStrategyAuditEvent(
  params: WriteStrategyAuditEventParams
): Promise<StrategyAuditWriteResult> {
  const correlationId = params.correlationId

  if (!isKnownStrategyKey(params.strategyKey)) {
    const failure: StrategyAuditWriteResult = {
      success: false,
      code: 'unknown_strategy_key',
      reason: `strategyKey '${params.strategyKey}' is not in KNOWN_STRATEGY_KEYS registry`,
      correlationId,
    }
    logStrategyAuditFailure(params, failure)
    return failure
  }

  try {
    const safeMetadata = sanitizeStrategyMetadata(params.metadata ?? {})
    safeMetadata.correlation_id = correlationId

    const table = resolveStrategyAuditTable(params.strategyKey)

    const { data, error } = await supabaseAdmin
      .from(table)
      .insert({
        operator_id: params.actorId ?? DEFAULT_OPERATOR_ID,
        action: params.action,
        target_type: params.targetType ?? null,
        target_id: params.targetId ?? null,
        metadata: safeMetadata,
        ip_address: params.ipAddress ?? null,
        user_agent: params.userAgent ?? null,
        correlation_id: correlationId,
      })
      .select('id')
      .single()

    if (error) {
      const code = classifyDbError(error.message)
      const failure: StrategyAuditWriteResult = {
        success: false,
        code,
        reason: error.message,
        correlationId,
      }
      logStrategyAuditFailure(params, failure)
      return failure
    }

    return {
      success: true,
      auditId: data.id,
      correlationId,
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown strategy audit error'
    const failure: StrategyAuditWriteResult = {
      success: false,
      code: 'unexpected_error',
      reason,
      correlationId,
    }
    logStrategyAuditFailure(params, failure)
    return failure
  }
}

// ─── ACT-497 H2 — non-blocking alerts dispatcher notifier ───────────────
//
// Fires AFTER a successful strategy-audit write when the action matches an
// alert-tagged pattern AND `ALERTS_DISPATCHER_URL` env var is configured.
// Wrapped in try/catch with a 3-second hard timeout — a failed notify NEVER
// blocks the audit write or the engine call. Belt-and-suspenders alongside
// the 5-min pg_cron watchdog scan.
//
// Money-path immutable: this is a fire-and-forget notification. Alert
// delivery failure does not affect engine outcome.

const ALERT_TAGGED_ACTIONS: ReadonlyMap<string, { severity: 'CRITICAL'|'HIGH'|'INFO'; kind: string }> = new Map([
  ['overshoot.entry.run.failed',     { severity: 'HIGH',     kind: 'engine_failed_entry'     }],
  ['overshoot.exit.run.failed',      { severity: 'HIGH',     kind: 'engine_failed_exit'      }],
  ['overshoot.detection.run.failed', { severity: 'HIGH',     kind: 'engine_failed_detection' }],
  ['overshoot.fill_sweep.shortfall', { severity: 'HIGH',     kind: 'fill_sweep_shortfall'    }],
  ['overshoot.reconciliation.divergent', { severity: 'CRITICAL', kind: 'a5_reconciliation_divergence' }],
])

export function shouldNotifyAlert(action: string): boolean {
  return ALERT_TAGGED_ACTIONS.has(action)
}

async function notifyAlertsDispatcher(
  params: WriteStrategyAuditEventParams,
  auditId: string,
): Promise<void> {
  const url = Deno.env.get('ALERTS_DISPATCHER_URL') ?? ''
  if (!url) return
  const tag = ALERT_TAGGED_ACTIONS.get(params.action)
  if (!tag) return

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3_000)
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        mode: 'push',
        trigger_kind: tag.kind,
        severity: tag.severity,
        source_table: `${params.strategyKey}_audit_logs`,
        source_row_id: auditId,
        subject: `${params.strategyKey}: ${params.action}`,
        body_preview: `action=${params.action} target=${params.targetType ?? '-'}/${params.targetId ?? '-'} metadata=${JSON.stringify(params.metadata ?? {}).slice(0, 500)}`,
        correlation_id: params.correlationId,
      }),
    })
  } catch (err) {
    console.warn('[strategy_audit.notify_failed]', {
      action: params.action,
      correlationId: params.correlationId,
      reason: err instanceof Error ? err.message : String(err),
    })
  } finally {
    clearTimeout(timer)
  }
}

// Wrap main export at module scope: monkey-patch the original with the
// post-write notifier. We keep the original as a private symbol so tests
// can still exercise the pure write path.
const _writeStrategyAuditEvent_pure = writeStrategyAuditEvent
export async function writeStrategyAuditEventWithAlerts(
  params: WriteStrategyAuditEventParams,
): Promise<StrategyAuditWriteResult> {
  const result = await _writeStrategyAuditEvent_pure(params)
  if (result.success && shouldNotifyAlert(params.action)) {
    // Fire and forget — do NOT await.
    void notifyAlertsDispatcher(params, result.auditId)
  }
  return result
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * Classify a DB error message into the stable failure-code vocabulary
 * (DEC-033 v4.1 clause 2). Conservative — unknown messages map to
 * `'db_unreachable'` (the most common transport-level failure).
 */
function classifyDbError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('row-level security') || m.includes('rls') || m.includes('permission denied')) {
    return 'rls_denied'
  }
  return 'db_unreachable'
}

function logStrategyAuditFailure(
  params: WriteStrategyAuditEventParams,
  failure: Extract<StrategyAuditWriteResult, { success: false }>
): void {
  console.error('[strategy_audit.write_failed]', {
    strategyKey: params.strategyKey,
    action: params.action,
    correlationId: failure.correlationId,
    code: failure.code,
    reason: failure.reason,
  })
}