# ACT-502 — Exit-timing / Same-Session Recycling Study (CHARTER)

> **Owner:** Overshoot strategy | **Filed:** 2026-07-11 (operator-directed, promoted from W5 candidate #4)
> **Mode:** INVESTIGATION only — NO engine changes | **Queue position:** AFTER ACT-500 Part 2, BEFORE Track B F2–F13

## Purpose

Price the swap between the current exit discipline and a same-session recycling variant, using the ratified study
corpus (`overshoot_study_candidate_events` joined with `overshoot_daily_bars`) so the answer is comparable to the
ACT-500 Part 1 Option-A sim already banked in the DEC record.

**Current baseline (ratified):** LONG exit at day-10 (T+10) **CLOSE**; replacement lot entered on the **next
morning open** (T+11 open). One overnight of idle capital between exit and replacement.

**Proposed swap:** LONG exit at day-10 **OPEN**; replacement top-5-ranked entry filled the **same morning**
(T+10 open). Zero overnight of idle capital. Exit basis shifts by one bar (close→open) and one calendar step
(T+10 close → T+10 open).

## Deliverables (in a single results artifact)

### (a) Forfeited leg — marginal `close(T+9) → close(T+10)` return distribution, per tier
Per-lot marginal return of the last held day, keyed by tier (T1/T2). Expected to be the SMALLEST of the 10-day
hold by rank-decay logic. Report mean, median, p25, p75, stdev, and per-tier N. This is the return you give up
by exiting at the day-10 open instead of the day-10 close.

### (b) Gained leg — day-1 return of a fresh top-5-ranked entry (open→next-close), plus the eliminated idle overnight
Two components summed:
 1. **Fresh-entry day-1 return** — `close(T+1) / open(T)` − 1 for arrivals that would rank in the top-5 on
    admission at T (the T+10 morning becomes T=0 of the new lot). Expected the LARGEST of the hold horizon by
    rank-decay logic.
 2. **Eliminated overnight** — the idle `close(T+10) → open(T+11)` gap that current discipline sits through in
    cash. Sign is ambiguous per-day but the *elimination* removes an uncompensated overnight of risk-of-nothing.

### (c) Net per cycle in bps + annualized at K=5 turnover
`net_cycle_bps = (gained_leg_bps) − (forfeited_leg_bps)`. Annualized to K=5/day daily entry budget with the
standing ROI directive: `annual_bps = net_cycle_bps × (K × cycles_per_year / K_baseline_cycles)`. State the
turnover arithmetic explicitly in the results header; do NOT hand-wave.

### (d) Honest caveats (pre-committed, filed before compute)
 1. **Exit-basis shift.** Study corpus prices close-to-close by construction; the proposed swap prices
    open-to-open. This is the same discipline as the parked pre-close-entry study — pre-commit the threshold
    BEFORE looking at the numbers, or the shift becomes a data-mined artifact.
 2. **Execution sequencing dependency.** Morning exit fills must confirm before the replacement lot is sized;
    a partial-fill or MOO reject on the exit side means the replacement cannot be entered at the same open
    without breaching the aggregate allocation cap. The sim MUST assume perfect sequencing and stamp that
    assumption; live implementation would need a broker-confirmed sequencing gate that this study does NOT
    design.
 3. **Open-print quality.** Overshoot names are microcap-adjacent; the T+10 open print carries wider spreads
    than the close print used by the ratified corpus. Slippage haircut applied in the sim MUST be at least the
    close-print haircut used by ACT-500 Part 1, and preferably a documented upward adjustment for open-print
    execution.
 4. **No entry-side selection bias.** The fresh top-5 pool at T+10 morning is the SAME pool the ACT-500 Part 1
    Option-A sim admitted under K=5; this study MUST reuse that admission function unchanged, not a re-tuned
    one, or (a)/(b) are not comparable.
 5. **Study-vs-live population gap.** Legacy-50 smoothing (ACT-493 Option B) is priced INSIDE ACT-500 Part 1
    and MUST be priced INSIDE this sim too, or the transition cost of adoption is hidden.

### (e) DEC-input table + PRE-COMMITTED GO BAR
Table columns: `variant`, `forfeited_leg_bps_mean`, `gained_leg_bps_mean`, `net_cycle_bps`, `annualized_bps_at_K5`,
`stdev_cycle_bps`, `n_cycles`, `pass_go_bar`.

**Pre-committed GO bar (stated BEFORE compute, per operator-directed discipline):**
 - **GO** if `net_cycle_bps ≥ +8 bps` AND lower 90% CI of `net_cycle_bps > 0` AND `n_cycles ≥ 200`.
 - **NO-GO** if `net_cycle_bps < +8 bps` OR any CI band spans zero OR sequencing caveat (d)(2) is judged
   materially unmanageable in live ops.
 - **DEFER** (rare) if `n_cycles < 200` — insufficient corpus, expand the horizon before deciding.

The 8 bps floor is set to cover expected open-print slippage (~4–5 bps) plus a margin of safety before the
swap earns its complexity budget. Stated BEFORE compute per pre-commitment discipline.

## Scope guardrails

- INVESTIGATION only. No changes to `overshoot-exit-run`, `overshoot-entry-run`, or the entry/exit engines.
- No new tables, no new artifacts beyond the results file.
- Read-only against `overshoot_study_candidate_events` + `overshoot_daily_bars`; no touches to live `overshoot_lots`.
- Sim harness is Python (parity with ACT-500 Part 1 Option-A), NOT a partial run of the ratified permanent
  harness (that is W5-01 — Option-C, deferred).

## Sequencing

1. ACT-500 Part 2 (ranking integrity review, version/capacity-era segmentation) delivers.
2. ACT-502 runs, produces DEC-input table + honest caveats.
3. Operator issues DEC ruling (GO / NO-GO / DEFER against the pre-committed bar).
4. IF GO: charter follow-on ACT for engine wiring (exit-open + morning-recycle sequencing gate) — NOT part
   of this charter.

## Related

- `docs/08-planning/artifacts/ACT-500-PART1-OPTION-A-RESULTS.md` (methodology parent — reuse admission function)
- `docs/08-planning/overshoot-master-plan.md` §Phase 10 (W5 Measurement) — parent phase
- `docs/08-planning/artifacts/ACT-500-PART2-RANKING-INTEGRITY.md` (predecessor in queue)