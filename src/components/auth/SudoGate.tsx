/**
 * SudoGate — opens ReauthDialog when sudo is not active, then runs `onSudo`.
 *
 * PLAN-AUTH-SUDO-001 / DEC-029.
 *
 * Usage (programmatic, recommended for action handlers):
 *
 *     const sudo = useSudoMode();
 *     const sudoGate = useSudoGate();
 *     async function handleEnableMfa() {
 *       const ok = await sudoGate.run('toggle_require_mfa_on');
 *       if (!ok) return;
 *       // …perform sensitive action
 *     }
 *
 * The hook returns a Promise that resolves true on successful reauth,
 * false on cancel — easier to compose than callback-based dialogs.
 */
import { useCallback, useRef, useState } from 'react';
import { ReauthDialog } from '@/components/auth/ReauthDialog';
import { useSudoMode } from '@/hooks/useSudoMode';
import { logSudoEvent } from '@/lib/sudo-audit';

export interface UseSudoGateResult {
  /** Modal element — render once near the top of the component. */
  element: React.ReactNode;
  /**
   * Request sudo for `actionKey`. If sudo is already active, resolves true
   * immediately (and audits `auth.sensitive_action_performed`). Otherwise
   * opens ReauthDialog; resolves true on verified, false on cancel.
   */
  run: (actionKey: string) => Promise<boolean>;
}

export function useSudoGate(): UseSudoGateResult {
  const { isSudo, grantSudo } = useSudoMode();
  const [open, setOpen] = useState(false);
  const [actionKey, setActionKey] = useState<string>('');
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const settle = useCallback((ok: boolean) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setOpen(false);
    if (resolver) resolver(ok);
  }, []);

  const run = useCallback(
    (key: string): Promise<boolean> => {
      if (isSudo) {
        // Already in sudo window — fire-and-forget audit, no prompt.
        void logSudoEvent('auth.sensitive_action_performed', key);
        return Promise.resolve(true);
      }
      setActionKey(key);
      setOpen(true);
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
      });
    },
    [isSudo],
  );

  const handleVerified = useCallback(() => {
    grantSudo();
    void logSudoEvent('auth.sudo_granted', actionKey);
    void logSudoEvent('auth.sensitive_action_performed', actionKey);
    settle(true);
  }, [grantSudo, actionKey, settle]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && resolverRef.current) {
        // Dialog dismissed without verification.
        settle(false);
      } else {
        setOpen(next);
      }
    },
    [settle],
  );

  const element = (
    <ReauthDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Verify Your Identity"
      description="For your security, please re-confirm your identity before performing this sensitive action."
      onVerified={handleVerified}
    />
  );

  return { element, run };
}