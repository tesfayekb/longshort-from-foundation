# Phase Closure: PLAN-TRADING-001-LONGSHORT-002 — Long-Short Strategy Module Phase 0A Residual + Phase 0B (FP-006)

> **Plan ID:** PLAN-TRADING-001-LONGSHORT-002
> **Approval:** FP-006 / DEC-034 / DEC-034.1 / DEC-035 / DEC-036 / DEC-037
> **Closure Date:** 2026-05-25
> **Action IDs:** ACT-074 / ACT-075 / ACT-076 / ACT-077 / ACT-078 / ACT-079 / ACT-080 / ACT-081 / ACT-082 / ACT-084 / ACT-085 / ACT-086 / ACT-087 / ACT-088 / ACT-089 / ACT-090 / ACT-091 / ACT-092 / ACT-093 / ACT-094 / ACT-095 / ACT-097 / ACT-098 (this closure). ACT-096 was investigation-mode (Lovable independent Alpaca audit) with no commit per §7.4 dual-investigative-tracks protocol.
> **Migrations:** MIG-039 (`feature_flags`), MIG-040 (kill-switch infrastructure + `system.kill_switches.manage` permission + 4 RPCs + `kill_switch_state` enum), MIG-041 (`system_config.value_version` + bump function + trigger), MIG-042 (`longshort_reconciliation_state`), MIG-043 (`reconciliation_events` + 2 enums + 4 indices), MIG-044 (`job_registry` seeds for reconciliation_periodic_sweep + reconciliation_replay_chain), MIG-045 (activate reconciliation_periodic_sweep), MIG-046 (activate reconciliation_replay_chain), MIG-047 (A1 baseline aggregation views + RPC)
> **ADRs created:** ADR-002 (Alpaca paper multi-pending-order behavior validation — Accepted 2026-05-25), ADR-003 (enforcement-as-scripts-not-prose), ADR-004 (live-DB verification discipline + apply-verify separation), ADR-005 (Deno-native replay runtime), ADR-006 (Phase 0B captured-day deferral)
> **Status:** Implemented — Phase 0B exit boundary established; all 5 phase gates closed (Gate 6.0 / 6.3 / 6.4 / 6.7 / 6.9); 79-acceptance-criteria coverage matrices satisfied per sub-step evidence below; module status transitioned `foundation-implemented` → `phase-0b-validated`.

---

## Summary

FP-006 implements the §10.3 Phase 0A residual + entire §10.4 Phase 0B of the Crosswind v0.9 architecture. This is the reconciliation-precedes-business-logic foundation: the 17 `verify_*` reconciliation surfaces, two-phase order lifecycle scaffold (without execution), strong-evidence workflow tooling, replay framework with L2 synthetic Day 1, A1 baseline aggregation infrastructure for the §11.6 sustained-anomaly kill condition, Alpaca paper integration (6 fetchers against live paper API), and ADR-002 multi-pending validation determination.

Per §10.4 priority deliverables: replay framework (sub-step 6.5) + A1 baseline aggregation (6.6) + Alpaca paper integration (6.7) — **all three operational at closure.**

Per §10.4 supporting deliverable "Captured Day 1": **deferred to Phase 7** per ADR-006 with 4 DW entries (DW-058 fetcher wiring; DW-059 capture writer; DW-060 cron scheduling; DW-061 full-RTH-day execution + §11.0.11 firing analysis). The deferral is explicitly framed as honest acknowledgment that the operational machinery to produce firings is itself deferred; **Gate 6.9 closes via §10.4 captured-day deferral disposition, NOT via §11.0.11 firing-analysis quietness PASS** (per ADR-006 verbatim).

Per DEC-036 clause (2) zero-live-execution lock: NO `longshort.execute` permission, NO production code path imports any Alpaca fetcher, NO order submission reachable from any production code path. The 6 Alpaca fetchers are exclusively imported by operator-CLI scripts (connection-test; ADR-002 multi-pending harness) — confirmed by ACT-096 Lovable independent investigation.

ADR-002 empirical determination (sub-step 6.8): **v0 fallback per §8.6.2 adopted for v1**. Alpaca paper API rejects opposite-side parallel orders with HTTP 403 + code 40310000 ("potential wash trade detected") — §8.6.1.1 parallel-order pattern NOT operational on paper. Short-stop Phase 1 timeout handling uses operator-page + progressive escalation per polling tick (200bps → market); no parallel-order coordination, no over-close detection, no corrective-trade auto-submission in v1.

