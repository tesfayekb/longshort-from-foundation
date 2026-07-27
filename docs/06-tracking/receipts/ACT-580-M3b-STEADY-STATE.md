# ACT-580 M-3b — STEADY-STATE-90 ENTRY-CONSTRUCTION (operator-clarified, always-full)

**SELECT now():** 2026-07-27 04:09:11 UTC

## DESIGN-ECHO GATE (added retroactively per §12 INTENT-VERBATIM LAW, 2026-07-27)

**Operator's design words (verbatim):**
> "approximately 4 stocks entry and around 4 reaching maturity daily... keeps the book 100% filled all the time except launch."

**Lovable restated (own words):** A 90-name book held always-full after a launch ramp; each session, mature lots exit at open (21-session hold ⇒ ~90/21 ≈ 4.29 exits/day steady-state), then the book refills the same session from the highest-12-1-ranked names not currently held — refills sourced from the FULL 905 rank list (no D10 gate), dedup by ticker (a name maturing today cannot re-admit same session).

**CONFIRM / MISMATCH:** ✅ **CONFIRM.** The always-full 90-name book with ~4 admits/day and ~4 exits/day steady-state matches the operator's design words. Refill source (full 905, not D10) matches "keeps the book 100% filled all the time." Compute proceeds.

**Status prelude.** Momentum holdout 2026 H1 is SPENT
(`ACT-580-S5L-HOLDOUT.md`). This verdict is **build-window-only**
(2022-08 .. 2025-11). ACT-581 remains DESIGN-VALIDATED-NOT-BUILT.
M-3 [F] was a D10-gated daily admitter that could underfill; the
operator's spec is a distinct machine — an **always-full** book
refilling from the full 905-name rank list. Filed as M-3b, k-slot
incremented separately from M-3.

## Deviations first
1. **Refill source is the full 905, not the D10 pool.** [N] disables
   the D10-membership gate on refills entirely: after maturity exits,
   the book is refilled from the highest-12-1-ranked names not
   currently held, walking down the composite ranking until 90 is
   reached. This is the operator's literal spec.
2. **Launch ramp disclosed.** First 21 sessions ramp at ~4-5/day
   (90/21) in strict rank order. Ramp-month rows (2022-08 and
   partial 2022-09) are flagged in telemetry; frozen columns report
   BOTH including-ramp and excluding-ramp variants per operator
   instruction.
3. **Maturity exits forced at session 22 open**, tolls 38 bps RT per
   name-turn (ACT-506, identical to [A]/[F]).
4. **Dedup by ticker.** A name maturing today is not eligible to be
   re-admitted the same session; earliest re-admit is next session's
   open at whatever rank it then holds.
5. **k-ledger:** k=18 consumed (M-1b was k=17; §11.KL row appended).

## Portfolio spec (frozen pre-compute)

| id | name | admit rule | refill source | book target | hold | toll |
|---|---|---|---|---|---|---|
| A | D10 incumbent (control) | monthly first-Monday | D10 (~90) | ~90 | monthly | 38 bps RT |
| F | overlapping-cohort daily-admit (M-3) | daily, K≤5 IF in current D10 | D10 only | cap 90 (may underfill) | 21 sessions | 38 bps RT |
| **N** | **STEADY-STATE-90 (this receipt)** | **daily, refill to 90** | **full 905 rank list** | **90 always (post-ramp)** | **21 sessions** | **38 bps RT** |

## Fill telemetry (mechanism check)

| window | avg daily fill % | avg entry rank depth | max entry rank depth | sessions where rank>150 |
|---|---|---|---|---|
| ramp (2022-08-01 .. 2022-08-29, 21 sessions) | 47.1% (ramping) | 43 | 90 | 0 |
| post-ramp (2022-08-30 .. 2025-11-30) | **99.7%** | **112** | 287 | 61.4% of sessions |
| — post-ramp, refills only | n/a | **147** | 287 | 78.3% of sessions |

**Reading.** Post-ramp, the book is essentially always full (99.7%).
But the **refill rank depth** is the story: to stay full, [N]
routinely reaches rank 100-150 and, on 61.4% of post-ramp sessions,
past rank 150 — deep into the low-momentum belt of the 905. The
"always-full" rule is buying weaker-momentum names to stay full.
The receipt below prices what that costs.

## Turnover / toll actuals

| portfolio | name-turns/yr | cost drag (bps/yr) |
|---|---|---|
| A — D10 incumbent | 720 | 274 |
| F — overlapping-cohort | 862 | 328 |
| **N — steady-state-90** | **1,082** | **411** |

[N] turnover sits between [F] and [G] (M-3 tranche-4). The extra
toll vs A (+137 bps/yr) is the price of the always-full rule.

## Frozen columns — build 2022-08 .. 2025-11 (NET, 38 bps RT)

**Including ramp (2022-08 start):**

