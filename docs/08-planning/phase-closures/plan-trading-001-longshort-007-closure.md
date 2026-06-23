# Phase Closure: PLAN-TRADING-001-LONGSHORT-007 — Long-Short Strategy Module Phase 3.0: Combiner Foundation + Bootstrap Ranker (FP-052 (3.0))

> **Plan ID:** PLAN-TRADING-001-LONGSHORT-007
> **Approval:** FP-052 (3.0) / DEC-054 (R-roadmap container, FP-046)
> **Dependencies (verified closed):** FP-008 closed 2026-05-26 (universe component / Phase 1, ACT-119); Phase 2 (signal stack) closed 2026-06-14 (9/9 signals attested on natural cron cadence with persisted `signal_compute_log` rows, ACT-229).
> **Closure Date:** 2026-06-23
> **Action IDs:** ACT-230 (FP-052 (3.0) authoring) → ACT-233 (3.0a schema, MIG-099) → ACT-235 + ACT-236 + ACT-237 (3.0b pure / orchestrator / paginated-read corrective) → ACT-238 + ACT-239 (3.0c-i pure ranker / 3.0c-ii orchestrator + manual fn, commit `c0b81019`) → ACT-241 + ACT-242 + ACT-243 + ACT-244 + ACT-245 + ACT-246 + ACT-247 (3.M-i..v shadow harness + cron + hygiene; MIG-100; jobid 97/98 live) → ACT-260 (PLAN-007 Status reconciliation against repo HEAD `80dd8b2e` + live DB 2026-06-21) → ACT-261 (3.0d cron build + MIG-106) → **ACT-281 (this closure attestation)**.
> **Migrations:** MIG-099 (5-table combiner schema `combiner_feature_vectors` / `combiner_rankings` / `combiner_book` / `combiner_model_registry` / `combiner_shap_attribution`, RLS-first + GRANTs, atomic create+apply per §22.5.1); MIG-100 (3.M shadow-measurement schema — `combiner_book_shadow` / `combiner_forward_returns` / `combiner_shadow_variant_config`); MIG-106 (`job_registry` seeds for the two combiner cron handlers — both DISARMED at seed; arm-flip 2026-06-21 10:19:46 UTC, ground-truth-verified live 2026-06-23 in STEP A below).
> **Status:** Implemented — combiner foundation operational on CROSSWIND §6.4 documented degraded path (count-normalized fallback ranker producing a sized 40-name book per as_of). Module status transitions `combiner-foundation-in-progress` → `combiner-foundation-validated`. NO trained model is live; the exit-gate enforces this (queries return 0/0 against live DB, verified 2026-06-23).

---

## Summary

FP-052 (3.0) implements the CROSSWIND §6 combiner foundation — the layer that turns the 9 live `signal_observations` into per-(operator, as_of, ticker) feature vectors, ranks them with the §6.4 count-normalized fallback ranker, and seeds a 20-long / 20-short book per as_of. This is the first business-logic phase after the Phase-2 signal stack and the foundation that 3.1 (DW-100 backfill), 3.2 (DW-101 regime features), and 3.3 (FP-052.3 LambdaRank promotion) build on.

The 3.0 surface lands the **documented degraded path** verbatim: no trained model is registered, every ranking row stamps `ranker_source='count_normalized_fallback'`, and the partial-index predicate `WHERE ranker_source <> 'count_normalized_fallback'` is empty by construction. The exit-gate is the queryable assertion that both invariants hold on the live DB; it is the clean before-state that 3.3 LambdaRank promotion will flip to non-zero — giving a byte-attributable before/after diff against the attestation surface in §"Exit-Gate Attestation" below.

Per the anti-completion-theater binding established across the FP-008 closure precedent and re-anchored at ACT-279 / ACT-280: this closure document content is sourced strictly from cited closure-stack evidence (the ACTs / MIGs / live-DB reads of 2026-06-23 enumerated above and below, CROSSWIND §6 / §6.4 / §6.5 / §4.3.5, master-plan PLAN-TRADING-001-LONGSHORT-007 section, ADR-008a). No invented narrative; every asserted state cites a verified ACT, MIG, or live read.

---

## Gate-3.0 — Verbatim Definition vs Evidence

