# Long-Short ROI Roadmap — Supervisor-Synthesis Reference

> **Status banner.** Supervisor-synthesis reference. **NOT a decision record** — cites
> DEC-054 / DEC-048 / DEC-059 / DEC-060 + the deferred-work register as authoritative
> and commits no build and no priority. Build work is authorized **only** via FPs.
> Phase order per DEC-054 is **unchanged** by this document. This artifact exists to
> survive thread-loss and to give any future session a canonical four-tier framing
> against which to evaluate proposed ROI work — not to re-decide it.

> **Out of scope of this artifact (load-bearing).** Capital deployment decisions,
> leverage decisions, and tax-structure decisions are explicitly out of scope here.
> Those levers require quant + CPA-in-the-loop per the caveat at the end of this
> document; this artifact does not give portfolio or tax advice.

Owner: long-short module. Authority anchor: DEC-054 (R1-R7 ladder), DEC-048
(cadence), DEC-059 (DW-109 promotion rule), DEC-060 (short-interest carry-forward).
Authored: ACT-280 (2026-06-22) against HEAD `6dab26dc`.

---

## 1. Purpose

The operator-level ROI roadmap for the long-short stack is documented across the
decision and tracking layers (DEC-054 / DEC-048 / DEC-059 + the DW register), not
in any single spec section. A read-only inventory at ACT-280 surfaced the full
set; this artifact records the resulting framing so future sessions reach for a
canonical view rather than re-deriving it from memory.

The framing has two parts: (a) the **four-tier sort** of every documented ROI
lever by what gates its decision-readiness; and (b) the **chokepoint observation**
that one structural fact — the absence of a Phase-7 paper book — gates the
largest cluster of levers. The framing is descriptive, not prescriptive.

## 2. The Four Tiers

Every documented forward ROI lever (beyond the CROSSWIND §16 v2-deferral list
and the §10.14.4 magnitude levers, which are grounded separately and cross-
referenced at §6 below) sorts into exactly one tier by the nature of what gates
its decision-readiness today.

### 2.1 Tier 1 — Decision-ready now (only an operator FP gates them)

All inputs are present; no measurement prerequisite is missing; the only gate is
an operator-authorized FP authoring the build.

| Lever | Authority | Inputs already on hand |
|---|---|---|
| **R2 — Squeeze-guard short-book veto** | DEC-054 R2 (P0; Phase 2.10) | SI + DTC + 5d-ret from Signal #5 + Polygon bars |
| **R3 — Signal #10 quality / gross-profitability (Novy-Marx GP/A)** | DEC-054 R3 (P1; Phase 2.12) | FMP Premium fundamentals (already subscribed; $0 marginal) |
| **DW-093 — Signal #4 DEF-14A authoritative NEO enrichment** | DW-093 (post-#4-v1) | DEF-14A fetcher path; #4 v1 live on EDGAR rebuild |
| **DW-100 — Combiner multi-year feature-vector backfill** | DW-100 (Phase 3.1) | FP-052 (3.0) closure; backfill orchestrator design |

Decision-ready does **not** mean "do these next." See §4 supervisor framing.

### 2.2 Tier 2 — Measurement in progress, decision-ready when n accrues

Build landed; evidence is accruing on cron; the lever's decision flips when the
sample reaches its pre-registered threshold.

| Lever | Authority | Measurement instrument | Decision-ready when |
|---|---|---|---|
| **DW-109 — §4.3.5 exclusion gate → coverage-weighted shrinkage (ROI-CRITICAL)** | DEC-059 (pre-registered rule: 15 bp T+5, n≥30 paired post-DW-106-heal seed-days, p<0.05, T+1/T+20 corroboration) | Phase-3.M shadow harness (jobid 97 / 98 ARMED) + `combiner_forward_returns` paired series | ~30 trading-day post-DW-106-heal accrual reaches first scheduled monthly review |
| **Cadence-decay evidence for DEC-048** | DEC-048 (cadence is config; Phase-7 measures and locks) | `signal_decay_returns` / `signal_decay_log` (MIG-114; jobid 104, 35 13 * * 1-5) | First post-Phase-7-paper-book regime comparison can be run |

