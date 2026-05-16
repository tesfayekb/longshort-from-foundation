# Trading Panel Module

> **Owner:** Project Lead | **Last Reviewed:** 2026-05-15

## Purpose

Provides a secure trading control surface as a peer to the existing admin and user panels. The trading panel is a layout shell that hosts individual trading strategy modules (long-short first, with options, futures, and others planned as separate feature proposals). It does NOT contain strategy logic itself — strategies live in `src/features/<strategy>/` per the binding contract in `strategy-module-pattern.md`.

The trading panel exists to: (a) give users a single navigational entry point for all their trading activity regardless of how many strategies they use; (b) enforce a single panel-level access gate (`trading.access`) plus a single panel-level MFA enforcement policy slot (`panels.trading`); (c) provide future surface area for cross-strategy features (aggregate portfolio, total P&L) without requiring strategy code changes.

## Scope

- Routing: the `/trading` route tree (panel index + strategy sub-routes mounted by individual strategy modules)
- Layout: `TradingLayout.tsx` shell composition over the canonical `DashboardLayout`
- Navigation: `src/config/trading-navigation.ts` strategy registration table
- Access gate: `trading.access` panel umbrella permission
- MFA policy: `mfa_enforcement_policy.panels.trading` participation

The trading panel does NOT govern: strategy business logic, strategy data tables, strategy edge functions, strategy jobs, strategy audit infrastructure, per-strategy permissions. Those belong to individual strategy modules per `strategy-module-pattern.md`.

## Implementation Status

| Phase | Status | Workstream Step | PR |
|---|---|---|---|
| Foundation infrastructure (TradingLayout, trading.access permission, panels.trading MFA key, e2e tests) | Complete | Workstream Step 4 | #7 |
| First strategy (long-short Phase 0) | Not started | Workstream Step 5 (FP-005) | — |

At HEAD, the trading panel renders at `/trading` for users with `trading.access` permission. No strategies are currently registered. The TradingDashboard placeholder shows an empty state. Strategies will be registered via `src/config/trading-navigation.ts` (the DEC-031 sub-point 6 carve-out file) in subsequent feature proposals starting with FP-005.

Permissions doc-vs-DB schema drift (`module` field) is logged as **INC-15** in `docs/06-tracking/incidental-findings.md`.

## Enforcement Rule (CRITICAL)

- Trading panel is a **privileged control surface** gated by `trading.access`.
- The `TradingLayout` MUST compose the canonical `DashboardLayout` per `ui-architecture.md` — it does NOT replace the shell.
- Any bypass of `trading.access` enforcement or the MFA policy gate is an INVALID implementation.
- Strategy registration into the trading panel is data-driven via `src/config/trading-navigation.ts` consuming each strategy's exported nav descriptor — NEVER via direct import of strategy internals into trading-panel code.

## Access Control

- Access requires `trading.access` permission. Per DEC-031 initial-seed rule, NO existing role receives `trading.access` at seed; superadmin inherits via existing RBAC inheritance; trader-class roles are created on-demand by admins after deployment via the existing dynamic-role admin UI.
- Per-strategy permissions (e.g., `longshort.view`, `longshort.manage`) gate individual strategy routes inside the panel, layered on top of `trading.access`.
- MFA enforcement governed by the FP-002 / DEC-028 panel policy mechanism (see MFA Policy section below).

## Panel Layout and Shell Composition

`TradingLayout.tsx` sits in `src/layouts/` alongside `AdminLayout.tsx` and `UserLayout.tsx`. It composes (does not replace) the canonical `DashboardLayout` shell governed by `ui-architecture.md`.

