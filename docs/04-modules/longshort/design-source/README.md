# Long-Short Design Source

This folder contains the canonical design source-of-truth for the long-short trading strategy. Files are preserved **verbatim** from pre-implementation design work conducted between operator and AI collaborators (April–May 2026).

## Why verbatim

These files encode hard-won lessons from prior failed similar projects: regression-prevention patterns, source-of-truth discipline, anti-patterns, ROI levers, foundational reconciliation requirements, and silent-failure traps. Distilling selectively into module docs at each future implementation step risks dropping critical rules — exactly the drift pattern that required multiple review rounds during the Step 2b trading-foundation work.

Landing the source verbatim, in one place, makes drops detectable: future module-doc derivations can be grep-checked against the source. Where a derivative doc disagrees with a `MUST` or `REQUIRED` statement in the source, the source is authoritative until explicitly superseded by a new DEC entry.

## Contents

| File | What it covers |
|---|---|
| `CROSSWIND_SPEC.md` | Top-level v0.9 specification (master document, locked May 15 2026 for Phase 0A authorization) |
| `crosswind_spec_v09_part1.md` | Strategy fundamentals, entry/exit philosophy |
| `crosswind_spec_v09_part2.md` / `part2b.md` / `part2c.md` | Signal computation, ranking, scoring |
| `crosswind_spec_v09_part3a.md` / `part3b.md` | Risk model, sizing, ROI levers, anti-patterns |
| `crosswind_spec_v09_part4a.md` / `part4b.md` | Execution model, missing-data architecture, foundational reconciliation layer |
| `crosswind_spec_v09_part5.md` | (per CROSSWIND_SPEC topical attribution) |
| `crosswind_spec_v09_part6.md` | (per CROSSWIND_SPEC topical attribution) |
| `ADR-001-reconciliation-architecture.md` | Architecture Decision Record: reconciliation as foundational quality layer |
| `spec-source-index.md` | Source attribution index for the v0.9 consolidation |

## How to use

When implementing any long-short feature: read the relevant CROSSWIND section(s) before writing code or derivative module docs. Cite specific files + section anchors in PR descriptions (e.g., "implements CROSSWIND §11.0 reconciliation interfaces" rather than generic "per CROSSWIND").

Per `.cursorrules` Rule T1 (Strategy directory layout) and the long-short binding-contract reading rule, any task touching long-short code, tables, edge functions, or jobs MUST read both `docs/04-modules/strategy-module-pattern.md` AND the relevant CROSSWIND files before making changes.

## Status

- Files locked at v0.9 as of pre-implementation hand-off (May 15, 2026)
- ADR-001 status: Accepted, locked v0.9
- These files are NOT modified post-landing. Updates to the long-short design follow normal DEC/FP governance and produce new files (e.g., `crosswind_spec_v1.0_*.md`) — the v0.9 set remains as historical record.

## Pre-existing references in these files

Some files reference paths like `docs/decisions/` that do not exist in this repo (legacy from pre-consolidation directory plans). These are pre-existing and unchanged. The actual repo locations are:
- ADR-001: this folder (`docs/04-modules/longshort/design-source/ADR-001-reconciliation-architecture.md`)
- spec-source-index: this folder (`docs/04-modules/longshort/design-source/spec-source-index.md`)
- All CROSSWIND parts: this folder

Logged as INC-14 (pre-existing path drift in landed source) for the post-Step-5 cleanup batch — DO NOT edit the source files to fix; preserve as historical record.
