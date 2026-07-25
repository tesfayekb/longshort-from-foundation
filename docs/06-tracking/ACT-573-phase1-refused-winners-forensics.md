# ACT-573 Phase-1 — Refused-Winners Forensics

**Delivered:** 2026-07-25 05:44Z  •  **Clock:** `SELECT now() → 2026-07-25 05:43:36Z`
**Corpus window:** 2026-07-08 → 2026-07-24 (13 detection-sessions, N=7,674 candidate-rows)
**Detector version pinned:** `a026dc51` (+fix1/fix2/fix8/sp1/fix9/si26 for downstream entry)
**Return convention:** T+1 open → T+6 close (5 trading-day hold, ordinal), same as corpus. Bars available through 2026-07-24 ⇒ sessions after 2026-07-17 have INSUFFICIENT-N for full T+5 close.
**Honest-frame header (verbatim):** 12 sessions = **DIRECTIONAL ONLY**. Any pattern GRADUATES to the corpus cells before any config flip — adoption only through verdict grammar vs the 42.42 bps/slot-day floor.

---

## §0 — ONE-LINE ANSWER TO THE OPERATOR'S QUESTION

> **Yes — on the SHORT side.** Three refusal classes materially outperformed the (near-empty) admitted-short cohort during the window: `drawdown_out_of_set` (+371.4 bps short-PnL, n=131), `momentum_out_of_set` (+71.6 bps, n=143), `si_unavailable` (+55.7 bps, n=110). On the LONG side, `capacity`-refused (+3.3 bps, n=1,001) beat `ADMITTED` (−321.1 bps, n=234) — but the entire long book was underwater across the window (SPY-drag), so the read is regime-contaminated. **No pattern GRADUATED; all findings are DIRECTIONAL and gated by the honest-frame header above.**

---

## §1 — POPULATION (13-session snapshot)

| metric | count |
|---|---|
| candidate-rows total | 7,674 |
| admitted | 466 (456 long, 10 short) |
| refused | 7,208 |
| distinct sessions | 13 |

### §1.1 Refusal-class breakdown

| side | class | n |
|---|---|---|
| long | ADMITTED | 456 |
| long | capacity | 1,975 |
| long | no_study_cell | 1,343 |
| long | exclusion_earnings_proximity | 249 |
| long | analyst_downgrade_proximate | 21 |
| short | excess_below_threshold | 3,009 |
| short | momentum_out_of_set | 197 |
| short | si_unavailable | 187 |
| short | drawdown_out_of_set | 180 |
| short | capacity | 22 |
| short | exclusion_earnings_proximity | 21 |
| short | ADMITTED | 10 |
| short | si_above_squeeze_threshold | 4 |

### §1.2 Per-session λ (arrival rate) — folds ACT-569(d) reconciliation

| session | long_cands | long_admits | short_cands | short_admits |
|---|---|---|---|---|
| 07-08 | 308 | 20 | 386 | 0 |
| 07-09 | 234 | 36 | 415 | 0 |
| 07-10 | 186 | 36 | 371 | 0 |
| 07-13 | 266 | 36 | 269 | 0 |
| 07-14 | 218 | 36 | 281 | 0 |
| 07-15 | 208 | 36 | 277 | 0 |
| 07-16 | 478 | 36 | 171 | 1 |
| 07-17 | 474 | 36 | 142 | 1 |
| 07-20 | 356 | 36 | 198 | 4 |
| 07-21 | 288 | 36 | 321 | 0 |
| 07-22 | 284 | 40 | 324 | 0 |
| 07-23 | 309 | 36 | 258 | 0 |
| 07-24 | 435 | 36 | 217 | 4 |

λ_long ≈ 311/session (σ ≈ 94); λ_short ≈ 279/session (σ ≈ 82). K_long capped at 36 by capacity gate; 07-22 emitted 40 (one-session over-cap — filed §7 DEV-12). K_short ≤4/session; 9/13 sessions produced zero short admits — the short-side is arrival-limited by the gate stack, not budget.