### 2.3 Tier 3 — Blocked on a Phase-7 paper book (the chokepoint cluster)

Each lever's decision-readiness gates on per-signal / per-side / per-regime
evidence that can only accrue against a paper book running over real time.

| Lever | Authority | What the paper book supplies |
|---|---|---|
| **Cadence lock** | DEC-048 (Phase-7 cadence-tuning MUST sub-step; ≥2 cadence regimes on same paper book) | Per-signal cost-adjusted IC at each candidate cadence |
| **R5 — Long-vs-short IC diagnostic** | DEC-054 R5 (P0; Phase-7 ablation spec) | Per-signal × per-side IC table (long-tail IC vs short-tail IC, all signals) |
| **R6 — Asymmetric book sizing** | DEC-054 R6 (P2; conditional on R5) | R5 evidence is its sole input |
| **R7 — Drawdown-conditional gross-exposure scaling** | DEC-054 R7 (P2; Phase 4/5 architectural slot; default 1.0) | Phase-7 calibration of scaling-rule parameters |
| **R1 ablation verdict** | DEC-054 R1 (build at Phase 2.11; verdict at Phase 7) | Whether FIP + formation-vol pairs survive the 10-day-label horizon mismatch |

### 2.4 Tier 4 — Blocked on vendor / external infrastructure

Engineering is not the gate; cost / vendor / external-model decisions are.

| Lever | Authority | Blocker |
|---|---|---|
| **FinBERT v2 for Signal #8** | DEC-056 (FinBERT v2 deferral) | Inference infrastructure; sentiment retro-evaluation |
| **True SUE stdDev for Signal #2** | DEC-051 (range-based proxy is v1) | Vendor that ships `epsEstimateStdDev` (neither current vendor does) |
| **Signal #3 — full 5-day timesales** | DEC-046 (chain-snapshot is v1 conscious approximation) | Tradier timesales-grade ingestion path |
| **PEAD eligibility floor relaxation** | DEC-052 (`numAnalystsEps < 2` ⇒ typed absence) | Wider-coverage vendor OR shrinkage approach |

## 3. The Chokepoint Map

The dominant structural fact:

> **Five separate ROI levers — cadence lock (DEC-048), R5 IC diagnostic, R6
> asymmetric sizing, R7 drawdown-scaling, and the R1 ablation verdict — all gate
> on the absence of a Phase-7 paper book.**

This is not coincidence; it is the spec's core philosophy made concrete: an
ROI lever cannot be acted on until the edge it is supposed to amplify has been
measured. The same logic governs leverage (do not multiply an unvalidated edge)
per §10.14.4. The paper book is the single measurement instrument that unlocks
the entire second tier of levers.

Two further measurement instruments unlock the remainder:

- **SHAP attribution** — gates R5 long/short IC interpretability, per-signal
  ablation triage (§4.1 / §6.5.6), and per-signal-family execution-timeout
  prioritization (§8.7 v2). Today: only the §6.5.6 spec anchor exists; no write
  path, no DW had been registered (now DW-136, see §7).
- **Regime labels as a first-class artifact** — gates R4 regime-conditional
  combiner features AND R7 drawdown-conditional gross-scaling AND crash-state
  downweighting (the momentum-crash class, which is also the CAR-lingering and
  leverage-selection-drawdown risk class). Today: DW-101 covers the SPY/index
  fetcher and jsonb feature columns for the LambdaRank ranker but does **not**
  explicitly cover the productized-label consumer surface that R7 / crash-state
  downweighting requires (see §7 regime-label scope-check note).

## 4. Measurement-Prerequisite Table

