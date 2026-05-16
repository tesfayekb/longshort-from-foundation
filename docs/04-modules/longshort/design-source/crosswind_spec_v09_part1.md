# Crosswind — v1 Strategy Specification

**Document:** CROSSWIND_SPEC.md
**Version:** v0.9
**Date:** May 15, 2026
**Project:** Crosswind — continuously-ranked, dollar-neutral long-short single-name US equity strategy
**Document tier:** Tier 1 (Strategic specification — single source of truth per §12.2)

**Sections added in this version:**

- §10.4 Phase 0B (Reconciliation engine + replay framework + evidence tooling)
- §11.0 (Reconciliation foundational layer)
- §11.8 (Sentinel fallback prohibition)
- §11.9 (Intraday-time discipline)
- §11.10 (Replay framework requirement)
- §12.5.1 (Evidence hierarchy table with CI enforcement)
- §12.10 (AI failure-mode logging)
- §6.5 (Missing-data feature engineering)

**Sections substantially revised in this version:**

- §4.3 (Missing-data behavior — Option E architecture)
- §6.4 (Failure fallback — count-normalized average)
- §7 (Reconciliation sequences for 8 mutation types + FIFO lot policy + wash sale Path A/B + retroactive cost-basis adjustment)
- §8 (Two-phase order state machine + SSR routing strictly above NBB + partial-fill discipline + broker rejection propagation)
- §10 (Phase 0A/0B split + dual exit gates + Phase 8 calibration window + sustained-anomaly kill + ROI honest framing)
- §11.6 (Sustained reconciliation anomaly trigger)
- §12.5 (Rules 8-10 added + evidence hierarchy)
- §16 (5 v0.9 deferred items added)

**Sections pending (deferred to v0.10 or later):**

- §13 (Schema and infrastructure)
- §14 (Critical risks and mitigations)
- §15 (Operational procedures)

**Previous version:** v0.8 (locked §9 cost model capital-agnostic, §10 phase plan 10-phase structure)

**Companion documents added:**

- docs/decisions/ADR-001-reconciliation-architecture.md
- docs/decisions/spec-source-index.md
- docs/missingness_profile.md (operational, populated during Phase 2)
- docs/ai-failure-modes.md (operational, maintained ongoing)
- docs/replay/captures-index.md (operational, manifests of captured days)

**Spec-lock significance:** v0.9 is the foundation against which Phase 0A can begin. v0.9 architectural commitments are binding; subsequent versions add §13/§14/§15 when concrete implementation decisions inform their content.

**Consolidation note:** This file is Part 1 of 10 consolidation responses. Part 1 covers §0-§5. Parts 2, 2b, 2c cover §6-§9 (with §7 and §8 v0.9 architectural additions in dedicated follow-up parts). Parts 3a, 3b cover §10. Parts 4a, 4b cover §11-§18. Parts 5, 6 cover companion documents (ADR-001-reconciliation-architecture.md, spec-source-index.md). *(v0.9 final-assembly polish: "Part 1 of 8" → "Part 1 of 10" reflecting the Part 2 → 2/2b/2c split, Part 3 → 3a/3b split, and Part 4 → 4a/4b split adopted during consolidation.)*

---

## 0. Project identity

**Name:** Crosswind.

**One-line description:** A continuously-ranked, dollar-neutral long-short single-name equity system for US large/mid-cap stocks.

**Infrastructure isolation:** Fully isolated. Crosswind owns its own repo, Supabase project, Modal account/workspace, and data subscriptions. No shared infrastructure with any other project. Coupling is the silent killer of multi-project setups; isolation is the right default for v1.

**Project audience:** Primarily single-operator project for v1. Architecture preserves multi-instance / multi-user deployment optionality (§9.7) without building it in v1.

**Capital framing:** Crosswind is capital-agnostic by design. All position sizing, caps, and cost analysis are expressed as percentages of deployed capital, not specific dollar amounts. The one exception is Phase 7 paper trading, which uses $100K as a reference account size for validation analysis (§9.5).

---

## 1. Strategy concept (LOCKED)

### 1.1 Core mental model

Crosswind is a **continuously-ranked long-short equity system** that maintains **dollar neutrality** between long and short books. The ranked list of 40 names (20 long, 20 short) is the *state* of the strategy, and the state updates throughout the trading day as new signals arrive and old signals decay.

Position membership follows the list:

- In the top 20 long → hold long.
- In the bottom 20 short → hold short.
- Out of either list → close (subject to entry/exit hysteresis defined below).

Three properties this implies:

1. **Continuous (or near-continuous) signal updates.** Signals decay and refresh during the day. The ranking at 14:00 ET is not the ranking at 09:30 ET. The system supports this by design.
2. **Trades are list-change-driven, not schedule-driven.** The strategy does not rebalance "at 10am" or "at close." Trades fire when a name enters or exits the book per the rules below. Most names stay in their position; only ranking-boundary names churn.
3. **Overnight holds are fine when justified.** A name in the top 20 long at close stays long overnight. The system is not structurally trying to be flat into the close — it is structurally trying to hold the best 40 names. If those names have favorable signals into the close, positions carry overnight.

