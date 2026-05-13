/**
 * RequireSudo — route guard that requires an active sudo window.
 *
 * PLAN-AUTH-SUDO-001 / DEC-029 / FP-003.
 *
 * Behavior:
 *   - If `isSudo` is true → renders children.
 *   - If not → renders ReauthDialog. On verified, grants sudo and renders
 *     children. On cancel, navigates to `fallback` (default: previous page,
 *     falling back to /settings/security).
 *
 * Use for top-level routes whose mere presence is a sensitive action
 * (e.g. /mfa-enroll). For inline button handlers, prefer `useSudoGate()`.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReauthDialog } from '@/components/auth/ReauthDialog';
import { useSudoMode } from '@/hooks/useSudoMode';
import { logSudoEvent } from '@/lib/sudo-audit';

interface RequireSudoProps {
  /** Audit identifier for the protected action (e.g. "mfa_enroll_route"). */
  actionKey: string;
  /** Where to send the user if they cancel. */
  fallback?: string;
  children: ReactNode;
}

export function RequireSudo({ actionKey, fallback = '/settings/security', children }: RequireSudoProps) {
  const { isSudo, grantSudo } = useSudoMode();
  const navigate = useNavigate();
  const [open, setOpen] = useState(!isSudo);

  // Keep the dialog state in sync if sudo is granted from elsewhere.
  useEffect(() => {
    if (isSudo) setOpen(false);
  }, [isSudo]);

  const handleVerified = useCallback(() => {
    grantSudo();
    void logSudoEvent('auth.sudo_granted', actionKey);
    void logSudoEvent('auth.sensitive_action_performed', actionKey);
    setOpen(false);
  }, [actionKey, grantSudo]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !isSudo) {
        // Cancelled without verifying — bounce back.
        navigate(fallback, { replace: true });
        return;
      }
      setOpen(next);
    },
    [isSudo, navigate, fallback],
  );

  if (isSudo) return <>{children}</>;

  return (
    <ReauthDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Verify Identity to Continue"
      description="This page lets you change a security-critical setting. Please re-confirm your identity to continue."
      onVerified={handleVerified}
    />
  );
}