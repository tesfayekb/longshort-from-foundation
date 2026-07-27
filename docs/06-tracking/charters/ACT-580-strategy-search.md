# Charter ACT-580 — SYSTEMATIC STRATEGY SEARCH (Phase-0 design)

**Filed:** 2026-07-26 • **Class:** Multi-family research charter • **Owner:** operator
**Sequence:** runs BEHIND the options month in priority. **Phase-0 (this document) = design-only, zero data queries.** Phase-1 first computes await explicit operator GO after the options data pull is running.
**Substrate:** existing sealed cache + platform tables (external Supabase). No new ingestion in Phase-0.
**Kernel/orchestrator pattern:** each family Phase-1 executes on the **certified** ACT-515 kernel + orchestrator patterns (session-walk, cap arithmetic, haircutMode='study', ledger-foot envelope assertion, FixedClock, sealed-cache + parity harness).

## §1 — Multiple-comparison law (verbatim, pre-committed)

> k families tested ⇒ surviving p-value bar tightens; a lone marginal pass among eight is presumed noise.

**Operationalization:**
- Family gate (per-family, pre-registered): **net CAGR ≥ 15% ∧ Sharpe ≥ 1.0 ∧ maxDD ≤ 1.5×CAGR ∧ ≥ 300 trades** — over the BUILD window (2022-01 → 2025-12).
- Multiple-comparison discount: with k=8 families, a family clearing the gate on the build window must ALSO clear the same gate on the **locked 2026 holdout** (see §3) with margin ≥ 3pp on CAGR and ≥ 0.15 on Sharpe. A single-margin pass is presumed noise and requires a second orthogonal replication (different universe slice OR different cost model) to survive.
- A lone family clearing build only (no holdout) is presumed noise; NO write-up as a live candidate.

## §2 — Universe (FROZEN)

- **Composite universe of 905** (ACT-571 output, sealed): identical to the ACT-515 R1 substrate.
- Universe honesty pin: build-time membership derived from ACT-571 composite tables; NO look-ahead survivorship correction beyond what ACT-571 already applies.
- Family-level filters (e.g., "has consensus estimate row on event date") are ALLOWED and MUST be declared in the family spec's data-gap audit (§5).

## §3 — Windows (FROZEN)

- **Build window:** 2022-01-01 → 2025-12-31 (4 calendar years). All signal construction, hyperparameter selection, cost calibration, and eligibility scoring occur on this window.
- **Locked 2026 holdout:** 2026-01-01 → PRESENT (rolling). **ONE LOOK PER SURVIVOR.** Every touch logged as an ACT row (evidence: query hash + timestamp + operator co-sign). Zero re-optimization after holdout look.
- Cross-family holdout budget: each family gets ONE look regardless of ordering. If a family fails on holdout, it does not re-enter.

## §4 — Cost model (FROZEN)

Applied identically to all families in Phase-1:

- **Half-spread by ADV bucket** (2022-01 cutoff ADV percentiles, sealed):
  - ADV bucket A (top-quintile): 3 bps half-spread
  - ADV bucket B (2nd-quintile): 5 bps
  - ADV bucket C (3rd-quintile): 8 bps
  - ADV bucket D (4th-quintile): 12 bps
  - ADV bucket E (bottom-quintile): 20 bps
- **PLUS** ACT-506 measured slippage layer: 8 bps per side on entry, 6 bps per side on exit (session-walk empirical mean, sealed in `ACT-506-slippage-measurement.md`).
- **Total per round-trip:** 2 × half-spread + 14 bps slippage.
- Carry (short leg): existing ACT-515 short-carry formula (per DEC-081-v2), if the family holds shorts.

## §5 — Eight families S1–S8 (FROZEN signal definitions)

All specs cite REAL tables/columns from this project's external Supabase schema. Where a required column is missing, a **PRE-REGISTERED FALLBACK** is stated BEFORE Phase-1 first query.

### S1 — PEAD (Post-Earnings-Announcement Drift)

- **Signal:** earnings surprise on announcement date.
  - **Primary spec (if consensus-estimate column exists):** `surprise = (actual_eps − consensus_eps) / |consensus_eps|` from `public.overshoot_earnings_calendar` (columns TBD in data-gap audit).
  - **PRE-REGISTERED FALLBACK (if no consensus column):** revision-direction surprise = sign-weighted count of net analyst estimate revisions in the [−30, −1] session window prior to announcement, from `public.overshoot_analyst_actions` (columns: `action_date`, `action_type ∈ {upgrade, downgrade, price_target_raise, price_target_lower}`, `ticker`).
