# ACT-515 CHARTER (AMENDED) — Capped Stateful Simulation, Tri-Config Leverage Comparison

**Status:** RATIFIED (amended spec) · **Date:** 2026-07-14 · **Mode:** Investigation (execution charter for a corpus-based read-only sim) · **Blocks:** Phase-L margin-funding decision.

## 0. Ruling that produced this amendment

Post-ACT-514 leverage-table review REJECTED linear ÷9.5 scaling as a decision input. Evidence from the sim's own curve:

1. **Implicit leverage was TIME-VARYING, not 9.5× constant.** Constant $2,500 slots against a compounding equity base means the leverage multiple shrank as equity grew. By the Sept-2022 trough, equity was ≈$180–200k against ~$950k gross notional → **~5× at the event, not 9.5×**. Applied properly, even the linear method gives ≈−11–12% P2T at 1×, not −6%.
2. **Composition-under-scarcity is non-linear.** A 40-lot capped book admits by detector rank; scarcity concentrates in top-decile / deepest-dislocation names. The realized 40-lot basket is NOT a random 40 pulled from the ~380 uncapped book — it is systematically the highest-conviction, highest-tail-risk tail. Linear scaling assumes basket composition invariance; that assumption is violated.
3. **Idiosyncratic concentration at N=40 is unmodeled.** Fewer names → higher single-name variance contribution → wider DD distribution tails. Not captured by any scalar ÷k.
4. **The AI's own two capped estimates disagreed** (−15/−20% in the readout vs −6/−15% in the leverage-table reply). That inconsistency is the signal: the estimator has no anchor.

**RULING: no leverage-comparison numbers are quotable until this charter's sim runs.**

## 1. Scope — three configurations, measured curves only

Run the CAPPED STATEFUL simulation THREE ways over the same window (2022-06-29 → 2026-07-10, ~1,011 trading days) as ACT-514, on the same event corpus (`1888e113`) with the same live-ratified selection cells (`045d2dfc`, exclusion_width=5), same T1/T2/SHORT horizons, same haircuts, same regime governor.

### (a) 1.0× — cash-deployable baseline

- Aggregate wallet cap ENFORCED via `evaluateAllocationCap` semantics (side-scoped: 0.90 long / 0.10 short of `sizingBase`).
- 40-slot concurrent cap (36 long + 4 short) hard-enforced against the OPEN BOOK, not just daily-cohort admissions.
- K=5 per-day admission cap on top of that.
- Rank-order admission exactly as coded — best `rank_score` first, refusals typed `allocation_cap_reached`.
- No margin interest, no maintenance-call check (not applicable at 1×).
- `sizingBase = equity × strategy_allocation_pct × 1.0`.

### (b) 2.0× — Reg-T-consistent margin scenario

- Same cap arithmetic as (a) but `sizingBase = equity × strategy_allocation_pct × 2.0`.
- **Margin interest line: 50 bps/month accrued on the DEBIT balance** (portion of book financed above equity). Charged daily as `(debit_balance / 30) × 0.0050 / 30` ≈ prorated. Aggregate to a monthly line item in the readout.
- **Reg-T maintenance-call check per day:** flag any day where `equity < 0.25 × gross_market_value` (long) or the equivalent short-side maintenance ratio would fire. Record: number of call-days, largest single-day call magnitude, cumulative days in call. **This is a flag, not a forced-liquidation — the sim rides through but reports the count so the operator knows how many days a real desk would have force-liquidated.**
- Both LONG and SHORT sides scaled uniformly by the 2× headroom; per-side allocation percentages (0.90 / 0.10) unchanged.

### (c) SPY buy-and-hold, same window

- $100k → SPY at close 2022-06-29 → mark-to-market daily → sell 2026-07-10.
- No trading costs, no rebalance. Pure benchmark.
- Reported columns identical to (a) and (b).

### Sizing variants — BOTH required for (a) and (b)

- **Constant-notional:** `$2,500 × margin_multiplier` per slot, `sizingBase` frozen at $100k throughout (matches ACT-514 basis for direct comparability).
- **Compounding:** slot notional = `equity_t × 0.025 × margin_multiplier`, recomputed daily against the running equity curve. **This is what a real funded account experiences** — the compounding variant is the primary Phase-L input; constant-notional is the diagnostic-comparability variant.

Report both. When one variant is quoted in a summary sentence, name it.

## 2. Deliverable — the leverage table, rebuilt from measured curves

Rows: config × sizing variant (5 rows: 1×-const, 1×-comp, 2×-const, 2×-comp, SPY-B&H).

Columns:

