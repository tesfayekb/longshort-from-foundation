# ADR-004 — Live-DB Verification Discipline + Apply-Verify Separation

**Status:** Accepted
**Date:** 2026-05-24
**Context:** FP-006 sub-step 6.4.1 closure / ACT-085 supervisor protocol amendment
**Related:** ADR-001 (reconciliation architecture), ADR-003 (enforcement-as-tested-scripts), DEC-032 clause 7, INC-20, FOLLOWUP-001, FOLLOWUP-002
**Authority:** This ADR is the repo-durable record of supervisor protocol amendments codified as v0.4 → v0.5 changes to the CLAUDE.md / supervisor instructions chat-context document. The chat-context document is the authoritative behavioral specification; this ADR is the audit trail.

## Context

The FP-006 sub-step 6.4.1 corrective cycle surfaced that 8 prior sub-step closures (Gate 6.0 / 6.1 / 6.2 / 6.3a / 6.3a.1 / 6.3b / 6.3c / 6.3d / 6.4) all claimed CLEAN on the strength of repo-level code verification alone, while none of the 9 FP-005/FP-006 migrations (MIG-037 through MIG-045) had been applied to the live Supabase database. The defect was masked by FOLLOWUP-001 + FOLLOWUP-002 being tracked as passive deferrals; those followups were load-bearing all along.

Root cause from ACT-083b investigation: migration files were authored via direct file-write in prior turns instead of via the Supabase migration tool path. Files landed in repo; the apply step was never invoked; no failure signal because nothing was attempted.

Three secondary defect classes surfaced during the corrective cycle:

1. **Capability assumption (ACT-084 v1):** the v1 prompt assumed Lovable's Supabase migration tool could apply pre-existing migration files at original timestamps. The tool creates new files at new timestamps. The v1 contract was structurally incompatible. Lovable's §22.8.4 STOP correctly surfaced this.

2. **Executor-path violation during smoke debugging (ACT-084 v2):** during Option C debugging of the B.3 active 4-RPC smoke cycle, Lovable applied an operator-authorized superadmin grant via the Supabase migration tool path — the exact path Option 3 was designed to prevent. The grant itself was legitimate; only the delivery path was the violation.

3. **Visibility-gap-across-sessions:** the supervisor (Claude) operates in a separate chat session from the executor (Lovable); operator decisions made in the Lovable session do not appear in the supervisor session chat record. Supervisor mistakenly inferred absence of operator AGREE (Issue 3 in ACT-084 v2 review) from the supervisor-session-only chat record.

## Decision

§22.5 supervisor disposition framework is amended with four additive clauses, effective FP-006 sub-step 6.5 forward.

### Amendment 1 — Live-DB verification mandatory for DB-touching sub-step closures

No sub-step CLEAN disposition may be claimed for any sub-step that touches DB schema, permissions, RPCs, RLS policies, ENUMs, columns, triggers, functions, or `job_registry` rows, without one of the following evidence artifacts:

- Lovable-pasted `supabase--read_query` output confirming the live-DB state matches what the sub-step's migration(s) claim to create; OR
- Operator-pasted Dashboard SQL editor query output (in the supervisor chat session) confirming the same; OR
- Explicit operator acknowledgment that the sub-step does NOT touch live-DB state (pure code / docs / tests-only changes)

`FOLLOWUP-N` style deferrals tracking "apply later" are explicitly NOT a substitute.

### Amendment 2 — Apply-step vs verify-step separation when executor capability mismatches contract

When the executor's tool capabilities do not match the supervisor's verbatim-apply contract, the canonical resolution is **split-execution**:

- **Apply step:** operator-owned, out-of-band.
- **Verify step:** executor-owned, via read-only queries.
- **Pre-flight gate:** executor's first action confirms the operator's apply step landed cleanly. Pre-flight failure → STOP per §22.8.4.

The Option 3 split-execution that resolved ACT-084 v1's STOP is the canonical template.

### Amendment 3 — Executor migration-tool path banned for one-off DB operations during smoke/debugging

When the supervisor needs temporary DB state for capability-gap debugging or smoke verification, the supervisor MUST provide SQL for the operator to run via Dashboard SQL editor or out-of-band tooling. The supervisor MUST NOT direct the executor to apply such state via the Supabase migration tool path.

**Rationale:** the migration tool path is a "permanent ledger entry + auto-regenerated types.ts" path. One-off operational states do not belong in the migration ledger. INC-20 motivated this amendment.

### Amendment 4 — Visibility-gap-across-sessions default

When the supervisor would otherwise claim "no operator AGREE in chat record" for any operator decision, the default disposition is **"request operator confirmation rather than assert absence."** The supervisor chat record may not capture operator decisions made in the executor session.

## Consequences

**Positive:** live-DB blind spot prevented; capability mismatches surface at pre-flight; operational debugging stays out of migration ledger; visibility-gap inference errors prevented.

**Negative:** sub-step closure cycles for DB-touching sub-steps have one additional verification step; some sub-steps may surface capability-gap STOPs at pre-flight (additional iteration).

Net-positive given the cost the live-DB blind spot incurred (8 sub-step closures requiring corrective sub-step 6.4.1, with v1/v2/v3 iterations).

## Forward applicability

This ADR applies from FP-006 sub-step 6.5 forward. Prior FP-006 closures (6.0 through 6.4) remain valid pending the FP-006 closure gate (sub-step 6.10), which will verify cumulative live-DB consistency before declaring FP-006 closed.

## References

- ACT-083a v2, ACT-083b, ACT-084 v2/v3, ACT-085
- INC-20
- CLAUDE.md v0.5 (chat-context; authoritative behavioral specification)