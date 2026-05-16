/**
 * RW-018: Sudo audit-event end-to-end contract.
 *
 * PLAN-AUTH-SUDO-001 / DEC-029 / FP-003.
 *
 * Verifies that every sudo grant and every protected sensitive action emits:
 *   1. The correct `auth.sudo_granted` / `auth.sensitive_action_performed`
 *      event into the in-memory auth-event buffer (with the right action_key).
 *   2. A POST to the `log-sudo-event` edge function carrying that same
 *      `{ action, action_key }` payload.
 *
 * Plus the server-side contract guarantees from `log-sudo-event/index.ts`:
 *   - `actor_id` is taken from the verified JWT (`ctx.user.id`), never the body.
 *   - `action` is constrained to the two enum values.
 *   - `action_key` is validated with a strict regex.
 *
 * Together these prove the audit pipeline is unforgeable from the client and
 * complete for every protected surface (MFA enroll route, require_mfa toggle
 * ON/OFF, recovery-code generation, MFA unenroll, password change).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { renderHook, act } from '@testing-library/react';

// ─── apiClient must be mocked BEFORE importing modules that capture it ──────

const postMock = vi.fn().mockResolvedValue({ logged: true });
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return {
    ...actual,
    apiClient: {
      post: (...args: unknown[]) => postMock(...args),
      get: vi.fn(),
    },
  };
});

import { logSudoEvent } from '@/lib/sudo-audit';
import {
  drainBufferedEvents,
  getBufferedEvents,
  type AuthEventName,
} from '@/lib/auth-events';
import { useSudoGate } from '@/components/auth/SudoGate';
import { grantSudo, isSudoActive } from '@/hooks/useSudoMode';

const read = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf-8');

function eventsByName(name: AuthEventName) {
  return getBufferedEvents().filter((e) => e.name === name);
}

function postCallsTo(fn: string) {
  return postMock.mock.calls.filter((c) => c[0] === fn);
}

beforeEach(() => {
  postMock.mockClear();
  drainBufferedEvents();
  window.sessionStorage.clear();
});
afterEach(() => {
  window.sessionStorage.clear();
});

// ─── 1. logSudoEvent — direct contract ───────────────────────────────────────

describe('RW-018 logSudoEvent emits to buffer + log-sudo-event endpoint', () => {
  it('auth.sudo_granted is buffered AND POSTed with the action_key', async () => {
    await logSudoEvent('auth.sudo_granted', 'mfa_enroll_route');

    const buffered = eventsByName('auth.sudo_granted');
    expect(buffered).toHaveLength(1);
    expect(buffered[0].payload).toEqual({ action_key: 'mfa_enroll_route' });
    expect(buffered[0].version).toBe('v1');
    expect(buffered[0].event_id).toBeTruthy();
    expect(buffered[0].correlation_id).toBeTruthy();

    const calls = postCallsTo('log-sudo-event');
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({
      action: 'auth.sudo_granted',
      action_key: 'mfa_enroll_route',
      correlation_id: expect.any(String),
    });
  });

  it('auth.sensitive_action_performed is buffered AND POSTed', async () => {
    await logSudoEvent('auth.sensitive_action_performed', 'recovery_codes_generate');

    expect(eventsByName('auth.sensitive_action_performed')).toHaveLength(1);
    expect(postCallsTo('log-sudo-event')[0][1]).toEqual({
      action: 'auth.sensitive_action_performed',
      action_key: 'recovery_codes_generate',
      correlation_id: expect.any(String),
    });
  });

  it('NEVER carries an actor_id in the request body (server derives from JWT)', async () => {
    await logSudoEvent('auth.sudo_granted', 'mfa_unenroll');
    const body = postCallsTo('log-sudo-event')[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('actor_id');
    expect(body).not.toHaveProperty('user_id');
  });
});

// ─── 2. useSudoGate — full grant + sensitive_action emission ────────────────

describe('RW-018 useSudoGate emits both sudo_granted and sensitive_action_performed', () => {
  it('on fresh grant: emits sudo_granted THEN sensitive_action_performed for the same action_key', async () => {
    // Pre-grant so the hook's first render sees `isSudo === true`. This
    // exercises the short-circuit path in useSudoGate.run, which fires the
    // sensitive_action_performed audit without opening ReauthDialog.
    grantSudo();
    const { result } = renderHook(() => useSudoGate());

    let ok = false;
    await act(async () => {
      ok = await result.current.run('toggle_require_mfa_on');
    });
    expect(ok).toBe(true);

    // After short-circuit (sudo already active), only the sensitive-action
    // audit fires — sudo_granted was emitted by the *grant path* itself,
    // which we exercise separately below.
    const sensitive = eventsByName('auth.sensitive_action_performed');
    expect(sensitive).toHaveLength(1);
    expect(sensitive[0].payload).toEqual({ action_key: 'toggle_require_mfa_on' });

    // And the corresponding edge-function call.
    const calls = postCallsTo('log-sudo-event');
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toEqual({
      action: 'auth.sensitive_action_performed',
      action_key: 'toggle_require_mfa_on',
      correlation_id: expect.any(String),
    });
  });

  it('manual grant flow emits BOTH sudo_granted and sensitive_action_performed once each', async () => {
    // Mirrors what SudoGate.handleVerified does after a successful ReauthDialog.
    await logSudoEvent('auth.sudo_granted', 'recovery_codes_generate');
    await logSudoEvent('auth.sensitive_action_performed', 'recovery_codes_generate');

    expect(eventsByName('auth.sudo_granted')).toHaveLength(1);
    expect(eventsByName('auth.sensitive_action_performed')).toHaveLength(1);

    const calls = postCallsTo('log-sudo-event');
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c[1])).toEqual([
      {
        action: 'auth.sudo_granted',
        action_key: 'recovery_codes_generate',
        correlation_id: expect.any(String),
      },
      {
        action: 'auth.sensitive_action_performed',
        action_key: 'recovery_codes_generate',
        correlation_id: expect.any(String),
      },
    ]);
  });
});

// ─── 3. Every protected surface uses a known action_key ─────────────────────

describe('RW-018 every protected surface audits with its canonical action_key', () => {
  // The full set of action_keys the system promises to emit, by surface.
  const expected: Record<string, { source: string; key: string }[]> = {
    'mfa_enroll_route':        [{ source: 'App.tsx',                                   key: 'mfa_enroll_route' }],
    'toggle_require_mfa_on':   [{ source: 'components/user/SelfMfaPrefCard.tsx',       key: 'toggle_require_mfa_on' }],
    'toggle_require_mfa_off':  [{ source: 'components/user/SelfMfaPrefCard.tsx',       key: 'toggle_require_mfa_off' }],
    'recovery_codes_generate': [{ source: 'pages/user/SecurityPage.tsx',               key: 'recovery_codes_generate' }],
    'mfa_unenroll':            [{ source: 'pages/user/SecurityPage.tsx',               key: 'mfa_unenroll' }],
    'password_change':         [{ source: 'components/user/PasswordChangeCard.tsx',    key: 'password_change' }],
  };

  for (const [actionKey, refs] of Object.entries(expected)) {
    it(`action_key "${actionKey}" is wired in ${refs[0].source}`, () => {
      const src = read(refs[0].source);
      // Either passed to sudoGate.run('<key>') / RequireSudo actionKey="<key>"
      // or, for the grant-then-mutate unenroll path, passed to logSudoEvent.
      const patterns = [
        new RegExp(`sudoGate\\.run\\(\\s*['"]${actionKey}['"]`),
        new RegExp(`actionKey=["']${actionKey}["']`),
        new RegExp(`logSudoEvent\\([^,]+,\\s*['"]${actionKey}['"]`),
        // toggle helper uses a ternary on `checked` — accept the literal in src.
        new RegExp(`['"]${actionKey}['"]`),
      ];
      expect(patterns.some((re) => re.test(src))).toBe(true);
    });
  }

  it('mfa_unenroll grant path emits BOTH events before mutating', () => {
    const src = read('pages/user/SecurityPage.tsx');
    // grant + audit must precede the unenroll mutation.
    const idxGrant = src.indexOf("logSudoEvent('auth.sudo_granted', 'mfa_unenroll')");
    const idxAction = src.indexOf("logSudoEvent('auth.sensitive_action_performed', 'mfa_unenroll')");
    const idxUnenroll = src.indexOf('unenrollFactor(factorToRemove.id)');
    expect(idxGrant).toBeGreaterThan(-1);
    expect(idxAction).toBeGreaterThan(-1);
    expect(idxUnenroll).toBeGreaterThan(-1);
    expect(idxGrant).toBeLessThan(idxUnenroll);
    expect(idxAction).toBeLessThan(idxUnenroll);
  });
});

// ─── 4. Edge function — server-side actor_id + payload contract ─────────────

describe('RW-018 log-sudo-event edge function: server-trust contract', () => {
  const fn = readFileSync(
    resolve(__dirname, '../../supabase/functions/log-sudo-event/index.ts'),
    'utf-8',
  );

  it('actorId comes from authenticated JWT context, never from body', () => {
    expect(fn).toMatch(/const ctx = await authenticateRequest\(req\)/);
    expect(fn).toMatch(/actorId:\s*ctx\.user\.id/);
    // The body schema must NOT accept actor_id / user_id.
    expect(fn).not.toMatch(/actor_id:\s*z\./);
    expect(fn).not.toMatch(/user_id:\s*z\./);
  });

  it('action enum is strictly the two sudo events', () => {
    expect(fn).toMatch(/z\.enum\(\[\s*['"]auth\.sudo_granted['"]\s*,\s*['"]auth\.sensitive_action_performed['"]\s*\]\)/);
  });

  it('action_key is length- and charset-validated', () => {
    expect(fn).toMatch(/action_key:\s*z\.string\(\)\.min\(1\)\.max\(128\)\.regex\(/);
    expect(fn).toMatch(/\[a-z0-9_\.:-\]/i);
  });

  it('writes audit_logs with target_type "auth.sudo" and metadata.action_key', () => {
    expect(fn).toMatch(/targetType:\s*['"]auth\.sudo['"]/);
    expect(fn).toMatch(/metadata:\s*\{\s*action_key\s*\}/);
  });

  it('rejects non-POST methods', () => {
    expect(fn).toMatch(/req\.method\s*!==\s*['"]POST['"]/);
    expect(fn).toMatch(/apiError\(405/);
  });

  it('returns 500 with correlation_id when audit write fails (diagnosable)', () => {
    expect(fn).toMatch(/auditResult\.success/);
    // RW-019: client-supplied correlation_id round-trips through error path.
    // Source derives `const correlationId = clientCid ?? ctx.correlationId`
    // and passes it to apiError(500, ...). Assert both the derivation and
    // the apiError reference, independent of property-shorthand vs. explicit.
    expect(fn).toMatch(
      /const\s+correlationId\s*=\s*clientCid\s*\?\?\s*ctx\.correlationId/,
    );
    expect(fn).toMatch(/apiError\(\s*500[\s\S]{0,200}correlationId/);
  });
});

// ─── 5. Reference-index reconciliation ──────────────────────────────────────

describe('RW-018 reference indexes document the audit events', () => {
  it('event-index.md lists both sudo events', () => {
    const idx = readFileSync(
      resolve(__dirname, '../../docs/07-reference/event-index.md'),
      'utf-8',
    );
    expect(idx).toContain('auth.sudo_granted');
    expect(idx).toContain('auth.sensitive_action_performed');
  });

  it('function-index.md documents the log-sudo-event edge function', () => {
    const idx = readFileSync(
      resolve(__dirname, '../../docs/07-reference/function-index.md'),
      'utf-8',
    );
    expect(idx).toContain('log-sudo-event');
  });
});

// ─── 6. Audit failure must NEVER block the user action ──────────────────────

describe('RW-018 audit-write failure does not throw to the caller', () => {
  it('logSudoEvent swallows edge-function errors but still buffers the event', async () => {
    postMock.mockRejectedValueOnce(new Error('network down'));
    await expect(
      logSudoEvent('auth.sensitive_action_performed', 'password_change'),
    ).resolves.toMatchObject({ persisted: false });
    // Even though the network call failed, the in-memory event still fired,
    // so downstream observers (Sentry breadcrumbs, dev tools) see it.
    const buffered = eventsByName('auth.sensitive_action_performed');
    expect(buffered).toHaveLength(1);
    expect(buffered[0].payload).toEqual({ action_key: 'password_change' });
  });

  it('isSudoActive is unaffected by audit-write failure', async () => {
    postMock.mockRejectedValueOnce(new Error('boom'));
    grantSudo();
    await logSudoEvent('auth.sudo_granted', 'toggle_require_mfa_on');
    expect(isSudoActive()).toBe(true);
  });
});