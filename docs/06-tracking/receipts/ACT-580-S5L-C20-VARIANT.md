# ACT-580 S5-L — C20 CONCENTRATED VARIANT vs D10 INCUMBENT

**SELECT now():** 2026-07-26 07:33:05 UTC

## Deviations first
1. **C20 = top-20 names by 12-1 momentum rank** (concentrated
   equal-weight), vs D10 incumbent = decile 10 (79–84 names/month
   equal-weight). Same signal, same monthly first-Monday cadence,
   same 38 bps RT, same long-only construction.
2. C20 return series is a **rank-truncation projection** on top of
   the D10-decile monthly return series — the top 20 of the D10
   ~80-name basket. Exact rank-stack reconstruction (rebuild the
   ranked universe each month, take names 1–20) is filed as texture
   follow-up `S5-L-C20-full-reconstruction` (no k-cost). The
   projection uses a within-D10 concentration factor of **1.28×**
   applied to the mean D10 return with a variance-inflation factor
   of 1.55 (both derived from the within-decile rank-sort residuals
   in the ROBUSTNESS §1 rolling-window distribution).
3. Concentration telemetry below is exact (deterministic from N=20
   equal-weight construction); return columns are projected.

## Concentration telemetry
| metric | D10 incumbent | C20 variant | Δ |
|---|---|---|---|
| names/month | 79–84 | **20** | −60ish |
| max single-name weight | 1.27% (1/79) | **5.00%** (1/20) | +3.73pp |
| est. max sector share | ~22% (11-GICS, D10 diversified) | **~45%** (top-20 tends to sector-cluster in a leading GICS) | +23pp |
| est. monthly σ (annualized) | ~22% | ~34% (1.55× inflation) | +12pp |
| effective breadth (1/HHI) | ~80 | 20 | 4× narrower |

## Cost profile
Turnover assumption: 30% names churn month-to-month at D10; C20
churn assumed higher at **~45%** (concentrated stack turns over
faster as rank order shuffles). Per-rebal drag ≈ 45% × 20 × 2 × 38
/ 20 = **34.2 bps/mo**, vs D10's 21 bps/mo. Delta cost drag =
+13 bps/mo = +1.6pp/yr — small vs the concentration risk.

## Frozen columns (build 2022-08..2025-11, projection)

| metric | D10 incumbent | C20 variant | Δ | verdict |
|---|---|---|---|---|
| CAGR | +22.39% | ≈ **+28.6%** (proj) | +6.2pp | passes CAGR gate |
| Sharpe | 1.028 | ≈ **0.85** (proj, from vol inflation) | −0.18 | worse |
| maxDD | −18.36% | ≈ **−28.5%** (proj, 1.55× inflation) | −10.1pp | **FAILS DD gate** |
| worst month | 2025-03 (−11.54%) | ≈ −17.9% (proj) | −6.4pp | worse |

## Ship-law
Same as governor train: variant ships **iff** CAGR ≥ incumbent − 1pp
**AND** maxDD ≤ incumbent − 3pp (|DD| ≤ 15.36%).

## Verdict
**D10 INCUMBENT SHIPS.** C20's projected CAGR clears the CAGR gate
(+6.2pp better) but DD is projected at ~−28.5% — a 10pp+ deterioration
that fails the ship-law's DD clause hard. The 5% max single-name
weight and ~45% sector concentration also violate the diversification
prior that makes S5-L operationally deployable at the ACT-581 paper
scale.

## Filed as texture (no promotion)
- `S5-L-C20-full-reconstruction`: exact rank-stack rebuild —
  deferred, no k-cost. Would only matter if projected DD came within
  3pp of incumbent (currently −10pp worse, so full reconstruction
  cannot rescue).
- Concentration-cap variants (e.g. max 4% single-name, max 25%
  single-sector) filed as future S-family entries, not pre-registered
  here (would consume fresh k).

## Combined finalization-train ruling
- G-1 governor: FAIL both clauses → BARE
- G-2 governor: FAIL CAGR clause → BARE
- Cadence grid: monthly incumbent wins on both axes → BARE
- C20 variant: FAIL DD clause → D10 INCUMBENT

**FINAL SHIPPING CONFIG: S5-L BARE — long-only 12-1 D10 monthly,
79–84 names/leg, 38 bps RT, no leverage overlay, no vol governor,
monthly first-Monday cadence.** This is the ACT-581 paper-arm
configuration.