**Verbatim Gate-3.0 definition** (from `docs/08-planning/master-plan.md` PLAN-TRADING-001-LONGSHORT-007 § Phase Gates):

> Gate 3.0 — Schema landed + RLS-first + GRANTs + feature-assembler + fallback ranker + book builder + exit-gate assertion both queries return zero rows on live DB

Every clause is evidenced live in the table below. The live-DB reads were performed read-only on 2026-06-23 ahead of this closure; the verbatim results are reproduced under §"Exit-Gate Attestation" + §"Populated-Book Evidence" + §"3.0d Arm-State (Live)" below.

| Gate-3.0 clause | Closing ACT / MIG | Live evidence verified 2026-06-23 |
|---|---|---|
| Schema landed (5 `combiner_*` tables) | ACT-233 / MIG-099 | All 5 tables present; 3.M extension via MIG-100 / ACT-241; combiner-rank cron handlers seeded via MIG-106 / ACT-261. |
| RLS-first + GRANTs (atomic create+apply per §22.5.1) | ACT-233 / MIG-099; MIG-100 / ACT-241 | `combiner_feature_vectors` / `combiner_rankings` / `combiner_book` / `combiner_model_registry` / `combiner_shap_attribution` carry 4 policies each per Supabase table inventory (read gated on `has_permission(auth.uid(),'longshort.view')`; deny-writes on `authenticated` for I/U/D); RLS-on confirmed at §22.5.1 seed-verify at each MIG. |
| Feature-assembler + §4.3.5 critical-exclusion gate | ACT-235 (pure) + ACT-236 (orchestrator + manual fn) + ACT-237 (paginated-read corrective) | Live-DB `combiner_feature_vectors` for as_of_date `2026-06-22` returned **839 rows** (STEP B1 below) — feature assembler produced typed-absence `features` jsonb per ADR-008a for the full universe slice on the latest cron-attributable fire. |
| Fallback ranker (§6.4 count-normalized degraded path) | ACT-238 (pure) + ACT-239 (orchestrator + manual fn, commit `c0b81019`) | Live-DB `combiner_rankings` for as_of_date `2026-06-22` returned **359 rows** (STEP B1 below); 100% of historical rankings carry `ranker_source='count_normalized_fallback'` (STEP C: non-fallback count = 0). |
| Book builder (20 long / 20 short; UNIQUE rank invariant) | ACT-238 (pure `seedBook` + `BookOverlapError`) + ACT-239 (orchestrator chunked UPSERT) | Live-DB `combiner_book` for as_of_date `2026-06-22` returned **40 rows** (STEP B1 below) — matches `BOOK_SEED_SIZE = 20` × {long, short} = 40 per `supabase/functions/_shared/longshort-combiner/ranker-constants.ts`. |
| Daily-post-signal cadence (3.0d cron arming) | ACT-261 (build + MIG-106 seeds, DISARMED) → operator arm-flip 2026-06-21 10:19:46 UTC | STEP A live-DB read 2026-06-23: `cron.job` rows 102 (`longshort-combiner-assemble` schedule `35 23 * * 1-5`) + 103 (`longshort-combiner-rank` schedule `50 23 * * 1-5`) both `active=true`; `job_registry` rows `longshort.combiner_assemble.compute` + `longshort.combiner_rank.compute` both `enabled=true` (flipped 2026-06-21 10:19:46+00). |
| Cron-attributable fire evidence (the populated book is cron-produced, not manual) | ACT-261 cron-wiring (sql/21) + jobid 102/103 schedule | STEP B2 live-DB `cron.job_run_details`: jobid 102 succeeded `2026-06-22 23:35:00.215571+00`; jobid 103 succeeded `2026-06-22 23:50:00.201303+00`. Both 2026-06-22 fires on the scheduled slots; row counts of §"Populated-Book Evidence" are the resulting writes. |
| Exit-gate assertion both queries return zero rows on live DB | (this closure / ACT-281) | STEP C live-DB: `combiner_model_registry WHERE status='active'` = **0**; `combiner_rankings WHERE ranker_source <> 'count_normalized_fallback'` = **0**. Both zero — gate green on the documented §6.4 degraded path. |

---

## 3.0d Arm-State (Live, 2026-06-23)

**A1. `cron.job` rows (read-only):**

