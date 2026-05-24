# scripts/ — Strong-Evidence Workflow Tooling

CI-enforced helper scripts that supply the supervisor + operator evidence ladder
(E1/E2/E3) for the longshort reconciliation engine. Landed at FP-006 sub-step 6.4
(ACT-082); governed by ADR-003 (enforcement-as-scripts-not-prose) and DEC-034 v13.2.

## Inventory (5 modules)

| Script | Purpose | Source authority | Tests |
|---|---|---|---|
| `check-audit-writer-trap.ts` | DEC-034 clause (5) audit-writer trap enforcement (FOLLOWUP-004 closure). | DEC-034 v13.2 + ADR-003 | 8 |
| `firing-diff.ts` | "New firing patterns since deploy" reconciliation_events query helper. | CROSSWIND §11.0.10 + §11.0.13 + §12.5 | 3 |
| `replay-run.ts` | One-command replay execution scaffold (`--dry-run`); fixture parsing lands at 6.5. | CROSSWIND §11.10 + §11.0.13 | 2 |
| `telemetry-report.ts` | CLI Markdown report generator (firing rate / outcome distribution / unresolved system_bug / expected-divergence ratio). | CROSSWIND §11.0.10 + §11.0.13 | 3 |
| `broker-spot-check.ts` | E3 ground-truth spot-check helper (mock-mode; `--provider=alpaca` deferred to 6.7). | ADR-001 §8 + CROSSWIND §11.0.13 | 3 |

Total: 19 Deno tests across 5 companion `_test.ts` files.

## CI integration

Executed by `.github/workflows/strong-evidence.yml` on every PR + push to main. Quality gates:

1. `deno run --allow-read scripts/check-audit-writer-trap.ts` — must exit 0
2. `deno test --allow-read --allow-net --allow-env scripts/` — must pass
3. `deno test --allow-net supabase/functions/_shared/longshort-verifiers/longshort-verifiers_test.ts` — must pass
4. Vitest + ESLint (existing) — must pass

Target wall-clock: <15 minutes per CROSSWIND §11.0.13 (advisory at 6.4; hard timeout at sub-step 6.9).

## Banned-pattern self-discipline

Per ADR-003: scripts in this directory MUST NOT introduce the patterns they enforce.
Specifically:

- No `Date.now()`, `new Date()`, `value ?? 0`, or `catch { return 0 }` in helper code (anti-phantom defaults; CROSSWIND §11.6 + §11.0.5).
- No `logAuditEvent` import or call site in any script other than `check-audit-writer-trap.ts` itself (DEC-033 v4.1 + DEC-034 clause (5)).
- The trap script is exempt from its own scan via walk skip pattern (`/check-audit-writer-trap\.ts$/`).
- README.md and `*_test.ts` files are exempt from the post-commit banned-pattern grep (only `*.ts` modules excluding self-reference are scanned).

## Authoring contract

New scripts MUST:
1. Live as `scripts/<name>.ts` with a companion `scripts/<name>_test.ts`.
2. Ship a working implementation — not a JSDoc + throw-stub (DEC-034 v13.2 / FOLLOWUP-004 / D2 disposition).
3. Be invokable via `deno run` with explicit `--allow-*` flags pinned at the shebang.
4. Export pure functions for unit-test consumption; gate side-effects behind `import.meta.main`.
5. Register in `docs/07-reference/function-index.md` in the same PR.