Per documented lever → unmet measurement prerequisite → status today.

| Lever | Prerequisite | Status |
|---|---|---|
| Cadence lock (DEC-048) | Close→next-open decay; per-signal cost-adjusted IC at ≥2 cadences on same paper book | Decay instrument **BUILT** (MIG-114; accruing from jobid 104); cadence-comparison evidence **BLOCKED on Phase-7 paper book** |
| DW-109 gate→shrinkage (DEC-059) | Phase-3.M shadow harness + paired forward returns + DW-106 coverage-heal | Harness **ARMED**; paired series **ACCRUING**; DW-106 heal **IN FLIGHT** (DEC-060) |
| R5 long/short IC diagnostic | Per-signal × per-side IC table over paper-book regime | **NOT BUILT** (gates R6) |
| R6 asymmetric sizing | R5 evidence | **NOT BUILT** (downstream of R5) |
| R7 drawdown gross-scaling | Phase-7 calibration of scaling rule + regime labels as first-class artifact | **NOT BUILT** (architectural slot reserved; default 1.0) |
| R4 regime features (combiner) | SPY/index fetcher + jsonb feature columns | **NOT BUILT** (DW-101 placeholder; Phase-3.2-gated) |
| R1 trend-quality features | Polygon bars (present) + Phase-7 ablation verdict | Inputs present; verdict **BLOCKED on Phase-7 paper book** |
| R2 squeeze-guard veto | SI + DTC + 5d-ret | All inputs **PRESENT** |
| R3 quality factor (Signal #10) | FMP fundamentals | All inputs **PRESENT** |
| DW-093 NEO upgrade | DEF-14A fetcher | **NOT BUILT** (small) |
| DW-100 multi-year feature backfill | Backfill orchestrator + provenance discipline | **NOT BUILT** (Phase 3.1) |
| Cross-source open reconcile (decay `success`) | Tradier daily-bar fetcher + `verify_open_print` verifier | **NOT BUILT** (DW-135 registered) |
| SHAP attribution | Write path + reconciliation surface + consumer wiring | **NOT BUILT** (DW-136 registered at this ACT) |
| Regime labels (R7 / crash-state) | Productized label artifact consumable by R7 + downweighting | **DW-101 scope-check** flagged at this ACT (does not cover) |

## 5. Supervisor Synthesis (Framing, Not a Decision)

**Measurement is the highest-leverage near-term ROI move at this phase.** The
gap analysis at ACT-280 traces every blocked verdict in §2.3 + §2.4 back to one
of three missing instruments: the **Phase-7 paper book** (5 levers), **SHAP
attribution** (R5 + ablation + execution-timeout prioritization), and **regime
labels** (R4 + R7 + crash-state downweighting). Each instrument is a multiplier
across multiple downstream levers; building any one converts a cluster of "ROI
we can't measure" entries into "decision-ready the moment the paper book has
data."

Regime labels deserve special emphasis: they are simultaneously an **ROI lever
enabler** (R4 ranker features, R7 drawdown gross-scaling) and a **risk
instrument** for the momentum-crash failure mode — the CAR-lingering / "ride it
back down" class that is also the leverage-amplified selection-drawdown class.
Building them serves both the ROI and the risk side of the same axis.

This synthesis does **not** alter DEC-054's phase sequence (Phase 2 closure
first; then 2.10 R2 → 2.11 R1 → 2.12 R3) and does **not** authorize any build.
It is the recorded supervisor framing against which future FPs and DECs can be
evaluated. Any reordering of the phase ladder is a superseding DEC, authored
deliberately — never a side-effect of this artifact.

The named rejections in DEC-054 are reaffirmed by reference (not restated
here): (a) shortening the momentum lookback, (b) RSI / overbought-style
exhaustion timers, (c) 52-week-high proximity filter on longs, (d) the "audit
Signal #9 residual-reversal before R1" gate — REJECTED AS FACTUALLY VOID. See
DEC-054 for full rationale.

