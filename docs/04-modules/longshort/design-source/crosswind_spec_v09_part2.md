# CROSSWIND_SPEC.md — Part 2 (§6 through §9)

*Part 2 of 10 consolidation responses. Part 2 covers §6 modeling, §7.1-§7.3 portfolio construction (v0.8 baseline), §8.1-§8.7 execution mechanics (v0.8 baseline), §9 cost model. Parts 2b and 2c cover §7.4-§7.12 and §8.X v0.9 architectural additions respectively. Parts 1, 3, 4 cover other CROSSWIND_SPEC sections; Parts 5–6 cover companion documents.*

---

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

*[End of Part 2 — §6 through §9. v0.8 baseline + §6.1/§6.4/§6.5 v0.9 deltas. §7 and §8 v0.9 architectural additions confirmed via Option A; Part 2b (§7.4-§7.12) and Part 2c (§8.X) follow as separate consolidation responses.]*