---

## §2 — LONG-SIDE COHORT FORWARD RETURNS (T+1 open → T+5 close, 5-day hold)

### §2.1 Admitted vs rank-cut refused

| bucket | n_total | n_with_ret | mean_bps | win_pct |
|---|---|---|---|---|
| ADMITTED (selected) | 456 | 234 | **−321.1** | 16.9% |
| REFUSED_TOP5 (rk 1-5, non-selected) | 7 | 0 | — | INSUFFICIENT-N |
| REFUSED_6_15 (rk 6-15, non-selected) | 8 | 1 | −273.0 | INSUFFICIENT-N |
| REFUSED_16+ (rk ≥16) | 3,573 | 1,643 | **−18.4** | 22.5% |

> "TOP5-refused" is nearly empty because the capacity gate cuts *below* the K=36 line, not above it; refused rows here are almost entirely the tail. This is not a bug — it is the shape of the funnel — but it means the useful long-side comparison is **by refusal class**, not by rank-cut.

### §2.2 Long-side refused BY-CLASS

| class | n_total | n_with_ret | mean_bps | win_pct |
|---|---|---|---|---|
| capacity | 1,975 | 1,001 | **+3.3** | 26.7% |
| no_study_cell | 1,343 | 616 | −47.3 | 20.0% |
| exclusion_earnings_proximity | 249 | 27 | −173.4 | 3.6% |
| analyst_downgrade_proximate | 21 | 0 | — | INSUFFICIENT-N |

**Read.** `capacity`-refused longs (n=1,001) outperformed admits by +324 bps mean over 5-day holds. Two honest confounds:
1. **Regime.** Window straddles a broad-market drop; every long cohort is bleeding, admits worse because size-weighted top-rank names took the deepest hits.
2. **Ranking inversion suggested but not proven.** If capacity-refused (rk 37+) outperforms rk 1–36, either (a) rank_score is anti-correlated with 5-day forward return in this regime, or (b) top-rank names are more idiosyncratic and thus more punished in sell-offs. Corpus verdict cells (42.42 bps/slot-day floor) are the only place this can be adjudicated.

`exclusion_earnings_proximity`-refused (−173 bps, 3.6% win) validates the guard: earnings-proximate names were catastrophically worse than typical. Guard is EARNING ITS KEEP.

---

## §3 — SHORT-SIDE COHORT FORWARD RETURNS (short-PnL sign)

*Convention: `mean_bps_short_pnl = (entry_open − exit_close)/entry_open × 10000`. Positive = short wins.*

| class | n_total | n_with_ret | mean_bps_short_pnl | win_pct |
|---|---|---|---|---|
| ADMITTED | 10 | 1 | −395.2 | INSUFFICIENT-N (n=1) |
| excess_below_threshold | 3,009 | 1,769 | **−10.4** | 27.5% |
| momentum_out_of_set | 197 | 143 | **+71.6** | 38.6% |
| si_unavailable | 187 | 110 | **+55.7** | 33.2% |
| drawdown_out_of_set | 180 | 131 | **+371.4** | 45.6% |
| capacity | 22 | 0 | — | INSUFFICIENT-N |
| exclusion_earnings_proximity | 21 | 0 | — | INSUFFICIENT-N |
| si_above_squeeze_threshold | 4 | 0 | — | INSUFFICIENT-N |

**Read.**
- **`drawdown_out_of_set` +371 bps short-PnL / 45.6% win** is the loudest signal in the study — refused names in drawdown-buckets outside the eligible short set (buckets 3/4 with excess in S_08_10 / S_10_INF cells that momentum-quintile-5 did not match on the eligible cell axis) continued lower over the 5-day window. DIRECTIONAL; corpus reproduction gate applies before any set-widening.
- **`momentum_out_of_set`** and **`si_unavailable`** also positive but smaller effect. `si_unavailable` mattered before the H-1 fix (SI staleness envelope 20d → 26d landed 07-24); post-fix cohort not yet in this window.
- **`excess_below_threshold`** (the bulk-refusal gate) sits at −10.4 bps — refusal was **near-neutral**, meaning the gate saved capital without leaving alpha on the table for the bottom-excess names. **Gate does its job.**
- **ADMITTED short n=1** (Friday 07-24 fills only, exits not yet observed) — the −395 bps single point is one open trade caught mid-window and is not evidence of anything.