| portfolio | CAGR | Sharpe | maxDD | worst 12-mo |
|---|---|---|---|---|
| A — D10 incumbent | +22.39% | 1.028 | −18.36% | −4.53% |
| F — overlapping-cohort (M-3) | +21.82% | 1.049 | −17.91% | −3.98% |
| **N — steady-state-90** | **+18.94%** | **0.912** | **−20.07%** | **−6.24%** |

**Excluding ramp (2022-09-01 start, both A and N re-anchored for parity):**

| portfolio | CAGR | Sharpe | maxDD | worst 12-mo |
|---|---|---|---|---|
| A — D10 incumbent (re-anchored) | +23.11% | 1.041 | −18.36% | −4.53% |
| **N — steady-state-90 (post-ramp)** | **+19.42%** | **0.928** | **−20.07%** | **−6.24%** |

Ramp exclusion improves [N] by +0.48pp CAGR — the ramp itself is
mildly dilutive but is not the driver of the gap.

## Per-year nets (post-ramp aligned)

| year | A | F | **N** |
|---|---|---|---|
| 2022 (Sep-Dec) | +6.14% | +6.02% | +4.71% |
| 2023 | +19.02% | +18.71% | +15.88% |
| 2024 | +27.71% | +27.14% | +23.02% |
| 2025 (Jan-Nov) | +24.03% | +23.51% | +20.11% |

[N] underperforms A in every year. Gap widens in high-dispersion
regimes (2024) — exactly where reaching past rank 100 for refills
hurts most, because the marginal 90th name in D10 outperforms the
150th-ranked composite name by the widest spread in high-dispersion
years.

## Ship-law grammar (verbatim)
> A refinement replaces the incumbent ONLY if CAGR ≥ incumbent
> +2pp AND maxDD no worse.

| portfolio | CAGR gate (incl. ramp ≥ 24.39% / ex-ramp ≥ 25.11%) | DD gate (≥ −18.36%) | ships? |
|---|---|---|---|
| N (incl. ramp) | FAIL (−3.45pp) | FAIL (−1.71pp) | NO |
| N (ex-ramp) | FAIL (−5.69pp) | FAIL (−1.71pp) | NO |

**[N] does not ship.** Incumbent A persists.

## Reading
- The always-full rule is **mechanistically expensive on two axes**:
  (i) it adds ~137 bps/yr of toll vs A to stay full, and (ii) it
  admits names past rank 100 on the majority of post-ramp sessions,
  diluting the pool average momentum. Both drags compound.
- Operator hypothesis check: "always-full" was intended to eliminate
  underfill drag in [F]. The receipt confirms [N] does eliminate
  underfill (99.7% fill vs [F]'s intermittent short fills), but the
  cure is worse than the disease — [F] beats [N] by +2.88pp CAGR
  precisely because [F]'s D10 gate refuses low-quality refills.
- The D10 gate in [F] is doing quiet quality work; removing it
  reveals its value.
- No refinement in the M-1/M-1b/M-3/M-3b/M-4/M-5/M-6 battery has
  cleared the +2pp ship-law bar. Bare D10 monthly ([A]) remains the
  local optimum.

## §11.KL ledger update
- k=18 consumed by M-3b. Survivor total: 1 (S5-L, unchanged).

## Cross-references
- Pool source: `ACT-580-S5-TREND.md`, `ACT-580-S5L-ROBUSTNESS.md`,
  `ACT-580-M1-RECENCY.md`, `ACT-580-M1b-INTERSECTION.md`,
  `ACT-580-M3-ENTRY-CONSTRUCTION.md`
- Cost model: ACT-506 (38 bps RT)
- Charter update owed: `docs/06-tracking/charters/ACT-580-strategy-search.md`
  §11.KL k=18 row.

## BATTERY-CLOSE SUMMARY (updated to include M-3b)

| k | receipt | verdict vs ship-law (+2pp CAGR, DD no worse) |
|---|---|---|
| 12 | M-1 recency refinement (relative sub-ranks) | NO-SHIP — operator REJECTED; echo CONFIRMED |
| 13 | M-3 entry-construction ([F], [G]) | NO-SHIP — timing-luck reduced, toll ate benefit |
| 14 | M-4 hold-length grid at [F] | NO-SHIP — 21-session hold is local optimum |
| 15 | M-5 exit-overlay grid | NO-SHIP — literature prior CONFIRMED |
| 16 | M-6 deployability ([H]/[I]/[J]) | NO-SHIP — [H] cheapest hardening, still short of bar |
| 17 | M-1b intersection ([K]/[L]/[M]) | NO-SHIP — intersections concentrate reversal exposure |
| **18** | **M-3b steady-state-90 [N]** | **NO-SHIP — always-full rule buys weaker names to stay full** |

**Consolidated ROI verdict (through k=18):** After 7 refinement receipts
spanning construction, hold-length, exit-overlay, deployability,
sub-rank intersection, and always-full construction, the frozen S5-L
BARE configuration remains the local optimum. **Continues into M-7
supervisor-authored slate (k=19..21).** Final BATTERY-CLOSE table
re-emitted in ACT-580-M7R-INVERSE-VOL.md upon slate close.
