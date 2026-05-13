/**
 * RW-017: Sensitive-Action Sudo Mode protection.
 *
 * PLAN-AUTH-SUDO-001 / DEC-029 / FP-003.
 *
 * Verifies that every account-takeover-relevant surface is gated behind a
 * fresh-credential sudo window:
 *   - /mfa-enroll route                   (RequireSudo guard)
 *   - require_mfa_for_self toggle ON/OFF  (useSudoGate.run)
 *   - recovery-code generation            (useSudoGate.run)
 *   - MFA unenroll                        (ReauthDialog → grantSudo)
 *
 * And that sudo expiry forces a fresh re-prompt:
 *   - grantSudo() opens a bounded window (default 5 min)
 *   - isSudoActive() returns false once `sudo_until` ≤ now
 *   - useSudoGate.run() opens ReauthDialog when sudo is inactive,
 *     resolves immediately when sudo is active.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { renderHook, act } from '@testing-library/react';
import {
  grantSudo,
  clearSudo,
  isSudoActive,
  useSudoMode,
  SUDO_WINDOW_MS,
} from '@/hooks/useSudoMode';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf-8');

// ─── Static wiring guarantees ────────────────────────────────────────────────

describe('RW-017 wiring: every sensitive surface goes through sudo', () => {
  it('App.tsx wraps /mfa-enroll in <RequireSudo>', () => {
    const app = read('App.tsx');
    // Find the /mfa-enroll route block and assert RequireSudo sits inside it,
    // before <MfaEnroll />.
    const mfaIdx = app.indexOf('"/mfa-enroll"');
    expect(mfaIdx).toBeGreaterThan(-1);
    const block = app.slice(mfaIdx, mfaIdx + 600);
    expect(block).toMatch(/<RequireSudo[^>]*actionKey="mfa_enroll_route"/);
    expect(block.indexOf('<RequireSudo')).toBeLessThan(block.indexOf('<MfaEnroll'));
  });

  it('SelfMfaPrefCard gates BOTH on and off toggles via sudoGate.run', () => {
    const src = read('components/user/SelfMfaPrefCard.tsx');
    expect(src).toContain("import { useSudoGate } from '@/components/auth/SudoGate'");
    expect(src).toContain('toggle_require_mfa_on');
    expect(src).toContain('toggle_require_mfa_off');
    // The gate must be awaited and short-circuit on cancel.
    expect(src).toMatch(/const ok = await sudoGate\.run\(/);
    expect(src).toMatch(/if \(!ok\) return/);
    // Modal must actually be rendered.
    expect(src).toContain('{sudoGate.element}');
  });

  it('SecurityPage gates recovery-code generation via sudoGate.run', () => {
    const src = read('pages/user/SecurityPage.tsx');
    expect(src).toContain("sudoGate.run('recovery_codes_generate')");
    // Must short-circuit on cancel before calling the inner generator.
    const handlerIdx = src.indexOf('handleGenerateRecoveryCodes');
    expect(handlerIdx).toBeGreaterThan(-1);
    const handler = src.slice(handlerIdx, handlerIdx + 400);
    expect(handler).toMatch(/if \(!ok\) return/);
    expect(handler).toMatch(/generateRecoveryCodesInner\(\)/);
    expect(src).toContain('{sudoGate.element}');
  });

  it('SecurityPage MFA unenroll requires ReauthDialog before mutation, then grants sudo', () => {
    const src = read('pages/user/SecurityPage.tsx');
    // handleRequestUnenroll opens reauth — never calls unenrollFactor directly.
    expect(src).toMatch(/handleRequestUnenroll[\s\S]{0,200}setShowReauth\(true\)/);
    // The verified callback must grant sudo and audit before mutating.
    const verifiedIdx = src.indexOf('handleReauthVerified');
    expect(verifiedIdx).toBeGreaterThan(-1);
    const verified = src.slice(verifiedIdx, verifiedIdx + 800);
    expect(verified).toContain('grantSudo()');
    expect(verified).toContain("logSudoEvent('auth.sudo_granted', 'mfa_unenroll')");
    expect(verified).toContain('unenrollFactor(factorToRemove.id)');
    // Order matters: grantSudo / audit must precede unenrollFactor.
    expect(verified.indexOf('grantSudo()')).toBeLessThan(verified.indexOf('unenrollFactor'));
  });

  it('PasswordChangeCard gates password change via sudoGate.run', () => {
    const src = read('components/user/PasswordChangeCard.tsx');
    expect(src).toContain("sudoGate.run('password_change')");
  });

  it('AuthContext clears sudo on signOut and updatePassword', () => {
    const src = read('contexts/AuthContext.tsx');
    expect(src).toMatch(/import[^;]*clearSudo[^;]*from ['"]@\/hooks\/useSudoMode['"]/);
    // signOut → clearSudo
    const signOutIdx = src.indexOf('signOut');
    expect(signOutIdx).toBeGreaterThan(-1);
    expect(src.indexOf('clearSudo()', signOutIdx)).toBeGreaterThan(-1);
    // updatePassword → clearSudo
    const updatePwIdx = src.indexOf('updatePassword');
    expect(updatePwIdx).toBeGreaterThan(-1);
    expect(src.indexOf('clearSudo()', updatePwIdx)).toBeGreaterThan(-1);
  });
});

// ─── Behavioral: sudo lifecycle (grant / expiry / re-prompt) ────────────────

describe('RW-017 behavior: sudo grant / expiry / re-prompt', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    window.sessionStorage.clear();
  });

  it('starts with no active sudo', () => {
    expect(isSudoActive()).toBe(false);
  });

  it('grantSudo() opens a bounded sudo window', () => {
    grantSudo();
    expect(isSudoActive()).toBe(true);
    // Just before expiry → still active.
    vi.advanceTimersByTime(SUDO_WINDOW_MS - 1000);
    expect(isSudoActive()).toBe(true);
    // Past expiry → forces a re-prompt.
    vi.advanceTimersByTime(2000);
    expect(isSudoActive()).toBe(false);
  });

  it('clearSudo() invalidates the window immediately', () => {
    grantSudo();
    expect(isSudoActive()).toBe(true);
    clearSudo();
    expect(isSudoActive()).toBe(false);
    expect(window.sessionStorage.getItem('auth.sudo_until')).toBeNull();
  });

  it('useSudoMode reflects grant and expiry reactively', () => {
    const { result } = renderHook(() => useSudoMode());
    expect(result.current.isSudo).toBe(false);

    act(() => {
      result.current.grantSudo();
    });
    expect(result.current.isSudo).toBe(true);

    // Tick past expiry — the internal 1s interval flips isSudo to false.
    act(() => {
      vi.advanceTimersByTime(SUDO_WINDOW_MS + 1500);
    });
    expect(result.current.isSudo).toBe(false);
    expect(result.current.remainingMs).toBe(0);
  });

  it('useSudoMode.clearSudo() forces a re-prompt before expiry', () => {
    const { result } = renderHook(() => useSudoMode());
    act(() => {
      result.current.grantSudo();
    });
    expect(result.current.isSudo).toBe(true);
    act(() => {
      result.current.clearSudo();
    });
    expect(result.current.isSudo).toBe(false);
  });

  it('window persists in sessionStorage so an in-tab reload does not re-prompt', () => {
    grantSudo();
    const stored = window.sessionStorage.getItem('auth.sudo_until');
    expect(stored).not.toBeNull();
    // Simulate fresh hook mount (e.g. component remount) — reads from storage.
    const { result } = renderHook(() => useSudoMode());
    expect(result.current.isSudo).toBe(true);
  });
});

// ─── Behavioral: useSudoGate prompts iff sudo inactive ──────────────────────

describe('RW-017 behavior: useSudoGate.run() prompt vs short-circuit', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });
  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('resolves immediately when sudo is active (no prompt)', async () => {
    grantSudo();
    // Dynamic import to get a fresh module bound to the cleared storage state.
    const { useSudoGate } = await import('@/components/auth/SudoGate');
    const { result } = renderHook(() => useSudoGate());
    const ok = await result.current.run('toggle_require_mfa_on');
    expect(ok).toBe(true);
  });

  it('returns a pending promise when sudo is inactive (dialog opens)', async () => {
    clearSudo();
    const { useSudoGate } = await import('@/components/auth/SudoGate');
    const { result } = renderHook(() => useSudoGate());
    let settled = false;
    const pending = result.current.run('recovery_codes_generate').then((v) => {
      settled = true;
      return v;
    });
    // Yield once — promise must remain pending until ReauthDialog verifies.
    await Promise.resolve();
    expect(settled).toBe(false);
    // Cleanly settle so vitest doesn't see an unhandled pending promise.
    void pending;
  });

  it('after sudo expires, the next run() call must re-prompt', async () => {
    vi.useFakeTimers();
    try {
      grantSudo();
      const { useSudoGate } = await import('@/components/auth/SudoGate');
      const { result, rerender } = renderHook(() => useSudoGate());

      // First call: sudo active → resolves true without prompting.
      const first = await result.current.run('first_action');
      expect(first).toBe(true);

      // Advance past expiry, re-render to pick up new isSudo value.
      act(() => {
        vi.advanceTimersByTime(SUDO_WINDOW_MS + 2000);
      });
      rerender();

      // Second call: sudo expired → must NOT short-circuit; promise pending.
      let settled = false;
      void result.current.run('second_action').then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(isSudoActive()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});