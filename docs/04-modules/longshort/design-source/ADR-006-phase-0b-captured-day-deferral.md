# ADR-006: Phase 0B Captured-Day Deferral to Phase 7

**Status:** Accepted
**Date:** 2026-05-25
**Deciders:** Crosswind operator (sole decision authority for v1 per §11.0.12.5)
**Related:** ADR-001-reconciliation-architecture.md (foundation); ADR-002-alpaca-multi-pending-validation.md (ADR-002 immediately precedes this); ADR-004-live-db-verification-discipline.md (governance discipline framework this ADR operates under); CROSSWIND §10.4 (Phase 0B supporting deliverables); CROSSWIND §11.0.11 (Phase 0B exit gate); Constitution Rule 8 (approved-plan preservation — this ADR satisfies the documented-reason clause)

## Context

Per CROSSWIND §10.4 Phase 0B supporting deliverables (canonical wording):

> "**Captured Day 1:** one complete RTH day of all the above feeds stored in replay storage"

The "above feeds" enumerated in §10.4 priority deliverable #3 (replay framework capture scope) include 8 streams: broker_state, signal_quote, reconciliation_quote, broker_quote, halt_feed, locate_feed, corporate_actions, combiner_io.

Per CROSSWIND §11.0.11 Phase 0B exit gate (canonical wording, verbatim):

> "Every firing produced during Phase 0B captured-day analysis is root-caused to one of:
> (a) A documented false positive with tolerance band tuned and an ADR explaining the new tolerance with rationale (per §11.0.9);
> (b) A real-world divergence handled per the per-call failure-action table (per §11.0.8); or
> (c) A system bug that has been fixed before phase exit, with the fix itself going through evidence-tier discipline (per §12.5).
> Unresolved or unexplained firings block phase exit."

§11.0.11 explicitly addresses the "zero firings" anti-pattern:

> "Rationale for this gate (and why 'zero firings' is wrong): a literal zero-firings gate creates pressure to widen tolerances until the gate passes, which defeats the engine's purpose. The empirical question is not 'does the engine ever fire' — it should fire on Day 1; that's evidence it's working — but 'is every firing understood and either accepted as a real-world divergence or fixed as a defect.' Anything else means the engine is producing signals the team doesn't understand, which is structurally indistinguishable from no engine at all."

## Architectural reality at FP-006 closure boundary

At ACT-094 closure (HEAD `31e59883`, sub-step 6.8 closed), the reconciliation system is NOT continuously running in any operational sense. Specifically:

1. **Edge function uses MOCK fetchers.** `supabase/functions/longshort-reconciliation-tick/index.ts` from sub-step 6.3d (ACT-081) contains an inline comment: *"MOCK FETCHERS for 6.3d. Real broker integration lands at sub-step 6.7."* Sub-step 6.7 (ACT-091) landed real Alpaca fetcher implementations in `src/features/longshort/services/broker/alpaca/`, but those implementations live in the **frontend tree (Vite-excluded)**, not in `supabase/functions/_shared/`. The edge function still imports mocks; the real fetchers are not reachable from edge runtime without additional integration work.

2. **No scheduler invokes the edge function.** MIG-046 (sub-step 6.5d) flipped `public.job_registry.enabled=true` for `longshort.reconciliation_replay_chain`; MIG-045 (sub-step 6.3d) flipped the same for `longshort.reconciliation_periodic_sweep`. But `enabled=true` is a **gate** (the dispatcher refuses to run if false), not a **trigger**. No `pg_cron.schedule()` or Supabase Cron Job entry exists in the repo to actually invoke `longshort-reconciliation-tick` on a recurring basis.

3. **No capture writer exists.** Sub-step 6.5b (ACT-087) shipped a fixture *reader* (deterministic replay engine consuming `.jsonl.zst` files). No fixture *writer* attached to live reconciliation lifecycle. A captured Day 1 requires the writer side.

4. **No RTH run has happened.** Following from (1)+(2)+(3), no `reconciliation_events` rows have been produced by live operation. The table is empty (or contains only test residue from sub-step closures, not operational firings).

These 4 structural gaps are NOT bugs in FP-006 deliverables — they are the operational infrastructure layer that lives between Phase 0B foundation and Phase 7 paper-trading. FP-006 was scoped per DEC-032 / DEC-036 to land the foundation; the operational infrastructure to actually USE the foundation continuously is Phase 7 territory.

## Decision

**Defer the §10.4 "Captured Day 1" supporting deliverable to Phase 7 paper-trading FP** (specific FP number unassigned at this writing; will be assigned when Phase 7 planning opens).

**Adopt the following framing for Gate 6.9 closure:**

> Gate 6.9 closes via formal deferral of the supporting deliverable, not via §11.0.11 firing-analysis. The §11.0.11 exit gate as written assumes captured-day analysis has occurred. At FP-006 closure boundary, captured-day analysis has NOT occurred because the operational machinery to produce firings is itself deferred. **This is not evidence of system quality; it is evidence of system non-operation.** Gate 6.9 closes on these grounds, with the substantive §11.0.11 quietness signal explicitly assigned to Phase 7 entry.

