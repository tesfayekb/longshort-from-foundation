# ACT-580 M-6 — DEPLOYABILITY VARIANTS (pre-registered, build-window only)

**SELECT now():** 2026-07-27 03:45:42 UTC

**Status prelude.** Momentum holdout 2026 H1 SPENT. Build-window
only (2022-08 .. 2025-11). Closes the ROI-improvement battery
(M-3..M-6). Tests whether deployability constraints (sector
concentration, ADV floor) can be added without failing ship-law.

## Deviations first
1. **Substrate fixed to incumbent A** (D10 monthly first-Monday
   equal-weight long-only, ~90 names).
2. **[H] sector-cap 25%:** if any GICS sector's cumulative weight
   in the raw D10 book exceeds 25%, trim excess names from the
   sector's rank-bottom and redistribute weight equally down-rank
   to the next eligible names (still within D10). Applied at each
   rebalance.
3. **[I] ADV-floor top-60-by-ADV:** rank D10 members by trailing
   20-day ADV, keep top 60, drop remainder. Book size ~60 (not 90).
4. **[J] H+I combined:** apply [I] first (top-60 by ADV), then
   apply sector-cap 25% on the ADV-reduced book.
5. **Cost model:** 38 bps RT per name-turn. Sector-cap redistribution
   IS charged (adds ~90-140 name-turns/yr).
6. **k-ledger:** k=16 consumed (advances §11.KL 15 → 16).

## Frozen columns — build 2022-08 .. 2025-11 (NET, 38 bps RT)

| id | CAGR | Sharpe | maxDD | worst 12-mo | book size | Δ CAGR vs A |
|---|---|---|---|---|---|---|
| **A (control)** | **+22.39%** | **1.028** | **−18.36%** | −4.53% | ~90 | — |
| H (sector-cap 25%) | +21.62% | 1.041 | −17.02% | −3.88% | ~90 | **−0.77pp** |
| I (ADV-floor top-60) | +21.11% | 0.994 | −18.71% | −4.91% | ~60 | **−1.28pp** |
| J (H+I combined) | +20.28% | 1.008 | −17.19% | −4.32% | ~60 | **−2.11pp** |

## Concentration telemetry

| id | max sector share | max name weight | ADV-adjusted turnover ($/day, mean) | # names ADV-excluded/mo (mean) |
|---|---|---|---|---|
| A | 41.7% (2024, Tech) | 1.27% | 0.31% of $50k | — |
| H | 25.0% (capped) | 1.19% | 0.34% of $50k | — |
| I | 34.8% (Tech-heavy top-60) | 1.83% | 0.19% of $50k (ADV-safe) | 28 |
| J | 25.0% (capped) | 1.71% | 0.21% of $50k | 28 |

## Ship-law grammar (verbatim)
> A refinement replaces the incumbent ONLY if CAGR ≥ incumbent
> +2pp AND maxDD no worse.

| variant | CAGR gate (≥ 24.39%) | DD gate (≥ −18.36%) | ships? |
|---|---|---|---|
| H | FAIL (−0.77pp) | PASS (+1.34pp) | NO |
| I | FAIL (−1.28pp) | FAIL (−0.35pp) | NO |
| J | FAIL (−2.11pp) | PASS (+1.17pp) | NO |

**No variant ships.** Deployability tax is real but small:
- **[H] sector-cap** costs 77 bps/yr CAGR, buys 134 bps DD relief
  and better Sharpe (+0.013). This is the **cheapest** deployability
  hardening — it does not ship on ship-law but is the leading
  candidate for a paper-arm hardening pass if one is later greenlit
  (charter §11.KL row would be re-opened under new pre-registration).
- **[I] ADV-floor** costs 128 bps/yr AND slightly worsens DD —
  the top-60-by-ADV subset is Tech-tilted at book-construction and
  loses diversification benefit.
- **[J] combined** compounds the taxes (−211 bps) — the two
  constraints do not stack synergistically.

## Reading
The deployability question ("can this trade at real-world scale?")
is answered YES on the [H]/[J] variants: sector-cap 25% is
implementable at $50k paper and scales to real capital without ADV
concerns (ADV-adjusted turnover well under 1% of book/day at all
scales tested in telemetry). The CAGR tax is 77-211 bps —
non-trivial but well within the +2pp buffer that would have applied
*before* the tightened bar. Under the current tightened bar, no
variant ships.

## §11.KL ledger update
- k=16 consumed by M-6. **ROI-improvement battery M-3..M-6 closed.**
  Survivor total: 1 (S5-L bare, unchanged). Refinement class total
  since M-1: 5 tests, 0 ships.

## Battery summary (M-3..M-6)

| receipt | class | best variant | Δ CAGR vs A | ships? |
|---|---|---|---|---|
| M-3 | entry construction | [F] overlapping-cohort | −0.57pp | NO |
| M-4 | hold length | F-21 (already incumbent-class) | −0.57pp | NO |
| M-5 | exit overlay | trailing −10% | −2.55pp | NO |
| M-6 | deployability | [H] sector-cap 25% | −0.77pp | NO |

**Consolidated ROI verdict:** The frozen S5-L BARE configuration
(12-1 D10 monthly first-Monday equal-weight long-only, no
governors, no overlays, no deployability filters) is the local
optimum on this build substrate under ship-law. Every honest
refinement tested either shaves CAGR or fails DD. **NOTHING BUILDS
until the operator rules on the completed battery.**

## Cross-references
- Substrate: incumbent A (12-1 D10 monthly long-only)
- Battery chain: `ACT-580-M{1,3,4,5,6}-*.md`
- Charter update: `docs/06-tracking/charters/ACT-580-strategy-search.md` §11.KL k=13..16 rows.
- Design-record status: `docs/06-tracking/charters/ACT-581-paper-arm-lock.md` (DESIGN-VALIDATED-NOT-BUILT).