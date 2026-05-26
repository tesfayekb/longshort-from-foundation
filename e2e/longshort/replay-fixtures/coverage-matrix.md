# Replay Fixture Coverage Matrix

**Status:** Partial scaffold (FP-008 sub-step 8.11 / ACT-117)
**Owner:** longshort
**Source authority:** CROSSWIND §11.10.4 + DEC-035 (replay framework determinism) + DEC-038.1 clause (6)

## Purpose

Single source of truth for which `verify_*` verifiers have replay-fixture coverage,
which fixtures drive them, and which scenarios each fixture exercises. Per §11.10.4
PASS evidence: every fixture row pairs a verifier chokepoint with a deterministic
fixture file (`replay_storage/<id>.jsonl.zst`) such that two replay-pass runs produce
byte-identical output.

## Status

This scaffold is **partial** at FP-008 sub-step 8.11 closure. Only the 4 rows below
are populated. Remaining verifier coverage (16 of 17 `verify_*` interfaces plus the
`universe_cross_check` non-`verify_*` reconciliation surface) is tracked at **DW-072**
for Phase 2+ build-out.

## Matrix

| Verifier | Source fixture | Scenario | Outcome class(es) exercised |
|---|---|---|---|
| `verify_quote` | `replay_storage/l2-synthetic-day-1.jsonl.zst` | Tick 1: within tolerance (signal vs recon vs broker quote drift) | `false_positive_within_tolerance` |
| `verify_quote` | `replay_storage/l2-synthetic-day-1.jsonl.zst` | Tick 3: 10bp + 15¢ drift exceeds dual threshold | `failure_handled` |
| `verify_universe_membership` | `replay_storage/l2-synthetic-universe-quarterly-refresh.jsonl.zst` | 8 happy-path/consistent-exclusion tickers (5 both-book + 3 long-only) | `false_positive_within_tolerance` |
| `verify_universe_membership` | `replay_storage/l2-synthetic-universe-quarterly-refresh.jsonl.zst` | 2 materially-excluded tickers (XYZM `in_ma`, HALT `halted_5d_plus`) | `failure_escalated` (structural per §11.0.9 line 273) |

## Coverage gaps (tracked at DW-072)

- `verify_position`, `verify_borrow_locate`, `verify_halt`, `verify_short_sale_restriction`,
  `verify_corporate_action_clean`, `verify_settlement_status`, `verify_dividend_event`,
  `verify_order_lifecycle`, `verify_account_balance`, `verify_mark_to_market`,
  `verify_pdt_status`, `verify_options_assignment`, `verify_wash_sale`,
  `verify_regulation_t_margin`, `verify_buying_power`, `verify_options_exercise`
- `universe_cross_check` (ReconcileCallSpec; non-`verify_*` literal per Surface 4 Option a
  at ACT-114 + DW-069 forward rename to `ReconcileCallName`)

## Cross-references

- Fixture format spec: [`docs/04-modules/longshort/replay-fixture-format.md`](../../../docs/04-modules/longshort/replay-fixture-format.md)
- AC-21 + AC-22 binding: [`docs/08-planning/master-plan.md`](../../../docs/08-planning/master-plan.md)
- DW-072 (this scaffold's deferred-completion entry): [`docs/08-planning/deferred-work-register.md`](../../../docs/08-planning/deferred-work-register.md)
- DW-073 (full quarterly orchestrator determinism deferral; Surface 4 Option a scope-limit): same register
- DW-074 (DEC-035 clause (8) vs ADR-005 Deno-runtime substrate drift): same register