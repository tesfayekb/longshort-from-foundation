# AI Failure Modes Catalog

> **Owner:** Project Lead | **Last Reviewed:** 2026-05-25 (ACT-111 initial landing)
> **Authority:** CROSSWIND_SPEC.md §12.5 Rule 10 + §12.10 capture protocol
> **Review Cadence:** Quarterly per §12.8; quarterly-review ADRs land in `docs/decisions/`

## Purpose

This document serves two coexisting governance purposes under the canonical filename mandated by CROSSWIND §12.5 Rule 10 + §12.10:

**(A) Catalog section (Sections 4-9 below):** Single authoritative catalog of AI failure modes ("defect classes") observed in the supervisor-executor-operator loop. Each entry documents a recurring failure **pattern**, its symptom, its codification target in supervisor-instructions, and links to the actions where it was first surfaced and subsequently re-fired. This section mirrors supervisor-instructions §21.10 forward-binding defect-class catalog at repo level (resilient to operator-side Claude.ai project-context loss; visible to executor; grep-able).

**(B) §12.10 Operational Log section (final section below):** PR-time AI-loop failure event log per CROSSWIND §12.10 verbatim. Each entry documents one observed **event** during executor / supervisor / operator review cycles, captured per the §12.10 8-field protocol.

Per §12.5 Rule 10, these sections exist so that failure patterns (Section A) become structural disciplines (pre-flight checks, banned-patterns scanners, etc.) AND so that PR-time failure events (Section B) are continuously logged for quarterly review per §12.8 cadence — rather than relying on case-by-case operator catch.

## Scope

**Catalog section scope:**
- All defect classes surfaced during supervisor drafting, executor pre-flight, or operator review that represent a *pattern* (not a one-off mistake).
- Quarterly review reconciles the catalog against the prior quarter's action-tracker entries; new patterns are added, retired patterns are marked closed.
- Cross-cutting reviews land as ADRs in `docs/decisions/`.

**§12.10 Operational Log section scope:**
- All PR-time AI-loop failure events surfaced during executor / supervisor / operator review cycles per CROSSWIND §12.10 verbatim 7 canonical categories.
- Quarterly review per §12.8 cadence asks the §12.10 review questions; output is an ADR per §12.6 at `docs/decisions/`.
- See "§12.10 Operational Log" section below for the full §12.10 protocol.

## Catalog Format (MANDATORY)

Each entry MUST include:

- **ID** — `#NN` stable identifier
- **Name** — short descriptive label
- **Symptom** — what the failure looks like at draft / pre-flight / commit time
- **Codification target** — which supervisor-instructions section encodes the discipline that prevents recurrence
- **First fired** — ACT-NNN where surfaced
- **Subsequent firings** — list of ACT-NNN re-fires (signal of structural necessity)
- **Status** — `open` / `codified` / `retired`

## Catalog

### #34 — FP-008 Status Forward-Fix Required After Closure

| Field | Value |
|-------|-------|
| **Symptom** | FP-008 sub-step closures landed without updating the parent FP's Status field; status field lagged actual closure state. |
| **Codification target** | supervisor-instructions §22.3 (codification pending v0.6.3 batch) |
| **First fired** | ACT-108 |
| **Subsequent firings** | ACT-109, ACT-110 (continuing forward-fix) |
| **Status** | open |

### #35 — §22.5.2 Split-Execution Over-Application

| Field | Value |
|-------|-------|
| **Symptom** | Supervisor mandated §22.5.2 split-execution verification when no capability mismatch existed for the touched objects (e.g., job_registry seed via migration). |
| **Codification target** | supervisor-instructions v0.6.3 §22.3 (f) — §22.5.2 triggers only on real capability mismatch |
| **First fired** | ACT-108 |
| **Subsequent firings** | ACT-109, ACT-110 (logged forward, no in-cycle correction) |
| **Status** | open (codification target identified) |