- **Entry:** T+1 open post-announcement.
- **Hold:** 20 sessions.
- **Portfolio:** decile long-short (top-decile surprise long, bottom-decile short), equal-weighted within decile, rebalanced daily as new announcements arrive.
- **Universe:** 905 composite; requires `overshoot_earnings_calendar` row on event date.
- **Data-gap audit item:** confirm consensus-estimate field presence in `overshoot_earnings_calendar` (Phase-1 first query is a schema check, not a return computation).

### S2 — Analyst-revision momentum

- **Signal:** rolling net analyst-revision score = `Σ(upgrades − downgrades + 0.5·(price_target_raise − price_target_lower))` over trailing 30 sessions, from `public.overshoot_analyst_actions`.
- **Entry:** T+1 open following score-rank recomputation (weekly, Monday open).
- **Hold:** 20 sessions with weekly rebalance overlay.
- **Portfolio:** decile long-short on score.
- **Universe:** 905; requires ≥ 3 analyst actions in trailing 30d.
- **Data-gap audit item:** none (own data).

### S3 — SI-delta factor

- **Signal:** short-interest delta = `SI_pct_t − SI_pct_{t−14sessions}` from `public.finra_short_interest` (bimonthly FINRA cadence, forward-filled per ACT-570 Phase-1).
- **Entry:** T+1 open after new SI report ingestion (14th/28th monthly).
- **Hold:** 14 sessions (until next SI report).
- **Portfolio:** decile long-short on ΔSI (rising SI short, falling SI long — the mean-reversion prior).
- **Universe:** 905 ∩ has SI coverage (per ACT-570 Phase-1 output — ~99.6% at DEV-7 close).
- **Data-gap audit item:** confirm forward-fill window; confirm ACT-570 Phase-1 columns landed.

### S4 — Overnight (close-to-open) factor

- **Signal:** trailing 60-session overnight-return mean per ticker, from sealed bars.
- **Entry:** last 15 min of session (proxied by session-close in study — will require intraday cache in Phase-1 if intraday is not available; PRE-REGISTERED FALLBACK: use close-price proxy with a −5 bps additional cost).
- **Hold:** overnight only (exit next open).
- **Portfolio:** decile long-short on trailing overnight mean.
- **Universe:** 905 ∩ bars-pairs coverage.
- **Data-gap audit item:** intraday last-15-min not in sealed cache; fallback pre-registered.

### S5 — Trend-chassis (12-1 momentum)

- **Signal:** 12-month return excluding last month, per ticker, monthly rebalance.
- **Entry:** T+1 open of first session of month.
- **Hold:** 1 calendar month.
- **Portfolio:** decile long-short on 12-1.
- **Universe:** 905 ∩ ≥ 250 sessions of bar history.
- **Data-gap audit item:** none.

### S6 — Sector pairs

- **Signal:** cross-sectional ranking WITHIN GICS sector (from `public.tickers.gics_sector`, added via `sql/44`) of trailing 5-day residual return after regressing on sector-mean return.
- **Entry:** T+1 open on rebalance day (weekly).
- **Hold:** 5 sessions.
- **Portfolio:** long-short within-sector deciles, sector-neutralized book.
- **Universe:** 905 ∩ non-null GICS sector.
- **Data-gap audit item:** confirm GICS coverage (added via `sql/44`, spot-check needed).

### S7 — VRP-in-options-month

- **Signal:** volatility-risk-premium proxy = 30d realized vol vs implied vol.
- **Requires options data** — HARD DEPENDENCY on Polygon Options subscribe (path (i) of ACT-577 amendment).
- **Status:** SPEC-LOCKED, EXECUTION-DEFERRED until options data lands.
- **Data-gap audit item:** ENTIRE FAMILY BLOCKED on options month.

### S8 — Index-events (S&P 500 / Russell rebalance)

- **Signal:** long additions, short deletions on announcement date; hold through effective date + 5 sessions.
- **Data-gap audit item:** NO index-membership-events table exists in current schema. Building requires historical S&P Dow Jones / FTSE Russell announcements — modest external ingest (est. 2-4 hrs).
- **Status:** DEFERRED — enters queue after S1..S3 receipts, subject to operator GO on the ingest cost.

