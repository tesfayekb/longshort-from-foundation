# CROSSWIND_SPEC.md

**Crosswind — v1 Strategy Specification**

**Version:** v0.9
**Date:** May 15, 2026
**Status:** LOCKED — Phase 0A authorized
**Previous version:** v0.8 (locked §9 cost model capital-agnostic, §10 phase plan 10-phase structure)

**Sections added in v0.9:** §4.3.5 + §6.5 (Missing-data Option E architecture); §10.4 (Phase 0B reconciliation engine + replay framework + evidence tooling); §10.14 (ROI levers and constraints with honest dual-sided framing); §10.15 (Anti-patterns expanded 8 v0.9 + 3 inherited); §10.16 (Phase plan principles with R2 asymmetric quietness criteria and C1 timeline acknowledgment); §11.0 (Foundational reconciliation layer with seventeen verify_* interfaces across sixteen capability domains); §11.8 (Banned-pattern linting — sentinel fallback ban); §11.9 (datetime.now() in business logic ban); §11.10 (Replay framework including §11.10.4 replay-test PASS comparison); §12.5.1 (Evidence hierarchy table); §12.10 (AI failure-mode logging).

**Sections substantially revised in v0.9:** §6.4 (Inference with count-normalized fallback); §7.4-§7.13 (Reconciliation sequences for all 8 mutation types with FIFO UUID lot policy + wash-sale Path A/B + retroactive cost-basis adjustment + trim-loss handling); §8.0 + §8.2-§8.5 supplements + §8.6 NEW STRUCTURE (Two-phase order lifecycle state machine) + §8.7 NEW (Partial-fill discipline) + §8.8-§8.12; §10.1-§10.16 (Phase 0A/0B split + dual exit gates + sustained-anomaly kill); §11.6 (Kill-switch with sustained-anomaly kill condition); §12.5 (AI-assisted development rules Rules 8/9/10 + evidence-tier discipline); §16 (3 v0.9 additions + 2 cross-references); §17 (V-flag discipline + compact-summary + cross-reference pattern); §18 (v0.9 comprehensive entry).

**Companion documents:**
- `docs/decisions/ADR-001-reconciliation-architecture.md` (foundational decision record)
- `docs/decisions/spec-source-index.md` (source attribution + consolidated forward-tracking inventory)

**Consolidation provenance:** This file is assembled from the 8-part v0.9 consolidation sequence (Parts 1 / 2 / 2b / 2c / 3a / 3b / 4a / 4b) per the v0.9 final assembly pass. Three final-assembly actions applied: item 4 (Part 2 stale v0.8 §8.6/§8.7 superseded by Part 2c §8.6 NEW STRUCTURE + §8.7 NEW v0.9 partial-fill discipline); item 6 (§8.6.2 v0.7-locked bps thresholds preservation verified — 50bps/100bps/200bps/30s/60s/cents-floor all present in Part 2c §8.6.2); item 12 (Part 3b §10.13 inline sustained-anomaly spec replaced with compact summary + §11.6 cross-reference per Option C discipline). Consolidation audit trail preserved in `docs/CROSSWIND_SPEC_consolidation_journal.md`.

---

## Table of Contents

- §0 Project identity (Part 1)
- §1 Strategy concept (Part 1)
- §2 Why this strategy class (Part 1)
- §3 Universe definition (Part 1)
- §4 Signal stack architecture (Part 1)
- §5 Deferred sections placeholder (Part 1)
- §6 Modeling approach (Part 2; §6.4 REVISED v0.9; §6.5 NEW v0.9)
- §7 Portfolio construction (Part 2 §7.1-§7.3 v0.8 baseline; Part 2b §7.4-§7.13 NEW v0.9)
- §8 Execution mechanics (Part 2c §8.0 + §8.1-§8.5 + §8.6 NEW STRUCTURE + §8.7-§8.12; supersedes Part 2 v0.8 §8.6/§8.7)
- §9 Cost model (Part 2 v0.8 baseline)
- §10 Phase plan (Part 3a §10.0-§10.7 + Part 3b §10.8-§10.16)
- §11 Quality, Observability, and Operational Discipline (Part 4a §11.0-§11.10)
- §12 Documentation and Development Discipline (Part 4b §12.1-§12.10)
- §16 Decisions deferred to v2 (Part 4b)
- §17 Document conventions (Part 4b)
- §18 Revision history (Part 4b)

---


<!-- =================================================================== -->
<!-- Part 1: §0 Project identity through §5 Open design questions         -->
<!-- =================================================================== -->

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

<!-- =================================================================== -->
<!-- Part 2: §6 Modeling + §7.1-§7.3 + §8.1-§8.5 v0.8 baseline + §9       -->
<!-- (Part 2 §8.6/§8.7 now superseded pointers — see Part 2c below)        -->
<!-- =================================================================== -->

## 6. Modeling approach (LOCKED)

### 6.1 Combiner architecture (LOCKED)

**LightGBM with lambdarank objective.** Two models — one for long-side ranking, one for short-side ranking.

