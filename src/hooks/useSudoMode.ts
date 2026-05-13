/**
 * useSudoMode — session-scoped "sudo mode" for sensitive-action re-auth.
 *
 * PLAN-AUTH-SUDO-001 / DEC-029 / FP-003.
 *
 * Purpose:
 *   Closes the unlocked-public-computer attack vector. Any account-takeover-
 *   relevant mutation (MFA enroll/unenroll, require-MFA toggle, password
 *   change, recovery code generation) must occur inside a sudo window opened
 *   by a successful `ReauthDialog` verification. Default window: 5 minutes.
 *
 * Storage:
 *   - sessionStorage key `auth.sudo_until` (ISO milliseconds)
 *   - Naturally cleared on tab close (sessionStorage lifecycle)
 *   - Explicitly cleared by AuthContext on signOut + updatePassword
 *
 * NOT AAL — this is "fresh credential" proof, orthogonal to MFA-elevated
 * sessions. AAL2 stays the law for unenrolled→enrolled transitions; sudo
 * stays the law for security-mutating actions.
 */
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'auth.sudo_until';
const STORAGE_EVENT = 'auth.sudo_changed';

/** Default sudo window. Server-side config (`auth.sudo_window_seconds`) is the
 *  source of truth for new grants; this is the client-side fallback only. */
export const SUDO_WINDOW_MS = 5 * 60 * 1000;

function readSudoUntil(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeSudoUntil(value: number) {
  if (typeof window === 'undefined') return;
  try {
    if (value <= 0) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(STORAGE_KEY, String(value));
    }
    // Fan out to all subscribers in this tab
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
  } catch {
    // sessionStorage may be disabled (private mode, quota). Sudo simply
    // stays inactive — protected actions will re-prompt every time.
  }
}

/** Imperative grant: set sudo expiry to now + window. */
export function grantSudo(windowMs: number = SUDO_WINDOW_MS): number {
  const until = Date.now() + Math.max(0, windowMs);
  writeSudoUntil(until);
  return until;
}

/** Imperative clear — call from signOut, password change, or on demand. */
export function clearSudo() {
  writeSudoUntil(0);
}

/** Imperative check — useful for guard functions / event handlers. */
export function isSudoActive(): boolean {
  return readSudoUntil() > Date.now();
}

export interface UseSudoModeResult {
  /** True iff `sudo_until > now`. Reactive — re-renders on grant/clear/expiry. */
  isSudo: boolean;
  /** Milliseconds remaining (0 if expired). */
  remainingMs: number;
  grantSudo: (windowMs?: number) => number;
  clearSudo: () => void;
}

/**
 * React hook that subscribes to sudo state and keeps `isSudo` accurate as the
 * window expires. Re-evaluates every second while sudo is active.
 */
export function useSudoMode(): UseSudoModeResult {
  const [until, setUntil] = useState<number>(() => readSudoUntil());

  useEffect(() => {
    const sync = () => setUntil(readSudoUntil());
    window.addEventListener(STORAGE_EVENT, sync);
    // cross-tab safety (not strictly needed — sessionStorage is per-tab —
    // but cheap insurance if a future change moves to localStorage)
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(STORAGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // Tick once a second while sudo is active so `isSudo` flips to false on
  // the exact expiry boundary without requiring user interaction.
  useEffect(() => {
    if (until <= Date.now()) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      if (until <= now) {
        setUntil(0);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [until]);

  const remainingMs = Math.max(0, until - Date.now());
  const isSudo = remainingMs > 0;

  const grant = useCallback((windowMs?: number) => {
    const next = grantSudo(windowMs);
    setUntil(next);
    return next;
  }, []);

  const clear = useCallback(() => {
    clearSudo();
    setUntil(0);
  }, []);

  return { isSudo, remainingMs, grantSudo: grant, clearSudo: clear };
}