# Phase / Task Status Ledger — CROSSWIND §10 (Longshort)

> **Last verified:** 2026-06-28 against HEAD `3464ac02` (this authoring, ACT-363).
> **Marked-each-time discipline:** This document follows the same convention as `action-tracker.md` and `database-migration-ledger.md` — every phase closure, FP closure, or hard-blocker discharge MUST update this ledger in the same PR.

## Binding precedence

THIS ledger is the **authoritative phase/task pointer** for the CROSSWIND §10 longshort ladder. Where it disagrees with `docs/00-governance/system-state.md`'s module-status string (which lags HEAD by multiple phases — see Drift **D9**), **THIS document wins**, and `system-state.md` should be reconciled to match in a separate operator-authorized governance turn (recorded as a follow-up in §6 below; **NOT** edited by the authoring turn).

## D1 — name-collision resolution (read before any phase reference)

"**Phase N**" in this document refers to the **CROSSWIND §10 LONGSHORT** ladder (0A / 0B / 1 / 2 / 3 / 4 / 5 / 6 / 7 / 8 / 9). It does **NOT** refer to the platform master-plan ladder (where Platform Phase 7 = Invite Module). Every phase reference here is longshort-§10 unless explicitly prefixed `PLATFORM`.

## D10 — `status: complete` caveat (carried forward from system-state.md L68)

`system-state.md`'s top-level `status: complete` field reflects ONLY the closure of the historical platform-module programme (auth through PLAN-INVITE-001, Platform Phases 1–6). It does **NOT** mean the project is closed and it does **NOT** speak to longshort §10 phase state. The longshort §10 phase state is governed by THIS ledger.

---

## PART 2 — §10 Phase Ladder

