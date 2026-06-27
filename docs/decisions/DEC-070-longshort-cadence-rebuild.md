# DEC-070 — Longshort Cadence Rebuild (intraday-configurable; implements DEC-048; retires FP-052(a) once-daily interim)

- **ID:** DEC-070
- **Title:** Longshort cadence rebuild — ratifies the reconciled intraday architecture that IMPLEMENTS DEC-048's "cadence-is-a-tunable-config, optimal cadence measured at Phase 7, locked before Phase 8" principle. Retires the FP-052 disposition (a) once-daily INTERIM SHORTCUT that hardcoded daily and deferred configurability/measurement. Locks the schema keystone (additive `intraday_slot` superset PK rotation), the working-order-visibility model, the §11.0.7 ranking-freshness gate, the combiner recompute trigger envelope, the trainer-substrate dual-capture parallel-start, the per-signal lift order, and the DW-163 aggregate reframe. Fills the DEC-068 clause (r) "STREAM-3 cadence charter — the orthogonal rebuild" placeholder.
- **Plan Section:** longshort — cadence rebuild (downstream of DEC-048; supersedes the FP-052(a) interim; consumed by FP-057 — the cadence rebuild build).
- **Date Approved:** 2026-06-26
- **Decision Type:** Tier A — financial-critical cadence-architecture DEC governing the money-path rebuild. AUTHORIZES the schema migration that underlies every combiner table + the planner rewrite that gains working-order visibility + the signal-cadence lift.
- **Status:** active
- **Superseded By:** —
- **Supersedes:** FP-052 disposition (a) once-daily interim **shortcut** ONLY (NOT DEC-048; see Framing). The once-daily strategy KEEPS RUNNING on slot 0 throughout the rebuild per the backward-compat invariant in clause (a).

## Framing (load-bearing — do NOT misread as a DEC-048 supersession)

**DEC-070 IMPLEMENTS DEC-048; it does NOT supersede DEC-048.** DEC-048's title — "Signal-Compute & Rebalance Cadence Is a Tunable Configuration Parameter — Daily-EOD Is Interim, Not End-State" — is the AUTHORIZING provision for this DEC. The principle ratified at DEC-048 is verbatim:

> no layer hardcodes daily OR intraday cadence; frequency is a per-pipeline config parameter; optimal cadence MEASURED at Phase 7, LOCKED before Phase 8.

FP-052 disposition (a) ("per-tick §6.4 cadence DEFERRED to Phase 5 live-trading") was an INTERIM SHORTCUT that hardcoded daily and deferred the configurability + measurement DEC-048 mandated. The interim has now reached its expiry — DEC-068 clause (r) un-paused the once-daily strategy on a correct price feed but explicitly named the cadence rebuild as separate-anticipated future work ("the STREAM-3 cadence charter — the orthogonal rebuild"). DEC-070 fills that hole.

The retirement is performed under DEC-048's OWN "Daily-EOD Is Interim, Not End-State" title — the interim's own retirement clause. No supersession of DEC-048 is required and none is performed; DEC-048's title invariant is the AUTHORITY for this DEC.

## Context

The reconciled architecture below is the output of a DUAL-INDEPENDENT INVESTIGATION (per §2 reconciliation discipline):

- **Lovable independent investigation** (2026-06-26 prior turn) covered: (1) working-order visibility (3 options surveyed, planner-reads-working-orders identified as honoring the E3 SURFACE-1 invariant); (2) the 5 intraday signals' current state (feasibility + vendor constraints per signal); (3) combiner recompute trigger options (4 surveyed); (4) trainer substrate dual-capture tension.
- **Supervisor independent investigation** (same turn) covered the same four questions independently from the repo. The two investigations converged on substantially identical findings.
- **Reconciliation** then surfaced the schema keystone (clause (a)) as the architectural coupling point on which Investigations (3) and (4) both branch, and pinned the keystone via operator merits-decision.

The keystone is settled here (additive `intraday_slot` superset key, single-transaction-per-table rotation). Every other clause follows from it.

---

## Decision

### Clause (a) — KEYSTONE: schema key = additive `intraday_slot` superset rotation (the rest of the rebuild branches on this)