The 4 structural prerequisites are tracked in `deferred-work-register.md` as **DW-058** (fetcher wiring from src/ broker/alpaca/ into supabase/functions/_shared/), **DW-059** (capture writer attached to reconciliation lifecycle), **DW-060** (Supabase Cron / pg_cron scheduling of periodic-sweep tick), and **DW-061** (full-RTH-day captured-day execution + §11.0.11 firing analysis). All four DW entries assigned to Phase 7 FP (number TBD) with explicit blocking dependencies.

## Why not Option A (decompose 6.9 into 6.9a/b/c)

Wiring real fetchers into edge functions + building a capture writer + scheduling continuous execution + running a full RTH day is Phase-7-grade operational infrastructure. Treating it as Phase-0B sub-steps would silently expand FP-006 scope past what was approved at FP-006 intake, violating Constitution Rule 8 (approved-sections-cannot-be-expanded-silently).

If captured-day work is to be done in Phase 0B at all, the correct mechanism is to draft a new FP (e.g., "FP-007: Phase 0B → Phase 7 transition infrastructure") and route it through normal FP approval — not bury it under "6.9a/b/c." This ADR records that pathway as **not chosen at this time**; the natural home for the work is Phase 7 itself, where it is consumer-coupled to actual paper-trading operations.

## Why not Option C (minimal-demo captured day)

Wiring just 1-2 verifiers (e.g., `verify_buying_power` + `verify_position`) against real Alpaca, scheduling at low frequency, capturing a partial-coverage day, and root-causing the resulting events would build roughly 80% of the Phase 7 operational machinery while producing capture that does not satisfy §10.4's "one complete RTH day of all the above feeds." Such a partial capture creates **phantom-completion risk**: a future supervisor reading `captured Day 1 delivered, FP-006 closed` could reasonably infer §10.4 was satisfied when it was not. Either §10.4 is fulfilled or it is deferred — partial-satisfaction-claimed-as-satisfaction is the failure mode that ADR-004 + §22.5 discipline exists to prevent.

## Explicit "vacuous quietness signal" acknowledgment

§11.0.11 specifically warns against `zero firings` as a quality signal:

> "a literal zero-firings gate creates pressure to widen tolerances until the gate passes, which defeats the engine's purpose."

At FP-006 closure, `reconciliation_events` is empty (or contains only test residue) for the orthogonal reason that the system has not run. Claiming Gate 6.9 PASS on this state without context would be **structurally indistinguishable** from the failure mode §11.0.11 warns against — except worse, because the false signal would not come from over-widened tolerances but from operational absence.

This ADR explicitly records:

- Gate 6.9 closure at sub-step 6.9 (ACT-095) is NOT a §11.0.11 firing-analysis PASS
- Gate 6.9 closure IS a formal deferral disposition; the §11.0.11 firing-analysis is moved to Phase 7
- The substantive quietness signal will be produced during Phase 7 paper trading, against real reconciliation events, with the operational machinery actually running

Any reader inspecting `reconciliation_events` at FP-006 closure boundary and observing zero (or near-zero) rows SHOULD interpret this as "system not operational yet," NOT as "system operational and quiet."

## Reconsideration triggers

This deferral may be reconsidered if any of the following occur:

1. **Phase 7 entry delayed beyond Q3 2026** (4+ months from FP-006 closure). If the captured-day deliverable would sit unmade for an extended period, the deferral rationale weakens; revisit at that point with options.

2. **Operator-initiated request** to draft an interim FP (between FP-006 and Phase 7) for partial captured-day infrastructure. Path remains available; ADR-006 does not preclude it. Such an FP would route through normal approval; not bypass the §10.4 deliverable as written.

3. **Discovery during Phase 7 planning** that the 4 structural prerequisites have larger scope than DW-058..DW-061 anticipate. In that case those DW entries are amended or decomposed during Phase 7 planning, before Phase 7 execution begins.

## Source attribution

- **Canonical requirement source:** CROSSWIND §10.4 (Part 3a) — Phase 0B supporting deliverable list
- **Canonical exit gate source:** CROSSWIND §11.0.11 (Part 4a) — Phase 0B exit gate firing-analysis requirement
- **Constitution Rule 8** (approved-plan preservation; documented-reason clause)
- **ADR-004** (live-DB verification discipline; this ADR operates under the no-spec-amendment governance pattern ADR-004 codifies)
- **Supervisor option evaluation** — chat record 2026-05-25 (Option A vs B vs C; Option B selected with reasoning)
- **Decision authority:** Operator sole decision authority per §11.0.12.5

## Cross-references

- ACT-095 — FP-006 sub-step 6.9 closure (this ADR introduced)
- DW-058 — Fetcher wiring (src/broker/alpaca/ → supabase/functions/_shared/)
- DW-059 — Capture writer attached to reconciliation lifecycle
- DW-060 — Cron scheduling for periodic-sweep tick
- DW-061 — Full-RTH-day captured-day execution + §11.0.11 firing analysis
- ACT-094 — ADR-002 closure (immediately preceding governance ACT)
- §22.5.1 / ADR-004 — Live-DB verification discipline (third clause; this ADR is governance-only, no live-DB touched)