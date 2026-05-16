# Strategy Module Pattern

> **Owner:** Project Lead | **Last Reviewed:** 2026-05-15

## Purpose

Defines the binding architectural contract every trading strategy module must follow. This document is the single source of truth for how a strategy module is structured, named, and integrated with the platform. Long-short is the first concrete strategy applying this pattern; options, futures, and any subsequent strategies follow the same shape without exception.

This pattern is locked by DEC-031 and is the technical embodiment of the modularity principle in DEC-030: trading must be removable as a unit — deleting one strategy or the entire trading panel returns the platform to its current state with zero residue.

## Scope

Applies to every file, directory, table, edge function, background job, audit event, RBAC permission, and route that belongs to a trading strategy module. Applies regardless of which strategy (long-short, options, futures, etc.). Does NOT apply to the platform layer (auth, RBAC implementation, audit-logging implementation, jobs scheduler, admin/user panels) — those are governed by their own module docs.

## Enforcement Rule (CRITICAL)

- Every strategy module MUST conform to the pattern below in full. Partial conformance is INVALID.
- Strategy modules MUST NOT import from sibling strategy modules. Any cross-strategy interaction goes through platform services (e.g., shared audit primitives) or through documented registration patterns (e.g., sidebar nav, job registry).
- Core platform modules (auth, rbac implementation, audit-logging implementation, jobs scheduler, admin-panel, user-panel) MUST NOT import from any strategy module, including the strategy's `index.ts` façade. Trading-panel infrastructure (e.g., `src/config/trading-navigation.ts`) has a narrow carve-out to import from strategy `index.ts` façades for nav/RBAC-key registration ONLY — never from strategy internals. See the Dependency Rules section below for the full allowed/forbidden matrix.
- The platform `audit_logs` table MUST NOT receive trading events. Strategy events go to per-strategy `<strategy>_audit_logs` tables.
- Deviations from this pattern require a new DEC entry and explicit operator approval. Silent deviation = INVALID.

## Directory Structure

Every strategy module lives at `src/features/<strategy>/` with this exact internal layout:

```
src/features/<strategy>/
├── components/          # Strategy-specific UI components
├── hooks/               # Strategy-specific React hooks
├── services/            # Strategy business logic (signal computation, ranking, sizing, etc.)
├── types/               # Strategy-specific TypeScript types
├── api/                 # Strategy API client code (calls to edge functions)
├── utils/               # Strategy-specific helpers (must NOT contain platform-generic utilities)
└── index.ts             # Public API façade — the ONLY file other modules may import from
```

Strategy routed pages live at `src/pages/trading/<strategy>/` as **thin composition shells** — they import only from `src/features/<strategy>/index.ts` and contain no business logic.

### `index.ts` Public API Contract

Every strategy's `index.ts` MUST export only what other modules legitimately need:
- Routed page components (consumed by `src/pages/trading/<strategy>/`)
- Navigation registration descriptor (consumed by `src/config/trading-navigation.ts`)
- Permission-key constants the strategy registers (consumed by RBAC seed scripts)

Strategy internals (services, hooks, types, utils, internal components) MUST NOT be exported from `index.ts`. Any consumer trying to reach inside a strategy module is a Constitution Rule 3 violation (pattern duplication / hidden coupling).

## Database Tables

