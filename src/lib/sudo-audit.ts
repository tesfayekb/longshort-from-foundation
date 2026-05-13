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
import { ApiError, apiClient } from '@/lib/api-client';
import { emitAuthEvent } from '@/lib/auth-events';

export type SudoAuditAction =
  | 'auth.sudo_granted'
  | 'auth.sensitive_action_performed';

function newCorrelationId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export interface SudoAuditResult {
  correlation_id: string;
  persisted: boolean;
  /** Server-echoed correlation_id (success path) or correlation_id from error body. */
  server_correlation_id: string | null;
  /** True iff the client cid matches the server-returned cid. */
  correlation_id_matched: boolean;
}

export async function logSudoEvent(
  action: SudoAuditAction,
  actionKey: string,
): Promise<SudoAuditResult> {
  const correlationId = newCorrelationId();

  // Always buffer the in-memory event with the same correlation_id
  // we will send to the edge function — this is the contract under test.
  emitAuthEvent(action, { action_key: actionKey }, correlationId);

  try {
    const res = await apiClient.post<{ logged: boolean; correlation_id?: string }>(
      'log-sudo-event',
      { action, action_key: actionKey, correlation_id: correlationId },
    );
    const serverCid = res?.correlation_id ?? null;
    const matched = serverCid === correlationId;
    if (!matched) {
      // eslint-disable-next-line no-console
      console.warn('[sudo-audit] correlation_id mismatch', {
        client: correlationId,
        server: serverCid,
        action,
        action_key: actionKey,
      });
    }
    return {
      correlation_id: correlationId,
      persisted: !!res?.logged,
      server_correlation_id: serverCid,
      correlation_id_matched: matched,
    };
  } catch (err) {
    // Audit must never block the user. Log for diagnostics only and
    // surface whatever correlation_id the server attached to the error.
    const serverCid =
      err instanceof ApiError
        ? ((err as unknown as { correlation_id?: string }).correlation_id ?? null)
        : null;
    // eslint-disable-next-line no-console
    console.warn('[sudo-audit] failed to persist', action, actionKey, {
      client_correlation_id: correlationId,
      server_correlation_id: serverCid,
      error: err,
    });
    return {
      correlation_id: correlationId,
      persisted: false,
      server_correlation_id: serverCid,
      correlation_id_matched: serverCid === correlationId,
    };
  }
}