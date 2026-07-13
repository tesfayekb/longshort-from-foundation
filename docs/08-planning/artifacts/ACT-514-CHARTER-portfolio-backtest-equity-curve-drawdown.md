# ACT-514 — CHARTER: Portfolio Backtest — Equity Curve + Drawdown Profile

**Mode:** INVESTIGATION (read-only, corpus-based, parallel to everything).
**Filed:** 2026-07-13, late evening.
**Deliverable:** Phase-L GO/NO-GO risk input — historical equity curve + drawdown anatomy of the ratified machine over the full ~5yr corpus.
**Sequencing:** blocks nothing; behind nothing; runs when compute is free. Independent of ACT-506/507/508 (W5 live-slippage), ACT-510 (T+6 exits), ACT-511 (supply expansion), ACT-512/513 (account_id migration).
**Pre-commit:** report the numbers whatever they say. STOP after delivery.

---

## 1. OPERATOR QUESTION (verbatim framing)

> "What is the historical max drawdown and risk profile of the ratified configuration — a number that does not currently exist."

The book has ratified per-cell means, per-tier ROI, entry-day/exit-horizon economics, and regime-conditional admission — but has NEVER simulated the *portfolio* end-to-end. Individual events do not answer:
- How deep does the equity curve go in the worst month/quarter/year?
- How long does peak-to-recovery take?
- What is the bear-onset bleed of in-flight lots when the regime governor throttles NEW entries but does not liquidate?
- Does the machine sit empty in bears — and what does that cash drag cost?

Phase-L funding cannot be ratified on "we know each trade is +bps" without the portfolio-level risk sentence. This charter delivers that sentence, measured.

---

## 2. METHOD (pre-committed, no post-hoc knob-turning)

### 2.1 Configuration under simulation (FROZEN)

Simulate the **CURRENT ratified config uniformly** over the entire corpus — NOT era-conditional cap-20 vs cap-36 modelling. This measures the machine as it exists today, backcast onto history.

| Component | Value / source |
|---|---|
| Detection predicate | `b7cdfcd8` (current selection predicate, verbatim) |
| Selection caps | **36 slots / 4 shorts** (current ratified) |
| Threshold τ | **1.00** (current ratified) |
| Allocation split | **0.90 long / 0.10 short** |
| Slot sizing | **2.5% of sizingBase per slot** |
| Wallet cap | **aggregate-AUM cap** as coded (evaluateAllocationCap module) |
| Tier-conditional entry/exit | **T1: T+2 entry / T+6 exit**, **T2: T+1 entry / T+11 exit** (per ACT-510) |
| Regime governor | **as coded** — BEAR throttles T2 admission; T1 and shorts unaffected; existing lots NOT liquidated (structural — this is what the "bear-onset bleed" measurement quantifies) |
| I5 timing proxy | **T+1 open** (honest proxy; live number pending ACT-506) |
| Mark-to-market | daily settled close from `overshoot_daily_bars` |
| SPY regime series | `overshoot_daily_bars` SPY, expanding-window peak, thresholds −5% / −15% per ACT-473 |

### 2.2 Slippage haircut (state-and-apply)

Apply the **study's ratified per-side haircut** (the same bps assumption baked into ACT-509/ACT-510 ROI economics) pending ACT-506's live number. State the exact bps used in the deliverable header. When ACT-506 lands, re-run and diff — but this charter ships with the study assumption verbatim, no post-hoc tuning.

### 2.3 Day-by-day simulation loop

```
for date in corpus_span:
  1. run detection predicate on settled data as-of date
  2. rank + select at ratified caps (36/4, τ=1.00)
  3. apply regime governor: read SPY drawdown-from-peak; if BEAR, filter T2 from admission set
  4. compute per-tier entry dates (T1→T+2, T2→T+1) and per-tier exit dates
  5. attempt entry at T+1-open proxy price for lots whose entry date == today
     - apply wallet cap (aggregate-AUM); refuse overflow
     - apply haircut on entry price
  6. attempt exit at T+1-open proxy price for lots whose exit date == today
     - apply haircut on exit price
  7. mark all open lots to today's settled close
  8. compute portfolio_equity[today] = cash + Σ mark_to_market(open_lots)
```

### 2.4 Corpus scope + survivorship

Corpus = the current `overshoot_universe` × `overshoot_daily_bars` join, ~5yr span. **This is the today-universe backcast** — 2022 drawdowns are structurally UNDERSTATED because names that would have blown up and been removed are not in the corpus. Deliverable §5.1 states the deflator convention.

---

## 3. DELIVERABLES

### 3.1 Equity curve + headline stats

- Full daily equity series (chartable), starting capital = $100k notional.
- **CAGR** over the full span.
- **Max drawdown %** (peak-to-trough on the equity curve).
- **Max DD duration** = peak-to-recovery days (calendar and trading).
- **Worst month** and **worst quarter** by simple return.
- **Sharpe** and **Sortino** on daily returns, annualized (risk-free = 0; state assumption).
- **% of trading days deployed** = share of days with any open lot; also **mean # open lots**.

### 3.2 Drawdown anatomy — 5 deepest drawdowns