Responsibilities of `TradingLayout`:
- Verify `trading.access` permission via `RequirePermission` wrapper (mirrors `AdminLayout`'s `admin.access` enforcement)
- Participate in the MFA enforcement policy: if `mfa_enforcement_policy.panels.trading === 'required'` AND user has `trading.access` AND user has no MFA factor, redirect to `/mfa-enroll?returnTo=trading`
- Render the trading-specific sidebar navigation from `src/config/trading-navigation.ts`
- Render strategy routes via React Router's `<Outlet />` mechanism

What `TradingLayout` does NOT do:
- Implement strategy logic — strategies are self-contained per `strategy-module-pattern.md`
- Redefine shell behavior (header, scrolling, breakpoints) — all inherited from `DashboardLayout`
- Override `ui-architecture.md` rules

## Routing

The trading panel mounts at `/trading` in `src/App.tsx`, as a sibling to the existing `/admin` and user routes. Initial structure:

```
/trading                          → TradingDashboard (panel index, placeholder until cross-strategy features land)
/trading/<strategy>               → strategy index route (mounted by the strategy module)
/trading/<strategy>/...           → strategy sub-routes (mounted by the strategy module)
```

The trading panel itself adds only the `/trading` route and the `TradingLayout` wrapper. Each strategy module is responsible for registering its own `/trading/<strategy>/...` sub-routes via `src/pages/trading/<strategy>/` page wrappers that import from `src/features/<strategy>/index.ts`.

### Panel Index Page

`TradingDashboard.tsx` is the placeholder index page at `/trading`. In Phase 0 (no strategies yet), it renders "Trading panel — no strategies enabled" plus the list of strategies the user has permission to use. As strategies land, this page may grow into a cross-strategy overview (aggregate portfolio, total P&L, allocations), but those features require their own feature proposals and are NOT in scope of FP-004.

## MFA Policy Participation

Per FP-002 / DEC-028, the `mfa_enforcement_policy.panels` JSON in `system_config` has been designed to accept a `trading` key. FP-004 / DEC-031 adds that key:

```json
{
  "version": 1,
  "panels": {
    "admin": "optional",
    "trading": "optional"
  },
  "notes": "..."
}
```

### Initial Default

Dev seed: `panels.trading = 'optional'` (so development isn't friction-locked by TOTP-every-login during foundation work).

### Production Requirement

Production deployment SOP (`docs/08-planning/preproduction-checklist.md`) MUST be updated to require `panels.trading = 'required'` before any production trading workload, mirroring the admin pattern.

### Behavior

When `panels.trading === 'required'` AND a user with `trading.access` has no MFA factor enrolled, `TradingLayout` redirects to `/mfa-enroll?returnTo=trading` on any `/trading/*` route. Once the factor is enrolled, the user is redirected back to the trading panel.

When `panels.trading === 'optional'`, no enforcement redirect occurs. Users without MFA can still use the trading panel. (Supabase's `aal1 → aal2` challenge for already-enrolled users is unaffected — that's sacrosanct per DEC-028 and independent of this policy layer.)

## Strategy Registration (Cross-Strategy Contract)

`src/config/trading-navigation.ts` is the data-driven registration table for strategies appearing in the trading-panel sidebar. Each strategy module exports a navigation descriptor from its `index.ts`:

```typescript
// src/features/longshort/index.ts (illustrative)
export const longshortNavigation = {
  strategyKey: 'longshort',
  label: 'Long-Short',
  icon: '...',
  permission: 'longshort.view',
  routes: [
    { path: 'longshort', label: 'Dashboard', permission: 'longshort.view' },
    { path: 'longshort/positions', label: 'Positions', permission: 'longshort.view' },
    // ...
  ],
};
```

`trading-navigation.ts` imports descriptors from each registered strategy and produces the sidebar nav structure. Strategies not registered in `trading-navigation.ts` do NOT appear in the sidebar even if their code exists.

This registration pattern is the only sanctioned cross-module touchpoint between strategies and the trading panel. Direct import of strategy internals into trading-panel code is FORBIDDEN per DEC-031.

## Module-Local Components

- `TradingLayout.tsx` (layout shell)
- `TradingDashboard.tsx` (panel index placeholder)
- `TradingSidebarNav.tsx` (consumes `trading-navigation.ts`, renders sidebar entries; or extends the existing `DashboardSidebar` with a trading section per `ui-architecture.md` sidebar contract — implementation decision deferred to PR-3 of FP-004 outline)

## Permissions

The trading panel registers exactly ONE permission:

| Key | Module | Classification | Scope | Default Roles | Audit | Reauth |
|-----|--------|---------------|-------|---------------|-------|--------|
| `trading.access` | trading-panel | operational | system-wide | [] (none — superadmin inherits) | yes | no |

Per-strategy permissions are registered by individual strategy modules per `strategy-module-pattern.md` — not by the trading-panel module.

## Events

The trading panel does NOT emit module-specific audit events. It is a routing/layout shell with no state mutations. Permission grants/revocations for `trading.access` flow through existing RBAC audit events (`rbac.role_assigned`, `rbac.permission_assigned`, etc.) on the platform `audit_logs` table — those are platform RBAC events, not trading events.

Per-strategy events are emitted by individual strategies into their own `<strategy>_audit_logs` tables per `strategy-module-pattern.md`.

## Jobs

The trading panel does NOT register background jobs. Job registration is per-strategy per `strategy-module-pattern.md`.

## Modularity Contract

Per DEC-030, the trading panel MUST be removable as a unit. Removing the trading panel entails:
- Delete `src/layouts/TradingLayout.tsx`, `src/pages/trading/`, `src/config/trading-navigation.ts`, `src/components/trading/` (if any)
- Remove the `/trading` route block from `src/App.tsx`
- Delete the `trading.access` permission row from `permissions` table (migration)
- Remove `panels.trading` key from `mfa_enforcement_policy` JSON (migration)
- Remove the `trading-panel` value from the `route-index.md` `panel` enum
- Delete the trading-panel module docs and reference-index entries

If any strategy modules exist at the time of removal, those must be removed first per the per-strategy removability contract in `strategy-module-pattern.md`. After removal, the platform returns to current state with zero residue.

## Dependencies

- [Auth Module](auth.md)
- [RBAC Module](rbac.md)
- [Audit Logging Module](audit-logging.md) — pattern reference only; trading events do NOT write to platform `audit_logs`
- [Strategy Module Pattern](strategy-module-pattern.md) — defines what mounts inside this panel

## Used By / Affects

- All current and future trading strategy modules (which mount inside this panel)
- `mfa_enforcement_policy` system_config row (extended with `panels.trading` key)
- `src/App.tsx` (new `/trading` route block)
- `docs/01-architecture/ui-architecture.md` (sidebar section for Trading)
- `docs/07-reference/route-index.md` (new `trading-panel` enum value in the `panel` field)

## Risks If Modified

MEDIUM — modifying the trading-panel shell affects every strategy module mounted inside it. Strategy modules depend on the panel for: access gating, MFA policy participation, sidebar registration. Panel changes that break the shell contract require coordinated review against every active strategy.

HIGH for any change that weakens `trading.access` enforcement, bypasses MFA policy participation, or allows strategy internals to be imported into panel code.

## Related Documents

- [Strategy Module Pattern](strategy-module-pattern.md)
- [DEC-030: Feature Scope Expansion — Trading Strategies](../08-planning/approved-decisions.md#dec-030)
- [DEC-031: Trading-Panel + Strategy-Module Architectural Pattern](../08-planning/approved-decisions.md#dec-031)
- [DEC-028: Configurable Per-Panel MFA Enforcement Policy](../08-planning/approved-decisions.md#dec-028)
- [FP-004: Trading Panel + Strategy Module Architectural Pattern](../08-planning/feature-proposals.md#fp-004)
- [PLAN-TRADING-001](../08-planning/master-plan.md#plan-trading-001)
- [Admin Panel Module](admin-panel.md) — peer panel precedent for shell + gate pattern
- [User Panel Module](user-panel.md) — peer panel precedent
- [UI Architecture](../01-architecture/ui-architecture.md) — shell contract governance
