/**
 * SelfMfaPrefCard — User-controlled "Require MFA for my account" preference.
 *
 * PLAN-AUTH-MFA-POLICY-001 / DEC-028.
 * Lives in /settings/security. Only the user themselves can toggle this.
 */
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { LoadingSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { useMfaPolicy } from '@/hooks/useMfaPolicy';
import { useMfaFactors } from '@/hooks/useMfaFactors';
import { ConfirmActionDialog } from '@/components/dashboard/ConfirmActionDialog';
import { Lock, ShieldAlert } from 'lucide-react';
import { ROUTES } from '@/config/routes';

export function SelfMfaPrefCard() {
  const { policy, isLoading, error, updateSelfPref, isUpdatingSelfPref } = useMfaPolicy();
  const { factors, loading: factorsLoading } = useMfaFactors();
  const [confirmOff, setConfirmOff] = useState(false);
  const navigate = useNavigate();

  const handleToggle = useCallback(async (checked: boolean) => {
    if (!checked) {
      setConfirmOff(true);
      return;
    }
    await updateSelfPref(true);
  }, [updateSelfPref]);

  const handleConfirmOff = useCallback(async () => {
    await updateSelfPref(false);
    setConfirmOff(false);
  }, [updateSelfPref]);

  if (isLoading || factorsLoading) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error.message} />;
  if (!policy) return null;

  // Authoritative: presence of a verified TOTP factor in the database.
  // Avoids drift from a stale `aal` JWT claim after unenroll.
  const enrolled = factors.some((f) => f.status === 'verified');
  const canEnable = enrolled; // Cannot require MFA without an authenticator

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            <CardTitle>Require MFA for my account</CardTitle>
          </div>
          <CardDescription>
            When enabled, you will be required to enroll an authenticator before accessing
            any of your authenticated pages. This is your personal preference — independent
            of any panel-level policy set by an administrator.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <Label htmlFor="self-mfa-pref" className="text-base font-medium">
                  Personal MFA enforcement
                </Label>
                <p className="text-sm text-muted-foreground">
                  {canEnable
                    ? 'Your authenticator is enrolled. Toggling this only affects what happens if you remove it.'
                    : 'Set up an authenticator (TOTP) first — you cannot require MFA without one enrolled.'}
                </p>
              </div>
              <Switch
                id="self-mfa-pref"
                checked={policy.require_mfa_for_self && canEnable}
                disabled={isUpdatingSelfPref || !canEnable}
                onCheckedChange={handleToggle}
                aria-describedby={!canEnable ? 'self-mfa-pref-help' : undefined}
              />
            </div>

            {!canEnable && (
              <div
                id="self-mfa-pref-help"
                className="flex items-center justify-between gap-4 rounded-lg border border-warning/30 bg-warning/5 p-3"
              >
                <div className="flex items-center gap-2 text-sm text-warning-foreground">
                  <ShieldAlert className="h-4 w-4 text-warning" />
                  <span>No authenticator configured</span>
                </div>
                <Button size="sm" onClick={() => navigate(ROUTES.MFA_ENROLL)}>
                  Set Up TOTP
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <ConfirmActionDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title="Disable personal MFA enforcement?"
        description="You can still keep your authenticator enrolled — this only removes the requirement to have one before accessing your pages."
        confirmLabel="Disable preference"
        onConfirm={handleConfirmOff}
      />
    </>
  );
}
