# Banned Patterns Registry

> **Owner:** Project Lead | **Last Reviewed:** 2026-05-25

## Purpose

Per DEC-034 clause (2) verbatim: "Banned-pattern list and override registry maintained in `docs/banned-patterns.md`."

Per ADR-003 enforcement-as-scripts-not-prose: this document is the registry; the enforcement lives in tested scripts under `scripts/check-*.ts` invoked by `.github/workflows/strong-evidence.yml`.

## Scope

These patterns are banned in financial-logic paths:
- `src/features/longshort/services/**`
- `src/features/longshort/api/**`
- `supabase/functions/longshort-*`
- `supabase/functions/_shared/strategy-reconciliation.ts` (when populated)
- `supabase/functions/_shared/longshort-*` (verifiers + lifecycle + state + types — wall-clock scope per DEC-034 (4))

## Banned Patterns + Enforcement Mapping

| # | Pattern | DEC Anchor | Enforcement Script | Override Annotation |
|---|---|---|---|---|
| 1 | `value ?? 0` in financial paths | DEC-034 (2) | `scripts/check-sentinel-patterns.ts` | `// allow-sentinel-fallback: <ADR-ID>` |
| 2 | `value \|\| 0` in financial paths | DEC-034 (2) | `scripts/check-sentinel-patterns.ts` | same |
| 3 | `parseFloat(x) \|\| 0` / `parseFloat(x) ?? 0` | DEC-034 (2) | `scripts/check-sentinel-patterns.ts` | same |
| 4 | Hardcoded sentinel returns (-1 / -999 / 999 / 9999) | DEC-034 (2) | `scripts/check-sentinel-patterns.ts` | same |
| 5 | Bare `parseFloat(x)` without `Number.isFinite()` guard | ACT-097 finding #13 (B1) | `scripts/check-unguarded-parsefloat.ts` | `// allow-bare-parsefloat: <ADR-ID or DW-ID>` |
| 6 | `Date.now()` | DEC-034 (4) | `scripts/check-wall-clock.ts` | `// allow-now-in-business-logic: <ADR-ID>` |
| 7 | `new Date()` no-arg constructor | DEC-034 (4) | `scripts/check-wall-clock.ts` | same |
| 8 | `performance.now()` | DEC-034 (4) | `scripts/check-wall-clock.ts` | same |
| 9 | `Temporal.Now.*` | DEC-034 (4) | `scripts/check-wall-clock.ts` | same |
| 10 | `://api.alpaca.markets` (live URL) in `src/features/longshort/` | DEC-036 (2) | `scripts/check-paper-only-url.ts` | `// allow-live-alpaca-url: <ADR-ID>` |
| 11 | `try { ... } catch { return 0 }` phantom-success swallow | DEC-034 (2) | `scripts/check-catch-returns-zero.ts` | `// allow-catch-zero: <ADR-ID>` |
| 12 | Strategy code imports `logAuditEvent` from platform `_shared/audit.ts` | DEC-034 (5) | `scripts/check-audit-writer-trap.ts` | (no override; audit-writer trap is non-negotiable) |
| 13 | Verify-after-mutation in financial paths | CROSSWIND §7.5 / FP-008.4 Commit 7 | `scripts/check-verify-after-mutation.ts` | `// gate-13-allow: <reason>` |
| 14 | Dual Supabase-client type identity (esm.sh vs npm) | FP-008.4 Commit 7.5 / DW-082 A1.b | `scripts/check-supabase-client-specifier.ts` | (no override; specifier unification is non-negotiable) |
| 15 | Enabled+scheduled `job_registry` row pointing at NOT-FOR-LIVE / MOCK_*_FETCHER handler, OR enabled+scheduled with NULL `handler_path` | FP-008.4 Commit 10 / DW-084 / INC-39 | `scripts/check-handler-liveness-markers.ts` | `// gate-15-allow: <ID>` (P1 only; P2 has no override — register the handler in `job_registry.handler_path`) |

## Sanctioned Exception Locations

