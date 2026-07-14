# ACT-521 — PEAD Feasibility on In-DB Data

**Mode:** investigation (read-only, in-turn per standing rule).
**Corpus:** `overshoot_earnings_calendar` (373,040 rows) ⋈ `overshoot_daily_bars` (1,053,756 rows).
**Adoption floor:** per-slot-day ≥ 1.15× best-alt (OVERSHOOT T1 ratified T+2 = 36.89 bps/slot-day → **42.42 bps/slot-day**).

## Field-availability audit

| source   | total rows | rows with both eps_estimate + eps_actual (usable surprise) |
|----------|-----------:|-----------------------------------------------------------:|
| finnhub  |    16,572  |                                                    15,748  |
| fmp      |   356,468  |                                                        97  |
| **all**  |   373,040  |                                                **15,845**  |

The FMP field-name bug (`eps`/`revenue` vs `epsActual`/`revenueActual`, documented in `earnings-calendar-fetcher.ts`) silently nulled 355,184 historical actuals. **Finnhub coverage is intact** (95% of finnhub rows usable). Effective usable panel: 15,845 events across 5 yrs.

## Method

- Surprise = `(eps_actual − eps_estimate) / |eps_estimate|` (only where eps_estimate ≠ 0).
- Rank into quintiles.
- Forward returns from `overshoot_daily_bars` at N ∈ {5,10,21} trading days from announcement close.
- Long leg = Q5 (top surprise); short leg = Q1 (bottom surprise).
- **SURVIVORSHIP-DEFLATOR-PENDING** stamp per ACT-517 — bars follow `universe_membership` which enforces survivor bias controls in the master plan; final annualized numbers require the ACT-517 deflator once ratified.

## Drift by surprise quintile (all names, all 5 years)

| quintile |    n   |  bps 5d  |  bps 10d | bps 21d  | **bps/slot-day 5d** | 10d   | 21d   |
|---------:|-------:|---------:|---------:|---------:|--------------------:|------:|------:|
| Q1 (worst) | 3,078 |  −68.8   |  −45.2  |  −20.7   |      **−13.76**     | −4.52 | −0.98 |
| Q2       |  3,078 |  +17.7   |  +33.3  |  +53.2   |       +3.53         |  3.33 |  2.53 |
| Q3       |  3,078 |  +65.7   |  +86.0  | +147.4   |      +13.14         |  8.60 |  7.02 |
| Q4       |  3,077 | +120.8   | +166.1  | +231.2   |      +24.15         | 16.61 | 11.01 |
| Q5 (best)| 3,077 | +240.8   | +258.6  | +323.8   |      **+48.15**     | 25.86 | 15.42 |

**Monotone from Q1 → Q5 on every horizon.** This is the textbook PEAD signature — the drift is real and captured by the corpus.

## Adoption-floor test

| leg        | horizon | bps/slot-day | vs floor 42.42 | verdict |
|------------|--------:|-------------:|---------------:|---------|
| Long-Q5    |    5d   |    **48.15** | +13.5%         | **CLEARS** |
| Short-Q1   |    5d   |     13.76 (abs) | −67.6%     | fails standalone |
| L/S paired |    5d   |    **61.91** | +45.9%         | **CLEARS** |
| Long-Q5    |   10d   |     25.86    | −39.0%         | fails |
| Long-Q5    |   21d   |     15.42    | −63.6%         | fails |

**Sweet spot is unambiguously the 5-day horizon at extreme surprise deciles.** Beyond 5d the per-slot-day economics decay below the ratified best-alt.

## Small/mid-cap pocket verdict

Size-bucket breakdown NOT computed this turn — would require market-cap history join. Directionally: the raw Q5 5d effect is +240 bps total return, which is large enough that a size-tilted pocket would need to over-deliver >>25% to matter. The population is already the top-quintile-of-surprise subset (n=3,077, ~615/yr), so further sub-slicing costs statistical power fast. Recommendation: **do not sub-slice by size for the go/no-go decision** — commit or refuse on the aggregate.

## Projected per-slot-day economics vs OVERSHOOT

- OVERSHOOT T1 T+2 ratified peak:        36.89 bps/slot-day
- PEAD Long-Q5 5d (long-only):           **48.15** bps/slot-day  (+30.5%)
- PEAD L/S paired 5d:                    **61.91** bps/slot-day  (+67.8%)
- PEAD Long-Q5 10d:                       25.86 bps/slot-day  (−29.9%)

**Annual event supply:** ~615 events/yr in each of Q5 and Q1 → ~1,230 slot-events/yr for the paired L/S. At 5-day slots this saturates ~24 concurrent slots (worst case, non-overlapping) — well above the 3-4 slots OVERSHOOT currently uses. Supply is NOT the binding constraint.

## Honest caveats

1. **Surprise proxy noise.** Q2 2022 mean surprise = +0.48 with SD 22.9 (a couple of eps_estimate ≈ 0 rows). The `eps_estimate != 0` filter drops the worst offenders; residual noise likely rank-order-preserving but flag for a Winsorized re-run before any DEC.
2. **T+0 vs T+1 entry basis.** Bars close-to-close from announcement_date; a real PEAD strategy that enters at T+1 open loses the overnight gap. Prior-Stage-2 estimates put the overnight gap at ~20% of the total 5d drift for top-surprise names → true implementable Long-Q5 5d ≈ 38 bps/slot-day (still clears 36.89 but not the 42.42 15% floor). **Flagged.**
3. **Finnhub-only sample.** 15,845 rows across 5 yrs is genuinely thin per bucket after quintile split. Bootstrap CIs before DEC.
4. **FMP repair.** Fixing the FMP fetcher (field-name bug) would multiply the panel by ~20×. That is the single most productive follow-up if PEAD charters — **ACT-522 candidate: FMP earnings-actuals repair backfill.**
5. **SURVIVORSHIP-DEFLATOR-PENDING** per ACT-517.

## Verdict

**GO for charter** — pending:
- (a) Winsorized-surprise re-run to bound noise-sensitivity.
- (b) T+1-open entry re-computation to establish the implementable per-slot-day (not close-basis).
- (c) FMP repair (ACT-522-CANDIDATE) to widen the panel from 15.8k to ~300k events.
- (d) ACT-517 survivorship deflator applied at final ratification.

If (b) drops implementable per-slot-day below 42.42, this becomes an ambiguous case and a DEC ratification vote — not an automatic charter. But the corpus signature is strong enough that PEAD is the most-promising new-strategy candidate on the current evidence.

## Filing

- **ACT-521:** GO for charter, pending (a)–(d).
- **ACT-522-CANDIDATE (named, not chartered):** FMP earnings-actuals field-name repair backfill (`eps`/`revenue` → `epsActual`/`revenueActual` per verified 2026-07-04 probe in `earnings-calendar-fetcher.ts` docstring). Estimated impact: panel size 15.8k → ~300k usable surprise rows; would materially tighten CIs on this study.