> **RATIFIED:** Every combiner-keyed table has its PK rotated from `(operator_id, …, as_of_date)` to `(operator_id, …, as_of_date, intraday_slot)` where `intraday_slot smallint NOT NULL DEFAULT 0`. This is a **SUPERSET KEY** — daily snapshots become slot 0; every existing row is `slot=0` post-migration; every existing reader (which never named `intraday_slot`) is unchanged; the daily strategy keeps running on slot 0 throughout the rebuild.
>
> **Tables in scope** (the combiner keyed surface, verified at HEAD `eb72b668`): `combiner_rankings`, `combiner_feature_vectors`, `combiner_book`, `combiner_book_shadow`, `combiner_forward_returns`. Each table's rotation is a separate migration entry in the ledger.
>
> **Migration discipline (binding):** For EACH table, the PK rotation + every dependent FK + every unique index + every dependent RLS policy ride in a **SINGLE TRANSACTION PER TABLE**. `DEFAULT 0` is populated BEFORE the PK swap so the table is never observed in a half-keyed state. RLS / GRANTs are re-verified post-rotation against the rotated key. No cross-table dependency is allowed to span migrations — each migration is atomic for its table; cross-table ordering is sequenced by the ledger.
>
> **Horizon semantics PRESERVED for slot 0.** The DEC-064 §6.1 / §6.2 algorithm-lock on T+H trading-day horizons is byte-identical for `intraday_slot=0` rows. Intraday horizons (slot > 0) inherit the same trading-day arithmetic — the slot is an additive partition within `as_of_date`, not a redefinition of the date axis.
>
> **Reversibility noted.** A future `as_of_run_id UUID` secondary unique key can be added on top of the additive intraday-slot PK if event-driven semantics later demand a per-run identity. Composite → UUID is a non-destructive widening; UUID → composite is destructive. The additive choice preserves both options; the UUID-first choice forecloses the composite path.
>
> **Considered and REJECTED:** `as_of_run_id UUID` as the primary key rotation. Rationale (Constitution Rule 8 — preserve the reasoning): (i) bigger-bang migration — every PK + every FK + every reader changes shape simultaneously; (ii) loses natural ordering on `(as_of_date, intraday_slot)` which the planner + the forward-return accruer both depend on; (iii) redefines T+H horizon semantics against a UUID with no intrinsic ordering, requiring a parallel `as_of_date` shadow column on every table to recover the algorithm-lock arithmetic; (iv) backward-compat is NOT free — existing readers all break on the first migration. The additive path costs strictly less than the UUID path on every dimension that mattered.

### Clause (b) — WORKING-ORDER VISIBILITY (resolves DW-164): planner reads working orders + positions

> **RATIFIED:** The rebalance planner gains a `working_orders: InFlightOrder[]` input alongside the existing `positions` input. The data source is the EXISTING `reconstructInFlight(ts)` / `listOpenInFlight()` path already consumed by the advance-tick at `tick-scheduler.ts:86`; the cadence rebuild WIRES IT THROUGH to `rebalance-submit-orchestrator.ts` (the current blind spot at lines 256–257).
>
> **Effective-current accounting.** For each ticker:
> `effective_current = position_mv + Σ signed_working_notional`
> `delta = target − effective_current`
> A working buy already at target → `delta == 0` → noop. No double-place under tick cadence; no cancel-storm.
>
> **Honors E3 SURFACE-1 invariant** ("the broker IS the authoritative in-flight state; no projection table"). The planner reads broker truth on every tick; no shadow projection is introduced.
>
> **Partial-fill sharp edge (build-time concern).** A working order partially filled has BOTH a filled segment (in `positions`) and a remaining segment (in `working_orders`). The effective-current arithmetic above MUST account for both segments without double-counting. Build-time test coverage required.
>
> **Considered and REJECTED:**
> - **Option (b) Cancel-prior then re-place** — simplest, but at the spec's 50–80 ranking computations/day and ~16 names per side the cancel/replace volume is ~1280 round-trips per session; rate-limit-hostile and ROI-bleeding via repeated marketable-limit re-pricing through the spread. Rejected on operational cost.
> - **Option (c) Pending-intent ledger** (internal table mirroring intended in-flight) — REGRESSES SURFACE-1; introduces a second source of truth that drifts from broker reality on every reject/partial-fill/expire; reconciliation cost compounds. Rejected on architecture.

### Clause (c) — RANKING-FRESHNESS GATE (§11.0.7 #1): wire the currently-unwired assertion

