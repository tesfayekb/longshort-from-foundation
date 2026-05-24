# ADR-005 — Deno-Native Replay Framework Runtime

**Status:** Accepted
**Date:** 2026-05-24
**Context:** FP-006 sub-step 6.5a (ACT-086) / Replay framework foundation
**Related:** ADR-001 (reconciliation architecture), ADR-003 (enforcement-as-tested-scripts), CROSSWIND §11.10

## Context

CROSSWIND §11.10.4 specifies the replay-test PASS implementation as:

> "Implementation: pytest-based with captured fixtures. The replay command is `pytest tests/replay/test_replay_pass.py --captured-day=<day_id>`"

The repo, however, is entirely Deno/TypeScript:

- Edge functions: Deno runtime
- Scripts (`scripts/*.ts`): Deno runtime
- 17 §11.0.7 reconciliation verifiers: Deno modules
- 90-test verifier suite: `deno test`
- CI workflow (`.github/workflows/strong-evidence.yml`): Deno + Vitest only

Introducing a Python runtime for replay alone would:

1. Violate single-runtime discipline (entire repo is Deno/TS)
2. Fork CI into two matrices (Deno + Python setup)
3. Require a serialization layer for the verifier suite to share fixtures with Python-side replay tests
4. Add a new dependency surface (pytest, Python lockfile, pinned versions) outside the established npm/Deno dependency discipline
5. Create a maintenance gap: every future verifier added in Deno would require parallel Python adapter for replay

## Decision

The replay framework is implemented in **Deno/TypeScript**. The §11.10 "pytest" reference is treated as **non-normative implementation guidance**; the normative requirements of §11.10 are language-agnostic:

- Deterministic re-execution of captured day data (§11.10.3)
- Fixture-driven PASS comparison against pre-change baseline (§11.10.4)
- <15-minute wall-clock budget per §10.4 evidence-workflow tooling (§11.10.4)
- AI-loop independent verification surface (§11.10.5)

All four normative requirements are satisfiable in Deno using:

- `deno test` runner for replay-test PASS commands
- Native zstd decompression via `https://deno.land/x/zstd` (or equivalent well-maintained Deno module)
- Existing verifier modules consume fixtures directly (no language-bridge serialization)

The replay command becomes (per ADR-005):

```bash
deno test --allow-read --allow-env scripts/replay-run_test.ts --replay-day=<day_id>
```

or (CLI form for one-shot runs):

```bash
deno run --allow-read --allow-env scripts/replay-run.ts --fixture=replay_storage/<day_id>.jsonl.zst
```

Sub-step 6.4 already shipped the entrypoint scaffold (`scripts/replay-run.ts`). Sub-step 6.5b extends it with the deterministic execution logic.

## Consequences

**Positive:**
- Single-runtime CI; no language-bridge maintenance
- Verifier suite shares types directly with replay engine (no serialization layer)
- Fixture types (`src/features/longshort/types/replay-fixture.ts`) consumed identically by replay engine, verifier tests, and 6.5c L2 synthetic capture generator
- No new dependency surface (zstd is the only added module; well-maintained)

**Negative:**
- Deviates from spec literal text ("pytest"); future spec readers need to know about this ADR
- Loses pytest's mature parametrization fixtures (acceptable; Deno test runner sufficient for fixture-driven testing)

**Trade-off:** strongly net-positive given repo's existing Deno commitment and ADR-001 architectural premise (single-runtime evidence surface).

## Forward applicability

ADR-005 governs replay framework implementation in this repo from sub-step 6.5a forward. Future spec revisions of §11.10 are reconciled against ADR-005 — if a future spec change introduces a Python-only requirement (e.g., a specific pytest plugin's behavior), that constitutes a new ADR-style decision point, not silent runtime migration.

The pattern this ADR establishes: **spec implementation-language clauses are non-normative when the repo's runtime can satisfy the spec's normative behavior requirements.** Future similar mismatches follow the same disposition path (ADR-NNN documenting the runtime decision; spec literal text annotated as non-normative).

## References

- CROSSWIND §11.10.4 (pytest reference + normative replay-test PASS requirements)
- ADR-001 (reconciliation architecture; single-runtime evidence discipline)
- ADR-003 (enforcement-as-tested-scripts; Deno scripts/ precedent)
- `scripts/replay-run.ts` (6.4 scaffold; extended by 6.5b)
- `src/features/longshort/types/replay-fixture.ts` + `replay-storage.ts` (6.5a contracts)