Strategy data tables MUST be named `<strategy>_<entity>` in the `public` schema. Examples for long-short:
- `longshort_positions`
- `longshort_signals`
- `longshort_strategy_state`
- `longshort_audit_logs` (the strategy's dedicated audit table — see Audit section below)

### Naming Rules

- Strategy prefix is mandatory. No unprefixed table for strategy-specific data.
- Snake_case. Singular entity name + plural is allowed where it matches existing platform convention (e.g., `positions`, `signals`).
- No nested schemas. Single `public` schema per DEC-022 single-tenant assumption and existing platform pattern.

### RLS Rules

- Every strategy table MUST have RLS enabled.
- Row ownership scoped by `auth.uid()` per DEC-022 single-tenant model. No `tenant_id` columns.
- Admin override (where applicable) uses existing platform helpers; strategy modules MUST NOT define new admin-override mechanisms.

## RBAC Permissions

Permission keys MUST follow the documented two-segment `{resource}.{action}` format per `rbac.md`. No three-segment keys.

### Required Permissions per Strategy

Every strategy registers at minimum:
- `<strategy>.view` — read access to the strategy's positions, signals, performance
- `<strategy>.manage` — create/edit positions, trigger manual rebalance, configure strategy parameters

Strategies that include trade-execution MUST additionally register:
- `<strategy>.execute` — actually place trades; destructive; reauth-required; `system_critical` blast radius

### Permission Registration

Per DEC-027 (Static Permission Model), every permission MUST be registered in `docs/07-reference/permission-index.md` BEFORE it can be used. Each registration declares:
- `key` — e.g., `longshort.view`
- `module` — the strategy name (e.g., `longshort`), enabling RBAC UI grouping without violating the two-segment key grammar
- `classification` — `read-only` for `.view`, `operational` for `.manage`, `destructive` for `.execute`
- `scope` — typically `self` for view/manage (user-scoped); `system-wide` for execute (system-wide blast)
- `default_roles` — empty array (NO existing role gets strategy permissions at seed; trader-class roles are created on-demand)
- `audit_required` — `true` for `.manage` and `.execute`; `false` permitted for `.view`
- `reauth_required` — `true` for `.execute`; usually `false` for `.view` and `.manage`

### Panel Umbrella Permission

`trading.access` is the umbrella permission for the entire trading panel (analogous to `admin.access`). It is NOT a strategy-specific permission and is registered once by the trading-panel module, not by individual strategies. Strategies do NOT register their own panel-umbrella permission.

## Per-Strategy Audit

Every strategy MUST have a dedicated audit log table named `<strategy>_audit_logs`. The platform `audit_logs` table MUST NOT receive trading events.

### Schema

Each `<strategy>_audit_logs` table follows the same shape as platform `audit_logs`:

```sql
CREATE TABLE public.<strategy>_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    target_type TEXT,
    target_id UUID,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### Rules

- Append-only via RLS — no UPDATE or DELETE paths from application logic
- Retention follows DEC-007 default (90 days, configurable 30–365) unless a new DEC sets a strategy-specific class
- Action names use `<strategy>.<verb>` format (e.g., `longshort.signal_computed`, `longshort.position_opened`, `longshort.rebalance_completed`); registered in `docs/07-reference/event-index.md` per existing convention
- Metadata sanitization: if the strategy ever adds an export path for its audit table, the export MUST apply DEC-024-style allowlist sanitization. The platform DEC-024 itself governs only `audit_logs` exports; per-strategy export paths are net-new and must explicitly inherit the discipline
- No PII, no passwords, no tokens, no MFA secrets in audit metadata — same rule as platform `audit_logs`

### Why Dedicated, Not Shared

Modularity. Per DEC-030: trading must be removable as a unit. Mixing strategy events into the platform `audit_logs` table would leave residue after a strategy is removed. Per-strategy tables make removal clean: drop the table, the audit history is gone with the rest of the strategy module.

## Edge Functions

Strategy edge functions MUST be named `<strategy>-<verb>` (kebab-case). Examples for long-short:
- `longshort-compute-signals`
- `longshort-rebalance`
- `longshort-fetch-positions`

### Required DEC-023 Pipeline (envelope, RBAC, validation, error handling)

Per DEC-023 (Stage 3A Shared API Infrastructure), every strategy edge function MUST consume the shared handler stack from `supabase/functions/_shared/`:
- `createHandler` (request envelope)
- `authenticateRequest` (session resolution)
- `validateRequest` / `normalizeRequest` (input handling)
- `checkPermissionOrThrow` (RBAC enforcement)
- `apiError` / `apiSuccess` (response shaping)

No inline validation. No ad-hoc error responses. No bypassing the envelope.

### Audit-Writer Contract (Critical Divergence From Platform Audit)

Per DEC-031, **strategy events MUST NOT be written to the platform `audit_logs` table**. The platform audit primitive `logAuditEvent` in `supabase/functions/_shared/audit.ts` is hardcoded to insert into `audit_logs` and is therefore **NOT usable for strategy-domain audit events**. Calling it from a strategy edge function for a strategy event would silently violate DEC-031 / FP-004 and produce a Constitution Rule 7 "no silent behavior change" violation against the platform audit table.

Each strategy MUST provide its own audit writer targeting its own `<strategy>_audit_logs` table. Two acceptable shapes:

1. **Per-strategy local writer** — a function under `src/features/<strategy>/api/` (for client-side audit calls via edge function) or `supabase/functions/<strategy>-<verb>/audit.ts` (for edge-function-local writers) that mirrors the hardened patterns of `_shared/audit.ts`: `sanitizeMetadata`, correlation_id propagation, structured success/failure return, no thrown exceptions, never logging passwords/tokens/MFA secrets.

2. **Shared strategy-audit helper** — a new helper at `supabase/functions/_shared/strategy-audit.ts` (or similarly named) parameterized by strategy key, writing to `${strategyKey}_audit_logs`. This option centralizes the discipline (sanitization, correlation, structured result) and reduces per-strategy code duplication. If adopted, this helper itself is a platform-tier addition and requires its own governance approval — but once approved, individual strategy modules consume it the same way they consume the rest of the DEC-023 stack.

The choice between shapes (1) and (2) is deferred to the first strategy implementation (likely FP-005 long-short). Whichever shape is chosen, the contract is the same:
- Strategy events go to `<strategy>_audit_logs`, never to `audit_logs`
- Same hardened pattern as platform audit (sanitization, correlation_id, append-only via RLS, structured success/failure, never throws)
- Action names use `<strategy>.<verb>` format, registered in `event-index.md`

### Service Role Usage

Strategy edge functions follow the platform privileged-path controls per `architecture-overview.md`: service-role access is minimized, justified, and documented. Any strategy edge function using service-role MUST justify it in the function's module doc.

## Background Jobs

Strategy jobs MUST be registered in the platform `job_registry` table per `jobs-and-scheduler.md` rules. Per DEC-019, cron scheduling uses `pg_cron`.

### Naming

Job IDs follow `<strategy>_<verb>` (snake_case) format. Examples for long-short:
- `longshort_compute_signals` (scheduled signal computation)
- `longshort_rebalance` (periodic portfolio rebalance)

### Classification

Classification per job, NOT per strategy. A strategy may have jobs in multiple classes:
- Signal computation / data refresh: typically `operational`
- Trade execution / position close-out: `system_critical`
- Cleanup / reporting: `maintenance`

### Idempotency Requirement (Critical)

Any strategy job with financial side-effects MUST use an idempotency store. Per `jobs-and-scheduler.md` Execution Guarantee Model, exactly-once delivery for financial operations is mandatory. A trade-execution job that fires twice due to retry without idempotency is a money-losing defect, not a benign duplicate.

Strategy module docs MUST explicitly identify which jobs have financial side-effects and confirm the idempotency strategy. Live-trading jobs without an idempotency store MUST NOT reach production.

## Dependency Rules

Strategy modules occupy their own tier in the dependency map. Allowed and forbidden imports:

| From | To | Status |
|------|-----|--------|
| Strategy module | Platform module (auth, rbac, audit primitives, jobs scheduler, api, UI, dashboard shell) | ✅ Allowed |
| Strategy module | Same strategy's own internal files | ✅ Allowed |
| Strategy module | Sibling strategy module (any path) | ❌ Forbidden |
| Strategy module | `src/lib/` (platform-generic utilities only) | ✅ Allowed |
| Strategy module | Another strategy's `src/lib/`-like helpers | ❌ Forbidden (no strategy-specific code belongs in `src/lib/`) |
| Trading-panel infrastructure (e.g., `src/config/trading-navigation.ts`) | Strategy module's `index.ts` public façade — for nav/RBAC-key registration ONLY | ✅ Allowed (narrow carve-out) |
| Trading-panel infrastructure | Strategy module internals (anything other than `index.ts`) | ❌ Forbidden |
| Core platform modules (auth, rbac implementation, audit-logging implementation, jobs scheduler, admin-panel, user-panel) | Strategy module (any path) | ❌ Forbidden |
| Strategy module's `index.ts` exports | Read by trading-panel infrastructure to enumerate registered strategies | ✅ Allowed (this is the registration pattern) |

### Registration Pattern

Where a platform service needs strategy data (e.g., sidebar nav listing active strategies), the strategy MUST register via a data-driven mechanism:
- Sidebar: strategy exports a nav descriptor from its `index.ts` façade; trading-panel infrastructure (`src/config/trading-navigation.ts`) imports from each registered strategy's `index.ts` (this is the narrow carve-out in the table above) and assembles the nav table. The import surface is strictly limited to the `index.ts` façade — no reaching into strategy internals.
- Jobs: strategy registers job definitions to `job_registry` via migration; no import path between platform jobs scheduler and strategy code
- Audit events: strategy registers event vocabularies in `event-index.md`; no import path between strategy event registry and platform code

Core platform modules (auth, rbac implementation, audit-logging implementation, jobs scheduler, admin-panel, user-panel) never reach inside strategy code via import — including never importing from a strategy's `index.ts` façade. Only trading-panel infrastructure has the narrow carve-out to import from `index.ts` façades, and only for nav/RBAC-key registration.

## MFA Policy Participation

Strategy access flows through the trading-panel umbrella permission (`trading.access`), which the TradingLayout enforces per the FP-002 / DEC-028 panel MFA enforcement policy. Individual strategies do NOT define their own MFA enforcement; they inherit the panel-level setting (`mfa_enforcement_policy.panels.trading`).

If a strategy ever needs stricter MFA than the panel default (e.g., trade-execution requires re-auth even when panel is `optional`), that's a `reauth_required: true` on the relevant permission key, NOT a new MFA enforcement layer.

## Page Routing

Strategy routed pages mount under `/trading/<strategy>/...` in `src/App.tsx`. The trading panel's `TradingLayout` wraps all strategy routes via React Router's nested-route pattern.

### Permission Gating

Outer gate: `RequirePermission permission="trading.access"` — enforced by `TradingLayout` once at the panel level (mirrors how `AdminLayout` gates `admin.access`).

Inner per-route gates: `PermissionGate permission="<strategy>.<action>"` — added on each strategy route individually, following the existing admin-panel routing precedent.

## Removability Contract

A complete strategy removal MUST delete, in one operation:
- `src/features/<strategy>/` directory
- `src/pages/trading/<strategy>/` directory
- All `<strategy>_*` tables (data + audit) via migration
- All `<strategy>-*` edge functions
- All `<strategy>_*` job_registry rows + their pg_cron entries
- All `<strategy>.*` permission rows from `permissions` table
- All `<strategy>.*` event registrations from `event-index.md`
- All `<strategy>.*` route registrations from `route-index.md`
- Module doc `docs/04-modules/<strategy>.md`

After removal, the platform returns to current state with no orphan references, no orphan tables, no orphan permissions, no orphan jobs.

If a strategy's design creates artifacts outside this list, the design is non-conformant.

## Dependencies

- [Trading Panel Module](trading-panel.md)
- [Auth Module](auth.md)
- [RBAC Module](rbac.md)
- [Audit Logging Module](audit-logging.md) — pattern reference, not table reuse
- [Jobs and Scheduler Module](jobs-and-scheduler.md)
- [API Module](api.md) (DEC-023 shared handler stack)

## Used By / Affects

Binding contract for:
- All current and future trading strategy modules
- All future feature proposals that introduce a new strategy
- The trading-panel module (which depends on strategies conforming to this pattern for sidebar registration)

## Risks If Modified

HIGH — this pattern is a Constitution Rule 11 equivalent for strategy work. Modifying the pattern after one or more strategies have adopted it triggers retroactive review of every existing strategy against the new pattern. Pattern changes require:
- New DEC entry
- Operator approval
- Audit of every existing strategy for conformance
- Migration plan if existing strategies must change shape

## Related Documents

- [Trading Panel Module](trading-panel.md)
- [DEC-030: Feature Scope Expansion — Trading Strategies](../08-planning/approved-decisions.md#dec-030)
- [DEC-031: Trading-Panel + Strategy-Module Architectural Pattern](../08-planning/approved-decisions.md#dec-031)
- [FP-004: Trading Panel + Strategy Module Architectural Pattern](../08-planning/feature-proposals.md#fp-004)
- [PLAN-TRADING-001](../08-planning/master-plan.md#plan-trading-001)
- [Project Structure](../01-architecture/project-structure.md) (canonical `features/` pattern)
- [Dependency Map](../01-architecture/dependency-map.md) (strategy-tier rows added)
