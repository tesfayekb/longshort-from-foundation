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

## Signals pending audit (in order)

- **#5 short-interest-change (30d)** — next.
- **#7 short-term reversal**.
- **#1 analyst revisions**.
- **#4 insider transactions**.
- **#8 news sentiment**.
- **#9 catalyst tiering**.
- **#3 options-flow**.

## Cross-references

- Deferred-work register: `docs/08-planning/deferred-work-register.md` (DW-169 … DW-172 as of this writing).
- Phase-7 measure-and-lock home: `docs/08-planning/feature-proposals.md` → FP-058.
- Audit-action records: `docs/06-tracking/action-tracker.md` → ACT-350 (this ledger's creation + #6/#2 findings registration).
- Authoritative signal specs: `docs/04-modules/longshort/design-source/` (CROSSWIND v0.9 — never edit).