import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { RequirePermission } from "@/components/auth/RequirePermission";
import { AccessDenied } from "@/components/dashboard/AccessDenied";
import { RequireVerifiedEmail } from "@/components/auth/RequireVerifiedEmail";
import { DashboardNotFound } from "@/components/dashboard/DashboardNotFound";
import { useInactivityTimeout } from "@/hooks/useInactivityTimeout";
import { lazy, useCallback } from "react";

// Public pages (eagerly loaded)
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import MfaChallenge from "./pages/MfaChallenge";
import MfaEnroll from "./pages/MfaEnroll";
import { RequireSudo } from "./components/auth/RequireSudo";

// Layouts (eagerly loaded — shell must be ready immediately)
import { AdminLayout } from "./layouts/AdminLayout";
import { TradingLayout } from "./layouts/TradingLayout";
import { UserLayout } from "./layouts/UserLayout";

// Admin pages (lazy loaded)
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsersPage = lazy(() => import("./pages/admin/AdminUsersPage"));
const AdminRolesPage = lazy(() => import("./pages/admin/AdminRolesPage"));
const AdminPermissionsPage = lazy(() => import("./pages/admin/AdminPermissionsPage"));
const AdminAuditPage = lazy(() => import("./pages/admin/AdminAuditPage"));
const AdminHealthPage = lazy(() => import("./pages/admin/AdminHealthPage"));
const AdminJobsPage = lazy(() => import("./pages/admin/AdminJobsPage"));
const AdminKillSwitchPage = lazy(() => import("./pages/admin/AdminKillSwitchPage"));
const AdminOnboardingPage = lazy(() => import("./pages/admin/AdminOnboardingPage"));
const AdminSecurityPage = lazy(() => import("./pages/admin/AdminSecurityPage"));
const UserDetailPage = lazy(() => import("./pages/admin/UserDetailPage"));
const RoleDetailPage = lazy(() => import("./pages/admin/RoleDetailPage"));

// User pages (lazy loaded)
const UserDashboard = lazy(() => import("./pages/user/UserDashboard"));
const TradingDashboard = lazy(() => import("./pages/trading/TradingDashboard"));
const LongShortDashboardPage = lazy(() => import("./pages/trading/longshort/LongShortDashboardPage"));
const UniverseMembershipPage = lazy(() => import("./pages/trading/longshort/UniverseMembershipPage"));
const UniverseRefreshHistoryPage = lazy(() => import("./pages/trading/longshort/UniverseRefreshHistoryPage"));
const ReconciliationEventsPage = lazy(() => import("./pages/trading/longshort/ReconciliationEventsPage"));
const ProfilePage = lazy(() => import("./pages/user/ProfilePage"));
const SecurityPage = lazy(() => import("./pages/user/SecurityPage"));

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // M4/N1: surface query errors that would otherwise be silently swallowed
      // by prefetchQuery and other React Query paths. Critical for diagnosability
      // of silent-fallback paths in layout prefetches.
      // eslint-disable-next-line no-console
      console.error('[query-error]', query.queryKey, error);
      Sentry.captureException(error, {
        tags: { source: 'react-query' },
        extra: { queryKey: JSON.stringify(query.queryKey) },
      });
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 minutes — admin data changes infrequently
      gcTime: 10 * 60 * 1000,   // 10 minutes — keep cache across navigation
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 5000),
    },
  },
});

/** Wraps a page with route-level permission enforcement */
function PermissionGate({ permission, children }: { permission: string | string[]; children: React.ReactNode }) {
  return (
    <RequirePermission permission={permission} fallback={<AccessDenied />}>
      {children}
    </RequirePermission>
  );
}