**Modular isolation principle:** each signal pipeline operates as independent component. Combiner reads signal scores from storage; does NOT recompute signals. Stale signals treated as missing per §4.3 Option E architecture. Strategy continues operating with degraded signals rather than going dark. *(REVISED v0.9: "Stale signals treated as missing (neutral z=0)" → "Stale signals treated as missing per §4.3 Option E architecture" to align with Option E missing-data discipline replacing v0.8's silent neutral-imputation default.)*

### 6.2 Training objective and label construction (LOCKED)

- **Architecture:** Two LightGBM models (long-side, short-side).
- **Labels:** Continuous forward returns, winsorized at 1st and 99th percentiles cross-sectionally per training day.
- **Forward horizon:** 10 trading days (single horizon for v1).
- **Optimization metric:** NDCG@25 via lambdarank objective.
- **Phase 0 enhancement candidates:** Multi-horizon labels (0.4/0.4/0.2 weighting on 5d/10d/21d); custom uniform top-k loss.

### 6.3 Training cadence and data window (LOCKED)

- **Retrain cadence:** Weekly. Sunday night.
- **Training window:** All-available-history per signal, with exponential time-weighting (`weight(observation) = exp(-age_in_years / 1.5)`). Currently ~2 to 2.5 years where all 9 signals have data. Transitions to fixed 5-year trailing window once sufficient data accumulated.
- **Walk-forward validation:** Train on rolling available window → validate on next 4 weeks → out-of-sample / live trading on next 1 week.
- **Phase 0 backtest scope acknowledgment:** Backtest spans only the available data window. Statistical confidence in v1 expected performance is therefore lower than ideal. Phase 7 paper trading carries more validation weight.

### 6.4 Inference and operational integration (LOCKED — REVISED v0.9)

- **Deployment pattern:** Inline inference within the polling loop.
- **Latency budget:** End-to-end inference < 5 seconds per polling tick.
- **Model versioning:** Versioned files in S3/Modal volume. Latest-by-default with manual rollback override. Retain last 12 weeks of versions.
- **Failure fallback (REVISED v0.9):** Count-normalized average over present signals. Formula: `fallback_score = Σ(z_i × is_present_i) / max(1, Σ(is_present_i))`. This contributes only signals that are actually present rather than treating missing signals as zero-contribution. Integrates with §4.3 Option E missing-data architecture: degraded path does NOT silently impute missing signals to neutral.
- **Confidence-weighted entry:** Binary rank-based entry for v1. Confidence-weighting deferred to v2.
- **Hyperparameter management:** Quarterly Optuna search (50 trials), walk-forward CV.

**v0.9 delta rationale for failure fallback correction:** v0.8 "Equally-weighted simple linear combination of all 9 signals" was internally inconsistent with §4.3 Option E architecture. The v0.8 fallback treats missing signals as contributing zero, which is the silent-imputation failure mode Option E is designed to prevent. v0.9 corrects to count-normalized average so degraded path discipline matches happy path discipline.

### 6.5 Missing-data feature engineering (NEW v0.9)

**Purpose:** Defines the single authorized layer where the `Decimal('-999')` sentinel is introduced into the combiner feature vector. All other code paths must use `Optional[Decimal]` discipline per §11.8.

#### 6.5.1 Feature vector construction

The combiner consumes **16 features per name** (not 9):

- **2 critical signal z-scores** (Signals #6, #7): single `Decimal` value each. If missing, the name is excluded from ranking per §4.3 — these features cannot be `None` at the combiner layer.
- **14 features from 7 non-critical signals (Signals #1, #2, #3, #4, #5, #8, #9):** each non-critical signal contributes a `(value, is_present)` pair:
    - `value_i`: the signal's z-score if present, else `Decimal('-999')` (sentinel).
    - `is_present_i`: binary indicator, `1` if signal present, `0` if missing.

Total feature count: 2 + (7 × 2) = 16 features.

#### 6.5.2 Sentinel value lock

The sentinel value is **locked at `Decimal('-999')`** for v1. Rationale:

- Far outside the z-score range [-3, +3] after §4.3 clipping, so the combiner can learn to treat `-999` as a categorical "missing" marker rather than an extreme z-value.
- Decimal type (not float) ensures exact representation across serialization, storage, and replay.
- Locked at the spec level (not implementation-determined) to prevent silent drift if the value were ever changed.

Changes to the sentinel value require an ADR per §12.6 decision log discipline.

#### 6.5.3 Single-introduction-layer discipline

The sentinel is introduced at **exactly one place** in the codebase: the feature-vector construction function that assembles the 16-feature input to the combiner.

**All other code paths use `Optional[Decimal]`.** Signal-producing functions return `Optional[Decimal]`. Signal-consuming functions handle `None` explicitly. The sentinel does NOT propagate upstream of the feature-vector construction or downstream of the combiner.

Emitting `Decimal('-999')` anywhere else in the codebase is a banned pattern per §11.8 and is enforced by linting.

#### 6.5.4 Training data must replicate observed missingness

The training data fed to LightGBM during retrain must replicate the missingness profile observed in production. Specifically:

- Training samples include `is_present_i = 0` rows with `value_i = Decimal('-999')` for the signals that were actually missing at that historical training timestamp.
- The model learns to weight `(value, is_present)` pairs jointly: when `is_present_i = 0`, the model learns to ignore `value_i` (it's the sentinel) and rely on other signals.

This requires the **missingness profile** to be captured per Phase 2 sub-phase and replayed at Phase 3 combiner training. The profile is documented in `docs/missingness_profile.md` (operational, populated during Phase 2).

#### 6.5.5 Phase 3 missingness stress test

Phase 3 combiner training validates against missingness stress per §10.7. The stress test masks 50%, 75%, and 90% of non-critical signals at training-data input and measures whether the combiner produces sensible rankings or degrades catastrophically.

Quantitative gates (specific tolerances calibrated during Phase 3, not hardcoded here):

- **50% masking:** combiner Sharpe within reasonable tolerance of full-data Sharpe.
- **75% masking:** combiner Sharpe approaches §6.4 count-normalized average fallback baseline within reasonable tolerance (tolerance band calibrated during Phase 3 per V2 refinement: trained model approximates but doesn't exactly equal the fallback function).
- **90% masking:** combiner produces ranking consistent with §6.4 count-normalized average fallback (rank-correlation tolerance calibrated during Phase 3).

Stress test passes only if **both** criteria hold:

1. **Sharpe within calibrated tolerance** (per the three masking levels above)
2. **No extreme outliers in ranking output** — no z-score-implied rankings swinging wildly between unmasked and masked variants of the same name. This criterion catches "right-on-average but wildly variable" outputs that are operationally unusable.

Phase 3 exit blocked if any gate fails.

#### 6.5.6 SHAP aggregation

SHAP attribution per ranking event (§4.1 modular/diagnosable requirement) aggregates per-signal contributions as:

```
attribution_to_signal_i = shap(value_i) + shap(is_present_i)
```

Simple sum across the value/is_present feature pair gives the combiner's effective attention to signal i. This is the v1 attribution policy; more sophisticated per-pair attribution deferred to v2.

---

## 7. Portfolio construction details (LOCKED)

### 7.1 Sector handling (LOCKED)

**No QP-based long-short sector matching.** Sector tilt is allowed to follow where signals find conviction.

**Hard cap: 33% per sector per side.** Computed as `floor(0.33 × book_target_size)`. With 20-name target = 6 slots per sector. Long book and short book have independent caps.

**Cap-binding logic (within-sector universe-rank comparison):**

- When a sector is below cap: candidates from that sector enter normally based on universe rank.
- When a sector is at cap: a new same-sector candidate enters only if its universe rank is better than the worst-ranked current holding in that sector. The worst-ranked sector holding is then displaced.
- New candidates from other sectors are unaffected.
- Displaced holdings exit at current price; standard conditional 31-day re-entry block applies per §1.4.

Worked example: Tech sector at cap (6 holdings ranked #1, #2, #4, #5, #7, #11 in universe). New tech candidate at #9 displaces #11. New candidate at #15 would be rejected.

**Phase 0 reporting:** Track realized per-sector exposure over time. If consistent extreme tilt (>50% net in any sector for sustained periods), revisit cap level or reconsider hedging in v1.5.

### 7.2 Per-name concentration cap (LOCKED)

**8% of book value per name maximum.** A position that grows past 8% via appreciation is trimmed back to 8%.

### 7.3 Stop-loss and profit realization (LOCKED)

**Stop-loss on shorts only:** Hard 15% stop. Evaluated each polling tick using current price vs. entry price.

**No stop-loss on longs.** Rank-based exit (§1.4) handles long position exits.

**No explicit take-profit on either side.** Profit realization happens through three existing mechanisms:

1. Rank-based exit (§1.4)
2. Dollar-balance rebalance trims (§1.6)
3. Conditional re-entry (§1.4 revised) — profitable exits can re-enter immediately on signal

**v2 candidate:** Trailing stop on longs. Phase 0 backtest validates whether this would improve Sharpe.

**Stop-loss interaction with conditional re-entry block:** A short hitting the 15% stop closes at a loss. Standard 31-day block applies because exit was at a loss. This amplifies the alpha cost of stop-loss firings, justifying the conservative 15% threshold.

---

**✅ OPERATOR DECISION CONFIRMED — Option A — §7 v0.9 deltas land in Part 2b**

The v0.9 conversation drafted substantial additions to §7 covering reconciliation sequences for 8 mutation types, FIFO lot policy with `lot_id` UUID and tiebreaker, wash sale event recording with Path A / Path B branching, and retroactive cost-basis adjustment. These v0.9 deltas were locked architecturally during the conversation but were NOT in the v0.8 source.

The full v0.9 §7 additions span approximately 470 lines per the prior conversation log.

**Decision: Option A — §7.4-§7.12 v0.9 additions land in Part 2b (separate response).** Option B (defer to dedicated part) and Option C (labeled additions at end of Part 2) considered and rejected. Option A preserves §7 as a unified architectural section while keeping the consolidation response sizes within reliable bounds.

§7.4-§7.12 v0.9 content authoritative source: prior conversation drafts (transcript record). Part 2b applies the same strengthened self-check discipline as Part 2: bidirectional diff sweep, phrase-level scan, numerics verification.

---

## 8. Execution mechanics (LOCKED)

### 8.1 Broker selection (LOCKED)

**Primary: Alpaca.** API-first design, fractional shares, free stock trades, paper trading parity excellent.

**Escalation path: Interactive Brokers (IBKR).** For short-side at scale where Alpaca's borrow availability becomes constraining. Reconsider when deployed capital exceeds ~$1M.

### 8.2 Order types (LOCKED)

**Marketable limit orders.** Buy: bid + 1¢. Sell: ask − 1¢. 30-second initial timeout.

For high-priced names ($500+/share), use 5-cent buffer instead of 1-cent. Phase 0 validates buffer width.

VWAP/TWAP algorithms not used in v1. Reconsider when single-trade size exceeds the impact threshold for the universe.

### 8.3 List-change-to-trade timing (LOCKED)

**Asymmetric persistence:**

- **Entries:** Require 2-tick rank persistence before trading.
- **Exits:** Trigger immediately on first cross above >30 (or below <20 for short exits).

Asymmetry reflects asymmetric risk: spurious entries cost more than spurious exits.

### 8.4 Hard-to-borrow rejection handling (LOCKED)

If a short order is rejected due to HTB status:

- Trade fails; failure logged
- Book operates one short fewer until borrow returns or rank shifts
- No automatic substitution of next-highest-ranked candidate

Phase 0 reporting tracks HTB rejection frequency.

### 8.5 Latency budget (LOCKED)

**End-to-end latency target: 30 seconds from rank detection to fill confirmation.**

### 8.6 Order lifecycle and execution semantics *(SUPERSEDED in v0.9 — see Part 2c §8.6 NEW STRUCTURE)*

**v0.8 baseline content (Bounded escalation on timeout) was restructured in v0.9 into a two-phase state machine.** The v0.7-locked bps escalation thresholds (entry 30s→50bps→cancel; rank-exit 30s→100bps→60s→200bps→exit_pending; short stop 30s→200bps→30s→market) are preserved exactly inside §8.6.2 Phase 2 (Fill monitoring) of the v0.9 NEW STRUCTURE.

**Authoritative specification:** Part 2c §8.6.1 (Phase 1 Acceptance with tri-state `verify_order_acceptance` + trade-type-specific Phase 1 timeouts per §8.6.1.1) + §8.6.2 (Phase 2 Fill with v0.7-locked escalation thresholds preserved) + §8.6.3 (Cents floor carried forward from v0.7).

*(v0.9 final-assembly action per Part 6 forward-tracking item 4: this section's stale v0.8 baseline content removed; readers routed to Part 2c §8.6.X NEW STRUCTURE as canonical.)*

### 8.7 Partial-fill discipline *(SUPERSEDED in v0.9 — see Part 2c §8.7 NEW STRUCTURE)*

**v0.8 baseline marked §8.7 as v2-deferred ("Per-signal-family timeout architecture / Asymmetric cancel-vs-escalate behavior"). v0.9 promotes §8.7 to a fully-specified partial-fill discipline section** with partial fills accepted as final position size + residual cancellation and escalated resubmission for unfilled quantity + new lot creation for escalated-price fills.

The v0.8 v2-deferred items (per-signal-family timeout architecture + asymmetric cancel-vs-escalate) are preserved as v2-deferred entries in Part 4b §16 per forward-tracking item 5.

**Authoritative specification:** Part 2c §8.7 NEW v0.9 (Partial-fill discipline).

*(v0.9 final-assembly action per Part 6 forward-tracking item 4: this section's stale v0.8 baseline content removed; readers routed to Part 2c §8.7 NEW STRUCTURE as canonical. v2-deferred per-signal-family timeout migration per Part 4b §16 forward-tracking item 5.)*

---

**✅ OPERATOR DECISION CONFIRMED — Option A — §8 v0.9 deltas land in Part 2c**

The v0.9 conversation drafted substantial additions to §8 covering two-phase order state machine (Phase 1 Acceptance with tri-state `verify_order_acceptance`, Phase 2 Fill with bounded escalation timer), SSR routing strictly above NBB per Reg SHO 201, market-hours boundary discipline, partial-fill handling, modify-vs-cancel-and-replace preference, broker rejection propagation to §7 caches, and LULD via `verify_halt_status`. These v0.9 deltas were locked architecturally during the conversation but were NOT in the v0.8 source.

The full v0.9 §8 additions span approximately 470 lines per the prior conversation log, restructuring §8 substantially (e.g., v0.8 §8.6 "Bounded escalation on timeout" becomes part of v0.9 §8.6.2 "Phase 2 Fill" inside the two-phase state machine).

**Decision: Option A — §8.X v0.9 restructured additions land in Part 2c (separate response).** Option B (defer to dedicated part) and Option C (labeled additions at end of Part 2) considered and rejected. Option A preserves §8 as a unified architectural section while keeping the consolidation response sizes within reliable bounds.

Consolidation sequence (8 parts total):

- Part 1: §0-§5 ✓ delivered
- Part 2 (this response): §6 v0.8 baseline + §6 v0.9 deltas + §7.1-§7.3 v0.8 verbatim + §8.1-§8.7 v0.8 verbatim + §9 v0.8 verbatim
- **Part 2b: §7.4-§7.12 v0.9 additions (~470 lines)**
- **Part 2c: §8.X v0.9 restructured additions (~470 lines)**
- Part 3: §10 phase plan
- Part 4: §11-§18
- Part 5: ADR-001-reconciliation-architecture.md
- Part 6: spec-source-index.md

§8.X v0.9 content authoritative source: prior conversation drafts (transcript record).

---

## 9. Cost model (LOCKED) — capital-agnostic framing

### 9.1 Recurring fixed costs

Crosswind's fixed costs do not scale with deployed capital. They are infrastructure overhead.

| Component | Cost | Note |
|---|---|---|
| Polygon (Stocks Adv + Options Adv + News + Benzinga) | $0 marginal | Pre-existing subscription |
| Tradier API (backup data) | $0 | Free with brokerage |
| NewsAPI free tier | $0 | Backup news source |
| Modal compute | $100-200 | Polling + combiner inference |
| Supabase Pro | $25-40 | Database |
| Cloudflare R2 / S3 | $5-25 | Cold storage |
| Monitoring (Sentry, etc.) | $25-50 | |
| Domains, certificates, misc | $10-30 | |
| **Total recurring** | **$165-345/mo** | **$2,000-4,200/yr** |

These costs are constant regardless of deployed capital. The same infrastructure supports deployments across a wide range of capital levels without material change.

For multi-user deployments, fixed costs may be shared across users if infrastructure is shared, OR each user may run isolated infrastructure with their own fixed costs. The cost structure is per-instance, not per-user.

### 9.2 Variable costs (as percentage of deployed capital)

**Slippage:** ~3% annualized of deployed capital.

- ~150-200 trades/month at ~7 bps average slippage per trade
- Invariant to deployed capital because the strategy uses fixed percentage position sizing
- Slippage in bps is independent of position size for trades within Crosswind's universe

**Borrow cost on shorts:** ~1% annualized of total deployed capital (short book is ~50% of total).

- S&P 500 + S&P 400 universe has abundant borrow
- §3.3d HTB exclusion (5% threshold) caps borrow cost outliers

**Combined variable costs: ~3.5-4% annualized of deployed capital.**

### 9.3 Net return calculation framework

For any deployment with deployed capital `C`:

```
Net return = C × (Gross alpha − Variable costs) − Fixed costs
           = C × (Gross alpha − 3.5%) − $2,000 to $4,200/yr
```

Net return *as a percentage of deployed capital*:

```
Net return % = (Gross alpha − 3.5%) − (Fixed costs / C)
```

**The fixed-cost drag decreases as deployed capital increases.** At small C, fixed costs dominate. At large C, they become negligible.

**Capital breakeven** (point where net return = 0): occurs when `C × (Gross alpha − 3.5%) = Fixed costs`. At midpoint gross alpha of 12% and midpoint fixed costs of $3K/yr, this is approximately `C ≈ $35K`. Below this, fixed costs eat the alpha. Meaningful profitability begins at ~$100K and fixed-cost drag becomes negligible above ~$250-500K.

### 9.4 Expected return distribution

Documented in §2.1. Probability-weighted expected: **+10-14% annualized of deployed capital after costs and taxes.**

These percentages apply uniformly regardless of deployed capital magnitude (above the fixed-cost breakeven threshold). The strategy's edge is independent of size within the capacity envelope (estimated capacity: a single-instance Crosswind can handle several million in deployed capital before hitting market impact limits in the S&P 500 + S&P 400 universe; refine in Phase 0).

### 9.5 Paper trading reference amount

For Phase 7 paper trading validation, the system uses **$100,000 as the reference account size**. This is:

- A convenient round number for backtest and paper-trade analysis
- Sufficient capital to exercise all position-sizing math meaningfully
- A standard benchmark for return-percentage validation against expectations
- **Not a recommendation for live deployment** — live deployment amount is operator-determined

The $100,000 figure appears only in Phase 7 validation contexts. It does not constrain or inform live deployment decisions.

### 9.6 Tax drag framework

For US-based deployment operating outside TTS / §475(f) (per §1.7):

- Realized gains taxed at short-term capital gains rate (ordinary income)
- For high-bracket operators (~35% effective rate), after-tax return is approximately 65% of pre-tax net return
- For lower-bracket operators, the multiplier is higher
- For multi-user deployment in different tax jurisdictions, each operator's tax outcome is their own

**TTS / §475(f) consideration:** If a single-instance deployment scales such that the operator qualifies for TTS, §475(f) mark-to-market election may be worth pursuing. This is a per-operator legal/tax decision, not a system design decision. Revisit in v2 once deployment scales meaningfully.

### 9.7 Multi-user / multi-instance deployment considerations

Crosswind architecture is fundamentally capital-agnostic and supports multiple deployment models:

**Single-operator, single-instance:** One operator runs Crosswind with their own deployed capital. v1 default.

**Single-operator, multi-instance:** One operator runs Crosswind across multiple accounts (personal taxable + personal IRA + entity account, etc.). Each instance is logically separate.

**Multi-user (future consideration):** Crosswind serves multiple operators each with their own deployed capital. Each operator's instance runs the same strategy logic but with isolated position state, P&L, and tax tracking.

For v1, **single-operator single-instance is the assumed deployment**. Multi-instance and multi-user are flagged as architectural considerations that should not be precluded by v1 design choices but are not built in v1.

Specifically, §13 (schema and infrastructure, pending) should design tables and operations to support per-operator isolation cleanly — e.g., positions table keyed by `(operator_id, ticker)` rather than just `ticker`. This costs nothing for the single-operator case but preserves the option to extend later.

### 9.8 What's documented but not locked

- **Variable cost percentages are starting assumptions.** Phase 0 backtest validates.
- **Expected return distribution is a planning estimate.** Phase 0 backtest provides actual numbers that gate Phase 7 advance.
- **Capacity envelope is an estimate.** Beyond capacity, market impact may erode alpha. Phase 9 deployments approaching this should monitor realized slippage.

---

<!-- =================================================================== -->
<!-- Part 2b: §7.4-§7.13 NEW v0.9 (Reconciliation sequences + FIFO UUID)  -->
<!-- §11.0 interstitial omitted — consolidated into Part 4a §11.0          -->
<!-- =================================================================== -->

## §7.4 Position-state mutation points + FIFO lot policy *(NEW v0.9)*

Crosswind has eight distinct mutation types that change position state. Each is a reconciliation surface and each appears in the §7.12 failure-action table:

**1. Entry (new position open).** Triggered by a name crossing combiner-rank ≤20 with required signal coverage (per §4.3.5) and satisfying §3.3 hard exclusions, §7.1 sector cap, and §3.3d HTB/borrow-rate check for shorts.

**2. Exit — rank-based.** Triggered by a held position's combiner rank crossing >30 (per §1.4 exit rule).

**3. Exit — stop-based.** Triggered for shorts only when the position has lost ≥15% from entry (per §7.3).

**4. Trim — rebalance-driven.** Triggered by end-of-session dollar-balance rebalance (per §1.6) when long/short gross ratio is outside 90-110% band. Proportional trim on the over-exposed side until ratio returns to band.

**5. Trim — concentration-driven.** Triggered when a position's value exceeds 8% of book value (per §7.2). Trim brings position back to 8%.

**6. Lot accounting mutation.** Triggered by every entry, exit, or trim — modifies the lot records that track cost basis for tax purposes. This is logically separate from the position-quantity mutation because lot tracking has its own state and its own failure modes (lot disappears from records, lot quantity inconsistent with position quantity, etc.). Strong+ tier per §11.0.10.

**7. Wash sale event recording.** Triggered when an exit produces realized P&L < 0 (per §1.4 conditional 31-day re-entry block). Writes to `wash_sale_events` table. Strong+ tier per §11.0.10.

**8. Retroactive cost-basis adjustment.** Triggered when a loss-producing sale has same-symbol shares from a 30-day-window buy still held in the lot ledger. The disallowed loss attaches to those shares via cost-basis adjustment per §1.4 retroactive wash sale handling and §7.8 broadened detection logic. Strong+ tier per §11.0.10.

### Lot-selection policy for trims and partial exits: FIFO (First In First Out)

When a trim or partial exit reduces a position with multiple lots, the oldest lots are sold first. The system records lot-level cost basis with entry timestamp and applies FIFO ordering at every trim and exit.

**Deterministic ordering for replay (per V1 Pass 3 confirmation):** `lot_id` is a globally unique UUID. FIFO ordering tiebreaker is `(entry_ts ASC, lot_id ASC)`. Without the tiebreaker, FIFO selection between same-entry-timestamp lots (multi-fill orders, polling ticks at clock-resolution boundary) is implementation-dependent and replay-nondeterministic — replay-test PASS comparison per §11.10.4 requires deterministic FIFO.

Rationale:

- Aligns with Alpaca's default lot-tracking behavior, minimizing reconciliation noise against broker view (`verify_lot_record` against broker would diverge more frequently under any other policy).
- Simplest to track, verify, and audit. Each lot has an unambiguous "next to be sold" status.
- Tax-neutral for Crosswind's high-turnover profile. Almost all positions are short-term anyway (holding periods are days to weeks per §1.4); the long-term vs short-term distinction that makes specific-identification valuable rarely applies.
- Easiest for operator mental model — at a glance, the operator can tell which lots will be affected by an impending trim.

The FIFO policy directly affects §7.8 retroactive cost-basis adjustment: when the disallowed loss attaches to "subsequent purchases" per §7.8 step 3, it attaches to the FIFO-earliest still-held lot from the 30-day window.

**Specific-identification (manual lot selection) is deferred to v2** per §16. v1 commits to FIFO for the entire phase plan.

Cross-reference: §1.5 position sizing rule remains unchanged but interacts with FIFO — when new entries occur after partial trims, the new lot is recorded as the newest, regardless of whether trimming occurred.

---

## §7.5 Reconciliation sequence — Entry *(NEW v0.9)*

The entry sequence applies to long entries and short entries. Short entries include three additional checks marked with `[SHORT]`.

**Pre-submission gates (in order):**

1. **`verify_universe_membership(symbol, as_of=now)`** per §11.0.7 #10
   - Low-tolerance class per §11.0.9
   - Failure action: skip this name this tick. Do NOT proceed to submission. Log `reconciliation_events` row per §11.0.10 with `outcome = failure_handled`, `failure_action = "entry_skipped_universe"`. Retry next tick if still ranked.

2. **`verify_halt_status(symbol)`** per §11.0.7 #6
   - Low-tolerance class per §11.0.9
   - Failure action (halted): skip this name this tick. Do NOT proceed. Log `outcome = failure_handled`, `failure_action = "entry_skipped_halted"`. Retry next tick.

3. **`verify_corporate_action_clean(symbol, lookback_days=5)`** per §11.0.7 #11 (expected-divergence-aware)
   - Failure action (corporate action active, broker basis not propagated): skip this name this tick. Log `outcome = expected_divergence_handled` if within T+0 to T+1 propagation window per §11.0.7 (does NOT count toward escalation per §11.0.9). Beyond 48h: `outcome = failure_escalated` and operator alert.

4. **`verify_quote_freshness(symbol, max_age_s=5)`** per §11.0.7 #3
   - Noise-tolerant class per §11.0.9
   - Failure action (quote stale): skip this name this tick. Log `outcome = failure_handled`, `failure_action = "entry_skipped_stale_quote"`. Do NOT fall back to last-known price.

5. **`[SHORT] verify_short_availability(symbol) → locate_id`** per §11.0.7 #4
   - Low-tolerance class per §11.0.9
   - Failure action: skip short entry. Do NOT substitute long entry. Do NOT default to "assume available." Log `outcome = failure_handled`, `failure_action = "short_entry_skipped_no_locate"`. Retry next tick if symbol still ranked.
   - On success: record the returned `locate_id` for subsequent `verify_borrow_persistence` checks during position lifetime.

6. **`[SHORT] verify_ssr_status(symbol)`** per §11.0.7 #5 (tri-state)
   - Low-tolerance class per §11.0.9
   - `not_active`: proceed with normal short routing.
   - `active`: proceed with SSR-compliant routing (uptick-only); pass `ssr_active=true` to execution layer per §8.
   - `indeterminate`: skip short entry this tick. Log `outcome = failure_handled`. Retry next tick.

7. **`[SHORT] verify_borrow_rate(symbol)`** per §11.0.7 #7
   - Low-tolerance class per §11.0.9
   - Failure action (rate > 5%/yr per §3.3d): skip short entry. Log `outcome = failure_handled`, `failure_action = "short_entry_skipped_high_borrow"`. Treat as HTB exclusion.
   - Failure action (rate cannot be obtained): skip short entry. Log `outcome = failure_handled`, `failure_action = "short_entry_skipped_borrow_rate_unknown"`. Do NOT default to "assume 0% borrow rate."

8. **`verify_buying_power(account, requested_position_size)`** per §11.0.7 #9
   - Low-tolerance class with magnitude override per §11.0.9 (10% divergence escalates immediately)
   - Failure action (insufficient): skip entry. Log `outcome = failure_handled`, `failure_action = "entry_skipped_insufficient_buying_power"`. Operator alert if recurring (Low-tolerance threshold of 3 within 1h).
   - Failure action (divergence > 10% between internal estimate and broker reported BP): magnitude-escalate to immediate operator alert per §11.0.9.

**Order submission and post-submission:** Handed off to §8 (execution mechanics). §8 includes `verify_order_acceptance` (tri-state) per §11.0.7 #13.

**Post-fill verification:**

9. **`verify_position(symbol, expected_qty, expected_cost_basis)`** per §11.0.7 #1
   - **Zero-tolerance class** per §11.0.9 (single failure escalates immediately)
   - Expected qty: position size from §1.5 sizing rule (2.5% of current invested capital, converted to shares using fill price).
   - Expected cost basis: filled price (from broker confirm) plus commissions (zero on Alpaca for stocks).
   - Failure action (broker position differs from expected): IMMEDIATE operator alert. Log `outcome = failure_escalated`, `failure_action = "post_fill_position_mismatch"`. Symbol-level halt: do NOT permit further mutations on this symbol until manually resolved. This is the "you have a phantom position" case from §11.0 architecture rationale.

10. **Lot accounting mutation (Strong+ tier per §11.0.10).**
    - Create new lot record: `(symbol, entry_ts, qty, cost_basis, side, status='open', locate_id=<from step 5 if short>)`.
    - Verify lot record persisted by reading back: `verify_lot_record(lot_id, expected_fields) → ReconcileResult` per §11.0.7 #15.
    - Zero-tolerance class (any divergence on a lot record is structural defect).

---

## §7.6 Reconciliation sequence — Exit (rank-based or stop-based) *(NEW v0.9)*

The exit sequence applies to both rank-based and stop-based exits. Stop-based exits skip some gates that wouldn't apply (no SSR routing needed for closing a short, etc.).

**Pre-submission gates (in order):**

1. **`verify_halt_status(symbol)`** per §11.0.7 #6
   - Failure action (halted): cannot exit during halt. Position remains held. Log `outcome = failure_handled`, `failure_action = "exit_deferred_halted"`. Re-evaluate next tick.

2. **`verify_quote_freshness(symbol, max_age_s=5)`** per §11.0.7 #3
   - Failure action (quote stale): defer exit this tick. Log `outcome = failure_handled`, `failure_action = "exit_deferred_stale_quote"`. Retry next tick.

3. **`verify_corporate_action_clean(symbol, lookback_days=5)`** per §11.0.7 #11 (expected-divergence-aware)
   - Failure action during propagation window: defer exit until basis propagates. Log `outcome = expected_divergence_handled`. Beyond 48h: failure_escalated and operator alert (a position cannot remain unexitable indefinitely).

4. **`[SHORT] verify_settlement_status(symbol, side='short')`** per §11.0.7 #12 (expected-divergence-aware, Zero-tolerance class per §11.0.9)
   - Pre-T+1 "not settled" response for trades within their expected settlement window: emit `outcome = expected_divergence_handled` and defer the close. Some short-close operations are only valid post-settlement.
   - Post-T+1 unsettled: `outcome = failure_escalated` — this is real bookkeeping defect. Operator alert. Symbol-level halt on further mutations.

5. **`[SHORT] verify_borrow_persistence(symbol, locate_id=<from entry>)`** per §11.0.7 #8 (expected-divergence-aware)
   - Locate expiration at documented TTL: `outcome = expected_divergence_handled`. Re-obtain locate via `verify_short_availability` before proceeding (handled internally in the close sequence — the close still proceeds; we just need a fresh locate).
   - Locate disappearance before TTL completion: `outcome = failure_handled`. Operator alert (Low-tolerance threshold of 3 within 1h escalates).

**Order submission and post-submission:** Handed off to §8. Tri-state `verify_order_acceptance` per §11.0.7 #13.

**Post-fill verification:**

6. **`verify_position(symbol, expected_qty=0, expected_cost_basis=N/A)`** for full close, or **`verify_position(symbol, expected_qty=<remaining>, expected_cost_basis=<weighted_avg_of_remaining_lots>)`** for partial close.
   - **Zero-tolerance class** per §11.0.9.
   - Full close failure (broker reports nonzero remaining): IMMEDIATE operator alert. The close did not complete or the broker is reporting wrong state.
   - Partial close failure (broker reports wrong remaining quantity): IMMEDIATE operator alert. The trim over-executed or broker state is inconsistent.

7. **`verify_realized_pnl(trade_id, claimed_pnl)`** per §11.0.7 #14
   - **Zero-tolerance class** per §11.0.9.
   - Failure action: see §7.7 for the wash-sale-relevant flow. The conditional 31-day re-entry block per §1.4 depends on broker-confirmed loss, not internally computed loss.

8. **Lot accounting mutation (Strong+ tier per §11.0.10).**
   - Update lot record: `status='closed'`, `exit_ts`, `exit_price`, `realized_pnl`, `wash_sale_status` (pending/clean/disallowed based on §7.7 sequence).
   - Verify via `verify_lot_record` per §11.0.7 #15.

---

## §7.7 Reconciliation sequence — wash-sale-relevant exit (Strong+ tier) *(NEW v0.9)*

When `verify_realized_pnl` from §7.6 step 7 confirms a loss, the conditional 31-day re-entry block per §1.4 fires. The sequence:

**Path A — `verify_realized_pnl` PASSES with confirmed loss:**

1. Write `wash_sale_events` row: `(symbol, exit_ts, realized_loss, lot_ids_affected, status='block_active', block_until=exit_date + 31_calendar_days)`.
2. Verify the wash_sale_events row persisted: `verify_wash_sale_record(event_id, expected_fields)` per §11.0.7 #16 (Zero-tolerance class).
3. Add symbol to `re_entry_blocked` set with block_until timestamp.
4. Log `reconciliation_events` row with `outcome = failure_handled` (the wash-sale write itself succeeded; the "failure" here is the realized loss triggering the block, which is expected business logic, not a reconciliation failure).
5. If during the 31-day block window a *new* purchase of the same symbol triggers a wash sale (per §1.4 retroactive handling), the disallowed loss from the new exit attaches via §7.8 retroactive cost-basis adjustment.

**Path B — `verify_realized_pnl` FAILS (broker confirm disagrees with internal computation):**

1. **Do NOT write `wash_sale_events` row.** The realized loss number is suspect; writing a wash-sale record with an incorrect loss amount has IRS-reporting consequences.
2. Add symbol to `re_entry_blocked_pending_review` set (separate from `re_entry_blocked` — this set blocks re-entry while operator review is pending, but does not commit to a wash-sale record).
3. Log `reconciliation_events` row with `outcome = failure_escalated`, `tier = strong_plus`. IMMEDIATE operator alert with structured detail: broker confirm vs internal computation values, lot IDs, suggested resolution paths.
4. Position is closed regardless (the exit fill already occurred); only the wash-sale-recording decision is held pending review.
5. Operator resolves: either the broker confirm is authoritative (write wash_sale_events with broker's number, move symbol from `pending_review` to `re_entry_blocked`), or the internal computation revealed a broker reporting error (escalate to broker support, hold review until resolved).

The discipline here is: **do not assume success, do not silently write the wash-sale row before broker confirm, do not allow re-entry while reconciliation is pending.** A wash sale row with the wrong loss amount becomes a 1099 problem at year-end that cannot be silently corrected.

---

## §7.8 Reconciliation sequence — retroactive cost-basis adjustment (Strong+ tier) *(NEW v0.9)*

When a loss-producing sale (full exit OR trim) has same-symbol shares from a 30-day-window buy still held in the lot ledger, the disallowed loss attaches to those shares per IRS wash-sale handling.

**Sequence:**

1. **Detect the retroactive trigger.** On every loss-producing sale (full exit OR trim), the system checks whether shares from any buy of the same symbol within the 30-day window (before OR after the sale date) are still held in the lot ledger. The check is against the lot ledger, not against `wash_sale_events` history.

   The lot ledger query: `SELECT lots WHERE symbol = X AND entry_ts BETWEEN (sale_date - 30d) AND (sale_date + 30d) AND status = 'open'`.

   If any matching lots exist → the realized loss is wash-sale-disallowed and attaches to those lots via steps 3-8 below.

   If no matching lots exist → no retroactive wash sale; the loss is realized normally and (for full exits) the §1.4 conditional 31-day re-entry block applies per §7.7 Path A.

   **Rationale for broader detection:** The IRS wash-sale rule triggers more broadly than the §1.4 "profitable exit + re-entry + losing exit" pattern. Any loss-producing sale where same-symbol shares from a 30-day-window buy are still held creates a wash sale. Crosswind specifically creates this scenario via rebalance trims and concentration-cap trims (the position is being trimmed at a loss while the remaining shares are from buys within 30 days). The detection logic must catch all paths.

2. If a prior profitable exit + re-entry exists within the window, or if any same-symbol buy within the window remains in the lot ledger: the current loss is wash-sale-disallowed.

3. Identify the "subsequent purchase" the disallowed loss attaches to: **the FIFO-earliest still-held lot from the 30-day window** per §7.4 FIFO lot policy.

4. Compute the adjusted cost basis: `new_cost_basis = original_cost_basis + disallowed_loss / qty`.

5. **Mutation:** update the lot record's `cost_basis` field. This is Strong+ tier per §11.0.10 (IRS-relevant cost basis change).

6. Verify via `verify_lot_record` per §11.0.7 #15.

7. Write `wash_sale_events` row with `outcome='disallowed_loss_attached'`, `attached_to_lot_id=<the lot>`, `disallowed_amount=<loss>`.

8. Verify via `verify_wash_sale_record` per §11.0.7 #16.

**Reconciliation against tax-year ground truth:**

At year-end (or quarterly during operation), reconcile all `wash_sale_events` rows against broker's expected 1099-B / Form 8949 generation. This is the Strong+ tier reconciliation against tax/regulatory ground truth per §11.0.10. Divergence is operator-escalated and resolved before tax filing.

---

## §7.9 Reconciliation sequence — trim (rebalance-driven or concentration-driven) *(NEW v0.9)*

A trim is structurally a partial exit + continued hold. The mutation sequence is similar to exit but with partial-quantity expectations.

**Pre-submission gates:** Same as §7.6 exit sequence steps 1-3 (`verify_halt_status`, `verify_quote_freshness`, `verify_corporate_action_clean`). Short-position trims also run §7.6 steps 4-5 (settlement, borrow persistence).

**Order submission:** Handed off to §8.

**Post-fill verification:**

1. **`verify_position(symbol, expected_qty=<remaining_after_trim>, expected_cost_basis=<weighted_avg_of_remaining_lots>)`** per §11.0.7 #1.
   - **Zero-tolerance class.**
   - Critical failure mode: trim over-executed (broker reports fewer shares remaining than expected). IMMEDIATE operator alert. Symbol-level halt.
   - Critical failure mode: trim under-executed (broker reports more shares remaining than expected). Operator alert; system may attempt to re-submit the residual trim or escalate based on rebalance vs concentration trigger context.

2. **Wash-sale-relevant if loss (trim-specific path):**
   - Write `wash_sale_events` row per §7.7 Path A steps 1-2 (the record-writing portion). Verify via `verify_wash_sale_record` per §11.0.7 #16.
   - **Do NOT execute §7.7 Path A step 3 (add to `re_entry_blocked`) — re-entry is not applicable while position is held.** The position has only been trimmed; entry/exit semantics from §1.4 don't apply to size adjustments of held positions.
   - **Trigger §7.8 retroactive cost-basis adjustment on the remaining shares** of the trimmed position. The disallowed loss from the trim attaches to those remaining shares per IRS wash-sale handling. FIFO-earliest still-held lot receives the adjustment per §7.4.
   - If `verify_realized_pnl` Path B (broker confirm disagrees with internal computation), add symbol to a new `trim_wash_sale_pending_review` set (parallel to `re_entry_blocked_pending_review` per §7.7 Path B, but for trim context). Operator alert per Strong+ tier. Position remains held; the wash-sale-recording decision is held pending review; *no* re-entry block applies because re-entry semantics don't apply to trims.

   **Cross-reference summary:** the trim-loss path uses §7.7 record-writing infrastructure but bypasses §7.7's re-entry-block logic, and chains into §7.8 retroactive adjustment immediately rather than tracking for future loss-detection.

3. **Lot accounting mutation (Strong+ tier):**
   - Trimmed lots: identified per FIFO policy per §7.4 (oldest lots sold first). Update lot records: reduce `qty` for partial trims, mark `status='closed'` for fully trimmed lots, record `exit_ts`, `exit_price`, `realized_pnl`.
   - Verify each modified lot via `verify_lot_record` per §11.0.7 #15.

---

## §7.10 Reconciliation sequence — dollar-balance rebalance aggregate verification *(NEW v0.9)*

End-of-session rebalance per §1.6 trims proportionally on the over-exposed side. This is potentially many trims in one rebalance cycle. The verification pattern is two-layered:

**Per-trim reconciliation:** each individual trim runs the §7.9 trim sequence with its own `verify_position` and `verify_realized_pnl`.

**Aggregate verification timing and defer behavior:**

The aggregate verification runs **AFTER all rebalance trim orders have produced their post-fill `verify_position` confirmations**, not after submission. Order submission has latency; aggregate verification against submitted-but-not-filled state produces false out-of-band readings.

**Defer logic:**

- If any rebalance trim is still pending (waiting on `verify_order_acceptance` to resolve from `pending` state, or in §8 bounded escalation), the aggregate verification defers.
- Maximum defer window: **5 minutes from rebalance cycle start**.
- If any trim has not resolved within 5 minutes:
  - Operator alert with structured detail (which trims unresolved, current order states).
  - Aggregate verification runs against the trims that did resolve (excluding the unresolved ones from the ratio computation).
  - Unresolved trims are flagged as `rebalance_partial_completion` failure with `outcome = failure_escalated` per §11.0.10.
  - The aggregate verification result is conditional: if the partial-completion result is in-band, the system records the rebalance as "completed with partial-completion flag"; if out-of-band, the standard `verify_rebalance_aggregate` failure action applies (operator alert, do NOT auto-retry).

This defer logic prevents two failure modes: (a) aggregate runs against not-yet-filled state and produces false out-of-band reading, (b) aggregate never runs because a single hung trim blocks it forever.

**Aggregate verification call:**

1. **`verify_rebalance_aggregate()`** per §11.0.7 #17.
   - Re-compute long-book gross dollars and short-book gross dollars from broker positions (via Alpaca `/v2/positions`, the ground truth).
   - Compute ratio: `long_gross / short_gross`.
   - Verify ratio is within 90-110% band per §1.6.
2. **Zero-tolerance class** per §11.0.9. An aggregate verification failure indicates structural defect: per-trim verifications passed but the aggregate is still out of band → some trim failed silently, or the trim targets were computed wrong.
3. Failure action: IMMEDIATE operator alert. Log `outcome = failure_escalated`, `failure_action = "rebalance_aggregate_out_of_band"`. Do NOT auto-retry the rebalance — the targets are suspect and need human investigation before further trims.

This aggregate verification is essential because per-trim verification alone catches single-trim defects but cannot catch "all trims executed correctly but in the wrong amounts" failure modes.

---

## §7.11 Held-position critical-signal-missing escalation *(NEW v0.9)*

Per §4.3 critical-signal-missing escalation: a position held while either critical signal (#6 momentum, #7 reversal) is missing for > 24 cumulative trading hours emits a `held_position_critical_signal_stale` event (Strong tier per §12.5).

This escalation runs at every polling tick for every held position; it is not a state-mutation reconciliation but a position-monitoring check.

**Implementation:**

- Position monitor maintains per-position cumulative missing-critical-signal counter.
- Counter increments when either critical signal is missing at a polling tick during RTH.
- Counter resets to zero when both critical signals are present.
- Threshold breach (> 24 trading hours) emits the alert event and pages operator.
- Operator decides: continue holding, or initiate manual exit per §7.6 sequence.

The 24-hour threshold is a starting value subject to Phase 0 and Phase 7 tuning per §11.0.9 asymmetric change discipline.

---

## §7.12 Per-call failure-action table for §7 *(NEW v0.9)*

The table consolidates §7.5 through §7.10 reconciliation calls and their failure actions. Used as operational reference during implementation.

| Verify call | Context | Tolerance class (§11.0.9) | Failure action |
|---|---|---|---|
| `verify_universe_membership` | Entry | Low-tolerance | Skip entry this tick; retry next tick. |
| `verify_halt_status` | Entry | Low-tolerance | Skip entry this tick. |
| `verify_halt_status` | Exit | Low-tolerance | Defer exit; position held; re-evaluate next tick. |
| `verify_halt_status` | Trim | Low-tolerance | Defer trim; position remains held at current size; re-evaluate next tick or next rebalance cycle. |
| `verify_corporate_action_clean` | Entry | Low-tolerance + expected-divergence-aware | T+0 to T+1: skip entry, `expected_divergence_handled`. > 48h: failure_escalated, operator alert. |
| `verify_corporate_action_clean` | Exit | Low-tolerance + expected-divergence-aware | Same as entry; if > 48h and position cannot be closed, operator alert (position effectively stuck). |
| `verify_corporate_action_clean` | Trim | Low-tolerance + expected-divergence-aware | T+0 to T+1: defer trim, `expected_divergence_handled`. > 48h: failure_escalated, operator alert. |
| `verify_quote_freshness` | Entry | Noise-tolerant | Skip entry; do NOT use stale quote. |
| `verify_quote_freshness` | Exit | Noise-tolerant | Defer exit; do NOT use stale quote. |
| `verify_quote_freshness` | Trim | Noise-tolerant | Defer trim; do NOT use stale quote. |
| `verify_short_availability` | Short entry | Low-tolerance | Skip short entry; do NOT substitute long; do NOT assume available. Record `locate_id` on success. |
| `verify_ssr_status` | Short entry | Low-tolerance (tri-state) | not_active: proceed normal. active: SSR-compliant routing. indeterminate: skip short entry. |
| `verify_borrow_rate` | Short entry | Low-tolerance | > 5%/yr: skip per §3.3d. Unknown: skip; do NOT assume 0%. |
| `verify_buying_power` | Entry | Low-tolerance + magnitude override (10%) | Insufficient: skip entry. > 10% divergence: immediate operator alert. |
| `verify_settlement_status` | Short exit | Zero-tolerance + expected-divergence-aware | Pre-T+1: defer (`expected_divergence_handled`). Post-T+1 unsettled: failure_escalated, operator alert. |
| `verify_settlement_status` | Short trim | Zero-tolerance + expected-divergence-aware | Pre-T+1: defer (`expected_divergence_handled`). Post-T+1 unsettled: failure_escalated, operator alert. |
| `verify_borrow_persistence` | Short during hold / before exit | Low-tolerance + expected-divergence-aware | End of TTL: `expected_divergence_handled`, re-obtain locate. Before TTL: failure_handled, operator alert. |
| `verify_borrow_persistence` | Short trim | Low-tolerance + expected-divergence-aware | End of TTL: `expected_divergence_handled`, re-obtain locate; trim still proceeds. Before TTL: failure_handled, operator alert. |
| `verify_order_acceptance` | All submissions (per §8) | Zero-tolerance for rejected state | accepted: proceed. rejected: mark order rejected per §8 trade-type-aware retry rules. pending: escalate polling, do NOT cancel-and-retry. |
| `verify_position` | Post-fill entry | Zero-tolerance | Position mismatch: IMMEDIATE operator alert, symbol-level halt. |
| `verify_position` | Post-fill exit (full) | Zero-tolerance | Nonzero remaining: IMMEDIATE operator alert. |
| `verify_position` | Post-fill exit (partial) | Zero-tolerance | Wrong remaining qty: IMMEDIATE operator alert. |
| `verify_position` | Post-fill trim | Zero-tolerance | Wrong remaining qty: IMMEDIATE operator alert; trim over- or under-execution. |
| `verify_realized_pnl` | Loss exit (Strong+ tier) | Zero-tolerance | PASS: write wash_sale_events, set re_entry_block. FAIL: do NOT write, add to re_entry_blocked_pending_review, operator alert. |
| `verify_realized_pnl` | Loss trim (Strong+ tier) | Zero-tolerance | PASS: write wash_sale_events, trigger §7.8 on remaining shares, do NOT block re-entry. FAIL: add to trim_wash_sale_pending_review, operator alert. |
| `verify_realized_pnl` | Profitable exit | Zero-tolerance | PASS: no re-entry block per §1.4. FAIL: operator alert before booking P&L. |
| `verify_lot_record` | All lot mutations (Strong+ tier) | Zero-tolerance | Divergence: IMMEDIATE operator alert; lot accounting is suspect. |
| `verify_wash_sale_record` | After wash_sale_events write (Strong+ tier) | Zero-tolerance | Record divergence: IMMEDIATE operator alert; tax bookkeeping is suspect. |
| `verify_rebalance_aggregate` | After all rebalance trims complete | Zero-tolerance | Out-of-band aggregate: IMMEDIATE operator alert; do NOT auto-retry rebalance. |
| (no verify; position monitor) | Per polling tick for held positions | N/A | > 24h cumulative critical-signal-missing: page operator. |

---

## §7.13 Cross-references summary *(NEW v0.9)*

§7 references the following §11.0 subsections:

- §11.0.4 (broker_rejection_propagation) — handled in §8 execution; §7 receives the propagated state
- §11.0.7 #1, #3, #4, #5, #6, #7, #8, #9, #10, #11, #12, #13, #14 — all per their failure-action specs
- §11.0.9 — tolerance classes (Zero, Low, Noise) and magnitude override for verify_buying_power, expected-divergence handling for corporate-action / settlement / borrow-persistence
- §11.0.10 — reconciliation_events schema; Strong+ tier retention for verify_realized_pnl, lot mutations, wash sale records

§7 introduces three new verify_* interfaces not in v0.8's §11.0.7 list:

- `verify_lot_record(lot_id, expected_fields)` — Strong+ tier, Zero-tolerance class
- `verify_wash_sale_record(event_id, expected_fields)` — Strong+ tier, Zero-tolerance class
- `verify_rebalance_aggregate()` — Strong tier, Zero-tolerance class

These three interfaces (#15, #16, #17) are added to §11.0.7 via the §11.0 interstitial revision in this Part 2b consolidation.

---

<!-- =================================================================== -->
<!-- Part 2c: §8.0 + §8.1-§8.5 v0.9 supplements + §8.6 NEW STRUCTURE       -->
<!-- + §8.7 NEW + §8.8-§8.12 (supersedes Part 2 v0.8 §8.6/§8.7)            -->
<!-- =================================================================== -->

## §8.0 Section overview *(NEW v0.9)*

§8 specifies how Crosswind submits orders to the broker and monitors their lifecycle. The v0.7-locked execution architecture (Alpaca primary, marketable limit orders, asymmetric persistence, bounded slippage escalation by trade type) remains structurally unchanged. What changes in v0.9 is the operational discipline around order submission: every submission goes through pre-flight reconciliation gates from §7, every order passes through a two-phase state machine (Acceptance, then Fill), and broker rejections propagate back to §7 caches per §11.0.4.

The two-phase state machine is the most substantive structural addition. v0.8 §8.6 bounded escalation was implicitly a single-phase model that assumed orders are either accepted-and-live or failed. The two-phase model separates "did the broker accept the order" (Phase 1) from "did the market fill the order" (Phase 2). The bounded escalation timer operates only in Phase 2.

---

## §8.1 Broker selection — *no v0.9 changes*

v0.7-locked content (Alpaca primary, IBKR escalation path at ~$1M capital) retained verbatim from v0.8 baseline as reproduced in Part 2. No v0.9 supplement.

---

## §8.2 Order types and pricing — v0.9 supplements *(NEW v0.9)*

The v0.7-locked marketable limit order language (Buy: `bid + 1¢`; Sell: `ask − 1¢`; 5-cent buffer for $500+/share names) remains in effect per Part 2 §8.2 v0.8 baseline. v0.9 adds two supplements:

**Time in force: DAY for all orders.** Orders that have not filled by market close are canceled by the broker at end of regular trading hours. Crosswind does not submit GTC, IOC, or FOK orders in v1.

**SSR-active short sale pricing (Reg SHO 201 compliance):**

When `verify_ssr_status(symbol)` per §11.0.7 #5 returns `active`, short sale pricing must comply with SEC Rule 201, which prohibits short sale execution at a price less than or equal to the current National Best Bid (NBB). Permitted short sales must be **strictly above** NBB.

The SSR-active short sale price is computed as:

```
default_sell_price = ask − 1¢
ssr_floor          = NBB + 1¢   (strictly above NBB)
short_sale_price   = max(default_sell_price, ssr_floor)
```

In normal market conditions (`ask > NBB + 1¢`), the default pricing already satisfies SSR and the floor does not bind. The floor binds when the spread is tight enough that `ask − 1¢ ≤ NBB`, which can occur during fast quote movements or at the open.

Routing correctness is the system's responsibility, not the broker's. Submitting short sales at the NBB when SSR is active produces `ssr_violation` rejections per §11.0.4 broker rejection propagation. The system must route correctly rather than rely on broker rejection as the safety net.

When `verify_ssr_status` returns `indeterminate` per §11.0.7 #5, the system refuses to submit short orders on the symbol this tick (per §7.5 step 6 entry sequence).

**VWAP/TWAP execution algorithms not used in v1.** Reconsider when single-trade size exceeds the impact threshold for the universe.

---

## §8.3 List-change-to-trade timing — v0.9 supplements *(NEW v0.9)*

The v0.7-locked asymmetric persistence (Entries: 2-tick rank persistence; Exits: trigger immediately on first cross above >30 or below <20) remains in effect per Part 2 §8.3 v0.8 baseline. v0.9 adds:

**Market hours boundaries:**

- New orders are not submitted in the last 15 minutes before market close. Existing positions that would trigger rank-exit during this window are deferred to the next trading day's open. Rationale: insufficient time to escalate per §8.6 bounded escalation if initial limit doesn't fill.
- New orders are not submitted in the first 5 minutes after market open. Rationale: opening auction price discovery produces erratic quotes that trigger excessive `verify_quote_freshness` failures and SSR-floor binding.

Short stop exits per §7.3 are exempt from these boundaries — a short hitting -15% mid-day must close regardless of proximity to open/close.

---

## §8.4 Hard-to-borrow rejection handling — v0.9 supplement *(NEW v0.9)*

The v0.7-locked behavior remains in effect per Part 2 §8.4 v0.8 baseline (failed shorts log the failure, book operates one short fewer until borrow returns or rank shifts, no automatic substitution). v0.9 adds:

**Supplement: HTB rejections propagate to §7 caches per §11.0.4 broker rejection propagation.** When Alpaca rejects a short with reason `htb`, the rejection updates §7's short-availability cache to mark the symbol as HTB. The cache update emits a `reconciliation_events` row with `call_name = "broker_rejection_propagation"`, `failure_action = "short_availability_cache_updated_htb"`. The cache stays HTB until the next successful `verify_short_availability` call (which would emit its own cache-clear event if the locate succeeds).

---

## §8.5 Latency budget — v0.9 supplement *(NEW v0.9)*

The v0.7-locked end-to-end latency target (30 seconds from rank detection to fill confirmation) remains in effect per Part 2 §8.5 v0.8 baseline. v0.9 adds:

This budget covers both Phase 1 (acceptance) and Phase 2 (initial fill attempt). Phase 1 typically resolves in <1-10s; the remaining ~20s is the Phase 2 initial fill window before escalation.

---

## §8.6 Two-phase order lifecycle state machine *(NEW STRUCTURE v0.9 — supersedes Part 2 §8.6 v0.8 baseline)*

Every order submission flows through two distinct phases. Phase 1 verifies broker acceptance; Phase 2 monitors fill. The phases are sequential — Phase 2 does not begin until Phase 1 returns `accepted`. The bounded escalation timer specified in v0.8 §8.6 operates only in Phase 2.

### §8.6.1 Phase 1 — Acceptance

After the order is submitted to Alpaca:

1. **`verify_order_acceptance(order_id, timeout_s=10)`** per §11.0.7 #13 (tri-state).
2. Three resolution paths:

**Path 1.A — `accepted`:**

- Order has been acknowledged by the broker and routed to the market.
- Proceed to Phase 2 (§8.6.2). Fill timer starts now.
- Log `reconciliation_events` row with `outcome = failure_handled` only if acceptance took longer than expected (e.g., >5s); routine acceptances do not generate events.

**Path 1.B — `rejected`:** *(revised per R1 — trade-type-aware retry rules)*

The **order ID is terminal** — the same order ID is never resubmitted. The **trade intent** follows trade-type-specific retry rules:

**Entry:** Trade intent fails for this tick. Book operates one fewer name. Next polling tick re-evaluates based on updated §7 caches (from §8.9 propagation) and may resubmit if conditions still warrant. Pre-flight gates on the next tick — using the now-updated cache — determine eligibility. The §7 pre-flight gates are the actual decision point for retry; §8.6.1's job is to mark the current order terminal and let the next tick decide.

**Rank-driven exit:** Trade intent persists. Position remains in `exit_pending` state. Next polling tick attempts a fresh exit order with fresh pre-flight gates per §7.6. The exit obligation does not lapse because of a single rejection.

**Stop-driven exit (short stop):** Trade intent persists with elevated urgency. Next polling tick attempts a fresh exit with fresh pre-flight gates AND elevated escalation — the fresh attempt starts at the second-escalation level (200 bps wider) rather than the initial limit, given the position has already lost ≥15% and the broker rejection has consumed time.

**Operator-alert-and-pause triggers override the default retry behavior** for specific rejection reasons:

| Rejection reason | Override behavior |
|---|---|
| `ssr_violation` | Pre-submission SSR routing per §8.2 should have prevented this. Classify as `system_bug` per §11.0.10 (engine_version-tagged for traceability). Trade intent **paused on this symbol** until routing defect is investigated and fixed. Other symbols unaffected. |
| `pdt_block` | Account-level issue. Operator alert (Strong tier per §12.5). All day-trade-eligible activity **paused pending operator resolution**. Multi-day positions unaffected. |
| `insufficient_buying_power` (persistent) | Three rejections within 1h triggers Low-tolerance escalation per §11.0.9. Operator alert (Strong tier). **New entry intents paused** on this account until operator reviews capital allocation. Existing positions, exits, and stops unaffected. |
| `halted` | Cache update propagates per §8.9. **No pause.** Next-tick retry per default trade-type rules above. |
| `htb` | Cache update propagates per §8.9. **No pause.** Next-tick retry per default trade-type rules; short entry on this symbol blocked by `verify_short_availability` until borrow returns. |
| `insufficient_buying_power` (transient, single rejection) | Cache update propagates per §8.9. **No pause.** Next-tick retry per default rules; pre-flight `verify_buying_power` on next tick uses refreshed cache. |
| `other` (broker-specific) | Operator alert (Strong tier) for novel rejection reasons. Trade intent paused on this symbol pending operator review of the unknown reason. |

Log `reconciliation_events` row per §11.0.4: `call_name = "broker_rejection_propagation"`, `outcome = failure_handled` when the rejection reflects expected market state and cache update succeeded, or `outcome = system_bug` when the rejection reveals a defect in pre-submission gates.

**Path 1.C — `pending`:**

- Broker has not responded within `timeout_s = 10`. Order may still be live; it may have been routed but not yet acknowledged, or the response may be delayed.
- **Cannot escalate the limit price.** The order is not yet live in the market; widening the limit makes no sense.
- **Cannot cancel-and-retry.** Cancellation of an order that has just been accepted (race with the broker) creates phantom rejection / retry storm class of failures per §11.0.7 #13.
- Escalate polling cadence: query `verify_order_acceptance` every 2 seconds for up to 60 seconds total.
- If acceptance resolves to `accepted` within the 60s extended window, proceed to Phase 2 with fill timer starting at the resolution moment (not at original submission).
- If acceptance resolves to `rejected` within the 60s window, follow Path 1.B handling.
- If still `pending` at the 60s mark: **operator alert.** Manual disposition required. The order may eventually be accepted, eventually be rejected, or be lost to broker-side issues. Operator decides whether to manually cancel (with awareness that cancellation may race with fill) or wait for broker resolution.
- Log `reconciliation_events` row with `outcome = failure_escalated`, `failure_action = "acceptance_pending_60s_operator_alert"`, Strong tier per §11.0.10.

**Critical structural rule: the Phase 2 fill timer does NOT start during Phase 1 `pending` state.** The v0.8 §8.6 bounded escalation operates on time-since-live (when the order is actually working in the market), not time-since-submission.

### §8.6.1.1 Trade-type-specific Phase 1 timeouts *(NEW per R2)*

The default Phase 1 timeout from §11.0.7 #13 (`timeout_s = 10` initial + up to 60s extended polling) applies to entries and rank-driven exits. **Short-stop exits use tighter timing** reflecting their time-critical nature: a short stop fires because the position has already lost ≥15%; every additional second waiting for acceptance is more loss accumulating beyond the stop threshold.

| Trade type | Initial Phase 1 timeout | Extended polling cap | Total acceptance uncertainty |
|---|---|---|---|
| Entry | 10s | 60s | up to 70s |
| Rank-driven exit | 10s | 60s | up to 70s |
| Short stop exit | **5s** | **15s** | **up to 20s** |

**Short-stop Phase 1 failure handling:** if acceptance is still `pending` at the 20s mark, the system does NOT cancel-and-retry (per §11.0.7 #13 cancel-and-retry hazard — cancellation of an order that has just been accepted creates phantom rejection / retry storm class of failures). Instead, the short-stop parallel-order mechanism activates:

**Parallel-order mechanism (short-stop specific):**

1. Submit a parallel **market order** for the same quantity via a different order ID. Alpaca permits multiple pending orders on the same symbol for closes. The market order is intended to ensure exit even if the original limit order eventually fills.

2. Both orders are now live. Each independently flows through Phase 1 → Phase 2 (the market order's Phase 1 should resolve in <1s given market-order acceptance behavior).

3. **Over-close detection via post-fill verification:** if both orders eventually fill (the original limit becomes accepted-and-filled AND the market order fills), the system has over-closed by 2× quantity. The position goes from short to short-zero to long (or zero to long for what was a flat-after-stop position). Immediate post-fill `verify_position` per §11.0.7 #1 detects the over-close (expected_qty=0 but observed_qty=long_position_from_over_close).

4. **Corrective trade:** the system submits a corrective sell order to close the unintended long position created by the over-close, restoring position to zero. The corrective trade is a standard exit per §7.6 (with the position side now `long` instead of `short`). Strong-tier event per §12.5; operator alert with structured detail of the over-close.

**Trade-off rationale:** the parallel-order pattern trades a small probability of over-close (resolvable by a corrective trade with bounded slippage) for a much lower probability of stop-not-firing-while-position-keeps-losing. For short stops specifically — where the asymmetric tail risk of "didn't close" massively exceeds the cost of "accidentally over-closed" — this is the right trade-off.

**Restriction to short stops:** the parallel-order mechanism is **short-stop-specific**. Entries and rank-exits do not use parallel orders because their loss exposure does not justify the over-close risk. Entries that fail Phase 1 simply fail for the tick (book operates one fewer name); rank-exits that fail Phase 1 retry next polling tick at fresh pre-flight gates.

**Phase 0B validation requirement:** the parallel-order mechanism's operational mechanics depend on Alpaca's multi-pending-order support for the same symbol on the close side. Phase 0B validates this behavior against Alpaca's actual paper trading API.

**v0 fallback if Alpaca multi-pending-order support is unclean:** short-stop Phase 1 fails at 20s → operator page + the system continues retrying every polling tick at progressively more aggressive limits (200bps→market per §8.6.2 short-stop escalation). Operator decides whether to manually intervene. This accepts more loss exposure during the broker-side outage but avoids the implementation complexity of multi-pending-order coordination. Phase 0B determines which path is operational for v1.

### §8.6.2 Phase 2 — Fill monitoring

Phase 2 begins when Phase 1 returns `accepted`. The fill timer starts at this transition moment.

Phase 2 behavior depends on the trade type (entry, rank-driven exit, stop-driven exit) per the v0.7-locked escalation specifications. The behavior is faithfully preserved with the structural change being that timers measure time-since-acceptance, not time-since-submission.

**Entry trades:**

- **30s mark:** Check fill state.
  - **Fully filled:** Order complete. Proceed to post-fill verification (§7.5 step 9).
  - **Partially filled:** Handle per §8.7 partial-fill discipline.
  - **Not filled:** Escalate to wider limit. Cancel-or-modify the original order (per §8.8 modify-vs-cancel discipline), submit at `bid + max(50 bps, 5¢)` for buys or `ask − max(50 bps, 5¢)` for sells, for the unfilled quantity. Re-enter Phase 1 for the escalated order (acceptance must be re-verified for the new order — modify operations typically don't require this; cancel-and-replace does).
- **60s mark after escalation:** Check fill state.
  - **Fully filled:** Order complete.
  - **Partially filled:** Handle per §8.7.
  - **Not filled:** Cancel the order. Trade fails. Book operates at one fewer name until next opportunity. Worst-case slippage on attempted entry: 50 bps of position value.

**Rank-driven exit trades:**

- **30s mark:** Check fill state.
  - **Fully filled:** Order complete. Proceed to post-fill verification (§7.6 step 6).
  - **Partially filled:** Handle per §8.7.
  - **Not filled:** Escalate to `bid + max(100 bps, 10¢)` for sells, `ask − max(100 bps, 10¢)` for buys-to-cover.
- **60s mark after first escalation:** Check fill state.
  - **Not filled:** Escalate again to 200 bps wider.
- **60s mark after second escalation:** Check fill state.
  - **Not filled:** Mark the position as `exit_pending`, retry next polling tick. The exit obligation persists across polling ticks — the position is targeted for closure and will be re-attempted with fresh quotes each tick until it closes. Operator alert if `exit_pending` persists beyond 5 polling ticks (~25 minutes).

**15% short stop exits:**

- **30s mark:** Check fill state.
  - **Fully filled:** Order complete.
  - **Partially filled:** Handle per §8.7.
  - **Not filled:** Escalate to `ask + max(200 bps, 20¢)` for buys-to-cover.
- **30s mark after escalation:** Check fill state.
  - **Not filled:** Escalate to true market order. Asymmetric tail risk on shorts justifies accepting market-order slippage to ensure exit.

These escalation thresholds are the v0.7-locked values from v0.8 §8.6. Phase 0 validates whether the bps bounds are too tight or too loose; adjust in v1.5 if needed.

### §8.6.3 Cents floor (carried forward from v0.7)

The cents-floor protection (e.g., `max(50 bps, 5¢)` and `max(200 bps, 20¢)`) protects against sub-tick slippage caps on low-priced stocks. For S&P 500 + S&P 400 universe with share prices ≥$5 per §3.2, the bps cap usually binds. The cents floor is a safety net.

---

## §8.7 Partial-fill discipline *(NEW v0.9 — supersedes Part 2 §8.7 v0.8 baseline; v0.8 content migrates to §16)*

When an order partial-fills (some shares execute at the original limit but the full quantity does not), the system handles the residual unfilled quantity rather than abandoning it.

**Procedure:**

1. The partial fill quantity is recorded via standard post-fill verification (§7.5 step 9 for entry, §7.6 step 6 for exit, §7.9 step 1 for trim). `verify_position` is called with `expected_qty` reflecting the *partial* fill, not the target. This emits a normal pass.
2. The unfilled residual quantity becomes the basis for the next escalation step. Cancel the unfilled portion of the original order (per §8.8 modify-vs-cancel); submit a new order at the escalated limit price for the residual quantity only.
3. The escalated order re-enters Phase 1 (acceptance verification) for the new order ID. Fill timer for the residual starts at the new order's Phase 2 transition.
4. If the residual order also partial-fills, the procedure repeats: original partial + residual partial = total filled; remaining residual goes to next escalation.

**Terminal outcomes for partial fills:**

- **Entry trade where partial fills are accepted and residual cancels at 60s:** Book operates with the partial position (smaller than the 2.5% target). The position is treated as a normal position for all subsequent reconciliation; its `cost_basis` reflects the actual filled price; it can be trimmed or exited per normal rules. The "missing" portion does not retry — that would be a new entry which requires fresh universe/sector/buying-power gates.
- **Exit trade where partial fills are accepted:** The remaining unfilled position remains held. The exit obligation persists per the `exit_pending` state. Subsequent polling ticks re-attempt the unfilled residual until the position fully closes.

**`verify_position` interaction:** post-fill verify for partial fills checks the partial quantity, not the target. The lot accounting per §7.5 step 10 (new lot creation for entry) creates the lot with the partial fill quantity. If subsequent escalation fills the residual, a separate lot is created for the residual fill, with its own cost_basis at the escalated price.

---

## §8.8 Modify-vs-cancel-and-replace for escalation *(NEW v0.9)*

When escalating an order's limit price per §8.6.2, two operational mechanisms are available:

**Modify (PATCH `/v2/orders/{id}`):** Updates the existing order's limit price in place. The order retains its position in the broker's queue. Faster, no race-condition window between cancel and re-submission.

**Cancel-and-replace:** Cancels the original order, submits a new order at the escalated price. There is a brief window during which neither order is live in the market; fast market moves during this window can produce different execution than intended.

**Policy:**

- **Prefer `modify` when Alpaca supports it** for the specific order type and modification being made. Modify is safer for the race window.
- **Use `cancel-and-replace` as fallback** when modify is not supported or when the modification is materially complex (e.g., changing both price and quantity simultaneously, which Alpaca may not support as a single modify operation).
- **For partial-fill residual escalation per §8.7:** cancel-and-replace is typically required because the new order quantity differs from the original. Modify operations that change quantity may not be supported.

**Race-condition handling for cancel-and-replace:** If the cancel succeeds but the replace submission fails, the system has lost its order. Log `reconciliation_events` row with `outcome = system_bug` if this occurs, and the order context (entry/rank-exit/stop-exit) determines the recovery action — entry trades fail; rank-exit trades retry next polling tick; stop-exits escalate immediately to a fresh market order.

Specific Alpaca implementation details for modify support per order type, and the exact PATCH parameters, are operational details belonging in §13 schema and infrastructure drafting. The §8 spec establishes the policy; §13 specifies the API mechanics.

---

## §8.9 Broker rejection propagation to §7 caches (per §11.0.4) *(NEW v0.9)*

When Phase 1 Path 1.B fires (broker rejection), §8 propagates the rejection back to §7's internal caches. This is the primary mechanism by which Crosswind's internal view of universe/halt/SSR/HTB/buying-power state is corrected when it diverges from broker reality.

**Per-rejection-reason handling:**

| Rejection reason | §7 cache update | reconciliation_events failure_action |
|---|---|---|
| `halted` | Mark symbol as halted in §7's halt cache (with timestamp). Halt cache TTL aligned with §3.3c 5-trading-day rule. | `halt_cache_updated_from_rejection` |
| `htb` | Mark symbol as HTB in §7's short-availability cache. Stays HTB until next successful `verify_short_availability`. | `short_availability_cache_updated_htb` |
| `ssr_violation` | Mark symbol as SSR-active in §7's SSR cache (regardless of what `verify_ssr_status` returned before submission). | `ssr_cache_updated_from_rejection` |
| `insufficient_buying_power` | Force refresh of §7's buying-power cache via fresh `verify_buying_power` call. The rejection indicates internal cache was stale or wrong. | `buying_power_cache_refreshed` |
| `pdt_block` | Flag PDT condition in §7's account-state cache. Pause new day-trade-eligible activity for the operator's review. | `pdt_block_flagged` |
| `other` (broker-specific reason) | Log structured detail. Operator alert (Strong tier) for novel rejection reasons. | `unknown_broker_rejection_operator_alert` |

**Outcome classification:**

- `outcome = failure_handled` when the cache update propagation worked correctly AND the rejection itself was expected given current market state (e.g., a symbol genuinely went halted between our cache check and submission).
- `outcome = system_bug` when the rejection reveals a defect in pre-submission gates (e.g., we submitted a short despite our internal cache showing HTB from a successful `verify_short_availability` call moments earlier). System bug requires root-cause investigation per §11.0.11 exit-gate discipline.

**Critical structural rule:** broker rejections are NOT retried automatically. Even after the §7 cache is updated, the system does not immediately resubmit. The trade fails; the next polling tick's reconciliation gates will determine whether the symbol is eligible to trade given the updated cache state. (R1 trade-type-aware retry per §8.6.1 Path 1.B determines whether the trade intent persists or terminates — order ID is always terminal.)

---

## §8.10 LULD pauses *(NEW v0.9)*

Limit Up Limit Down (LULD) pauses are single-stock circuit breakers that briefly halt trading when prices move beyond defined bands. LULD pauses are reported on the exchange feed and surface through `verify_halt_status` per §11.0.7 #6.

**No separate LULD handling logic is built.** The standard halt-status flow handles LULD pauses identically to other halts: orders during a LULD pause are rejected by the broker (or skipped pre-submission via `verify_halt_status`), the cache update propagates per §8.9, and the symbol becomes eligible again when the pause lifts.

Engineers should not build separate LULD-handling pipelines. The halt-status reconciliation flow is sufficient.

---

## §8.11 Per-call failure-action table for §8 *(NEW v0.9, with R1/R2 additions integrated)*

The table consolidates §8.6-§8.9 reconciliation calls and their failure actions. Used as operational reference during implementation. R1 (trade-type-aware retry) and R2 (short-stop tighter timeout + parallel-order) additions integrated inline.

| Verify call / Event | Context | Tolerance / Path | Failure action |
|---|---|---|---|
| `verify_order_acceptance` | Phase 1, any trade | Zero-tolerance (rejected) | Path 1.A (accepted): proceed to Phase 2. Path 1.B (rejected): terminate order ID per §8.6.1 R1 trade-type-aware retry rules; propagate to §7 caches per §8.9; trade intent persists for rank/stop exits, terminates for entries. Path 1.C (pending): poll every 2s for 60s; if unresolved, operator alert. |
| Phase 1 acceptance timeout | Short stop exit | 5s + 15s extended (R2) | Parallel-order mechanism activates: market order submitted via different order ID. Over-close detection via post-fill `verify_position`; corrective trade if both fill. Strong-tier event. |
| Fill check at 30s | Phase 2, entry | n/a | Fully filled: done. Partial: §8.7. Not filled: escalate to 50bps wider. |
| Fill check at 90s (60s after first escalation) | Phase 2, entry | n/a | Fully filled: done. Partial: §8.7. Not filled: cancel, trade fails. |
| Fill check at 30s | Phase 2, rank-exit | n/a | Fully filled: done. Partial: §8.7. Not filled: escalate to 100bps wider. |
| Fill check at 90s | Phase 2, rank-exit | n/a | Fully filled: done. Partial: §8.7. Not filled: escalate to 200bps wider. |
| Fill check at 150s | Phase 2, rank-exit | n/a | Fully filled: done. Partial: §8.7. Not filled: mark `exit_pending`, retry next tick. Operator alert if persists >5 ticks. |
| Fill check at 30s | Phase 2, short stop | n/a | Fully filled: done. Partial: §8.7. Not filled: escalate to 200bps wider. |
| Fill check at 60s | Phase 2, short stop | n/a | Fully filled: done. Partial: §8.7. Not filled: escalate to true market order. |
| Broker rejection `halted` | Phase 1 Path 1.B, any trade | Default retry rule (R1) | Cache update per §8.9; next-tick retry per trade-type rules; no pause. |
| Broker rejection `htb` | Phase 1 Path 1.B, short | Default retry rule (R1) | Cache update per §8.9; next-tick retry; short entry blocked by `verify_short_availability` until locate returns. |
| Broker rejection `ssr_violation` | Phase 1 Path 1.B, short | Override pause (R1) | `system_bug` classification; trade intent paused on this symbol; investigate routing defect. |
| Broker rejection `insufficient_buying_power` (transient) | Phase 1 Path 1.B, entry | Default retry rule (R1) | Cache refresh per §8.9; next-tick retry with refreshed cache. |
| Broker rejection `insufficient_buying_power` (persistent, 3+ within 1h) | Phase 1 Path 1.B, entry | Override pause (R1) | Operator alert (Strong tier); new entry intents paused on account. |
| Broker rejection `pdt_block` | Phase 1 Path 1.B, any day-trade | Override pause (R1) | Operator alert (Strong tier); all day-trade-eligible activity paused. |
| Broker rejection `other` | Phase 1 Path 1.B | Override pause (R1) | Operator alert (Strong tier); trade intent paused on symbol pending review. |
| Modify operation failure | §8.8 escalation | Strong tier | Fall back to cancel-and-replace. If cancel-replace also fails, emit `system_bug`, operator alert. |
| Partial fill | §8.7 | n/a | Record partial via verify_position; cancel residual; submit escalated order for unfilled qty; re-enter Phase 1. |

---

## §8.12 Cross-references summary *(NEW v0.9)*

§8 references the following §11.0 subsections:

- §11.0.4 (broker_rejection_propagation) — primary mechanism for §8.9 rejection handling
- §11.0.7 #5 (`verify_ssr_status`) — tri-state result driving SSR-active routing per §8.2
- §11.0.7 #6 (`verify_halt_status`) — covers LULD pauses per §8.10
- §11.0.7 #13 (`verify_order_acceptance`) — tri-state driving the Phase 1 state machine
- §11.0.9 — Zero-tolerance for `rejected` state, Low-tolerance otherwise
- §11.0.10 — `reconciliation_events` schema; `outcome = system_bug` classification for pre-submission gate defects

§8 references §7 for handoff (entry/exit/trim sequences feed orders into §8) and for cache updates (§8.9 propagation back to §7).

§8 introduces no new verify_* interfaces beyond those already specified in §11.0.7 (post-§11.0 interstitial revision in Part 2b). All reconciliation surfaces are pre-existing.

---

## ✅ OPERATOR DECISIONS CONFIRMED — Verification items resolved before Part 2c final lock

Three V-items surfaced during Part 2c drafting where the operator's Part 2c scope description referenced content that did NOT trace cleanly to the canonical §8 transcript drafts, plus one Part 2 supersession concern. Per the symmetric-verification discipline established through Part 2 (operator-executor symmetric verification against project file), Part 2b (V1 UUID + tiebreaker, V3 §7.13 inclusion), and now Part 2c: when operator scope description and canonical transcript disagree, transcript is canonical for v0.9 NEW content and divergences are surfaced rather than silently imported/dropped. All three resolved as Option A before final lock.

### V1 — §8.0 Section overview and §8.12 Cross-references summary in canonical but not in operator scope

**Operator's Part 2c scope description (from prior message):**

> "§8 v0.9 two-phase order state machine (Phase 1 Acceptance with tri-state verify_order_acceptance; Phase 2 Fill with bounded escalation timer) / SSR routing strictly above NBB per Reg SHO 201 / Market-hours boundary discipline / Partial-fill handling / Modify-vs-cancel-and-replace preference / Broker rejection propagation to §7 caches / LULD via verify_halt_status"

**Canonical transcript §8 Pass A draft includes:**

- **§8.0 Section overview** (NEW v0.9 framing of §8 architectural changes and v0.7-locked content preservation)
- **§8.12 Cross-references summary** (NEW v0.9 reference summary to §11.0 subsections and §7 handoffs; explicit note that §8 introduces no new verify_* interfaces)

Operator scope did not name these subsections explicitly.

**Status analysis:** Same pattern as §7.13 V3 resolved in Part 2b (Option A confirmed — canonical wins when scope and source disagree).

**Disposition options:**

- **Option A:** Include §8.0 and §8.12 per canonical transcript. Mirrors §7.13 V3 Option A resolution pattern. Reproduces canonical faithfully.
- **Option B:** Drop §8.0 and §8.12 per operator's stated scope. Substantive cross-reference content from §8.12 is duplicated by inline citations throughout §8.6-§8.11; §8.0 section overview is operationally useful framing but non-architectural.
- **Option C:** Defer §8.0 / §8.12 to v0.9 final assembly (incorporate when full spec assembled).

**Decision: V1 Option A confirmed — §8.0 and §8.12 included per canonical transcript.** Applied as drafted: §8.0 Section overview (NEW v0.9 architectural framing — v0.7 architecture preserved, v0.9 operational discipline added) and §8.12 Cross-references summary (NEW v0.9 reference summary to §11.0 subsections and §7 handoffs; explicit note that §8 introduces no new verify_* interfaces beyond the §11.0 interstitial revision in Part 2b) both present in Part 2c.

Operator confirmation citation: "Mirrors §7.13 V3 Option A resolution pattern. Operator scope description's omission of §8.0 and §8.12 was an oversight, not exclusion. §8.0 establishes architectural framing (v0.7 preserved + v0.9 operational discipline added) which is operationally important for engineers reading §8; §8.12 cross-references summary parallels §7.13 in serving spec navigation."

### V2 — §8.2 TIF=DAY clause in canonical but not in operator scope

**Operator's Part 2c scope description** mentioned SSR routing only for §8.2.

**Canonical transcript §8.2 v0.9 additions:**

> "**Time in force: DAY for all orders.** Orders that have not filled by market close are canceled by the broker at end of regular trading hours. Crosswind does not submit GTC, IOC, or FOK orders in v1."

This sentence is a NEW v0.9 addition to §8.2 alongside the SSR routing block. Canonical Pass A reflection notes explicitly: "TIF=DAY for all orders: one sentence in §8.2."

**Status analysis:** Same pattern as V1 — canonical content not named in operator scope. Single-sentence addition, low ambiguity.

**Disposition options:**

- **Option A:** Include TIF=DAY clause per canonical. Reproduces canonical faithfully; single-sentence clarification that orders are DAY-TIF only.
- **Option B:** Drop TIF=DAY clause per operator scope. Risk: leaves an implicit assumption unstated; engineers may default to different TIF values.

**Decision: V2 Option A confirmed — TIF=DAY clause included per canonical transcript.** Applied as drafted: §8.2 v0.9 supplements include "Time in force: DAY for all orders" sentence alongside SSR routing block. v0.8 did not explicitly specify TIF; v0.9 makes the DAY-TIF assumption explicit and bans GTC/IOC/FOK orders in v1.

Operator confirmation citation: "Single-sentence operationally-significant clarification. v0.8 didn't specify TIF; v0.9 makes it explicit. Without this, engineers might default to different TIF values (GTC particularly). Better to lock the assumption."

### V3 — Part 2 §8.6/§8.7 v0.8 baseline supersession by Part 2c v0.9 content

**Context:** Part 2 reproduced §8.1-§8.7 v0.8 baseline verbatim (per V0.8-source-canonical discipline for v0.8 verbatim sections). Part 2c v0.9 §8.6 (Two-phase state machine NEW STRUCTURE) and §8.7 (Partial-fill discipline NEW) **supersede** v0.8 §8.6 (Bounded escalation on timeout) and v0.8 §8.7 (v2 deferred enhancements) respectively.

**Canonical Pass B redline statement:**

> "v0.8 §8.7 listed per-signal-family timeout architecture and asymmetric cancel-vs-escalate behavior as v2 deferred enhancements. These remain deferred in v0.9. The v0.8 §8.7 section content moves to §8.13 (or stays in §16 deferred list) — for spec organization, recommend keeping it in §16 per the standard 'decisions deferred to v2' pattern. The §8.7 number is now used for partial-fill discipline."

**Implications for v0.9 final assembly:**

- The v0.8 §8.6 content (bounded escalation on timeout — bps thresholds, escalation sequences) is preserved inside Part 2c §8.6.2 Phase 2 of the new structure, NOT discarded. The supersession is structural reorganization, not content loss.
- The v0.8 §8.7 content (per-signal-family timeout architecture, asymmetric cancel-vs-escalate) migrates to §16 v2-deferred list per canonical Pass B recommendation. Verify §16 content reflects this migration during v0.9 final assembly.
- Part 2's §8.6 and §8.7 v0.8 baseline reproductions become **stale** at v0.9 final assembly — the consolidated v0.9 spec should not contain both Part 2's v0.8 §8.6/§8.7 AND Part 2c's v0.9 §8.6/§8.7. Resolution discipline: v0.9 final-assembly pass removes Part 2's v0.8 §8.6/§8.7 reproductions and replaces with Part 2c's v0.9 content.

**Disposition options:**

- **Option A:** Acknowledge supersession as v0.9 final-assembly note (Part 2c surfaces; final assembly resolves). Both Part 2's v0.8 baseline and Part 2c's v0.9 content stand as separate consolidation artifacts; final spec assembly does the structural merge. This matches Part 1's "§5 deferred sections list" cross-reference pattern.
- **Option B:** Apply structural merge during Part 2c by explicitly removing or marking-as-superseded Part 2's v0.8 §8.6/§8.7 content with a mechanical edit to Part 2. Heavier; affects already-locked Part 2.

**Decision: V3 Option A confirmed — supersession acknowledged for v0.9 final-assembly resolution.** Applied as drafted: Part 2c §8.6 and §8.7 supersession of Part 2's v0.8 §8.6/§8.7 baseline content is surfaced explicitly via the "Supersession notes for Part 2 v0.8 baseline content" block at the top of Part 2c and via the "(NEW STRUCTURE v0.9 — supersedes Part 2 §8.6 v0.8 baseline)" and "(NEW v0.9 — supersedes Part 2 §8.7 v0.8 baseline; v0.8 content migrates to §16)" markers on the §8.6 and §8.7 headings.

Operator confirmation citation: "Part 2c surfaces the supersession; v0.9 final assembly resolves the structural merge. This preserves Part 2 lock integrity — Part 2 is the v0.8-baseline canonical artifact for §8.1-§8.7 verbatim reproduction; the v0.9 supersession is a final-assembly concern, not a Part 2 cleanup concern. The v0.8 §8.6 content (bps thresholds 50/100/200, escalation sequences) is preserved inside Part 2c §8.6.2 Phase 2 — supersession is structural reorganization, not content loss. The v0.8 §8.7 content (per-signal-family timeout architecture, asymmetric cancel-vs-escalate) migrates to §16 v2-deferred list per canonical Pass B recommendation."

Forward-tracking items rolled into Part 6 (spec-source-index) follow-up tracking:

1. **V3 final-assembly resolution:** v0.9 final-assembly pass removes Part 2's stale v0.8 §8.6/§8.7 reproductions and replaces with Part 2c's v0.9 §8.6 (NEW STRUCTURE two-phase state machine) and §8.7 (Partial-fill discipline).
2. **v0.8 §8.7 → §16 migration:** verify v0.9 final §16 contains per-signal-family timeout architecture and asymmetric cancel-vs-escalate behavior as v2-deferred items per canonical Pass B.
3. **§8.6.2 v0.7-locked bps thresholds preservation check:** verify v0.9 final spec retains bps thresholds (50/100/200) and trade-type-specific escalation sequences inside §8.6.2 Phase 2 exactly.
4. **§8.6.1.1 Phase 0B validation requirement:** Phase 0B must validate Alpaca's multi-pending-order behavior for the short-stop parallel-order mechanism. If Alpaca doesn't cleanly support multi-pending close-side orders on the same symbol, v0 fallback (operator page + continued aggressive escalation per §8.6.2) applies. Track as Phase 0B deliverable in Part 3 (§10 phase plan).

---

<!-- =================================================================== -->
<!-- Part 3a: §10.0-§10.7 Build/foundation phases                         -->
<!-- =================================================================== -->

## §10.0 Section overview *(NEW v0.9)*

§10 specifies the phase-by-phase build sequence for Crosswind. Each phase delivers a complete operational component built behind the foundational reconciliation layer (§11.0), with full §11/§12 discipline applied (modular isolation, testing, monitoring, evidence-tier compliance, documentation, runbooks). Each phase has explicit exit gates that must be met before advancing.

The v0.9 phase plan substantially restructures v0.8's 10-phase architecture:

- **Phase 0 splits into Phase 0A (foundation) and Phase 0B (reconciliation engine + replay framework + evidence-workflow tooling).** Phase 0B is the architectural commitment of v0.9 — the reconciliation layer is built before any business logic.
- **Phase 2 sub-phases capture missingness profile data** for Phase 3 combiner training (per §6.5.3).
- **Phase 3 adds the missingness stress test exit gate** (per §6.5.4).
- **Phase 4 validates wash sale tracking infrastructure** including §7.7 Path A/B and §7.8 retroactive cost-basis adjustment.
- **Phase 5 validates the §8 two-phase execution state machine** including SSR routing, broker rejection propagation, and partial-fill discipline.
- **Phase 7 adds the reconciliation-quietness exit gate** (30 RTH days of explained firings per §11.0.11).
- **Phase 8 adds live-broker reconciliation verification** (paper-vs-live behavior differences may require tolerance ADRs).
- **Phase 9 adds sustained-reconciliation-anomaly kill condition** for gradual systemic drift detection.

---

## §10.1 Phase structure overview *(NEW v0.9)*

| Phase | Name | Duration (AI-accelerated w/ §12.5 discipline) | Capital deployed | Kill possible? |
|---|---|---|---|---|
| 0A | Foundation infrastructure | 2-4 weeks | None | No (foundation) |
| 0B | Reconciliation engine + replay framework + evidence tooling | 6-10 weeks baseline; 7-10 realistic; may extend to 11-12 weeks (V1) | None | No (foundation) |
| 1 | Universe ingestion | 2-4 weeks | None | Yes |
| 2 | Signal stack (9 sub-phases) | 8-14 weeks | None | Yes (3+ signal failures) |
| 3 | Combiner and modeling | 4-6 weeks | None | Yes (if combiner doesn't learn) |
| 4 | Portfolio construction + wash sale infrastructure | 4-6 weeks | None | Yes |
| 5 | Execution layer (paper) | 3-4 weeks | None | Yes |
| 6 | Full system integration | 3-5 weeks | None | Yes |
| 7 | Paper trading validation | 3-6 months | Paper $100K | Yes |
| 8 | Small live operational validation | 3-6 months | Operator-chosen small | Yes |
| 9 | Scaled deployment | Ongoing | Operator-chosen intended | Ongoing kill via §11.6 |

**Pre-paper-trading total (Phases 0A-6): 32-53 weeks ≈ 7-12 months of focused work.** (Updated per V1: Phase 0B baseline shifted from 5-8 weeks to 6-10 weeks; pre-paper-trading total accordingly shifts from 31-51 to 32-53 weeks.)

**Total to scaled deployment: roughly 14-25 months at planning numbers** (per C1 timeline math propagation correction — V1's +8-12 weeks of Phase 0B propagates +2-3 months total since Phase 7+8 are calendar-bound and cannot compress). **May extend up to 4-5 months further (16-27 months total) if Phase 0B extends to 11-12 weeks per V1 contingency.**

The v0.9 timeline at planning numbers is approximately +2-3 months longer than v0.8's 12-22 months per C1 timeline math propagation correction. V1's contingency extension (Phase 0B to 11-12 weeks) could add up to 4-5 months further. The honest framing is that 14-25 months is the planning-numbers commitment; 16-27 months is the contingency-aware upper bound. Underselling at 13-23 months creates operator commitment misalignment with realistic duration; the figures above reflect the corrected math.

---

## §10.2 Timeline framing — AI acceleration requires evidence discipline *(NEW v0.9)*

Build phases (0A-6) benefit substantially from AI development tools (Cursor, Lovable, Claude Code, Copilot) — sometimes 2-3× faster than without AI tools for code generation, documentation drafting, test scaffolding, and repetitive component plumbing.

**Critical qualification:** AI acceleration only materializes WITH the evidence-tier discipline of §12.5 and the reconciliation infrastructure of §11.0. AI tools without evidence discipline produce code that ships defects faster, not better code. AI tools without reconciliation infrastructure produce internally-consistent code that drifts from reality at the same accelerated rate.

The Phase 0B tooling investment (Strong-evidence workflow with <15-minute artifact generation per §11.0.13) is what enables AI acceleration to translate into actual velocity. Without it, AI tools accelerate the defect production rate at the same multiple they accelerate the code production rate. With it, AI tools accelerate validated-defect-free code production.

**Validation phases (7-9) do not accelerate.** They require calendar time to span market regimes, exercise quarterly tasks, demonstrate operator discipline through drawdowns, and verify reconciliation behavior across paper-to-live transitions. This is the honest constraint.

**Total elapsed time to scaled deployment is 14-25 months at planning numbers** (per C1 timeline math propagation correction). This is honest. Operator commitment to this horizon is required before Phase 0A begins. V1's Phase 0B contingency extension (11-12 weeks) could add up to 4-5 months further (16-27 months total). Quarterly self-assessment of project continuation viability is part of operational discipline (per §10.16, Part 3b scope).

The duration estimates above are planning numbers, not commitments. Sub-phases advance when their gates are met, not on a calendar.

---

## §10.3 Phase 0A — Foundation infrastructure *(REVISED v0.9 — Phase 0 split into 0A/0B)*

**Assumption:** A foundation with basic login/logout, authentication, and GitHub repository structure is provided as the starting point. Phase 0A integrates Crosswind-specific infrastructure onto this foundation.

**Goal:** Establish operational infrastructure such that Phase 0B can be built with §11/§12 discipline supported by default.

**Deliverables:**

1. Crosswind repository integrated with provided foundation. GitHub workflows, branch protection, CI/CD pipelines.
2. AI development rules file authored and committed (Cursor's `.cursor/rules`, `CLAUDE.md`, `AI_RULES.md` per §12.5). Initial version includes Rules 1-10 with placeholder tier-evidence requirements; full evidence-hierarchy enforcement activates in Phase 0B.
3. Documentation infrastructure scaffolded: Tier 1 spec (CROSSWIND_SPEC.md), Tier 2 component templates, Tier 3 runbook templates, `SYSTEM_DEPENDENCIES.md` skeleton, `docs/decisions/` with first ADR template.
4. Task tracking system established (GitHub Issues with structured templates, Linear, or similar).
5. Database infrastructure operational: Supabase project, base schema for system-level tables (`audit_log`, `configuration`, `feature_flags`, `operators` for multi-instance optionality per §9.7), migration tooling. **All Crosswind-specific tables created in Phase 0A or later are keyed by `(operator_id, ...)` rather than just the natural key.** v1 uses a single operator_id throughout but schema does not preclude multi-operator deployment in v2.
6. Compute infrastructure operational: Modal workspace, environment management, secret management.
7. Observability infrastructure: logging pipeline, error tracking, metrics collection, alerting routes, dashboard skeleton.
8. Kill-switch architecture per §11.6 (soft pause, hard pause, manual liquidation) implemented at infrastructure level.
9. Configuration management: environment variables, feature flags, configurations managed through single mechanism with §12.7 versioning.
10. Operator dashboard skeleton, ready to display component metrics as components come online.

**Exit gates to Phase 0B:**

- All deliverables complete and documented
- A "hello world" Crosswind component deploys end-to-end (e.g., trivial daily job writing to database and emitting health metric)
- Documentation passes review: outside reader could understand project structure from docs alone
- AI development rules tested: at least one AI-tool-generated change processed through the rules
- Kill-switch tested: soft pause and hard pause manually triggered and verified
- Multi-instance schema convention verified: a test inserting two operator_ids and querying with operator_id filter returns isolated results

**Kill condition:** None. Phase 0A is foundation.

**Duration estimate:** 2-4 weeks.

---

## §10.4 Phase 0B — Reconciliation engine + replay framework + evidence tooling *(NEW v0.9)*

**Phase 0B is the architectural commitment of v0.9.** Its deliverables form the structural verification layer that all subsequent business logic operates behind. The deliverables are listed in priority order per §11.0.13; if time pressure forces triage, the priority order determines what gets built first.

**Priority deliverables:**

**1. Reconciliation engine** with all 17 `verify_*` interfaces per §11.0.7 and the `reconciliation_events` table per §11.0.10:

- `verify_position` (#1), `verify_quote` (#2), `verify_quote_freshness` (#3), `verify_short_availability` (#4), `verify_ssr_status` (#5), `verify_halt_status` (#6), `verify_borrow_rate` (#7), `verify_borrow_persistence` (#8), `verify_buying_power` (#9), `verify_universe_membership` (#10), `verify_corporate_action_clean` (#11), `verify_settlement_status` (#12), `verify_order_acceptance` (#13, tri-state), `verify_realized_pnl` (#14), `verify_lot_record` (#15), `verify_wash_sale_record` (#16), `verify_rebalance_aggregate` (#17)
- Per-call tolerance classes per §11.0.9 (Zero-tolerance / Low-tolerance / Noise-tolerant) with magnitude-based escalation overrides
- `reconciliation_events` table per §11.0.10 schema, keyed by `(operator_id, event_id)` per multi-instance optionality
- All 17 interfaces with stub implementations against Alpaca paper trading and dual quote sources (Polygon + Tradier/Yahoo)
- Failure-action behavior wired per §11.0.8 (specific action per call, not generic)
- **Sustained-anomaly baseline aggregation infrastructure (per A1):** aggregation views (daily/weekly/monthly per call_name per outcome) and baseline-vs-current comparison query helper. Baseline values themselves populate during Phase 7 paper trading, but the aggregation infrastructure must exist from Phase 0B to support Phase 9 sustained-anomaly kill condition per §10.13.

**2. Strong-evidence workflow tooling** with <15-minute wall-clock target and CI enforcement:

- One-command replay execution against captured RTH days
- Auto-generated reconciliation telemetry reports (PR-ready)
- Pre-built broker-API spot-check scripts (Alpaca position/order/account queries)
- `reconciliation_events` query helper: "show me new firing patterns since deploy" — the actual mechanism that replaces "tests pass" as evidence per §11.0.10
- CI enforcement per §12.5: PRs tagged with evidence tier (Strong+/Strong/Medium/Weak); CI rejects Strong+ and Strong tier PRs missing the three required artifacts (replay-test PASS, reconciliation telemetry zero-bug-firings, ground-truth spot-check) regardless of test status
- `[bypass-evidence-tier]` operator override mechanism with audit-table logging for quarterly review

**3. Replay framework** with capture scope per §11.0:

- Broker state stream: positions, orders, fills, borrow status, account state (Alpaca `/v2/positions`, `/v2/orders`, `/v2/account`, `/v2/assets/{symbol}`)
- Signal-source quote stream (Polygon Stocks Advanced)
- Reconciliation-source quote stream (Tradier or Yahoo Finance)
- Broker-source quote stream (Alpaca `/v2/stocks/{symbol}/quotes/latest`)
- Halt feed (Polygon real-time with exchange feed)
- Locate feed (Alpaca locate API responses)
- Corporate actions feed (Polygon Corporate Actions API)
- Combiner I/O capture: at every ranking event, the full set of `(symbol, signal_id, value, is_present, timestamp)` tuples fed to the combiner AND the produced ranking with rank, score, SHAP attribution per name
- Deterministic replay engine: given captured day data, system can re-run the day end-to-end producing identical outputs (where signal-dependent randomness exists, captured with seeds)

**Supporting deliverables:**

- Alpaca paper account integration (real broker connection for reconciliation against real Alpaca paper state, not mocked)
- Captured Day 1: one complete RTH day of all the above feeds stored in replay storage
- `.cursorrules` evidence-hierarchy file with explicit examples of Strong+/Strong/Medium/Weak evidence — tested by processing one trivial Strong-tier change end-to-end through the evidence hierarchy
- ADR-001-reconciliation-architecture.md authored in `docs/decisions/` with full architectural rationale and source attribution
- `docs/decisions/spec-source-index.md` authored with attribution of every major architectural decision to its source
- **Alpaca multi-pending-order behavior validation (per §8.6.1.1 short-stop parallel-order mechanism requirement):** Phase 0B captures sample multi-pending close-side orders on the same symbol against Alpaca's actual paper trading API. Validates whether Alpaca cleanly supports the parallel-order mechanism for short-stop Phase 1 timeout handling per Part 2c §8.6.1.1. If unclean, v0 fallback (operator page + continued aggressive escalation per §8.6.2) determined operational for v1. Determination documented and committed before Phase 0B exits.

**Phase 0B exit gate (CRITICAL — specified inline per §11.0.11; outcome classification per R3-R1):**

**Every firing produced during Phase 0B captured-day analysis is root-caused** to one of:

(a) **A documented false positive** with tolerance band tuned and an ADR per §11.0.9 explaining the new tolerance with rationale (the legitimate divergence pattern observed, why the new tolerance is appropriate, what real divergence the new tolerance might miss, quarterly review commitment);

(b) **A real-world divergence** handled per the per-call failure-action table per §11.0.8 (the specific action defined inline at the call site, not generic "refuse to operate");

(c) **A system bug** that has been fixed before phase exit, with the fix itself going through evidence-tier discipline per §12.5.

**Unresolved or unexplained firings block phase exit.**

**Outcome classification (per Response 3 R1, applies symmetrically to Phase 0B exit gate, Phase 7 Gate 2, Phase 8 Gate 2 post-calibration):**

Firings count against the quietness gate (block phase exit) when ANY of:

- `outcome = system_bug` (unresolved)
- `outcome = failure_handled` but required operator intervention beyond standard runbook procedures
- `outcome = failure_escalated` unresolved or unable to be documented as real-world divergence

Firings do NOT count against the quietness gate when:

- `outcome = false_positive_within_tolerance`
- `outcome = expected_divergence_handled`
- `outcome = failure_handled` and handled per the per-call failure-action table without operator intervention
- `outcome = failure_escalated` and resolved to documented real-world divergence

**Qualifier on "operator intervention":** runbook-driven action (manual cache refresh after a documented broker outage, executing a documented recovery procedure) is expected operational discipline and does not count. Operator-bespoke intervention (custom debug queries to figure out what went wrong, ad-hoc investigation beyond runbook scope) signals a bug and counts.

**Rationale for this gate** (per §11.0.11): a literal zero-firings gate creates pressure to widen tolerances until the gate passes, which defeats the engine's purpose. The empirical question is not "does the engine ever fire" — it should fire on Day 1; that's evidence it's working — but "is every firing understood and either accepted as a real-world divergence or fixed as a defect." Anything else means the engine produces signals the team doesn't understand, which is structurally indistinguishable from no engine at all.

**Realistic time impact (per V1):** Phase 0B baseline is 6-10 weeks, 7-10 weeks realistic, may extend to 11-12 weeks if Day 1 has many legitimate edge cases requiring tolerance tuning ADRs or Alpaca integration surprises. This extension is the right work to do at the right time. Phase 1 cannot begin until the reconciliation layer is operationally trustworthy. Duration is planning, not commitment — exit gate per §11.0.11 binds, calendar does not.

**Validation requirement for the evidence-workflow tooling:**

Before Phase 0B exits, the Strong-evidence workflow must be validated empirically: a trivial Strong-tier change (e.g., a minor MTM adjustment to a non-financial-correctness aspect, treated as Strong-tier for validation purposes) is processed end-to-end through the tooling. Target: <15 minutes wall-clock time from code change to all three evidence artifacts produced. If the tooling exceeds 15 minutes for a trivial change, it will exceed acceptable thresholds for non-trivial changes during Phase 2+, and discipline will degrade. Tooling investment continues until the <15-minute target is met.

**Kill condition:** None. Phase 0B is foundation. However, if reconciliation engine fundamentally cannot be made operational against Alpaca paper (e.g., Alpaca's locate API behavior is structurally inconsistent), Phase 0B revisits its dependency choices (different broker, different reconciliation source). This is an extension scenario, not a kill scenario.

**Duration estimate (V1):** 6-10 weeks baseline; 7-10 weeks realistic; may extend to 11-12 weeks.

---

## §10.5 Phase 1 — Universe ingestion and management *(REVISED v0.9 — reconciliation integration)*

**Goal:** Build and validate the universe component as a complete operational deliverable behind the reconciliation engine.

**Deliverables:**

1. Constituent ingestion (S&P 500 + S&P 400) from primary source per §3.1. **Backup source operational with cross-check running every refresh per §11.0.5 ingestion-time reconciliation requirement (per A4 — operational, not just documented); cross-check emits `reconciliation_events` rows.**
2. Universe filter implementation per §3.2.
3. Hard exclusion infrastructure per §3.3 (earnings windows, M&A, halts, HTB, short interest with their continuous refresh per §3.4).
4. Quarterly atomic refresh job (first trading day Jan/Apr/Jul/Oct per §3.4).
5. Continuous hard-exclusion refresh.
6. Schema: `universe_membership`, `hard_exclusions` — both keyed by `(operator_id, ticker, as_of_date)` per multi-instance optionality.
7. **Integration with `verify_universe_membership` (§11.0.7 #10):** the universe component is built to be the source of truth that `verify_universe_membership` queries. The verify_* interface's stub implementation in Phase 0B becomes the real implementation during Phase 1.
8. **Cross-check infrastructure per §11.0.5 operational (per A4):** Polygon reference data vs secondary source (S&P direct or iShares ETF holdings) for quarterly refresh accuracy. Cross-check runs every refresh, not just documented. Divergence → `reconciliation_events` row with `outcome = failure_handled` or `failure_escalated`.
9. Health monitoring per §11.3 (universe size, filter rates, hard exclusion counts).
10. Component documentation per §12.4.
11. Testing per §11.4 including replay-test integration: universe ingestion replayable against captured constituent data.
12. Runbooks for known failure modes.

**Exit gates to Phase 2:**

- Universe produced reliably for current date; manual sanity review passes
- Hard exclusions correctly identify known recent events (synthetic and real)
- Quarterly refresh executed successfully at least once in test mode
- All §12.4 documentation and §11.4 test coverage met
- Component can be disabled via configuration flag without breaking infrastructure
- Component dashboards populated and reviewable
- **`verify_universe_membership` operates against universe ingestion output without firing `system_bug` events during sub-phase validation.** Firings of `failure_handled` outcome are acceptable (real divergences caught and handled); firings of `system_bug` outcome block Phase 1 exit.
- **Ingestion-time cross-check operational (per A4):** cross-check has run on at least one production refresh; emitted `reconciliation_events` rows are root-caused per §11.0.11.
- Phase 1 evidence-tier discipline operational: at least one Strong-tier change to universe component has gone through the full evidence workflow with <15-minute artifact generation.

**Kill condition:** Universe component cannot be built reliably (e.g., no reliable constituent source, or reconciliation cross-check fires `system_bug` events that cannot be root-caused). Without a universe, there's no Crosswind.

**Duration estimate:** 2-4 weeks.

---

## §10.6 Phase 2 — Signal stack *(REVISED v0.9 — missingness profile capture per sub-phase)*

**Goal:** Build and validate each of the 9 signals as independent operational components, capturing missingness profile data for Phase 3 combiner training.

**Sub-phase sequence (each is itself a major deliverable):**

- **Phase 2.1:** Signal #6 — Cross-sectional momentum (12-1). First signal; establishes pipeline pattern. Includes shared within-sector GICS z-score normalization infrastructure. **Critical signal per §4.3.5.**
- **Phase 2.2:** Signal #7 — Short-term reversal. Reuses momentum infrastructure; validates pattern reuse. **Critical signal per §4.3.5.**
- **Phase 2.3:** Signal #5 — Short interest changes. Adds twice-monthly cadence pattern.
- **Phase 2.4:** Signal #4 — Insider transactions. Adds 30-min polling, SEC EDGAR/Polygon insider source with ingestion-time reconciliation per §11.0.5.
- **Phase 2.5:** Signal #1 — Analyst revision drift. Adds 15-min polling + pre-market poll pattern.
- **Phase 2.6:** Signal #2 — PEAD. Adds event-triggered + refresh pattern.
- **Phase 2.7:** Signal #3 — Options flow imbalance. Adds 5-min polling; highest data volume; tests compute budget.
- **Phase 2.8:** Signal #8 — News sentiment momentum. Adds news ingestion + sentiment classification.
- **Phase 2.9:** Signal #9 — Active catalyst flag. Adds catalyst event detection and tiering.

**Sub-phase ordering rationale (per A3):**

- **Critical signals (#6, #7) first** because they (a) establish the template reused for 2.3-2.9, (b) are sufficient for partial Phase 3 combiner validation even if some non-critical signals fail to build.
- **Non-critical ordering (2.3 → 2.9)** reflects roughly increasing implementation complexity and source-data integration overhead.

**Phase 2.1 template-establishment meta-deliverable (per A2):**

The first signal sub-phase establishes the pattern reused by 2.2-2.9. The template includes:

- Signal computation module
- z-score normalization wrapper
- `Optional[Decimal]` missing-data handling
- Ingestion-time reconciliation hook (where applicable)
- Missingness profile capture hook
- Replay framework integration
- Component documentation pattern
- Runbook structure

The template is reviewed and locked at Phase 2.1 exit before Phase 2.2 begins. This prevents ad-hoc template work distributed across sub-phases.

**Per-sub-phase deliverables (in addition to v0.8 baseline):**

1. **Signal pipeline implementation** with `Optional[Decimal]` return type per §4.3.5 (banned-pattern enforcement via §11.8 linting).
2. **Ingestion-time reconciliation** per §11.0.5 where applicable (price data vs backup, Form 4 vs EDGAR, short interest vs FINRA, earnings calendar vs alternate).
3. **Observed missingness rate capture:** during sub-phase operation, record per-symbol per-tick missing-vs-present state for this signal. Aggregate into the missingness profile document at sub-phase exit. The profile records per-signal baseline missingness rate, per-signal missingness conditional on sector, per-signal missingness conditional on time-of-day or time-since-event. **Profile feeds Phase 3 training-data generation per §6.5.3.**
4. **Replay framework integration:** the signal pipeline reads from captured RTH data for replay; signal values produced during replay are deterministic given replay inputs.
5. **Component documentation per §12.4** with cross-references to §4.4.x signal specification.
6. **Runbooks for known failure modes** including missing-data handling.

**Per-sub-phase exit gates:**

- Signal computes correctly for known recent observations (manual verification against synthetic and real cases)
- Distribution of z-scores: mean near 0, std near 1, clipping rare
- Computation completes within cadence budget
- Health monitoring reports correctly
- Failure modes tested including missing-data path (`Optional[Decimal]` type discipline preserved end-to-end)
- For critical signals (#6, #7): missing-signal path correctly excludes name from ranking per §4.3.5
- For non-critical signals (others): missing-signal path correctly emits `(value=sentinel, is_present=0)` feature pair per §6.5.2 with the locked sentinel `Decimal('-999')`
- Component can be disabled via configuration without breaking other signals
- **Missingness profile captured for the sub-phase's signal:** baseline rate, sector conditional, time conditional. Profile committed to `docs/missingness_profile.md`.
- Phase 2.x evidence-tier discipline operational

**Phase 2.1 specific additional exit gate:** template reviewed and locked at Phase 2.1 exit (per A2) — all template components (8 elements listed above) operational and documented. Phase 2.2 cannot begin until template is locked.

**Per-sub-phase kill condition:** Signal can't be built reliably or output is uninformative. **If 3+ signals fail across Phase 2 sub-phases, that's a higher-level kill signal — the signal stack may be weaker than spec assumes.** Phase 2 overall kill triggers re-evaluation of strategy viability.

**Duration estimate:** 8-14 weeks total across 9 sub-phases.

---

## §10.7 Phase 3 — Combiner and modeling *(REVISED v0.9 — missingness stress test exit gate)*

**Goal:** Build the LightGBM lambdarank combiner per §6 with the 16-feature representation per §6.5 (2 critical-signal z-scores + 7 non-critical-signal `(value, is_present)` feature pairs).

**Deliverables:**

1. **Training data assembly with missingness profile replication per §6.5.3 (with explicit cross-references per A5):** training data generation pipeline applies the Phase 2 aggregated missingness profile (random masking at observed per-signal per-sector per-regime rates per §6.5.3.2 masking rate specification) so the combiner is trained on representative `(value, is_present=False)` combinations. Profile refresh per §6.5.3.3 cadence (monthly during Phase 7, or drift-triggered). Profile changes require ADR per §12.6.
2. **Two-model training pipeline:** long-side and short-side LightGBM models with lambdarank objective per §6.2.
3. **16-feature feature engineering pipeline per §6.5.2:** the sentinel value `Decimal('-999')` is introduced at exactly one place (the feature-vector construction layer per §6.5.6); any other code path producing `-999` in a signal-value context is a defect caught by linting per §11.8.
4. **Walk-forward validation infrastructure per §6.3:** rolling-window train/validate/out-of-sample cycle.
5. **SHAP attribution infrastructure:**
   - Per-feature raw SHAP values preserved in storage
   - Per-signal aggregated SHAP values per §6.5.5: `attribution_to_signal_i = shap(value_i) + shap(is_present_i)` for non-critical signals; `attribution_to_signal_i = shap(value_i)` for critical signals
   - Operator dashboards display per-signal aggregate by default; diagnostic views access per-feature raw values
6. **Inline inference within polling loop per §6.4** with latency budget <5 seconds per polling tick.
7. **Model versioning per §6.4** (versioned files in S3/Modal volume, retain last 12 weeks, manual rollback override).
8. **Failure fallback per §6.4 corrected language:** count-normalized average over present signals:
   ```
   fallback_score(name) = 
       Σ(z_i × is_present_i) over all signals i
       ─────────────────────────────────────────
       max(1, Σ(is_present_i) over all signals i)
   ```
   Missing signals excluded from both numerator and denominator. This preserves the missing-vs-weak distinction even in degraded fallback path.
9. **Quarterly Optuna hyperparameter search infrastructure per §6.4** (50 trials, walk-forward CV).
10. **Weekly automatic retrain pipeline per §6.3** (Sunday night).

**Exit gates to Phase 4 — including quantitative missingness stress test per §6.5.4:**

**Baseline performance gates:**

- Combiner produces rankings meaningfully different from equal-weight (NDCG@25 substantially above random baseline)
- Walk-forward Sharpe positive on validation data
- SHAP attribution traceable per ranking event (per-feature and per-signal aggregated views both operational)
- Model versioning and rollback tested
- Failure fallback tested (count-normalized average per #8 above produces sensible rankings when LightGBM model fails to load)

**Missingness stress test gates (per §6.5.4):**

The combiner must demonstrate graceful degradation under elevated missingness conditions. Three stress levels, each with quantitative pass criteria:

| Stress level | Masking applied | Expected behavior |
|---|---|---|
| **50% non-critical masking** | 50% of non-critical signals randomly masked on validation data | Ranking Sharpe declines but remains positive. SHAP attributions shift partially toward critical signals (#6, #7) and the surviving non-critical signals. Ranking does not produce extreme outliers. |
| **75% non-critical masking** *(per V2)* | 75% of non-critical signals randomly masked | Sharpe approaches §6.4 failure-fallback baseline within reasonable tolerance — specific tolerance band (e.g., trained-model Sharpe within 0.2 of failure-fallback Sharpe on validation data) calibrated during Phase 3, not hardcoded here. Stress test passes if BOTH (a) Sharpe within tolerance of failure-fallback AND (b) no extreme outliers in ranking output (no z-score-implied rankings swinging wildly between unmasked and masked variants of same name). The second criterion catches "right-on-average but wildly variable" outputs that are operationally unusable. |
| **90% non-critical masking** | 90% of non-critical signals randomly masked | Imputation threshold per §4.3.5 (>4 of 7 non-critical missing → exclude name from ranking) correctly excludes most names. Remaining ranked names rely primarily on critical signals. The system continues to operate (produces a ranking; doesn't crash) but with greatly reduced cross-sectional dispersion. |

**Phase 3 exits only when all three stress levels show graceful degradation without catastrophic failure or extreme outliers.** Stress test results are documented in `docs/phase_3_missingness_stress_test.md` and included as Strong-tier evidence per §12.5.

**Evidence-tier discipline (per A6 tightened framing):**

Phase 3 represents the first phase where Strong+ tier evidence is operationally required for changes (combiner outputs drive position state mutations with tax implications via §7.7/§7.8). Evidence-workflow tooling was established Phase 0B; Phase 3 is the first phase where the Strong+ tier requirement binds business-logic changes. Phase 3 exit gates require demonstrated Strong+ evidence workflow for at least one combiner change (e.g., the initial training itself, or a hyperparameter tuning round).

**Kill condition:** Combiner doesn't learn (Sharpe ≤ 0 on walk-forward) **or stress test failure at 50% masking** (catastrophic degradation under realistic missingness conditions indicates the combiner cannot operate in production where 20-40% baseline missingness is expected). Strategy doesn't work at the modeling level.

**Duration estimate:** 4-6 weeks.

---

## Pass B redline subset — Phases 0A, 0B, 1, 2, 3 against v0.8

### Sections substantially revised

**§10.0 (new) — Section overview.** v0.8 had implicit overview embedded in §10.1; v0.9 makes the v0.9-specific structural changes explicit upfront (Phase 0 split, missingness capture, stress test, wash sale validation, two-phase state machine validation, reconciliation quietness gate, live-broker verification, sustained-anomaly kill).

**§10.1 Phase structure overview table — modified.**

- v0.8: 10 phases (Phase 0 through Phase 9), Phase 0 = single foundation phase at 2-4 weeks
- v0.9: 11 phases (Phase 0A, 0B, 1-9), Phase 0 split into 0A (2-4 weeks foundation) + 0B (6-10 weeks baseline / 7-10 realistic / may extend to 11-12 per V1; reconciliation/replay/tooling)
- v0.8 total pre-paper-trading: 24-41 weeks
- v0.9 total pre-paper-trading: 32-53 weeks (per V1 Phase 0B revision; pre-paper-trading +8-12 weeks for Phase 0B)
- v0.8 total to scaled deployment: 12-22 months
- v0.9 at planning numbers: **14-25 months (+2-3 months net per C1 timeline math propagation correction)**
- v0.9 at V1 contingency extension: **up to 16-27 months (+4-5 months additional if Phase 0B extends to 11-12 weeks)**

**§10.2 Timeline framing — substantially revised.**

- v0.8: AI acceleration as unqualified velocity gain
- v0.9: AI acceleration requires evidence discipline + reconciliation infrastructure to translate into validated velocity; without them, accelerates defect production at same rate. Phase 0B tooling investment is the velocity-enabling mechanism.

**§10.3 Phase 0A — new section.** Restructures v0.8 §10.3 Phase 0 (which had 10 deliverables) to be the foundation portion only. Deliverables 1-10 from v0.8 retained substantially. **New addition:** multi-instance schema discipline (all Crosswind-specific tables keyed by `(operator_id, ...)` per §9.7 optionality). **Exit gate addition:** multi-instance schema convention verified.

**§10.4 Phase 0B — entirely new section.** No v0.8 counterpart. Three priority deliverables (reconciliation engine + 17 verify_* interfaces with A1 sustained-anomaly baseline aggregation infrastructure, evidence-workflow tooling, replay framework) plus supporting deliverables (Alpaca paper integration, captured Day 1, .cursorrules, ADR-001, spec-source-index, **§8.6.1.1 Alpaca multi-pending-order validation per Part 2c forward-tracking item**). Critical exit gate per §11.0.11 specified inline (not just cross-referenced) to prevent handwaving; outcome classification per Response 3 R1 applied symmetrically. Evidence-workflow tooling has a quantitative validation requirement (<15-minute wall-clock for trivial Strong-tier change). Duration per V1: 6-10 baseline / 7-10 realistic / may extend to 11-12 weeks.

**§10.5 Phase 1 — Universe ingestion — substantially revised.**

- v0.8: 10 deliverables, focus on universe correctness and refresh cadence
- v0.9: same 10 deliverables PLUS integration with `verify_universe_membership` (§11.0.7 #10), **ingestion-time reconciliation per §11.0.5 OPERATIONAL not just documented (per A4)**, replay framework integration
- **Exit gate addition:** `verify_universe_membership` operates against universe ingestion output without firing `system_bug` events; ingestion-time cross-check has run on at least one production refresh per A4. Phase 1 evidence-tier discipline operational.
- All `universe_membership` and `hard_exclusions` tables keyed by `(operator_id, ticker, as_of_date)` per multi-instance optionality.

**§10.6 Phase 2 — Signal stack — substantially revised.**

- v0.8: 9 sub-phases with per-signal pipeline build
- v0.9: same 9 sub-phases PLUS per-sub-phase missingness profile capture (feeds Phase 3 per §6.5.3), **Phase 2.1 template-establishment meta-deliverable (per A2) with 8-element template locked at Phase 2.1 exit**, **sub-phase ordering rationale stated explicitly (per A3 — critical signals first; non-critical by increasing complexity)**, `Optional[Decimal]` type discipline enforcement per §4.3.5, ingestion-time reconciliation per §11.0.5, locked sentinel `Decimal('-999')` for non-critical signal missing values per §6.5.2
- **Exit gate additions per sub-phase:** missing-data path correctly handled, missingness profile committed to `docs/missingness_profile.md`, evidence-tier discipline operational. **Phase 2.1 specific:** template locked before Phase 2.2 begins.

**§10.7 Phase 3 — substantially revised.**

- v0.8: 5 deliverables (training data, two-model pipeline, walk-forward, SHAP, inline inference, model versioning, failure fallback, Optuna, weekly retrain — 9 items in v0.8 phrasing, more compact)
- v0.9: 10 deliverables incorporating missingness profile replication (per §6.5.3 with **A5 explicit cross-references to §6.5.3.2 masking rate and §6.5.3.3 refresh cadence**), 16-feature engineering with locked sentinel (per §6.5.2), corrected failure-fallback count-normalized-average (per §6.4 redline), per-signal SHAP aggregation (per §6.5.5)
- **Exit gate addition:** quantitative missingness stress test per §6.5.4 with three masking levels and explicit pass criteria. **75% row updated per V2: tolerance-band-within-reasonable-bounds + second criterion (no extreme outliers).** Stress test failure at 50% masking is a kill condition.
- **Evidence-tier discipline addition (per A6 tightened framing):** Phase 3 represents first phase where Strong+ tier requirement binds business-logic changes; evidence-workflow tooling was established Phase 0B.

### Cross-references requiring update in v0.8

**§9.7 (Multi-user / multi-instance deployment considerations):** v0.8 says "§13 (schema and infrastructure, pending) should design tables and operations to support per-operator isolation cleanly." v0.9 makes this concrete: Phase 0A and Phase 0B explicitly require `(operator_id, ...)` keying for all Crosswind-specific tables created in those phases. §9.7 v0.8 language remains accurate but the implementation discipline now lives in §10.3 / §10.4.

**§11.0.13 (Phase 0B priorities under §11.0):** §10.4 Phase 0B deliverables enumerate the three priority items per §11.0.13. Both sections must align; the §10.4 enumeration is the operational specification, §11.0.13 is the architectural rationale.

**§11.0.11 (Phase 0B exit gate):** §10.4 specifies the exit gate inline; §11.0.11 is the architectural rationale. Both sources must align. R3 R1 outcome classification applies symmetrically to §10.4 exit gate, §10.11 Phase 7 Gate 2, §10.12 Phase 8 Gate 2 post-calibration (latter two in Part 3b).

**§6.5.3 (Training data missingness replication):** §10.6 Phase 2 sub-phase deliverables now include missingness profile capture per §6.5.3. The profile location (`docs/missingness_profile.md`) is specified in §10.6; §6.5.3 references that path for completeness. §10.7 references §6.5.3.2 (masking rate specification) and §6.5.3.3 (refresh cadence) per A5.

**§3.4 (Refresh cadence):** §10.5 Phase 1 implements the cadences specified in §3.4. No §3.4 change needed; §10.5 is the build-side counterpart.

**§8.6.1.1 (short-stop parallel-order mechanism — Part 2c):** §10.4 Phase 0B supporting deliverables include Alpaca multi-pending-order behavior validation per §8.6.1.1 requirement. Part 2c forward-tracking item 7 resolved by this Part 3a inclusion.

---

<!-- =================================================================== -->
<!-- Part 3b: §10.8-§10.16 Live-operation phases + meta-discipline        -->
<!-- =================================================================== -->

## §10.8 Phase 4 — Portfolio construction + wash sale infrastructure *(REVISED v0.9 — wash sale infrastructure validation)*

**Goal:** Build all portfolio construction logic per §7, with wash sale tracking infrastructure operating against the reconciliation engine from inception.

**Deliverables:**

1. **Sector cap enforcement** per §7.1: 33% per-sector cap per side with within-sector universe-rank cap-binding logic. Displaced-holding exit mechanism integrated with §1.4 conditional re-entry block.

2. **Position sizing** per §1.5: 2.5% of current invested capital at entry. Rule 1 continuous sizing in both directions. No drawdown-triggered trim.

3. **Per-name concentration cap** per §7.2: 8% of book value maximum. Concentration-driven trim mechanism.

4. **15% short stop** per §7.3 evaluated each polling tick using current price vs. entry price. No long stop. No explicit take-profit.

5. **Conditional 31-day re-entry block** per §1.4 (revised v0.7): re-entry block applies only to losing exits; profitable exits eligible for immediate re-entry.

6. **Lot-level cost basis tracking with FIFO policy** per §7.4: lot records track entry timestamp, quantity, cost basis, side, status, locate_id. FIFO lot-selection at every trim and exit. Lot table keyed by `(operator_id, lot_id)` per §9.7 multi-instance optionality. **lot_id is a UUID globally unique** per Part 2b §7.4 V1 lock, with tiebreaker `(entry_ts ASC, lot_id ASC)` for replay-test PASS determinism per §11.10.4.

7. **Wash sale event tracking infrastructure** per §7.7 and §7.8:
   - `wash_sale_events` table keyed by `(operator_id, event_id)`. Schema includes status enum distinguishing block-active (full-exit Path A) from disallowed-loss-attached (trim path / retroactive)
   - Path A handling: write `wash_sale_events`, verify via `verify_wash_sale_record` (§11.0.7 #16), add to `re_entry_blocked` set
   - Path B handling: do NOT write `wash_sale_events`, add to `re_entry_blocked_pending_review`, operator alert (Strong+ tier)
   - Retroactive cost-basis adjustment per §7.8: lot ledger query for still-held shares from 30-day-window buys (before OR after sale per Part 2b R1 broader detection); FIFO-earliest still-held lot receives adjustment
   - Trim-loss handling per §7.9 step 2 (per Part 2b R2): writes `wash_sale_events` AND triggers §7.8 retroactive adjustment on remaining shares; does NOT add to `re_entry_blocked` (re-entry semantics don't apply to trims); Path B for trim → `trim_wash_sale_pending_review`

8. **Dollar-balance rebalancing** per §1.6: end-of-session 90-110% band check; trim-only proportional rebalancing on over-exposed side.

9. **Rebalance aggregate verification** per §7.10: after all rebalance trims produce post-fill `verify_position` confirmations, `verify_rebalance_aggregate` (§11.0.7 #17) re-computes long/short gross ratio from broker positions. 5-minute maximum defer window for unresolved trims; `rebalance_partial_completion` flag on unresolved trims.

10. **Held-position critical-signal-missing escalation** per §7.11: per-tick counter for cumulative missing-critical-signal hours. >24h threshold emits `held_position_critical_signal_stale` event (Strong tier) and pages operator.

11. **Reconciliation sequences operational** for all 8 mutation types per §7.4: entry, rank-exit, stop-exit, rebalance-trim, concentration-trim, lot accounting mutation, wash sale event recording, retroactive cost-basis adjustment.

12. **Component documentation per §12.4** including the per-call failure-action table from §7.12.

13. **Runbooks for known failure modes** including wash-sale Path B operator review procedure.

**Exit gates to Phase 5:**

- All portfolio construction rules produce correct book composition on synthetic edge cases (cap-binding scenarios, concentration trim, stop trigger, rebalance trim)
- **Wash sale tracking validated end-to-end** with simulated profitable/losing cycles:
  - Path A scenario (full exit at loss, `verify_realized_pnl` PASS): `wash_sale_events` row written, `verify_wash_sale_record` passes, symbol added to `re_entry_blocked`, block_until correctly computed (exit_date + 31 calendar days)
  - Path B scenario (full exit at loss, `verify_realized_pnl` FAIL): no `wash_sale_events` row written, symbol added to `re_entry_blocked_pending_review`, operator alert fires
  - Trim-loss scenario per §7.9: `wash_sale_events` written, §7.8 retroactive adjustment applied to remaining FIFO-earliest lot, symbol NOT added to `re_entry_blocked`; Path B for trim → `trim_wash_sale_pending_review`
  - Retroactive scenario per §7.8: profitable exit, re-entry, losing exit within 30 days — disallowed loss attaches to FIFO-earliest still-held lot from window, cost basis adjustment verified via `verify_lot_record`
- **Lot accounting accurate across partial trims and full exits** with FIFO policy: reconciliation against Alpaca's default lot-tracking behavior produces zero divergence on synthetic test cases
- **`verify_lot_record` and `verify_wash_sale_record` operational** with Zero-tolerance class per §11.0.9; any divergence triggers immediate operator alert
- **`verify_rebalance_aggregate` operational** with 5-minute defer window and partial-completion handling tested
- Phase 4 evidence-tier discipline operational: at least one Strong+ tier change to wash sale or lot accounting infrastructure has gone through the full evidence workflow with <15-minute artifact generation
- Component documentation and runbooks complete

**Kill condition:** Wash sale tracking infrastructure cannot be made reliable (e.g., lot reconciliation against Alpaca produces systematic divergences that cannot be root-caused). The tax-reporting consequences of unreliable wash sale tracking are severe enough that proceeding without reliable tracking is unacceptable.

**Duration estimate:** 4-6 weeks (revised upward from v0.8's 3-5 weeks to reflect wash sale infrastructure complexity).

---

## §10.9 Phase 5 — Execution layer (paper) *(REVISED v0.9 — two-phase state machine validation)*

**Goal:** Build paper trading execution per §8 with the two-phase state machine, SSR routing, partial-fill discipline, and broker rejection propagation operational.

**Deliverables:**

1. **Alpaca paper trading integration** with full API surface used (orders, positions, account, assets, quotes, locate, corporate actions, market calendar).

2. **Marketable limit order logic** per §8.2: buy at `bid + 1¢` / sell at `ask − 1¢`, 5¢ buffer for $500+ stocks, TIF=DAY explicit (per Part 2c §8.2 v0.9 supplement).

3. **SSR-active short sale pricing** per §8.2: `max(default_sell_price, NBB + 1¢)` formula implemented per Part 2c §8.2 v0.9 supplement. Routing correctness validated against synthetic SSR-active scenarios — when SSR is active, no short orders submitted at or below NBB.

4. **Two-phase state machine** per Part 2c §8.6 (NEW STRUCTURE v0.9 supersedes Part 2 §8.6 v0.8 baseline):
   - Phase 1 (Acceptance): `verify_order_acceptance` tri-state with paths 1.A accepted, 1.B rejected, 1.C pending
   - Phase 2 (Fill): bounded escalation timer starts at Phase 1 → Phase 2 transition; v0.7-locked escalation thresholds (entry 30s→50bps→cancel; rank-exit 30s→100bps→200bps→exit_pending; short stop 30s→200bps→market) preserved exactly inside §8.6.2 Phase 2
   - Trade-type-specific Phase 1 timeouts per Part 2c §8.6.1.1: entry/rank-exit 10s+60s; short stop 5s+15s

5. **Short-stop parallel-order mechanism** per Part 2c §8.6.1.1 (with v0 fallback determination per Phase 0B):
   - Phase 0B validation (per Part 3a §10.4 supporting deliverable, forward-tracking item 7 resolution) determined whether Alpaca's multi-pending-order support is operationally clean for the parallel-order pattern
   - If clean: parallel market order via different order ID on short-stop Phase 1 timeout; over-close detection via post-fill `verify_position`; corrective trade if both fill
   - If unclean: v0 fallback (operator page + progressive limit escalation per polling tick)
   - Phase 5 implements whichever path Phase 0B determined operational

6. **Partial-fill discipline** per Part 2c §8.7 (NEW v0.9 supersedes Part 2 §8.7 v0.8 v2-deferred baseline): partial fills accepted as final position size; residual cancellation and escalated resubmission for unfilled quantity; new lot created for escalated-price fills.

7. **Modify-vs-cancel-and-replace** per Part 2c §8.8: modify preferred when Alpaca supports for the order-type modification; cancel-and-replace as fallback. Race-condition handling for cancel-and-replace failures.

8. **Broker rejection propagation** per Part 2c §8.9: full table operational for `halted`, `htb`, `ssr_violation`, `insufficient_buying_power`, `pdt_block`, and `other` rejection reasons. Cache updates emit `reconciliation_events` per §11.0.4. Outcome classification (`failure_handled` vs `system_bug`) per §8.9 logic — including the race-condition refinement for `ssr_violation` (single occurrence within X minutes of `verify_ssr_status = not_active` is `failure_handled`; repeated or post-known-active is `system_bug`).

9. **Trade-type-aware retry rules** per Part 2c §8.6.1 Path 1.B (R1 trade-type-aware retry): order ID terminal but trade intent persistent for rank-exits and stop-exits. Operator-alert-and-pause overrides per rejection-reason table.

10. **Market hours boundary enforcement** per Part 2c §8.3: no new submissions in last 15 minutes before close, first 5 minutes after open. Short stop exits exempt.

11. **LULD pause handling** via `verify_halt_status` per Part 2c §8.10 — no separate LULD pipeline.

12. **Failure-action table operational** per Part 2c §8.11.

13. **Component documentation, testing, runbooks** per §12.4 and §11.4.

**Exit gates to Phase 6:**

- **Two-phase state machine validated** in all paths: Phase 1 accepted/rejected/pending transitions, Phase 2 fill/partial-fill/escalation/cancel, trade-type-specific timeouts behave correctly
- **SSR routing tested with synthetic SSR-active scenarios**: NBB+1¢ floor binds correctly when spread is tight; default pricing satisfies SSR when spread is normal; zero `ssr_violation` broker rejections during synthetic SSR-active test scenarios
- **Broker rejection propagation exercised** for each rejection reason: cache updates land correctly in §7's halt/HTB/SSR/buying-power/PDT caches; reconciliation_events row emitted per rejection
- **Partial-fill discipline validated**: partial fills become normal positions; residual escalation produces new lot records; lot accounting reflects multi-lot position correctly
- **Short-stop parallel-order mechanism validated** (or v0 fallback validated per Phase 0B determination): over-close detection and corrective trade tested with synthetic broker behavior
- **Modify-vs-cancel-and-replace tested**: modify path used when Alpaca supports; cancel-and-replace fallback tested with race-condition handling
- Reliable paper order placement across all 8 mutation types from §7.4
- Phase 5 evidence-tier discipline operational

**Kill condition:** Two-phase state machine cannot be made reliable (e.g., Alpaca paper API behavior is fundamentally inconsistent with the model). Acceptance vs fill conflation in implementation would propagate phantom failures throughout execution.

**Duration estimate:** 3-4 weeks (revised slightly upward from v0.8's 2-3 weeks to reflect two-phase state machine and parallel-order mechanism complexity).

---

## §10.10 Phase 6 — Full system integration *(REVISED v0.9 — reconciliation operational across boundaries)*

**Goal:** Wire all components together; validate end-to-end operation against captured RTH data with reconciliation engine running.

**Deliverables:**

1. **End-to-end integration** of universe (§10.5) → signal stack (§10.6) → combiner (§10.7) → portfolio construction (§10.8) → execution (§10.9), with reconciliation engine operating at every boundary.

2. **Replay framework integration** with full end-to-end replay capability: captured RTH day data replays through the entire pipeline producing deterministic outputs.

3. **Ranking-state freshness reconciliation** per §11.0.6 operational at the combiner → portfolio construction handoff: ranking freshness check, universe currency re-check, hard-exclusion currency re-check.

4. **`reconciliation_events` baseline aggregation infrastructure operational** per §10.4 priority deliverable #1 (built in Phase 0B per A1 sustained-anomaly baseline aggregation infrastructure): daily/weekly/monthly views per call_name per outcome ready to populate during Phase 7.

5. **Operator dashboard fully populated** with component health metrics, reconciliation telemetry, model SHAP views (per-signal aggregated per §6.5.5), book composition, P&L tracking, kill-switch status.

6. **Cross-component invariant checks** per §11.2 Layer 3 operational: long+short ≤ 50 names, per-name size within range, no name in both books, gross exposure within configured range, sector cap adherence, concentration cap adherence.

7. **Documentation and runbooks** complete for end-to-end operational scenarios including drawdowns, reconciliation firings, broker rejection cascades, signal feed degradation.

**Exit gates to Phase 7:**

- **End-to-end system runs for at least 5 consecutive trading days** without significant incident, replaying against captured Day 1 + additional captured days
- **Each component shows healthy metrics** in operator dashboard
- **Daily operator review completed in < 30 minutes** demonstrating that the dashboard surface is operationally usable
- **Operator demonstrates ability** to interpret dashboards and respond to alerts
- **Reconciliation engine operational across all 17 verify_* interfaces** in integrated pipeline; all firings during integration testing root-caused per §11.0.11 discipline
- **Replay framework operational end-to-end**: a Strong+ tier change can be processed through the evidence workflow in <15 minutes wall-clock per §10.4 evidence-workflow tooling validation requirement
- Phase 6 evidence-tier discipline fully operational

**Kill condition:** Integration reveals systemic issues that cannot be resolved without architectural change (e.g., component interfaces don't compose cleanly, reconciliation engine produces uncontrollable firing rate in integrated operation). Phase 6 kill triggers re-evaluation of which earlier phase needs revisit.

**Duration estimate:** 3-5 weeks.

---

## §10.11 Phase 7 — Paper trading validation *(REVISED v0.9 — dual exit gate with R3-R1 outcome classification)*

**Goal:** Validate live operational mechanics with real-time data, real broker (paper account), real polling, real model retraining, real reconciliation engine firing against real conditions.

**Paper trading reference:** $100K (per §9.5).

**Deliverables:**

1. **Live paper trading operation** with real-time data flows, real Alpaca paper broker, real polling cadences, weekly model retraining per §6.3.

2. **`reconciliation_events` firing-rate baseline established** during Phase 7 for Phase 9 sustained-anomaly detection per §10.13. Baseline computed per call_name per outcome over rolling 90-day trailing window once 90 days of Phase 7 operation accumulated. Aggregation infrastructure was established in Phase 0B per §10.4 (A1 sustained-anomaly baseline aggregation infrastructure).

3. **Missingness profile refresh** per §6.5.3.3: monthly refresh (or drift-triggered) of the missingness profile based on Phase 7 observed rates. Profile changes feed weekly combiner retraining.

4. **Quarterly tasks executed at least once during Phase 7**: universe refresh (§3.4), ablation study (§4.1), hyperparameter optimization (§6.4).

5. **Daily operator review** per §11.7 conducted reliably with documented review log.

6. **Significant-failure recovery demonstrated**: at least one significant failure (component outage, signal feed degradation, broker connectivity issue, model retraining failure) observed and recovered without manual intervention beyond standard runbook procedures.

7. **Component documentation refresh** per §12.8 monthly review cadence applied throughout Phase 7.

**Exit gates to Phase 8 — dual gate, both must pass:**

**Gate 1 — Operational reliability:**

- ≥ 95% uptime on signal pipelines during market hours
- Live paper P&L tracks within ±25% of backtest expectations over validation window
- Realized slippage within 50% of §9.2 assumption
- Daily review per §11.7 conducted reliably
- At least one significant failure observed and recovered
- Actual fixed costs match §9.1 estimate within ±30%

**Gate 2 — Reconciliation quietness (per §11.0.11):**

**30 consecutive RTH days with all reconciliation firings either auto-handled per the failure-action tables without operator intervention OR explainable as real-world divergences, with zero unresolved system bugs.**

**Outcome classification (per R3-R1 symmetric application):** Firings counting against the quietness gate are limited to `outcome = system_bug` (unresolved), `outcome = failure_handled` requiring operator-bespoke intervention beyond standard runbook procedures, or `outcome = failure_escalated` unresolved. Firings classified as `false_positive_within_tolerance`, `expected_divergence_handled`, `failure_handled` via standard runbook, or `failure_escalated` resolving to documented real-world divergence do NOT count. Full enumeration of outcome categories and the operator-intervention qualifier (runbook-driven action expected; operator-bespoke debugging signals bug) are specified canonically in §10.4 Phase 0B exit gate; §10.11 applies the same specification symmetrically per Response 3 R1.

Both gates must pass. A system can be 99% uptime but with reconciliation firings revealing structural defects; that fails Phase 7. Reconciliation quietness is a primary exit criterion, not a side metric.

**Kill conditions:**

- Paper performance materially worse than backtest (>50% shortfall sustained over multiple months)
- Operational reliability < 80%
- Realized costs > 50% above estimate
- **Sustained reconciliation anomaly during Phase 7**: firing rate (excluding `expected_divergence_handled` and `false_positive_within_tolerance`) exceeds rolling baseline by >3× for 7+ consecutive RTH days indicates systemic drift; Phase 7 kill condition triggers re-evaluation of which earlier phase needs revisit

**Duration estimate:** 3-6 months minimum. The reconciliation quietness gate is empirically achieved; calendar time is required for the 30-day window plus any reset events.

---

## §10.12 Phase 8 — Small live operational validation *(REVISED v0.9 — calibration window + dual exit gate post-calibration with R3-R1 outcome classification)*

**Goal:** Validate the strategy works with real capital. Phase 8 is *operational validation*, not profitability.

**Capital deployed:** Operator-chosen small amount, with phased scaling within Phase 8 per the live-broker calibration window described below.

**Phase 8 first 1-2 weeks: live-broker calibration window:**

- During this window, operator may deploy minimum viable capital (operator judgment, typically smaller than the intended Phase 8 steady-state size — e.g., 25-50% of intended size). This caps the slippage exposure during a period when tolerance bands may still be calibrating against live-broker behavior.
- Re-validate every `verify_*` interface against live Alpaca broker. Paper-vs-live behavioral differences expected:
  - Locate API behavior may differ from paper (live locates have real availability constraints)
  - HTB rejection patterns may differ
  - Corporate action propagation timing may differ
  - Order acceptance latency profile differs
  - `ssr_violation` enforcement may be stricter in live (paper SSR enforcement is sometimes lenient)
- Firings during the calibration window are root-caused per §11.0.11 with tolerance ADRs per §11.0.9 as needed.
- After calibration window, capital may ramp to full operator-chosen Phase 8 size at operator discretion.
- **The 25-50% range is illustrative guidance, not spec mandate.** The spec mandates only that the calibration window exists and that the Gate 2 quietness measurement counts post-calibration RTH days, not amount. The phased capital scaling is operator judgment.

**Phase 8 deliverables:**

1. **Live capital deployment** at operator-chosen amount with calibration-window scaling.

2. **Live-broker reconciliation tolerance ADRs** as needed for paper-vs-live behavioral differences. Each ADR follows §11.0.9 discipline (legitimate divergence pattern, why new tolerance, what real divergence might be missed, quarterly review commitment).

3. **Wash sale tracking against real broker tax-reporting infrastructure**: conditional 31-day block operates correctly with live broker; lot-level P&L accurate; `verify_wash_sale_record` reconciles against Alpaca's evolving year-end tax-reporting state.

4. **Live performance tracking** against expected return distribution per §2.1.

5. **Operator psychology demonstration**: operator demonstrates ability to follow strategy through a drawdown without unauthorized intervention.

6. **Operational maturity**: at least one full quarter without significant operational incident; quarterly tasks (universe refresh, ablation study, hyperparameter optimization) successfully executed against live data.

**Exit gates to Phase 9 — dual gate, both must pass (post-calibration):**

**Gate 1 — Live operational validation:**

- Live execution quality: realized slippage on live trades within ±25% of paper-trading slippage
- Wash sale tracking accurate: conditional 31-day block operates correctly, lot-level P&L accurate, year-end tax reporting infrastructure functional
- Live performance tracking: within ±35% of expected after fixed-cost adjustment
- Operator psychology: demonstrated ability to follow system through drawdown
- Operational maturity: at least one full quarter without significant operational incident; quarterly tasks successfully executed

**Gate 2 — Live-calibrated reconciliation quietness:**

**30 consecutive RTH days POST-CALIBRATION with all reconciliation firings either auto-handled per failure-action tables or explained as real-world divergences, zero unresolved system bugs.**

- Calibration window firings are excluded from this 30-day count.
- All live-broker tolerance ADRs from calibration window are locked.
- Post-calibration tolerance changes require ADR per §11.0.9 asymmetric change discipline.

**Outcome classification (per R3-R1 symmetric application post-calibration):** Firings counting against the quietness gate are limited to `outcome = system_bug` (unresolved), `outcome = failure_handled` requiring operator-bespoke intervention beyond standard runbook procedures, or `outcome = failure_escalated` unresolved. Firings classified as `false_positive_within_tolerance`, `expected_divergence_handled`, `failure_handled` via standard runbook, or `failure_escalated` resolving to documented real-world divergence do NOT count. Full enumeration of outcome categories and the operator-intervention qualifier (runbook-driven action expected; operator-bespoke debugging signals bug) are specified canonically in §10.4 Phase 0B exit gate; §10.12 applies the same specification symmetrically per Response 3 R1.

**Asymmetric application point per R2:** Phase 8 Gate 2 measurement window is 30 RTH days POST-CALIBRATION (not from Phase 8 day 1), reflecting that the calibration window itself is structured tuning period; the rolling-steady-state measurement starts when calibration locks.

**Kill conditions:**

- Live results substantially worse than paper
- Operator inability to follow system during drawdown
- Wash sale or tax tracking errors that aren't fixable
- Sustained reconciliation anomaly post-calibration: firing rate >3× live-calibrated baseline for 7+ RTH days

**Duration estimate:** 3-6 months minimum (calibration window 1-2 weeks + steady-state 30+ RTH days minimum + operational maturity quarter).

---

## §10.13 Phase 9 — Scaled deployment (steady-state) *(REVISED v0.9 — sustained-anomaly kill condition + A1 baseline cross-reference to §10.4)*

**Goal:** Strategy operates at intended deployed capital with expected return profile realized over time.

**Phase 9 is not "done":**

- Quarterly review may identify signal degradation, regime shifts, or other adjustments needed
- v1.5 / v2 enhancements may be designed and tested in parallel (per §16 deferred items)
- Phase 9 has no exit gate — it's steady-state

**Phase 9-specific kill conditions (NEW in v0.9):**

The following kill conditions apply during Phase 9 steady-state operation. They supplement the inherited kill conditions documented in §11.6 (kill-switch architecture).

**Sustained reconciliation anomaly kill condition** (per §11.6 canonical specification — compact summary + cross-reference per Option C discipline): Phase 9 inherits the sustained-anomaly kill condition from §11.6 — if `reconciliation_events` firing rate (excluding `expected_divergence_handled` and `false_positive_within_tolerance` outcomes) exceeds the Phase 7/8-established baseline by **>3× for 7+ consecutive RTH days**, kill-switch escalation triggers Level 1 soft pause for operator investigation. See §11.6 for full specification including baseline reference and escalation discipline. A1 baseline aggregation infrastructure per §10.4 priority deliverable #1. *(v0.9 final-assembly action per Part 6 forward-tracking item 12 resolution: prior inline ~25-line full specification replaced with this compact summary + §11.6 cross-reference now that §11.6 is canonical per Part 4a.)*

**Inherited kill conditions (from §11.6):**

- Sustained drawdown beyond §11.6 thresholds triggers kill-switch escalation
- Multi-quarter performance materially below expectations indicates strategy has degraded
- Major regulatory or structural changes (broker discontinuation, data provider failure) may force phase regression or strategy revision

**Phase 9 ongoing operations:**

- **Quarterly ablation studies** per §4.1: signals whose removal doesn't hurt performance over trailing 6-12 months are candidates for retirement
- **Monthly missingness profile refresh** per §6.5.3.3
- **Weekly model retraining** per §6.3
- **Daily operator review** per §11.7
- **Continuous reconciliation engine operation** per §11.0
- **Annual tax-year reconciliation** of `wash_sale_events` against broker 1099-B / Form 8949 generation per §11.0.10 Strong+ retention discipline

**Duration:** Indefinite. Phase 9 is steady-state operation, not a transitional phase.

---

## §10.14 ROI levers and constraints (honest dual-sided framing) *(NEW v0.9 — separated from Phase 9 spec per R5 renumbering refinement)*

### §10.14.1 The v0.9 architecture cost

The v0.9 architecture costs real time and operational discipline:

- **Phase 0B addition: 6-10 weeks baseline / 7-10 realistic / may extend to 11-12 weeks per V1 contingency** before any business logic is built. No visible "business value" during Phase 0B — only infrastructure.
- **Ongoing tooling maintenance**: replay framework, reconciliation engine, evidence-workflow tooling all require ongoing investment as the system evolves.
- **Slower per-PR velocity** due to evidence-tier discipline: Strong+/Strong tier changes require three evidence artifacts (replay-test PASS, reconciliation telemetry zero-bug-firings, ground-truth spot-check) before CI accepts the change.
- **Operator discipline burden**: backstop role for ~5% ambiguous reconciliation cases, tolerance-tuning ADR approval, Strong+/Strong-tier change review.
- **Approximately +2-3 months net added to total timeline (per C1 timeline math propagation correction): 12-22 months → 14-25 months at planning numbers; may extend to 16-27 months if Phase 0B extends to 11-12 weeks per V1 contingency.** (Updated per Part 3a V1 Option B C1 timeline correction; canonical Response 2 §10.14.1 originally framed this as "+4-6 weeks net added (12-22 → 13-23 months)" which C1 supersedes.)

### §10.14.2 The v0.9 architecture benefit

The v0.9 architecture is the alternative to the failure mode that this design is built to prevent: systems that silently corrupt their own calibration data over months without detection.

- **Defect mean-time-to-detection: hours, not months**. Reconciliation engine surfaces drift immediately rather than after the strategy has been quietly making phantom decisions.
- **Calibration data integrity preserved**: model retraining doesn't compound on corrupted state.
- **AI loop has independent verification surface**: executor + supervisor share blind spots, but reconciliation_events + replay framework provide behavioral evidence that's separate from code review.
- **Operator verification sustainable**: operator catches ~5% of ambiguous cases instead of being the primary defense (which degrades under fatigue).
- **Phase transitions are gates, not handwaving**: the "every firing root-caused" exit criterion makes phase advancement honest rather than scheduled.

### §10.14.3 Honest framing of the trade-off

The v0.9 architecture is **not optional**. Without these changes, Crosswind would silently corrupt its own calibration within months. The investment is the alternative to "build fast and find out during live trading" — a path that the options-system experience documents as producing months of corrupted operation followed by extensive remediation.

The cost-benefit framing:

| Scenario | Phase 0B investment | Defect detection latency | Calibration integrity | Outcome |
|---|---|---|---|---|
| v0.9 architecture | 6-10 weeks Phase 0B + ongoing tooling | Hours to days | Preserved | Defects surface visibly; calibration data trustworthy; AI loop has independent verification |
| Without v0.9 architecture | 0 weeks (build business logic first) | Weeks to months (silent drift) | Corrupted | Defects compound invisibly; calibration data degrades; AI loop self-validates against derived signals |

The choice is not "fast vs slow." The choice is "visibly slow with trustworthy outputs" vs "invisibly broken with phantom outputs that look correct."

### §10.14.4 Levers that meaningfully increase ROI (deferred to v1.5 / v2)

The v0.7-locked ROI levers from v0.8 §10.13 are unchanged in scope; the only revision is that all levers operate behind the reconciliation engine in v0.9:

1. **Higher gross alpha through better signals**: v2 LLM-based news classification, regime-conditional combiner weights, additional signals (capped at ~12). Cumulative potential: +1-3% net annualized.
2. **Lower variable costs through better execution**: v2 per-signal-family timeout architecture (§8 v2 deferred per Part 2c forward-tracking item 5), smarter order sizing. Cumulative potential: +0.5-1.5% net annualized.
3. **Leverage**: 2× via portfolio margin doubles expected returns and doubles drawdowns. Largest single lever, also riskiest. Deferred to v2.
4. **Tax optimization through TTS / §475(f)**: eliminates wash sale tracking complexity; reduces effective tax rate. Cumulative potential: +5-10% relative improvement in after-tax return.
5. **Parallel uncorrelated strategies**: comparable expected return with low correlation to Crosswind. Best non-leveraged ROI lever once Crosswind reaches Phase 7+.

### §10.14.5 ROI constraints (cannot change without changing strategy identity)

- Capacity envelope (~$2-10M per instance estimated)
- Wash sale rule cost (without §475(f), 1-3% annualized)
- No leverage in v1
- Signal stack bounded by documented public-data literature

### §10.14.6 Realistic ROI ceiling at each milestone

Unchanged from v0.8 §10.13 per-year ROI ceiling values. The timeline shifts by +2-3 months per C1 correction but the per-year ROI ceilings remain:

- Year 1 (Phases 0A-7): 0% (no capital deployed during build/paper)
- Year 2 (Phases 8-9): 6-10% on deployed capital
- Year 3 (Phase 9 steady-state): 8-12% on deployed capital
- Year 4+ with v2 enhancements: 10-15% on deployed capital
- Year 5+ with v2 + parallel strategy: 12-18% blended
- Year 6+ with v2 + leverage (if pursued): 18-28% with proportional drawdown risk

---

## §10.15 Anti-patterns to avoid (expanded for v0.9) *(REVISED v0.9 — 8 new + 3 inherited)*

These actions look like ROI levers or efficiency gains but typically destroy more value than they create. The list is expanded from v0.8 to reflect v0.9 architectural commitments.

**v0.9 additions (8 new):**

- **Silent sentinel fallbacks** (banned per §11.8): `redis.get(key) or "0"`, hardcoded financial magic numbers, `.get(default=0)`, silent `None → 0` coercion. Type system enforces `Optional[Decimal]`; one violation breaks end-to-end discipline.
- **`datetime.now()` inside business logic** (banned per §11.9): time as injected parameter, never derived inside financial-math functions. Enables replay; prevents intraday-time-blind defects.
- **"Tests pass" as sufficient evidence for financial-correctness changes** (banned per §12.5): Strong+/Strong tier requires replay-test PASS + reconciliation telemetry zero-bug-firings + ground-truth spot-check. Unit tests pass alone is insufficient.
- **Loosening reconciliation tolerances ad-hoc without ADR** (per §11.0.9 asymmetric change discipline): tightening can occur ad-hoc; loosening requires ADR with four justifications.
- **Building business logic before reconciliation engine exists** (per Phase 0B priority order): every previous-system feature that bypassed reconciliation became a phantom in production. Phase 0B before Phase 1 is non-negotiable.
- **Patching same-defect-family bugs without auditing the broader class** (per options system lessons): when fixing defect X, audit the entire codebase for the same defect class. Ship fixes as scope, not spot-fixes.
- **Treating broker rejections as edge cases rather than authoritative reconciliation signals** (per §11.0.4): broker rejections ARE the ground-truth correction. Cache updates propagate; reconciliation events emit; investigation as `system_bug` when rejection reveals pre-submission gate defect.
- **Deferring evidence artifacts to "later"**: replay-test PASS, reconciliation telemetry, ground-truth spot-check are produced WITH the change, not after merge. "I'll backfill the evidence" produces a backlog that never resolves.

**Inherited from v0.8 (3):**

- **Cutting infrastructure quality to save costs**: saving $100/mo in infrastructure cannot offset a single undetected silent failure that costs 10-20% of annual returns.
- **Adding signals beyond ~12**: overfitting risk on the limited training window dominates. Signals 13-15 typically reduce out-of-sample performance.
- **Removing wash sale management to allow rapid re-entries**: the IRS rule applies whether tracked or not. Untracked wash sales create year-end tax surprises and disallowed losses that can't be reclaimed.

---

## §10.16 Phase plan principles *(REVISED v0.9 — 5 inherited + 3 new + R2 asymmetric quietness criteria + C1 timeline acknowledgment)*

**No phase is skipped.** Every system has bugs the operator doesn't anticipate. Each phase catches a different class of bugs.

**Exit gates are absolute, not aspirational.** Failing a gate means returning to the prior phase, not "trying harder."

**Kill conditions are equally absolute.** The spec preserves the right to kill the strategy at any point.

**Time spent in earlier phases protects later phases.** A weak earlier phase leads to wasted effort or lost capital in later phases.

**Reconciliation quietness is a primary exit criterion at every phase boundary** (per §11.0.11), not a side metric. A literal zero-firings criterion is wrong (creates pressure to widen tolerances); the right criterion is "every firing root-caused" with three resolution paths: documented false positive with ADR, real-world divergence handled per failure-action table, or system bug fixed before phase exit.

**The Phase 0B exit gate discipline propagates to Phase 7→8 and Phase 8→9 transitions.** Reconciliation quietness gates are calibrated against the relevant operational regime (paper for Phase 7, live for Phase 8 post-calibration) but the root-cause discipline is identical at every boundary.

**Asymmetric quietness criteria scale with operational regime (per R2 — NEW in v0.9):**

> *The reconciliation quietness criteria scale with the operational regime: Phase 0B exits on captured-day root-causing (single day, every firing accounted for), reflecting that Phase 0B is foundational empirical tuning. Phase 7 and Phase 8 exit on 30-RTH-day rolling steady-state, reflecting that those phases validate sustained operational behavior. The root-cause discipline is identical at every boundary; the time-window for measurement scales with the operational regime being validated.*

This asymmetry is intentional. Phase 0B's captured-day basis reflects finite captured-day data and a foundational empirical tuning regime where every firing in the captured day must be accounted for. Phase 7 and Phase 8 use 30-RTH-day continuous-measurement windows reflecting calendar-bound sustained operation.

**AI acceleration requires evidence discipline.** AI tools without §12.5 evidence-tier discipline and §11.0 reconciliation infrastructure accelerate defect production at the same rate they accelerate code production. Phase 0B tooling investment is what enables AI acceleration to translate into validated velocity.

**Operator discipline is sustainable when structurally supported.** §11.0.12.5 establishes that the operator role shifts from "primary defense" (~100% of state mutations verified) to "backstop for residual ambiguity" (~5% of ambiguous edge cases). Structural mechanisms make this shift real; without them, operator verification degrades under fatigue.

**Timeline acknowledgment (per C1 timeline math propagation correction, per Part 3a V1 Option B forward-tracking item 10):** Total elapsed time to scaled deployment is **14-25 months at planning numbers** per C1 timeline math propagation correction. This is honest. Operator commitment to this horizon is required before Phase 0A begins. **V1 contingency extension to 16-27 months acknowledged** — if Phase 0B extends to 11-12 weeks per V1 contingency, total may extend up to 4-5 months further. Quarterly self-assessment of project continuation viability is part of operational discipline. *(Canonical Response 2 §10.16 timeline acknowledgment originally framed this as 13-23 months; superseded by C1 per Part 3a V1 Option B resolution.)*

---

<!-- =================================================================== -->
<!-- Part 4a: §11 Quality, Observability, and Operational Discipline       -->
<!-- =================================================================== -->

## §11.0 — Reconciliation as foundational quality layer *(NEW v0.9)*

### §11.0.1 Why this section exists

This section codifies architectural lessons from the operational failures of a related options-trading system between April and May 2026. Specific failure modes are documented in HANDOFF notes and T-ACT records of that system. The lessons relevant to Crosswind:

- Systems that trust their own computed state without external verification silently drift from reality. Drift accumulates undetected for weeks or months. By the time defects surface, calibration data is corrupted and remediation requires invalidating extended history.
- Internal-consistency checks (validation that the system's outputs satisfy invariants the system itself defines) do not catch this drift. They cannot. Only external ground-truth verification catches the failure mode where the system's invariants are themselves wrong.
- Sentinel fallbacks — hardcoded magic numbers, silent `None → 0` coercions, `redis.get(key) or default` patterns — are the most reliable source of silent drift. They produce values that compile and look correct; downstream code cannot distinguish fake from real; phantom decisions cascade.
- AI development tools (executor + supervisor) share context with the code under review. Both validate against derived signals (tests pass, code looks correct, logs show expected events). Both miss the same defects. The operator becomes the de-facto verifier — a role that degrades under fatigue exactly when the project is under time pressure.

The architectural response is a foundational reconciliation layer built before any business logic. §11.0 specifies that layer. The remainder of §11 (modular isolation, health monitoring, kill-switch, etc.) builds on top of §11.0 and is insufficient without it.

### §11.0.2 Definition

**Reconciliation** in Crosswind is the act of verifying internal state against an external authoritative source before that internal state is consumed by downstream code. It is structurally distinct from:

- **Input validation** (§11.2 Layer 1): checking that inputs to a function satisfy the function's preconditions. This is internal.
- **Output sanity checks** (§11.2 Layer 2): checking that outputs of a function satisfy invariants. This is internal.
- **Cross-component invariants** (§11.2 Layer 3): checking that the system's overall state satisfies global properties. This is internal.

§11.2's three layers verify that the system is internally consistent. §11.0 verifies that the system's internal state matches external reality. The distinction is essential: a system can be internally consistent and entirely divorced from reality. Only external ground-truth verification catches that condition.

Reconciliation answers the question: "Does our internal record of X match what the authoritative external source says X is?" The authoritative external source is **always external to the system being reconciled**. We never reconcile internal state against itself or against a cached copy of the external source.

### §11.0.2.5 What reconciliation does NOT cover

Reconciliation as defined in §11.0 applies to:

- State-changing operations (position mutations, order generation, P&L updates, lot accounting changes)
- Trade decisions (entry, exit, sizing, rebalance trims)
- Financial value reads (prices used for MTM, positions, realized P&L, cost basis, buying power)
- Pre-trade gates (universe membership, halt status, SSR, HTB, borrow rate, account state)
- Post-trade verification (order acceptance, fill confirmation, position state after fill)

Reconciliation does NOT apply to:

- Derived analytics (signal computation, combiner ranking). These are covered by internal-consistency checks in §11.1+ and by ingestion-time data validation specified in §11.0.5.
- Operator UX (dashboards, alerts, summary reports). These are covered by §11.3 health monitoring.
- Code quality and test coverage. These are covered by §12.
- Documentation drift. This is covered by §12.1.

The criterion for whether reconciliation applies: **does this touch financial state or trade decisions?** If yes, reconciliation applies. If no, the appropriate §11 sub-section or §12 covers it.

### §11.0.3 Reconciliation sources for Crosswind

The authoritative external sources for each category of financial state:

**Position state and cost basis:** Alpaca brokerage account is ground truth via `/v2/positions` and `/v2/account`. Internal `positions` table is a derived view. Any divergence is resolved in favor of Alpaca, never the other direction.

**Realized P&L and lot accounting:** Alpaca order/trade confirms are ground truth via `/v2/orders` with `filled` status. Internal computed P&L is a derived view used for monitoring; reported tax P&L always reconciles against broker confirms.

**Quote / price for MTM and order pricing — three-layer architecture:**

Three distinct quote sources must be maintained because they serve different purposes:

1. **Signal-source quote** (Polygon Stocks Advanced): used by signal computation pipelines.
2. **Reconciliation-source quote** (Tradier API or Yahoo Finance free tier as fallback): independent feed used solely to cross-check signal-source.
3. **Broker-source quote** (Alpaca `/v2/stocks/{symbol}/quotes/latest`): the quote Alpaca uses for margin calculations and order acceptance decisions.

Reconciliation performs two cross-checks at every MTM cycle:

- **Signal-source vs reconciliation-source:** divergence > tolerance indicates data-feed problem; signal computation that consumed the divergent quote is marked suspect.
- **Reconciliation-source vs broker-source:** divergence > tolerance indicates the broker is seeing something different from external market. Affects order acceptance.

**Universe membership cross-check:** Polygon reference is primary; secondary cross-check against an independent source (S&P direct or iShares ETF holdings) confirms quarterly refresh accuracy.

**Borrow availability for shorts:** Alpaca `/v2/assets/{symbol}` locate fields are ground truth. Internal "is shortable" cache is derived. **Initial cache TTL: 5 minutes. Final value validated in Phase 0B against Alpaca's documented and empirically observed locate persistence behavior. Tuning change requires ADR per §11.0.9.**

**Borrow rate for shorts:** Alpaca's reported borrow rate at locate time is ground truth. Cost-basis calculations for shorts must include accrued borrow at broker's current rate.

**Halt status:** **Exchange feeds (transmitted via Polygon real-time) are the operational ground-truth source. Broker rejections per §11.0.4 are the authoritative correction when internal cache and broker disagree at order-submission time.**

**Corporate actions (splits, dividends, mergers):** **Two sources are maintained: the corporate-actions feed (Polygon Corporate Actions API or equivalent) for forward-looking detection, and the broker's adjusted cost basis for backward-looking authority. Divergence between these two — typically a window of T+0 to T+1 around ex-date — indicates the broker has not yet propagated the adjustment and downstream MTM/P&L on the affected symbol is marked suspect until the broker's basis updates.**

**SSR (Short Sale Restriction) flag:** Exchange feed via Polygon. Hard-gate before any short order submission.

### §11.0.4 Broker rejections as reconciliation signals

When Alpaca rejects an order with reason `halted`, `htb`, `ssr_violation`, `insufficient_buying_power`, `pdt_block`, or any other authoritative rejection, **the rejection IS the ground-truth correction**. It is not an edge case, not a retry candidate, not a logged-and-moved-on event.

Mandatory handling:

1. Propagate the rejection back to update the internal cache that should have prevented the submission.
2. Emit a `reconciliation_events` row with `call_name = "broker_rejection_propagation"`, `outcome = failure_handled` if rejection-handling worked correctly, or `system_bug` if the rejection reveals a defect in pre-submission gates.
3. Do not retry the order without first verifying that the rejection reason is no longer applicable.

Rejections are authoritative because they represent the broker's actual state at order acceptance — a state that internal caches can lag by hundreds of milliseconds to several seconds. Treating rejections as edge cases is a documented failure mode that produces phantom internal state.

### §11.0.5 Ingestion-time reconciliation

Reconciliation belongs at data-ingestion time for raw data streams:

**Price data (Polygon vs backup):** when prices arrive from Polygon, cross-check against backup (Tradier last-trade or Yahoo) for same symbol/minute. Tolerance band TBD in Phase 0B based on observed legitimate divergence at open/close. Divergence > tolerance → store both, mark Polygon record suspect, do not consume in signal computation until resolved.

**Form 4 insider transactions (Polygon vs SEC EDGAR):** when Polygon insider events are ingested, cross-check against EDGAR direct within 24h. Polygon's pass-through can lag or miss filings; EDGAR is authoritative. Divergence → flag, do not consume in signal #4 computation until resolved.

**Short interest (Polygon vs FINRA):** on SEC report dates, cross-check Polygon's reported short interest against FINRA's direct publication. Divergence → flag, use FINRA value.

**Earnings calendar (Polygon vs alternate):** event-driven signals depend on accurate earnings timing. Cross-check Polygon's earnings calendar against secondary source (Benzinga direct or Tradier) for upcoming earnings within next 5 trading days.

Ingestion-time reconciliation means signal-computation pipelines (§4.4) can trust the data they consume. Signal-level reconciliation calls are NOT required because reconciliation has occurred at ingestion.

**Ingestion-time reconciliation produces events to the same `reconciliation_events` table specified in §11.0.10**, with `call_name` conventions such as `ingestion_polygon_vs_tradier_price`, `ingestion_polygon_vs_edgar_form4`, `ingestion_polygon_vs_finra_short_interest`, etc. This single-table design means all reconciliation firings — state-time and ingestion-time — are queryable through one surface for AI-loop verification, dashboard analytics, and PR-evidence linkage.

### §11.0.6 Ranking-state freshness reconciliation

Between the combiner's output (a ranking of names) and portfolio construction's input (decisions to enter/exit positions), the system must verify that the ranking has not gone stale relative to current reality. This is state-transfer reconciliation between two internal components.

Before §7 (portfolio construction) acts on a ranking, the system verifies:

1. **Ranking freshness:** ranking was produced within the last N polling ticks (N tuned in Phase 0B; initial value: 2 ticks of the fastest signal cadence, i.e., 10 minutes). Stale rankings are not acted upon.

2. **Universe currency:** all names in the ranking still pass §3.2 universe filters. A name that has fallen out of the universe since the ranking was produced is removed from consideration.

3. **Hard-exclusion currency:** all names in the ranking still pass §3.3 hard exclusions. Specifically: re-check earnings windows, M&A status, halt history, current HTB status, current short interest. An earnings window that has crossed since ranking production excludes the name.

### §11.0.7 The seventeen verify_* interfaces (across sixteen capability domains) *(post-Part 2b interstitial: 14 original + #15/#16/#17 added)*

Phase 0B implements seventeen `verify_*` interfaces across sixteen capability domains (`verify_short_availability` and `verify_borrow_persistence` remain one architectural domain implemented as two interfaces). Each returns a structured result so callers can distinguish among accepted / rejected / pending states and access divergence detail.

1. **`verify_position(symbol, expected_qty, expected_cost_basis) → ReconcileResult`** — broker is ground truth. Called after each fill and on periodic sweep.

2. **`verify_quote(symbol, signal_source_quote, ts) → ReconcileResult`** — checks signal-source against reconciliation-source against broker-source per §11.0.3.

3. **`verify_quote_freshness(symbol, max_age_s) → ReconcileResult`** — fails if quote being used is older than `max_age_s`. Default `max_age_s = 5`. Failure action: skip MTM this cycle, mark MTM stale; do NOT fall back to last-known price.

4. **`verify_short_availability(symbol) → ReconcileResult`** — calls Alpaca's locate service. Failure action: skip short entry; do NOT substitute long; do NOT default to "assume available."

5. **`verify_ssr_status(symbol) → ReconcileResult`** — **tri-state result:**
   - **`not_active`**: proceed with normal short routing
   - **`active`**: route order with SSR-compliant pricing (strictly above NBB per Part 2c §8.2)
   - **`indeterminate`**: status cannot be determined within timeout → refuse to submit any short order on this symbol this tick; retry next tick

6. **`verify_halt_status(symbol) → ReconcileResult`** — checks exchange feed. Failure action: skip this name this tick, retry next tick.

7. **`verify_borrow_rate(symbol) → ReconcileResult`** — returns current borrow rate. Used by §3.3d and short cost-basis. Failure action: if rate cannot be obtained, treat as HTB and skip short entry.

8. **`verify_borrow_persistence(symbol, locate_id) → ReconcileResult`** — *expected-divergence-aware call (per R7).* Between short entry and subsequent actions, verifies locate is still valid. Alpaca-specific behavior validated in Phase 0B; initial implementation may be no-op pending clarification, but interface exists from day 1.

   *Outcome assignment:* Locate expiration at end of its documented TTL emits outcome `expected_divergence_handled` (this is the locate's normal lifecycle, not a failure). Locate disappearance before TTL completion emits outcome `failure_handled` and contributes to escalation count per §11.0.9 Low-tolerance class.

9. **`verify_buying_power(account, requested_position_size) → ReconcileResult`** — broker is ground truth. Failure action: skip entry, log insufficient buying power, alert if recurring.

10. **`verify_universe_membership(symbol, as_of=now) → ReconcileResult`** — before any order, confirms symbol in eligible universe AND not in hard exclusions. Catches stale rankings per §11.0.6.

11. **`verify_corporate_action_clean(symbol, lookback_days=5) → ReconcileResult`** — *expected-divergence-aware call (per R7).* Checks if symbol has had recent corporate action that may not have propagated to broker's adjusted cost basis. Failure action when corporate action is detected and broker's adjusted basis has not yet propagated: skip MTM and skip P&L computation on this symbol until the broker's adjusted basis is verified against the corporate-actions feed. Existing positions are not closed during this window; they remain held with stale MTM marked explicitly. Operator alert if the suspect window exceeds 48 hours.

    *Outcome assignment:* During the T+0 to T+1 propagation window, emit outcome `expected_divergence_handled`. Beyond the 48h window, emit outcome `failure_escalated` and operator-alert per §11.0.9.

12. **`verify_settlement_status(symbol, side) → ReconcileResult`** — *expected-divergence-aware call (per R7).* For shorts especially: T+1 settlement matters. Some operations are only valid post-settlement.

    *Outcome assignment:* Pre-T+1 "not settled" responses for trades within their expected settlement window emit outcome `expected_divergence_handled`. Post-T+1 unsettled trades emit outcome `failure_escalated`; this represents real bookkeeping defect (Zero-tolerance class per §11.0.9).

13. **`verify_order_acceptance(order_id, timeout_s=10) → ReconcileResult`** — tri-state:
    - **`accepted`**: broker confirmed. Proceed.
    - **`rejected`**: broker returned explicit rejection. Mark order rejected; do NOT retry without operator review. (See Part 2c §8.6.1 Path 1.B for trade-type-aware retry rules: order ID terminal but trade intent persists for rank/stop exits.)
    - **`pending`**: no broker response within `timeout_s`. Escalate polling to every 2s for up to 60s. If still pending, alert operator. Do NOT cancel-and-retry — cancellation of a just-filled order creates phantom-rejection / retry-storm class of failures.

14. **`verify_realized_pnl(trade_id, claimed_pnl) → ReconcileResult`** — broker confirm is ground truth. Used at trade close.

**15. `verify_lot_record(lot_id, expected_fields) → ReconcileResult`** — Strong+ tier per §11.0.10. *Added by Part 2b §11.0 interstitial revision per V1 UUID + tiebreaker lock.*

Verifies that a written lot record in the internal lot ledger persisted correctly with the expected fields:

```
expected_fields = {
  lot_id (UUID, globally unique),
  symbol, entry_ts, qty, cost_basis, side, status,
  locate_id (nullable, populated for short lots)
}
```

Called after every lot write or update operation (entries, exits, trims per §7.5/§7.6/§7.9). Zero-tolerance class per §11.0.9 — lot accounting divergence is structural defect requiring immediate operator alert.

**16. `verify_wash_sale_record(event_id, expected_fields) → ReconcileResult`** — Strong+ tier per §11.0.10.

Verifies that a written `wash_sale_events` row persisted correctly with the expected fields:

```
expected_fields = {
  symbol, exit_ts, realized_loss, lot_ids_affected, status,
  block_until (for full-exit path A) OR attached_to_lot_id (for trim path / §7.8 retroactive)
}
```

Called after every wash_sale_events write per §7.7 Path A and §7.9 trim-loss path. Zero-tolerance class. **Year-end ground-truth reconciliation against broker's 1099-B / Form 8949** per §11.0.10 Strong+ retention discipline: all wash_sale_events rows are reconciled against the broker's tax-year generation before tax filing.

**17. `verify_rebalance_aggregate() → ReconcileResult`** — Strong tier per §11.0.10.

After all rebalance trims complete per §7.10 timing logic, re-computes long-book and short-book gross dollars from broker positions (Alpaca `/v2/positions` — the ground truth) and verifies the long/short ratio is within the 90-110% band per §1.6.

Zero-tolerance class per §11.0.9 — an aggregate verification failure indicates structural defect: per-trim verifications passed but the aggregate is still out of band. Some trim failed silently or trim targets were computed wrong. Operator alert; do NOT auto-retry the rebalance.

The remaining 11 interfaces (1, 2, 3, 4, 5, 6, 7, 9, 10, 13, 14) are not expected-divergence-aware; any divergence beyond tolerance is treated as a failure indicator and contributes to escalation counts.

### §11.0.8 Per-call failure-action discipline

Generic "refuse to operate on reconciliation failure" is governance language that becomes meaningless under operational pressure. Each `verify_*` call has a specific failure action defined inline at the call site, and §7 and §8 each contain a complete failure-action table for the calls relevant to their domain.

Failure-action discipline:

- Action is **specific to the call and the failure mode**, not generic.
- Action is **defined before the call site is built**, not invented at runtime.
- Action is **logged with structured fields** to `reconciliation_events` so patterns are visible.
- Repeated failures within a window trigger graduated escalation per §11.0.9.

### §11.0.9 False-positive tolerance discipline

Reconciliation engines have false positives. Polygon and Tradier will disagree by 3 cents at the open because their first-tick logic differs. If every false positive halts trading, the system halts itself out of useful operation. If tolerances are set wide enough that no false positives occur, real divergences are also missed.

**Initial tolerance bands** are set explicitly in spec per `verify_*` call. Per-call initial tolerances will be specified in §13 alongside the schema. Examples for now:

- `verify_quote`: 5 bps absolute or 1¢, whichever is greater, between signal-source and reconciliation-source. Wider at open/close (TBD per Phase 0B tuning).
- `verify_position`: zero tolerance on share count. Cost basis tolerance: 1¢ per share.
- `verify_realized_pnl`: 1¢ tolerance on total P&L.

**Graduated response thresholds are per-call-class, not uniform across all calls.** Uniform thresholds make the engine either too noisy or too quiet regardless of where the dial is set. The seventeen `verify_*` interfaces are classified across three tolerance classes plus a flag for expected-divergence-aware calls:

**Zero-tolerance calls (single failure escalates immediately):**

- `verify_position` (#1)
- `verify_realized_pnl` (#14)
- `verify_order_acceptance` (#13) in `rejected` state
- `verify_settlement_status` (#12) — note: only the *unexpected* unsettled-state failures escalate immediately (i.e., post-T+1 unsettled); expected pre-T+1 "not settled" emits `expected_divergence_handled` and does not count
- `verify_lot_record` (#15) — *added by Part 2b interstitial; lot accounting divergence is structural defect*
- `verify_wash_sale_record` (#16) — *added by Part 2b interstitial; tax-record divergence is structural defect*
- `verify_rebalance_aggregate` (#17) — *added by Part 2b interstitial; aggregate divergence indicates silent per-trim failure*

One firing → log + immediate operator alert + symbol-level halt. These calls represent structural correctness conditions where any genuine divergence indicates a defect requiring resolution before further action. Deterministic checks: no expected operational range of divergence.

**Low-tolerance calls (three within rolling window escalates):**

- `verify_short_availability` (#4)
- `verify_buying_power` (#9)
- `verify_universe_membership` (#10)
- `verify_halt_status` (#6)
- `verify_ssr_status` (#5)
- `verify_borrow_rate` (#7)
- `verify_borrow_persistence` (#8) — note: only *unexpected* locate disappearances (before TTL completion) count; expected end-of-TTL expiration emits `expected_divergence_handled`
- `verify_corporate_action_clean` (#11) — note: only *unexpected* divergences (beyond 48h propagation window) count; expected T+0 to T+1 window emits `expected_divergence_handled`

Three firings within 1 hour → escalate. These calls can fire transiently due to broker latency, feed lag, or expected propagation windows; repeated firings indicate sustained divergence.

**Noise-tolerant calls (five within rolling window escalates):**

- `verify_quote` (#2)
- `verify_quote_freshness` (#3)
- Ingestion-time calls (`ingestion_polygon_vs_tradier_price`, `ingestion_polygon_vs_edgar_form4`, `ingestion_polygon_vs_finra_short_interest`, `ingestion_polygon_vs_alternate_earnings`)

Five firings within 1 hour → escalate. Quote-source disagreement and feed lag are normal market microstructure phenomena.

**Within-call magnitude escalation (per R7):**

A single firing where divergence exceeds the structural-defect threshold for that call escalates immediately, regardless of call class. This handles the case where the count-based rule would miss a serious problem because it happens to fire only once at large magnitude.

Initial per-call structural-defect thresholds:

- `verify_buying_power`: 10% divergence (e.g., broker reports $50K BP, internal says $55K — that's 10% and escalates immediately)
- `verify_quote`: 100 bps absolute (e.g., 1% disagreement between signal-source and reconciliation-source on the same symbol/timestamp)
- `verify_borrow_rate`: 200 bps absolute (e.g., internal cache says 1% borrow, broker says 3%)
- `verify_corporate_action_clean`: any divergence persisting beyond 48h (already specified as operator-alert)
- `verify_universe_membership`: structural — single firing escalates if symbol is materially excluded (in M&A, halted >5 days) but internal cache shows eligible

Magnitude escalation applies to Low-tolerance and Noise-tolerant classes. Zero-tolerance calls have no magnitude exemption (any firing escalates regardless of size). Initial thresholds are starting estimates; tuned in Phase 0B per the tuning discipline below.

**Expected-divergence handling (per R7):**

Calls flagged as expected-divergence-aware in §11.0.7 (`verify_corporate_action_clean`, `verify_settlement_status`, `verify_borrow_persistence`) may emit outcome `expected_divergence_handled` when the divergence falls within the documented expected operational window. Specifically:

- `verify_corporate_action_clean`: divergence during T+0 to T+1 propagation window
- `verify_settlement_status`: "not settled" responses pre-T+1 for in-flight trades
- `verify_borrow_persistence`: locate expiration at end of documented TTL

**Escalation counts include only outcomes `failure_handled` and `failure_escalated`. Outcomes `false_positive_within_tolerance` and `expected_divergence_handled` do NOT count toward escalation thresholds.** This prevents normal operational state transitions from triggering escalation while preserving audit visibility (the events are still written to `reconciliation_events` for queryability).

**Tuning discipline:** initial tolerances are tuned during Phase 0B against captured Day 1. Any tolerance change requires an ADR documenting:

- The legitimate divergence pattern observed
- Why the new tolerance is appropriate
- What real divergence the new tolerance might miss
- Quarterly review of whether the tolerance is still appropriate

**Asymmetric change discipline:** tolerances may be tightened ad-hoc (more conservative) without ADR — this can only reduce the engine's miss rate. Loosening tolerances (more permissive) requires an ADR with the four justifications above. The asymmetry reflects the fact that tightening errs on the side of catching more divergences; loosening errs on the side of missing them.

A loosening change without an ADR is a violation of §12 documentation discipline and is grounds for reverting the change.

### §11.0.10 The reconciliation_events table

All `verify_*` invocations that produce a non-passing result write to a single `reconciliation_events` table. Schema:

```
reconciliation_events:
  event_id           uuid primary key
  ts                 timestamp with timezone (UTC), not null
  engine_version     text not null  -- e.g., "0.1.3"; for audit traceability
  call_name          text not null  -- e.g., "verify_short_availability"
  tier               text not null  -- enum: strong_plus | strong | medium | weak
  symbol             text           -- nullable for system-level calls
  expected_value     jsonb          -- internal-cache view; structure varies by call
  observed_value     jsonb          -- external ground-truth view
  divergence         jsonb          -- structured divergence detail (bps, dollars, count, etc.)
  tolerance          jsonb          -- tolerance configuration applied
  outcome            text not null  -- enum (per R7):
                                    --   false_positive_within_tolerance   (does NOT count toward escalation)
                                    --   failure_handled                   (counts toward escalation)
                                    --   failure_escalated                 (counts toward escalation; escalation already fired)
                                    --   expected_divergence_handled       (does NOT count toward escalation) [R7 addition]
                                    --   system_bug                        (always escalates regardless of class)
  failure_action     text           -- specific action taken (per §11.0.8 tables)
  phase_0b_run_id    uuid           -- nullable; populated during Phase 0B captured-day analysis
  pr_evidence_ref    text           -- nullable; links firing to PR that incurred it
  notes              text           -- free-form for system_bug outcomes pending root-cause
  resolved_at        timestamp      -- nullable; populated when system_bug is fixed
  resolution_pr_ref  text           -- nullable; PR that resolved a system_bug
```

**The `engine_version` field** is essential because the same call with the same input may produce different outputs as the engine evolves (new tolerance bands, new failure-action logic). For tax-year audit reconciliation and PR-introduced-firing detection, knowing which engine version produced each event is required.

**The `tier` field** allows retention policy enforcement declaratively from the data itself rather than per-call lookup, and enables dashboard filtering by tier.

**Retention policy:**

- **Strong+ tier** (tax/regulatory: `verify_realized_pnl`, `verify_lot_record`, `verify_wash_sale_record`, other lot-accounting calls): indefinite. Required for tax-year audit.
- **Strong tier** (financial-correctness: `verify_position`, `verify_short_availability`, `verify_quote`, `verify_halt_status`, `verify_ssr_status`, `verify_order_acceptance`, `verify_rebalance_aggregate`, etc.): indefinite. Required for ongoing pattern analysis.
- **Medium tier** (signal-level if added later): 12 months.

**Dashboard views derived from this table:**

- Per-call firing rate over time (drift detection)
- Outcome distribution per call (false-positive rate, escalation rate, system-bug rate, expected-divergence rate per R7)
- Unresolved `system_bug` events (operator action queue)
- New firing patterns introduced since last PR (used by AI loop per §12.5)
- Per-call ratio of `expected_divergence_handled` to total firings (per R7) — sudden spikes for `verify_corporate_action_clean` indicate either an unusually active corporate-actions week or a propagation problem affecting many symbols

**Operational use by the AI loop:**

When supervisor or operator reviews a PR, the question "did this PR introduce a new reconciliation firing pattern?" is answered by querying `reconciliation_events` for events with `ts > pr.deployed_at AND call_name not in pre_pr_firing_calls`. This is the actual mechanism that replaces "tests pass" as evidence of correctness. The query helper itself is a Phase 0B Strong-evidence workflow tooling deliverable, not an emergent capability — see §11.0.13.

### §11.0.11 Phase 0B exit gate

Phase 0B is complete when:

**Every firing produced during Phase 0B captured-day analysis is root-caused** to one of:

(a) **A documented false positive** with tolerance band tuned and an ADR explaining the new tolerance with rationale (per §11.0.9);

(b) **A real-world divergence** handled per the per-call failure-action table (per §11.0.8); or

(c) **A system bug** that has been fixed before phase exit, with the fix itself going through evidence-tier discipline (per §12.5).

Unresolved or unexplained firings block phase exit.

**Rationale for this gate** (and why "zero firings" is wrong): a literal zero-firings gate creates pressure to widen tolerances until the gate passes, which defeats the engine's purpose. The empirical question is not "does the engine ever fire" — it should fire on Day 1; that's evidence it's working — but "is every firing understood and either accepted as a real-world divergence or fixed as a defect." Anything else means the engine is producing signals the team doesn't understand, which is structurally indistinguishable from no engine at all.

**Outcome classification (per Response 3 R1, applied symmetrically to Phase 0B exit gate / Phase 7 Gate 2 / Phase 8 Gate 2 post-calibration per Part 3a §10.4 and Part 3b §10.11/§10.12):** Firings counting against the quietness gate are limited to `outcome = system_bug` (unresolved), `outcome = failure_handled` requiring operator-bespoke intervention beyond standard runbook procedures, or `outcome = failure_escalated` unresolved. Firings classified as `false_positive_within_tolerance`, `expected_divergence_handled`, `failure_handled` via standard runbook, or `failure_escalated` resolving to documented real-world divergence do NOT count. Operator-intervention qualifier: runbook-driven action expected; operator-bespoke debugging signals bug.

**Realistic time impact (per V1):** the root-cause requirement may extend Phase 0B by 1-2 weeks beyond the 6-10 week baseline (per Part 3a V1 Option B revision; was 5-8 in original draft) if Day 1 has many legitimate edge cases. That extension is the right work to do at the right time.

The same exit-gate discipline applies to the Phase 7 → Phase 8 transition (R2 asymmetric quietness: 30 consecutive RTH days of paper trading per §10.11) and Phase 8 → Phase 9 transition (R2 asymmetric quietness: 30 RTH days POST-CALIBRATION per §10.12). **Reconciliation quietness is a primary exit criterion, not a side metric.**

### §11.0.12 CI-enforcement reference forward

The evidence-tier discipline detailed in §12.5 is the structural mechanism that prevents the discipline-at-the-seams failure mode. §12.5 requires CI checks that enforce evidence-tier compliance: Strong+/Strong tier PRs must include replay-test PASS reference, reconciliation-engine telemetry zero-bug-firings reference, and ground-truth spot-check artifact reference in the PR body. CI rejects PRs missing these artifacts regardless of test status.

CI enforcement is a Phase 0B deliverable. Without it, evidence-tier compliance becomes operator burden, which degrades under fatigue — the failure mode §11.0 is designed to prevent.

Specific CI implementation, override discipline, and audit-table behavior are detailed in §12.5.

### §11.0.12.5 The operator's role under §11.0

The reconciliation engine, replay framework, evidence hierarchy, and CI enforcement together form Crosswind's structural verification layer. **The operator remains the final reviewer for ambiguous cases** — specifically:

- Novel reconciliation firings without precedent (new failure patterns not yet classified)
- Tolerance-band tuning decisions (every change requires operator-approved ADR per §11.0.9)
- Strong+/Strong-tier change approvals where automated evidence is present but operator judgment is required

The architectural shift introduced in §11.0 moves operator verification **from "primary line of defense against silent failures" (where it inevitably degrades under fatigue) to "backstop for the residual ambiguity that structural verification cannot resolve."** The operator is still the final reviewer. The structural layers reduce the volume of decisions the operator must personally verify from ~100% of state mutations to approximately 5% of ambiguous edge cases.

A reader of this spec 18 months from now needs to understand that reconciliation is not a replacement for the operator. It is the infrastructure that makes operator verification sustainable across the multi-year operational horizon.

### §11.0.13 Phase 0B priorities under §11.0

*The architectural priority order is established here; specific Phase 0B deliverables, sub-deliverables, and operational exit gates are detailed in Part 3a §10.4 (revised in the §10 drafting pass). Both sources must align; divergence between them is a governance violation per §12.1.*

Phase 0B produces three deliverables in priority order. If time pressure forces triage, this is the order:

1. **Reconciliation engine** with all seventeen `verify_*` interfaces and the `reconciliation_events` table. Without this, nothing else matters. Includes A1 sustained-anomaly baseline aggregation infrastructure per Part 3a §10.4 (aggregation views daily/weekly/monthly per call_name per outcome + baseline-vs-current comparison query helper) supporting Phase 9 sustained-anomaly kill condition per §11.6.

2. **Strong-evidence workflow tooling** with <15-minute wall-clock target and CI enforcement. **Specific tooling deliverables include the `reconciliation_events` query helper that surfaces "new firing patterns since deploy" for PR-introduced-firing detection (§11.0.10), one-command replay execution (per §11.10), auto-generated reconciliation telemetry reports, and pre-built broker-API spot-check scripts.** Without this, evidence-tier discipline fails in month 6 regardless of architecture quality.

3. **Replay framework** with broker + quote streams (both signal-source and reconciliation-source) + halt feeds + locate feeds + corporate-actions feed + combiner I/O capture per §11.10. Without this, evidence requirements are impossible to meet.

Everything else in Phase 0B (Alpaca paper integration, captured Day 1, `.cursorrules` with evidence-hierarchy rules, ADR-001 reconciliation-architecture, spec-source-index, §8.6.1.1 Alpaca multi-pending-order behavior validation per Part 3a forward-tracking item 7 resolution) supports these three. None of the three is droppable.

---

## §11.1 Modular isolation principle *(v0.8 baseline + v0.9 preamble)*

**v0.9 preamble (per Text [25] Pass B redline):** §11.1 sits on top of §11.0 foundational reconciliation layer, not as substitute. Modular isolation per §11.1 + reconciliation per §11.0 together produce the verification surface; neither alone is sufficient.

Every component is independently testable, observable, disable-able, and versioned/rollback-eligible.

Applies to: each of the 9 signal pipelines, the combiner long-side and short-side, universe filter, hard exclusions filter, portfolio construction layer, execution engine, each ingestion source.

---

## §11.2 Three layers of defense against silent failures *(v0.8 baseline + v0.9 preamble)*

**v0.9 preamble (per Text [25] Pass B redline):** §11.2's three layers verify the system is internally consistent. §11.0 verifies internal state matches external reality. The two are complementary; internal-consistency checks alone produce the failure mode §11.0 is designed to prevent (system internally consistent but divorced from reality).

**Layer 1: Input validation.** Failures produce explicit error events to monitoring.

**Layer 2: Output sanity checks.** Failures pause the affected component.

**Layer 3: Cross-component invariants.** Violations are kill-switch triggers.

---

## §11.3 Health monitoring per component *(v0.8 baseline — unchanged)*

Each component publishes liveness, performance, and drift metrics to a dashboard.

---

## §11.4 Test coverage requirements *(v0.8 baseline — unchanged)*

Unit tests, integration tests, backtest validation, regression test set, smoke tests in production.

---

## §11.5 Change management discipline *(v0.8 baseline — unchanged)*

Defined processes for signal changes, model retraining, universe/exclusion changes, portfolio construction changes.

---

## §11.6 Kill-switch architecture *(REVISED v0.9 — sustained-anomaly kill condition added per forward-tracking item 11)*

**v0.8 baseline:** Three levels: soft pause, hard pause, liquidation. Manual liquidation only or by pre-defined drawdown thresholds.

**v0.9 expansion (per Part 3b §10.13 forward-tracking item 11 — full canonical specification of sustained-anomaly kill condition lives at §11.6; Part 3b §10.13 becomes compact summary + cross-reference at v0.9 final assembly per item 12):**

The kill-switch architecture is extended in v0.9 with a sustained-anomaly kill condition that operates against the reconciliation engine baseline established during Phase 7 paper trading (per §10.11 deliverable #2) and the baseline aggregation infrastructure established Phase 0B (per §10.4 priority deliverable #1 A1).

**Sustained reconciliation anomaly kill condition:**

If `reconciliation_events` firing rate — excluding `expected_divergence_handled` and `false_positive_within_tolerance` outcomes — exceeds the Phase 7/8-established baseline by **>3× for 7+ consecutive RTH days**, kill-switch escalation triggers Level 1 soft pause for operator investigation.

The threshold catches gradual systemic drift that doesn't trigger individual call-level escalations:

- Cache freshness degradation across multiple verify_* calls
- Broker behavior changes (Alpaca API updates, locate-service modifications)
- New defect classes that don't individually exceed per-call tolerance but aggregate into anomalous firing patterns
- Data feed quality degradation (Polygon vs Tradier divergence drift over time)

**Baseline reference (per A1):** The baseline is the rolling 90-day trailing window per call_name per outcome, established during Phase 7 (per §10.11 deliverable #2) and recalibrated continuously during steady-state operation. The aggregation infrastructure (daily/weekly/monthly views per call_name per outcome and baseline-vs-current comparison query helper) was built in Phase 0B per §10.4 priority deliverable #1 (A1 sustained-anomaly baseline aggregation infrastructure).

**Three-level escalation (v0.8 baseline preserved):**

- **Soft pause:** new entries blocked; existing positions held; exits and stops continue. Triggered by sustained-anomaly kill or operator-discretion drawdown thresholds.
- **Hard pause:** all new orders blocked except short-stop exits and operator-explicit positions. Triggered by larger drawdown thresholds or operator escalation from soft pause.
- **Manual liquidation:** operator-driven only. The spec preserves the right to kill the strategy at any point.

---

## §11.7 Operator-in-the-loop principle *(v0.8 baseline — unchanged)*

For v1: operator has visibility and override at every layer. Daily summary reports, real-time alerting, manual override capability, configuration changes require operator approval.

---

## §11.8 Banned-pattern linting — sentinel fallback ban *(NEW v0.9)*

The v0.9 architectural commitment to type-discipline-end-to-end requires CI-level enforcement that the banned patterns from §11.0.1 (silent sentinel fallbacks) do not enter the codebase. Per the "don't overcomplicate" directive, enforcement uses pattern-based detection (ruff config + CI grep pre-commit hook), not sophisticated AST analysis or SAST integration.

**Banned patterns (CI fails if any appear in financial-logic code paths):**

- `redis.get(key) or "0"` / `redis.get(key) or 0` / `redis.get(key) or default` — silent fallback to fake value
- Hardcoded financial magic numbers (specifically `0`, `-1`, `999`, `-999`, `9999`) used as fallback values in signal computation, position sizing, or P&L paths. **Exception:** `Decimal('-999')` is the locked sentinel value per §6.5.2 introduced at exactly one place (feature-vector construction layer per §6.5.6). Any other code path producing `-999` in a signal-value context is a violation.
- `.get(default=0)` / `.get(default=None)` patterns on financial values where the type signature should be `Optional[Decimal]` per §4.3.5
- Silent `None → 0` coercion via `value or 0`, `value if value else 0`, or equivalent
- `try: ... except: return 0` / `except: pass` in financial-correctness code paths

**Enforcement mechanism:**

- **ruff config:** `ruff.toml` includes pattern rules detecting the banned constructs in code matching paths `src/financial/**`, `src/signals/**`, `src/portfolio/**`, `src/execution/**`. Phase 0B Strong-evidence workflow tooling deliverable.
- **CI pre-commit hook:** `grep -rn "redis\.get.*or\s\"\?\(0\|-1\|-999\)" src/` and similar pattern checks run on every PR. CI fails if matches are found in financial-logic paths.
- **Override:** explicit code annotation `# allow-sentinel-fallback: <ADR-ID>` permits a specific instance, but requires an ADR per §11.0.9 asymmetric change discipline (loosening always requires ADR).

**Auditability:** the banned-pattern list and override registry are maintained in `docs/banned_patterns.md` per §12 documentation discipline.

---

## §11.9 `datetime.now()` in business logic ban *(NEW v0.9)*

The v0.9 architectural commitment to replay determinism requires that time be an injected parameter for all financial-math functions, never derived inside the function via `datetime.now()` or equivalent. This enables replay determinism (per §11.10) and prevents intraday-time-blind defects (a function that reads `datetime.now()` produces different outputs at different wall-clock times, defeating replay).

**Banned pattern:**

- `datetime.now()` / `datetime.utcnow()` / `time.time()` / `pd.Timestamp.now()` inside any function in `src/financial/**`, `src/signals/**`, `src/portfolio/**`, `src/execution/**`.

**Required pattern:**

- Functions accept `ts: datetime` (or `as_of: datetime`) as a parameter. Time is injected at the top of the call chain by the polling-loop entry point or replay-framework entry point.

**Enforcement mechanism:**

- **ruff config + CI grep:** same pattern as §11.8. CI fails if `datetime.now()` or equivalent appears in banned paths.
- **Override:** explicit code annotation `# allow-now-in-business-logic: <ADR-ID>` with ADR per §11.0.9 asymmetric change discipline.

**Acceptable exceptions:** `datetime.now()` is permitted in `src/infrastructure/**` (logging, monitoring, replay capture itself), where wall-clock time IS the intended value rather than a leaked derivation source.

---

## §11.10 Replay framework *(NEW v0.9)*

The replay framework enables deterministic re-execution of any captured RTH day against the full Crosswind pipeline producing identical outputs. This is the foundation for replay-test PASS evidence per §12.5 evidence-tier discipline. Built in Phase 0B per §10.4 priority deliverable #3.

### §11.10.1 Capture scope

Per §10.4 Phase 0B replay framework deliverable, the captured streams include:

- Broker state stream (Alpaca positions, orders, fills, borrow status, account state)
- Signal-source quote stream (Polygon Stocks Advanced)
- Reconciliation-source quote stream (Tradier API or Yahoo Finance)
- Broker-source quote stream (Alpaca quotes/latest)
- Halt feed (Polygon real-time with exchange feed)
- Locate feed (Alpaca locate API responses)
- Corporate actions feed (Polygon Corporate Actions API)
- Combiner I/O capture: at every ranking event, full `(symbol, signal_id, value, is_present, timestamp)` tuples + produced ranking with rank, score, SHAP attribution per name

### §11.10.2 Capture storage and retention

Captured days are stored in compressed format in `replay_storage/` (Modal volume or S3). Retention: indefinite for Phase 0B Day 1 + at least 12 weeks rolling for Phase 7+ captured days.

### §11.10.3 Deterministic replay engine

Given captured day data, the system can re-run the day end-to-end producing identical outputs:

- Time is injected (per §11.9 ban) — replay sets `ts` to captured timestamps in order
- All external API calls served from captured fixtures rather than live broker/data sources
- Signal-dependent randomness (if any) is captured with seeds; replay uses identical seeds
- The reconciliation engine runs against captured external state, producing identical `reconciliation_events` rows

### §11.10.4 Replay-test PASS comparison *(resolves forward-tracking item 1)*

A "replay-test PASS" is the evidence artifact required for Strong+/Strong tier PRs per §12.5. It is produced by running the candidate code change against captured Day 1 (or another canonical captured day) and comparing outputs against the pre-change baseline.

**Comparison mechanism:**

1. Run pre-change code against captured Day 1 → produce baseline outputs (rankings per tick, position-mutation events, lot records, wash_sale_events, reconciliation_events).
2. Run candidate code against same captured Day 1 → produce candidate outputs.
3. Diff candidate vs baseline:
   - **Expected differences** for the PR's intended scope: candidate matches expected delta (e.g., "this PR adds field X to lot_record; candidate lot_records contain X, baseline does not — pass").
   - **Unexpected differences** anywhere else: replay-test FAIL. Investigate.

**Determinism dependency on FIFO lot policy (per Part 2b §7.4 V1 UUID + tiebreaker):** the replay-test PASS comparison requires deterministic lot selection. FIFO with `(entry_ts ASC, lot_id ASC)` tiebreaker via globally-unique UUID lot_ids per §7.4 ensures two replay runs of the same captured day produce identical lot selections, enabling clean output diffs.

**Timing budget (per Pass 2/3 R1 refinement):** Replay-test PASS production must complete within the <15-minute wall-clock target of §10.4 evidence-workflow tooling. Phase 0B validation includes empirical timing of replay-test PASS against captured Day 1.

**Implementation:** pytest-based with captured fixtures. The replay command is `pytest tests/replay/test_replay_pass.py --captured-day=<day_id>` per §10.4 Phase 0B tooling deliverable.

### §11.10.5 Replay-driven AI-loop verification

The replay framework is the independent verification surface for the AI loop per §11.0.1 architectural commitment. Where executor + supervisor share blind spots, the replay framework runs against captured external state — a verification source neither AI can manipulate or pre-cache.

---

<!-- =================================================================== -->
<!-- Part 4b: §12 Documentation + §16 Deferred + §17 Conventions + §18    -->
<!-- =================================================================== -->

## §12.1 Living documentation principle *(v0.8 baseline — unchanged)*

Documentation continuously maintained, not written once and abandoned. Documentation drift is a bug.

---

## §12.2 Documentation hierarchy *(v0.8 baseline — unchanged)*

Three tiers: Tier 1 (CROSSWIND_SPEC.md), Tier 2 (component documentation), Tier 3 (operational runbooks).

---

## §12.3 Cross-reference and dependency tracking *(v0.8 baseline — unchanged)*

Every component documents dependencies and consumers. Dependency map (`SYSTEM_DEPENDENCIES.md`) kept current.

---

## §12.4 Per-component documentation requirements *(v0.8 baseline — unchanged)*

README.md, formal component spec, inline code documentation.

---

## §12.5 AI-assisted development rules *(REVISED v0.9 — Rules 8/9/10 added per Response 3 R3.4 Update 7; §12.5.1 evidence hierarchy table NEW)*

**v0.8 baseline (Rules 1-7 — unchanged):**

Seven rules for AI development tools:

1. Read before writing
2. Strategic constraints are non-negotiable
3. Documentation updates accompany code changes
4. Cross-references must remain valid
5. Test changes accompany behavior changes
6. Changes touching locked decisions require explicit human confirmation
7. AI explains its reasoning

Rule files authored in Phase 0A deliverable #2 (`.cursorrules`, `CLAUDE.md`, `AI_RULES.md`).

**v0.9 expansion (Rules 8/9/10 NEW):**

8. **Evidence-tier compliance.** For any change classified as Strong+ or Strong tier per §12.5.1 evidence hierarchy table, the AI must attach the three required evidence artifacts to the PR description before requesting review: (a) replay-test PASS reference (per §11.10.4), (b) reconciliation-engine telemetry zero-bug-firings reference (per §11.0.10), (c) ground-truth spot-check artifact reference (per §11.0.4 broker-rejection-style verification). CI rejects PRs missing these artifacts regardless of test status (per §11.0.12).

9. **Reconciliation-engine awareness.** For any change touching financial state, trade decisions, position mutations, or `verify_*` interfaces (§11.0.7), the AI must query the `reconciliation_events` table for new firing patterns introduced by the change before requesting review. The query helper for "new firing patterns since deploy" is a Phase 0B Strong-evidence workflow tooling deliverable per §10.4.

10. **Failure-mode logging discipline.** When the AI encounters an unexpected failure mode (rule violation, evidence-tier bypass attempt, reconciliation firing not understood, behavior deviating from spec), the AI logs an entry to `docs/ai-failure-modes.md` per §12.10 capture protocol. Logging is required; suppressing the failure mode without logging it is a rule violation.

### §12.5.1 Evidence hierarchy table *(NEW v0.9)*

| Tier | Definition | Evidence artifacts required per PR | CI enforcement |
|---|---|---|---|
| **Strong+** | Touches tax/regulatory state (wash-sale events, lot accounting, realized P&L). Examples: §7.7/§7.8/§7.9 wash-sale logic, §7.4 lot policy, §1.4 retroactive cost-basis adjustment. | (a) replay-test PASS reference per §11.10.4; (b) reconciliation-engine telemetry zero-bug-firings reference per §11.0.10; (c) ground-truth spot-check artifact reference (broker confirms / 1099-B reconciliation) | CI hard-rejects PR if any artifact missing; merge requires operator approval after artifact review |
| **Strong** | Touches financial-correctness state (positions, orders, P&L, prices, signals affecting trade decisions). Examples: §8.6 order state machine, §6 signal combiner, §3.3 hard exclusions. | (a) replay-test PASS reference per §11.10.4; (b) reconciliation-engine telemetry zero-bug-firings reference per §11.0.10; (c) ground-truth spot-check artifact reference | CI hard-rejects PR if any artifact missing; merge allowed after artifact review |
| **Medium** | Touches signal-computation derivations or operational dashboards. Examples: §11.3 health metrics, dashboard views per §11.0.10. | (a) replay-test PASS reference (lighter spot-check sufficient); (b) reconciliation-engine telemetry diff | CI requires artifacts but is lenient on completeness; review focuses on substantive change |
| **Weak** | Touches documentation, comments, test fixtures, non-financial-logic refactoring. | None required beyond standard PR review | CI does not enforce evidence artifacts |

**[bypass-evidence-tier] operator override:**

In urgent operational situations where evidence-tier compliance would block a time-critical fix (e.g., production broker outage requiring immediate cache-refresh patch), the operator may add the annotation `[bypass-evidence-tier: <reason>]` to the PR title. CI permits the merge but logs the bypass to an audit table (`evidence_bypass_log`) with operator_id, reason, PR reference, and timestamp. Bypassed PRs require retroactive evidence-artifact attachment within 48 hours; failure to attach within 48 hours produces a Strong+ tier escalation per §11.6 kill-switch architecture (system-level discipline violation).

**Per-tier audit retention:** `evidence_bypass_log` retained indefinitely per §11.0.10 Strong+ tier retention policy.

---

## §12.6 Decision log discipline *(v0.8 baseline — unchanged)*

ADR (Architecture Decision Record) format for non-trivial decisions. Lives in `docs/decisions/`.

---

## §12.7 Versioning discipline for components *(v0.8 baseline — unchanged)*

Code, schema, configuration, model versioning. Logged on startup. Rollback always supported within retention window.

---

## §12.8 Documentation review cadence *(v0.8 baseline — unchanged)*

Per change, weekly, monthly, quarterly, per phase transition.

---

## §12.9 What good documentation looks like *(v0.8 baseline — unchanged)*

Drift-resistant docs reference relevant CROSSWIND_SPEC.md sections, list dependencies and consumers, summarize test coverage.

---

## §12.10 AI failure-mode logging *(NEW v0.9)*

The reconciliation engine (§11.0), evidence-tier discipline (§12.5), and replay framework (§11.10) together address architectural failure modes. **§12.10 addresses the operational failure modes that surface during AI-assisted development** — patterns where the AI loop (executor + supervisor) produces output that bypasses, misinterprets, or fails to apply the structural verification surface.

**Operational document:** `docs/ai-failure-modes.md` is maintained continuously throughout the project. Entries are appended as failures are observed; no entry is removed (operational history is preserved).

**Failure categories (per operator scope):**

1. **Executor-supervisor blind spot.** Both AI tools share context and validate against derived signals (tests pass, code looks correct). Both miss the same defect class. Example: a sentinel fallback re-introduced after refactor; supervisor approves because tests pass; reconciliation engine catches it post-merge.

2. **Evidence-tier bypass attempt.** AI proposes a Strong+/Strong tier change without attaching required artifacts, or claims artifacts exist when they don't. CI catches this per §12.5 enforcement, but the AI behavior pattern is itself a failure mode worth logging.

3. **Reconciliation-event silenced.** AI suppresses a reconciliation_events firing (catches the exception, modifies tolerance, adjusts the verify_* call signature) rather than addressing the underlying divergence. Logged when operator detects post-merge.

4. **Behavior deviating from spec without ADR.** AI proposes a change that touches a locked decision (per Rule 6) without explicit human confirmation. Caught by operator review.

5. **Sentinel fallback re-introduction.** AI re-introduces a banned pattern per §11.8 in a refactor or new feature. CI grep catches this; the AI behavior is the failure mode.

6. **datetime.now() re-introduction in business logic.** Same pattern as #5 but for §11.9 ban.

7. **Replay-test PASS forged or skipped.** AI claims replay-test PASS without running, or skips replay-test where required by §11.10.4. Logged when operator detects.

**Capture protocol:** for each observed failure mode, append an entry to `docs/ai-failure-modes.md` with:

- `ts` — UTC timestamp
- `category` — one of the 7 categories above (or NEW if novel)
- `pr_ref` — PR or change reference
- `ai_tool` — which AI tool surfaced the failure (executor, supervisor, both)
- `description` — what was attempted, what failed
- `detection_path` — how the failure was caught (CI / reconciliation engine / operator review / post-merge)
- `resolution` — corrective action taken (revert / patch / discipline reinforcement)
- `pattern_signal` — whether this failure indicates a structural pattern requiring spec or rule update

**Quarterly review cadence:** the operator reviews `docs/ai-failure-modes.md` quarterly per §12.8 documentation review cadence. Review questions:

- Are any failure categories occurring more frequently than baseline (>3× quarterly rate)?
- Do any patterns indicate a §12.5 rule needs strengthening?
- Do any patterns indicate a §11.0 verify_* call is misclassified?
- Should any new failure category be added to the canonical list?

**Quarterly review output:** an ADR entry per §12.6 documenting findings and any rule updates. ADRs go to `docs/decisions/`; the `docs/ai-failure-modes.md` document itself is the operational log, not the decision record.

---

## §16 Decisions deferred to v2 / future versions *(v0.8 baseline + v0.9 additions per Response 3 R3.4 Update 8 + Part 2c forward-tracking item 5)*

The following were considered for v1 but explicitly deferred:

**v0.8 baseline (unchanged):**

- **Dual-criterion exit with passive holds.**
- **Beta-balanced rather than dollar-balanced neutrality.**
- **Index hedge overlay.**
- **Book-count-aware entry rule.**
- **Leverage / margin construction.** Largest single ROI lever; doubles returns and drawdowns. Deferred until v1 validates alpha at 1x.
- **Drawdown-triggered position trim.**
- **Universe expansion to S&P 600 SmallCap.**
- **Secondary-offering / lockup-expiration exclusions.**
- **Going-concern and SEC-investigation explicit exclusions.**
- **Quality factor signal.**
- **Tier-explicit signals.**
- **AI-based dynamic signal weighting.**
- **Regime-conditional combiner weights.**
- **Narrow LLM-based news classification layer.**
- **Premium-weighted options flow with IV context.**
- **Event-deduplication for news sentiment.**
- **LLM-based catalyst classification.**
- **Multi-horizon training labels.**
- **Custom uniform top-k loss.**
- **Confidence-weighted entry.** *(also reaffirmed v0.9 — v1 uses binary rank threshold per §6.4)*
- **QP-based long-short sector matching.** Rejected as alpha-destructive.
- **Trailing stop on longs.** Phase 0 backtest validates whether this would improve Sharpe.
- **Per-signal-family order timeout architecture.** Tie order timeouts to driving signal's half-life via SHAP attribution. *(v0.9: confirmed v2-deferred per Part 2c forward-tracking item 5; v1 uses uniform Phase 2 escalation per §8.6.2.)*
- **Asymmetric cancel-vs-escalate behavior on order timeouts.** Coupled with per-signal timeout architecture. *(v0.9: confirmed v2-deferred per Part 2c forward-tracking item 5.)*
- **TTS qualification and §475(f) mark-to-market election.** Tax optimization deferred until deployed capital scales meaningfully.
- **Parallel uncorrelated strategies.** Strongest non-leveraged ROI lever; considered after Crosswind reaches Phase 7+. Candidates include SPX premium selling, crypto statistical arbitrage, futures trend.
- **Multi-user / multi-instance deployment.** v1 architecture preserves optionality (§9.7); actual multi-user features deferred.

**v0.9 additions (per Response 3 R3.4 Update 8) — 3 net-new bullets + 2 existing-bullet cross-references:**

- **Third "verifier AI" with isolated context.** Per §11.0 architectural rationale: executor + supervisor share blind spots; a third verifier-AI with isolated context (no shared codebase access, no shared chat history) could provide independent verification. Deferred to v2 once operator manual verification becomes binding constraint (currently operator is the third verifier per §11.0.12.5; if operator capacity is saturated by ambiguous-case backstop role, a third AI could absorb the load).

- **Full raw-API-response capture in replay framework.** v0.9 replay framework (§11.10) captures decision inputs (rankings, position-mutation events, lot records, reconciliation_events) sufficient for replay-test PASS comparison. Raw upstream API responses (Polygon raw payloads, Alpaca raw JSON for every poll) are not captured in v0.9 to keep storage costs bounded. Deferred to v2: raw API capture added incrementally in Phase 2 sub-phases and Phase 6 per §10.6/§10.10. Justification for v0.9 scope: decision-input capture is sufficient for replay determinism; raw payload capture is necessary only for upstream-defect investigation (which is rare and operator-driven, not routine).

- **Specific-identification lot policy.** v1 locks FIFO per §7.4 (with V1 UUID + tiebreaker per Part 2b). Specific-identification (operator chooses which lots to close for tax optimization) deferred to v2. Justification: specific-identification reduces reconciliation noise against Alpaca's default behavior, but the operational and tax-tracking complexity is materially higher; not justified until §475(f) election deferral resolves.

- **Per-signal-family order timeout architecture (cross-reference to v0.8 baseline bullet):** see v0.8 baseline bullet above for full wording; v2-deferred per Part 2c forward-tracking item 5 resolution. Confirmed v2-deferred in v0.9; v1 uses uniform Phase 2 escalation per §8.6.2.

- **Confidence-weighted entry (cross-reference to v0.8 baseline bullet):** see v0.8 baseline bullet above for full wording; v1 uses binary rank threshold per §6.4 long top-15 + short bottom-15. Reaffirmed v2-deferred in v0.9.

---

## §17 Document conventions *(v0.8 baseline + minor v0.9 update)*

- **Locked decisions** are recorded with rationale. Changes require explicit revision and dating.
- **Open questions** are flagged so they are not silently forgotten.
- **Deferred features** are documented so the reasoning is preserved if revisited later.
- This document is the single source of truth for what Crosswind is. If implementation diverges from this document, either the implementation is wrong or this document needs revision — never silent drift.
- **(NEW v0.9)** **V-flag discipline** for symmetric verification: when operator scope description and canonical transcript disagree during spec consolidation, divergences are surfaced as V-flag items rather than silently imported/dropped. Operator commitment moments are cited explicitly when canonical content is superseded. The compact-summary + cross-reference pattern (single source of truth at canonical location; compact summaries at application points; asymmetric application annotations at application points only) applies to specifications appearing at multiple boundaries (e.g., R3-R1 outcome classification at §10.4 / §10.11 / §10.12; sustained-anomaly kill condition at §11.6 / §10.13).

---

## §18 Revision history *(v0.8 baseline + v0.9 comprehensive entry)*

- **v0.1** — Initial specification covering project identity (§0), strategy concept (§1), and high-level rationale (§2).
- **v0.2** — Added §3 Universe definition and §4 Signal stack architecture.
- **v0.3** — Locked §3.3 Hard exclusions with trading-day calendar discipline.
- **v0.4** — Dropped quality signal; signal count revised from 10 to 9. Added §4.3 cross-cutting decisions. Specified four signals.
- **v0.5** — Locked architectural principle: act on information with bounded latency, exponential decay. Locked remaining five signal specs. §4 fully locked.
- **v0.6** — Locked §6 Modeling approach (LightGBM lambdarank, two models, continuous winsorized labels, weekly retrain, walk-forward validation, inline inference). Added §11 Quality/Observability/Operational Discipline. Added §12 Documentation and Development Discipline.
- **v0.7** — Locked §7 Portfolio construction (33% per-sector cap with within-sector universe-rank comparison; 8% per-name concentration; 15% stop on shorts only; no take-profit). Locked §8 Execution mechanics (Alpaca primary, marketable limit orders, asymmetric persistence, bounded slippage escalation by trade type). Reversed §1.4 universal 31-day re-entry block to **conditional** on losing exits only with retroactive wash sale handling. Updated strategy identity from "market-neutral" to "dollar-neutral" reflecting that strict sector neutrality is not enforced.
- **v0.8** — Locked §9 Cost model with capital-agnostic framing throughout. Revised §2.1 expected return distribution upward (probability-weighted 10-14% net) reflecting small-capital concentration advantage and corrected fixed-cost estimates. Recurring costs revised from $1,500-2,500/mo to $165-345/mo (most data subscriptions are sunk costs). Capital breakeven dropped to ~$35K. Added §9.7 multi-user / multi-instance deployment considerations. Locked §10 Phase plan with restructured 10-phase architecture: Phase 0 (infrastructure on provided foundation), Phase 1 (universe), Phase 2 (signal stack, 9 sub-phases), Phase 3 (combiner), Phase 4 (portfolio construction), Phase 5 (execution), Phase 6 (integration), Phase 7 (paper trading $100K), Phase 8 (small live operational validation), Phase 9 (scaled deployment). AI-accelerated build phases compressed to 6-10 months; validation phases require calendar time (12-22 months total to scaled deployment). Added §10.13 ROI levers and constraints; §10.14 anti-patterns to avoid. Retrofitted §1.5 and §8 worked examples to capital-agnostic framing. Updated §16 deferred list with TTS/§475(f), parallel strategies, multi-user deployment.

- **v0.9** — Foundational reconciliation layer architecture. Comprehensive structural additions and revisions reflecting operational lessons from a related options-trading system (April-May 2026). v0.9 captures 16+ architectural commitments:

  1. **Phase 0 split into Phase 0A + Phase 0B** (§10.3 / §10.4) with Phase 0B explicitly building reconciliation engine + replay framework + evidence-workflow tooling before any business logic. C1 timeline math propagation correction (Part 3a V1 Option B): total elapsed time to scaled deployment is **14-25 months at planning numbers; V1 contingency to 16-27 months** if Phase 0B extends to 11-12 weeks (was 12-22 months in v0.8).

  2. **Reconciliation engine** (§11.0 NEW v0.9 foundational quality layer) with seventeen `verify_*` interfaces across sixteen capability domains (after Part 2b interstitial adds #15 `verify_lot_record` / #16 `verify_wash_sale_record` / #17 `verify_rebalance_aggregate` to Text [25] REVISED's fourteen interfaces); single `reconciliation_events` table per §11.0.10 with R7 outcome enum extended to include `expected_divergence_handled`; per-call-class tolerance discipline (Zero-tolerance / Low-tolerance / Noise-tolerant) per §11.0.9 with magnitude escalation override per R7; expected-divergence-aware annotation per R7 for #8 `verify_borrow_persistence` / #11 `verify_corporate_action_clean` / #12 `verify_settlement_status`; Phase 0B exit gate per §11.0.11 with R3-R1 outcome classification (compact-summary discipline established Part 3b applied at §11.0.11).

  3. **Two-phase order lifecycle state machine** (Part 2c §8.6 NEW STRUCTURE supersedes v0.8 §8.6/§8.7 baseline): Phase 1 (Acceptance) tri-state `verify_order_acceptance`; Phase 2 (Fill monitoring) with v0.7-locked escalation thresholds (entry 30s→50bps→cancel; rank-exit 30s→100bps→200bps→exit_pending; short stop 30s→200bps→market) preserved in §8.6.2; trade-type-specific Phase 1 timeouts per §8.6.1.1 (entry/rank-exit 10s+60s; short stop 5s+15s); short-stop parallel-order mechanism via different order IDs with v0 fallback determination per Phase 0B per §8.6.1.1.

  4. **Option E missing-data architecture** (§4.3.5 + §6.5 + §6.5.6): `Optional[Decimal]` type discipline + `Decimal('-999')` sentinel value introduced at exactly one place (feature-vector construction layer); per-signal missingness profile capture (§6.5.3); count-normalized-average degraded fallback (§6.4 supersedes v0.8 equally-weighted simple linear combination); Phase 3 missingness stress test gate (§6.5.4) with 75% masking + tolerance band per Part 3a V2.

  5. **FIFO lot policy with V1 UUID + tiebreaker** (§7.4 per Part 2b V1 Pass 3 lock): `lot_id` is globally unique UUID; FIFO tiebreaker `(entry_ts ASC, lot_id ASC)` for replay-test PASS comparison determinism (per §11.10.4).

  6. **Wash sale Path A/B branching** (§7.7 per Part 2b) + **retroactive cost-basis adjustment with broader detection** (§7.8 per Part 2b R1) + **trim-loss handling** (§7.9 per Part 2b R2) including `trim_wash_sale_pending_review` set for Path B trim-loss reconciliation failures.

  7. **SSR routing strictly above NBB** per Reg SHO 201 (Part 2c §8.2 v0.9 supplement): `max(default_sell_price, NBB + 1¢)` formula; TIF=DAY explicit; 5¢ buffer for $500+ stocks.

  8. **Broker rejection propagation to §7 caches** (Part 2c §8.9): full failure-action table for `halted` / `htb` / `ssr_violation` / `insufficient_buying_power` / `pdt_block` / `other` rejection reasons with cache update + reconciliation_events emission; `failure_handled` vs `system_bug` outcome classification; race-condition refinement for `ssr_violation`.

  9. **Phase 9 sustained-anomaly kill condition** (§11.6 v0.9 expansion per Part 4a forward-tracking item 11 resolution): >3× baseline for 7+ consecutive RTH days excluding `expected_divergence_handled` and `false_positive_within_tolerance` outcomes; Level 1 soft pause escalation; A1 baseline cross-reference to §10.4 Phase 0B baseline aggregation infrastructure. (Part 3b §10.13 inline specification becomes compact-summary + §11.6 cross-reference at v0.9 final assembly per forward-tracking item 12.)

  10. **Multi-instance schema discipline** ((`operator_id`, ...) keying per §9.7): all v0.9 tables (`positions`, `lots`, `wash_sale_events`, `reconciliation_events`, `evidence_bypass_log`) keyed by `(operator_id, ...)` preserving multi-user / multi-instance optionality.

  11. **R3-R1 outcome classification symmetric application** (§10.4 canonical; §10.11 / §10.12 / §11.0.11 compact-summary + cross-reference per V1 Option C / V2 Option C discipline established Part 3b): firings count when `system_bug` unresolved / `failure_handled` requiring operator-bespoke intervention beyond standard runbook / `failure_escalated` unresolved; firings don't count when `false_positive_within_tolerance` / `expected_divergence_handled` / `failure_handled` via standard runbook / `failure_escalated` resolving to documented real-world divergence; operator-intervention qualifier: runbook-driven action expected; operator-bespoke debugging signals bug.

  12. **R3-R2 asymmetric quietness criteria principle** (§10.16): Phase 0B exits on captured-day root-causing (single day, every firing accounted for); Phase 7/8 exit on 30-RTH-day rolling steady-state (Phase 8 measurement is POST-CALIBRATION per V2 asymmetric application point). Root-cause discipline identical at every boundary; time-window scales with operational regime being validated.

  13. **Evidence-tier discipline expansion** (§12.5 Rules 8/9/10 + §12.5.1 evidence hierarchy table NEW v0.9): Strong+/Strong/Medium/Weak tiers with per-tier evidence artifact requirements (replay-test PASS + reconciliation telemetry zero-bug-firings + ground-truth spot-check); CI enforcement; `[bypass-evidence-tier]` operator override with `evidence_bypass_log` audit table + 48-hour retroactive-attachment requirement; AI failure-mode logging (§12.10 NEW) with 7 failure categories + capture protocol + quarterly review cadence.

  14. **Phase 0B exit gate operational discipline** (§11.0.11 inline specification) + reconciliation quietness as primary exit criterion at all phase boundaries (§10.16 phase plan principle): no zero-firings criterion; every firing root-caused (false positive with ADR / real-world divergence handled / system bug fixed before phase exit); R3-R1 outcome classification applied symmetrically at Phase 0B exit + Phase 7 Gate 2 + Phase 8 Gate 2 post-calibration.

  15. **Missingness profile capture** (§6.5.3) + Phase 3 missingness stress test exit gate (§6.5.4) + monthly refresh during Phase 7 per §6.5.3.3 (or drift-triggered).

  16. **Banned-pattern linting (§11.8 sentinel fallback ban) + datetime.now() in business logic ban (§11.9) + replay framework with §11.10.4 replay-test PASS comparison (§11.10 NEW v0.9)** with ruff config + CI grep enforcement per V3 Option A discipline; <15-minute wall-clock target for replay-test PASS production per §10.4 evidence-workflow tooling.

  **Companion documents added in v0.9:**

  - `docs/decisions/ADR-001-reconciliation-architecture.md` (Part 5 deliverable in this consolidation sequence)
  - `docs/decisions/spec-source-index.md` (Part 6 deliverable in this consolidation sequence)
  - `docs/banned_patterns.md` (per §11.8 auditability discipline; canonical banned-pattern list + override registry; named CI script reference per Part 4a V3 implementation footnote)
  - `docs/ai-failure-modes.md` (per §12.10 operational logging discipline)

  **Sections substantially revised in this version:**

  - §4.3 (Missing-data behavior — Option E architecture with `Optional[Decimal]` type discipline + `Decimal('-999')` sentinel + single-introduction-layer)
  - §6 (Modeling approach — count-normalized fallback per §6.4; missingness profile per §6.5)
  - §7 (Reconciliation sequences per §7.4-§7.13; FIFO UUID lot policy; wash-sale Path A/B + retroactive + trim-loss)
  - §8 (Two-phase state machine per §8.6 NEW STRUCTURE; SSR routing strictly above NBB; broker rejection propagation)
  - §10 (Phase 0A/0B split; Phase 7 dual exit gate; Phase 8 calibration window + dual exit gate post-calibration; Phase 9 sustained-anomaly kill; ROI levers honest dual-sided framing; anti-patterns 8 v0.9 + 3 inherited; phase plan principles + R2 + C1 timeline acknowledgment)
  - §11 (§11.0 NEW foundational reconciliation; §11.1/§11.2 v0.8 baseline with v0.9 preambles; §11.6 sustained-anomaly expansion; §11.8/§11.9/§11.10 NEW)
  - §12 (§12.5 Rules 8/9/10 expansion + §12.5.1 evidence hierarchy table; §12.10 AI failure-mode logging NEW)

  **Previous version:** v0.8 (locked §9 cost model capital-agnostic; §10 phase plan 10-phase structure).

---

---

**End of CROSSWIND_SPEC.md v0.9.** Companion documents: `docs/decisions/ADR-001-reconciliation-architecture.md` and `docs/decisions/spec-source-index.md`. Consolidation audit trail preserved in `docs/CROSSWIND_SPEC_consolidation_journal.md` (8-part v0.9 consolidation sequence with V-flag history).