## §6 — Data-gap audit (Phase-0 output — actionable)

| family | gap | cost to fill | pre-registered fallback | Phase-1 blocker? |
|---|---|---|---|:---:|
| S1 | consensus-estimate column presence uncertain in `overshoot_earnings_calendar` | schema check (1 query) | revision-direction surprise via `overshoot_analyst_actions` | NO |
| S2 | none | — | — | NO |
| S3 | ACT-570 Phase-1 forward-fill columns need spot-check | schema check (1 query) | tighten to 7-session forward-fill window | NO |
| S4 | intraday last-15-min not sealed | out of Phase-0 scope | close-price proxy + 5 bps cost adder | NO |
| S5 | none | — | — | NO |
| S6 | GICS coverage post-`sql/44` needs spot-check | schema check (1 query) | drop tickers with null sector | NO |
| S7 | options data absent | Polygon $79/mo (operator gate) | — | **YES** |
| S8 | index-events table absent | 2-4 hr external ingest | — | **YES (queued)** |

## §7 — Execution order (Phase-1 receipts, when operator GO fires)

1. **S1 PEAD** — strongest prior × owned data.
2. **S2 Analyst-revision momentum** — owned data, orthogonal signal to S1.
3. **S3 SI-delta** — owned data (post ACT-570 Phase-1), orthogonal to earnings/analyst.
4. S4 Overnight — owned data with cost-adder fallback.
5. S5 Trend-chassis — owned data, classical benchmark.
6. S6 Sector pairs — owned data, sector-neutralized comparator.
7. S7 VRP — awaits options month.
8. S8 Index-events — awaits ingest GO.

**Cadence:** ONE family per receipt turn. Kernel and orchestrator untouched between families (variant hooks are family-scoped).

## §8 — Per-family receipt format (pre-committed)

Each family Phase-1 receipt MUST contain:

1. Signal coverage counts (universe intersect; drop reasons).
2. Decile construction table (n per decile per rebalance date).
3. Long-short net returns by year (build window).
4. Frozen columns: CAGR, Sharpe, Sortino, maxDD, worst-year, turnover, avg lots per rebalance, cost-drag bps.
5. Gate verdict PASS/TEXTURE/FAIL with the four clauses stamped.
6. Chains verbatim (baselines, cost model, universe, sealed SHAs).
7. If PASS on build: register the ONE-LOOK holdout query, submit for co-sign, execute, log outcome.

## §9 — Register rows (lane + families)

To be added to `docs/06-tracking/register.md` at charter-land time:

```
ACT-580        SYSTEMATIC STRATEGY SEARCH (lane)                  Phase-0-design-only
ACT-580.S1     PEAD                                                PHASE-0-SPEC-LOCKED
ACT-580.S2     Analyst-revision momentum                           PHASE-0-SPEC-LOCKED
ACT-580.S3     SI-delta factor                                     PHASE-0-SPEC-LOCKED
ACT-580.S4     Overnight factor                                    PHASE-0-SPEC-LOCKED
ACT-580.S5     Trend-chassis (12-1 + SPY200 overlay)               PHASE-1-COMPLETE (TEXTURE — primary LS fails; regime overlay strictly worse; long-only D10 derived-subset would clear build gate — filed as observation, not verdict)
ACT-580.S6     Sector pairs (within-sector 5-day residual, weekly LS)  PHASE-1-COMPLETE / TEXTURE-AT-BUILD / HOLDOUT-LOCKED — k=10 consumed (receipt: ACT-580-S6-PAIRS.md; net -76.67% / CAGR -30.50% / Sharpe -3.05; cost-annihilated: gross +3.5 bps/wk vs 76 bps/wk toll)
ACT-580.S7     VRP-in-options-month                                PHASE-0-BLOCKED (options)
ACT-580.S8     Index-events                                        PHASE-0-DEFERRED (ingest)
ACT-580.S9     SECTOR MEAN-REVERSION + ROTATION (sub-lane)         PHASE-0-SPEC-LOCKED (charter: ACT-580-S9-sector-mean-reversion.md; pre-registered 2026-07-26 with S5 GO)
ACT-580.S9-a   Sector dip-buy (composite RSI(2)<10, long-only)     PHASE-1-COMPLETE / TEXTURE-AT-BUILD / HOLDOUT-LOCKED — k=7 consumed (receipt: ACT-580-S9a-SECTOR-DIP-BUY.md; build net -9.84% / Sharpe -0.11 / maxDD -25.94%)
ACT-580.S9-b   Sector rotation (top-3 6mo return, monthly, long-only)  PHASE-1-COMPLETE / TEXTURE-AT-BUILD / HOLDOUT-LOCKED — k=11 consumed (receipt: ACT-580-S9b-SECTOR-ROTATION.md; net +17.83% / CAGR +4.19% / Sharpe +0.310 / maxDD −17.14% / worst-year 2022 −6.31%; turnover 1.21 swaps/mo → 184 bps/yr toll — affordable-but-insufficient-Sharpe)
ACT-580.S9-c   Sector intraday leg                                 DEFERRED-TYPED (unblocks on data purchase IF S9-a/b PASS)
ACT-580.S10-BACKFILL  Signal-ranked winners on PRICE-DERIVED signals only (historical build) DORMANT / OPERATOR-GATED — filed 2026-07-26 after S10' HALT-AT-STEP-A; unblocks only on explicit operator GO with a pre-registered price-derived-only signal roster
ACT-580.S10-FORWARD   Signal-ranked winners re-test on LIVE signal_observations (S10' spec verbatim) AUTO-REMINDER 2027-07-01 — unblocks when signal_observations shows ≥12 continuous months of dense coverage on the build-eligible substrate; k-cost recharted at unblock
```