| # | Column | Notes |
|---|---|---|
| 1 | Sept-2022 month return | Full-month P&L, the max-DD event month |
| 2 | Max P2T drawdown | Peak-to-trough over the full window, MTM basis |
| 3 | DD peak date / trough date / recovery date | Recovery = first day back to prior peak |
| 4 | DD duration (days, peak→trough) | Bleed length |
| 5 | DD recovery duration (days, trough→recovery) | Repair length; N/A if unrecovered by end-of-window |
| 6 | CAGR | Full-window annualized |
| 7 | Sharpe (annualized, daily log-returns) | |
| 8 | Sortino (annualized) | |
| 9 | Days-in-margin-call (2× only) | 0 for 1× and SPY; count for 2× |
| 10 | Margin interest paid (2× only) | Cumulative $, both sizing variants |
| 11 | Mean / max open lots | Book-fill signal |
| 12 | % days book fully deployed at cap | Cap-saturation frequency |

Plus: five-deepest-DDs table per config (peak, trough, recovery, book-at-peak, regime-at-{peak,trough,recovery}, attribution split — in-flight-lot bleed vs cap-refused new admissions).

Plus: 2022-H2 monthly matrix per config vs SPY (replaces the ACT-514 monthly table with the tri-config version).

## 3. Honest caveat block — carried forward from ACT-514, extended

1. **H1-2022 bear leg UNCOVERED** — corpus starts 2022-06-29, the Jan–Jun 2022 bear leg is not simulated. All max-DD numbers reflect the second-leg bear only, after SPY had already fallen ~25%. ACT-516 addresses via bar-history backfill OR explicit acceptance.
2. **Survivorship bias — UPPER_BOUND_SURVIVORSHIP_BIASED.** Corpus is today's ~840-ticker universe; delisted/bankrupt names from 2022–2023 absent. Deflator: subtract ~5–10 pp from 2022–2023 returns as first-order estimate. ACT-517 to formalize.
3. **N=1 bear-regime sample.** Only one genuine BEAR crossing in window (Sep 2022). Statistical significance on bear attribution weak (ACT-473 SINGLE_BEAR_EPISODE_SAMPLE stamp reaffirmed).
4. **T+1-open entry proxy** with study-ratified 5/15 bps haircut. Live slippage TBD from ACT-506; re-run + diff when landed.
5. **2× margin-interest line is a modeling assumption** at 50 bps/month flat; real broker margin schedules are tiered and rate-regime-dependent. This is a first-order charge, not an exact broker P&L.
6. **Reg-T call check is a flag, not a liquidation engine.** The sim rides through calls that would have force-liquidated in reality. Days-in-call is a DEPLOYMENT-VIABILITY signal for the 2× row, not a P&L drag.
7. **Composition-under-scarcity is now MEASURED, not modeled.** The 40-lot admitted basket in (a) and (b) is what the ranker actually selected on those days — no proxy, no assumption.

## 4. Pre-commit stamp

**Report the numbers whatever they say.** No knob-tuning post-hoc. The leverage-table review already vetoed one shortcut; this charter exists to replace estimates with measurements. If measured 2× DD exceeds SPY DD, that's the number. If 1× DD is inside SPY, that's the number. Phase-L margin decision is downstream of this deliverable.

## 5. Sequencing

- **Fires now.** Parallel to ACT-493 exit-engine work, ACT-506/507/508 W5 measurement, ACT-510 T+6 exits, ACT-512/513 `account_id` migration. Read-only, corpus-based, no money-path touch.
- **Not blocked by** ACT-506 (will re-run + diff when live haircut lands; charter ships on study-ratified haircut).
- **Blocks Phase-L margin-funding decision** — the deployable risk profile lives in this deliverable's 2× row.
- ACT-516 (H1-2022 cost quote) and ACT-517 (survivorship deflator methodology) proceed in parallel as ratified.

## 6. Cross-refs

ACT-514 (parent — uncapped strategy-edge upper bound); ACT-473 (regime N=1 stamp); ACT-478 (regime classifier); ACT-506/507/508 (W5 live slippage); ACT-510 (T+6 exits + tier horizons); ACT-512/513 (account_id — single-account today); INC-96 (`evaluateAllocationCap` semantics ratified in `supabase/functions/_shared/overshoot-execution/allocation-cap.ts`).

## 7. Files this charter will produce (on delivery, not now)

- `docs/08-planning/artifacts/ACT-515-DELIVERABLE-capped-tri-config-leverage-table.md` — the readout.
- Tracker entry with the five-row leverage table inlined at delivery.

**STATUS AT FILING:** charter ratified; sim not yet run; NO numbers quotable from this charter alone. Deliverable to follow.