**Dollar neutrality, not market neutrality:** Long and short book gross dollar exposures are kept matched (within 90-110% band per §1.6). However, sector tilt is allowed to float — Crosswind does NOT enforce strict matching of long-side and short-side sector weights. Sector exposure follows where signals find conviction. See §7.1 for sector handling details.

### 1.2 What Crosswind is *not*

To prevent identity drift in later design:

- Not an intraday catalyst-chasing system. Catalysts feed the signal stack, but the strategy is not "detect catalyst, ride it for hours, exit." It is "maintain best-ranked book continuously."
- Not a daily-rebalanced batch system. Rebalancing is event-driven by list changes, not scheduled.
- Not an HFT system. Fast execution is desirable; sub-second latency is not required. Standard retail-broker API speeds (hundreds of ms) are acceptable.
- Not a fundamental-investing system. Selection is based on dynamic catalyst and behavioral signals, not P/E, P/B, or dividend yield as primary inputs.
- Not a leveraged strategy in v1. 100% gross exposure, no margin borrowing.
- Not a market-direction prediction system. The strategy is market-neutral by construction.
- **Not a strictly market-neutral strategy.** Dollar-neutral, sector-tilt-tolerant.

### 1.3 Book size and structure

**Target book size:** 20 longs + 20 shorts.

**Maximum book size (cap):** 25 longs + 25 shorts.

**Minimum book size:** No floor enforced. In normal operation, books should be at or near 20 each.

### 1.4 Position lifecycle

**Entry rule:**
A name enters the long book when its combiner-ranked position crosses to **≤20** in the long ranking (i.e., it becomes one of the top 20 long candidates).

A name enters the short book when its combiner-ranked position crosses to **≤20** in the short ranking (i.e., it becomes one of the top 20 short candidates, ranked from the bottom of the universe).

If the relevant book is already at the cap of 25 names, the new entry is **rejected**. The system waits for an existing holding to exit naturally before accepting the new name. There is no bumping of the lowest-ranked current holding.

**Exit rule:**
A name exits the long book when its combiner-ranked position crosses to **>30** in the long ranking.

A name exits the short book when its combiner-ranked position crosses to **>30** in the short ranking.

When a name exits, its position is fully closed (not partially trimmed).

**Hysteresis (the gap between entry threshold ≤20 and exit threshold >30):**
The buffer zone is rank 21-30. Names in this zone neither enter nor exit. A name oscillating between rank 19 and rank 22 does not churn — it entered at some prior moment when it was rank ≤20, and it has not yet fallen to rank >30 to trigger exit.

This eliminates intraday churn at the boundary, which would otherwise generate unnecessary slippage, wash sale events, and operational noise.

**Conditional 31-day re-entry block (HARD RULE — REVISED v0.7):**

When a position exits, the system computes realized P&L on that exit using lot-level accounting:

- **If realized P&L ≥ 0 (profitable or breakeven):** No re-entry block. Name is immediately eligible to re-enter based on rank.
- **If realized P&L < 0 (loss):** Standard 31-day calendar-day re-entry block applies.

Rationale: IRS wash sale rule applies only to losses. Conditional blocking captures ~1-3% additional annualized alpha vs. universal blocking, at the cost of more complex bookkeeping.

**Retroactive wash sale risk handling:** When a profitable exit re-enters and subsequently exits at a loss within 30 days, the disallowed loss attaches to subsequent share purchases via cost-basis adjustment. System tracks via `wash_sale_events` table.

**No dual-criterion exit, no passive holds in v1:**
A name that drops out of the top 20 not because its own signal deteriorated, but because other names overtook it, is closed regardless. v1 uses pure ranking-based exit.

This is *known* to cost some alpha (force-closes names whose signals are still positive). It is accepted in v1 to keep portfolio construction simple and to preserve clean market neutrality. A more sophisticated dual-criterion exit with passive holds is a candidate enhancement for v2.

### 1.5 Position sizing

**Per-name target size at entry:** 2.5% of current invested capital.

**At full capacity, both books at 20 names:**

- Long book gross: 50% of invested capital
- Short book gross: 50% of invested capital
- Total gross exposure: 100% of invested capital
- Net market exposure: 0% (dollar basis)

**Leverage:** None. Strategy operates at 100% gross, achievable in any standard margin account without portfolio margin approval.

**Sizing rule (Rule 1, continuous, both directions):**
At the moment of entry, a new position is sized at 2.5% of *current* invested capital.

*Worked example (capital-agnostic):* If account grows by 10% from any baseline, the next entry is sized 10% larger than prior entries. If account shrinks by 10%, the next entry is sized 10% smaller. Existing positions hold their original sizes.

