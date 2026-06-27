# Signal ROI Audit — Findings Ledger

> **Owner:** longshort strategy module | **Scope:** rolling per-signal audit of the 9 CROSSWIND signals for ROI-optimality, edge-survival, and construction correctness. | **Started:** 2026-06-30 (signals #6 + #2). | **Status:** in-progress. | **Authority:** operator-directed audit ("excellent ROI per signal, avoid any losing signal"). | **Discipline:** literature-cited only; NO fabricated edge/Sharpe numbers on our universe (Phase-7/FP-058 measures); NO signal-compute change made under audit — promotable findings charter as Phase-7 DWs (see `docs/08-planning/deferred-work-register.md`). | **Audit order (strongest-edge-first):** #6 momentum → #2 PEAD → #5 short-interest → #7 reversal → #1 analyst → #4 insider → #8 news → #9 catalyst → #3 options-flow.

## Audit conventions

- One audit pass per signal, 5 lenses: (1) economic hypothesis, (2) code construction, (3) decay / cadence, (4) failure path / typed-absence, (5) ROI risks.
- Per-signal verdict is one of: **spec-correct (no now-change)** / **spec-correct + Phase-7 ablation chartered** / **construction-bug → fix FP authored** / **edge-dead → cut FP authored**.
- All Phase-7 ablation findings home under FP-058 (Phase-7 measure-and-lock); see register entries DW-169 … DW-172 as the precedent template.
- Anti-fabrication: any claim of edge size on OUR universe is forbidden. Literature claims cite paper + year; their results are on their universes, not ours.

## #6 Cross-sectional momentum (12-1) — audited 2026-06-30 (HEAD `1ce89c85`)

**Verdict:** spec-correct baseline (NO now-change to `compute-momentum.ts`) + TWO Phase-7 ablations chartered (one risk-layer, one signal-level).

**One-liner:** raw 12-1 is the spec-correct §4.4.1 baseline; the real ROI levers are (i) a portfolio-vol-target risk-layer overlay [STRONG literature consensus — Barroso/Santa-Clara 2015, Daniel/Moskowitz 2016] and (ii) a residual-momentum signal-level Phase-7 ablation [MODERATE literature — Blitz/Huij/Martens]; per-name σ-divide is the WEAK signal-level candidate and likely double-counts with the regime feature + the vol overlay. Not a now-change — momentum is a CRITICAL §4.3.5 signal and the changes are Phase-7 ablations or risk-layer overlays, not code edits today.

**Charters:**
- **DW-169** — Momentum risk-layer portfolio-vol-target overlay (the strong-conviction win; risk-layer, NOT signal-change; double-counting axis is `market_realized_vol_6m` regime feature per DEC-066 §c).
- **DW-170** — Momentum signal-level construction ablation (Phase-7 shadow variants: raw 12-1 [keep as baseline] vs σ-divide [weak] vs residual [moderate, stronger candidate]); sequence AFTER DW-169 to size residual benefit.

**What was NOT chartered (and why):**
- A now-change to `compute-momentum.ts`: STOP — § ROI guardrails forbid silent signal mutation; §4.4.1 is CRITICAL; promotion requires a DEC and Phase-7 measurement.
- A fabricated Sharpe number on our universe: STOP — anti-fabrication discipline.
- A "cut momentum" verdict: STOP — momentum is the spec-correct backbone; the question is whether to LAYER on it, not whether to keep it.

## #2 PEAD (SUE × exp(−t_d/20)) — audited 2026-06-30 (HEAD `1ce89c85`)

**Verdict:** spec-correct + TWO Phase-7 ablations chartered (one σ_proxy standardization, one consensus-snapshot capture as zero-cost forward action).

**One-liner:** PEAD's STANDALONE edge in a liquid universe is, on the public record, close to dead (Chordia/Goyal/Sadka/Sadka/Shivakumar 2009 *FAJ* — "PEAD occurs mainly in highly illiquid stocks"; ~0.04%/month in the most-liquid quintile; secular decline). PEAD earns its seat as a COMBINER FEATURE / short-side risk-gate, NOT a standalone strategy. The highest-leverage correctable issue is the σ_proxy standardization shape (current analyst-dispersion-range from Finnhub epsHigh/epsLow vs the canonical Bernard-Thomas own-firm-time-series SUE std — the classic and stronger denominator; Cheong-Thomas 2011 documents the range variant's poor cross-firm-size scaling). The walk-down dampening (using T-0 frozen consensus that has already walked toward the true number) is second-order; mitigation requires our own T-0 snapshot series, which doesn't exist today — zero-cost to start storing now.