### #36 — Supervisor Surface/Path Pre-Resolution Without Repo-Grep Verification

| Field | Value |
|-------|-------|
| **Symptom** | Supervisor pre-resolves Surface-N claims or path references using artifact-name inference or chat-memory rather than fresh repo-grep verification. Examples: claiming a table persists data it does not persist; claiming a directory exists when it does not; claiming a doc target path when the canonical location is elsewhere. |
| **Codification target** | supervisor-instructions v0.6.3 §22.3 (g) — schema/capability/path repo-grep mandatory at draft time |
| **First fired** | ACT-109 (`universe_refresh_log` persistence shape claim — caught by Lovable §22.8.4 STOP) |
| **Subsequent firings** | ACT-111 dual firing: (a) `docs/decisions/` claimed to exist; (b) `docs/06-tracking/deferred-work-register.md` claimed as DW-065 target. Both caught by Lovable §22.8.4 STOP. |
| **Status** | open — codification target identified; pattern_signal that drafting checklist needs path-grep as a standing pre-flight item alongside idiom-grep + schema-grep |

### #37 — In-Cycle Disposition Ruling Without File-Content Verification

| Field | Value |
|-------|-------|
| **Symptom** | Supervisor issues an in-cycle disposition (rename / refactor / reconciliation) without first verifying the file's content shape against the disposition's assumed shape. |
| **Codification target** | supervisor-instructions v0.6.3 §22.3 (h) |
| **First fired** | ACT-110 sub-step 8.6 reconciliation |
| **Subsequent firings** | — |
| **Status** | open |

### #38 — File-Rename Reconciliation Without Runner-Glob Pickup Verification

| Field | Value |
|-------|-------|
| **Symptom** | File-rename reconciliation executed without verifying the test runner's glob pattern continues to pick up the renamed file. Sibling of #36/#37 family applied to file-rename decisions. |
| **Codification target** | supervisor-instructions v0.6.3 §22.3 (i) |
| **First fired** | ACT-110 (test rename: `.test.ts` → `_test.ts` without vitest glob verification; corrected back) |
| **Subsequent firings** | — |
| **Status** | open |

## Quarterly Review Protocol (per §12.8)

1. At each quarterly boundary, review action-tracker entries from the prior quarter for defect-class firings.
2. New patterns → add catalog entry with `open` status.
3. Codified patterns confirmed (no firings for 2+ quarters) → mark `retired`.
4. Re-fires of `codified` patterns → escalate: codification is incomplete; surface to operator for structural reinforcement.
5. Quarterly-review outcome documented as an ADR in `docs/decisions/`.

## Used By / Affects

- Supervisor drafting discipline (pre-flight checklists)
- Lovable executor pre-flight gates (§22.8.4 STOP triggers)
- Quarterly governance review cadence
- Action-tracker self-disclosure narratives

## Related Documents

