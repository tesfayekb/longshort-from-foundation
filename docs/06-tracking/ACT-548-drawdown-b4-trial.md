# ACT-548 · Drawdown-Bucket-4 Short Cell Trial — Verdict

**Filed:** 2026-07-25 19:49Z • **Class:** DIRECTIONAL corpus study • **Mode:** verdict
**Charter:** `docs/06-tracking/ACT-548-cell-add-candidate-drawdown-b4-shorts.md`
**Substrate:** `overshoot_study_cell_results` run `1888e113-f9b3-43f5-856c-d91666a3c121`
(label `w26-detect-1of6`, as-of 2026-07-02, `return_basis=CLOSE_TO_CLOSE_REFERENCE`, 6000 cells, latest completed).

## §0 — ONE-LINE ANSWER

**FAIL.** Candidate cell-set `{side=short, band∈(S_08_10,S_10_INF), dd=4, mq=5, w∈{1..5}, ew=5}`
does NOT qualify for the ratified frontier. Multiple pre-committed gates red;
Rule-8 disposition = **CLOSED-REJECTED**. No DEC drafted. No STEP-4a.

## §1 — Gate-by-gate readout (pre-committed grammar, no post-hoc edits)

Gate arithmetic: `short_bps/slot-day = -mean_fwd_return_5d / 5 × 10000`.
Frozen floor = **42.42 bps/slot-day**. `MIN_N = 100`.

### Gate-1 — mean_fwd_return_5d threshold

| band | dd | w | n | short_bps/slot-day | gate |
|---|---|---|---|---|---|
| S_08_10 | 4 | 1 | 55  | 36.50  | INSUFFICIENT-N |
| S_08_10 | 4 | 2 | 136 | 23.91  | FAIL |
| S_08_10 | 4 | 3 | 207 | 24.41  | FAIL |
| S_08_10 | 4 | 4 | 259 | −2.49  | **FAIL (sign-inverted at n=259)** |
| S_08_10 | 4 | 5 | 316 | 17.88  | FAIL |
| S_10_INF | 4 | 1 | 46  | 57.25  | INSUFFICIENT-N (pass-if-N) |
| S_10_INF | 4 | 2 | 151 | **56.96** | **PASS** |
| S_10_INF | 4 | 3 | 283 | 36.38  | FAIL |
| S_10_INF | 4 | 4 | 468 | 29.47  | FAIL |
| S_10_INF | 4 | 5 | 642 | 19.16  | FAIL |

**Verdict:** 1 of 10 target-cell windows clears the frozen floor at n≥100
(S_10_INF, w=2). S_08_10 fails at every sufficient window and inverts sign at
w=4. Cell-set as chartered does not clear.

### Gate-2 — arrival_count ≥ MIN_N

- S_08_10 dd=4 w=1: n=55 (INSUFFICIENT-N)
- S_10_INF dd=4 w=1: n=46 (INSUFFICIENT-N)
- All other target cells: n≥100 ✓

### Gate-3 — Monotone-stability across dd±1 (dd=3 in-set, dd=5 pass-through)

| band | dd=3 (in set) | dd=4 (candidate) | dd=5 (pass-through) |
|---|---|---|---|
| S_08_10 | w=1 PASS (n=100); w=2-5 FAIL | w=2-5 FAIL; w=4 sign-inverted | **all INSUFFICIENT-N** (n=11..32) |
| S_10_INF | w=1,2,3 PASS; w=4,5 FAIL | w=2 PASS only | **all INSUFFICIENT-N** (n=16..94) |

**Verdict:** FAIL. Non-monotone pattern in S_08_10 (sign inversion at dd=4/w=4);
dd=5 pass-through cannot be confirmed at any window because MIN_N is not met.

### Gate-4 — Regime-conditional inversion at n≥1000 pooled per regime

Pooled n at target dd=4, mq=5:
- S_08_10 max (w=5): **316** ⟨ 1000
- S_10_INF max (w=5): **642** ⟨ 1000

**Verdict:** UNEVALUABLE on this substrate (auto-fail per the frozen grammar).
No regime split attempted — pre-committed n-threshold blocks the read.

## §2 — Honest read

The proposed cell-add was motivated by ACT-573 Phase-1 §3 finding that
**refused** dd=4 shorts (n=131) delivered +371 bps forward. Under the frozen
ACT-548 grammar on the 2022–2026 corpus, those refused rows do not
generalize: at the target `(dd=4, mq=5, band∈{S_08_10, S_10_INF})` the wider
corpus shows attenuated / sign-inverted short PnL at sufficient n, no
monotone-stability across the ±1 dd window, and pooled n never reaches the
regime-analysis floor. The refused-cohort effect appears to be either
cell-composition-specific to ACT-573's momentum-non-5 quintiles, or a small-n
directional artifact of the 12-session cohort window (ACT-573's own honest-
frame clause). Neither is a basis for expanding the admission grid.

## §3 — Rule-8 disposition

**CLOSED-REJECTED.** ACT-548 cell-add candidate ends at STEP-3. STEP-4a
(DEC draft) skipped by grammar. Register row flipped this turn.

## §4 — Charter linkage / register

- Charter: `docs/06-tracking/ACT-548-cell-add-candidate-drawdown-b4-shorts.md`
- Feeder finding: `docs/06-tracking/ACT-573-phase1-refused-winners-forensics.md` §3
- Register: `docs/08-planning/deferred-work-register.md` → ACT-548 row flipped to CLOSED-REJECTED (2026-07-25)
- Cross-ref: DEC-084 (short daily pacing) unaffected; short_daily_budget stays 1