Per DEC-034 clause (4) verbatim: time injection MAY be read at sanctioned locations only:
- `supabase/functions/_shared/longshort-clock.ts` — the SOLE sanctioned wall-clock read for Deno edge-function side reconciliation paths
- `src/features/longshort/utils/clock.ts` — sanctioned wall-clock read for Vite-tree side (when populated)

## Active Overrides

Active overrides at this registry version (2026-05-25). Two override classes:

**Phase-7-deferred** (interim overrides; expected to close when the named DW entry closes):

| Pattern | Location | Override ID | Rationale | Expected Resolution |
|---|---|---|---|---|
| Bare `parseFloat()` | `src/features/longshort/services/broker/alpaca/alpaca-position-fetcher.ts` lines 30-31 | `DW-058-B1` | ACT-097 audit finding #1; Phase 7 fetcher-wiring remediates via Number.isFinite() throw-on-NaN guard | DW-058 closure (Phase 7) |
| Bare `parseFloat()` | `src/features/longshort/services/broker/alpaca/alpaca-buying-power-fetcher.ts` lines 22-23 | `DW-058-B1` | same | DW-058 closure (Phase 7) |
| Bare `parseFloat()` | `src/features/longshort/services/broker/alpaca/multi-pending-harness.ts` line 61 | `DW-058-B1` | same | DW-058 closure (Phase 7) |

**Permanent** (the override IS the right shape forever; no resolution required because the pattern is intrinsic to the chartering ADR's purpose):

| Pattern | Location | Override ID | Rationale | Expected Resolution |
|---|---|---|---|---|
| `new Date().toISOString()` | `src/features/longshort/services/broker/alpaca/multi-pending-harness.ts` line 342 | `ADR-002` | Detection-latency measurement for ADR-002 §8.6.1.1 empirical validation harness; the timestamp IS the value being measured (when position-poll started), not a derived value. ADR-002 is the chartering authority per its Context section ("FP-006 sub-step 6.8 implemented an empirical validation harness... testing the 7 empirical questions enumerated in DEC-036 clause (6)"). | Permanent — wall-clock use is intrinsic to the harness's purpose |
| `new Date().toISOString()` | `src/features/longshort/services/broker/alpaca/multi-pending-harness.ts` line 347 | `ADR-002` | Detection-latency measurement: timestamp at which position became visible to broker after order placement; intrinsic empirical observation. | Permanent |

## Adding a New Override

Per DEC-034 clause (2) asymmetric-change discipline: loosening enforcement requires an ADR.

1. Author or amend an ADR documenting the legitimate reason + boundary
2. Annotate the line with `// allow-<pattern>: <ADR-ID>` (or `<DW-ID>` for interim Phase-N-deferred remediation)
3. Add a row to the appropriate Active Overrides class above (Phase-N-deferred or Permanent) with rationale + expected resolution

## Adding a New Banned Pattern

1. Author or amend a DEC documenting the requirement
2. Add an enforcement script under `scripts/check-<name>.ts` modeled on existing scripts
3. Add `_test.ts` companion with unit tests including a `scanRepository — clean on current repo` test
4. Add a new gate step to `.github/workflows/strong-evidence.yml`
5. Add a row to the "Banned Patterns + Enforcement Mapping" table above

## Related Documents

- [DEC-034](08-planning/approved-decisions.md) — Reconciliation Engine Invariants (clauses (2) + (4) + (5))
- [DEC-036](08-planning/approved-decisions.md) — Alpaca Paper Integration Scope (clause (2))
- [DEC-037](08-planning/approved-decisions.md) — Evidence-Workflow Tooling Format (clause (8) CI enforcement)
- [ADR-002](04-modules/longshort/design-source/ADR-002-alpaca-multi-pending-validation.md) — chartering authority for harness wall-clock overrides
- [ADR-003](04-modules/longshort/design-source/ADR-003-enforcement-as-scripts-not-prose.md) — the principle this registry self-applies
- [Constitution](00-governance/constitution.md) (Rule 7 — No Silent Behavior Change)