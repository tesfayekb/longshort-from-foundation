# Known Verifier Exceptions

> **Owner:** Project Lead | **Status:** Interim Register | **Replaces:** verifier-pattern-in-DEC-prose discipline (per FINDING-001 4th-occurrence regex defect signal)
> **Remediation:** FOLLOWUP-004 — sub-step 6.4 (Strong-evidence workflow tooling) replaces embedded regex enforcement with tested CI scripts under `scripts/`. After 6.4 closure this file is superseded by per-script test fixtures and may be deprecated.

## Purpose

Documented exceptions to AC-level rg-zero verifier patterns embedded in DEC text. Exists because verbatim regex in governance prose has accumulated 4 defects across sub-steps (DEC-036 Alpaca regex / DEC-034 v1 substring / DEC-034 v13.1 import-shape / FINDING-001 import-shape with JSDoc verbatim). The architectural fix is to move enforcement to tested CI scripts (FOLLOWUP-004 / sub-step 6.4). Until that lands, exceptions are recorded here keyed by file:line + SHA + remediation pointer. Every future sub-step's AC-05 verification references this file rather than re-litigating.

## Discipline

- Each entry MUST cite the specific file:line, the exact content, the regex pattern that catches it, the reason the match is not a real violation, and a FOLLOWUP-NNN pointer to the remediation
- Entries are append-only — once added, an exception is not deleted; it is marked superseded when the underlying defect is fixed (typically when sub-step 6.4 CI scripts land)
- New entries require supervisor + operator review per the same discipline as DEC amendments

## Entries

### FINDING-001 — DEC-034 v13.1 audit-writer trap regex JSDoc false-positive

| Field | Value |
|---|---|
| **File** | `supabase/functions/_shared/longshort-reconciliation-lifecycle.ts` |
| **Line** | 23 |
| **First-observed SHA** | sub-step 6.2 closure `fa486a1` (regression-tracking: present at every SHA from `fa486a1` forward) |
| **Content** | `*   - import logAuditEvent from _shared/audit.ts (audit-writer trap — engine writes to` |
| **Type** | JSDoc continuation line documenting the anti-pattern (defense-in-depth) |
| **Caught by** | DEC-034 v13.1 verifier `rg -nE 'import\s.*\blogAuditEvent\b\|\blogAuditEvent\s*\('` — the `import\s.*\blogAuditEvent\b` alternative matches because the JSDoc text literally contains the word "import" followed by whitespace and then "logAuditEvent" as descriptive prose |
| **Why not a real violation** | The line is a comment (JSDoc continuation, prefix `*`), not a TypeScript import statement. The JSDoc exists specifically to warn future maintainers against the anti-pattern — removing it would lose defense-in-depth |
| **Disposition** | Documented exception. Until FOLLOWUP-004 / sub-step 6.4 lands the CI script with proper JSDoc/comment exclusion (and a test fixture using this exact line for regression lock), AC-05 verification for this specific file:line is treated as expected and does NOT count as a violation |
| **Remediation pointer** | FOLLOWUP-004 — sub-step 6.4: move regex enforcement to `scripts/check-audit-writer-trap.ts` (or equivalent path) with ≥6 unit tests including this exact line as a fixture; DEC-034 v13.2 amendment replaces embedded regex with reference to the script (one-line DEC change); ADR/governance note: "Enforcement logic that requires pattern matching MUST live in tested scripts, not DEC prose" |
| **Sub-step 6.4 acceptance criterion** | The new CI script returns zero violations on `supabase/functions/_shared/longshort-reconciliation-lifecycle.ts:23` while still catching real imports/calls of `logAuditEvent` from any longshort code path. Test fixtures include both this JSDoc line (expect: not a violation) and a synthesized real import (expect: violation) |
| **Status** | Active exception — pending FOLLOWUP-004 closure |

## Related governance

- DEC-034 (FP-006 Reconciliation Engine Invariants) clause (5) — current embedded regex
- DEC-034 v13.1 amendment (Gate 6.0 closure / approved-decisions.md) — current corrected regex
- ACT-074 (Gate 6.0 closure) — DEC-034 v13.1 amendment record
- ACT-076 (sub-step 6.2 closure) — first SHA at which the JSDoc line existed
- ACT-077 (sub-step 6.3a closure) — first SHA at which the JSDoc line was discovered to false-positive against v13.1
- ACT-078 (this sub-step) — exception register created; FOLLOWUP-004 logged
- FOLLOWUP-004 — sub-step 6.4 remediation: CI script + DEC-034 v13.2 amendment + governance ADR
## Status updates

### 2026-05-22 (Gate 6.3 closure / ACT-081)

FINDING-001 still active. Through Gate 6.3 closure the 17-verifier roster + edge function dispatch + MIG-045 job activation introduced NO new audit-writer trap regex false-positive cases — the JSDoc continuation pattern at `longshort-reconciliation-lifecycle.ts:23` remains the sole documented exception. FOLLOWUP-004 / sub-step 6.4 remains the canonical remediation owner.