Existing positions are **not disturbed**. They remain at their entry size unless trimmed by the dollar-balance rebalancing rule (§1.6).

The book gradually rotates through size changes via natural turnover. After several weeks of normal entries and exits, all positions are at the new size.

Rationale: avoids artificial trades to re-size existing positions on every account balance change. Each trade in the system is a real entry, real exit, or real rebalance trim — no sizing-only trades.

**No drawdown-triggered position trim:**
The system does not have a special rule for account drawdowns. In a drawdown, losing names will naturally fall in rank and exit via the normal mechanism. Replacement entries are sized to the smaller capital base via Rule 1. The system self-corrects through normal turnover.

### 1.6 Dollar-balance rebalancing

**Purpose:** Preserve market neutrality on a *dollar* basis (not just a name-count basis). The long and short books drift in dollar value as positions appreciate or depreciate, even when name counts are equal. This rule prevents that drift from accumulating into meaningful directional exposure.

**Cadence:** Once daily at end of session.

**Check:**
Calculate the ratio of long-side gross dollars to short-side gross dollars. If the ratio is **outside the band 90%-110%**, trigger a rebalance. Otherwise, no action.

Examples:

- Long $50K, short $48K → ratio 104% → in band → no action.
- Long $55K, short $48K → ratio 115% → out of band → trim long.
- Long $45K, short $52K → ratio 87% → out of band → trim short.

**Action: trim-only, proportional.**
Trim each position on the over-exposed side by the same percentage of its current value, until the ratio returns to within the 90%-110% band.

The under-exposed side is **never added to**. No new positions are opened to backfill, no existing positions are scaled up.

Rationale: trim-only rebalancing has the property of *self-correcting risk management*:

- Winning streaks naturally see the winning side grow → trim → realized gains on winners.
- Losing streaks see the losing side shrink → trim the (winning) other side → reduced gross exposure overall.
- Total gross exposure floats naturally. The system de-risks in unfavorable regimes and compounds in favorable ones, automatically.

Adding to the under-exposed side would mean averaging down on losing positions — explicitly bad discipline.

**Tax treatment:**
Each trim realizes gains (or partial gains) on the trimmed positions. These are short-term capital gains in nearly all cases. This is accepted as part of the strategy. Crosswind's holding periods are short by design; the strategy was already paying short-term rates on natural exits, so rebalance-induced gains do not introduce a new tax bracket.

### 1.7 Tax structure

**Trader Tax Status (TTS) and §475(f) mark-to-market election:** Not applicable for v1 single-operator default. Operator does not qualify.

**Implications:**

- Wash sale rule applies in full.
- Conditional 31-day re-entry block (§1.4) is a permanent feature.
- Realized losses subject to capital loss limitations ($3,000/year against ordinary income, remainder carried forward).
- System tracks realized gains, losses, and disallowed-wash-sale amounts per position.
- TTS / §475(f) revisit deferred to v2 considerations once deployed capital scales meaningfully (per §9.6).

---

## 2. Why this strategy class — high level (LOCKED)

The strategy is a dollar-neutral long-short equity system because:

- Cross-sectional ranking is statistically easier than absolute direction prediction. Predicting "name A outperforms name B" requires modeling only the differential; market and sector effects largely cancel between similar names.
- Long-short construction cancels variance, lifting Sharpe ratio for a given alpha.
- Profits are achievable in any market direction (dollar neutrality cancels common-mode market exposure; sector tilt remains a real factor) — long-only systems lose in bear markets even when picks are correct.
- Public data is sufficient for the catalyst and behavioral signals the strategy uses.
- Documented academic foundation: cross-sectional momentum, post-earnings drift, analyst revision drift, and options-flow signals all have 20+ year published literature confirming persistence.

This strategy is harder to build correctly than directional prediction because:

- Higher idiosyncratic risk per name. A single short can move 20% on news.
- Short side has asymmetric tail risk (short squeezes).
- Sector entanglement remains since strict sector neutrality is not enforced.
- Universe management is computationally heavier than index-based strategies.

### 2.1 Realistic expected returns (v1, 100% gross construction) — REVISED v0.8

Crosswind v1 operates at 100% gross / no leverage. Based on cross-sectional ranking strategy literature and small-capital concentration advantages:

| Outcome | Probability | Annualized Net Return | Sharpe |
|---|---|---|---|
| Excellent (favorable regime + signal performance) | ~15% | +18% to +28% | 1.5-2.2 |
| Good (works as designed) | ~40% | +10% to +18% | 1.0-1.6 |
| Mediocre (real but small edge) | ~30% | +4% to +10% | 0.5-1.0 |
| Bad (signals decay or costs eat returns) | ~10% | -3% to +4% | 0.0-0.4 |
| Failure | ~5% | -8% or worse | negative |

**Probability-weighted expected: +10-14% annualized of deployed capital after costs and taxes** for a well-built v1.

Returns are expressed as percentages of deployed capital and apply regardless of capital magnitude (above the fixed-cost breakeven threshold defined in §9.3).