## 6. §10.14.4 Magnitude Context (Cross-Reference, Not Re-Decision)

CROSSWIND §10.14.4 enumerates ROI levers with explicit magnitude estimates;
they live outside the DEC-054 / DEC-048 / DEC-059 surface and are recorded
here only to keep the framing complete. Numbers are the spec's own estimates.

| Lever | Spec class | Estimate (spec) | Status |
|---|---|---|---|
| **Tax structure** | After-tax ROI | Largest after-tax lever per §10.14.4 | OUT OF SCOPE — CPA-in-the-loop |
| **Parallel strategies** | Risk-adjusted ROI | Best non-leveraged ROI lever per §10.14.4 | Future scope; non-trivial; out of current execution surface |
| **Leverage** | Capital-efficiency | Most extreme amplifier; gated on 1× validation | OUT OF SCOPE — gated on Phase-7 + Phase-8 1× evidence |

These three levers are deliberately out of the four-tier sort above because they
are not engineering levers — they are capital / structural decisions whose
correct review surface is quant + CPA-in-the-loop, not supervisor + executor
alone.

## 7. Tracking Gaps Surfaced at Authoring

Authoring this artifact surfaced two tracking gaps registered in the same
commit (registration does **not** authorize the builds):

- **DW-136 — SHAP attribution write path** (newly registered). No DW existed
  for the SHAP measurement-prerequisite; only the §6.5.6 spec anchor and
  DW-102 (mis-citation correction). Registered as a measurement-prerequisite
  DW, future-owner-phase pre-Phase-7. A future FP authors the build after its
  own pre-build investigation.
- **DW-101 regime-label scope-check note** (flag only; DW-101's authorized
  scope is **not** expanded by this artifact). DW-101 covers "R4 market-index/
  SPY regime fetcher + jsonb feature columns consumed by LambdaRank." It does
  **not** explicitly cover the productized regime-label artifact consumable by
  R7 drawdown gross-scaling or crash-state downweighting. The delta may need
  its own DW; raised as a flag for operator triage, not as a DW-101 scope
  change.

## 8. Caveat — Where This Artifact Stops

This artifact keeps the roadmap honest: which levers are real, which are
documented-but-blocked, and which require measurement infrastructure we do not
have. It does not give portfolio advice, capital-deployment advice, leverage
advice, or tax advice. Capital / leverage / tax-structure decisions require
quant + CPA-in-the-loop and are explicitly out of scope of the supervisor +
executor surface that authors this document. When those decisions are made,
they should be made against the actual state recorded here, not against a
half-remembered version of it.

## 9. Cross-References

- **Authoritative decisions:** DEC-054 (R1-R7 enhancement roadmap + named
  rejections); DEC-048 (cadence is config; Phase-7 measures and locks);
  DEC-059 (pre-registered DW-109 promotion rule); DEC-060 (short-interest
  carry-forward / DW-106 heal).
- **Tracking entries:** DW-106 (coverage-heal in flight); DW-109 (gate →
  shrinkage, ROI-CRITICAL); DW-101 (R4 regime fetcher; scope-check note at
  §7); DW-135 (cross-source open reconcile; promotes decay rows to `success`);
  DW-136 (SHAP attribution measurement prerequisite; registered at this ACT).
- **Spec anchors:** §16 (v2 deferrals); §10.14.4 (ROI lever magnitudes);
  §4.1 (signal-level evidence capture); §4.2 (overfitting discipline);
  §6.5.6 (SHAP attribution site).
- **Module anchors:** `docs/04-modules/longshort/longshort.md` Signal-Stack
  Enhancement Phase Ladder section (DEC-054 / FP-046).
- **Authoring record:** ACT-280 (this commit); ACT-279 (decay instrument
  landing, the Tier-2 cadence measurement instrument cited at §2.2 / §4).