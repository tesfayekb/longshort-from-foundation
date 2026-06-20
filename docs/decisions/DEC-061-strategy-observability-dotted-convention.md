# DEC-061 — Strategy-scoped observability surfaces keyed to the strategy as named in `job_registry` (dotted convention ratified)

> **Owner:** Long-Short Module (canonical strategy at adoption) | **Last Reviewed:** 2026-06-20
> **Status:** approved (operator-ratified)
> **Date Approved:** 2026-06-20
> **Supersedes:** none
> **Superseded by:** —

## Purpose

Ratify the de-facto system-wide naming form for strategy-scoped observability surfaces (scheduled crons, `cron_last_fire` keys, shadow/measurement panels) so that future strategy work follows reality rather than the underscore convention in `strategy-module-pattern.md` Background Jobs Naming. Closes a doc-vs-code drift surfaced at HEAD `8f4e2797` (~13 long-short jobs + seeded `cron_last_fire` rows use dotted; the pattern doc said underscore).

## Decision

Strategy-scoped observability surfaces — scheduled crons, `cron_last_fire` keys, and shadow/measurement panels — are keyed to the strategy as named in `job_registry`, using the dotted `<strategy>.<surface>.<verb>` form (`longshort.combiner_shadow_rank.compute` for long-short). Global fan-out crons (one cron servicing multiple strategies) are forbidden for strategy observability; each strategy owns independently-named, independently-removable observability jobs.

## Rationale

1. The dotted convention is the de-facto system-wide standard (~13 long-short jobs + seeded `cron_last_fire` rows, grep-verified at HEAD `8f4e2797`); ratifying reality avoids an INC-class breakage across every cron-key / header reader for zero functional payoff.
2. Dotted `<strategy>.<surface>.<verb>` is strictly more expressive than the flat underscore form — it encodes the sub-surface the flat form loses.
3. Per-strategy keying makes a second strategy a copy-paste: its own cron, its own `cron_last_fire` rows (via the FK), its own panel, with no platform-side refactor.
4. T6 removability is glob-equivalent: `longshort.*` deletes as cleanly as `longshort_*`.

## Bindings

- Future strategy observability crons MUST follow the form `<strategy>.<surface>.<verb>` (exactly three dot-separated segments, all lowercase, each segment matching `[a-z][a-z0-9_]*`) and be registered to `job_registry`.
- `cron_last_fire` keying inherits the strategy via its `job_id` FK to `job_registry(id)` (MIG-103, `ON DELETE CASCADE` — verified at HEAD `8f4e2797`), so Layer-1 observability rows cascade away with their owning job row.
- Strategy measurement panels (e.g., the forthcoming L2 surface) mount under `/trading/<strategy>/`, never under admin, per the dependency-tier rule at `strategy-module-pattern.md:240`.

## Consequences

- Reconciles `strategy-module-pattern.md` Background Jobs Naming (underscore convention + examples to dotted three-segment grammar) — tracked DW-116.
- Reconciles the Removability Contract job glob (`strategy-module-pattern.md` line 275) from `<strategy>_*` to `<strategy>.*` as a forced spelling alignment to the dotted convention (semantics-preserving: the same set of strategy-owned jobs, correctly addressed). The wider replacement of glob-based removal by a name-by-name manifest is tracked under DW-115.
- Does not resolve the unprefixed `combiner_*` table gap — tracked separately DW-115 (manifest path).

## Authority

Operator-authorized supervisor session 2026-06-20. Ratified after reconciliation pass against HEAD `8f4e2797`.

## Related Documents

- [`approved-decisions.md`](../08-planning/approved-decisions.md) — DEC-061 index entry
- [`strategy-module-pattern.md`](../04-modules/strategy-module-pattern.md) — Background Jobs Naming + Removability Contract (reconciled in same PR)
- [Deferred Work Register](../08-planning/deferred-work-register.md) — DW-115 (manifest path), DW-116 (this PR's doc reconciliation)