| §10 Phase | Status | Primary closure evidence | Constituent FPs | Forward-deferred items | Hard-blockers |
|---|---|---|---|---|---|
| **0A — Module bootstrap residual** | **CLOSED 2026-05-25** | `docs/08-planning/phase-closures/plan-trading-001-longshort-002-closure.md` (rolled into FP-006 closure; 79/79 ACs) | FP-006 | — | — |
| **0B — Reconciliation + paper-broker scaffold** | **CLOSED 2026-05-25 with named Phase-7 carry-forwards** | Same closure doc; ADR-002 / ADR-003 / ADR-004 / ADR-005 / ADR-006 introduced | FP-006; DEC-034 / DEC-035 / DEC-036 / DEC-037 | DW-058, DW-060, DW-061, DW-062 (all Phase-7-homed per ADR-006) | DW-058-B2 (halt feed), DW-062 (ADR-002 Test 2 RTH re-run) |
| **1 — Universe Ingestion & Mgmt** | **CLOSED 2026-05-26** (ACT-119; 38/38 ACs) | `docs/08-planning/phase-closures/plan-trading-001-longshort-003-closure.md`; reinforced by `phase-1-closure.md` (post-FP-008.4 Bucket A) | FP-008 | DW-075 (Phase-1 runtime evidence at first prod refresh; ADR-007 deferral) | — |
| **2 — Signal Stack (9/9 signals)** | **CLOSED 2026-06-14** (ACT-229 governance reconciliation; 9/9 attested with cron-attributable `signal_compute_log` rows) | `docs/08-planning/phase-closures/phase-2-1-closure.md` (Signal #6 template); `system-state.md` L40 enumerates all 9 signals attested | FP-009 / FP-039 / FP-040 / FP-041 / FP-044 / FP-045 / FP-047 / FP-048 / FP-049 / FP-050 | ROI ablations (DW-170/171/173/183-189/191-194 etc.) homed under FP-058 — **SUPERSEDED** by the explicit enumeration in the Part 4F amendment row below (full FP-058 Phase-7 set, no range collapse; do NOT treat the "etc." as authoritative) | — |
| **2 — Signal Stack (ROI-ablations enumeration, replaces "etc." above per Part 4F amendment)** | — | — | — | **Full FP-058 Phase-7 set (enumerated, no range collapse):** DW-099, DW-136, DW-169, DW-170, DW-171, DW-174, DW-175, DW-177, DW-179, DW-180, DW-181, DW-182, DW-183, DW-184, DW-185, DW-186b, DW-187, DW-188, DW-189, DW-190, DW-191, DW-193, DW-194. **Resolved-but-co-located** (Phase-7 work that has shipped its capture or shadow): DW-172, DW-173, DW-176, DW-178, DW-186a (see Part 4E). | — |
| **3 — Combiner** | **IN-PROGRESS** — Phase 3.0 CLOSED; 3.1–3.2 in flight; **3.3 (training) UNCLOSED** | `docs/08-planning/phase-closures/plan-trading-001-longshort-007-closure.md` (FP-052 (3.0)). Phase 3.3 = `combiner-train.yml` weekly Sunday cron + `combiner-models` storage bucket EXIST and ARMED; first promoted candidate has not landed. | FP-052 (3.0 closed; 3.1/3.2/3.3 open) | DW-168 (intraday-group lambdarank sanity gate — promotion-trust precondition per DEC-070 clause (h).4) | DW-168 blocks first promotion |
| **4 — Portfolio / Sizing / Wash-sale / Lot / PnL / Settlement / CA** | **PARTIAL — UNVERIFIED (no `phase-4-closure.md` exists)** | Sizing + book-layer landed under FP-055 (no standalone closure doc — see Drift **D7**); tax/lot/PnL/settlement/corp-actions infra UNCLOSED | FP-055 (sizing — closure recorded via reference, see D7); **NO formal FP for the wash-sale / lot / PnL / settlement / CA infra cluster** (see Drift **D4**) | DW-157 / DW-158 / DW-159 / DW-160 / DW-161 (each "PRE-LIVE BLOCKER"; provenance = the DW-143 umbrella split, see Drift **D6**) | DW-157 / DW-158 / DW-159 / DW-160 / DW-161 (5 hard pre-live blockers) |
| **5 — Execution (Paper)** | **CLOSED 2026-06-25** (FP-056 paper-exec; E6-FIRE landed; real SPY paper order filled at ACT-327) | `docs/08-planning/feature-proposals.md` FP-056 row; ACT-327. **No standalone `phase-5-closure.md` for longshort** (the existing `phase-05-closure.md` is the PLATFORM Phase 5 — name collision; THIS ledger row IS the §10 Phase 5 closure record per Drift **D3**) | FP-056 | DW-149-C (short-stop obligation persistence; carryover from Component 1); DW-150 (§8.9 `ssr_violation` PAUSE-class) | DW-149-C, DW-150 (both pre-live) |
| **6 — Full Integration / Cadence Rebuild** | **IN-PROGRESS by aggregation — UNVERIFIED as a discrete §10 phase** | FP-057 RESOLVED 2026-06-29 (ACT-349; all 6 sub-steps landed); the rest is the build-to-paper aggregate window. **No discrete §10-Phase-6 FP** exists (see Drift **D4**) | FP-057 (cadence rebuild RESOLVED) | DW-058 (incl. B2 halt feed); DW-060 (periodic-sweep scheduler arming); DW-105 (§1.4 state-machine); DW-156 (entry-freshness / signal-trajectory gate) | DW-058-B2 (halt feed — HARD for live-order code paths) |
| **7 — Paper Validation (calendar-bound)** | **NOT-STARTED** | FP-058 status line (`feature-proposals.md` L940): "CHARTERED 2026-06-29 at ACT-349 — Phase-7-gated, DATA-GATED" | FP-058 (chartered — preconditions unmet) | DW-061 (Captured-Day-1 + §11.0.11); DW-062 (ADR-002 Test 2 RTH re-run); the FP-058 measurement methodology DEC (unauthored) | FP-058 preconditions: (i) ≥1 intraday-trained candidate promoted via DW-168; (ii) ≥N weeks live intraday PnL accrued vs daily-baseline shadow |
| **8 — Small-Live** | **NOT-STARTED** | DW-154 / DW-155 "Forward Binding (HARD): Live-fire ratification MUST NOT proceed with [open blocker]" | (none authored) | — | Full 12-item set (§4 below) |
| **8 — Small-Live (amendment row, leverage-DEC home — Part 4F (4))** | — | — | — | **DW-137** (Phase-8 leverage authorization DEC — supersedes CROSSWIND §1 L95/L155 no-leverage invariant; pre-Phase-8 governance prerequisite, open) | — |
| **9 — Scale-Live** | **NOT-STARTED** | implied successor of Phase 8 | (none authored) | — | inherits Phase-8 set |

---

## PART 3 — FP Ledger

| FP | §10 Phase | Status | Closure / status evidence |
|---|---|---|---|
| **FP-006** | 0A / 0B | **CLOSED 2026-05-25** | `plan-trading-001-longshort-002-closure.md`; 79/79 ACs; ADR-006 |
| **FP-007** | (CI/CD; not §10) | CLOSED | `plan-ci-001-bootstrap-001-closure.md` |
| **FP-008** | 1 | **CLOSED 2026-05-26** (ACT-119) | `plan-trading-001-longshort-003-closure.md`; 38/38 ACs |
| **FP-009 / FP-039 / FP-040 / FP-041 / FP-044 / FP-045 / FP-047 / FP-048 / FP-049 / FP-050** | 2 | **CLOSED 2026-06-14** (9/9 attested) | `phase-2-1-closure.md`; ACT-229; FP-050 row |
| **FP-052 (3.0)** | 3.0 | **CLOSED** | `plan-trading-001-longshort-007-closure.md` |
| **FP-052 (3.1 / 3.2 / 3.3)** | 3 | **OPEN — training cron + bucket live; no first-promoted candidate** | No closure doc; DW-168 named as promotion-trust precondition |
| **FP-055** | 4 (sizing) | **CLOSED via reference (no standalone closure doc — Drift D7)** | Closure referenced from FP-057 row + cadence-rebuild context; **gap flagged** |
| **FP-056 (Paper-Exec)** | 5 | **CLOSED 2026-06-25** (ACT-327; E6-FIRE landed) | `feature-proposals.md` FP-056 row |
| **FP-057 (Cadence Rebuild)** | 5 / 6 bridge | **RESOLVED 2026-06-29** (ACT-349; **all 6 sub-steps landed** — schema keystone + working-order visibility + recompute trigger + signal-cadence lift + aggregate reframe + ratify-and-charter close) | `feature-proposals.md` L923 |
| **FP-058 (Phase-7 Measure-and-Lock)** | 7 | **CHARTERED 2026-06-29 — DATA-GATED** (preconditions unmet) | `feature-proposals.md` L935–948 |

### RESERVED-BUT-UNAUTHORED gaps (Drift D4)

- **No formal FP for §10 Phase-4 money-path infra** (wash-sale / lot / PnL / settlement / CA). Work is carried only by DW-157 → DW-161. **Risk:** these are pre-live HARD blockers tracked outside the FP ledger and may be lost during planning sweeps. **Corrective:** the next build-plan turn MUST author the Phase-4 money-path FP and adopt the five DWs as its sub-steps.
- **No formal FP for §10 Phase-6 Full Integration.** FP-057 (cadence rebuild) closed the cadence-architecture piece, not the integration aggregate. **Corrective:** the next build-plan turn MUST author the Phase-6 integration FP enumerating the DW-058 / DW-060 / DW-105 / DW-156 wiring as named sub-steps.
- **No formal FP for §10 Phases 8 / 9.** Acceptable at this distance; flag at Phase-7 close.

---

## PART 4 — Forward-Deferred + Hard-Blocker Register

### 4A — ADR-006 Phase-0B → Phase-7 carry-forwards (all OPEN, correctly Phase-7-homed)

| DW | Status | Hard-blocker class |
|---|---|---|
| **DW-058** (Phase-7 fetcher wiring) | `deferred`. **Sub-item B2 (halt feed) = HIGH/BLOCKING**: "Phase 7 cannot wire live-order code paths until B2 is resolved — a phantom non-halt fetcher is structurally worse than no halt check." | **HARD pre-paper-RTH** for live-order code paths |
| **DW-060** (Periodic-Sweep Scheduler / pg_cron) | `deferred` | Required to arm continuous paper execution at Phase 7 |
| **DW-061** (Captured-Day-1 execution + §11.0.11 firing analysis) | `deferred` | Phase-7 deliverable; gates paper-validation evidence base |
| **DW-062** (ADR-002 Test 2 RTH re-run) | `deferred`. "Cannot proceed without Test 2 RTH evidence." | **HARD pre-short-side-go-live** |
| **DW-075** (Phase-1 runtime evidence at first prod refresh) | `deferred` | Closes naturally at first Phase-7 refresh; non-path-blocker |

### 4B — Pre-Live Hard-Blocker Set (12 items; money-path correctness; gates Phase 8 regardless of velocity)

| # | DW | Domain | Why hard |
|---|---|---|---|
| 1 | **DW-058-B2** | Real halt feed | Phantom non-halt fetcher worse than no halt check |
| 2 | **DW-062** | ADR-002 Test 2 RTH re-run | Fill-independence assumption underpins v0 fallback safety claim |
| 3 | **DW-154** | Reg-SHO SSR live source | "Live-fire ratification MUST NOT proceed with SSR as typed-absence" |
| 4 | **DW-155** | Live `assets.shortable` semantics | Live DEC MUST cite DW-155 closure evidence |
| 5 | **DW-157** | Wash-sale events + writer + verifier | §11.0.10 zero-tolerance; 1099-B correctness |
| 6 | **DW-158** | `longshort_lots` FIFO ledger + verifier | Cost-basis truth (substrate every tax verifier reads) |
| 7 | **DW-159** | `realized_pnl` writer-at-exit + verifier | P&L truth |
| 8 | **DW-160** | `verify_settlement_status` + T+1 wiring | Cash availability + PDT-adjacent |
| 9 | **DW-161** | Polygon corp-actions ingestion + verifier | Silent-corruption risk on splits/divs/mergers |
| 10 | **DW-162b + DW-166** | Numeric borrow-rate monitor + vendor procurement | Rate-DRIFT verifier branches; squeeze early-warning |
| 11 | **DW-149-C** | Short-stop obligation persistence (Component 1 carryover) | Currently single-tick fire-and-let-broker-race |
| 12 | **DW-150** | §8.9 `ssr_violation` rejection PAUSE-class | Same-tick race-window logic |

ROI-improvement items (trainer quality / signal ablations / shadow variants) are **NOT** included here — they live under FP-058 (Phase-7) and the per-signal ROI audit DWs. ROI ≠ correctness.

### 4C — Loose ends to close

- **DW-157 → DW-161 carry "ACT-pending" registration tags** in `deferred-work-register.md`. The split itself was authoritative (Drift D6 / DW-143 umbrella supersession) but the registering ACT was not stamped. Next governance turn should stamp a single backfill ACT covering the five entries.

### 4D — Adopted-by-Future-FP Register (ROI-completeness amendment, ACT-364)

The ROI-completeness audit found 40 ROI-class DWs absent from the ledger and lacking a named FP carrier. **Binding rule:** when each FP below is authored (per Drift D4 corrective + Part 3 RESERVED-BUT-UNAUTHORED gaps), it MUST adopt every DW listed under it as a named sub-step OR explicitly defer-with-rationale in the FP charter. Defer-without-rationale = governance violation under the Phase-Gate Protocol.

| Absorbing FP (to be authored) | Adopted DWs | Class |
|---|---|---|
| **Phase-4 money-path FP** (the wash-sale / lot / PnL / settlement / CA cluster) | DW-157, DW-158, DW-159, DW-160, DW-161 (already named in Drift D4) | Hard pre-live (5) |
| **Phase-6 integration FP** (cadence-architecture aggregate) | **Core (from D4):** DW-058, DW-060, DW-105, DW-156. **Execution-branch cluster:** DW-138 (Alpaca live capital fetcher), DW-139 (§8.6.1.1 parallel-order branch), DW-140 (§8.7 partial-fill discipline), DW-141 (§8.8 modify-vs-cancel), DW-142 (§8.10 LULD-aware re-quote), DW-144 (§8.9 PAUSE-class + kill-switch surface), DW-151 (`pdt_block` PAUSE), DW-152 (persistent-BP detection), DW-153 (htb TTL refinement, paper-evidence-gated). **Calibration-debt knobs** (may be folded into a sub-step or split off): DW-145, DW-146, DW-147. | NTB execution-correctness + calibration |
| **Phase-3 trainer/combiner FP carrier** (FP-052 sub-step 3.4 OR a new Phase-3-residual FP) | DW-100 (multi-year FV backfill), DW-101 (SPY-regime fetcher + features), DW-106 (per-signal carry-forward), DW-109 (coverage-weighted shrinkage — ROI-CRITICAL), DW-110 (forward-return retry obs / `horizon_pending`), DW-135 (cross-source open-price reconcile — promotes `signal_decay_returns` from single-source), DW-136 (SHAP write path — gates §4.1 / §6.5.6 / §8.7 v2 measurement), DW-168 (intraday-group lambdarank sanity gate, already named in Phase-3 row — re-cited here for completeness). | NTB combiner / trainer quality |
| **Signal-substrate-hardening FP** (new FP carrier OR adopted under existing signal-family FPs by signal #) | **Signal #4 (insider):** DW-093 (DEF-14A NEO enrichment), DW-094 (EDGAR direct rebuild — INC-70). **Signal #3 (options-flow):** DW-095 (cursor-drain rebuild — DEC-047). **Signal #9 (catalyst):** DW-097 (bmo/amc session-anchor enrichment), DW-098 (NYSE-calendar holiday-aware stepper). **Cross-signal substrate:** DW-114 (insider silence detection — producer 403 before R1 heartbeat + green-but-empty consumer mask), DW-130 (SI date-floor + `deriveStaleness` `n/a`-fallthrough hardening), DW-132 (`liveClock` migration on momentum / reversal / pead / options-flow orchestrators). | NTB substrate fidelity |
| **Low-priority refinements (homed, flagged LOW-PRI)** | DW-165-B (DTC down-weight curve — refinement of DW-165 hard-exclude); DW-167 (Polygon Options Advanced vendor procurement — vendor-gated, adopts under whichever FP charters the options-flow vendor switch); DW-174 (Daily-SI vendor procurement — vendor-gated); DW-181 (Analyst II All-America Research vendor — vendor-gated, LARGEST analyst-skill lever). | Vendor-gated / refinement |

**Coverage attestation:** every ROI-class DW in the register that was ABSENT from the ledger at the audit (40 items) is now homed in one of the rows above. Nothing in the audit's "ABSENT" set remains homeless.

### 4E — RESOLVED-BUT-LEDGER-SILENT (status-backfill record, ACT-364)

Items the register marks RESOLVED that the ledger was previously silent on. Recorded here so future sessions cannot re-charter shipped work.

| DW / DEC | Closure evidence | Note |
|---|---|---|
| **DW-172** (PEAD T-0 consensus snapshot capture) | **RESOLVED ACT-357** (time-sensitive capture; landed in the consolidated weekend-bundle PR) | Capture step only; the walk-down ablation remains Phase-7 |
| **DW-178** (Analyst per-revision-outcome CAPTURE) | **RESOLVED ACT-357** (time-sensitive capture) | The per-analyst weighting (DW-179) remains Phase-7 |
| **DW-186a** (News articleCount attention capture — narrowed scope from DW-186) | **RESOLVED-PARTIAL ACT-357** (`captureMeta` seam at queue-finalizer + `news_attention_observations(article_count NOT NULL)`; §22.5.1 live-DB verified) | DW-186b (PR-excluded + unmapped-publisher streams) remains OPEN under Part 4D Phase-7 set |
| **DW-173** (SI level / DTC as-alpha shadow) | **STOOD-UP ACT-360** (MIG-138 `short_interest_alpha_shadow`; mechanism-2 per-signal shadow table) | Promotion decision FP-058-gated; shadow series accruing |
| **DW-176** (Reversal ungated shadow ride-along under DEC-071) | **LIVE ACT-358 / ACT-359** (MIG-135 `reversal_ungated_observations` accruing; 652 none + 96 catalyst + 90 news shadow rows verified at sub-step 3b closure 2026-06-26) | The Phase-7 retrospective over-gating check itself remains under DW-177 |
| **DW-149 Component 1** (≥15% short-stop P&L monitor + intent producer) | **RESOLVED ACT-344** (re-cited from Drift D8 for completeness) | DW-149-C carryover remains in Part 4B row 11 |
| **DW-165** (Days-to-cover short-side entry screen) | **RESOLVED ACT-345** (re-cited from Drift D8) | DW-165-B down-weight refinement remains in Part 4D row 5 |
| **DW-162a** (ETB transition monitor) | **RESOLVED ACT-346** (re-cited from Drift D5/D8) | DW-162b / DW-166 vendor strands remain in Part 4B row 10 |
| **DW-163 (+ DW-149-B)** (rolling-window aggregate gate, transient-vs-persistent) | **RESOLVED ACT-348** (FP-057 Sub-step 5) | — |
| **DW-148** (Alpaca data-tier decision) | **RESOLVED-BY-SUBSTITUTE ACT-337** (Polygon NBBO; re-cited from Drift D2) | Pre-live dimension discharged; live cut-over inherits Polygon SIP |
| **DEC-071** (Reversal news/catalyst cross-signal gate; magnitude cap deferred) | **RATIFIED + BUILT (NEWS∪CATALYST scope) ACT-358** (sub-steps 3a–3c code; MIG-134 `skip_reason` + MIG-135 ungated-observations + MIG-137 `gated_signals` JSONB). Clause (b) 3σ magnitude-cap DEFERRED at build (recorded at ACT-359); ablation lives under DW-177. | Audit's 1st now-fix |
| **DEC-073** (Insider buys-only — drop sell-side) | **RESOLVED ACT-357** (one-line filter at `compute-insider.ts:32-36`; symmetric shadow comparator under DW-183) | Audit's 2nd now-fix |
| **DEC-074** (Catalyst conditioning-only in additive fallback) | **RESOLVED ACT-357** (`SIGNAL_IDS_FALLBACK_SUM` swap in `ranker.ts`; catalyst remains in `SIGNAL_IDS_ALL` / trained-combiner path) | Audit's 3rd now-fix |
| **DEC-072** (Analyst credibility-weight v1.1 brokerage-tier proxy) | **CHARTERED — BUILD-DEFERRED** per Clause (d) (post-audit weekend-slate ranking; larger lever is DW-179 per-analyst accuracy weight, itself Phase-7-gated) | Charter-deferred |
| **DEC-075** (Additive-Fallback Regime structural limits + classification gate + Phase-7 acceptance bar) | **CHARTERED governance rule** (ACT-356; §c classification CONFIRMED at ACT-357: 8 additive : 1 interaction-excluded; ZERO TBD) | Governance-only; no code |

### 4F — Amendment scope record (ACT-364)

This ledger amendment closes the ROI-completeness audit. Changes (all additive per Constitution Rule 8):

1. **Phase-2 row "etc." replaced** with the explicit Phase-7 ablation enumeration (see Phase-2 amendment row above; full set: 23 open + 5 resolved-but-co-located).
2. **Part 4D Adopted-by-Future-FP Register added** — every previously-absent ROI DW now has a named absorbing FP, with the binding rule that FP authors MUST adopt-or-defer-with-rationale.
3. **Part 4E Status-backfill record added** — 10 RESOLVED DWs + 5 DECs cited with closing-ACT evidence so the ledger reflects HEAD.
4. **Phase-8 row leverage-DEC home added** — DW-137 (Phase-8 leverage authorization DEC) now homed in the Phase-8 amendment row above.
5. **`docs/06-tracking/signal-roi-audit-findings.md` discrepancy resolved** — the file DOES exist (286 lines, audited 9/9 signals, closure summary at L216–248); the prior audit's "not present on disk" finding was a miss. Sweep result: every promotable finding in that document is already represented in Part 4D (Phase-7 set, substrate hardening, calibration knobs) or Part 4E (RESOLVED-with-evidence); zero additional ROI items surfaced.
6. **Coverage re-attestation:** with these amendments, every ROI-class DW in `deferred-work-register.md` is now either REPRESENTED in a phase row, ADOPTED in Part 4D, or RECORDED-RESOLVED in Part 4E. Zero ROI absences.

---

## PART 5 — Remaining-Work Sequence (HEAD → Paper → Live)

### BUILD side (compressible — engineering throughput-bound)

```
Phase 3.3 first-candidate promotion
  ├─ combiner-train.yml weekly Sunday cron + combiner-models bucket EXIST
  ├─ DW-168 (intraday-group lambdarank sanity gate) — promotion-trust precondition
  └─ requires accrued substrate (slot-0 daily + slot-N intraday capture per FP-057 Sub-step 1, ACT-339, MIG-122…MIG-126)
      ↓
Phase 4 money-path infra (NO named FP — Drift D4; carrier = DW-157…DW-161)
  ├─ DW-157  Wash-sale events + writer + verifier
  ├─ DW-158  longshort_lots FIFO ledger + verifier
  ├─ DW-159  realized_pnl writer-at-exit + verifier
  ├─ DW-160  verify_settlement_status + T+1 wiring
  └─ DW-161  Polygon corp-actions ingestion + verifier
      ↓
Phase 6 "Full Integration" aggregate (NO named FP — Drift D4)
  ├─ DW-058  fetcher wiring (incl. B2 halt feed — HARD for live-order)
  ├─ DW-060  periodic-sweep scheduler arming
  ├─ DW-105  §1.4 state-machine
  └─ DW-156  entry-freshness / signal-trajectory gate
```

### VALIDATION side (calendar-bound — non-compressible)

```
Phase 7 — Paper Validation
  ├─ DW-061  Captured-Day-1 execution + §11.0.11 firing analysis
  ├─ DW-062  ADR-002 Test 2 RTH re-run  ← HARD pre-short-side
  └─ FP-058 activation (after BOTH preconditions met:
              (i) intraday-trained candidate promoted via DW-168
              (ii) ≥N weeks live intraday PnL vs daily-baseline shadow)
      ↓
Phase 8 — Small-Live (gated on the full 12-item Hard-Blocker Set in §4B)
      ↓
Phase 9 — Scale-Live
```

### Critical dependencies

- Real-paper (Phase 7) is blocked by Phase 3.3 (trained combiner) **AND** Phase 4 money-path infra (sizing landed; tax/lot/PnL/settlement/CA NOT YET).
- Phase 3.3 promotion is blocked by accrued substrate **AND** DW-168 sanity gate.
- Cron arming for continuous paper-RTH execution is blocked by DW-060 **AND** DW-058-B2 (halt feed).
- Trainer needs accrued forward labels → calendar-bound, NOT compressible.

---

## PART 6 — State-Drift Resolutions (D1 – D10)

| ID | Drift | Resolution |
|---|---|---|
| **D1** | "Phase 7" overloaded (Platform Invite vs Longshort Paper Validation) — biggest reconstruction-error vector | **RESOLVED in-place** by the Part 1 prefix convention above. All `Phase N` references in this ledger are CROSSWIND §10 unless `PLATFORM`-prefixed. |
| **D2** | DW-148 multi-status (entry contains both "OPEN-CRITICAL" reframe line and "CLOSED" line) | **RESOLVED in-place** by status-normalization addendum on DW-148 added this turn (Constitution Rule 8 honored — original rows preserved). Canonical status now: **RESOLVED-BY-SUBSTITUTE (Polygon NBBO, ACT-337, 2026-06-26)**. Pre-live dimension discharged: live cut-over inherits the Polygon-SIP feed; no Alpaca data-tier upgrade required. |
| **D3** | No `phase-5-closure.md` for longshort (existing `phase-05-closure.md` is PLATFORM phase 5) | **RESOLVED in-ledger** — **§10 Phase 5 is CLOSED 2026-06-25 via FP-056 / ACT-327** per Part 2 row + Part 3 FP-056 row. THIS ledger row IS the §10 Phase 5 closure record. A standalone `phase-5-closure.md` MAY still be authored later for archival symmetry; not required for governance correctness. |
| **D4** | No §10 Phase-4 FP, no §10 Phase-6 FP | **FLAGGED in-ledger** — RESERVED-BUT-UNAUTHORED entries recorded in Part 3. **Corrective binding:** the next build-plan turn MUST author the Phase-4 money-path FP (adopting DW-157…DW-161 as sub-steps) and the Phase-6 integration FP (adopting DW-058 / DW-060 / DW-105 / DW-156 as sub-steps). |
| **D5** | DW-162 umbrella reads as if open; actually superseded into DW-162a / DW-162b / DW-166 | **RESOLVED in-source** at register line 3353 (status `SUPERSEDED-BY-SPLIT (ACT-346, 2026-06-28)`); **re-cited in this ledger**: DW-162a RESOLVED at ACT-346 (etb-transition monitor live); DW-162b OPEN-VENDOR-GATED; DW-166 OPEN-PROCUREMENT. Reading the umbrella alone gives wrong status — readers MUST consult the split. |
| **D6** | DW-143 umbrella similarly superseded | **RESOLVED in-source** (DW-143 status row marks `SUPERSEDED-BY-SPLIT`); **re-cited in this ledger**: split into DW-157 / DW-158 / DW-159 / DW-160 / DW-161 (per Part 4B rows 5–9). Borrow-rate strand previously implied by §3.3d goes to DW-162 / DW-162b. |
| **D7** | FP-055 has no standalone closure doc | **RESOLVED in-ledger** — closure recorded via reference per Part 3 FP-055 row. A future archival pass MAY author a `fp-055-closure.md` for symmetry; not required for governance correctness. |
| **D8** | DW-149 mixed status (Component 1 resolved but components 2 / 3 / -B / -C carried in same row) | **RESOLVED via component split (already in source)** — DW-149 Component 1 RESOLVED at ACT-344 (`short-stop-evaluator.ts`); DW-149-B (cross-tick persistence observer) unified into DW-163 RESOLVED at ACT-348 (FP-057 Sub-step 5); DW-149-C (short-stop obligation persistence) OPEN, listed in §4B row 11; DW-165 (days-to-cover entry screen) RESOLVED at ACT-345; DW-162a RESOLVED at ACT-346. Re-cited here for clarity. |
| **D9** | `system-state.md` longshort field reads `phase-2-validated` despite Phase-3.0 + FP-056 + FP-057 having landed (~3 phases behind HEAD) | **RECORDED AS REQUIRED FOLLOW-UP — NOT EDITED THIS TURN.** The needed correction: `system-state.md` line 38 `modules_implemented` longshort field MUST be updated from `longshort phase-2-validated` to reflect HEAD state — Phase 2 CLOSED, Phase 3.0 CLOSED, Phase 5 CLOSED (FP-056 / ACT-327), FP-057 RESOLVED (cadence rebuild), FP-058 CHARTERED. The actual edit is a separate operator-authorized governance turn. Until then, THIS ledger wins per the precedence stated in §1. |
| **D10** | `system-state.md` L68 `status: complete` caveat (refers to platform-module programme only) | **RESOLVED in-ledger** — carried forward verbatim at the top of this document (§"D10 — status: complete caveat") so future readers cannot misread the platform-status field as a project-status field. |

---

## Update discipline (marked-each-time)

Any PR that:
- closes a §10 phase or sub-phase,
- closes or resolves an FP,
- discharges any item in §4B (hard-blocker set),
- promotes a combiner candidate,
- activates FP-058,

MUST update this ledger in the same PR (matching `action-tracker.md` + `database-migration-ledger.md` cadence). Stale ledger = governance violation under the Phase-Gate Protocol (mem://governance/phase-gate-protocol).
