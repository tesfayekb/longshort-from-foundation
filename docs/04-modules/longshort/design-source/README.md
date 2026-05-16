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

Several CROSSWIND files reference paths that do not exist in this repo (legacy from pre-consolidation directory plans and from anticipated implementation artifacts not yet created). These are pre-existing and unchanged. **DO NOT edit the source files to fix these references** — preserve as historical record per the verbatim-landing principle.

### Full inventory of non-existent path references in CROSSWIND files

| Referenced path | Reality | Files referencing (count of `*.md` files in `design-source/` excluding README that contain ≥1 substring match) |
|---|---|---|
| `docs/decisions/` (folder) | Folder does not exist in repo; ADR / spec-source artifacts live in this `design-source/` folder instead | 8 |
| `docs/decisions/ADR-001-reconciliation-architecture.md` | Actual location: `docs/04-modules/longshort/design-source/ADR-001-reconciliation-architecture.md` | 5 |
| `docs/decisions/spec-source-index.md` | Actual location: `docs/04-modules/longshort/design-source/spec-source-index.md` | 8 |
| `docs/ai-failure-modes.md` | File does not exist; concept may be implemented as part of FP-005 Phase 0+ or as a separate cleanup artifact | 3 |
| `docs/banned_patterns.md` | File does not exist; concept may be implemented as part of FP-005 Phase 0+ banned-pattern linting work per CROSSWIND §11.8 | 3 |
| `docs/missingness_profile.md` | File does not exist; concept may be implemented as part of FP-005 Phase 0+ missing-data architecture per CROSSWIND §6.5 | 4 |
| `docs/phase_3_missingness_stress_test.md` | File does not exist; planned stress-test artifact, FP-005 phase TBD | 2 |
| `docs/CROSSWIND_SPEC_consolidation_journal.md` | File does not exist; historical journal artifact, not landed in repo | 1 |
| `docs/replay/captures-index.md` | File does not exist; replay-framework artifact per CROSSWIND §11.10, FP-005 phase TBD | 1 |

**Counting semantics (locked):** the rightmost column is `grep -l … | wc -l` — number of distinct `*.md` files under `docs/04-modules/longshort/design-source/` (excluding README.md) that contain at least one substring match for the referenced path. This is NOT the total occurrence count across the corpus (which would use `grep -c` and would be substantially higher — e.g., `docs/decisions/` appears in 8 files but with ~26 total occurrences across them). Execution-time verification (item 16) MUST use the file-count formula. If a future maintainer wants to also track occurrence totals, that is a separate column to add, not a relabeling of this one.

### Disposition

These 9 path patterns appear in the landed CROSSWIND files exactly as written. The verbatim-landing principle (per Step 3.5 design) requires that they remain unchanged so the canonical design source is preserved byte-identical to the pre-implementation hand-off.

**Three resolution options for the post-FP-005 cleanup batch:**

1. **Post-landing addendum.** Add a "Reference reconciliation" appendix to each affected CROSSWIND file (without modifying the original content) mapping the legacy paths to actual repo locations. Preserves the source AND makes references navigable for human readers. Recommended for the `docs/decisions/` family since those have direct equivalents in the repo today.

2. **Companion glossary doc.** Create `docs/04-modules/longshort/path-reconciliation.md` as a single companion file listing all 9 path patterns and their actual locations (or "not yet created — planned for FP-005 Phase X"). Cleaner separation than per-file appendices.

3. **Accept as immutable historical drift.** Leave the references as-is. Acceptable if downstream consumers always read CROSSWIND through the design-source folder context (where it's clear ADR-001 lives in `design-source/`) rather than trying to literally resolve every path.

Decision deferred to post-FP-005 cleanup batch (Step 6 in current workstream). FP-005 implementation work will likely produce some of the not-yet-existing files (`banned_patterns.md`, `missingness_profile.md`, `replay/captures-index.md`) — choosing Option 1 or 2 only makes sense after we know which files actually get created.

This INC-14 entry supersedes the original Step 3.5 INC-14 entry (which only listed the `docs/decisions/` family).