| jobid | jobname | schedule | active |
|---|---|---|---|
| 102 | `longshort-combiner-assemble` | `35 23 * * 1-5` | `true` |
| 103 | `longshort-combiner-rank` | `50 23 * * 1-5` | `true` |

**A2. `public.job_registry` (the schema has no `disarmed` column — `enabled` + `status` are the arm-state surface; reporting both for the four `%combiner%` rows verbatim):**

| id | enabled | status | updated_at |
|---|---|---|---|
| `longshort.combiner_assemble.compute` | `true` | `registered` | `2026-06-21 10:19:46.548263+00` |
| `longshort.combiner_forward_returns.compute` | `true` | `registered` | `2026-06-20 07:36:40.397628+00` |
| `longshort.combiner_rank.compute` | `true` | `registered` | `2026-06-21 10:19:46.548263+00` |
| `longshort.combiner_shadow_rank.compute` | `true` | `registered` | `2026-06-20 07:36:40.397628+00` |

The two 3.0d crons (`combiner_assemble.compute`, `combiner_rank.compute`) are armed; flip wall-clock 2026-06-21 10:19:46 UTC is the operator-applied transition from the MIG-106-seeded DISARMED state.

---

## Populated-Book Evidence (Live, 2026-06-22 as_of)

**B1. row counts for as_of_date `2026-06-22` (verbatim from live DB 2026-06-23):**

| Table | Row count |
|---|---|
| `combiner_feature_vectors` | **839** |
| `combiner_rankings` | **359** |
| `combiner_book` | **40** (20 long + 20 short, matches `BOOK_SEED_SIZE = 20`) |

**B2. cron-attributable fire evidence (`cron.job_run_details`, jobids 102/103, 2026-06-22):**

| jobid | status | start_time |
|---|---|---|
| 102 | `succeeded` | `2026-06-22 23:35:00.215571+00` |
| 103 | `succeeded` | `2026-06-22 23:50:00.201303+00` |

The 2026-06-22 book is cron-produced on the scheduled `35 23` / `50 23` slots — not manual-fn-produced; the rank fire occurred 15 minutes after assemble, satisfying the per-as_of assemble-completion gate inside `longshort-combiner-rank` (ACT-261 build).

---

## Exit-Gate Attestation

The Gate-3.0 exit-gate is a queryable assertion. The two queries are reproduced verbatim from master-plan PLAN-TRADING-001-LONGSHORT-007 § sub-step `exit-gate + Gate-3.0`:

```sql
SELECT COUNT(*) FROM public.combiner_model_registry WHERE status='active';
SELECT COUNT(*) FROM public.combiner_rankings WHERE ranker_source <> 'count_normalized_fallback';
```

**Live-DB result 2026-06-23 (read-only):**

| Query | Result |
|---|---|
| `combiner_model_registry WHERE status='active'` | **0** |
| `combiner_rankings WHERE ranker_source <> 'count_normalized_fallback'` | **0** |

**Interpretation.** Both zero. No model is registered as `active` in `combiner_model_registry` — the fallback ranker is the ONLY ranker live by construction. Every row in `combiner_rankings` stamps `ranker_source='count_normalized_fallback'` (the literal defined at `supabase/functions/_shared/longshort-combiner/ranker-constants.ts` and locked by the partial-index predicate in `supabase/migrations/20260616103102_*.sql`). This is the documented §6.4 degraded path the FP-052 (3.0) scope authorized — NOT a deficiency. The 0/0 attestation is the clean before-state; 3.3 LambdaRank atomic promotion (FP-052.3) is what flips both queries to non-zero, giving a clean byte-attributable before/after diff against this attestation surface.

---

## Sub-Step Closure Matrix

