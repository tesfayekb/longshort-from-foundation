# ACT-570 Phase-0 — Naked Runner Predicate (Does the Animal Exist and Revert?)

**Delivered:** 2026-07-25 06:01Z  •  **Clock:** `SELECT now() → 2026-07-25 06:00:55Z`
**Charter-inline pre-commit** (no prior charter file existed in repo — inline pre-commit values LOCKED before any SELECT):

- **N** = 4 consecutive strict up-sessions (`close_t > close_{t−1}` for t ∈ {t−3, t−2, t−1, t})
- **X** = cumulative return ≥ **+15%** over those 4 sessions (runners must exceed T1's ~10% excess bar — a runner is stronger than an overshoot by design)
- **No-catalyst** = `overshoot_earnings_calendar` announcement absent in `[t−5, t+5]` (inverted exclusion machinery, earnings-proximity guard applied in reverse)
- **Universe** = tickers present in `overshoot_daily_bars` (in-universe substrate; ~2M bar-rows)
- **Window** = 2022-01-01 → 2026-07-02
- **Forward measures** = fwd-5d and fwd-10d close-to-close returns; reversal = fwd < 0

**Honest-frame:** naked predicate — no SVR (short-volume ratio), no borrow, no news scan beyond earnings. Phase-1 layers FINRA Reg SHO SVR on top per charter.

---

## §0 — ONE-LINE ANSWER

> **The runner animal EXISTS (n=1,693 events over 4.5y, 354 tickers, mean +20.77% over the 4-session run). It DOES NOT REVERT AT MEAN — fwd-5d = +15.0 bps (coin-flip 50.1% reversal); fwd-10d = +128.4 bps (46.7% reversal, CONTINUES UP on average). The naked-runner short thesis IS NOT SUPPORTED at the corpus level. Regime-dependent: 2022 (bear) reverted (−185 bps fwd-5d, 59% reversal); 2023-2026 (bull) continued.** Verdict: **HYPOTHESIS-NOT-CONFIRMED at Phase-0**; Phase-1 SVR overlay is the make-or-break. Do not build the strategy on the naked predicate.

---

## §1 — POPULATION

| metric | value |
|---|---|
| n_runners (events satisfying N=4 ∧ X≥15% ∧ no-earnings-±5d) | **1,693** |
| n_tickers | 354 |
| window | 2022-01-11 → 2026-07-02 |
| mean cumulative return over run | +2077.1 bps (+20.77%) |
| forward bars missing (event too close to corpus end) | 36 |

**Incidence:** ~1,693 / ~1,150 sessions ≈ **1.5 runner-events per session in-universe**. Not rare, not common — a real animal.

---

## §2 — FORWARD RETURNS (chain, mean over all 1,693)

| horizon | mean_bps | reversal_rate |
|---|---|---|
| fwd-5d | **+15.0** | 0.501 |
| fwd-10d | **+128.4** | 0.467 |

**Read:** at the mean, runners drift **flat** at 5d and **continue up** at 10d. Reversal rates ≈ 0.5 = pure noise. **No mean-reversion signal in the naked predicate.**

---

## §3 — BY SIZE BUCKET (magnitude of the run)

| bucket | cum_ret band | n | mean_cum_bps | fwd5d_bps | fwd10d_bps | rev5 | rev10 |
|---|---|---|---|---|---|---|---|
| A_15_20 | 15–20% | 1,079 | +1,693 | **+3.0** | +124.9 | 0.490 | 0.452 |
| B_20_30 | 20–30% | 480 | +2,352 | **−10.5** | +87.9 | 0.513 | 0.490 |
| C_30_50 | 30–50% | 112 | +3,601 | **−33.8** | +143.0 | 0.589 | 0.491 |
| D_50_plus | ≥50% | 22 | +7,168 | **+1,381.2** | +1,087.1 | 0.364 | 0.591 |

**Read:** mild fwd-5d reversal materializes in **C_30_50** (−34 bps, 59% reversal) — the sweet-spot magnitude — but n=112 is thin. **D_50_plus continues violently** (+1,381 bps fwd-5d, n=22): these are momentum monsters, not runners to fade. **Bucket A (15-20%)** is the modal case and shows **zero fwd-5d edge**.

---

## §4 — BY YEAR (regime split)

| year | n | fwd5d_bps | fwd10d_bps | rev5 | rev10 |
|---|---|---|---|---|---|
| 2022 | 465 | **−185.4** | −47.4 | **0.594** | 0.488 |
| 2023 | 242 | +74.3 | +266.5 | 0.500 | 0.401 |
| 2024 | 210 | +86.5 | +147.7 | 0.462 | 0.462 |
| 2025 | 389 | −3.7 | +129.4 | 0.514 | 0.491 |
| 2026 (H1) | 387 | +214.0 | +253.6 | 0.401 | 0.463 |

**Read:** **2022 bear regime REVERTED** (−185 bps fwd-5d, 59.4% reversal — the operator's animal exists here). All other years CONTINUED. The "naked runner shorts" thesis works in 2022-like tape and fails elsewhere. Regime-conditioning is not optional.

---

## §5 — VERDICT

**Phase-0 verdict: HYPOTHESIS-NOT-CONFIRMED at pooled corpus.** The naked runner predicate is a **regime-conditional** trade (works in bear tape only), not a standalone edge. Continuation on the "no-catalyst" side is the base-case pattern in bull regimes.

**Does the animal exist and revert AT ALL:** exists **yes**; reverts **conditionally** (2022 only, C_30_50 magnitude only). Both conditions must be met — that is a narrow slice.

**Implication for Phase-1:** the FINRA SVR overlay must materially separate reverting-runners from continuing-runners, or the whole predicate is not tradeable. Charter pre-commits the acceptance threshold (§7).

---

## §6 — CHAINS (verbatim)

### §6.1 Population + pooled forward
```sql
WITH bars AS (
  SELECT ticker, trade_date, close,
         LAG(close,1) OVER w AS c1, LAG(close,2) OVER w AS c2,
         LAG(close,3) OVER w AS c3, LAG(close,4) OVER w AS c4,
         LEAD(close,5) OVER w AS c_p5, LEAD(close,10) OVER w AS c_p10
  FROM overshoot_daily_bars
  WHERE trade_date BETWEEN '2022-01-01' AND '2026-07-02'
  WINDOW w AS (PARTITION BY ticker ORDER BY trade_date)
),
runners AS (
  SELECT ticker, trade_date AS runner_end_date, close AS c_end, c4 AS c_start,
         (close / NULLIF(c4,0) - 1.0) AS cum_ret_4d, c_p5, c_p10
  FROM bars
  WHERE c1 IS NOT NULL AND c2 IS NOT NULL AND c3 IS NOT NULL AND c4 IS NOT NULL
    AND close > c1 AND c1 > c2 AND c2 > c3 AND c3 > c4
    AND (close / NULLIF(c4,0) - 1.0) >= 0.15
),
no_cat AS (
  SELECT r.* FROM runners r
  LEFT JOIN overshoot_earnings_calendar e
    ON e.ticker = r.ticker
   AND e.announcement_date BETWEEN r.runner_end_date - INTERVAL '5 days'
                                AND r.runner_end_date + INTERVAL '5 days'
  WHERE e.ticker IS NULL
)
SELECT COUNT(*), COUNT(DISTINCT ticker),
       ROUND(AVG(cum_ret_4d)::numeric*10000,1) AS mean_cum_bps,
       ROUND(AVG(c_p5/NULLIF(c_end,0)-1.0)::numeric*10000,1) AS fwd5_bps,
       ROUND(AVG(c_p10/NULLIF(c_end,0)-1.0)::numeric*10000,1) AS fwd10_bps,
       ROUND(AVG(CASE WHEN c_p5<c_end THEN 1.0 ELSE 0 END)::numeric,3) AS rev5,
       ROUND(AVG(CASE WHEN c_p10<c_end THEN 1.0 ELSE 0 END)::numeric,3) AS rev10
FROM no_cat;
-- → (1693, 354, 2077.1, 15.0, 128.4, 0.501, 0.467)
```

### §6.2 Splits (bucket + year)
See operator SQL in-line; results §3 and §4.

---

## §7 — PHASE-1 CHARTER (FINRA Reg SHO SVR ingest, pre-commit)

**Deliverable:** SVR overlay on the same n=1,693 runner corpus. Test whether **high-SVR runners** (predicting borrow demand / short crowding) revert differently from **low-SVR runners**.

### §7.1 Ingest spec

- **Source:** api.finra.org Query API, dataset `regsho-daily-shorts` (D3 epoch block per charter reference).
- **Endpoint:** `https://api.finra.org/data/group/otcMarket/name/regShoDaily` (public, no key required for daily aggregates).
- **State history depth available:** FINRA retains Reg SHO Daily from **2009-08-03 → T−1 settlement**. For our 2022-01-01 window, full coverage.
- **Call budget estimate:** ~1,150 trading sessions × 1 call/session (paginated) = ~1,200 calls one-time backfill, ~1 call/day steady-state. Bounded and small.
- **MIG:** `overshoot_finra_reg_sho_daily` (settle_date, ticker, short_vol, total_vol, svr_pct GENERATED, source_run_id, fetched_as_of, PK (settle_date, ticker)).
- **Ingest fn:** `overshoot-finra-regsho-ingest` (daily cron post-FINRA-publish ~04:00 ET T+1).
- **Backfill:** one-shot from 2022-01-01 gated by DEV-15 call-budget confirmation (probe endpoint next turn before MIG).
- **Acceptance:** coverage table showing SVR row present for ≥95% of `(ticker, trade_date)` cells in the runner corpus post-backfill.

### §7.2 SVR dynamics test (pre-committed grammar)

- Split n=1,693 runners into **SVR-quintiles** at `runner_end_date`.
- Compute fwd-5d/10d mean and reversal rate per quintile.
- **Adoption gate:** quintile-5 (highest SVR) must show fwd-5d ≤ **−100 bps** AND reversal rate ≥ **0.60** at n≥200 per quintile, versus quintile-1 fwd-5d ≥ **+50 bps**. Monotone across quintiles required (stability gate per ACT-551 §22).
- **Fail-open:** if gate misses, the runner-short overlay is **REJECTED** and filed. No config additions off a failed grammar.

### §7.3 Not-in-scope for Phase-1

- Intraday SVR (only daily aggregates from Reg SHO Daily; intraday requires TAQ).
- Threshold Securities List (separate FINRA file; queued Phase-2 if SVR passes).
- Options-flow overlay (out-of-scope, separate strategy).

---

## §8 — REGISTER + DEV LOG

- Register row 56 (ACT-570): flip to **PHASE-0-DELIVERED**; Phase-1 gated on DEV-15 endpoint probe (~30 min next turn).
- **DEV-15**: FINRA endpoint probe pending; ingest MIG deferred until call-budget confirmed.
- **DEV-13/14** (ACT-574 Phase-2 stubs): accepted, unchanged.
- **ACT-548 cell-add** (drawdown-b4 shorts): queues post-ACT-574-Phase-2 as filed.

---

## §9 — SEQUENCING TAIL

Post-ACT-570 Phase-1 landing → **ACT-576** (execution-drag decomposition) runs immediately. Kernel-parallel ACT-515 workstream continues on its own turns; sector-metadata ingest queued after ACT-573/574 Phase-2 per operator sequencing lock.