/** Inactivity timeout wrapper — must be inside BrowserRouter + AuthProvider */
function InactivityGuard({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const handleTimeout = useCallback(async () => {
    await signOut();
  }, [signOut]);

  useInactivityTimeout({
    onTimeout: handleTimeout,
    enabled: !!user,
  });

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <InactivityGuard>
            <Routes>
              {/* Public auth routes */}
              <Route path="/sign-in" element={<SignIn />} />
              <Route path="/sign-up" element={<SignUp />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/mfa-challenge" element={<MfaChallenge />} />

              {/* Protected — require auth + verified email */}
              <Route path="/" element={
                <RequireAuth>
                  <RequireVerifiedEmail>
                    <Index />
                  </RequireVerifiedEmail>
                </RequireAuth>
              } />
              <Route path="/mfa-enroll" element={
                <RequireAuth>
                  <RequireVerifiedEmail>
                    <RequireSudo actionKey="mfa_enroll_route" fallback="/settings/security">
                      <MfaEnroll />
                    </RequireSudo>
                  </RequireVerifiedEmail>
                </RequireAuth>
              } />

              {/* Admin panel — AdminLayout enforces admin.access, individual routes add granular permissions */}
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="users" element={
                  <PermissionGate permission="users.view_all">
                    <AdminUsersPage />
                  </PermissionGate>
                } />
                <Route path="users/:id" element={
                  <PermissionGate permission="users.view_all">
                    <UserDetailPage />
                  </PermissionGate>
                } />
                <Route path="roles" element={
                  <PermissionGate permission="roles.view">
                    <AdminRolesPage />
                  </PermissionGate>
                } />
                <Route path="roles/:id" element={
                  <PermissionGate permission="roles.view">
                    <RoleDetailPage />
                  </PermissionGate>
                } />
                <Route path="permissions" element={
                  <PermissionGate permission="permissions.view">
                    <AdminPermissionsPage />
                  </PermissionGate>
                } />
                <Route path="audit" element={
                  <PermissionGate permission="audit.view">
                    <AdminAuditPage />
                  </PermissionGate>
                } />
                <Route path="health" element={
                  <PermissionGate permission="monitoring.view">
                    <AdminHealthPage />
                  </PermissionGate>
                } />
                <Route path="jobs" element={
                  <PermissionGate permission="jobs.view">
                    <AdminJobsPage />
                  </PermissionGate>
                } />
                <Route path="onboarding" element={
                  <PermissionGate permission="users.invite">
                    <AdminOnboardingPage />
                  </PermissionGate>
                } />
                <Route path="security" element={
                  <PermissionGate permission="admin.config">
                    <AdminSecurityPage />
                  </PermissionGate>
                } />
                <Route path="kill-switch" element={
                  <RequireSudo actionKey="kill_switch_route" fallback="/admin">
                    <PermissionGate permission="system.kill_switches.manage">
                      <AdminKillSwitchPage />
                    </PermissionGate>
                  </RequireSudo>
                } />
                <Route path="*" element={<DashboardNotFound />} />
              </Route>

              {/* Trading panel — TradingLayout enforces trading.access; individual strategy routes add per-strategy permissions in future PRs */}
              <Route path="/trading" element={<TradingLayout />}>
                <Route index element={<TradingDashboard />} />
                <Route path="longshort" element={
                  <PermissionGate permission="longshort.view">
                    <LongShortDashboardPage />
                  </PermissionGate>
                } />
                <Route path="longshort/universe" element={
                  <PermissionGate permission="longshort.view">
                    <UniverseMembershipPage />
                  </PermissionGate>
                } />
                <Route path="longshort/refresh-history" element={
                  <PermissionGate permission="longshort.view">
                    <UniverseRefreshHistoryPage />
                  </PermissionGate>
                } />
                <Route path="longshort/reconciliation" element={
                  <PermissionGate permission="longshort.view">
                    <ReconciliationEventsPage />
                  </PermissionGate>
                } />
              </Route>

              {/* User panel */}
              <Route path="/dashboard" element={<UserLayout />}>
                <Route index element={<UserDashboard />} />
                <Route path="*" element={<DashboardNotFound />} />
              </Route>
              <Route path="/settings" element={<UserLayout />}>
                <Route index element={
                  <PermissionGate permission="profile.self_manage">
                    <ProfilePage />
                  </PermissionGate>
                } />
                <Route path="security" element={
                  <PermissionGate permission="mfa.self_manage">
                    <SecurityPage />
                  </PermissionGate>
                } />
                <Route path="*" element={<DashboardNotFound />} />
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </InactivityGuard>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
