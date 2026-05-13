/**
 * sudo-audit — client emitter for sudo-mode audit events.
 *
 * PLAN-AUTH-SUDO-001 / DEC-029.
 *
 * Calls the `log-sudo-event` edge function which inserts an `audit_logs` row
 * with the JWT-derived actor_id. Failures are intentionally swallowed —
 * audit-write failure must NEVER block a user's security action — but they
 * are surfaced to the console for diagnosability.
 */
import { apiClient } from '@/lib/api-client';
import { emitAuthEvent } from '@/lib/auth-events';

export type SudoAuditAction =
  | 'auth.sudo_granted'
  | 'auth.sensitive_action_performed';

export async function logSudoEvent(
  action: SudoAuditAction,
  actionKey: string,
): Promise<void> {
  // Always emit the in-memory event for immediate observability.
  emitAuthEvent(action, { action_key: actionKey });

  try {
    await apiClient.post('log-sudo-event', { action, action_key: actionKey });
  } catch (err) {
    // Audit must never block the user. Log for diagnostics only.
    // eslint-disable-next-line no-console
    console.warn('[sudo-audit] failed to persist', action, actionKey, err);
  }
}