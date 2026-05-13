/**
 * SelfMfaPrefCard — User-controlled "Require MFA for my account" preference.
 *
 * PLAN-AUTH-MFA-POLICY-001 / DEC-028.
 * Lives in /settings/security. Only the user themselves can toggle this.
 */
import { useCallback, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { LoadingSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { useMfaPolicy } from '@/hooks/useMfaPolicy';
import { useAuth } from '@/contexts/AuthContext';
import { ConfirmActionDialog } from '@/components/dashboard/ConfirmActionDialog';
import { Lock } from 'lucide-react';

export function SelfMfaPrefCard() {
  const { mfaStatus } = useAuth();
  const { policy, isLoading, error, updateSelfPref, isUpdatingSelfPref } = useMfaPolicy();
  const [confirmOff, setConfirmOff] = useState(false);

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

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error.message} />;
  if (!policy) return null;

  const enrolled = mfaStatus === 'enrolled';

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
          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-1">
              <Label htmlFor="self-mfa-pref" className="text-base font-medium">
                Personal MFA enforcement
              </Label>
              <p className="text-sm text-muted-foreground">
                {enrolled
                  ? 'You already have an authenticator enrolled. Toggling this only affects what happens if you remove it.'
                  : 'You currently have no authenticator. Turning this on will redirect you to the enrollment page on your next protected page load.'}
              </p>
            </div>
            <Switch
              id="self-mfa-pref"
              checked={policy.require_mfa_for_self}
              disabled={isUpdatingSelfPref}
              onCheckedChange={handleToggle}
            />
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
