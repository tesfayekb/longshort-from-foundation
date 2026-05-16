# Dependency Map

> **Owner:** Project Lead | **Last Reviewed:** 2026-04-09

## Purpose

Defines and controls dependency relationships between modules and shared services.

This document is used to:

- Assess change impact
- Prevent hidden coupling
- Enforce approved dependency direction

## Scope

All modules defined in `docs/04-modules/` and all approved shared services.

## Dependency Rules

- Dependencies must follow the approved architectural layers
- No module may bypass required auth, RBAC, validation, or audit paths
- No hidden or undocumented dependency is allowed
- New cross-module dependencies require updates to this file and affected module docs
- Changes to shared services are HIGH impact unless explicitly proven otherwise
- Reference documents (e.g., `permission-index.md`) are documentation dependencies, not runtime module dependencies, and must not be listed as execution dependencies in the module matrix

## Dependency Types

| Type | Meaning |
|------|---------|
| Auth | Requires authentication context |
| Authorization | Requires RBAC / permission checks |
| Service | Uses another module's approved service/interface |
| Data | Reads/writes shared data structures or tables |
| Event | Produces or consumes events from another module |
| Operational | Depends on jobs, monitoring, config, or infrastructure behavior |

## Module Dependency Matrix

| Module | Depends On | Dependency Types | Depended On By | Risk If Changed |
|--------|-----------|-----------------|---------------|----------------|
| auth | — | — | rbac, user-management, admin-panel, user-panel, api, audit-logging, jobs-and-scheduler | HIGH |
| rbac | auth, audit-logging | Auth, Authorization, Event, Operational | admin-panel, user-panel, api, user-management | HIGH |
| user-management | auth, rbac | Auth, Authorization, Service, Data | admin-panel, user-panel | MEDIUM |
| admin-panel | auth, rbac, user-management, audit-logging, health-monitoring | Auth, Authorization, Service, Operational | — | MEDIUM |
| user-panel | auth, rbac, user-management | Auth, Authorization, Service | — | MEDIUM |
| audit-logging | auth | Auth, Operational | admin-panel, health-monitoring, jobs-and-scheduler | HIGH |
| health-monitoring | audit-logging, jobs-and-scheduler | Operational, Event | admin-panel | MEDIUM |
| api | auth, rbac, audit-logging | Auth, Authorization, Service, Operational | presentation layer consumers | HIGH |
| jobs-and-scheduler | auth, audit-logging | Auth, Operational, Event | health-monitoring | MEDIUM |
| trading-panel | auth, rbac, audit-logging (pattern reference only — NOT data dep on `audit_logs` table), jobs-and-scheduler (pattern reference; no `job_registry` rows from panel itself), strategy modules' `index.ts` façades (narrow carve-out for `src/config/trading-navigation.ts` only — nav/RBAC-key registration ONLY, never strategy internals; see Forbidden Dependencies section for the matching forbidden bullets) | Auth, Authorization, Service, Operational | — | MEDIUM |
| strategy modules (longshort, options, futures, etc. — pattern documented in `strategy-module-pattern.md`) | auth, rbac, audit primitives (custom strategy-audit writer, NOT platform `logAuditEvent`), jobs-and-scheduler (via `job_registry`), api (DEC-023 stack), ui (`DashboardLayout` via TradingLayout) | Auth, Authorization, Service, Data, Event, Operational | trading-panel (façade-import carve-out only) | MEDIUM (per strategy) |

## Shared Services Matrix

| Service | Owner Module | Used By | Dependency Type | Impact If Changed | Tracked In |
|---------|-------------|---------|----------------|-------------------|------------|
| Auth client / auth context resolver | auth | all secured modules | Auth | HIGH | function-index.md |
| Permission checker | rbac | rbac, admin-panel, user-panel, api | Authorization | HIGH | function-index.md |
| Audit logger | audit-logging | all significant write paths and jobs | Operational | HIGH | function-index.md |
| API error handler | api | api, edge functions | Operational | MEDIUM | function-index.md |
| Input validation / sanitization | api | api, edge functions, all input-accepting paths | Service | HIGH | function-index.md |

## Forbidden Dependency Examples

- `admin-panel` must not bypass `rbac`
- `user-panel` must not access audit storage directly
- Frontend must not call privileged service-role paths
- `jobs-and-scheduler` must not bypass `audit-logging` for significant actions
- No module may access another module's internal tables without approved shared service
- Strategy modules MUST NOT import from sibling strategy modules. Cross-strategy interaction goes through platform services or documented registration patterns, never via direct import
- Strategy modules MUST NOT use the platform `logAuditEvent` primitive — that writer is hardcoded to platform `audit_logs` and would violate DEC-031 modularity. Strategy modules use their own audit writer targeting `<strategy>_audit_logs`
- Core platform modules (auth, rbac implementation, audit-logging implementation, jobs scheduler, admin-panel, user-panel) MUST NOT import from any strategy module — including the strategy's `index.ts` façade. The only sanctioned exception is trading-panel infrastructure (`src/config/trading-navigation.ts`), which has a narrow carve-out to import from strategy `index.ts` façades for nav/RBAC-key registration ONLY (never from strategy internals)

## Impact Assessment Rules

- If a module has multiple downstream dependents, default impact is MEDIUM or HIGH
- If a shared service is used across modules, changes are HIGH impact
- Auth, RBAC, security, and audit dependencies are HIGH impact by default
- Dependency map must be checked before changing any shared module or service

## Change Requirements

If dependency relationships change:

1. Update this file
2. Update affected module docs
3. Update relevant reference indexes
4. Update `action-tracker.md`
5. Update `system-state.md` if architectural state changes

## Dependencies

- [Architecture Overview](architecture-overview.md)

## Used By / Affects

AI Operating Model, Change Control Policy, module docs, impact assessment.

## Risks If Changed

HIGH — inaccurate dependency mapping causes missed impact analysis, hidden coupling, and unsafe execution.

## Related Documents

- [Architecture Overview](architecture-overview.md)
- [Function Index](../07-reference/function-index.md)
- [Constitution](../00-governance/constitution.md)
- [Change Control Policy](../00-governance/change-control-policy.md)
