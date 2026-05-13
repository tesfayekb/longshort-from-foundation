/**
 * AdminSecurityPage — Superadmin-only MFA enforcement policy controls.
 *
 * Route: /admin/security
 * Permission: admin.config (page-level gate in App.tsx).
 * Additional gate: superadmin only (renders AccessDenied otherwise).
 *
 * PLAN-AUTH-MFA-POLICY-001 / DEC-028.
 */
import { useCallback, useState } from 'react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingSkeleton } from '@/components/dashboard/LoadingSkeleton';
import { ErrorState } from '@/components/dashboard/ErrorState';
import { AccessDenied } from '@/components/dashboard/AccessDenied';
import { ReauthDialog } from '@/components/auth/ReauthDialog';
import { useMfaPolicy, type PanelEnforcement } from '@/hooks/useMfaPolicy';
import { useUserRoles } from '@/hooks/useUserRoles';
import { ShieldCheck, Info } from 'lucide-react';

const PANEL_LABELS: Record<string, { title: string; description: string }> = {
  admin: {
    title: 'Admin panel',
    description: 'Require MFA enrollment for any user with admin.access before they can enter the admin panel.',
  },
};

export default function AdminSecurityPage() {
  const { is_superadmin } = useUserRoles();
  const { policy, isLoading, error, updatePolicy, isUpdatingPolicy } = useMfaPolicy();
  const [pending, setPending] = useState<{ panel: string; value: PanelEnforcement } | null>(null);
  const [reauthOpen, setReauthOpen] = useState(false);

  const handleToggle = useCallback((panel: string, required: boolean) => {
    setPending({ panel, value: required ? 'required' : 'optional' });
    setReauthOpen(true);
  }, []);

  const handleReauthVerified = useCallback(async () => {
    if (!pending) return;
    try {
      await updatePolicy({ [pending.panel]: pending.value });
    } finally {
      setPending(null);
    }
  }, [pending, updatePolicy]);

  if (!is_superadmin) {
    return <AccessDenied message="Only superadmins can manage the MFA enforcement policy." />;
  }
  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error.message} />;
  if (!policy) return null;

  const panelKeys = Object.keys(policy.panels);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security"
        subtitle="Per-panel multi-factor authentication enforcement"
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          When a panel is set to <strong>required</strong>, any user with access to that panel
          must enroll MFA before entering. This does not affect their access to their own
          dashboard. Users who have already enrolled MFA continue to be challenged on every
          login regardless of this setting.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle>Panel MFA enforcement</CardTitle>
          </div>
          <CardDescription>
            Toggle MFA requirement per panel. Changes are audited and require recent reauthentication.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {panelKeys.map((key) => {
            const value = policy.panels[key];
            const meta = PANEL_LABELS[key] ?? { title: key, description: 'Custom panel.' };
            return (
              <div key={key} className="flex items-start justify-between gap-4 rounded-lg border p-4">
                <div className="space-y-1">
                  <Label htmlFor={`mfa-${key}`} className="text-base font-medium">
                    {meta.title}
                  </Label>
                  <p className="text-sm text-muted-foreground">{meta.description}</p>
                  <p className="text-xs text-muted-foreground">
                    Currently: <span className="font-mono">{value}</span>
                  </p>
                </div>
                <Switch
                  id={`mfa-${key}`}
                  checked={value === 'required'}
                  disabled={isUpdatingPolicy}
                  onCheckedChange={(checked) => handleToggle(key, checked)}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <ReauthDialog
        open={reauthOpen}
        onOpenChange={(open) => {
          setReauthOpen(open);
          if (!open) setPending(null);
        }}
        onVerified={handleReauthVerified}
        title="Confirm MFA policy change"
        description="This change is audited. Please verify your identity to continue."
      />
    </div>
  );
}