For each of the 5 deepest drawdowns:
- Peak date, trough date, recovery date (or "not recovered by corpus end").
- Depth (%).
- **Book at peak** — # long lots, # short lots, largest concentrations by ticker.
- **Regime state** at each of {peak, trough, recovery}.
- **Attribution split:** of the drawdown depth, how many bps came from
  - (a) in-flight lots at regime turn (the bear-onset bleed — governor did not liquidate),
  - (b) new entries admitted during the drawdown (should be near-zero for T2 if governor triggered),
  - (c) T1 entries (never throttled by regime — measure their bear-conditional performance).

§3.2 is the operator's stated key risk: **quantify what "governor throttles new entries but does not liquidate" costs in a bear onset.**

### 3.3 2022 specifically

Replace the anecdotal "2022 was hard" fixture claim with a MEASURED number:
- Full-year 2022 simulated P&L (%).
- Monthly returns (Jan..Dec 2022).
- **vs SPY** monthly (SPY was −18.1% full-year 2022 — the honest benchmark).
- Days-deployed by month in 2022 (feeds §3.4).

### 3.4 Arrival-rate starvation

In bear regimes across the corpus:
- **Days near-empty** = days with < 5 open lots.
- **Weeks near-empty** = weeks with mean < 5 open lots.
- **Cash-drag cost** = uninvested-capital × (T1 mean daily bps that WOULD have accrued had slots been available), summed over near-empty periods. State the counterfactual assumption explicitly.

### 3.5 Honest caveats block (mandatory verbatim in deliverable)

#### 5.1 Survivorship deflator
Corpus is today's universe. Names delisted 2020..2026 (bankruptcies, take-privates, hard-delistings) are NOT in the sample. **2022 drawdowns are UNDERSTATED by construction.** Convention: state the survivorship deflator as a range (typical academic estimate: 2–5% CAGR overstatement for small-cap-heavy universes over multi-year backcasts). Deliverable applies the deflator to headline CAGR and states both figures (raw + survivorship-deflated).

#### 5.2 I5 T+1-open proxy
Live I5 timing pending ACT-506. This charter uses T+1-open as the proxy execution price. When ACT-506 delivers the live number, re-run and diff — pre-committed: T+1-open is the ratified proxy for this run.

#### 5.3 Haircut assumption
State the exact bps haircut used (from ACT-509/510 study baseline). Live number pending ACT-506.

#### 5.4 No intraday marks
Portfolio marked at daily settled close only. Intraday drawdowns (which can be materially deeper) NOT captured. This is a CLOSE-to-CLOSE drawdown series.

#### 5.5 Regime-governor N=1 BEAR
Per ACT-473 SINGLE_BEAR_EPISODE_SAMPLE stamp: the corpus contains ONE 2022-shaped bear (rate/inflation-driven, no credit-system stress, no liquidity halt). Governor's BEAR branch has N=1 replication. This deliverable's bear-onset attribution IS that N=1 evidence — not statistically well-populated, honestly stamped.

### 3.6 Phase-L framing — the risk sentence

Deliver in plain language, one sentence per regime:
> "An operator funding this live should expect drawdowns of **X%** lasting **Y** months in BULL-to-CORRECTION conditions, **X'%** lasting **Y'** months in CORRECTION-to-BEAR conditions, and **X''%** lasting **Y''** months in sustained BEAR conditions — with the survivorship caveat that 2022-shaped bears in this backcast are understated by an estimated **Z%**."

This sentence is the Phase-L gate input. Numbers X/Y/Z come from §3.1–§3.5; the sentence itself is the deliverable form the operator ratifies.

---

## 4. WHAT THIS CHARTER IS NOT

- Not a live-execution change (money-path untouched).
- Not a re-ratification of any parameter (τ, caps, allocation split, entry/exit horizons — all frozen at current values).
- Not a substitute for ACT-506 live slippage (haircut is study-assumption, not measured).
- Not a Monte Carlo — deterministic replay of the corpus under the ratified machine.
- Not a regime-governor redesign — governor simulated as coded; deliverable measures what it costs and saves, does not propose changes.
- Not authority to trade any drawdown-response logic (stop-loss, forced-liquidation, position-cap-tightening) — those remain design questions for Phase-L, informed by this deliverable.

---

## 5. SEQUENCING + STOP CONDITION

- **Behind nothing.** Runs when compute is free. Does not block or interlock with ACT-506/507/508/509/510/511/512/513.
- **Read-only.** No writes to any money-path table. Compute artifacts land under `docs/08-planning/artifacts/ACT-514-*` (equity curve CSV, drawdown table, monthly-returns matrix, 2022 detail).
- **STOP for operator ratification** after §3.1–§3.6 are filed. No Phase-L execution charter is authored from this until the operator reads the numbers and decides.

---

## 6. CROSS-REFS

- ACT-473 (regime governor thresholds + SINGLE_BEAR_EPISODE_SAMPLE stamp).
- ACT-478 (regime module, pure classifier).
- ACT-506 (W5 live slippage — supersedes the haircut assumption when landed).
- ACT-509/510 (entry-day + tier-conditional exit-horizon economics — the per-event basis this portfolio simulation composes).
- ACT-511 (supply expansion — orthogonal; this charter simulates CURRENT universe only).
- ACT-512/513 (account_id migration — orthogonal; single-account backtest by construction).
- DEC-078/079 (T-1-close basis discipline — respected in the simulation's as-of clock).