**Charters:**
- **DW-171** — PEAD σ_proxy standardization ablation (two-way ONLY: range vs own-firm-time-series — anti-phantom CORRECTION: a cross-sectional-σ "cheap fix" is NOT available; Finnhub returns ONLY epsAvg/epsHigh/epsLow/numberAnalysts, NOT individual estimates, so a true panel std cannot be computed — the range IS the best-available dispersion proxy; future investigators MUST confirm the endpoint contract before chartering a third "cross-sectional std" variant — it would be a phantom).
- **DW-172** — PEAD T-0 consensus snapshot capture (zero-cost forward action; LOW priority; build-now-vs-defer is operator's call; if not started now, Phase-7 walk-down ablation is delayed ~3 months while snapshots accrue).

**What was NOT chartered (and why):**
- A now-change to `compute-pead.ts`: STOP — §4.4.6 is CRITICAL; promotion requires a DEC and Phase-7 measurement.
- A cross-sectional-σ "cheap fix" using individual analyst estimates: STOP — the data does not exist (Finnhub panel-summary endpoint, not individual estimates); chartering it would assert against a phantom field (same anti-phantom class as the SI `si_pct_float` phantom CORRECTED at FP-041 addendum).
- A "cut PEAD" verdict: STOP — PEAD's combiner-feature value is a Phase-7 measurement question (FP-058); do NOT cut pre-measurement; do NOT expect standalone weight.
- A fabricated edge/Sharpe number on our universe: STOP — anti-fabrication.

## #5 Short-interest-change (ΔSI, 30d) — audited 2026-06-30 (HEAD `635c1924`)

**Verdict:** spec-correct baseline (NO now-change to `compute-short-interest-change.ts`) + THREE Phase-7 charters (one of them — the shadow stand-up — is **WEEKEND-BUILDABLE** to start the measurement clock now on free data).

**One-liner:** the SI literature locates the predictive edge primarily in the LEVEL (Asquith/Pathak/Ritter 2005 *JFE* ≈ −2.15%/mo top-decile-shorted-low-IO; Boehmer/Jones/Zhang 2008 *JF* ≈ 1.16%/mo shorting-flow level) and ESPECIALLY in days-to-cover (Hong/Li/Ni/Scheinkman/Yan 2016 *JFE* canonical DTC > SI% result, ≈ 1.2%/mo), NOT in the change; our #5 is built on the weaker, more lag-sensitive CHANGE dimension; the stronger alpha (DTC) is already computed in our system but spent ONLY on risk (the DW-165 squeeze screen); DW-173 stands up the level/DTC shadow variant THIS WEEKEND via the §6.5 harness so it accrues free comparison data now (promotion decision Phase-7-gated under FP-058 — no model / no labels yet); the squeeze stack composes correctly (alpha proposes, screen disposes; no path lets alpha override the screen — a GME-class name is ranked-short by #5 but hard-excluded by DW-165); the daily-SI vendor procurement (DW-174) is deferred until the free ablation runs (no point de-lagging the CHANGE dimension if level/DTC dominates it).

**Charters:**
- **DW-173** — SI level / DTC as-alpha SHADOW variant. **WEEKEND-BUILDABLE shadow stand-up** (cheap: existing fetcher + existing DTC column from MIG-131 + existing §6.5 harness; ZERO change to live #5 / live ranker / squeeze screen). PROMOTION (replace ΔSI / stack / keep) stays Phase-7-gated with the ex-ante rule pinned now to avoid p-hacking: level/DTC beats ΔSI beyond NDCG@25 noise band → replace; both carry independent edge → stack; else keep ΔSI.
- **DW-174** — Daily-SI vendor procurement charter (S3 / Ortex / S&P-Astec). Sister to DW-166. SEQUENCED AFTER DW-173 (the lag damages the CHANGE dimension most; if level/DTC dominates, de-lagging the CHANGE is the wrong spend). Pre-live nice-to-have, NOT a blocker.
- **DW-175** — Phase-7 orthogonality (rank correlation ΔSI vs level/DTC → informs combiner regularization + stack-vs-replace shape) + DTC = 7 squeeze-gate sensitivity probe (alpha is continuous, gate is binary; informs soft-penalty vs hard-exclude — MEASUREMENT ONLY, does NOT loosen the screen).

**Squeeze-composition confirmation (no fix required):** the composition between Signal #5 alpha and the DW-165 DTC ≥ 7 squeeze screen is CORRECT — alpha proposes (ranks), risk disposes (PreflightComposer hard planner-reject AFTER the rank); risk wins on its axis; the screen is a HARD gate, not a soft penalty. The DTC = 7 binary-vs-continuous seam → DW-175 sensitivity probe (Phase-7 measurement, not a now-change).

**What was NOT chartered (and why):**
- A now-change to `compute-short-interest-change.ts`: STOP — §4.4 Signal #5 is CRITICAL §4.3.5; promoting level/DTC pre-data is the fabricate-a-candidate anti-pattern FP-057 Sub-step 6 closed against.
- A "cut #5" verdict: STOP — ΔSI may still carry independent edge as a stacked combiner feature; the FP-058 ablation answers this; do NOT cut pre-measurement.
- Loosening the DW-165 DTC = 7 squeeze screen: STOP — the composition is correct; only the gate-shape sensitivity is a Phase-7 PROBE (DW-175), not a now-change.
- A fabricated edge/Sharpe number on our universe: STOP — anti-fabrication.

## Weekend build list (shadow stand-ups + zero-cost forward actions surfaced by the audit)

The audit is surfacing a cluster of CHEAP, scope-disciplined items that can be stood up THIS WEEKEND to start accruing free comparison data / forward-action data — the PROMOTION decisions stay Phase-7-gated under FP-058. Operator intent (per this turn's framing): finish the full 9-signal audit first, then execute the weekend-buildable set together as one focused build.

| DW | Title | Buildable now? | Why now is cheap | Why promotion is deferred |
|---|---|---|---|---|
| **DW-170** | Momentum signal-level shadow variants (σ-divide, residual-momentum) | YES — shadow stand-up | §6.5 harness exists; raw 12-1 baseline kept; variants compute alongside | Promotion would mutate CRITICAL §4.4.1 → DEC + Phase-7 measurement |
| **DW-171** | PEAD classic-own-firm-SUE σ_proxy variant | **ACCRUAL-GATED** (NOT weekend) — needs ≥ 8 quarters of per-name actual/consensus pairs in `signal_observations` before std is stable | The compute path is cheap once data accrues; shadow stand-up is meaningful only after 8q | Promotion mutates CRITICAL §4.4.6 → DEC + Phase-7 measurement |
| **DW-172** | PEAD T-0 consensus snapshot capture | YES — zero-cost forward action (new table + writer + pre-RTH cron via existing fetcher) | Vendor backfill impossible; cost of NOT starting now is ~3-month delay on Phase-7 walk-down ablation | The walk-down ablation itself is Phase-7 |
| **DW-173** | SI level / DTC as-alpha shadow variant | YES — shadow stand-up | Existing fetcher + existing DTC column (MIG-131) + existing §6.5 harness; the data is already in the system | Promotion mutates CRITICAL Signal #5 → DEC + Phase-7 measurement |

Sequencing intent: execute the weekend-buildable rows (DW-170 + DW-172 + DW-173 — DW-171 stays accrual-gated) AFTER the remaining audits (#7, #1, #4, #8, #9, #3) complete, as one combined scope-disciplined PR per the operator's "review all first, then build together" framing. New weekend-buildable findings from the pending audits will land in this table as they're surfaced.

**Anti-completion-theater note:** these shadow stand-ups are NOT promotions and do NOT change the live ranker / live execution / live PnL — they create the comparator series that Phase-7 (FP-058) requires to make a measured promotion decision instead of a fabricated one.

## Signals pending audit (in order)

- **#7 short-term reversal** — next.
- **#1 analyst revisions**.
- **#4 insider transactions**.
- **#8 news sentiment**.
- **#9 catalyst tiering**.
- **#3 options-flow**.

## Cross-references

- Deferred-work register: `docs/08-planning/deferred-work-register.md` (DW-169 … DW-175 as of this writing).
- Phase-7 measure-and-lock home: `docs/08-planning/feature-proposals.md` → FP-058.
- Audit-action records: `docs/06-tracking/action-tracker.md` → ACT-350 (ledger creation + #6/#2 findings); **ACT-351** (#5 findings + DW-173/174/175 + weekend-build-list section).
- Authoritative signal specs: `docs/04-modules/longshort/design-source/` (CROSSWIND v0.9 — never edit).