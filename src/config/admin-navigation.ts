import { LayoutDashboard, Users, Shield, Key, FileText, Activity, Cog, UserPlus, ShieldCheck, Plug, Power } from 'lucide-react';
import type { NavSection } from './navigation.types';
import { ROUTES } from './routes';

export const adminNavigation: NavSection[] = [
  {
    label: 'Overview',
    items: [
      {
        title: 'Dashboard',
        url: ROUTES.ADMIN,
        icon: LayoutDashboard,
        permission: 'admin.access',
      },
    ],
  },
  {
    label: 'User Management',
    items: [
      {
        title: 'Users',
        url: ROUTES.ADMIN_USERS,
        icon: Users,
        permission: 'users.view_all',
      },
      {
        title: 'Invitations',
        url: ROUTES.ADMIN_ONBOARDING,
        icon: UserPlus,
        permission: 'users.invite',
      },
    ],
  },
  {
    label: 'Access Control',
    items: [
      {
        title: 'Roles',
        url: ROUTES.ADMIN_ROLES,
        icon: Shield,
        permission: 'roles.view',
      },
      {
        title: 'Permissions',
        url: ROUTES.ADMIN_PERMISSIONS,
        icon: Key,
        permission: 'permissions.view',
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        title: 'System Health',
        url: ROUTES.ADMIN_HEALTH,
        icon: Activity,
        permission: 'monitoring.view',
      },
      {
        title: 'Jobs',
        url: ROUTES.ADMIN_JOBS,
        icon: Cog,
        permission: 'jobs.view',
      },
      {
        title: 'Security',
        url: ROUTES.ADMIN_SECURITY,
        icon: ShieldCheck,
        permission: 'admin.config',
      },
      {
        title: 'API Connections',
        url: ROUTES.ADMIN_API_CONNECTIONS,
        icon: Plug,
        permission: 'admin.config',
      },
      {
        title: 'Kill Switch',
        url: ROUTES.ADMIN_KILL_SWITCH,
        icon: Power,
        permission: 'system.kill_switches.manage',
      },
    ],
  },
  {
    label: 'Compliance',
    items: [
      {
        title: 'Audit Logs',
        url: ROUTES.ADMIN_AUDIT,
        icon: FileText,
        permission: 'audit.view',
      },
    ],
  },
];
