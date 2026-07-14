# ACT-520 — OVERSHOOT-P Put-Write Proxy Study

**Mode:** investigation (read-only, in-turn per standing rule).
**Corpus:** `overshoot_study_candidate_events` (n=523,694; 2021-06 → 2026-07).
**Adoption floor:** per-slot-day ≥ 1.15× best-alt (OVERSHOOT T1 ratified T+2 = 36.89 bps/slot-day → threshold **42.42 bps/slot-day**).

## Method (stamped IV-PROXY-UNRATIFIED)

Cash-secured put-write per event, horizon H = 5 trading days. 10d NOT-COMPUTABLE (not persisted in corpus); 20d assignment probabilities in appendix.

- Strike K = S·(1+k), k ∈ {0.0, −0.025, −0.050}.
- Premium proxy: `P_frac = max(0, 0.4·σ_5d − |k|·0.5)`. ATM approximation from Bachelier-style rule (P_atm ≈ 0.4·σ·√T·S), OTM linearly discounted. **Not a real IV surface.**
- σ estimated per (side, band) from within-cell fwd_return_5d stddev.
- Assignment: `P(assigned) = P(r_5 ≤ k)` from empirical corpus.
- Expected P&L per unit S: `E[PnL] = P_frac − E[max(k − r_5, 0)]`.

## Headline (5d ATM, k=0) — sorted by pnl/slot-day desc

| side  | band     |    n   | P(assign) | prem_bps | shortfall_bps | pnl_5d_bps | **pnl/slot-day** | ann RoC % |
|-------|----------|-------:|----------:|---------:|--------------:|-----------:|-----------------:|----------:|
| short | L_10_INF | 22,128 |   0.4524  |   317.6  |        227.2  |      90.4  |    **18.08**     |   45.56   |
| long  | L_10_INF | 26,947 |   0.4901  |   343.8  |        257.9  |      85.9  |    **17.19**     |   43.32   |
| short | L_08_10  | 18,853 |   0.4570  |   275.9  |        212.8  |      63.1  |    **12.62**     |   31.81   |
| short | L_06_08  | 40,722 |   0.4597  |   258.2  |        195.1  |      63.1  |    **12.62**     |   31.81   |
| long  | L_08_10  | 20,011 |   0.4800  |   272.7  |        213.0  |      59.7  |    **11.94**     |   30.09   |
| long  | L_06_08  | 41,378 |   0.4665  |   248.0  |        192.2  |      55.8  |    **11.17**     |   28.15   |
| short | L_05_06  | 37,002 |   0.4706  |   236.4  |        185.3  |      51.0  |    **10.20**     |   25.71   |
| short | L_04_05  | 56,738 |   0.4656  |   223.3  |        173.5  |      49.8  |     **9.95**     |   25.08   |
| long  | L_05_06  | 35,626 |   0.4708  |   225.7  |        183.0  |      42.7  |     **8.55**     |   21.53   |
| long  | L_04_05  | 53,253 |   0.4697  |   217.8  |        176.2  |      41.5  |     **8.30**     |   20.93   |

**Peak cell:** short-side L_10_INF ATM = **18.08 bps/slot-day**, ann RoC 45.56%.

## Verdict vs 42.42 bps/slot-day floor

**REFUSED across every cell × strike × side.** Peak reaches only **42.6%** of the required floor. OTM strikes strictly worse: k=−0.025 peak = 12.28 bps/slot-day (long L_10_INF); k=−0.050 turns NEGATIVE in most cells (premium haircut exceeds tail relief).

Under this IV proxy, **capital is more productive as additional OVERSHOOT stock slots than as put-writes on the same events.** The put-write does not merely fail — it fails by more than 2×.

## Honest gap list

1. **IV-PROXY-UNRATIFIED.** The 0.4·σ·√T rule likely under-estimates event-day IV (typically 1.3–2.0× realized-vol pre-event). Even a 2× premium uplift on the peak cell yields ≈36 bps/slot-day — still under 42. Would need IV uplift ≥ 2.4× realized-vol to clear, which the equity-options literature does not support post-move.
2. **Data cost (Polygon options).** Starter tier ≈ $199/mo (EOD chains, 15-min delayed). Developer tier ≈ $399/mo (real-time). Starter sufficient for retrospective re-study.
3. **Alpaca options paper.** Options supported at Level 2 (long options + cash-secured writes). Entitlement flag on the existing paper account requires verification (out-of-scope for this read-only study).
4. **Per-name option-liquidity floor (proposal for any DEC):** OI ≥ 500 contracts; bid-ask ≤ max(5%, $0.05) of mid; ≥ 3 strikes within ±10% of spot. Would drop 30–50% of small-band events; preserve most L_10_INF.

## Assignment-rate table (5d and 20d)

| side  | band     | P5_ATM | P5_-2.5% | P5_-5% | P20_ATM | P20_-2.5% | P20_-5% |
|-------|----------|-------:|---------:|-------:|--------:|----------:|--------:|
| long  | L_10_INF | 0.4908 |  0.3204  | 0.1923 | 0.4731  |  0.3844   | 0.3039  |
| short | L_10_INF | 0.4479 |  0.2847  | 0.1692 | 0.4482  |  0.3556   | 0.2733  |
| long  | L_08_10  | 0.4797 |  0.2868  | 0.1570 | 0.4651  |  0.3703   | 0.2839  |
| short | L_08_10  | 0.4534 |  0.2776  | 0.1548 | 0.4578  |  0.3583   | 0.2694  |
| long  | L_06_08  | 0.4732 |  0.2717  | 0.1414 | 0.4658  |  0.3604   | 0.2703  |
| long  | L_04_05  | 0.4736 |  0.2514  | 0.1229 | 0.4636  |  0.3539   | 0.2573  |

## Filing

**NO-GO.** Real-chain re-study is not warranted absent a plausibility argument for IV uplift ≥ 2.4× realized-vol. File as ACT-520-CANDIDATE-CLOSED. Log the six-factor gap list for any future re-open (real IV, per-name-vol calibration, term-structure, event-day IV crush, size/spread liquidity, wheel-mechanic if assigned).