Future versions with leverage may approximately double these numbers (with corresponding doubling of downside).

Crosswind will not deliver 50%/year sustainably. That target is not achievable on retail public-data infrastructure regardless of strategy choice.

---

## 3. Universe definition (LOCKED)

### 3.1 Universe base (LOCKED)

**Universe base:** S&P 500 + S&P 400 MidCap.

**Approximate raw size:** ~900 unique names.

**Rationale:**

- S&P 500 alone provides too little cross-sectional dispersion. Names are heavily covered, catalysts price in fast, edge per name is small.
- Adding S&P 400 MidCap captures the tier where cross-sectional ranking has the strongest documented edge — less analyst coverage, slower price discovery, more catalyst drift opportunity.
- Adding S&P 600 SmallCap (Option D considered and rejected) would provide more raw "movers" but adds material costs: wider spreads, lower borrow availability on shorts, materially higher short-squeeze risk, capacity constraints at scale.
- Phase 0 backtest may revisit the small-cap question if the strategy is starved for cross-sectional dispersion. Default v1 stance: stay with mid-cap and above.

### 3.2 Universe filters (LOCKED)

The following filters are applied to the raw S&P 500 + S&P 400 universe to produce the eligible universe.

| Filter | Threshold | Rationale |
|---|---|---|
| Average daily dollar volume | ≥ $20M (60-day lookback) | Adequate liquidity for 2.5% positions up to ~$5M capital. Aligns with institutional standard. |
| Share price | ≥ $5 | Avoids penny-spread execution problems. Aligns with broker shortability rules. |
| Market cap | ≥ $1B | Backstop against names that have fallen below S&P inclusion threshold but not yet been removed. |
| Listing age | ≥ 1 year | Avoids IPO instability, lockup-expiration shocks, and insufficient signal-history. |
| Country / listing | Include all index members regardless of country of incorporation; exclude ADRs | S&P 500 includes legitimate foreign-domiciled names that trade like US stocks. ADRs have different reporting and overnight gap patterns. |
| Asset class | Exclude REITs | REITs respond to interest rates more than company-specific catalysts; signal-response patterns differ from operating companies. Excluding cleans the combiner. |

**Eligible universe size after filters:** ~750-820 names.

### 3.3 Hard exclusions (LOCKED)

In addition to §3.2 filters (which determine universe membership), these *event-conditioned* exclusions determine whether an in-universe name is currently *tradeable*. Names matching any exclusion below are blocked from entry and force-closed if currently held.

| Exclusion | Rule |
|---|---|
| **3.3a Earnings windows** | Force exit and block entry for names within **2 trading days before scheduled earnings session**. Re-eligible the trading day **after** the earnings session. |
| **3.3b M&A** | Exclude announced M&A *targets* from both books until deal closes or breaks. Exclude *acquirers* only if deal is >25% of acquirer market cap. |
| **3.3c Halts** | Exclude names halted in prior 5 trading days. |
| **3.3d Hard-to-borrow** | Pre-trade check before short entry. Skip if broker flags as HTB or borrow rate >5% annualized. Long book unaffected. |
| **3.3e Short interest** | Exclude from *short book* names with short interest >25% of float (per latest SEC semi-monthly report). Long book unaffected. |
| **3.3f Secondary offerings** | Not a v1 exclusion. Captured indirectly by other signals (insider transactions, news sentiment). Phase 0 may revisit. |
| **3.3g Going concern / SEC investigation** | Not a v1 exclusion. Mostly captured by §3.2 market cap floor and signal stack. Revisit if a clear failure mode emerges. |
| **3.3h Sector restrictions** | None. No sector-level exclusions in v1. |

**Trading-day calendar discipline:**
All "X trading days before/after" calculations use the actual NYSE/NASDAQ market calendar, excluding weekends and exchange holidays. The earnings calendar feed must include the time-of-day flag (BMO = before market open, AMC = after market close, intraday) to determine which session counts as "the earnings session."

Worked examples:

