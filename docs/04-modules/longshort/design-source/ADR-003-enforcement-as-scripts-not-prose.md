# ADR-003 — Enforcement Logic Lives in Tested Scripts, Not DEC Prose

**Status:** Accepted
**Date:** 2026-05-22
**Context:** FP-006 sub-step 6.4 / FOLLOWUP-004 closure
**Related:** DEC-034 v13.2, DEC-036, ADR-001, ADR-002

## Context

DEC-034 v13.1 attempted to encode pattern-matching enforcement (specifically the
audit-writer trap from clause (5)) as an inline regular expression embedded in
approved-decisions prose. Between v13.0 and v13.1 the regex pattern produced four
distinct defect classes:

1. **FINDING-001** — JSDoc continuation lines containing the literal substring
   `import logAuditEvent from _shared/audit.ts` (used as anti-pattern documentation
   in `supabase/functions/_shared/longshort-reconciliation-lifecycle.ts:23`) were
   false-positived as real imports.
2. False-negatives on multi-line `import { … }` blocks (the regex only matched
   single-line imports).
3. False-positives on string literals containing the symbol name.
4. Supervisor-side drift: every iteration of the regex was written, reasoned about,
   and shipped without ever being executed against the codebase it governed.

Root cause: the enforcement boundary was held in supervisor's head, not in tested
code. DEC prose is not executable; it cannot be unit-tested; it cannot be regression-
protected. The regex was therefore an untested artifact governing a financial-critical
invariant.

## Decision

Any enforcement clause in a DEC that requires pattern matching, AST traversal, file-
system walking, or similar mechanical verification MUST be implemented as a script
under `scripts/` with a companion `_test.ts` suite, referenced by the DEC rather than
embedded in it.

The DEC prose retains the **intent** ("clause (5): no longshort code may import or
call `logAuditEvent`"); the **implementation** lives in `scripts/<name>.ts`; the
**proof of correctness** lives in `scripts/<name>_test.ts`; CI enforces the gate via
`.github/workflows/strong-evidence.yml`.

## Consequences

- DEC-034 v13.2 amends clause (5) to reference `scripts/check-audit-writer-trap.ts`
  rather than carry the regex inline. This pattern is now precedent for any future
  DEC clause requiring mechanical enforcement.
- Supervisor-authored implementations ship verbatim with tests; Lovable does not fill
  regex bodies unsupervised. This was the architectural reasoning behind the D2
  disposition at the 6.4 pre-execution review.
- New scripts MUST follow the authoring contract documented in `scripts/README.md`.
- Banned-pattern grep in CI excludes `*.md` files and the trap script's self-reference
  to avoid the script-cannot-pass-its-own-trap paradox (the file that defines the
  regex literals necessarily mentions the banned symbol).
- This ADR aligns with DEC-036 (testability-of-governance) — same precedent applied
  to a different surface; ADR-002 already cites DEC-036 for the multi-pending
  validation contract.

## Status of FOLLOWUP-004

**CLOSED** at FP-006 sub-step 6.4 / ACT-082. Closure evidence:
- `scripts/check-audit-writer-trap.ts` shipped with `detectViolations` + `scanLongshortPaths`.
- `scripts/check-audit-writer-trap_test.ts` ships 8 unit tests including the
  FINDING-001 regression fixture as test (3).
- DEC-034 v13.2 amendment lands in `approved-decisions.md`.
- `.github/workflows/strong-evidence.yml` enforces the script in CI.
- FINDING-001 status updated in `docs/06-tracking/known-verifier-exceptions.md` from
  "open / interim register" to "closed / superseded by ADR-003 + tested script".