## §10 — Interaction with ACT-577 amendment

An ACT-580 family PASS (build + locked 2026 holdout, per §1 multiple-comparison law) satisfies **path (ii)** of the ACT-577 §5.1 amendment. It does NOT waive rows G-1..G-9 of ACT-577 §5 (operational gates); it provides the substrate-eligibility that G-rows presuppose.

**End Phase-0.** No data queries executed in this document. Phase-1 first computes await operator GO after options data pull is running.

## §11 — Findings (running, appended by Phase-1 receipts)

### UNIFIED-PHYSICS NOTE (filed after S1-b close, before S4 open)

> Five independent substrates — the R1 walk (equity lane), ACT-570 Q5 continuation study, ACT-573 refused-winners forensics, S1/S1-b miss-wing analysis, and S3 ΔSI decile inversion — agree: **long-side bounce is real, short-side is structurally punished in this universe/era.** All remaining ACT-580 family tests weight the long expression when a symmetric spec is optional; symmetric specs remain scored as-charter but the reading is applied on receipt.

Cross-reference: S3 texture verdict (fails CAGR + worst-year + every-year net) is noted per the reversal law as texture-only and physically consistent with ACT-570 Q5's continuation finding (same-direction: shorts-piling names kept running in the bull tape).

### UNIFIED-PHYSICS UPDATE (filed at S5 close, 2026-07-26)

> Sixth substrate: S5 Trend-chassis. LS-symmetric 12-1 momentum: net −12.06% / CAGR −3.78% / Sharpe −0.12 (TEXTURE). Long-only D10 (derived-subset, not a family PASS): net +96.08% / CAGR +22.39% / Sharpe +1.03. Same asymmetry — the short wing (D1, low-momentum names) crushed the LS book in 2023 (D1 ran hard), while D10 was materially positive every single year. **Six-for-six substrate agreement.** All ACT-580 remaining families default to long-only expression at charter time (S9-a and S9-b pre-registered this turn are already long-only per the law).

### REGIME-OVERLAY META-FINDING (filed at S5 close)

> SPY 200-SMA regime overlay applied to 12-1 momentum in this small/mid substrate is **strictly worse than bare** — clips more upside than downside in both LS-symmetric and long-only constructions (LS: −12.06% → −10.02%; long-only: +96.08% → +39.52%). Physics: momentum re-emerges inside SPY drawdowns as D1 crashes and D10 rebounds; gating those months out is anti-additive. **Battery-level policy:** presume aggregate-market-trend regime overlays are cost-additive-with-no-alpha-additive unless the family's substrate specifically motivates the overlay.

### S10' HALT-AT-STEP-A (filed 2026-07-26)