- [Constitution](00-governance/constitution.md)
- [System State](00-governance/system-state.md)
- [Action Tracker](06-tracking/action-tracker.md)
- [Deferred Work Register](08-planning/deferred-work-register.md) — DW-065 (this artifact's landing trace; also tracks the FP-006 ADRs path-convention drift)
- `CROSSWIND_SPEC.md` §12.5 Rule 10 + §12.10 (lines 3180-3220) — authoritative source for the §12.10 Operational Log section structure (7 canonical categories + 8-field capture protocol + quarterly review cadence)
- Supervisor-instructions §21.10 (operator-side Claude.ai project context) — authoritative source for the Catalog section structure; this artifact mirrors §21.10 entries at repo level

## Risks If Changed

MEDIUM — lost catalog entries cause defect classes to re-fire without recognition; quarterly review cadence becomes hollow.

---

## §12.10 Operational Log — PR-Time AI-Loop Failure Events

**Authority:** CROSSWIND_SPEC.md §12.5 Rule 10 + §12.10 verbatim (lines 3180-3220)
**Purpose:** Operational log of PR-time AI-loop failure events per §12.5 Rule 10 mandate
**Scope distinction:** This section captures **PR-time AI-loop failure events** as observed during executor / supervisor / operator review cycles. Distinct from the "Catalog" section above (Sections 4-9), which mirrors supervisor-instructions §21.10 forward-binding defect-class patterns. Both sections coexist under this single canonical filename per CROSSWIND §12.5 Rule 10 + Constitution Rule 5 (no duplicate documentation).

### Scope (per §12.10)

> *"§12.10 addresses the operational failure modes that surface during AI-assisted development — patterns where the AI loop (executor + supervisor) produces output that bypasses, misinterprets, or fails to apply the structural verification surface."*

> *"Operational document: `docs/ai-failure-modes.md` is maintained continuously throughout the project. Entries are appended as failures are observed; no entry is removed (operational history is preserved)."*

### Canonical failure categories (per §12.10 verbatim)

1. **Executor-supervisor blind spot.** Both AI tools share context and validate against derived signals (tests pass, code looks correct). Both miss the same defect class. Example: a sentinel fallback re-introduced after refactor; supervisor approves because tests pass; reconciliation engine catches it post-merge.

2. **Evidence-tier bypass attempt.** AI proposes a Strong+/Strong tier change without attaching required artifacts, or claims artifacts exist when they don't. CI catches this per §12.5 enforcement, but the AI behavior pattern is itself a failure mode worth logging.

3. **Reconciliation-event silenced.** AI suppresses a reconciliation_events firing (catches the exception, modifies tolerance, adjusts the verify_* call signature) rather than addressing the underlying divergence. Logged when operator detects post-merge.

4. **Behavior deviating from spec without ADR.** AI proposes a change that touches a locked decision (per Rule 6) without explicit human confirmation. Caught by operator review.

5. **Sentinel fallback re-introduction.** AI re-introduces a banned pattern per §11.8 in a refactor or new feature. CI grep catches this; the AI behavior is the failure mode.

6. **datetime.now() re-introduction in business logic.** Same pattern as #5 but for §11.9 ban.

7. **Replay-test PASS forged or skipped.** AI claims replay-test PASS without running, or skips replay-test where required by §11.10.4. Logged when operator detects.

Novel patterns: when an observed failure mode does not match any of categories 1-7, log it with `category: NEW`. Quarterly review (per §12.8) considers whether to promote the novel pattern to canonical.

### Capture protocol (per §12.10 verbatim — 8-field entry shape)

For each observed failure mode, append an entry below with the following 8 fields:

| Field | Description |
|---|---|
| `ts` | UTC timestamp (ISO-8601) |
| `category` | One of canonical categories 1-7, or `NEW` if novel |
| `pr_ref` | PR or change reference (SHA / branch / ACT-N entry / etc.) |
| `ai_tool` | Which AI tool surfaced the failure: `executor` / `supervisor` / `both` |
| `description` | What was attempted; what failed |
| `detection_path` | How the failure was caught: `CI` / `reconciliation engine` / `operator review` / `post-merge` / other |
| `resolution` | Corrective action taken: revert / patch / discipline reinforcement / spec amendment / etc. |
| `pattern_signal` | Whether this failure indicates a structural pattern requiring spec or rule update: `none` / `weak signal` / `strong signal — see <ADR/amendment ref>` |

### Entry format

Entries are appended chronologically (oldest first) below the `### Entries` heading. Each entry uses an `#### YYYY-MM-DD — Brief title` heading + table.

Example shape (not a real entry — for format reference only):

> #### EXAMPLE — Sentinel fallback re-introduced after refactor
>
> | Field | Value |
> |---|---|
> | `ts` | 2026-MM-DDTHH:MM:SSZ |
> | `category` | 5 (Sentinel fallback re-introduction) |
> | `pr_ref` | ACT-NNN (`<short-SHA>`) |
> | `ai_tool` | both (executor introduced; supervisor missed at PR review) |
> | `description` | During <module> refactor, `?? 0` sentinel fallback re-introduced at <file>:<line>. Tests passed because fixture data covered the non-null path. Reconciliation engine caught divergence post-merge when production data exercised the null path. |
> | `detection_path` | reconciliation engine (post-merge firing on `verify_<X>`) |
> | `resolution` | Revert sentinel; replace with typed-absence (`Optional`/`null`-with-narrowing); add reconciliation telemetry assertion to test suite. |
> | `pattern_signal` | weak signal — this is the second occurrence of category 5 in 2026; if a third occurs within Q2, consider strengthening §11.8 grep enforcement scope. |

### Quarterly review (per §12.10 + §12.8 verbatim)

The operator reviews this operational-log section quarterly per §12.8 documentation review cadence. Review questions per §12.10 verbatim:

- Are any failure categories occurring more frequently than baseline (>3× quarterly rate)?
- Do any patterns indicate a §12.5 rule needs strengthening?
- Do any patterns indicate a §11.0 verify_* call is misclassified?
- Should any new failure category be added to the canonical list?

**Quarterly review output:** an ADR entry per §12.6 documenting findings and any rule updates. ADRs go to `docs/decisions/`; this operational-log section is the operational record, not the decision record.

### Distinction from Catalog section (Sections 4-9 of this document)

The **Catalog section** above mirrors supervisor-instructions §21.10 forward-binding defect-class patterns. Entries there (currently #34-#38) document supervisor-side prompt-drafting + reconciliation discipline patterns and their codification targets in supervisor-instructions. Catalog entries are **pattern-level**: each represents a class of failures with codification status.

This **Operational Log** captures PR-time AI-loop failure events. Entries here are **event-level**: each represents one observed firing of an AI-loop failure during executor / supervisor / operator review cycles. An event entry may reference a catalog entry as its pattern signal (e.g., a PR-time firing of catalog #36 would log here with `pattern_signal: see Catalog #36`).

Cross-reference at PR-time: when a catalog #NN pattern fires at PR time AND maps to a §12.10 canonical category, an operational-log entry is appended below citing both the §12.10 category and the catalog #NN reference.

### Entries

*(No entries at creation. Entries appended as PR-time AI-loop failure events are observed during executor / supervisor / operator review cycles; no entry removed — operational history preserved per §12.10 verbatim.)*

#### 2026-05-30 — Deno config silently disables npm autodetection

| Field | Value |
|---|---|
| `ts` | 2026-05-30T00:00:00Z |
| `category` | 7 (Tooling / environment configuration silently changes behavior) |
| `pr_ref` | FP-008.4 Commit 1 |
| `ai_tool` | executor (introduced `supabase/functions/deno.json` for vitest-discovery exclusion) |
| `description` | Any `supabase/functions/deno.json` change must preserve `nodeModulesDir: "auto"` + an `imports` map for npm bare specifiers (`@supabase/supabase-js` and any other npm bare specifiers). Introducing or modifying `deno.json` without these silently disables Deno's implicit npm autodetection and re-breaks bare-specifier resolution on production code. Discovered during vitest-exclusion config introduction when 5× TS2307 on `@supabase/supabase-js` surfaced in production files that previously type-checked clean. |
| `detection_path` | Gate 11 type-check run (`deno test --no-run _shared/`) after deno.json introduction |
| `resolution` | Inline fix during Commit 1: added `nodeModulesDir: "auto"` + `imports` map. Rule memorialized here. **Verification after any future `deno.json` edit:** `cd supabase/functions && deno test --no-run --allow-net --allow-env --allow-read _shared/` MUST exit 0. |
| `pattern_signal` | first occurrence — single firing; if a second config-introduction defect surfaces in 2026, escalate to a Catalog entry with codified pre-flight check. |