> **RATIFIED:** Wire the §11.0.7 #1 ranking-freshness assertion. The planner refuses to act on `combiner_rankings` rows whose `(as_of_date, intraday_slot)` is older than **N polling ticks** (spec initial value: 2 ticks × 5-minute fastest polling cadence = 10 minutes). On failure: refuse to submit; emit observability; the next polling tick re-evaluates.
>
> **Implementation pattern.** MIRRORS the existing `verify_quote_freshness` tolerance pattern at `order-submitter.ts` (already invoked as "the existing §11.0.7 check" in the codebase). Same shape: tolerance constant + verifier function + planner-side gate-call. Reuses the SAME verifier-composer surface FP-056 E5 already wires.
>
> **Required REGARDLESS of trigger model.** Both the tick-poll and the event-trigger combiner-recompute models (clause (d)) need this gate to refuse stale-ranking action. The gate is cadence-independent.

### Clause (d) — COMBINER RECOMPUTE TRIGGER: event-triggered OR tick-poll-dirty-bit (build-time sub-decision)

> **RATIFIED ENVELOPE (the choice between the two is a build-time sub-decision):**
> - **Option (c) Event-triggered** — signal-landing fires the combiner-recompute (the consumer of the new intraday signal slots from clause (f)).
> - **Option (d) Tick-poll + dirty-bit** — combiner runs on a fixed polling tick; a dirty-bit set by any signal-landing causes the recompute, otherwise a no-op pass.
>
> Both naturally throttle to the spec's "50–80 ranking computations per trading day" (CROSSWIND §4.4 L371) and both REUSE the full existing combiner pipeline against the new intraday-slot rows from clause (a). The keystone (a) is settled, so this is now a clean downstream choice that does not branch the schema.
>
> **Considered and REJECTED:**
> - **Option (a) Full-recompute polling without dirty-bit** — wastes compute on unchanged inputs; defensible but strictly dominated by (d).
> - **Option (b) Delta-on-changed-signals incremental build** — high complexity; introduces an incremental-vs-batch correctness reconciliation surface; rejected on engineering cost vs prize.
>
> The sub-decision (c vs d) lands at the FP-057 sub-step that wires the trigger; the keystone-settled architecture above is the binding part.

### Clause (e) — TRAINER SUBSTRATE DUAL-CAPTURE: plumbing-now, data-parity-later (the PARALLEL-STARTABLE step)

> **RATIFIED:** Start the shadow-rank + forward-return substrate's intraday-slot dual-capture as PLUMBING NOW — schema + writer-side rotation + trainer-query parity — AHEAD of data parity. Slot 0 keeps capturing the existing daily substrate (unchanged); slot > 0 begins capturing intraday snapshots the moment the first signal lifts to intraday cadence under clause (f).
>
> **Why parallel-startable.** The plumbing change is mechanical (writers + queries gain the slot column; daily writers fix slot=0). It can land BEFORE intraday signals exist. The alternative — serializing the substrate plumbing AFTER intraday signals land — costs weeks of trainer-substrate-accrual delay that the rebuild can avoid for zero risk.
>
> **Horizon semantics UNCHANGED for slot 0.** DEC-064 §6.1/6.2 algorithm-lock preserved verbatim. Intraday horizons inherit the same trading-day arithmetic per clause (a).

### Clause (f) — SIGNAL-CADENCE LIFT: 5 signals to intraday, by alpha-decay + cheapness order; vendor block named