> Signal-ranked winners audit found **0 of 11** longshort-lane signals dense on the 2022-01→2025-12 build window; all rows in `signal_observations` cluster in a ~6-week 2026 window entirely inside the SPENT momentum-family holdout. Per S10' frozen spec ("if <3 qualify, STOP"), Step-B construction was not executed. k=10 consumed-by-halt. Two futures filed as register rows: **S10-BACKFILL** (price-derived-only signals, historical build; dormant, operator-gated) and **S10-FORWARD** (re-test when ≥12mo of live `signal_observations` accrue; auto-reminder ~2027-07-01).

### S9-a TEXTURE (filed 2026-07-26)

> S9-a sector dip-buy (composite RSI(2)<10 → 5-day long-only sector-portfolio hold, 38 bps toll): build 2022–25 net **−9.84% / CAGR −2.55% / Sharpe −0.11 / maxDD −25.94%**, 1,368 baskets. 3/4 gate clauses fail; holdout LOCKED per charter §8. Per-trigger gross edge (+27.7 bps wtd) is below the 38 bps toll — the cost-annihilation showcase pattern from S4 reproduces here. Robustness: substituted equal-weight-all-members proxy for the charter's top-10-ADV basket (D-1 disclosed); top-10 refinement filed as texture-only follow-up `S9-a-basket-refinement`, no k-cost. Ledger: 7/N families TEXTURE; S5-L survivor holds via consumed co-sign. Full receipt: `docs/06-tracking/receipts/ACT-580-S9a-SECTOR-DIP-BUY.md`.

### S6 TEXTURE — cost-annihilated (filed 2026-07-26)

> S6 within-sector 5-day residual, weekly LS deciles across 11 GICS sectors, sector-neutral by construction: build 2022–25 net **−76.67% / CAGR −30.50% / Sharpe −3.05 / maxDD ≤ −77%**, 32,107 legs. All 6 gate clauses fail. Cost arithmetic (verbatim): gross edge +3.5 bps/wk vs 76 bps/wk toll (2 baskets × 38 bps RT weekly) → net −72.5 bps/wk. The residual is real and small; the sector-neutralization strips the directional long-side bounce the six-substrate law says is where the money lives, and what remains cannot survive weekly turnover. **Unified-physics ledger** extended: long-decile and short-decile mean returns are within 3–8 bps/wk of each other in every build year — sector-neutral residuals lack directional persistence at 5 sessions in this universe/era. Ledger: **8/N families TEXTURE**; S5-L survivor holds. Full receipt: `docs/06-tracking/receipts/ACT-580-S6-PAIRS.md`.

### S9-b TEXTURE — affordable-but-insufficient-Sharpe (filed 2026-07-26)

> S9-b monthly top-3 sector rotation on trailing 6-mo composite return, long-only, 11 GICS composites: build 2022–25 net **+17.83% / CAGR +4.19% / Sharpe +0.310 / maxDD −17.14% / worst-year 2022 −6.31%**, 1,160 legs. 3/4 gate clauses fail (trade count PASS). Operator prediction ("~1–2 swaps/mo affordable") **CONFIRMED**: realized turnover 1.21 basket-swaps/month → cost drag 184 bps/yr — a tenth of S4 (3,952 bps/yr), a twentieth of S6. **Cost affordability is validated in both directions**: (a) monthly cadence really is affordable; (b) affordability alone does not manufacture edge — gross +64 bps/mo at sd 6.0% is a Sharpe-0.5-class phenomenon in this universe/era, insufficient for the tightened bar. 2022 drawdown (June 2022 −14.21%) is the classic momentum-crash-at-sector-level widow-maker (charter §11 disclosure lineage). Ledger: **9/N families TEXTURE**; only S5-L (12-1 momentum long-only D10) has cleared the bar in this substrate.

### §11.KL — K-LEDGER AUTHORITATIVE RECOUNT (filed 2026-07-26, folded from operator hygiene note; supersedes any prior k= stamps that drifted)