| Sub-step | Subject | Phase Gate | Closing ACT(s) / MIG / commit |
|---|---|---|---|
| 3.0 authoring | FP-052 (3.0) entry + governance row | (authoring) | ACT-230 |
| 3.0a | 5-table combiner schema (RLS-first + GRANTs, atomic create+apply §22.5.1) | Gate 3.0 (schema) | ACT-233 / **MIG-099** |
| 3.0b-i | Pure-logic feature-assembler + §4.3.5 critical-exclusion gate constants | Gate 3.0 (feature-assembler) | ACT-235 |
| 3.0b-ii | Assembly orchestrator + `longshort-combiner-assemble-manual` edge fn | Gate 3.0 (feature-assembler) | ACT-236 |
| 3.0b corrective | Paginated-read corrective for orchestrator | Gate 3.0 (feature-assembler) | ACT-237 |
| 3.0c-i | Pure fallback ranker + book seeder + `IncludedRowInvariantError` / `BookOverlapError` | Gate 3.0 (fallback ranker + book builder) | ACT-238 (commit `c0b81019`) |
| 3.0c-ii | Ranker orchestrator + `longshort-combiner-rank-manual` edge fn + §22.5.1 live smoke | Gate 3.0 (fallback ranker + book builder) | ACT-239 |
| 3.M-i | Shadow-measurement schema (`combiner_book_shadow` / `combiner_forward_returns` / `combiner_shadow_variant_config`) | (DW-109 resolution vehicle per DEC-059) | ACT-241 / **MIG-100** |
| 3.M-ii | Pure shadow ranker | (DW-109) | ACT-242 |
| 3.M-iii | Shadow orchestrator + manual edge fn | (DW-109) | ACT-243 |
| 3.M-iv | Forward-return accrual + anti-join corrective | (DW-109) | ACT-244 + ACT-245 |
| 3.M-v | Shadow + forward-return cron arming (jobid 97 `'30 23 * * 1-5'` active=true; jobid 98 `'0 3 * * 2-6'` active=true); hygiene | (DW-109) | ACT-246 + ACT-247 |
| (reconciliation) | PLAN-007 Status reconciliation vs repo HEAD `80dd8b2e` + live DB | (governance) | ACT-260 |
| 3.0d | Live combiner-rank cron arming (`longshort-combiner-assemble` `35 23 * * 1-5` + `longshort-combiner-rank` `50 23 * * 1-5`); MIG-106 seeds DISARMED → operator arm-flip 2026-06-21 10:19:46 UTC | Gate 3.0 (daily-post-signal cadence) | ACT-261 / **MIG-106** |
| **exit-gate + Gate-3.0 + closure** | Queryable exit-gate (0/0 live) + this closure attestation | **Gate 3.0** | **ACT-281 (this commit)** |

---

## Anti-Completion-Theater Sourcing Statement

Per the binding established at FP-008 closure (ACT-116/117/118/119) and re-anchored at ACT-279 / ACT-280: every state asserted by this document cites a verified ACT (action-tracker row), MIG (database-migration-ledger row), or live-DB read performed read-only 2026-06-23. No asserted state is inferred from chat memory or repo intent.

- **3.0d arm-state** — cited from STEP A live-DB read of `cron.job` (jobid 102 / 103) + `public.job_registry` (the `%combiner%` rows), 2026-06-23.
- **Populated-book counts (839 / 359 / 40)** — cited from STEP B1 live-DB read of `combiner_feature_vectors` / `combiner_rankings` / `combiner_book` filtered to `as_of_date='2026-06-22'`, 2026-06-23.
- **Cron-attributable fire** — cited from STEP B2 live-DB read of `cron.job_run_details` for jobids 102/103 starting `>= '2026-06-22'::date`, 2026-06-23.
- **Exit-gate 0/0** — cited from STEP C live-DB read of `combiner_model_registry WHERE status='active'` and `combiner_rankings WHERE ranker_source <> 'count_normalized_fallback'`, 2026-06-23.
- **ACT / MIG anchors** — cited from `docs/06-tracking/action-tracker.md` (ACT-230 / 233 / 235 / 236 / 237 / 238 / 239 / 241 / 242 / 243 / 244 / 245 / 246 / 247 / 260 / 261), `docs/07-reference/database-migration-ledger.md` (MIG-099 / MIG-100 / MIG-106), and `docs/08-planning/master-plan.md` PLAN-TRADING-001-LONGSHORT-007.
- **CROSSWIND anchors** — cited verbatim from `docs/04-modules/longshort/design-source/`: §6 (combiner architecture), §6.4 (count-normalized fallback ranker contract), §6.5 (feature-vector construction), §4.3.5 (critical-exclusion gate + coverage gate).
- **ADR-008a** — `docs/04-modules/longshort/design-source/ADR-008a-combiner-sentinel-introduction-layer-repositioned.md` (sentinel-introduction site relocated to 3.2 in-process model-input construction; no `Decimal('-999')` at the 3.0b feature-assembler layer).