ACT-096 (Lovable independent Alpaca audit) + ACT-097 (supervisor reconciliation) produced an 11-finding remediation list expanded into DW-058 Required Tests for Closure (10 items B1-B11, item B10 split to DW-062 for ADR-002 Test 2 RTH re-run evidence gap). Finding #2 (halt fetcher queries `/v2/assets` listing endpoint, NOT real-time halt feed; intraday LULD halts will not surface) elevated to blocking Phase 7 fetcher-wiring prerequisite — real-time halt-feed external data source required before any live-order code path.

Universe construction, signal stack, combiner & modeling, portfolio construction, execution engine, paper trading validation, small-live operational validation, scaled deployment, sustained-anomaly kill mechanism activation, real Day 1 capture, multi-day batch replay, and trader-class roles are intentionally **out of scope** per the 17 out-of-scope items locked in FP-006 entry (Round 1.4) plus the 5 DW entries (DW-058..DW-062) created during Phase 0B execution.

---

## Acceptance Criteria — Evidence

All 79 acceptance criteria from FP-006 entry (`docs/08-planning/feature-proposals.md` § FP-006 coverage matrices: ACs × sub-steps, ACs × 17 verify_* per CROSSWIND §11.0.7 at 1:1 H2-risk binding, ACs × 5 DECs, ACs × Round 1.3/1.4 architectural locks) are evidenced via the per-sub-step closure SHAs below. Sub-step closure SHAs recorded per supervisor v0.5 §22.6 verification logs.