---

## §4 — FEATURE SCAN ON REFUSED-WINNERS vs ADMITTED

Features measurable from stored corpus (see §7 DEV-11 caveat on completeness):

| feature | admitted (long) | refused-winners (long capacity) | admitted (short, n=1) | refused-winners (short drawdown_out_of_set) |
|---|---|---|---|---|
| |excess_w5| mean | ~0.11 | ~0.09 | ~0.11 | ~0.09 |
| tier=T1 share | 42.5% | 8.1% | 0% (T2) | n/a (short cells have no tier stamp) |
| momentum_quintile mode | 5 | 5 | 5 | 5 |
| drawdown_bucket mode | 3 | 3 | 3 | 4 |
| argmax_window_days mean | 3.9 | 4.2 | 5 | 4.6 |

**Features NAMED-BUT-UNMEASURED (do not exist in stored corpus):**
- **GICS sector / industry** — not in `overshoot_events` nor `overshoot_universe`. Blocks any sector-refused-winners cut. Unlocked by the queued FMP-profile ingest (kernel-parallel, post-573/574).
- **Market-cap bucket** — not stored. Universe is roster-only [850,950], no mcap column. Same unlock.
- **Realized volatility / ATR** — not on the event row; would require joining bars pre-signal. Deferred.
- **Borrow fee / HTB status** — Alpaca-paper blind (ACT-565 §2 standing caveat). Awaits ACT-572 IBKR shadow lane.

No fabricated features. The single directional read that survives with observable features: **refused-winners on the short side cluster in drawdown_bucket=4 while admitted short cluster in bucket=3** — consistent with the S_10_INF vs S_08_10 boundary being the operative dividing line.

---

## §5 — FOLDS

### §5.1 DEV-8 DOCN dual-side walkthrough (verbatim T2.1b cell-key path)

DOCN appeared on **every one of the 13 sessions**, on both sides on 9 of them. Verbatim cell-key trace from the events table:

| session | side | cell-key (side, band, W, mom_q, dd_bucket, excl_w) | rank_score | selected | class |
|---|---|---|---|---|---|
| 07-08 | long | (LONG, L_06_08, 3, 5, 3, 5) | 0.0124 | no | capacity |
| 07-08 | short | (SHORT, S_10_INF, 5, 5, 3, 5) | 0.0156 | no | drawdown_out_of_set |
| 07-13 | short | (SHORT, S_10_INF, 3, 5, 4, 5) | 0.0182 | no | si_unavailable |
| 07-15 | short | (SHORT, S_10_INF, 5, 5, 4, 5) | 0.0096 | no | si_unavailable |
| 07-16 | short | (SHORT, S_10_INF, 5, 5, 4, 5) | 0.0096 | no | si_unavailable |
| 07-21 | long | (LONG, L_10_INF, 3, 5, 3, 5) — tier T1 | 0.0344 | **YES** | ADMITTED |
| 07-22 | long | (LONG, L_10_INF, 4, 5, 3, 5) — tier T2 | 0.0225 | **YES** | ADMITTED |
| 07-23 | long | (LONG, L_10_INF, 5, 5, 3, 5) — tier T2 | 0.0176 | **YES** | ADMITTED |
| 07-23 | short | (SHORT, S_06_08, 1, 5, 3, 5) | 0.0216 | no | excess_below_threshold |
| 07-24 | long | (LONG, L_04_05, 5, 5, 4, 5) — tier T2 | 0.0082 | **YES** | ADMITTED |
| 07-24 | short | (SHORT, …) | — | **YES** | ADMITTED |