> **RATIFIED:** The 5 intraday-DESIGNED signals lift to intraday cadence via the LIVE `signal_queue` slice/sweeper engine (FP-045 Phase 3+). The deprecated `longshort-options-flow-worker` (410 Gone since FP-045 Phase 4) is NOT a lift target — the live queue-worker engine IS the lift surface.
>
> **Lift order (alpha-decay + vendor-cheapness):**
> 1. **News (#8 — 5min)** — cheapest; already cursor-based pull; FP-048 queue-consumer landed.
> 2. **Catalyst (#9 — 5min)** — cheap pull-on-demand.
> 3. **Analyst revisions (#1 — 15min)** — high feasibility; FMP pull-on-demand.
> 4. **PEAD (#2 — event-gated + 15min)** — requires earnings-event-gating to avoid saturating Finnhub rate limits; FP-044 queue-consumer landed.
> 5. **Options flow (#3 — 5min)** — **VENDOR-BLOCKED**. Tradier wall-time ~11 minutes for full-universe sweep cannot deliver 5-min snapshots. Resolution-path is a NAMED downstream decision (DW-095-adjacent): either (i) procure Polygon Options Advanced, or (ii) adopt a subset-of-active-flow pattern. NOT blocking the first four signals.
>
> **Signals UNCHANGED by cadence.** Cross-sectional (#6) and reversal (#7) remain daily-by-construction (their statistical edge depends on overnight gaps and daily-bar features); insider (#4) and short-interest (#5) remain filing-cadence (driven by SEC and FINRA disclosure rhythms, not by the rebalance loop).

### Clause (g) — DW-163 AGGREGATE REFRAME: per-fire pinning → rolling-window invariant

> **RATIFIED:** The DW-163 dollar-neutrality aggregate assertion REFRAMES from a per-fire-pinned check (which assumed once-daily fires settling between checks) to a ROLLING-WINDOW invariant (per-fire pinning does not hold when fires are 5 minutes apart and may overlap working-order resolution). The exact window + tolerance is a build-time parameter co-designed with the cadence parameter from DEC-048 (config, not hardcode).
>
> **Cadence-driven, key-independent.** The reframe follows from cadence; it does not require the keystone to land first, but it is most naturally implemented after the working-order-visibility wiring (clause (b)) since the rolling aggregate must compute against effective-current state.

### Clause (h) — RATIFY-AND-CHARTER CLOSE OF FP-057 Sub-step 6 (governance-only; the honest close of the cadence rebuild)

> **RATIFIED (governance-only; NO code, NO migration, NO candidate fabrication, NO cadence-lock against zero PnL):** FP-057 Sub-step 6 ("Promote intraday-trained combiner + Phase-7 cadence MEASUREMENT + LOCK") CLOSES the cadence rebuild as a ratify-and-charter step. Both named fires are gated on substrate that has not accrued (an intraday-trained candidate does not yet exist — slot>0 substrate started capturing only after Sub-step 4 lifted the first signal and the trainer skip-gate floor `LABEL_MIN_ROWS_PER_SIDE(500) × LABEL_MIN_SEED_DATES(20)` against T+10 labels is unmet) and on the Phase-7 measurement window the DEC-048 title invariant defers to. This clause records the readiness verifications that close the rebuild plus the explicit deferral of the measure-and-lock fire to FP-058.
>
> **(h).1 PROMOTION PATH IS SLOT-AGNOSTIC BY DESIGN — READY, NO CODE GAP.** Verified at HEAD `921e382c`: `public.combiner_model_registry` carries NO `intraday_slot` column; the live-uniqueness invariant is the partial unique index `uq_combiner_model_registry_active_per_side ON (side) WHERE status = 'active'` — one active model per side, full-stop. `promote_combiner_model(p_model_id uuid)` (MIG-115) is keyed solely on `model_id` and the row's `side`; it does not branch on slot. The ranker-orchestrator loads the single active model for the side and applies it to the current slot's features. This is CORRECT, not a gap: a per-slot model fleet has no DEC authority, would multiply live-inference complexity, and would contradict DEC-066 §c (the 18-feature representation is locked, not parameterized by slot). The first intraday-trained candidate promotes through the existing path the moment the trainer produces one; no slot-aware promotion change is buildable or required.
>
> **(h).2 SUBSTRATE DUAL-CAPTURE IS TRAINER-READY.** Verified at HEAD `921e382c`: per MIG-122…MIG-126, `intraday_slot` is an additive `smallint NOT NULL DEFAULT 0` column on `combiner_rankings` / `combiner_feature_vectors` / `combiner_book` / `combiner_book_shadow` / `combiner_forward_returns`, with PKs rotated to include the slot and FKs/unique-indexes re-created accordingly. The trainer (`training/combiner/trainer.py`) groups and horizon-asserts on `seed_as_of_date` (DATE) — anchored on the calendar seed, NOT on slot — so slot>0 forward-return rows share the daily label by construction (distinct-by-slot PK rows, identical T+H realised return) and are ingested by the trainer query without a slot filter. Skip-gate floor `LABEL_MIN_ROWS_PER_SIDE=500` × `LABEL_MIN_SEED_DATES=20` × `TRAINING_HORIZON_TD=10` is unchanged; intraday rows simply add to the per-seed cardinality. No trainer code change is required for substrate ingestion. (The DW-168 sanity check at (h).4 covers group-cardinality + NDCG@25 observability at first-candidate train.)
>
> **(h).3 FIRST-CANDIDATE FIRE PATH (no new infrastructure).** The first intraday-trained candidate trains through the EXISTING weekly-Sunday GHA cron (`combiner-train.yml`, Phase 3.3a / ACT-283) the first Sunday after slot>0 T+10 labels clear the skip-gate floor. No cron change, no trainer change, no registry change. Promotion fires through the existing `promote_combiner_model(model_id)` path under the per-side active-uniqueness invariant. Operational continuity: the daily slot=0 strategy continues training and promoting through the same path throughout, unaffected.
>
> **(h).4 DW-168 IS A NAMED PROMOTION-TRUST PRECONDITION (observability sanity, not a code gap).** When the first intraday candidate trains, DW-168 sanity-checks (i) lambdarank group-size cardinality (the per-`seed_as_of_date` group now spans `rows-per-day × #slots` with redundant labels — group sizes will inflate; the lambdarank pairwise loss must be sanity-checked against the inflated group shape) and (ii) NDCG@25 stability vs the slot-0-only baseline (a regression here is evidence that intraday-slot redundancy is degrading rather than augmenting the learned ranking, NOT a substrate bug). The DW-168 check is the gate that determines whether the first intraday-trained candidate is TRUSTED for promotion — substrate-ready → candidate trains → DW-168 sanity gate → promotion. The §10.7 Phase-3 exit gates (NDCG@25 absolute floor, walk-forward Sharpe, SHAP) still apply on top of DW-168.
>
> **(h).5 MEASURE-AND-LOCK IS PHASE-7 — CHARTERED AS FP-058, NOT BUILT NOW.** The optimal cadence MEASUREMENT against accrued intraday PnL vs the daily baseline, and the cadence LOCK before Phase-8, are the Phase-7 fires DEC-048 explicitly defers ("optimal cadence MEASURED at Phase 7, LOCKED before Phase 8" — FP-057 Sub-step 6's own title text). Pre-building the measurement scaffold now is speculative shelf-ware: the measurement shape depends on the accrued PnL series that does not exist, and on the cadence-parameter surface that will be settled by the Phase-7 evidence itself. The successor is **FP-058 — Phase-7 Cadence Measure-and-Lock**, chartered same-PR, Phase-7-gated (preconditions: ≥1 intraday-trained candidate promoted AND N weeks of live intraday PnL accrued vs daily baseline). No code, no scaffold, no candidate fabrication, no cadence-lock against zero PnL lands at FP-057 Sub-step 6.
>
> **(h).6 NO SUPERSESSION OF DEC-048.** DEC-070 IMPLEMENTS DEC-048; this clause closes the implementation rebuild. DEC-048's "optimal cadence MEASURED at Phase 7, LOCKED before Phase 8" remains the authorizing provision; FP-058 performs that measurement fire when the Phase-7 preconditions are met. FP-057 STOP-condition 1 (no framing of DEC-070 as superseding DEC-048) preserved.
>
> **Considered and REJECTED at the close (Constitution Rule 8 — preserve the reasoning):**
> - **Per-slot model fleet** (separate active model per `intraday_slot`) — rejected: no DEC authority; multiplies live-inference complexity (N-way fan-out per side); contradicts DEC-066 §c representation-lock; the inference-time cost is real (per-tick model load × N slots) for no demonstrated alpha lift.
> - **Pre-build the Phase-7 measurement scaffold now** — rejected: speculative shelf-ware; the measurement shape depends on PnL series that does not exist; the Phase-7 charter (FP-058) is the correct authoring point.
> - **Fabricate an intraday-trained candidate now** to exercise the promotion path — rejected on §9 SENTINEL / anti-completion-theater; promotion exercise without a real trained candidate is governance fraud against the audit record.

---

## Build sequence (the ratified order — performed by FP-057)

1. **Schema migration (a) + substrate dual-capture plumbing (e)** — PARALLEL; both critical-path; startable immediately. The migration is atomic per table; plumbing lands incrementally as each writer is updated.
2. **Working-order-visibility (b) + ranking-freshness gate (c)** — both planner-side changes; lands together as a single FP-057 sub-step.
3. **Combiner recompute trigger (d)** — the build-time sub-decision (event vs tick-poll-dirty-bit) lands here.
4. **Signal-cadence lift (f)** — by the alpha-decay order; vendor-blocked option (#3 options-flow) lifts last (after its DW-095-adjacent decision).
5. **DW-163 aggregate reframe (g)** — lands after (b) so it has effective-current state to assert against.
6. **Promote intraday-trained combiner + Phase-7 cadence MEASUREMENT + LOCK** — per DEC-048's "optimal cadence MEASURED at Phase 7, LOCKED before Phase 8" provision. This is the DEC-048 measurement step that the FP-052(a) interim deferred; DEC-070 lands the substrate so the measurement can happen. **CLOSED at ACT-349 as RATIFY-AND-CHARTER per clause (h)**: promotion path verified slot-agnostic + substrate verified trainer-ready + first-candidate fire path verified intact + DW-168 registered as the promotion-trust sanity precondition + FP-058 chartered as the Phase-7 measure-and-lock successor. NO code, NO migration, NO candidate fabrication, NO cadence-lock against zero PnL landed at this sub-step (governance-only close).

**The once-daily strategy KEEPS RUNNING on slot 0 throughout.** The backward-compat invariant from clause (a) is the operational continuity guarantee for the rebuild.

---

## Affected Modules / Systems

- `supabase/functions/_shared/longshort-combiner/` (entire surface — keystone rotation per clause (a) + dual-capture per clause (e)).
- `supabase/functions/_shared/longshort-execution/rebalance-submit-orchestrator.ts` (working-order visibility per clause (b); ranking-freshness gate per clause (c)).
- `supabase/functions/_shared/longshort-execution/tick-scheduler.ts` (advance-tick already consumes `reconstructInFlight`; planner gains the same source via clause (b)).
- `supabase/functions/_shared/longshort-verifiers/` (new `verify_ranking_freshness` per clause (c); `verify_rebalance_aggregate` reframed per clause (g)).
- `supabase/functions/_shared/longshort-signals/shared/queue-worker/` (live FP-045 engine; signal-cadence lift per clause (f)).
- `training/combiner/` (trainer-query parity for intraday-slot per clause (e)).

## Status

active.

## Superseded By

—

## Notes

- **NO build code lands at this DEC.** Governance authoring only. The build is FP-057 per the build sequence above.
- **The once-daily cron is NOT disarmed.** Per the keystone (a) backward-compat invariant, the daily strategy keeps running on slot 0 throughout the rebuild.
- **DEC-048 is NOT superseded.** DEC-070 implements DEC-048; DEC-048's title invariant is the authorizing provision.
- **FP-052 disposition (a) once-daily interim** is the only thing this DEC retires. The retirement is performed under DEC-048's "Daily-EOD Is Interim, Not End-State" title.
- **DEC numbering correction:** the prompt named "next-free DEC-069" but DEC-069 was already consumed by the recharts-charting-surface authorization at ACT-324 (file `docs/decisions/DEC-069-recharts-charting-surface-authorization.md`). DEC-070 is the actual next-free number at HEAD `eb72b668`. Operator intent (next-free) preserved.
- **Reconciled-architecture provenance:** dual-independent investigation Lovable + supervisor, then reconciliation, then operator merits-decision on the keystone (a). Recorded for Constitution Rule 8 traceability.

## References

- DEC-048 (authorizing provision — cadence-as-config, Phase-7-measured) — `docs/08-planning/approved-decisions.md`.
- DEC-064 (T+H horizon algorithm-lock — preserved verbatim for slot 0 per clause (a)).
- DEC-068 clause (r) (names "the STREAM-3 cadence charter" as separate future work — DEC-070 fills the hole).
- DEC-069 (recharts surface authorization — unrelated; cited only to explain the numbering correction).
- FP-052 disposition (a) (the once-daily interim **shortcut** retired here).
- FP-057 (the build that performs the 6-step sequence above; chartered same PR as this DEC).
- DW-156 (entry-freshness — downstream of the cadence rebuild).
- DW-163 (aggregate assertion — reframed per clause (g)).
- DW-164 (working-order visibility — resolved by clause (b); resolution-path updated to reference DEC-070 (b) same PR).
- DW-095 (options-flow rebuild — adjacent to clause (f) Signal #3 vendor decision).
- CROSSWIND §4.4 L355–363 (per-signal cadence table); §4.4 L371 (50–80 ranking computations / trading day); §6.1 / §6.2 (T+H horizon algorithm); §11.0.7 #1 (ranking-freshness gate — wired by clause (c)).
- ACT-338 (the DEC-070 + FP-057 authoring entry).
