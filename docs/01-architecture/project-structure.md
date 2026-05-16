# Project Structure

> **Owner:** Project Lead | **Last Reviewed:** 2026-04-10

## Purpose

Defines the enforced file and folder organization for the codebase.

This structure ensures:

- Modularity
- Maintainability
- Consistent patterns across all features

## Scope

All source code, configuration, and supporting files.

## Enforcement Rule (CRITICAL)

- All code MUST follow this structure
- No ad-hoc folders or files are allowed outside defined structure
- If a file does not fit → structure must be updated (via plan approval), not bypassed
- Violations = **INVALID** implementation

## Root Structure

```
src/
supabase/
sql/
docs/
```

## Documentation Structure (`docs/`)

```
docs/
├── 00-governance/        # Constitution, change control, system state, AI rules
├── 01-architecture/      # Architecture overview, dependency map, design principles, project structure
├── 02-security/          # Auth security, authorization, input validation
├── 03-performance/       # Caching, DB performance, strategy
├── 04-modules/           # Module specs (auth, rbac, admin, user, audit, health, api, jobs)
├── 05-quality/           # Testing strategy, regression strategy
├── 06-tracking/          # Action tracker, risk register, regression watchlist
├── 07-reference/         # Function, permission, route, event, config, env var indexes
│   ├── artifact-index.md       # Catalog of all governed implementation artifacts
│   └── database-migration-ledger.md  # Ordered DB migration history with status
└── 08-planning/          # Master plan, approved decisions, changelog, review log
    ├── phase-closures/          # One authoritative closure record per phase
    └── deferred-work-register.md
```

## Frontend Structure (`src/`)

```
src/
├── components/           # Shared UI components
│   ├── ui/              # shadcn/ui base components
│   ├── layout/          # Layout components (header, sidebar, etc.)
│   └── common/          # Reusable domain-agnostic components
├── features/            # Feature modules (domain-specific)
├── hooks/               # Shared custom hooks
├── lib/                 # Utilities, clients, helpers (must remain generic)
├── pages/               # Route-level page components
├── types/               # Shared TypeScript types
├── config/              # Environment + runtime configuration
└── test/                # Test setup and utilities
```

## Feature Module Structure (MANDATORY)

Each feature must follow:

```
features/{feature-name}/
├── components/          # Feature-specific UI
├── hooks/               # Feature-specific hooks
├── services/            # Business logic
├── types/               # Feature-specific types
├── utils/               # Feature-specific utilities
├── api/                 # API interaction layer
└── index.ts             # Public interface
```

**Rules:**

- Features must expose a public API via `index.ts`
- No direct imports from another feature's internal files
- Cross-feature interaction must go through:
  - Shared services
  - API layer
  - Approved interfaces

### Adoption Status and Dual-Pattern Note

The `features/{feature-name}/` pattern documented above is the canonical structure for new feature modules. As of FP-004 (DEC-031, 2026-05-15) the pattern is first adopted by trading strategy modules under `src/features/<strategy>/` (long-short first; options, futures, and other strategies follow as separate proposals).

The pre-existing admin panel and user panel modules — located at `src/pages/admin/` + `src/components/admin/` and `src/pages/user/` + `src/components/user/` respectively — predate this convention and are NOT migrated. They remain in their established locations.

**Rule:** All new feature modules MUST adopt the `features/` pattern. Existing admin/user panels are grandfathered; they are not in scope for migration unless a separate proposal explicitly approves it.

### Strategy-Specific Table Naming (added by DEC-031)

Strategy data tables MUST be named `<strategy>_<entity>` in the `public` schema (e.g., `longshort_positions`, `longshort_signals`, `options_positions`). Per-strategy audit log tables follow the same prefix: `<strategy>_audit_logs` (e.g., `longshort_audit_logs`). The platform `audit_logs` table is NOT modified or extended for trading events.

This naming convention is binding for any future strategy module per `docs/04-modules/strategy-module-pattern.md`.

## Shared Code Structure

| Folder | Purpose |
|--------|---------|
| `components/` | UI primitives and reusable components |
| `hooks/` | Shared hooks |
| `lib/` | Utilities, helpers, clients (must remain generic) |
| `types/` | Shared type definitions |
| `config/` | Environment + runtime configuration |

**Rule:** `lib/` must not become a dumping ground. Shared logic must be generic and reusable.

## Backend / Supabase Structure

```
supabase/
├── migrations/          # Database migrations
└── functions/           # Edge functions
```

### Functions Structure

```
functions/
├── {function-name}/
│   ├── index.ts         # Entry point
│   ├── handlers/        # Request handlers
│   ├── services/        # Business logic
│   └── utils/           # Function-specific utilities
```

**Rules:**

- Each function must be self-contained
- Business logic belongs in `services/`, not directly in handlers
- No duplication across functions — shared logic must be centralized

## Testing Structure

```
test/
├── unit/                # Isolated logic tests
├── integration/         # Module interaction tests
├── e2e/                 # User flow tests
```

**Rules:**

- Unit tests for isolated logic
- Integration tests for module interactions
- E2E tests for user flows

## Import Rules

- No circular imports allowed
- Features cannot import internal files from other features
- Shared logic must be accessed via approved shared modules

## Configuration Rules

- Environment variables must be defined in `config/` and tracked
- No hardcoded secrets or configuration values
- Sensitive config must not exist in client code

## Dependencies

- [Architecture Overview](architecture-overview.md)
- [Dependency Map](dependency-map.md)

## Used By / Affects

All development and file organization decisions.

## Risks If Changed

MEDIUM — improper changes lead to disorganized codebase and hidden coupling.

## Related Documents

- [Architecture Overview](architecture-overview.md)
- [Dependency Map](dependency-map.md)
- [System Design Principles](system-design-principles.md)