| Sub-step | Subject | Phase Gate | Evidence (ACT-NNN + closure SHA) |
|---|---|---|---|
| 6.0a | Prerequisite doc closures + DEC ratifications evidenced | Gate 6.0 | ACT-074 |
| 6.0b | Platform-tier reconciliation stub at `supabase/functions/_shared/strategy-reconciliation.ts` | Gate 6.0 | ACT-074 |
| 6.0c | Audit-writer trap rg-zero invariant verified per DEC-034 v13.1 corrected verifier | Gate 6.0 | ACT-074 |
| 6.1 | Phase 0A residual items + pg_cron precondition check + 3 v2 capability-gap corrections | Gate 6.3 | ACT-075 (incl. MIG-039 feature_flags; MIG-040 kill-switch infrastructure + 4 RPCs; MIG-041 system_config.value_version) |
| 6.2 | Reconciliation engine state-machine + event-log scaffolding | Gate 6.3 | ACT-076 (incl. MIG-042 longshort_reconciliation_state; MIG-043 reconciliation_events + enums; MIG-044 job_registry seeds) |
| 6.3a | verify_* batch A (#1–#5) — verify_position / verify_quote / verify_quote_freshness / verify_short_availability / verify_ssr_status | Gate 6.3 | ACT-077 |
| 6.3a.1 | Corrective: type variance + lazy supabase-admin + FINDING-001 interim register | Gate 6.3 | ACT-078 |
| 6.3b | verify_* batch B (#6–#10) — verify_halt_status / verify_order_acceptance / verify_borrow_persistence / verify_buying_power / verify_universe_membership | Gate 6.3 | ACT-079 |
| 6.3c | verify_* batch C (#11–#14) — verify_rebalance_aggregate / verify_dividend_event / verify_corporate_action / verify_locate_persistence | Gate 6.3 | ACT-080 |
| 6.3d | verify_* batch D (#15–#17) + Gate 6.3 closure — verify_realized_pnl / verify_lot_record / verify_wash_sale_record + periodic dispatch + MIG-045 job activation | Gate 6.3 | ACT-081 (incl. MIG-045 activate reconciliation_periodic_sweep) |
| 6.4 | Strong-evidence workflow tooling + Gate 6.4 closure | Gate 6.4 | ACT-082 |
| 6.4.1 | Corrective: DB-surfaces remediation (MIG-037..MIG-045 OOB apply + Lovable passive smoke 21/21 + Option A §22.5 AMBIGUITY closure for B.3 active 4-RPC cycle) | Gate 6.4 | ACT-084 + ACT-085 (ADR-004 introduced) |
| 6.5a | Replay framework foundation — capture stream types + storage scaffold + fixture format spec v1 + ADR-005 (Deno-native runtime decision) | Gate 6.7 | ACT-086 |
| 6.5b | Deterministic replay engine — zstd codec + fixture loader + per-stream lookup index + fixture-backed broker fetchers + determinism harness (12 tests) | Gate 6.7 | ACT-087 |
| 6.5c | L2 synthetic Day 1 fixture + first replay-test PASS run against verify_quote — byte-identical-two-runs determinism property verified per §11.10.4 | Gate 6.7 | ACT-088 |
| 6.5d | AI-loop verification surface (§11.10.5 meta-runner producing AILoopVerificationResult artifact) + MIG-046 reconciliation_replay_chain activation + Gate 6.5 closure | Gate 6.7 | ACT-089 (incl. MIG-046 activate reconciliation_replay_chain) |
| 6.6 | A1 baseline aggregation infrastructure — 3 SQL views (daily/weekly/monthly) + compare_reconciliation_baseline() RPC + TypeScript query helpers | Gate 6.7 | ACT-090 (incl. MIG-047 A1 baseline aggregation) |
| 6.7 | Alpaca paper integration — REST client + 6 fetcher implementations + connection-test CLI for Gate 6.7 PASS evidence + Gate 6.7 closure | Gate 6.7 | ACT-091 |
| 6.8 | ADR-002 multi-pending validation harness build + verbatim test-body implementations + empirical determination + ADR-002 Accepted with v0 fallback adoption | Gate 6.9 | ACT-092 + ACT-093 + ACT-094 (ADR-002 populated) |
| 6.9 | Phase 0B exit gate disposition via §10.4 captured-day deferral — ADR-006 authored; 4 DW entries (DW-058..DW-061) registered; explicit vacuous-quietness-signal acknowledgment; Gate 6.9 closure | Gate 6.9 | ACT-095 (ADR-006 introduced; DW-058..DW-061 registered) |
| (audit) | Operator-requested Alpaca integration audit — Lovable independent investigation (ACT-096 Phase 1) + supervisor cross-check + reconciled 11-finding remediation list folded into DW-058 + DW-059 + new DW-062 + ADR-002 evidence-completeness addendum | (governance) | ACT-097 (DW-058 + DW-059 amendments + DW-062 created + ADR-002 addendum) |
| 6.10 | Module status transition `foundation-implemented` → `phase-0b-validated` + this closure document + plan v13.5 bump | (closure) | ACT-098 (this closure) |

**79-AC coverage attestation:** the per-sub-step closures above evidence all 79 acceptance criteria per the FP-006 entry's 4 coverage matrices (ACs × sub-steps; ACs × CROSSWIND §11.0.7 17 verify_* at 1:1 H2-risk binding; ACs × 5 DECs; ACs × Round 1.3/1.4 architectural locks). No AC was silently dropped per Constitution Rule 8.

---

## Migrations

All migrations registered in `docs/07-reference/database-migration-ledger.md`:

- **MIG-039** — `feature_flags` table + RLS + seed (sub-step 6.1)
- **MIG-040** — Kill-switch infrastructure: `kill_switch_state` enum + `kill_switches` table + 4 RPCs (`kill_switch_soft_pause` / `kill_switch_hard_pause` / `kill_switch_manual_liquidate` / `kill_switch_resume`) with `is_superadmin(auth.uid())` gate + audit-logs writes + `system.kill_switches.manage` permission seed (sub-step 6.1)
- **MIG-041** — `system_config.value_version` column + `bump_system_config_value_version` function + `system_config_value_version_bump` trigger (sub-step 6.1)
- **MIG-042** — `longshort_reconciliation_state` table + RLS (sub-step 6.2)
- **MIG-043** — `reconciliation_outcome` enum + `reconciliation_tier` enum + `reconciliation_events` table + 4 indices + RLS (sub-step 6.2)
- **MIG-044** — `job_registry` seeds: `longshort.reconciliation_periodic_sweep` (enabled=false) + `longshort.reconciliation_replay_chain` (enabled=false) (sub-step 6.2)
- **MIG-045** — `UPDATE job_registry SET enabled=true WHERE id='longshort.reconciliation_periodic_sweep'` with DO-block dependency-check on MIG-044 (sub-step 6.3d, Gate 6.3 closure)
- **MIG-046** — `UPDATE job_registry SET enabled=true WHERE id='longshort.reconciliation_replay_chain'` (sub-step 6.5d, Gate 6.5 closure; first ADR-004 §22.5.2 split-execution exercise)
- **MIG-047** — A1 baseline aggregation infrastructure: 3 SQL views (`reconciliation_events_daily_agg` / `_weekly_agg` / `_monthly_agg`) + `compare_reconciliation_baseline` RPC SECURITY INVOKER (sub-step 6.6; second ADR-004 §22.5.2 split-execution exercise; partial-apply caught by pre-flight gate and recovered via DDL-only re-paste)

**Live-DB application discipline:** all migrations applied OOB by operator per ADR-004 §22.5.2 split-execution pattern; Lovable's role limited to repo writes + pre-flight verification via `supabase--read_query` against live DB (`information_schema` / `pg_catalog` introspection). Sub-step 6.4.1 closed FOLLOWUP-001 + FOLLOWUP-002 (initial 9-migration OOB apply via Dashboard SQL editor + manual `schema_migrations` ledger inserts) + Lovable passive smoke 21/21 + Option A §22.5 AMBIGUITY closure for the B.3 active 4-RPC cycle (deferred to FP-006 6.5.x then absorbed in Phase 7 live-trading work).

---

## ADRs Created

ADRs landed during FP-006 execution at `docs/04-modules/longshort/design-source/`:

- **ADR-002** — Alpaca Paper Multi-Pending-Order Behavior Validation (Accepted 2026-05-25; sub-step 6.8 / ACT-094 populated from placeholder + evidence completeness addendum appended at ACT-097 for Test 2 RTH re-run evidence gap)
- **ADR-003** — Enforcement-as-Scripts-Not-Prose (governance discipline for FP-006 verifiability)
- **ADR-004** — Live-DB Verification Discipline + Apply-Verify Separation (introduced at sub-step 6.4.1 / ACT-085; first formal codification of §22.5.1-4 protocol amendments observed during FP-006 execution; foundation for the split-execution pattern used at MIG-046 + MIG-047)
- **ADR-005** — Deno-Native Replay Runtime (sub-step 6.5a / ACT-086; locks Deno runtime for the replay framework given remote-URL imports incompatible with Vite TS build)
- **ADR-006** — Phase 0B Captured-Day Deferral to Phase 7 (sub-step 6.9 / ACT-095; formal deferral with explicit vacuous-quietness-signal acknowledgment; 4-prerequisite DW enumeration)

ADR-001 (Reconciliation Architecture) pre-existed FP-006 (landed during FP-006 entry authoring); remains canonical and unchanged.

---

## Reference Index Reconciliation

| Index | Entry |
|-------|-------|
| `permission-index.md` | `system.kill_switches.manage` (MIG-040; sub-step 6.1). NO `longshort.execute` per DEC-036 clause (2) + DEC-032 clause (3). |
| `database-migration-ledger.md` | MIG-039 through MIG-047 (9 entries; all sub-step-attributed in ledger) |
| `artifact-index.md` | No new artifacts beyond ART-018 (FP-005 baseline); per-sub-step deliverables registered via migration ledger + ADR design-source files + closure documents |
| `event-index.md` | No new audit event types beyond FP-005 baseline (`longshort.*` action vocabulary); per-sub-step audit writes use the existing helper + canonical action keys |
| `function-index.md` | No new shared helpers beyond FP-005 baseline (`writeStrategyAuditEvent`) + sub-step 6.0b platform-tier reconciliation stub at `supabase/functions/_shared/strategy-reconciliation.ts` |
| `route-index.md` | No new routes beyond FP-005 baseline (`/trading/longshort` gated by `longshort.view`) |

---

## Tests

**Verifier suite (Deno unit tests across 17 verify_* implementations):**

- `supabase/functions/_shared/longshort-verifiers/verify_position_test.ts`
- `supabase/functions/_shared/longshort-verifiers/verify_quote_test.ts`
- `supabase/functions/_shared/longshort-verifiers/verify_quote_freshness_test.ts`
- `supabase/functions/_shared/longshort-verifiers/verify_short_availability_test.ts`
- `supabase/functions/_shared/longshort-verifiers/verify_ssr_status_test.ts`
- `supabase/functions/_shared/longshort-verifiers/verify_halt_status_test.ts`
- `supabase/functions/_shared/longshort-verifiers/verify_order_acceptance_test.ts`
- `supabase/functions/_shared/longshort-verifiers/verify_borrow_persistence_test.ts`
- `supabase/functions/_shared/longshort-verifiers/verify_buying_power_test.ts`
- `supabase/functions/_shared/longshort-verifiers/verify_universe_membership_test.ts`
- `supabase/functions/_shared/longshort-verifiers/verify_rebalance_aggregate_test.ts`
- `supabase/functions/_shared/longshort-verifiers/verify_dividend_event_test.ts`
- `supabase/functions/_shared/longshort-verifiers/verify_corporate_action_test.ts`
- `supabase/functions/_shared/longshort-verifiers/verify_locate_persistence_test.ts`
- `supabase/functions/_shared/longshort-verifiers/verify_realized_pnl_test.ts`
- `supabase/functions/_shared/longshort-verifiers/verify_lot_record_test.ts`
- `supabase/functions/_shared/longshort-verifiers/verify_wash_sale_record_test.ts`

**Replay framework tests (sub-step 6.5):**

- `src/features/longshort/services/replay/zstd-codec_test.ts`
- `src/features/longshort/services/replay/fixture-loader_test.ts`
- `src/features/longshort/services/replay/event-index_test.ts`
- `src/features/longshort/services/replay/fixture-broker-fetchers_test.ts`
- `src/features/longshort/services/replay/replay-engine_test.ts`
- `src/features/longshort/services/replay/replay-pass-runner_test.ts`
- `src/features/longshort/services/replay/ai-loop-verifier_test.ts`

**Alpaca paper integration tests (sub-step 6.7):**

- `src/features/longshort/services/broker/alpaca/alpaca-paper-client_test.ts`
- `src/features/longshort/services/broker/alpaca/alpaca-fetchers_test.ts`
- `src/features/longshort/services/broker/alpaca/alpaca-integration_test.ts` (Deno.test.ignore'd; runs against live Alpaca paper account via operator CLI)
- `src/features/longshort/services/broker/alpaca/multi-pending-harness_test.ts`
- `src/features/longshort/services/broker/alpaca/multi-pending-harness_integration_test.ts` (Deno.test.ignore'd; runs against live Alpaca paper account via operator CLI)

**A1 baseline aggregation tests (sub-step 6.6):**

- `src/features/longshort/services/reconciliation/baseline-query-helpers_test.ts`

**Strong-evidence workflow tests (sub-step 6.4):**

- `.github/workflows/strong-evidence.yml` (CI/CD-bound; runs on every PR per ADR-003 enforcement-as-scripts-not-prose)
- `scripts/strong-evidence-*` (operator/CI-invocable; Deno-based per ADR-005)

**Live-broker evidence artifacts:**

- `scripts/alpaca-paper-connection-test.ts` (Gate 6.7 PASS evidence CLI)
- `scripts/alpaca-multi-pending-run.ts` (ADR-002 harness driver)
- `docs/04-modules/longshort/design-source/ADR-002-harness-output-2026-05-25.json` (ADR-002 dispositive evidence from 2026-05-25 02:46 UTC live-paper run)

**Phase 0B-deferred test work (Phase 7 ownership):**

- §11.0.11 firing-analysis Phase 0B exit gate quietness — DW-061 (full RTH day captured-day execution + firing analysis)
- Real Day 1 captured-day fixture — DW-058 + DW-059 + DW-060 (prerequisites) + DW-061 (execution)
- ADR-002 Test 2 RTH re-run evidence — DW-062 (Phase 7 short-side go-live blocker)
- DW-058 B1-B11 audit-findings remediation tests — Phase 7 fetcher-wiring closure

---

## Deferred / Follow-up

Two layers of deferred work tracked per `docs/08-planning/deferred-work-register.md`:

**Layer 1 — FP-006 entry out-of-scope (17 items locked Round 1.4, recorded in feature-proposals.md FP-006 entry):**

1. Longshort decision engine signal computation — DW-044 / FP-008+
2. Longshort order management / trade execution — DW-046 / Phase 5 FP
3. `longshort.execute` permission key — DW-047 / Phase 5 FP
4. Portfolio construction logic (schema lands here, logic later) — Phase 4 FP
5. Universe ingestion + management — Phase 1 FP
6. Signal stack — Phase 2 FP
7. Combiner & modeling — Phase 3 FP
8. Paper trading validation phase (dual exit gate + R3-R1 outcome) — Phase 7 FP
9. Small live operational validation — Phase 8 FP
10. Scaled deployment + sustained-anomaly kill mechanism (INFRASTRUCTURE built here at 6.6; KILL MECHANISM Phase 9) — Phase 9 FP
11. CI/CD pipeline for `longshort` — DW-052 / FP-007
12. Platform-tier extraction of reconciliation/verify/replay — DW-054 / FP-NNN when 2nd strategy lands
13. CROSSWIND §15 Risk Register reconciliation — DW-053 standalone post-v0.10 FP
14. Real Day 1 capture (replaces synthetic) — DW-056 / Phase 7 FP (subsumes DW-061 under broader Phase 7 captured-day work; see Layer 2)
15. Multi-day batch replay operations — DW-051 / Phase 7+ FP
16. Sustained-anomaly baseline VALUES (infrastructure here; values Phase 7) — Phase 7 FP
17. Trader-class roles — Phase 5+ FP

**Layer 2 — Phase 0B execution-discovered deferred items (5 entries created during FP-006 sub-steps; reference deferred-work-register.md for full schema-compliant entries):**

- **DW-058** — Fetcher wiring (src/broker/alpaca/ → supabase/functions/_shared/). Phase 7. Required Tests for Closure expanded at ACT-097 with 10-item audit-findings remediation list (B1-B11; B10 split to DW-062). Blocking Dependencies includes real-time halt-feed external data source as Phase-7-prerequisite procurement step.
- **DW-059** — Capture writer attached to reconciliation lifecycle. Phase 7. Required Tests for Closure expanded at ACT-097 with typed-null preservation requirements through capture writer for `BrokerQuote.last`, locate fields, halt fields, AlpacaSchemaError-failed responses.
- **DW-060** — Periodic-sweep scheduler (pg_cron / Supabase Cron Job). Phase 7. Blocked on DW-058 + DW-059.
- **DW-061** — Full-RTH-day captured-day execution + §11.0.11 firing analysis. Phase 7. Blocked on DW-058 + DW-059 + DW-060. This is the substantive empirical work the §10.4 "Captured Day 1" deliverable describes.
- **DW-062** — ADR-002 Test 2 (Fill Independence) RTH re-run evidence. Phase 7. Blocks any v1 short-side go-live. Created at ACT-097 per Lovable audit finding #10 (ADR-002 Accepted on partial evidence given Test 2 inconclusive due to market closure at 2026-05-25 02:46 UTC harness run).

All deferred items are formally registered in `docs/08-planning/deferred-work-register.md` per Constitution Rule 8 + the register's enforcement rules ("No phase may be formally closed with deferred items unless all deferred items have entries in this register"). FP-006 closure satisfies this rule: all 17 Layer-1 items pre-existed in the register; all 5 Layer-2 items registered before this closure ACT.

---

## Grandfathering Note

Per supervisor v0.5 §22.8.3, two items grandfathered:

1. **MIG-040 Multi-RPC active state-transition cycle** — sub-step 6.4.1 v2 Option A §22.5 AMBIGUITY closure accepted passive smoke 21/21 + inverse-positive evidence (Dashboard SQL editor `auth.uid()` NULL correctly returns `42501 requires superadmin`) as sufficient closure evidence. The active 4-RPC state-transition cycle (operator-authenticated session calling kill_switch_soft_pause → hard_pause → manual_liquidate → resume) was deferred to FP-006 sub-step 6.5.x and then to Phase 7 live-trading work. This deferral is preserved per §22.8.3 grandfathering rather than retroactively re-opening sub-step 6.4.1 closure.

2. **ACT-093 verbatim-vs-skeleton ambiguity** — sub-step 6.8 build phase (ACT-092) prompt left the implementation discipline ambiguous ("Lovable populates per descriptions"), which Lovable correctly interpreted as authorizing skeleton test bodies. Supervisor self-acknowledged defect class #12 (ambiguous-implementation-spec) and ACT-093 corrected via verbatim live-Alpaca test-body implementations. ACT-092 closure record preserves the original prompt language per §22.8.3 grandfathering; ACT-093 closure record is the canonical implementation evidence.

Both items have non-substantive impact on the FP-006 closure correctness: the substantive verification of MIG-040 RPC behavior is preserved as Phase 7 work in operator paper-trading; the substantive ADR-002 multi-pending validation evidence at ACT-094 is intact.

---

## Lock Statement

This plan section (PLAN-TRADING-001-LONGSHORT-002 / FP-006) is **closed**. Per Constitution Rule 8, none of the 79 acceptance criteria above may be silently dropped. Per DEC-032 clause (4) + DEC-036 clause (2), any expansion into Phase 1 universe construction, Phase 2 signal stack, Phase 3 combiner/modeling, Phase 4 portfolio construction logic, Phase 5 execution engine + `longshort.execute` permission + trader-class roles, Phase 7 paper trading + captured Day 1 + sustained-anomaly baseline values + real fetcher wiring (DW-058) + capture writer (DW-059) + cron scheduling (DW-060) + full-RTH-day firing analysis (DW-061) + ADR-002 Test 2 RTH re-run (DW-062), Phase 8 small-live validation, or Phase 9 scaled deployment + kill-mechanism activation, is a separate governance cycle (separate FP) and **must not** be merged into FP-006 retroactively.

Per Constitution Rule 11 (Critical Module Override — financial-critical modules ALWAYS HIGH), any future change to the 17 `verify_*` interface contracts in `supabase/functions/_shared/longshort-broker-interfaces.ts`, the reconciliation engine state machine, the replay framework v1 fixture format spec (per sub-step 6.5a), the A1 baseline aggregation views or `compare_reconciliation_baseline` RPC (MIG-047), the §8.6.2 v0 fallback short-stop architecture (per ADR-002), or ADR-001..006 Decision sections is HIGH impact and requires the full change-control workflow.

Per ADR-006 explicit acknowledgment: Gate 6.9 closed via §10.4 captured-day deferral (NOT via §11.0.11 firing-analysis quietness PASS). Any future reader inspecting `reconciliation_events` at this closure boundary and observing zero (or near-zero) rows SHOULD interpret this as "system not operational yet," NOT as "system operational and quiet." Phase 7 produces the substantive §11.0.11 quietness signal. This is the explicit vacuous-quietness-signal acknowledgment carried forward from ADR-006.

Per ADR-002 explicit determination: v0 fallback per §8.6.2 adopted for v1; §8.6.1.1 parallel-order mechanism NOT operational on Alpaca paper. Any future re-evaluation requires Phase 5 FP production-broker integration discovery, alternative broker selection, or operator paper-trading experience demonstrating v0 fallback insufficiency — each routes through normal FP approval, not FP-006 retroactive amendment.

Per ACT-097 audit reconciliation: 11-finding latent-risk remediation list in the 6.7 Alpaca integration locked into DW-058 + DW-059 + DW-062 Required Tests for Closure. Phase 7 fetcher-wiring CANNOT close until those audit findings are remediated + verified. Finding #2 (halt fetcher wrong endpoint) is blocking: real-time halt-feed data source is a Phase-7-prerequisite external procurement step.

---

## Related Documents

- Parent plan section: `docs/08-planning/master-plan.md` → PLAN-TRADING-001-LONGSHORT-002
- Predecessor closure: `docs/08-planning/phase-closures/plan-trading-001-longshort-001-closure.md` (FP-005)
- Feature proposal: `docs/08-planning/feature-proposals.md` → FP-006
- Decisions: `docs/08-planning/approved-decisions.md` → DEC-034 / DEC-034.1 / DEC-035 / DEC-036 / DEC-037
- ADRs: `docs/04-modules/longshort/design-source/ADR-001-reconciliation-architecture.md` through `ADR-006-phase-0b-captured-day-deferral.md`
- Module doc: `docs/04-modules/longshort/longshort.md`
- Replay framework spec: `docs/04-modules/longshort/replay-fixture-format.md`
- Migration ledger: `docs/07-reference/database-migration-ledger.md` (MIG-039 through MIG-047)
- Action tracker: `docs/06-tracking/action-tracker.md` (ACT-074 through ACT-098)
- Live-DB dependency inventory snapshot: `docs/06-tracking/live-db-dependency-inventory-2026-05-22.md`
- Sub-step 6.4.1 closure-note appendix: `docs/08-planning/phase-closures/fp-006-sub-step-6-4-1-smoke-evidence.md`
- Deferred work register: `docs/08-planning/deferred-work-register.md` (DW-058 / DW-059 / DW-060 / DW-061 / DW-062 — Phase 7 ownership)
- Constitution: `docs/00-governance/constitution.md` (Rules 8, 10, 11)
- System state: `docs/00-governance/system-state.md` (`longshort: phase-0b-validated` post-closure)

---

## Enforcement layer addendum (2026-05-25 — ACT-099 / sub-step 6.10.1 post-closure corrective)

This closure document attests at the original closure (ACT-098) that DEC-034 clause (2), DEC-034 clause (4), DEC-036 clause (2), and DEC-037 clause (8) banned-pattern CI enforcement was satisfied at sub-step 6.4. **An operator-requested pre-closure audit + Lovable independent investigation 2026-05-25 surfaced that only 1 of the 4 enforcement surfaces was actually delivered** (the audit-writer trap, via `scripts/check-audit-writer-trap.ts`). The other 3 surfaces remained prose-only.

**Post-closure corrective ACT-099 / sub-step 6.10.1 retires the gap.** Five enforcement scripts now live in CI per ADR-003 enforcement-as-scripts-not-prose:

1. `scripts/check-sentinel-patterns.ts` — DEC-034 (2) `?? 0` / `|| 0` / hardcoded sentinels
2. `scripts/check-wall-clock.ts` — DEC-034 (4) `Date.now()` / `new Date()` / `performance.now()` / `Temporal.Now.*`
3. `scripts/check-paper-only-url.ts` — DEC-036 (2) live Alpaca URL `://api.alpaca.markets`
4. `scripts/check-unguarded-parsefloat.ts` — ACT-097 finding #13 / DW-058 B1 bare parseFloat → NaN sentinel
5. `scripts/check-catch-returns-zero.ts` — DEC-034 (2) `catch { return 0 }` phantom-success swallow

Plus `docs/banned-patterns.md` as the DEC-034 (2) explicitly-referenced override registry with 5-row Active Overrides table (3 Phase-7-deferred + 2 Permanent per §22.8.4 Option-A reconciliation).

**Constitution Rule 8 5-point procedure satisfied at ACT-099:**

1. Prior approved section explicitly referenced by stable ID — PLAN-TRADING-001-LONGSHORT-002 / FP-006
2. Reason for change documented — DEC-034 (2) + (4); DEC-036 (2); DEC-037 (8) enforcement debt
3. Affected docs listed — 11 files modified at ACT-099-cont (10th test file + banned-patterns.md + CI workflow extension + 3 Alpaca annotation files + this addendum + governance entries); plus 9 enforcement script files from ACT-099 partial landing
4. Plan-changelog entry — v13.5 → v13.6 with `superseded-by` link
5. Updated section re-approved — operator standing institutional-grade authority + Lovable independent investigation reconciliation + §22.8.4 STOP-protocol reconciliation

**ACT-098 closure record preserved verbatim per §22.8.3 grandfathering.** Per §22.8.3: "the substantive [closure] is intact; only the [enforcement-layer attestation] is affected. This note preserves the audit trail." The ACT-099 corrective adds the enforcement layer the closure attested but did not deliver; the closure-document attestation language "Banned-pattern enforcement per CROSSWIND §11.8 + §11.9" is now retroactively satisfied by ACT-099 rather than ACT-082 alone.

**Two override classes registered in `docs/banned-patterns.md` Active Overrides table:**

- **Phase-7-deferred (3 rows)** — Bare parseFloat sites in alpaca-position-fetcher.ts (×2) + alpaca-buying-power-fetcher.ts (×2) + multi-pending-harness.ts (×1); annotated `// allow-bare-parsefloat: DW-058-B1`. Phase 7 fetcher-wiring closes both DW-058 B1 (the typed-throw refactor) and the override annotations simultaneously.
- **Permanent (2 rows)** — `new Date().toISOString()` in multi-pending-harness.ts lines 342 + 347; annotated `// allow-now-in-business-logic: ADR-002`. The wall-clock use is detection-latency measurement for the ADR-002 §8.6.1.1 empirical validation harness; the timestamp IS the value being measured, not a derived value. Lovable's §22.8.4 STOP discipline surfaced these sites; the original ACT-099 prompt scoped annotation-application section to parseFloat sites only and missed the harness's wall-clock sites that DEC-034 (4) scope covers. Reconciliation per §7.4 dual-investigative-tracks: ADR-002 is the chartering authority; the override is **permanent** because the wall-clock use is intrinsic to the harness's purpose.

**Module status remains `phase-0b-validated`.** This corrective adds CI infrastructure; no module behavior change.

**Cross-reference:** ACT-098 (FP-006 closure record-of-truth); ACT-099 (this corrective — single transaction across partial landing + continuation); ADR-003 enforcement-as-scripts-not-prose (the principle this corrective self-applies); ADR-002 (chartering authority for the Permanent wall-clock overrides); DW-058 B1 (the parseFloat-NaN-guard remediation Phase 7 owns).