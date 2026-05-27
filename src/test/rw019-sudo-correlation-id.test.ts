/**
 * RW-019: Sudo audit correlation_id pipeline.
 *
 * PLAN-AUTH-SUDO-001 / DEC-029 / FP-003.
 *
 * Verifies the correlation_id contract for sudo-mode auditing:
 *   1. The client generates a single correlation_id per `logSudoEvent` call.
 *   2. That correlation_id is buffered on the in-memory `AuthEvent` AND sent
 *      in the `log-sudo-event` request body — they MUST be identical.
 *   3. On 2xx, the server echoes `correlation_id` in the response, and the
 *      client reports `correlation_id_matched: true`.
 *   4. On a 5xx error path, the client extracts `correlation_id` from the
 *      error body and still reports it alongside the original client cid.
 *   5. Static contract: the edge function accepts an optional uuid
 *      `correlation_id` in its body schema, threads it through to both
 *      `logAuditEvent({ correlationId })` and `apiError({ correlationId })`,
 *      and echoes it in the success response.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const { postMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
}));
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: { post: (...args: unknown[]) => postMock(...args), get: vi.fn() },
  };
});

import { ApiError } from '@/lib/api-client';
import { logSudoEvent } from '@/lib/sudo-audit';
import { drainBufferedEvents, getBufferedEvents } from '@/lib/auth-events';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

beforeEach(() => {
  postMock.mockReset();
  drainBufferedEvents();
});

describe('RW-019 — client correlation_id is generated, buffered, and sent', () => {
  it('uses the same correlation_id for the buffered event and the request body', async () => {
    postMock.mockImplementation((_path, body: { correlation_id: string }) =>
      Promise.resolve({ logged: true, correlation_id: body.correlation_id }),
    );

    const result = await logSudoEvent('auth.sudo_granted', 'mfa_enroll_route');

    expect(result.correlation_id).toMatch(UUID_RE);

    const [, body] = postMock.mock.calls[0];
    expect(body).toMatchObject({
      action: 'auth.sudo_granted',
      action_key: 'mfa_enroll_route',
      correlation_id: result.correlation_id,
    });

    const buffered = getBufferedEvents().filter((e) => e.name === 'auth.sudo_granted');
    expect(buffered).toHaveLength(1);
    expect(buffered[0].correlation_id).toBe(result.correlation_id);
  });

  it('generates a fresh correlation_id per call (no reuse across actions)', async () => {
    postMock.mockImplementation((_p, body: { correlation_id: string }) =>
      Promise.resolve({ logged: true, correlation_id: body.correlation_id }),
    );

    const a = await logSudoEvent('auth.sudo_granted', 'password_change');
    const b = await logSudoEvent('auth.sensitive_action_performed', 'password_change');

    expect(a.correlation_id).not.toBe(b.correlation_id);
    expect(postMock.mock.calls[0][1].correlation_id).toBe(a.correlation_id);
    expect(postMock.mock.calls[1][1].correlation_id).toBe(b.correlation_id);
  });
});

describe('RW-019 — success response echoes correlation_id', () => {
  it('reports correlation_id_matched=true when server echoes the same id', async () => {
    postMock.mockImplementation((_p, body: { correlation_id: string }) =>
      Promise.resolve({ logged: true, correlation_id: body.correlation_id }),
    );

    const r = await logSudoEvent('auth.sensitive_action_performed', 'recovery_codes_generate');

    expect(r.persisted).toBe(true);
    expect(r.server_correlation_id).toBe(r.correlation_id);
    expect(r.correlation_id_matched).toBe(true);
  });

  it('flags mismatch when server returns a different correlation_id', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    postMock.mockResolvedValueOnce({ logged: true, correlation_id: 'deadbeef-dead-beef-dead-beefdeadbeef' });

    const r = await logSudoEvent('auth.sudo_granted', 'toggle_require_mfa_on');

    expect(r.correlation_id_matched).toBe(false);
    expect(r.server_correlation_id).toBe('deadbeef-dead-beef-dead-beefdeadbeef');
    expect(warn).toHaveBeenCalledWith(
      '[sudo-audit] correlation_id mismatch',
      expect.objectContaining({ client: r.correlation_id, server: r.server_correlation_id }),
    );
    warn.mockRestore();
  });

  it('reports null server cid when server omits it (still recorded as mismatch)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    postMock.mockResolvedValueOnce({ logged: true });
    const r = await logSudoEvent('auth.sudo_granted', 'mfa_unenroll');
    expect(r.server_correlation_id).toBeNull();
    expect(r.correlation_id_matched).toBe(false);
  });
});

describe('RW-019 — error path (5xx) carries correlation_id', () => {
  it('surfaces the server correlation_id from the ApiError on 500', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const serverCid = '11111111-2222-3333-4444-555555555555';
    postMock.mockRejectedValueOnce(
      new ApiError('Failed to persist audit event', 500, 'INTERNAL_ERROR', serverCid),
    );

    const r = await logSudoEvent('auth.sudo_granted', 'password_change');

    expect(r.persisted).toBe(false);
    expect(r.correlation_id).toMatch(UUID_RE);
    expect(r.server_correlation_id).toBe(serverCid);
    // Server-issued cid does not match the client cid here — that mismatch
    // is exactly what the trace surfaces so both ends can be cross-referenced.
    expect(r.correlation_id_matched).toBe(false);

    // Buffered event still carries the original client cid for trace pairing.
    const buf = getBufferedEvents().filter((e) => e.name === 'auth.sudo_granted');
    expect(buf).toHaveLength(1);
    expect(buf[0].correlation_id).toBe(r.correlation_id);
  });

  it('returns null server cid on non-ApiError network failures, but still keeps client cid', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    postMock.mockRejectedValueOnce(new Error('network down'));
    const r = await logSudoEvent('auth.sensitive_action_performed', 'mfa_unenroll');
    expect(r.persisted).toBe(false);
    expect(r.server_correlation_id).toBeNull();
    expect(r.correlation_id).toMatch(UUID_RE);
  });
});

describe('RW-019 — log-sudo-event edge function honors client correlation_id', () => {
  const src = readFileSync(
    resolve(__dirname, '..', '..', 'supabase/functions/log-sudo-event/index.ts'),
    'utf-8',
  );

  it('schema accepts optional uuid correlation_id from the body', () => {
    expect(src).toMatch(/correlation_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/);
  });

  it('uses the client-supplied correlation_id (falling back to ctx.correlationId)', () => {
    expect(src).toMatch(/const\s+correlationId\s*=\s*clientCid\s*\?\?\s*ctx\.correlationId/);
  });

  it('threads the effective correlationId into logAuditEvent', () => {
    expect(src).toMatch(/logAuditEvent\(\{[\s\S]*correlationId,[\s\S]*\}\)/);
  });

  it('returns the same correlationId in the 500 error path', () => {
    expect(src).toMatch(/apiError\(\s*500[\s\S]*correlationId\s*\}\)/);
  });

  it('echoes the correlation_id in the success response body', () => {
    expect(src).toMatch(/apiSuccess\(\{\s*logged:\s*true,\s*correlation_id:\s*correlationId\s*\}\)/);
  });
});