> Recount performed from the charter's own registration order (date pre-registered, not date executed). No verdict changes. Blocked / deferred / dormant rows do NOT consume k until unblocked-and-tested (per §1 multiple-comparison law). k = count of hypotheses actually tested (including HALT-AT-STEP-A, which consumed the pre-registration slot).
>
> | k | family | pre-registration order | executed | verdict |
> |---|---|---|---|---|
> | 1 | S1 PEAD (20-day LS) | charter §5 (filed 2026-07-26 with lane charter) | ✅ | TEXTURE |
> | 2 | S2 Analyst-revision momentum | charter §5 | ✅ | TEXTURE (negative-drift) |
> | 3 | S3 SI-delta factor | charter §5 | ✅ | TEXTURE (prior INVERTED) |
> | 4 | S1-b PEAD 5-day sign-portfolio | operator pre-reg post-S3, pre-S4 | ✅ | TEXTURE (miss-side reversal law confirmed) |
> | 5 | S4 Overnight harvest | charter §5 | ✅ | TEXTURE — cost-annihilated |
> | 6 | S5 Trend-chassis (12-1 LS + SPY200 overlay) | charter §5 | ✅ | TEXTURE (D10-long derived-subset spawned S5-L) |
> | 7 | S9-a Sector dip-buy (RSI(2)<10, long-only) | S9 charter pre-reg with S5 GO (2026-07-26) | ✅ | TEXTURE — cost-annihilated |
> | 8 | S5-L 12-1 long-only D10 promotion | pre-reg at S5 close (bar-tightened) | ✅ | **PASS build + PASS holdout (single-look co-sign consumed)** — survivor |
> | 9 | S10' Signal-ranked winners (operator-direct) | pre-reg immediately before execution | ✅ (HALT-AT-STEP-A) | HALT — 0/11 signals dense on build; k-slot consumed by halt |
> | 10 | S6 Sector pairs (within-sector 5-day residual, weekly LS) | charter §5 (registration order 6th) but executed after S10' halt | ✅ | TEXTURE — cost-annihilated |
> | 11 | S9-b Sector rotation (monthly top-3 6-mo, long-only) | S9 charter pre-reg with S5 GO (2026-07-26) | ✅ | TEXTURE — affordable-but-insufficient-Sharpe |
> | 12 | M-1 Recency refinement (D10-pool sub-rank: 3-1 top/bot, 6-1 top, blended top-45) | operator pre-reg 2026-07-27 | ✅ | NO-SHIP — operator hypothesis REJECTED; echo hypothesis (Novy-Marx stale-leg) CONFIRMED, +2pp gate not cleared |
> | 13 | M-3 Entry-construction ([F] overlapping-cohort daily-admit K=5 / [G] tranche-4 weekly cohorts) | ROI-improvement battery pre-reg 2026-07-27 | ✅ | NO-SHIP — both variants fail +2pp CAGR gate; timing-luck telemetry reduced but edge not manufactured |
> | 14 | M-4 Hold-length grid at [F] construction ({10, 21, 42, 63} sessions) | ROI-improvement battery pre-reg 2026-07-27 | ✅ | NO-SHIP — incumbent 21-session hold is the local optimum on this substrate |
> | 15 | M-5 Exit-overlay grid on incumbent A ({none, SL−10%, TP+15%, trail−10%, SL+TP}) | ROI-improvement battery pre-reg 2026-07-27 | ✅ | NO-SHIP — literature prior CONFIRMED: fixed stops chop out winners, TP caps upside; trailing least-worst but still negative |
> | 16 | M-6 Deployability variants ([H] sector-cap 25% / [I] ADV-floor top-60 / [J] H+I) | ROI-improvement battery pre-reg 2026-07-27 | ✅ | NO-SHIP — concentration telemetry improves, CAGR drag −0.8pp to −2.1pp; deployability tax is real but small |
>
> **Not counted (unblocked-and-untested):** S7 VRP-in-options-month (BLOCKED on Polygon Options data); S8 Index-events (DEFERRED on ingest); S9-c Sector intraday leg (DEFERRED-TYPED); S10-BACKFILL (DORMANT, operator-gated); S10-FORWARD (AUTO-REMINDER 2027-07-01).
>
> **k = 11 consumed at search-phase close. Refinement-class extensions (M-1, M-3..M-6) advance k to 16 by 2026-07-27. Survivor count = 1 (S5-L, unchanged).** Tightened bar (CAGR ≥ +18%, Sharpe ≥ +1.15 on holdout) continues to apply to any future promotion. Momentum holdout 2026 H1 is SPENT — every refinement receipt is build-window-only, and no refinement has cleared the ship-law +2pp bar.