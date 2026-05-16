import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from './DashboardLayout';
import { userNavigation } from '@/config/user-navigation';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { PROFILE_KEY, profileQueryFn } from '@/hooks/useProfile';
import { MFA_FACTORS_KEY, mfaFactorsQueryFn } from '@/hooks/useMfaFactors';
import { MFA_POLICY_KEY, mfaPolicyQueryFn, useMfaPolicy } from '@/hooks/useMfaPolicy';
import { ROUTES } from '@/config/routes';

/**
 * UserLayout renders the shell with RequireAuth.
 * Prefetches profile and MFA factors so child pages render instantly.
 *
 * MFA enforcement on user-layout routes is driven SOLELY by the user's own
 * preference (`profiles.require_mfa_for_self`). Panel-level policy
 * (e.g. admin) is enforced inside the relevant panel layout, not here —
 * a user with admin.access can always reach their own dashboard regardless
 * of admin-panel MFA policy. (PLAN-AUTH-MFA-POLICY-001 / DEC-028)
 */
export function UserLayout() {
  const { user, mfaStatus } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { policy, error } = useMfaPolicy();

  useEffect(() => {
    if (!user) return;
    queryClient.prefetchQuery({ queryKey: [...PROFILE_KEY], queryFn: profileQueryFn, staleTime: 30_000 });
    queryClient.prefetchQuery({ queryKey: [...MFA_FACTORS_KEY], queryFn: mfaFactorsQueryFn, staleTime: 30_000 });
    queryClient.prefetchQuery({ queryKey: [...MFA_POLICY_KEY], queryFn: mfaPolicyQueryFn, staleTime: 5 * 60 * 1000 });
  }, [user, queryClient]);

  // Enforce MFA only when the user has opted in personally.
  // Note: 'challenge_required' is already handled by RequireAuth.
  // N1: fail closed on policy fetch failure — if we can't read the policy we
  // cannot know whether the user opted in, so we require MFA enrollment.
  const selfRequired = error ? true : policy?.require_mfa_for_self === true;
  if (selfRequired && mfaStatus === 'none') {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return (
      <RequireAuth>
        <Navigate to={ROUTES.MFA_ENROLL} replace state={{ returnTo }} />
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <DashboardLayout sections={userNavigation}>
        <Outlet />
      </DashboardLayout>
    </RequireAuth>
  );
}
