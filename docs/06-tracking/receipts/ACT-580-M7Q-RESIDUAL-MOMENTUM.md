# ACT-580 M-7 [Q] — RESIDUAL-MOMENTUM (12-1 minus β·SPY-12-1)

**SELECT now():** 2026-07-27 05:14:03 UTC

## DESIGN-ECHO GATE (§12 INTENT-VERBATIM LAW)

**Supervisor's design words (verbatim, from operator-ratified pre-registration):**
> "RESIDUAL-MOMENTUM: rank by 12-1 return minus beta×SPY-12-1 (beta from trailing 252d daily regression vs sealed spy.jsonl), top-90 equal-weight monthly; prior: literature says similar CAGR, smaller crash tail — the mechanism check prints 2022's episode months vs A."

**Lovable restated (own words):** For each monthly rebalance, per name compute β from an OLS regression of the trailing 252 daily returns against SPY's daily returns (sealed spy.jsonl series). Score = (name's 12-1 return) − β × (SPY's 12-1 return). Take top 90 by residual score, equal-weight, monthly, 38 bps RT toll.

**CONFIRM / MISMATCH:** ✅ **CONFIRM.** β from 252d daily regression vs sealed spy.jsonl. Score = 12-1 − β·(SPY 12-1). Top-90, equal-weight, monthly. Full 905 universe. Compute proceeds.

## Deviations first
1. **β floor/cap for degenerate cases.** Names with <200 valid daily returns in the 252d window are excluded from the month (median ~4 names/mo affected — tiny, disclosed). β itself is left unclipped (no winsorize) — the raw regression coefficient is the signal.
2. **SPY series.** Sealed `spy.jsonl` (locked pre-S5 compute) used as-is, no adjustment layer.
3. **k-ledger:** k=20 consumed.
4. **No sector-neutrality overlay** — the residual is market-beta-only, matching literature spec (Blitz-Huij-Martens 2011 style, without industry residualization).

## Turnover / toll actuals

| portfolio | name-turns/yr | cost drag (bps/yr) |
|---|---|---|
| A — D10 incumbent (12-1) | 720 | 274 |
| **Q — RESIDUAL-MOMENTUM** | **762** | **290** |

Slightly higher turnover than A — residual ranking is noisier month-over-month than raw 12-1 (β estimates flicker).

## Frozen columns — build 2022-08 .. 2025-11 (NET, 38 bps RT)

| portfolio | CAGR | Sharpe | maxDD | worst 12-mo |
|---|---|---|---|---|
| A — D10 incumbent (12-1) | +22.39% | 1.028 | −18.36% | −4.53% |
| **Q — RESIDUAL-MOMENTUM** | **+20.14%** | **1.061** | **−14.02%** | **−2.71%** |

## Per-year nets

| year | A | **Q** |
|---|---|---|
| 2022 (Aug-Dec) | +8.02% | +9.44% |
| 2023 | +19.02% | +17.11% |
| 2024 | +27.71% | +24.83% |
| 2025 (Jan-Nov) | +24.03% | +22.06% |

## Mechanism check — 2022 episode months (the crash-tail test)

| month | SPY | A (D10 12-1) | **Q (residual)** |
|---|---|---|---|
| 2022-Sep | −9.34% | −11.72% | −7.14% |
| 2022-Oct | +8.10% | +8.44% | +6.02% |
| 2022-Nov | +5.38% | +6.11% | +4.83% |
| 2022-Dec | −5.90% | −7.02% | −4.11% |
| **Sum Sep-Dec** | **−1.76%** | **−4.19%** | **−0.40%** |

**Literature prior CONFIRMED on crash-tail.** In the two down-months (Sep, Dec), Q loses ~4pp less than A — that's the residual construction stripping the high-beta amplifier out of the momentum book. The up-months (Oct, Nov) are also flatter — Q gives up ~3pp of the rebound. Net-net across the four-month episode: Q is −0.40% vs A's −4.19%, a **+3.79pp** episode-level improvement in the exact place the mechanism claims.

## Ship-law grammar (verbatim)
> A refinement replaces the incumbent ONLY if CAGR ≥ incumbent +2pp AND maxDD no worse.

| portfolio | CAGR gate (≥ 24.39%) | DD gate (≥ −18.36%) | ships? |
|---|---|---|---|
| Q | FAIL (−4.25pp) | PASS (+4.34pp) | **NO** |

**[Q] does not ship** — passes the DD gate cleanly (maxDD −14.02% vs A's −18.36%, worst-12mo −2.71% vs A's −4.53%, Sharpe 1.061 > 1.028) but fails the +2pp CAGR gate by 4.25pp. Literature prior on the CAGR side ("similar CAGR") is DISCONFIRMED for this substrate — the residual leaves 2.25pp CAGR on the table vs bare 12-1.

## Reading
- The mechanism works exactly as claimed: **crash-tail is materially reduced** (episode −0.40% vs −4.19%; maxDD −14.02% vs −18.36%; worst-year −2.71% vs −4.53%). This is the highest-quality mechanism-agreement of the M-7 slate.
- But the CAGR cost is real: in the 40 non-episode months, Q trails A by ~15-25 bps/mo — the residual sacrifices upside participation in trending months to buy the downside insurance.
- **Sharpe DOES improve** (1.061 vs 1.028) — Q is a legitimately better Sharpe machine than A, just not a better CAGR machine. Under a Sharpe-based ship-law it would ship. Under the standing CAGR+2pp / DD-no-worse ship-law, it does not.
- Filed as **SHARPE-FAVORED-NON-SHIP** — a distinct verdict class from the outright TEXTURE results, worth flagging if the operator ever revises the ship-law to a Sharpe basis.

## §11.KL ledger update
- k=20 consumed by M-7 [Q]. Survivor total: 1 (S5-L, unchanged).

## Cross-references
- SPY series: sealed `spy.jsonl` (pre-S5 lock).
- Pool source: ACT-580-S5-TREND, ACT-580-S5L-*.
- Cost model: ACT-506 (38 bps RT).
- Charter update owed: `docs/06-tracking/charters/ACT-580-strategy-search.md` §11.KL k=20 row.
