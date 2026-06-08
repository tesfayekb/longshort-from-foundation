# Component Inventory

> **Owner:** Project Lead | **Last Reviewed:** 2026-04-12 | **Status:** Living Document

## Purpose

Governed registry of all shared Phase 4 components. Pages must assemble from this inventory. No page-local component variants are permitted.

## Enforcement Rule (CRITICAL)

- Every shared UI component used across pages MUST be listed here
- No page may create a local variant of a governed component
- Adding a new shared component requires updating this document first
- Component behavior must conform to patterns defined in [UI Design System](ui-design-system.md)

---

## Shell Components

| Component | Path | Purpose | Used By |
|-----------|------|---------|---------|
| `DashboardLayout` | `src/layouts/DashboardLayout.tsx` | Shell wrapper: SidebarProvider + Sidebar + Header + Outlet | Admin, User panels |
| `AdminLayout` | `src/layouts/AdminLayout.tsx` | Admin route wrapper: DashboardLayout + admin nav config + RequirePermission(`admin.access`) | Admin pages |
| `UserLayout` | `src/layouts/UserLayout.tsx` | User route wrapper: DashboardLayout + user nav config + RequireAuth | User pages |
| `DashboardSidebar` | `src/components/dashboard/DashboardSidebar.tsx` | Permission-filtered navigation sidebar with nested collapsible groups, badge support, mobile isMobile awareness, and active parent highlighting | Shell |
| `DashboardHeader` | `src/components/dashboard/DashboardHeader.tsx` | Fixed top bar: trigger, search, theme, user menu | Shell |
| `DashboardBreadcrumbs` | `src/components/dashboard/DashboardBreadcrumbs.tsx` | Route-aware breadcrumb trail with dynamic entity name resolution from React Query cache | All pages |
| `PageHeader` | `src/components/dashboard/PageHeader.tsx` | Page title + subtitle + action buttons zone | All pages |
| `DashboardNotFound` | `src/components/dashboard/DashboardNotFound.tsx` | In-shell 404: icon + message + go-back button, rendered within shell | Invalid routes under /admin/*, /dashboard/*, /settings/* |
| `UserMenu` | `src/components/dashboard/UserMenu.tsx` | Avatar dropdown: profile, security, cross-panel navigation (Admin Console / My Dashboard), sign-out | Header |
| `ThemeToggle` | `src/components/dashboard/ThemeToggle.tsx` | Light/dark theme toggle button | Header |

## Data Display Components

| Component | Path | Purpose | Used By |
|-----------|------|---------|---------|
| `DataTable` | `src/components/dashboard/DataTable.tsx` | Sortable, filterable table with pagination | Users, Roles, Permissions, Audit |

### FP-030 — DataTable extensions (Long-Short table foundation)

`DataTable` ships three additive, backward-compatible capabilities at FP-030:

- **`density?: 'comfortable' \| 'compact'`** — defaults to `'comfortable'` (existing admin tables unaffected). `'compact'` reduces row + header vertical padding (`py-3` → `py-1.5`) for dense Long-Short surfaces.
- **`DataTableColumn.numeric?: boolean`** — when true, header + cell get `text-right font-mono tabular-nums` so digit columns align as columns.
- **`onPageSizeChange?: (n: number) => void` + `pageSizeOptions?: readonly number[]`** — when `onPageSizeChange` is supplied, the pagination footer renders a 25 / 50 / 100 page-size selector. Consumers that omit the prop (e.g. admin `InvitationsTable`) get the pre-FP-030 footer unchanged.

Shared `DEFAULT_PAGE_SIZE` constant (`src/lib/table-constants.ts` = 25) is the canonical Long-Short page size. Every Long-Short table imports it rather than hardcoding a magic number. `PAGE_SIZE_OPTIONS = [25, 50, 100] as const` is the matching selector default.

Long-Short consumers wired to these capabilities at FP-030:

| Page | Density | Numeric columns | Notes |
|------|---------|-----------------|-------|
| `RankingsTab` | (bespoke `<Table>` — `py-2` cells, `font-mono tabular-nums` on z-score) | z-score, rank | PAGE_SIZE 50 → 25 via `DEFAULT_PAGE_SIZE` |
| `ComputeRunsTab` | (bespoke `<Table>` — `py-2` cells, `font-mono tabular-nums` on numeric cells) | Universe, Persisted, Skipped | Already 25; now via shared constant |
| `CoverageTab` | (bespoke `<Table>` — `py-2` cells, `tabular-nums` on as-of / written-at) | as-of, written-at | Already 25; now via shared constant |
| `UniverseMembershipPage` | (bespoke `<Table>` — `py-2` cells) | — | PAGE_SIZE 50 → 25 via `DEFAULT_PAGE_SIZE` |
| `UniverseRefreshHistoryPage` | `DataTable` `density="compact"` | Raw, Post-Filter, Long, Short | Pre-FP-030 hard-`.limit(50)`; now `.range()` + `count='exact'` + page-size selector |
| `ReconciliationEventsPage` | `DataTable` `density="compact"` | Symbol | Pre-FP-030 hard-`.limit(100)`; now `.range()` + `count='exact'` + page-size selector |
| `StatCard` | `src/components/dashboard/StatCard.tsx` | Metric card: icon + label + value + trend | Dashboards |
| `StatusBadge` | `src/components/dashboard/StatusBadge.tsx` | Color-coded status indicator (active/deactivated/pending) | Users, Roles |
| `AuditActionBadge` | `src/components/admin/AuditActionBadge.tsx` | Color-coded audit action label | Audit log |
| `AuditMetadataViewer` | `src/components/admin/AuditMetadataViewer.tsx` | Expandable JSON tree for audit metadata | Audit log |

## State Components

| Component | Path | Purpose | Used By |
|-----------|------|---------|---------|
| `LoadingSkeleton` | `src/components/dashboard/LoadingSkeleton.tsx` | Skeleton placeholder matching content shape | All async loads |
| `EmptyState` | `src/components/dashboard/EmptyState.tsx` | Icon + heading + description + optional action | All empty lists/tables |
| `ErrorState` | `src/components/dashboard/ErrorState.tsx` | Error icon + message + retry button | All failed operations |
| `AccessDenied` | `src/components/dashboard/AccessDenied.tsx` | Permission-denied page: lock icon + message + back/home link, rendered within shell | Permission-denied routes |
| `PhaseContextNote` | `src/components/dashboard/PhaseContextNote.tsx` | Info-alert wrapper for phase-context explainers: what a page shows, what it does NOT yet show, and which phase/FP completes it. Uses `--info` token. | All longshort pages with partial/in-progress capability |

## Dialog Components

| Component | Path | Purpose | Used By |
|-----------|------|---------|---------|
| `ConfirmActionDialog` | `src/components/dashboard/ConfirmActionDialog.tsx` | Standard destructive confirmation: title + description + reason input + confirm/cancel | Deactivate, revoke, delete actions |
| `AssignRoleDialog` | `src/components/admin/AssignRoleDialog.tsx` | Role selection dialog for user role assignment | User detail page |
| `CreateRoleDialog` | `src/components/admin/CreateRoleDialog.tsx` | Role creation dialog with auto-slugified key | AdminRolesPage |
| `ReauthDialog` | `src/components/auth/ReauthDialog.tsx` | Email OTP identity verification dialog for sensitive actions | Security, PasswordChange |

| `AdminEditProfileCard` | `src/components/admin/AdminEditProfileCard.tsx` | Inline admin edit form for user profile (display name, avatar) with permission gate | UserDetailPage |
| `PasswordChangeCard` | `src/components/user/PasswordChangeCard.tsx` | In-panel password change form with email OTP re-auth, 12-char min, confirm match | SecurityPage |

## Configuration

| Component | Path | Purpose | Used By |
|-----------|------|---------|---------|
| `NavItem` (type) | `src/config/navigation.types.ts` | Navigation item interface with permission gating | Sidebar |
| Admin nav config | `src/config/admin-navigation.ts` | Admin sidebar navigation structure | AdminLayout |
| User nav config | `src/config/user-navigation.ts` | User sidebar navigation structure | UserLayout |

## Trading / Long-Short Hub Components

Conformance: every component below conforms to [UI Design System](ui-design-system.md) (Enforcement Rule line 14). Hub pages are page-level compositions of governed shell + data-display components — they introduce no page-local table/badge/dialog variants.

| Component | Path | Purpose | Used By |
|-----------|------|---------|---------|
| `HubTabs` | `src/pages/trading/longshort/hub/HubTabs.tsx` | URL-`?tab=`-synced shadcn Tabs container with default-tab fallback. Configurable query-param key (defaults to `tab`). The shared in-page tab contract for every Long-Short hub. | `SignalsHubPage`, `UniverseHubPage`, `ReconciliationHubPage`, `PortfolioHubPage` |
| `HubEmptyState` | `src/pages/trading/longshort/hub/HubTabs.tsx` | Honest empty-state for hub tabs whose data pages land in later FPs (title + description + optional `note` like "Built in FP-024"). | All Long-Short hub pages with deferred tabs |
| `LongShortDashboardPage` | `src/pages/trading/longshort/LongShortDashboardPage.tsx` | Long-Short Overview hub page (existing dashboard surface; serves the `/trading/longshort` root). | App route `/trading/longshort` |
| `SignalsHubPage` | `src/pages/trading/longshort/SignalsHubPage.tsx` | Signals hub — composes `PageHeader` + `HubTabs` over Rankings / Compute Runs / Coverage tabs (all empty-state shells at FP-023; Rankings data lands in FP-024). | App route `/trading/longshort/signals` |
| `UniverseHubPage` | `src/pages/trading/longshort/UniverseHubPage.tsx` | Universe hub — composes `PageHeader` + `HubTabs` over Constituents (`UniverseMembershipPage`) / Refresh History (`UniverseRefreshHistoryPage`) / Exclusions (empty-state). | App route `/trading/longshort/universe` |
| `ReconciliationHubPage` | `src/pages/trading/longshort/ReconciliationHubPage.tsx` | Reconciliation hub — composes `PageHeader` + `HubTabs` over Events (`ReconciliationEventsPage`) / Alerts / Breaker (empty-states). | App route `/trading/longshort/reconciliation` |
| `PortfolioHubPage` | `src/pages/trading/longshort/PortfolioHubPage.tsx` | Portfolio hub — empty-state shell at FP-023; data lands in later FPs per master-plan portfolio sequence. | App route `/trading/longshort/portfolio` |

> **Registered by:** FP-023 (ACT-134) shipped the components; FP-023.1 (ACT-135) registered them here per Constitution Rule 6.

## Trading / Long-Short Signals — Rankings (FP-024)

Conformance: every component below conforms to [UI Design System](ui-design-system.md). The Rankings tab is assembled from governed shell + data-display primitives (Card, Select, Input, Table, Button) plus two new strategy-internal components and one read-only hook module. No new visual tokens — long/short accents reuse `--success` / `--destructive`; the band uses `--muted-foreground` for the middle bulk per the design-system semantic palette.

| Component | Path | Purpose | Used By |
|-----------|------|---------|---------|
| `RankingsTab` | `src/pages/trading/longshort/signals/RankingsTab.tsx` | Signals → Rankings tab content. Composes controls (signal / as-of-date / sector / ticker), the distribution-band hero, side-by-side top-20 long + bottom-20 short candidate tables, and a server-side-paginated full rankings table. Strictly read-only against `signal_observations`. | `SignalsHubPage` (Rankings tab) |
| `SignalDistributionBand` | `src/pages/trading/longshort/signals/SignalDistributionBand.tsx` | Hand-rolled SVG z-score band. Plots every present-value ticker by z-score, accenting the top-N as `--success` and bottom-N as `--destructive`. Absent (`is_present=false`) tickers are NEVER plotted at 0 — they surface only as an out-of-band "N tickers absent" annotation, preserving the DB CHECK invariant `value IS NULL ↔ is_present=false` (INC-36 / §2-axiom-3 epistemic honesty). | `RankingsTab` |
| `useSignalRankings` (hook module) | `src/features/longshort/hooks/useSignalRankings.ts` | Five read-only React Query hooks for the Rankings surface: `useAvailableSignals`, `useSignalDates`, `usePresentObservations`, `useAbsentCount`, `usePaginatedRankings`. The paginated hook uses Supabase `.range()` + `{ count: 'exact' }` server-side pagination per the FP-023.1 forward-binding (`signal_observations` grows unboundedly across trading days × signals; client-side `useMemo` filter pattern is explicitly forbidden). | `RankingsTab` |

> **Registered by:** FP-024 (ACT-136) — same-PR per Constitution Rule 6.

## Trading / Long-Short Signals — Compute Runs (FP-028)

Conformance: every component below conforms to [UI Design System](ui-design-system.md). The Compute Runs tab is assembled from governed shell + data-display primitives (Card, Select, Table, Badge, Button) plus one new strategy-internal page component and one read-only hook module. Outcome badges reuse `--success` (outline) / `--destructive` (filled) tokens; the fire-source badge uses the bare `Badge` `outline` / `secondary` variants. No new visual tokens.

| Component | Path | Purpose | Used By |
|-----------|------|---------|---------|
| `ComputeRunsTab` | `src/pages/trading/longshort/signals/ComputeRunsTab.tsx` | Signals → Compute Runs tab content. Composes a signal selector, a server-side paginated runs table (outcome badge + universe / persisted / skip aggregates + fire-source indicator), per-row expansion of `signal_compute_log.skipped_detail` (FP-022 per-ticker diagnostics), and the Monday-glance "latest fire — auto (cron) / manual" freshness affordance. Strictly read-only against `signal_compute_log` (post-MIG-073/FP-027 permission-scoped read). | `SignalsHubPage` (Runs tab) |
| `useSignalComputeRuns` (hook module) | `src/features/longshort/hooks/useSignalComputeRuns.ts` | Two read-only React Query hooks (`useAvailableComputeSignals`, `usePaginatedComputeRuns`) plus two pure helpers (`classifyFireSource`, `totalSkips`). `usePaginatedComputeRuns` uses Supabase `.range()` + `{ count: 'exact' }` server-side pagination per the FP-023.1 forward-binding (`signal_compute_log` grows unboundedly across cron fires; client-side filter is forbidden). `classifyFireSource` is the UI affordance only — manual fires carry a midnight-UTC `completed_at` signature, cron fires carry wall-clock seconds. | `ComputeRunsTab` |

> **Registered by:** FP-028 (ACT-140) — same-PR per Constitution Rule 6.

## Trading / Long-Short Signals — Coverage (FP-029)

Conformance: every component below conforms to [UI Design System](ui-design-system.md). The Coverage tab is assembled from governed shell + data-display primitives (Card, Table, Badge, Button, Tooltip) plus one new strategy-internal page component and one read-only hook module. Wired sub-rule badges reuse `--success` (outline); deferred sub-rule badges use the bare `Badge` `secondary` variant (muted, **NOT** destructive — feed-deferral per DW-063 / DEC-038.1 is intentional, not a failure). No new visual tokens.

| Component | Path | Purpose | Used By |
|-----------|------|---------|---------|
| `CoverageTab` | `src/pages/trading/longshort/signals/CoverageTab.tsx` | Signals → Coverage tab content. Composes a §3.3 sub-rule legend, a server-side paginated coverage table (per `(operator_id, as_of_date)` row: five §3.3a–e wired/deferred badges + derived `complete` badge + `written_at`), and the FP-026 `PhaseContextNote` explicitly stating that today only §3.3d is wired (a/b/c/e feed-deferred per DW-063 / DEC-038.1) so `complete` reads `incomplete` by design. Strictly read-only against `universe_eligibility_coverage` (MIG-055 — RLS already permission-scoped, no fix needed). | `SignalsHubPage` (Coverage tab) |
| `useEligibilityCoverage` (hook module) | `src/features/longshort/hooks/useEligibilityCoverage.ts` | One read-only React Query hook (`usePaginatedEligibilityCoverage`) + one pure helper (`isCoverageComplete`) + the `SUB_RULES` constant mapping §3.3a–e codes to display labels. The paginated hook uses Supabase `.range()` + `{ count: 'exact' }` per the FP-023.1 forward-binding (`universe_eligibility_coverage` grows daily with the universe cron). `isCoverageComplete` mirrors the DB `assert_eligibility_complete` RPC client-side to avoid N+1 RPC fan-out on the listing page. | `CoverageTab` |

> **Registered by:** FP-029 (ACT-141) — same-PR per Constitution Rule 6.

---

## Component Rules

### No Page-Local Variants

❌ **Forbidden:**
```tsx
// In UserListPage.tsx
const UserTable = () => <table>...</table>  // Page-local table
const UserStatusChip = () => ...            // Page-local badge
const UserDeleteModal = () => ...           // Page-local dialog
```

✅ **Required:**
```tsx
// In UserListPage.tsx
import { DataTable, StatusBadge, ConfirmActionDialog } from '@/components/dashboard'
```

### Extension Pattern

If a page needs unique data columns or filters, it configures the governed component — it does not replace it:

```tsx
<DataTable
  columns={userColumns}        // Page defines columns
  data={users}                 // Page provides data
  filters={userFilters}        // Page defines filter options
  onRowClick={handleRowClick}  // Page handles interaction
/>
```

---

## Reconciliation

At Phase 4 closure, this inventory must match:
- Actual components in `src/components/dashboard/` and `src/components/admin/`
- Imports used across all Phase 4 pages
- Any mismatch is a governance violation

---

## Dependencies

- [UI Design System](ui-design-system.md) — visual patterns
- [UI Architecture](../01-architecture/ui-architecture.md) — shell structure

## Used By / Affects

All Phase 4 page implementation.

## Related Documents

- [Stage 4 Plan](../08-planning/stage-4-plan.md)