- Earnings AMC Friday → close position by end of Wednesday (2 trading days before Friday, accounting for Wed/Thu being the 2 days). Re-eligible Tuesday open.
- Earnings BMO Monday → close position by end of Wednesday (Friday and Thursday are the 2 trading days before Monday's earnings, so the close-by deadline is end of Wednesday). Re-eligible Tuesday open.
- Earnings Thursday AMC during a week with Wednesday holiday → 2 trading days before Thursday are Tuesday and Monday. Close position by end of Friday of prior week. Re-eligible Friday (day after earnings).

### 3.4 Refresh cadence (LOCKED)

**Universe membership refresh: atomic, quarterly.**
First trading day of January, April, July, October. A single cron job pulls latest S&P 500 + S&P 400 constituent lists, applies filters, outputs the new universe ticker list. Atomic operation — no chunked rollout. Computation is small (kilobytes of data, minutes of runtime).

Once a quarter is set, it is frozen for that quarter. Mid-quarter index changes by S&P committees do not enter the Crosswind universe until the next quarterly refresh. This prevents survivorship-bias-like adaptation.

**Hard-exclusion refresh: continuous.**
The §3.3 exclusion lists update as triggering events occur: earnings calendar updates daily, M&A announcements update on press release, halts update real-time, hard-to-borrow status updates on each broker check, short-interest exclusions update twice monthly with SEC reports.

**Historical signal backfill: chunked, on-demand operational procedure.**
When backfill is needed (initial system bring-up, signal definition change, data gap recovery), chunk the work by ticker alphabetically across multiple sessions to manage API rate limits and compute cost. This is not a regular cadence — it's an operational procedure that runs when triggered.

**Daily signal computation: incremental, automated.**
Each day's new data is processed for all in-universe tickers as it arrives. Continuous ingestion, not a "refresh" in the sense above.

---

## 4. Signal stack architecture (LOCKED)

### 4.1 Signal weighting approach (LOCKED for v1)

**v1 uses static learned weights via the combiner.**

The combiner (a learning-to-rank model — architectural details in §6) takes the per-signal scores for each name and produces a final composite ranking score. The weights it gives to each signal are *learned from training data*, not hand-set, and are *static within a training window* — re-learned weekly when the model retrains, but constant during the week.

**Quarterly ablation studies retire underperforming signals.**
Every quarter, run an ablation: turn each signal off, measure how much strategy performance degrades. Signals whose removal doesn't hurt performance over the trailing 6-12 months are candidates for retirement. This is auditable, semi-automated governance.

**Modular and diagnosable.**
v1 must be designed so that:

- Each signal's contribution is traceable per ranking event (SHAP values on the combiner output).
- Each signal's data source is independently inspectable.
- A degraded or broken signal can be isolated and disabled without taking the whole system down.
- The system is ready for expansion into v2 capabilities (see below) without architectural rewrite.

**v2 candidates (NOT for v1):**

- AI-based dynamic signal weighting (live LLM or specialized ML model judging signal importance in real-time, adapting weights per regime / per sector / per name).
- Regime-conditional weights (separate combiner weights for distinct market regimes).
- Narrow LLM-based news classification layer to improve the news sentiment signal specifically.

**v1 must capture all data needed to enable v2 augmentation later.** Specifically: per-signal scores per name per polling tick, per-position attribution showing which signals drove each pick, realized returns per position. The data plumbing in v1 is the prerequisite for v2 research.

### 4.2 Signal list (LOCKED)

Crosswind v1 uses **9 signals**, balanced across four information-channel families. The original quality factor was dropped due to horizon mismatch with Crosswind's days-to-weeks holding period.

| # | Family | Signal | Half-life | Cadence |
|---|---|---|---|---|
| 1 | Analyst | Analyst revision drift | 5 days | 15 min intraday + pre-market polls |
| 2 | Analyst | PEAD (post-earnings drift) | 20 trading days | Event-triggered + 15 min refresh |
| 3 | Flow | Options flow imbalance | 48 hours | 5 min during market hours |
| 4 | Flow | Insider transactions | 14 days | 30 min during market hours |
| 5 | Flow | Short interest changes | None (step function) | Twice monthly on SEC release |
| 6 | Technical | 12-1 momentum | None (rolling window) | Daily after close |
| 7 | Technical | Short-term reversal | None (rolling window) | Daily after close |
| 8 | News/Catalyst | News sentiment momentum | 24 hours | 5 min during market hours |
| 9 | News/Catalyst | Active catalyst flag | Per-event (24-96h) | 5 min during market hours |

**Stack composition principle:** Two signals per family (Analyst, Flow, Technical, News/Catalyst) plus one additional Flow signal. Mix of fast-moving (catalyst capture) and slow-moving (stable cross-sectional anomalies). Every signal has documented forward-predictive value in academic literature; there are no signals included for descriptive purposes only.

**Signal count discipline:** 9 is well under the overfitting risk threshold (~15 for a 5-year training window) and provides robustness against single-signal degradation. Adding signals beyond ~12 requires Phase 0 ablation evidence of meaningful out-of-sample edge.

### 4.3 Cross-cutting signal decisions and missing-data behavior (REVISED v0.9)

**Architectural principle: Act on information with bounded latency.** Polling cadence per signal tuned to the signal's alpha decay rate. Combiner re-ranks the universe whenever any signal materially changes — roughly 50-80 ranking computations per trading day. Polling with bounded latency, not streaming with sub-second response.

**Decay model: Exponential.** `weight(age) = exp(-age / half_life)`. Half-life tuned per signal.

**Normalization scheme: within-sector GICS z-score, clipped at ±3.** Sector-level effects handled implicitly by within-sector normalization; market-level effects cancelled by cross-sectional ranking by construction.

**Sector classification:** GICS at the 11-sector level.

**Backup data source requirement.** Every signal must specify primary AND backup data source.

**Sign convention:** long candidates have high positive z; short candidates have low negative z; neutral/missing at z=0. Where natural raw signal points wrong way, raw value is negated before z-scoring.

#### §4.3.5 — Missing-data behavior (Option E architecture) (NEW v0.9)

**The v0.7 default of "neutral z=0 for missing data" is replaced with the Option E architecture.** Silent imputation of missing values to neutral creates the failure mode codified in ADR-001 §1: missing data becomes indistinguishable from real weak signal, and downstream code consumes both identically.

**Type discipline.** Every signal-producing function returns `Optional[Decimal]`, not raw `Decimal`. `None` is the canonical representation of "no value available." Type signatures make missing-data syntactically distinct from any value.

**Critical vs non-critical signal classification.**

| Classification | Signals | Missing-data behavior |
|---|---|---|
| **Critical** | #6 (12-1 momentum), #7 (short-term reversal) | If missing, the name is **excluded from ranking** for this tick. |
| **Non-critical** | #1, #2, #3, #4, #5, #8, #9 (7 signals) | If missing, contributes `(value=Decimal('-999'), is_present=0)` to combiner feature vector per §6.5. |

Rationale for critical classification: Both #6 and #7 are computed from adjusted prices, which are universally available for any name in the universe with 252 trading days of history (§4.4.1 filter). Missing critical signals indicates a data-pipeline or universe-filter defect, not a legitimate signal-source gap. Excluding the name surfaces the defect.

Rationale for non-critical classification: The other 7 signals have legitimate "no observation" cases (no recent analyst revisions, no insider trades, no options flow this week, no news events). Missing is structurally distinct from absent-by-information-absence; the combiner needs to learn the difference.

**Imputation threshold for non-critical signals.**

If **>4 of 7 non-critical signals** are missing for a name, the name is **excluded from ranking** for this tick regardless of critical-signal presence. Minimum signal coverage required: 2 critical + 3 non-critical = 5 of 9 signals.

Rationale: Below 5 signals, the combiner is ranking on too little information to produce trustworthy output. Cross-confirmation across signal families is the architectural assumption; insufficient coverage breaks that assumption.

**Held-position critical-signal-missing escalation.**

If a currently-held position has a critical signal (#6 or #7) missing for **>24 hours cumulative**, escalate to operator (Strong tier alert per §11.0.9). A held position with missing critical signal cannot be ranked, which means its exit logic cannot evaluate; the position is in operational limbo.

Resolution paths: (a) restore critical signal data within 24 hours, (b) operator manually evaluates and force-exits the position, (c) the §3.3 hard-exclusion mechanism is the right path if the underlying name has a data-quality issue, not a Crosswind defect.

**Banned patterns enforced via §11.8.** The following are prohibited in any signal-producing or signal-consuming code:

- `value = redis.get(key) or "0"` and structural equivalents
- `signal_score.get('value', 0)` and equivalents
- `value or 0` for financial values
- `float(optional_value)` without explicit `None` check
- Hardcoded financial magic numbers (`SPX = 5200.0`, `sigma = 0.15`, etc.)
- Emitting `Decimal('-999')` outside the §6.5.6 feature-vector construction layer

Linting enforcement and CI integration per §11.8.4.

### 4.4 Per-signal specifications (ALL LOCKED)

#### §4.4.1 — Signal #6: Cross-sectional momentum (12-1)

- **Definition:** `(P[T-21] / P[T-252]) - 1`, adjusted prices. Excluding most recent month avoids reversal contamination.
- **Data source:** Polygon Stocks Advanced primary; Yahoo, Tradier, IBKR backup.
- **Cadence:** Daily, end of session.
- **Decay:** None explicit. Lookback window naturally shifts.
- **Normalization:** Within-sector GICS z-score, clipped at ±3.
- **Missing-data (per §4.3.5 critical classification):** Name excluded from ranking when fewer than 252 trading days of history. Function returns `None` (Optional[Decimal]); caller branches on `None` per §11.8.3 required pattern.

#### §4.4.2 — Signal #7: Short-term reversal (1-week)

- **Definition:** `-1 × ((P[T-1] / P[T-6]) - 1)`. Negated 5-trading-day return; converts high recent return into short-candidate signal.
- **Data source:** Same as momentum.
- **Cadence:** Daily, end of session.
- **Decay:** None explicit. Implicit decay via 5-day rolling window.
- **Normalization:** Within-sector GICS z-score, clipped at ±3.
- **Missing-data (per §4.3.5 critical classification):** Name excluded from ranking when fewer than 6 trading days of history. Function returns `None`.
- **Note on horizon separation:** Reversal (T-1 to T-6) and momentum (T-21 to T-252) lookbacks are non-overlapping. The 21-day transition zone in between is unused — intentional.

#### §4.4.3 — Signal #5: Short interest changes (30-day)

- **Definition:** `signed_signal = -(SI_pct_float[T] - SI_pct_float[T-2_reports])`. Falling SI → bullish; rising SI → bearish.
- **Data source:** Polygon (verify Phase 0); FINRA/EDGAR direct as backup.
- **Cadence:** Twice monthly, on SEC report releases.
- **Decay:** None explicit. Step function between reports.
- **Normalization:** Within-sector GICS z-score, clipped at ±3.
- **Missing-data (per §4.3.5 non-critical classification):** Returns `None` when no current SEC report. Contributes `(value=Decimal('-999'), is_present=0)` to combiner per §6.5.
- **Interaction with §3.3e:** Names with SI >25% excluded from short book regardless; level filter and change signal coexist.

#### §4.4.4 — Signal #4: Insider transactions (90-day, 14-day half-life)

- **Definition:** Decayed weighted sum of informative insider transactions.
    - **Filter:** Open-market purchases (P) and discretionary sales (S, excluding 10b5-1). Exclude option exercises (M, C), RSU vests (A), gifts (G).
    - **Role weights:** CEO/CFO 1.0; NEOs 0.7; Section 16 officers 0.4; independent directors 0.3; 10%+ owners 0.5.
    - **Formula:** `raw_signal_N = sum_over_90d(shares × price × sign × role_weight × exp(-age_days / 14)) / market_cap`
- **Data source:** Polygon insider endpoint primary (verify Phase 0 for transaction codes and 10b5-1 flag); SEC EDGAR Form 4 XML direct as backup.
- **Cadence:** 30 min polling during market hours; daily catch-up after close.
- **Decay:** Exponential, 14-day half-life within 90-day window.
- **Normalization:** Within-sector GICS z-score, clipped at ±3.
- **Missing-data (per §4.3.5 non-critical classification):** Returns `None` when no Form 4 in trailing 90 days (expected case for most names). Contributes `(value=Decimal('-999'), is_present=0)` to combiner.

#### §4.4.5 — Signal #1: Analyst revision drift

- **Definition:** Sum-with-decay across recent revisions:

```
signal_N = sum over R in trailing 30d:
  direction(R) × min(|magnitude(R)|, 0.50) × analyst_credibility_weight(R) × exp(-age_days / 5)
```

Per-revision approach (responsive to single new revisions) rather than consensus-average smoothing.

- **Data source:** Polygon with Benzinga pass-through primary; Benzinga API direct backup; Yahoo Finance tertiary.
- **Cadence:** 15 min during market hours; 06:30 ET and 08:30 ET pre-market polls; 30 min after-hours.
- **Decay:** Exponential, 5-day half-life.
- **Normalization:** Within-sector GICS z-score, clipped at ±3.
- **Missing-data (per §4.3.5 non-critical classification):** Returns `None` when no analyst revisions in trailing 30 days or insufficient analyst coverage. Contributes `(value=Decimal('-999'), is_present=0)` to combiner.
- **Edge cases:** Coverage initiations and rating reiterations count as zero. Revision magnitude capped at 50%.

#### §4.4.6 — Signal #2: PEAD (post-earnings drift)

- **Definition:** SUE-based with continuous time decay.

```
SUE = (actual_EPS - consensus_estimate_EPS_at_T-5_days) / std_dev_of_estimates
signal_N(t) = SUE × exp(-trading_days_since_earnings / 20)
```

Trading-day-counted decay (weekends/holidays don't advance).

- **Data source:** Polygon with Benzinga primary; direct Benzinga, Tradier, or computed-from-raw as fallbacks.
- **Cadence:** Earnings-event-triggered. Decayed value recomputed at 15 min ticks during market hours.
- **Decay:** Exponential, 20-trading-day half-life.
- **Normalization:** Within-sector GICS z-score, clipped at ±3.
- **Missing-data (per §4.3.5 non-critical classification):** Returns `None` when most recent earnings is >60 trading days stale or when SUE cannot be computed. Contributes `(value=Decimal('-999'), is_present=0)` to combiner.
- **§3.3a interaction:** SUE computed AMC/BMO; affected name re-eligible the trading day after earnings.

#### §4.4.7 — Signal #3: Options flow imbalance

- **Definition:** Aggressive smart-money flow imbalance with decay.

```
For each filtered trade in trailing 5 trading days:
  direction = +1 (call buy at ask) or (put sell at bid)
              -1 (put buy at ask) or (call sell at bid)
  weight = trade_notional × exp(-age_in_hours / 48)
raw_signal_N = sum(direction × weight) / total_options_volume_N_5d
```

- **Smart-money filter:** ≥100 contracts; aggressive (at-or-near ask/bid); 7+ days to expiration; OTM or ATM strikes only.
- **Data source:** Polygon Options Advanced primary ($199/mo — verify subscription); Tradier backup; treat as missing if both fail.
- **Cadence:** 5 min during market hours; end-of-session catch-up after-hours.
- **Decay:** Exponential, 48-hour half-life. 5-day window cutoff.
- **Normalization:** Within-sector GICS z-score, clipped at ±3.
- **Missing-data (per §4.3.5 non-critical classification):** Returns `None` when no options trading in 5 days, fewer than 5 qualifying smart-money prints, or feed unavailable. Contributes `(value=Decimal('-999'), is_present=0)` to combiner.
- **Computational note:** Highest-cost signal. ~30-50% of daily compute budget.

#### §4.4.8 — Signal #8: News sentiment momentum (7-day)

- **Definition:** Decayed source-weighted sentiment sum.

```
For each article A about name N in trailing 7 days:
  sentiment_A = provider_sentiment(A)        // -1 to +1
  source_weight(A) = 1.0 (tier-1: Reuters, Bloomberg, WSJ, FT, Dow Jones)
                     0.7 (tier-2: CNBC, Forbes, Barron's, NYT business)
                     0.4 (tier-3: Yahoo Finance, MarketWatch, aggregators)
                     0.1 (tier-4: blogs, regional, low-quality)
  age_weight(A) = exp(-age_in_hours / 24)
raw_signal_N = sum(sentiment_A × source_weight(A) × age_weight(A))
```

- **Source filtering:** Wire + major newspapers + business publications. Press releases excluded.
- **Sentiment classification:** Provider pre-classified (Polygon/Benzinga); FinBERT local fallback. LLM-based classification deferred to v2.
- **Data source:** Polygon News with Benzinga primary; Benzinga direct backup; NewsAPI.org tertiary.
- **Cadence:** 5 min during market hours; 15 min after-hours.
- **Decay:** Exponential, 24-hour half-life within 7-day window.
- **Normalization:** Within-sector GICS z-score, clipped at ±3.
- **Missing-data (per §4.3.5 non-critical classification):** Returns `None` when no articles in 7-day window or feed unavailable. Contributes `(value=Decimal('-999'), is_present=0)` to combiner.
- **Multi-ticker articles:** Full sentiment to primary subject ticker; partial weight (divided by mentioned tickers) when no primary tag.

#### §4.4.9 — Signal #9: Active catalyst flag

- **Definition:** Decayed weighted sum of detected catalyst events.

```
For each catalyst event E for name N in trailing 5 trading days:
  catalyst_weight(E) = 3.0 (Tier 1) | 1.5 (Tier 2) | 0.5 (Tier 3)
  age_weight(E) = exp(-age_in_hours / catalyst_specific_half_life)
raw_signal_N = sum(catalyst_weight(E) × age_weight(E))
```

- **Catalyst tiers:**
    - **Tier 1 (3.0):** Earnings; M&A; FDA approval/rejection/advisory; regulatory action; major guidance update; CEO/CFO change
    - **Tier 2 (1.5):** Major analyst rating/coverage; material partnership/contract; buyback/dividend change; significant insider transaction; stock split/special dividend
    - **Tier 3 (0.5):** Minor analyst rating change; conference; non-material product launch; investor day
- **Catalyst-specific half-lives:** Earnings 48h; M&A 96h; FDA 72h; Regulatory 96h; Guidance 48h; Executive change 72h; Analyst change 24h; Other Tier 2/3 24-48h.
- **Active window:** 5 trading days lookback.
- **Sign:** Unsigned (always positive). Direction captured by other signals.
- **Data source:** Polygon News + Polygon Reference + SEC EDGAR primary; Benzinga direct, Tradier corporate actions backup.
- **Cadence:** 5 min during market hours; 15 min after-hours.
- **Normalization:** Within-sector GICS z-score, clipped at ±3.
- **Missing-data (per §4.3.5 non-critical classification):** Returns `None` when no catalyst events in window (expected case for most names). Contributes `(value=Decimal('-999'), is_present=0)` to combiner.

---

## 5. Open design questions (NOT YET LOCKED)

The following remain deferred to v0.10 or later. v0.9 locks the architectural foundation; these sections require Phase 0A implementation experience before they can be drafted without premature lock-in.

- **§13 Schema and infrastructure.** Database tables, ingestion pipelines, monitoring, drift detection. Depends on Phase 0A schema decisions (operator_id keying patterns per §9.7, reconciliation_events table per §11.0.10, captures-index per §11.10.5).
- **§14 Critical risks and mitigations.** Universe selection bias, sector concentration, short squeeze risk, signal stack overfitting. Risk inventory builds on Phase 0A/0B implementation experience surfacing what risks actually materialize.
- **§15 Operational procedures.** Daily checklists, error handling, kill-switch criteria (specific runbooks beyond §11.6 architecture). Depends on Phase 0A dashboard implementation, alerting routes, and what operator review actually looks like in practice.

The deferral is intentional. Drafting these sections in advance of implementation produces premature lock-in that would require revision once Phase 0A surfaces the actual decisions. v0.10 drafts these sections informed by Phase 0A experience.

---

*[End of Part 1 — §0 through §5. Part 2 (§6 modeling through §9 cost model) follows on verification.]*
