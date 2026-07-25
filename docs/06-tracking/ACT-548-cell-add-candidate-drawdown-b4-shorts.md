# ACT-548 Cell-Add Candidate — Short S-bands × drawdown-bucket-4

**Filed:** 2026-07-25 05:52Z from ACT-573 Phase-1 §3 finding.
**Source finding:** refused-short cohort `drawdown_out_of_set` (n=131) delivered +371.4 bps short-PnL / 45.6% win vs SELECTED-short (n=1 realized, INSUFFICIENT-N).
**Class:** DIRECTIONAL (12-session live window). Requires corpus study before any cell-set widening.

## Proposed cell adds (candidate)

- Side: SHORT
- Bands: `S_08_10`, `S_10_INF`
- Drawdown bucket: **4** (currently out-of-set for the short admission grid)
- Momentum quintile: **5** (top-momentum, per DOCN trace §5.1)
- Window days: study all {1..5}
- Exclusion width: 5 (unchanged)

## Verdict grammar (pre-committed)

Cell qualifies for the ratified frontier iff:
1. `mean_fwd_return_5d ≥ 42.42 bps/slot-day` on the ACT-548 corpus study
2. `arrival_count ≥ MIN_N` per current ACT-548 threshold
3. Monotone-stability holds across ±1 drawdown-bucket (bucket-3 already in set; bucket-5 must also be studied for pass-through consistency)
4. No regime-conditional inversion at n≥1000 pooled per regime

Adoption requires DEC amendment if all four gates pass.

## Sequencing

**BLOCKED** on:
- ACT-574 Phase-1 delivery (LANDED 2026-07-25 05:52Z ✓)
- ACT-515 engine kernel bring-up (queue-parallel; not on this candidate's critical path)

**READY** post-ACT-574; slot in weekend SQL lane immediately after Phase-2 splits.

## Register linkage

- Feeder: `docs/06-tracking/ACT-573-phase1-refused-winners-forensics.md` §3 (routing directive)
- ACT-548 base: existing (Monday Rule for below-p10 breadth)
- Cross-ref: DEC-084 (short daily budget), ACT-575 (sign-correct ratification), ACT-569 (short-arm feed)