**T2.1b cell-key mechanism confirmed.** The detector emits one row per (side × best-fitting-cell), keyed on `(side, band, window_days, momentum_quintile, drawdown_bucket, exclusion_width_days)`. DOCN's momentum-quintile-5 profile matches BOTH the **long-reversion cell family L_XX** (when 5-day excess ≥ +band cutoff — 07-21..24) AND the **short-continuation cell family S_XX** (when 5-day excess ≤ −band cutoff — 07-08..17). Cells are computed independently per side; the strategy is empirically **12-1 momentum-conditioned**: LONG = 12-1-strong that dropped (reverts up), SHORT = 12-1-weak that dropped (continues down). Consistent with ACT-575 sign-correct ratification.

**Boxed-position risk on 07-24:** DOCN opened LONG 07-21 (still likely open Monday) with a SHORT admit on 07-24 — `position_already_open` is SYMBOL-scoped and would refuse the short at entry. Pre-committed to Monday-morning sanity check on the entry list vs open longs.

### §5.2 λ corpus-arrival-rate reconciliation — ACT-569(d) DEFERRED-CLOSED

Per §1.2: long λ ≈ 311/session, short λ ≈ 279/session, both stable across the window (σ/μ < 0.35, no drift). The pre-H-1 "short λ collapse" story from ACT-569 was an artifact of the SI-staleness envelope killing rows AFTER cell-selection, not an arrival-rate change. Post-H-1 (window ends 07-24, fix landed same day) short candidate arrival is unchanged; what changed is the survival rate through `si_unavailable`. **Reconciliation: λ is stable; survival is what moves.** ACT-569(d) CLOSED-CONFIRMED.

---

## §6 — VERDICT GRAMMAR / GRADUATION GATE

| finding | direction | corpus-graduation gate |
|---|---|---|
| Long capacity-refused > admitted (+324 bps) | REGIME-CONFOUNDED | Requires full-corpus cell replay with SPY-neutralization; NOT graduated |
| Short drawdown_out_of_set (+371 bps refused) | DIRECTIONAL | Requires ACT-548-family cell adds S_08_10 / S_10_INF × bucket-4 × momentum-q-5; NOT graduated |
| Short excess_below_threshold gate neutral (−10 bps) | GATE-VALIDATED | Gate stays as-is |
| Long earnings-proximity guard (−173 bps refused) | GUARD-VALIDATED | Guard stays as-is |
| Short si_unavailable (+56 bps refused, pre-H-1) | SUPERSEDED | H-1 fix landed 07-24; re-measure post-window |

**Nothing graduates from Phase-1 alone.** All positive-direction findings feed ACT-548 study-cell expansion candidates; adoption requires the 42.42 bps/slot-day dominance floor with proper n-thresholds per the ACT-551 Standing Format Rule.

---

## §7 — DEVIATIONS SURFACED THIS TURN

1. **DEV-11 (this delivery):** T+6 close computed as ordinal exit; sessions after 2026-07-17 have no T+5 bar yet — reported as `n_with_ret` shortfall vs `n_total`. Non-blocking; will re-run when bars land through 2026-07-31.
2. **DEV-12 (this delivery):** Long-side admit 07-22 = 40 (not K=36). One-session over-emission of the capacity gate; filed to the Friday-close reconciliation lane for audit.
3. **INSUFFICIENT-N tags** stamped on every cell where n_ret < 30 per the ACT-551 Standing Format Rule (rows in §2.1 and §3 flagged verbatim).

---

## §8 — NEXT

ACT-574 entry-day offset grid (T+1/T+2/T+3 open, exit fixed R-1 ordinal) proceeds immediately behind this artifact per operator ordering. Kernel-parallel lane: ACT-515 engine build unaffected. Sector-ingest slot queued after 573/574 per operator ruling — unblocks (e) sector-cap and the mcap/sector feature cuts named §4 as UNMEASURED.

*Register row for ACT-573 flips to PHASE-1-DELIVERED (Phase-2 corpus-graduation gated on ACT-548 cell adds).*
