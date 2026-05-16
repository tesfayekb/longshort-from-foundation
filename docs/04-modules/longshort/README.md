# Long-Short Strategy Documentation

This folder contains all documentation for the long-short trading strategy module, per the per-strategy folder convention documented in `docs/04-modules/strategy-module-pattern.md`.

## Contents

- `longshort.md` — module doc (created in FP-005 long-short Phase 0; not yet present at the time of this folder's creation)
- `design-source/` — canonical design source-of-truth: the CROSSWIND v0.9 spec set plus the ADR-001 reconciliation architecture decision and the spec-source-index attribution document. These files are preserved verbatim from pre-implementation design work. See `design-source/README.md` for full attribution.

## Modularity

This folder is part of the per-strategy modularity invariant per `strategy-module-pattern.md` Removability Contract. Removing the long-short strategy means deleting this entire folder along with `src/features/longshort/`, `src/pages/trading/longshort/`, all `longshort_*` tables, all `longshort-*` edge functions, all `longshort_*` jobs, and all `longshort.*` permissions/events/routes.

Other strategies (options, futures, etc.) get parallel folders under `docs/04-modules/<strategy>/` and never reference this folder's contents.

## Cross-references

- Binding architectural pattern: `docs/04-modules/strategy-module-pattern.md`
- Trading panel shell that hosts long-short: `docs/04-modules/trading-panel.md`
- Plan section: `PLAN-TRADING-001` (foundation) and future `PLAN-LONGSHORT-001` (strategy implementation, FP-005)
- Decisions: `DEC-030` (scope expansion), `DEC-031` (architectural pattern)
