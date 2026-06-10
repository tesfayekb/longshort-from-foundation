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

### #39 — Vendor-Cap Arithmetic Inconsistency Between Documented Budget and Code-Level Config

| Field | Value |
|-------|-------|
| **Symptom** | A signal-registration's `callsPerName` (or analogous slot-cost field) diverges from the fetcher's TRUE per-ticker wire-call count, while the file-header arithmetic comment (and module-doc arithmetic row) cite the TRUE count. The two narratives are internally inconsistent; the test that pins the arithmetic budget hand-enters the wire-call multiplier (`sliceSize * 2`) instead of deriving it from `callsPerName`, so the test passes against the documented number while the runtime config under-counts the budget. A second token-bucket inside the adapter — duplicating the engine's worker-side bucket — is the common implementation co-defect (two buckets at the same rate, serialized, double-acquisition) that silently doubles per-ticker wall time. Gates 2/4/11 cannot detect: lint/typecheck/Deno-tests pass; the defect surfaces only as slice-budget erosion under load, or as a budget-narrative grep mismatch under fresh-clone review. |
| **Codification target** | Structural test pattern (per-signal registration test): declare `<VENDOR>_WIRE_CALLS_PER_TICKER = N` constant in the registration test file with a header comment citing the fetcher function as source-of-truth; assert `callsPerName === <VENDOR>_WIRE_CALLS_PER_TICKER`; derive `perSliceWire = (sliceSize × callsPerName) / ratePerSec` (NOT a hand-entered `* N`). Pair invariant in module-doc: pacing owned in EXACTLY ONE place (the engine's slice-worker bucket) — adapters MUST pass raw `fetch` to fetchers, never a second `pacedHttpFetch`-wrapped fetch. Codification landed in `options-flow-queue-registration_test.ts` (REVISION-FIX 2026-06-10); reference template for all future per-signal registrations. |
| **First fired** | FP-044 Phase 2 / INC-72 (orchestrator header rate-math comment claimed "≤10 req/sec well under the cap" against Finnhub's 5 rps cap; concurrency-throttled `pLimitedMap` does not enforce req/sec; empirical 504 detection). Logged in §12.10 operational log entry "2026-06-09 — Supervisor fresh-clone verification missed vendor-cap arithmetic on FP-044 Phase 2 (PEAD orchestrator)". |
| **Subsequent firings** | FP-045 Phase 4 closure (2026-06-10) shipped `callsPerName=1` against Tradier 2-call/ticker shape, with a second adapter-side `TokenBucket` causing double-acquisition; documented budget cited `2 × 80 / 1.7 ≈ 94.1s` while runtime per-ticker time was ~1.76s (80-slice ≈ 141s); REVISION-FIX same day. §12.10 operational log second-occurrence entry below. |
| **Status** | open — codified at the per-signal-registration test level (REVISION-FIX 2026-06-10); structural scanner extension still pending (a Gate-2-style grep for "second `pacedHttpFetch` inside an adapter when the engine bucket already paces" would catch the implementation co-defect at PR time). |

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

#### 2026-06-09 — Supervisor fresh-clone verification missed vendor-cap arithmetic on FP-044 Phase 2 (PEAD orchestrator)

| Field | Value |
|---|---|
| `ts` | 2026-06-09T20:21:29Z |
| `category` | 1 (Executor-supervisor blind spot) |
| `pr_ref` | FP-044 Phase 2 (commit landing `pead-orchestrator.ts`); empirical surfacing at execution `11a267bc-ee77-4d54-a0ac-1571749f98cb` (504 at 150s) |
| `ai_tool` | supervisor (fresh-clone verification missed the defect that executor shipped) |
| `description` | FP-044 Phase 2 fresh-clone verification validated compute purity, `SignalSkipReason` enum widening, the `zero_dispersion`/`pead_panel_below_floor`/`no_recent_earnings` typed-skip discipline (DEC-051 / DEC-052 / DEC-053), and gate output (2+4+11) — but did **not** verify vendor-cap × call-count × wall-budget arithmetic on the orchestrator shell. The build prompt itself already contained the contradictory signal "≈2.8 min sequential" (already 168s > the 150s HTTP wall) and prescribed "p-limited under the cap" without resolving the handler shape. Supervisor approved with the rate-math defect intact; detection path = operator test-fire 504 + post-mortem grep (one step late). Same class as the FP-043 pre-token-bucket review near-miss, second firing — promoting to a structural pattern. |
| `detection_path` | operator test-fire (post-merge empirical 504 + grep of `pead-orchestrator.ts` header rate-math comment); reconciliation engine could not catch this because vendor-rate ceilings are not encoded anywhere the engine reads. |
| `resolution` | (1) FP-045 (this resolution PR) implements DEC-047's generalized cursor-drain queue-worker, retiring the synchronous-orchestrator shell for both known rate-capped consumers (PEAD + options-flow). (2) **New supervisor pre-flight discipline:** every feed-signal execution prompt MUST carry an explicit pre-flight arithmetic row — `(universe_size × calls_per_name) / (vendor_rate_per_sec × 0.85)` vs the 150s HTTP wall and the ~400s Pro background wall — and supervisor verification MUST reject any prompt missing this row. Bound forward at supervisor-instructions §22.3 (codification target). (3) FP-044 orchestrator header rate-math comment corrected in the same PR as Phase 3 of FP-045. |
| `pattern_signal` | strong signal — second occurrence of vendor-cap × call-count × wall-budget arithmetic defect in two consecutive rate-bound signal FPs (FP-043 pre-production, FP-044 production). Promotes to a structural pre-flight pattern; quarterly review (§12.8) should consider a Catalog entry (#39) once the FP-045 codification target lands. |

#### 2026-06-09 — Executor shipped rate-comment asserting 600/min is "well under" Finnhub's 300/min cap (FP-044 Phase 2)

| Field | Value |
|---|---|
| `ts` | 2026-06-09T20:21:29Z |
| `category` | NEW (vendor-cap arithmetic defect in production code comment that the gates structurally cannot detect; closest canonical category is #1 by review-loop role but the failure mechanism is distinct — codified runtime-comment claim contradicts vendor entitlement) |
| `pr_ref` | FP-044 Phase 2 (`pead-orchestrator.ts` header — `pLimitedMap` concurrency=5 documented as "≤10 req/sec... well under the cap" against Finnhub Estimate-1's 300/min = 5 rps ceiling; the dual-fetch factor doubles the effective burst again) |
| `ai_tool` | executor (introduced the rate-comment defect in the orchestrator header; the comment provided the false reassurance that justified omitting `token-bucket.ts` reuse — the FP-043 sanctioned pacer was already in-repo and excluded with explicit rationale) |
| `description` | Concurrency-based throttling is latency-dependent and unbounded by design — `pLimitedMap` enforces in-flight count, not requests-per-second. Even at concurrency=5 the burst rate against a fast vendor is 5 concurrent / per-request-latency, easily 10+ rps under healthy network conditions; with dual-fetch per ticker the effective burst doubles. Lint, type-check, Deno unit tests, and the per-ticker compute tests all pass cleanly — none of these surfaces encodes vendor rate ceilings, so the gates structurally cannot catch the defect. The empirical 504 + zero-row + zero-log silent death (INC-72) is the only signal available at the existing gate surface. |
| `detection_path` | operator test-fire (504 + post-mortem DB read + analytics-query log scan); gates 2 / 4 / 11 all green at PR time. The defect is **invisible to every existing automated surface**, which is itself the structural finding. |
| `resolution` | (1) FP-045 Phase 3 corrects the orchestrator header rate-math comment in the same commit that retires the synchronous shell from cron. (2) FP-045 Phase 2 ships the generalized queue-worker engine that REUSES `token-bucket.ts` (productionClock-routed, the FP-043 sanctioned pattern) — the orchestrator-of-record for rate-bound work no longer relies on concurrency limits to enforce vendor caps. (3) Executor-side discipline: any code comment claiming a vendor-cap relationship must cite the cap source and show the arithmetic; absence of either becomes a banned-pattern candidate at the next quarterly review. (4) Forward-binding to remaining feed signals: any new signal whose vendor entitlement has a published rate cap MUST consume the queue-worker engine — single-invocation synchronous orchestration is structurally prohibited for the rate-bound class. |
| `pattern_signal` | strong signal — paired with the supervisor-side entry above as the two halves of the same INC-72 root cause; the executor-side half exposes a class of defect (codified runtime claim contradicting external constraint) that no existing CI surface can catch. Quarterly review should consider whether `pattern_signal` warrants extending the §11.x banned-patterns scanner with a "rate-claim grep" check (cap claims in code comments without arithmetic justification). |

#### 2026-06-09 — Tool-substitution: Gate-4 evidence produced by `deno lint` instead of CI ESLint (FP-045 Phase 2)

| Field | Value |
|---|---|
| `ts` | 2026-06-09T (post-Phase-2 commit `b4f4941`, surfaced at `5396165`) |
| `category` | tool-substitution (executor swapped Gate-4 tooling for a near-name twin that does not enforce the same rule set) |
| `pr_ref` | FP-045 Phase 2 (commit `b4f4941`) + Phase 3 (commit `5396165`) — both shipped with claimed-green Gate 4 |
| `ai_tool` | executor (ran `deno lint` and reported it as Gate 4); supervisor (accepted the substitution without command-line verification against `.github/workflows/strong-evidence.yml`) |
| `description` | Gate 4 in this repo is defined by the CI workflow as `npx eslint .`. The executor produced Gate-4 evidence by running `deno lint`, which does NOT enforce `@typescript-eslint/no-explicit-any`. The five new Deno test files (`queue-finalizer_test.ts` 11, `queue-init_test.ts` 6, `queue-slice-worker_test.ts` 10, `queue-sweeper_test.ts` 6, `pead-queue-adapter_test.ts` 14) carried 47 literal `any` types that `deno lint` accepted but CI rejected. `@ts-nocheck` masks TypeScript compilation but does NOT suppress ESLint rules — a separate misconception that compounded the substitution. Sibling test files in the same tree (e.g. `queue-config_test.ts`, `queue-audit-events_test.ts`) had already been written with typed mocks per the FP-041 convention and passed CI; the new files diverged from the established sibling pattern without surfacing the divergence. |
| `detection_path` | Operator CI observation post-merge (CI ESLint red at both `b4f4941` and `5396165`). Local Gate-4 substitution rendered the defect invisible to both executor and supervisor. |
| `resolution` | (1) Revision commit (this PR) replaces literal `any` with `unknown` / narrow stubs across all 5 files, removes the obsolete `no-explicit-any` from the `deno-lint-ignore-file` directive (now unused), re-runs `npx eslint .` verbatim, paste-verified 0 errors / 15 baseline warnings. (2) Forward-binding Gate-4 discipline (codified in `docs/04-modules/longshort/signals/queue-worker.md` and bound into FP-045 below): **Gate 4 = the CI workflow's `npx eslint .` command verbatim; `deno lint` is supplementary diagnostic only, never Gate 4. Gate evidence MUST state the exact command line above its output.** (3) FP-045 Phase 2 disposition annotated `closed-with-revision`; Phase 3 Status field updated per §22.3(e) to reflect the same revision lineage. |

#### 2026-06-10 — Prior invalidated by vendor pivot: ACT-159 Part A small-cap N≥2 prior carried across DEC-053 FMP→Finnhub flip without re-derivation (FP-045 Phase 3 validation)

| Field | Value |
|---|---|
| `ts` | 2026-06-10T00:10:00Z (FP-045 Phase 3 validation-run finalize) |
| `category` | NEW (prior-invalidated-by-vendor-pivot — a quantitative prior measured against vendor A is carried into a plan governed by vendor B after a vendor-lock flip, without re-derivation against vendor B's actual endpoint shape; the gate that catches it is empirical observation at validation, not any pre-merge CI surface) |
| `pr_ref` | FP-045 Phase 3 (commit `5396165`); validation run `signal_queue_runs.run_id=451b9ee7-9703-429d-97bc-61aeb2697bbc`, 2026-06-10 00:01-00:10 UTC. ACT-159 Addendum (this PR) is the corrective documentation. |
| `ai_tool` | supervisor (carried ACT-159 Part A's small-cap "60% N≥2" marginal into the FP-045 Phase 3 prediction row without re-deriving against the production vendor after DEC-053 flipped Signal #2's vendor lock from FMP to Finnhub); executor (did not surface the cross-vendor mismatch when registering the PEAD adapter, although the adapter itself is correct). |
| `description` | ACT-163 (chat-label) measured small-cap N≥2 qualification at ~60% against FMP `numAnalystsEps` on `/stable/analyst-estimates`. ACT-160 subsequently established at the FP-044 Phase-1 STOP that this FMP endpoint returns **forward-quarter rows only** (AAPL: 10 rows dated 2026-06-28 → 2028-09-28; same shape across MSFT/PLUG/RIG and the 10 LOOK-AHEAD names). The small-cap N≥2 measurement was therefore almost certainly taken against future-quarter rows, where small-cap analyst panels are systematically thinner than on the just-reported quarter. DEC-053 then flipped the Signal #2 vendor lock to Finnhub `/stock/eps-estimate?freq=quarterly` (which DOES carry reported-quarter rows with `numberAnalysts`). The Part A "60% N≥2 small-cap" prior was NOT re-derived against Finnhub before being carried into FP-045 Phase 3's prediction row. Live read-only Finnhub probe at validation (96 stratified names from the run's `signal_observations`): 96/96 names matched the just-reported quarter `2026-03-31`; `numberAnalysts` distribution min=3, median=17, max=38; observed `pead_panel_below_floor=0` on the full 839-name run. The prior was an FMP-`numAnalystsEps`-on-forward-rows artifact, not a Finnhub-`numberAnalysts`-on-reported-row property. |
| `detection_path` | Operator validation test-fire of FP-045 Phase 3 + INVESTIGATION-mode read-only post-run probe series. The mismatch surfaced as `pead_panel_below_floor=0` vs predicted ~40-52%; the alternative-hypothesis test (broken adapter / wrong row selection / fetcher misparse) was rejected by code-path trace (`pead-queue-adapter.ts:107-141` byte-identical to `pead-orchestrator.ts:221-263`; `compute-pead.ts:107-113` floor is first gate; `FinnhubEpsEstimateFetcher.normalizeRow` preserves `numberAnalysts` verbatim) + 96-name live-probe ground-truth (0/96 names below floor). No CI surface could have caught this — gates encode neither vendor-cap arithmetic nor cross-vendor prior provenance. |
| `resolution` | (1) ACT-159 Addendum (this PR) records the corrected production-vendor measurement and dates the Part A small-cap row correction; ACT-159 original preserved per Rule 8. (2) DEC-052 STANDS as a vendor-regression guard — the failure mode protected against is real (a future Finnhub panel-thinning regression would manufacture phantom σ_proxy without the floor), and the small-cap-attrition prediction being wrong does not weaken the guard's value, only the build-time expected-attrition number. (3) Forward-binding supervisor discipline: **any quantitative prior carried across a DEC-flipped vendor lock MUST be re-derived against the new vendor's actual endpoint shape before being cited in a downstream FP prediction row, with the re-derivation evidence linked in the citing FP entry.** The dual gates of (a) DEC-text reading + (b) endpoint-shape re-probe are required; reading DEC text alone (which preserves the original prior verbatim per Rule 8) is structurally insufficient. (4) Pattern_signal: first observed firing on this repo; if a second cross-vendor-prior-carryover surfaces in 2026, escalate to a Catalog entry with codified pre-merge check that greps FP entries for citations to chat-label-ACT priors and requires the re-derivation evidence link. |
| `pattern_signal` | Single firing on this repo to date. The structural finding is that DEC supersession + Rule 8 forward-pointer discipline preserves the original prior in the document trail (correctly) but does NOT trigger re-derivation against the superseding vendor — so quantitative priors silently rot across vendor flips. The validation test-fire (the empirical-observation gate) is the only surface that catches this class; absence of validation = no detection. Promotes to a Catalog entry on second firing. |

| `pattern_signal` | first occurrence of tool-substitution at the gate boundary on this repo; if a second instance surfaces (any gate, any tool), promote to a Catalog entry with codified pre-commit check that hashes the workflow gate command and compares to the executor's quoted command line. |

#### 2026-06-10 — SECOND OCCURRENCE: Vendor-cap arithmetic inconsistency between documented budget and code-level config (FP-045 Phase 4 options-flow registration)

| Field | Value |
|---|---|
| `ts` | 2026-06-10T (post-Phase-4 closure addendum; surfaced by operator REVISION-FIX-mode pacing reconciliation) |
| `category` | promoted — see Catalog #39 (this firing is the second occurrence that triggered Catalog promotion per the 2026-06-09 entry's escalation clause "Promotes to a structural pre-flight pattern; quarterly review (§12.8) should consider a Catalog entry (#39)") |
| `pr_ref` | FP-045 Phase 4 Closure Addendum (the closure-time PR); REVISION-FIX same-day commit (this entry) |
| `ai_tool` | executor (shipped `options-flow-queue-registration.ts:69 callsPerName=1` against a 2-call-per-ticker fetcher AND wired a second `pacedHttpFetch`-bound `TokenBucket` inside the adapter, while the file-header arithmetic comment cited `80 × 2 / 1.7 ≈ 94.1s`; the drift-sentinel test hand-entered `sliceSize * 2` so the test agreed with the doc-narrative against the runtime config); supervisor (Phase 4 closure approval read the arithmetic comment without grep-comparing it to the `callsPerName` constant on the next line, and did not flag the double-bucket pattern) |
| `description` | The Tradier per-ticker arm in `TradierOptionsChainFetcher.fetchChainForTicker` makes TWO wire calls (`/markets/options/expirations` + `/markets/options/chains`). The Phase 4 registration pinned `callsPerName=1` while the file-header arithmetic correctly cited the TRUE 2-call count (`80 × 2 / 1.7 ≈ 94.1s`). To compensate for the under-count, the registration constructed a SECOND `TokenBucket(ratePerSec=1.7)` and wrapped HTTP via `pacedHttpFetch` inside the adapter — but the slice-worker also constructs its own `TokenBucket(ratePerSec=cfg.ratePerSec)` per `defaultBucketFactory` and acquires `cfg.callsPerName` tokens before invoking the adapter. Two independent buckets at the same rate, serialized: per-ticker wall = worker-bucket(1/1.7=0.59s) + adapter-bucket(2/1.7=1.18s) ≈ 1.76s; 80-slice ≈ 141s (not 94.1s), dangerously close to the 150s HTTP wall. Same defect class as the 2026-06-09 PEAD-orchestrator firing: the gates structurally cannot catch vendor-cap × call-count × wall-budget arithmetic; the drift sentinel masked the defect by computing the arithmetic from a hand-entered `* 2` rather than deriving it from `callsPerName`. |
| `detection_path` | Operator REVISION-FIX-mode pacing reconciliation (read-only code trace through `options-flow-queue-registration.ts` → `token-bucket.ts` → `queue-slice-worker.ts`; arithmetic re-derivation against the fetcher's actual call count). No pre-merge CI surface could have caught this — Gate-2 wall-clock scanner ignores arithmetic; Gate-4 ESLint passes; Gate-11 Deno tests passed because the drift sentinel hand-entered the multiplier. |
| `resolution` | (1) Same-day REVISION-FIX commit: removed `TokenBucket` + `pacedHttpFetch` from the adapter side (adapter now receives raw `fetch`); flipped `callsPerName: 1 → 2` to match the fetcher's true wire-call count; pacing is now owned in EXACTLY ONE place (the slice-worker bucket). 94.1s budget claim is now truth-bearing. (2) Drift-sentinel restructured: declared `TRADIER_WIRE_CALLS_PER_TICKER = 2` constant in the registration test file with a header citing `TradierOptionsChainFetcher.fetchChainForTicker` as source-of-truth; assert `callsPerName === TRADIER_WIRE_CALLS_PER_TICKER`; derive `perSliceWire = (sliceSize × callsPerName) / ratePerSec`. (3) Catalog #39 added — codification target = the above structural test pattern + the single-bucket invariant in `docs/04-modules/longshort/signals/queue-worker.md` (adapters MUST pass raw `fetch`). (4) Forward-binding: every per-signal registration test MUST follow this pattern (declare the fetcher's wire-call count as a named constant with citation, assert config match, derive the budget — no hand-entered multipliers). (5) Pattern_signal: SECOND occurrence triggers the 2026-06-09 entry's escalation clause; Catalog #39 codified. Quarterly review should consider whether a Gate-2-style banned-pattern scanner can catch "second `pacedHttpFetch` inside an adapter when the engine bucket already paces" at PR time. |

#### 2026-06-10 — Validation choreography missing the deploy step (FP-045 Phase 4 stale-deployment 01:03 fire)

| Field | Value |
|---|---|
| `ts` | 2026-06-10T01:03:09Z (options-flow stale-deployment fire) → 01:09:00Z (504 IDLE_TIMEOUT on 6 worker chunks) |
| `category` | NEW (validation-choreography-missing-deploy-step — the validation playbook wired test crons and fired the init curl without first confirming the edge-runtime had picked up the new handler code; the pre-Phase-4 synchronous coordinator answered the fire, producing the exact failure mode the Phase-4 work was built to retire) |
| `pr_ref` | FP-045 Phase 4 closure (commits landed pre-fire); operator validation test-fire 2026-06-10 01:03 UTC |
| `ai_tool` | executor (assumed commit-landed = deploy-landed; did not gate the validation fire on a deploy-confirmation probe); supervisor (validation playbook did not include an explicit "edge function deploy confirmed at HEAD" step between commit and curl) |
| `description` | The FP-045 Phase 4 gutted handlers (`longshort-options-flow-compute`, `longshort-options-flow-compute-manual`, `longshort-pead-compute-manual`) + 410-Gone shim on `longshort-options-flow-worker` were committed but not deployed to the Supabase edge runtime at the time of the 01:03 operator fire. The fire reached the pre-Phase-4 synchronous `runOptionsFlowCoordinator` (boot at 01:03:09, six parallel worker shutdowns at 01:09:49 → 504 IDLE_TIMEOUT on six chunks). No `signal_queue_runs` insert, no cursor seed, no slice claim — the queue path was never exercised, and the failure mode reproduced was the exact 150s-wall mismatch the Phase-4 work was built to retire. Detection was honest (the investigation refused to report fabricated z-distributions / per-slice timings / skip taxonomies that the run never produced), but the lost cycle was avoidable. |
| `detection_path` | INVESTIGATION-mode read-only post-fire probe — `signal_queue_runs` had no options-flow row; `signal_compute_log` showed only the pre-Phase-4 synchronous handler error; edge-function boot logs showed `longshort-options-flow-compute` + `longshort-options-flow-worker` (the deprecated path) running, NOT the gutted shims or the queue handlers. The mismatch between repo-HEAD code and deployed-runtime code surfaced as the root cause. |
| `resolution` | (1) Same-cycle: operator authorized deploy of all eight functions (the four gutted handlers + the four queue handlers `longshort-queue-init`, `longshort-queue-init-manual`, `longshort-queue-slice`, `longshort-queue-sweeper`) to HEAD via `supabase--deploy_edge_functions`, then re-probed each with POST + invalid auth to verify shim shape (worker → 410 `options_flow_worker_deprecated`; computes → 401 sub-second, not coordinator boot). Operator re-fired the options-flow init; run `0eba38a7-0c84-49fb-9948-86a09e188901` completed CLEAN (53/839, 11 slices, CAS-clean) → Phase 4 validated. (2) Forward-binding playbook addition: **every future validation choreography that fires a handler whose code shape changed in the same PR MUST include an explicit deploy-confirmation step between commit and fire.** Acceptable proofs: (a) an `supabase--deploy_edge_functions` invocation returning success for every handler whose code shape changed, OR (b) a probe POST to each touched handler with invalid auth that returns the new shim's response shape (e.g. 410-Gone body for deprecation; sub-second 401 for enqueue shims that do not boot the old coordinator). The probe-response shape MUST be cited in the validation evidence — "deployed" without a shape-proof probe is insufficient. |
| `pattern_signal` | First firing on this repo. The structural finding is that the validation playbook treats commit-landed and deploy-landed as fungible — they are not. Supabase Edge Functions auto-deploy under most conditions but not all (chunked worker handlers, recently-changed handlers, and handlers that share imports with edited modules can lag); the validation gate must close the gap with a shape-proof probe. If a second firing of this class surfaces in 2026, promote to a Catalog entry with a codified pre-fire scanner that diffs `supabase--edge_function_logs` boot signature against the expected shim signature. |

#### 2026-06-10 — Green-on-red: sub-variant suite-scoped Gate 11 vs CI repo-wide compile (FP-047 Phase 2 → Phase 3)

| Field | Value |
|---|---|
| `ts` | 2026-06-10T (post-Phase-3 commit; surfaced by operator CI observation) |
| `category` | NEW (green-on-red, sub-variant: suite-scoped Gate 11 evidence vs CI repo-wide Gate 11 — the executor's local "Gate 11" was scoped to the feature suite (`deno test … analyst-revisions/`) while the CI workflow runs `deno test --allow-net --allow-env --allow-read` from `supabase/functions/` repo-wide. The feature suite passed; the repo-wide compile failed because Phase 2 had extended the shared `SignalSkipReason` union with three new variants (`no_revisions_in_window`, `revision_prior_unavailable`, `zero_magnitude_only`), and `persist-signal-compute-log_test.ts` had hardcoded expected-shape objects asserting the OLD union — those assertions broke compile/assertion at CI but never ran in the feature-suite scope.) |
| `pr_ref` | FP-047 Phase 2 commit `dd4ec295`; Phase 3 commit `fd12cbe7`; Phase-3 REVISION addendum (this entry) |
| `ai_tool` | executor (Phase 2 extended `SignalSkipReason` union + Phase 3 seeded the three new keys in `aggregateSkipCounts`, both correct — but local Gate-11 invocation was scoped to the feature suite and never re-ran the cross-module consumer's test (`_shared/persist-signal-compute-log_test.ts`), which asserted the OLD aggregator shape); supervisor (Phase 2 and Phase 3 evidence acceptances did not require the verbatim CI-scope Gate-11 command and accepted the suite-scoped pass) |
| `description` | Two parallel "Gate 11" command shapes existed: (a) the executor's feature-scoped form (`deno test … analyst-revisions/`) used in phase evidence, and (b) the CI workflow's repo-wide form (`.github/workflows/strong-evidence.yml` line 84: `working-directory: supabase/functions` → `deno test --allow-net --allow-env --allow-read`). Phase 2 extended the shared `SignalSkipReason` union; the consumer test file at `_shared/persist-signal-compute-log_test.ts` hardcoded the OLD all-zero union shape in three assertions. The feature suite never imports that test, so suite-scoped Gate 11 was GREEN. CI repo-wide Gate 11 was RED with three `AssertionError` failures (936 passed / 3 failed). The pattern is identical to the 2026-06-09 tool-substitution firing (executor quoted a different gate command than CI runs), but the sub-variant is suite-scope vs repo-scope rather than tool-substitution. |
| `detection_path` | Operator CI observation (again) — the executor reported "Gate 11 passed (52 tests)" / "Gate 11 passed (84 tests)" against the feature suite; CI ran the verbatim repo-wide command at the landed HEAD and surfaced 3 failed assertions on the cross-module consumer. Re-running the CI verbatim command locally in REVISION-FIX mode reproduced the failure (936 passed / 3 failed) and the fix path (extend the three hardcoded expected-shape objects with the new union keys). |
| `resolution` | (1) Test fixtures updated: the three hardcoded expected-shape objects in `supabase/functions/_shared/persist-signal-compute-log_test.ts` extended with `no_revisions_in_window: 0`, `revision_prior_unavailable: 0`, `zero_magnitude_only: 0`. Re-run of CI-verbatim Gate 11 = 939 passed / 0 failed. (2) **Forward-binding rule (record in the FP-047 entry):** any commit extending a shared type/union MUST run the CI-scope Gate 11 verbatim (`cd supabase/functions && deno test --allow-net --allow-env --allow-read`), not the feature-suite-scoped form. (3) **Prompt-drafting side requirement:** whenever a phase brief's file-scope includes `_shared/`, the prompt MUST explicitly require the CI-verbatim Gate 11 invocation in the gate-output evidence section (quote the exact `.github/workflows/strong-evidence.yml` command line, same discipline as the eslint command). (4) Same-class as 2026-06-09 firing → escalation ladder primed; second firing of suite-scope vs repo-scope mismatch in 2026 promotes to Catalog with codified pre-merge check that greps phase-evidence for "Gate 11" and rejects any invocation whose argv differs from the workflow's run line. |
| `pattern_signal` | Second firing of the broader "executor's Gate-11 command ≠ CI's Gate-11 command" class on this repo (first: 2026-06-09 tool-substitution). Distinct sub-variant (suite-scope vs repo-scope, not tool-substitution), but same structural defect: the gate command quoted in phase evidence is not the gate command CI runs. If a third firing of either sub-variant surfaces, promote to a Catalog entry with a codified pre-merge linter that hashes the CI workflow's `Gate 11` `run:` line and compares to the executor's quoted invocation. |
| `pattern_signal` | structural — second occurrence of the vendor-cap arithmetic defect class in 30 days (FP-044 Phase 2 PEAD orchestrator 2026-06-09; FP-045 Phase 4 options-flow registration 2026-06-10). Per the 2026-06-09 entry's escalation clause, promoted to Catalog #39. The fact that Gate 2/4/11 are structurally blind to this class (vendor caps are external constraints not encoded in any CI surface) makes the per-signal-registration test pattern the only viable pre-merge gate; Catalog #39 codifies it. |