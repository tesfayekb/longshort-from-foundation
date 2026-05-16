import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from './DashboardLayout';
import { tradingNavigation } from '@/config/trading-navigation';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { RequirePermission } from '@/components/auth/RequirePermission';
import { AccessDenied } from '@/components/dashboard/AccessDenied';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ROUTES } from '@/config/routes';
import { USER_ROLES_KEY } from '@/hooks/useUserRoles';
import { MFA_POLICY_KEY, mfaPolicyQueryFn, useMfaPolicy } from '@/hooks/useMfaPolicy';
import { supabase } from '@/integrations/supabase/client';
import * as Sentry from '@sentry/react';

/**
 * TradingLayout renders the shell unconditionally (sidebar + header),
 * then permission-gates the content area with `trading.access`.
 * AccessDenied renders INSIDE the shell so navigation remains usable.
 *
 * MFA enforcement: users without MFA enrolled and panels.trading === 'required'
 * are redirected to /mfa-enroll. Data-driven (DEC-028 panel policy mechanism).
 *
 * Per DEC-031 sub-point 9: TradingLayout participates in the MFA policy mechanism.
 * Per DEC-031 sub-point 10: trading.access is NOT granted to admin or user roles
 *   by default — admins create trader-class roles after deployment.
 * Per DEC-031 sub-point 6: TradingLayout itself imports only from platform modules
 *   (auth, RBAC primitives, DashboardLayout). The narrow carve-out for importing
 *   from strategy index.ts façades lives in src/config/trading-navigation.ts —
 *   NOT here.
 */
export function TradingLayout() {
  const { mfaStatus, user } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  const prefetchedRef = useRef(false);

  if (user && !prefetchedRef.current) {
    prefetchedRef.current = true;
    queryClient.prefetchQuery({
      queryKey: [...USER_ROLES_KEY],
      queryFn: async () => {
        const { data, error } = await supabase.rpc(
          'get_my_authorization_context',
        );
        if (error || !data) {
          // M4: silent fallback is fail-closed (empty perms → AccessDenied), but
          // must be visible. Empty-perms behavior preserved; observability added.
          // eslint-disable-next-line no-console
          console.error('[trading-layout] get_my_authorization_context failed', error);
          Sentry.captureException(
            error ?? new Error('get_my_authorization_context returned no data'),
            { tags: { source: 'auth-context-prefetch', layout: 'trading' } },
          );
          return { roles: [], permissions: [], is_superadmin: false };
        }
        const ctx = data as unknown as {
          roles: string[];
          permissions: string[];
          is_superadmin: boolean;
        };
        return {
          roles: ctx.roles ?? [],
          permissions: ctx.permissions ?? [],
          is_superadmin: ctx.is_superadmin ?? false,
        };
      },
      staleTime: 5 * 60 * 1000,
    });
    queryClient.prefetchQuery({
      queryKey: [...MFA_POLICY_KEY],
      queryFn: mfaPolicyQueryFn,
      staleTime: 5 * 60 * 1000,
    });
  }

  useEffect(() => {
    prefetchedRef.current = false;
  }, [user?.id]);

  return (
    <RequireAuth>
      <RequireMfaForTrading mfaStatus={mfaStatus} returnTo={returnTo}>
        <DashboardLayout sections={tradingNavigation}>
          <RequirePermission
            permission="trading.access"
            fallback={
              <AccessDenied message="You need trading panel access to view this page." />
            }
          >
            <Outlet />
          </RequirePermission>
        </DashboardLayout>
      </RequireMfaForTrading>
    </RequireAuth>
  );
}

function RequireMfaForTrading({
  mfaStatus,
  returnTo,
  children,
}: {
  mfaStatus: string;
  returnTo: string;
  children: React.ReactNode;
}) {
  const { policy, error } = useMfaPolicy();
  // N1: fail closed on MFA policy fetch failure. A transient backend outage
  // can never silently bypass DEC-028 enforcement. The QueryCache.onError
  // handler logs the underlying error to Sentry; this just decides routing.
  // Loading state (policy undefined, no error) preserves current pass-through.
  const tradingRequired = error ? true : policy?.panels?.trading === 'required';
  if (tradingRequired && mfaStatus === 'none') {
    return <Navigate to={ROUTES.MFA_ENROLL} replace state={{ returnTo }} />;
  }
  return <>{children}</>;
}