No invented narrative. The document carries no claim about the trained model surface (3.3) or backfill provenance (3.1) or regime features (3.2) — those are PENDING and explicitly out-of-scope below.

---

## Scope Boundary — What This Closure Does NOT Close

Per master-plan PLAN-TRADING-001-LONGSHORT-007 sub-step inventory (verbatim 2026-06-23):

- **3.1** — Multi-year feature-vector backfill (DW-100; blocking dep = 3.0 closure + operator decision on `compute_log` backfill provenance per DW-100 question). **PENDING.**
- **3.2** — R4 market-index/SPY regime fetcher + jsonb feature columns (DW-101; FP-052.2 entry to be authored; first consumer = lambdarank feature vector at 3.3). **PENDING.**
- **3.3** — LambdaRank training + atomic promotion (FP-052.3; the surface that flips BOTH exit-gate queries to non-zero — first row with `status='active'` in `combiner_model_registry` + first ranking row with non-fallback `ranker_source` — giving a clean before/after diff against this 3.0 attestation). **PENDING.**

Gate-3.0 closes the **foundation only**. Gate-3.1 / Gate-3.2 / Gate-3.3 remain open and are tracked under their own sub-step rows in the master-plan. The Enhancement Phase Ladder (DEC-054 / FP-046) and `roi-roadmap.md` (ACT-280) are unaffected by this closure.

---

## Lock Statement

PLAN-TRADING-001-LONGSHORT-007 sub-phase 3.0 (FP-052 (3.0)) **CLOSES 2026-06-23** with:

- All Gate-3.0 clauses live-evidenced (table above).
- 3.0d cron armed (operator-applied 2026-06-21 10:19:46 UTC); cron-attributable fire confirmed for 2026-06-22.
- Populated book on 2026-06-22 as_of: 839 feature-vectors / 359 rankings / 40 book rows.
- Exit-gate 0/0 live-verified 2026-06-23.
- Module status transitions `combiner-foundation-in-progress` → `combiner-foundation-validated`.
- Plan-version v13.32 → v13.33 (deferred per ACT-230 clarifier; applied at this closure per Constitution Rule 10 additive merge).

3.1 / 3.2 / 3.3 remain PENDING per the Scope Boundary above. The PLAN-TRADING-001-LONGSHORT-007 plan section as a whole is NOT closed by this attestation; only its sub-phase 3.0 + Gate-3.0 close here.

---

## Related Documents

- FP-052 entry: `docs/08-planning/feature-proposals.md` § FP-052 (3.0).
- Master-plan section: `docs/08-planning/master-plan.md` § PLAN-TRADING-001-LONGSHORT-007.
- Reconciliation precedent: `docs/08-planning/plan-changelog.md` § "Post-v13.32 — 2026-06-21 — PLAN-007 Status Reconciliation (ACT-260)".
- Closure-doc structural precedent: `docs/08-planning/phase-closures/plan-trading-001-longshort-003-closure.md` (FP-008 / Phase-1).
- Ranker degraded-path literal: `supabase/functions/_shared/longshort-combiner/ranker-constants.ts` (`RANKER_SOURCE_FALLBACK = 'count_normalized_fallback'`; `BOOK_SEED_SIZE = 20`).
- Cron-arming SQL template: `sql/21_longshort_combiner_live_cron_schedule.sql` (operator-applied per MIG-031 precedent).
- ADR-008a: `docs/04-modules/longshort/design-source/ADR-008a-combiner-sentinel-introduction-layer-repositioned.md`.
- Module doc: `docs/04-modules/longshort/longshort.md` § "Combiner (FP-052 — Phase 3.0b)" + § "Combiner ranker + book seeder (FP-052 — Phase 3.0c)".
- Action tracker: `docs/06-tracking/action-tracker.md` § ACT-230 through ACT-281.
- Database migration ledger: `docs/07-reference/database-migration-ledger.md` § MIG-099 / MIG-100 / MIG-106.
- ROI roadmap (framing context, not gating): `docs/04-modules/longshort/roi-roadmap.md` (ACT-280).