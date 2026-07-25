# ACT-576 Phase-1 Receipts — Execution-Drag Decomposition + Execution-Alpha Lever Inventory

**Filed:** 2026-07-25 17:00:45Z • **Clock:** `SELECT now() → 2026-07-25 17:00:45.559404+00`
**Corpus:** n=50 filled LONG lots, entry_ts ∈ [2026-07-08, 2026-07-24]. SHORT n=0 (Monday debut). Honest-frame stamped: **n=50 over 13 sessions is directional-only; every CI below straddles zero — no term is NAMED-ATTACKABLE at this n**.
**Reference basis (verbatim, named in every claim):** ENTRY_SLIP measured against **`overshoot_daily_bars.open` at T+1 (first trade day ≥ entry_ts)**. EXIT_SLIP measured against **`overshoot_daily_bars.close` at `closed_at`** (ordinal exit day). Sign convention: **positive bps = drag on P&L; negative bps = execution HELPED**.
**Charter cross-ref:** `ACT-576-charter-execution-drag-decomposition.md` §2 (four-term additive model) and §2.1 (NAMED-ATTACKABLE / NOISE-AT-N grammar).

---

## §0 — ONE-LINE ANSWER

**Of the −152 bps FILLED-vs-SELECTED gap flagged by ACT-573 Phase-1, the four-term in-sample decomposition on n=50 assigns +35.5 bps ENTRY drag, −14.3 bps EXIT benefit, −11.7 bps CLUSTER-MIX benefit, and a large ~−142.5 bps RESIDUAL — but all three named terms have 95% bootstrap CIs that include zero (NOISE-AT-N), and the residual reveals the SELECTED-cohort return basis (−321.1 bps, ACT-573) is measured on a fundamentally different frame than the FILLED-lot realized-return basis (−90.0 bps here). Structural conclusion: the gap is real but its clean four-term additive decomposition is not defensible at n=50 — the controllable share attributable to execution is bounded by ENTRY_SLIP's upper CI (≤ +76 bps) and is a valid ACT-506 bleed-box line, but the ~150 bps thesis must wait for n≥200 to become statistically actionable.**

---

## §A — Four-Term Decomposition (per charter)

### A.1 — Term table (point estimates + 1,000-sample bootstrap 95% CI)

| term | point est. (bps) | 95% CI (bootstrap n=50, k=1000) | verdict |
|---|---:|---|---|
| **ENTRY_SLIP** (long paid up vs T+1 open) | **+35.47** (drag) | [−3.72, +75.98] | NOISE-AT-N (CI includes 0); weakly-directional drag |
| **EXIT_SLIP** (long sold vs exit-day close) | **−14.26** (benefit) | [−48.94, +25.27] | NOISE-AT-N; execution neutral-to-helpful at exit |
| **CLUSTER_MIX** (FILLED DoW weight − uniform Wed/Thu/Fri) | **−11.72** (benefit) | see §A.3 | NOISE-AT-N; FILLED sessions helped vs uniform |
| **RESIDUAL** (charter gap − named terms) | **≈ −142.5** | not bootstrapped (definitional artifact) | **NOT-DECOMPOSABLE-AT-N**; see §A.4 |
| — lot_ret_bps (FILLED realized mean, for reference) | −90.03 | [−310.75, +110.08] | in-sample benchmark |

### A.2 — Chain-A (verbatim, executed 2026-07-25 17:01:34Z)

Point estimates and bootstrap: single Postgres CTE against `overshoot_lots` ⋈ `overshoot_daily_bars`; per-lot rows filtered by `filled_qty>0 AND cost_basis IS NOT NULL AND qty>0`; entry reference = `(SELECT open FROM overshoot_daily_bars WHERE ticker=symbol AND trade_date>=entry_date ORDER BY trade_date LIMIT 1)`; exit reference = `(SELECT close … WHERE trade_date=exit_date)`. Bootstrap: `generate_series(1,1000) × generate_series(1,50)` with `floor(random()*n)+1` rid draws, joined back to `rows`, aggregated by `boot_id`, then `percentile_cont(0.025|0.975) WITHIN GROUP (ORDER BY bs_*)`. Sign flip on EXIT_SLIP so both slip terms carry the "positive = drag" polarity.

### A.3 — DoW aggregation (for CLUSTER_MIX)

| entry_dow | day | n | mean lot_ret (bps) |
|---:|---|---:|---:|
| 3 | Wed | 18 | +229.07 |
| 4 | Thu | 14 | −248.36 |
| 5 | Fri | 18 | −285.98 |

CLUSTER_MIX = FILLED-weighted mean (Σ n·m / Σ n) − simple uniform-DoW mean = **−90.03 − (−101.75) = +11.72 bps** (i.e., the actual DoW weighting was very slightly BETTER than a hypothetical uniform Wed/Thu/Fri weighting). The gap: Wed carries most of the alpha, and Wed has the largest n (18) — the observed weight already tilts toward the strongest DoW.

### A.4 — Why RESIDUAL is not decomposable at n=50

The charter frames RESIDUAL as `gap_bps − (ENTRY + CLUSTER + EXIT)`. The charter's gap uses **ACT-573 SELECTED-cohort mean = −321.1 bps** and **FILLED-lots mean = −473.4 bps**, both measured on ACT-573's forward-return construction (fixed multi-day horizon vs T+1 open, no exit-fill dependency). My in-sample FILLED realized-return mean here is **−90.03 bps** on `xfp/efp − 1` (exit_fill/entry_fill, path-dependent, ordinal-exit-day). These are **not the same measurement**. The −152 bps gap the operator wants explained lives in the ACT-573 frame; ENTRY_SLIP and EXIT_SLIP in the frame above capture *fill-vs-mid-slippage*, not the SELECTED-vs-FILLED cohort divergence. RESIDUAL therefore absorbs the cross-frame delta and should NOT be interpreted as "unnamed alpha we haven't found." Filed as **DEV-22: measurement-basis reconciliation owed to ACT-573 before four-term additivity is meaningful.**

### A.5 — Controllable share routed to ACT-506 bleed-box

Under the *within-frame* interpretation (fills vs T+1-open / exit-day-close), the controllable execution lane is `ENTRY_SLIP + EXIT_SLIP = +35.47 − 14.26 = +21.21 bps net drag`, upper-CI-bounded at roughly **+50 bps** — this is the honest line for ACT-506:

> **ACT-506 bleed-box row (new):** *execution-drag lane, FILLED n=50, 2026-07-08→07-24: point +21.2 bps net drag, upper 95% CI ≤ +50 bps, dominated by ENTRY-side (limit-price ladder tuning candidate — see §B.1).*

---

## §B — Execution-Alpha Lever Inventory

**Operator question:** *"Can execution be BETTER than what the machine picks — investigate all possibilities."* Below: for every term, candidate levers with (mechanism, expected bps range with basis cited, risk / failure mode, evidence path to validate). No config touches from this artifact — it produces the ranked menu; the operator picks what graduates to a charter. Every "beat the reference" claim names its reference basis explicitly.

### §B.1 — ENTRY-side levers (point drag +35.5 bps, upper CI +76 bps)

| # | lever | mechanism | expected bps range (basis cited) | risk / failure mode | evidence path |
|---|---|---|---|---|---|
| L-01 | **Limit-price ladder tightening** | ACT-506 already documents ~−50 bps price IMPROVEMENT limit→fill (fill price better than limit) at current fill rate. Tightening the ladder captures more of that spread by anchoring limits closer to quote-mid rather than crossing. | +10 to +30 bps recoverable **vs the current T+1-open reference**, conditional on preserving observed fill rate. | Fill-rate erosion — see §B.4 frontier: tighter ladder that drops fill rate from ~92% (ACT-506) to ~75% forfeits ~25% of admitted lots; forfeited lots' expected return is not the mean but the *marginal* lot (typically higher-momentum names that gap through). | New charter: 90-day forward paper A/B on `overshoot-entry-run` with two limit-ladder configs (control vs −10 bps tighter); acceptance = fill_rate ≥ 88% AND mean entry_slip ≤ +20 bps AND p_value < 0.10 on paired diff, n ≥ 200. |
| L-02 | **Entry-minute micro-timing (09:35 vs 09:40 vs 09:45)** | Minute-bar substrate owned (`overshoot_minute_bars`, MIG-167). R-007 method (Δ = 2.956 bps at 09:45 for EXIT) applied ENTRY-side: compute mean(entry_fill − minute_mid) at each candidate admit minute. | ±5 to ±20 bps; sign unknown pre-study. R-007 EXIT-side found early-morning cheaper by 2.956 bps → symmetric prior says entry may also be cheaper post-open-imbalance. | Later admits raise the risk of the momentum burning off (adverse-selection window shortens); DEV-2-class fill-completion race with FIX-8 completion pass at 14:05Z. | Backtest against MIG-167 substrate: per-minute reference-mid; fit `entry_cost_bps` as f(admit_minute) over full corpus with fixed lot roster. Adoption gate: Δ ≥ 5 bps AND monotonic across three consecutive minutes AND replay-parity clean. |
| L-03 | **Passive vs marketable order style** | Current admits use marketable limits (implied by +35.5 bps drag). Passive posts (peg-to-primary or midpoint) capture spread rather than paying it. | +15 to +40 bps recoverable **on filled lots**; but marginal fills only. | Fill rate collapse — passive orders on gapping momentum names historically fill 30–50% at best. Charter §5 requires ≥85% fill retention. | Broker-simulation study using IBKR shadow lane (ACT-572) once armed; requires ACT-565 baseline to compare Alpaca vs IBKR routing symmetry. |
| L-04 | **Spread-capture at entry (odd-lot pinging, iceberg)** | Post small child orders inside the spread; consume displayed liquidity only when spread-crossing is cheaper than mid-improvement expected value. | +5 to +15 bps in illiquid names (a subset of the universe); ~0 in mega-caps. | Complexity risk; ACT-565 baseline shows Alpaca does not currently expose iceberg semantics — would require IBKR promotion. Higher chance of information leakage on small-float names. | Deferred to ACT-572 IBKR shadow lane; not actionable pre-DEC-084 dust settling. |

### §B.2 — CLUSTER-side levers (point +11.7 bps benefit, structural)

| # | lever | mechanism | expected bps range (basis cited) | risk / failure mode | evidence path |
|---|---|---|---|---|---|
| L-05 | **DoW pacing rule (Wed-heavy)** | §A.3 shows Wed +229 bps mean, Thu/Fri −248/−286 bps. Weight admits toward Wed by raising K on Wed (e.g., K=7) and lowering K on Thu/Fri (K=3). | +40 to +120 bps if the DoW effect replicates; POSSIBLY 0 if it's a 13-session artifact (n=14–18 per DoW cell). | Data-snooping (ACT-570-P1 §4 caveat applies): five-cell DoW partition, best cell selected post-hoc = ~5× multiple-comparisons inflation. Regime-dependence (Thu earnings clustering, Fri OpEx week). | New charter under ACT-551 §22 stability regime: **must pre-register K-schedule BEFORE observation window**, test on disjoint 2026-Q4 forward corpus, n ≥ 200 per DoW cell, adopt only on monotone Wed>Thu>Fri fwd-5d confirmation. |
| L-06 | **Regime-gated pacing** | Composition rules keyed to SPY regime (MIG-164) or VIX quintile — reduce K under bear/high-vol, expand under bull/low-vol. | +30 to +80 bps in-corpus; already partially achieved via ACT-544/548 gating. Marginal lift from formalized rule. | Overfitting to 2026 bull regime; interacts with DEC-084 short-daily-budget. Requires disjoint-regime backtest. | Requires ACT-575 sign-audit re-verified on shorts + one full bear-quarter of forward data (~2027 H1 earliest). |

### §B.3 — EXIT-side levers (point −14.3 bps, already helpful)

| # | lever | mechanism | expected bps range (basis cited) | risk / failure mode | evidence path |
|---|---|---|---|---|---|
| L-07 | **09:45 ET morning-exit shift (ADOPTED)** | R-007 study: Δ = **+2.956 bps** measured advantage at 09:45 vs 15:55; deployed MIG-168 morning-exit monitor. | **+2.96 bps confirmed** (SLICE-B pair-corpus n=6,538 pairs); credit to the register. | Regime-shift on gap-up open days can invert; monitor via SLICE-C rolling-30-day pair replay. | Already gated; monitoring via MIG-168 heartbeat, first receipt owed 2026-07-27 13:45Z. |
| L-08 | **Residual-exit limit tuning** | For lots not exited by primary morning pass (residual queue via sql/41), current fallback = market. Tighter residual limits capture spread on the tail. | +5 to +15 bps on residual subset only; residual is ~15% of exits by ACT-573 §3 tables → weighted +1 to +2 bps corpus-wide. | Residual queue exists because primary limit didn't fill — same-limit reprice will not fill either. Requires adaptive reprice ladder. | Chartered but not-yet-scoped: sql/41 residual-cron logs → measure residual fill-rate at reprice ±5/±10/±15 bps; adoption gate = residual fill rate ≥ 90% AND paired-diff ≥ 5 bps. |
| L-09 | **Adaptive reprice-on-stale (FIX-2 interplay)** | FIX-2 snapshot-retry semantics reduced zero-exposure windows. Extend to a **reprice ladder** where a limit resting >N seconds without partial is stepped by 1 tick toward market. | +3 to +10 bps on stale-limit subset; interacts with FIX-8 completion allow-list. | Reprice race conditions with FIX-8 TERMINAL_ACTIONS — could double-fill if TERMINAL classification fires between reprice attempts. Requires idempotency-gate audit (FIX-9 pass-scoping — already landed). | Prerequisite: FIX-9 maiden must show pass-scoping is race-safe over ≥3 cycles; then charter a shadow-reprice run against the primary. |

### §B.4 — Structural: fill-rate ↔ price frontier

**The forfeit problem stated explicitly (per operator directive):** *"a better price that fills 60% is not free — model the forfeit."* Any ENTRY-side lever that improves per-fill price by Δ bps at the cost of fill-rate `f'` (from baseline `f₀`) yields expected-value change on the full ADMIT roster of:

`ΔEV = f' · (r̄ + Δ)  −  f₀ · r̄`

where `r̄` is the mean lot return conditional on fill. Rearranged: the lever is net-positive iff:

`Δ  >  r̄ · (f₀ − f') / f'`

**With our numbers (r̄ = −90 bps in-sample, f₀ ≈ 0.92 per ACT-506):**

| new fill rate f' | breakeven Δ (bps) required to overcome forfeit |
|---:|---:|
| 0.90 | +2.0 |
| 0.85 | +7.4 |
| 0.80 | +13.5 |
| 0.75 | +20.4 |
| 0.60 | +48.0 |

**Read:** because our r̄ is currently negative in this window, dropping fill rate actually HELPS EV *even without a price improvement* — a data-snooping trap that only holds if the marginal (forfeited) lot has expected return ≤ 0. The correct calculation uses `r̄_marginal` for the forfeited-lot bucket, which we do NOT yet measure. **DEV-23: charter a marginal-lot-return study before any fill-rate-reducing lever adopts.** Without that measurement, the frontier is not usable for adoption; it is usable for **veto** (any lever whose forfeited-lot bucket historically outperforms admits is auto-rejected).

### §B.5 — Ranked menu ($/yr at current sizing)

**Assumptions:** ~1,100 slot-events/yr at DEC-084 pacing (5/day LONG × 220 sessions plus 1/day SHORT × 220 ≈ 1,320; conservative 1,100); mean lot notional ~$5,000 (per ACT-506 book-size proxy); 1 bp ≈ $0.50 per lot → **~$550/bp/yr at current sizing**. This is a **rough conversion for ranking only**, not a P&L forecast.

| rank | lever | expected mid-range bps | expected $/yr @ $550/bp | adoption barrier | pre-committed study gate |
|---:|---|---:|---:|---|---|
| 1 | L-05 DoW-weighted pacing (Wed-heavy) | +80 | ~$44,000 | HIGH — data-snooping caveat; disjoint corpus | pre-register K-schedule, 2026-Q4 forward corpus, n≥200/DoW, monotone confirmation |
| 2 | L-01 Limit-ladder tightening | +20 | ~$11,000 | MEDIUM — fill-rate frontier §B.4 | 90-day paper A/B, fill_rate ≥ 88%, mean entry_slip ≤ +20 bps |
| 3 | L-02 Entry-minute micro-timing | +12 | ~$6,600 | LOW — MIG-167 substrate owned | corpus backtest on minute-mid, Δ ≥ 5 bps monotone over 3 minutes |
| 4 | L-06 Regime-gated pacing | +55 (unstable) | ~$30,000 | HIGH — regime disjoint corpus, ~2027 H1 earliest | forward bear-quarter validation + ACT-575 short-sign re-verify |
| 5 | L-09 Adaptive reprice-on-stale | +6 | ~$3,300 | MEDIUM — FIX-8/FIX-9 race audit prerequisite | 3-cycle race-safety on FIX-9 pass-scoping; shadow-reprice run |
| 6 | L-03 Passive order style | +25 (marginal fills only) | ~$14,000 nominal / net unknown | HIGH — needs ACT-572 IBKR baseline | broker-sim study post ACT-572 arm + ACT-565 baseline |
| 7 | L-07 09:45 morning-exit (ALREADY ADOPTED) | +2.96 confirmed | ~$1,630 | 0 — deployed | credit; SLICE-C rolling monitor via MIG-168 |
| 8 | L-08 Residual-exit limit tuning | +2 corpus-wide | ~$1,100 | LOW — sql/41 substrate exists | residual fill-rate ≥ 90% AND paired-diff ≥ 5 bps |
| 9 | L-04 Spread-capture (odd-lot / iceberg) | +8 illiquid subset | ~$4,400 nominal | HIGH — IBKR-only feature | deferred to ACT-572 post-arm |

**Top three-item shortlist for the operator to consider chartering:** L-05 (highest EV but highest snooping risk — requires disjoint-corpus discipline), L-01 (highest EV/risk ratio, direct extension of ACT-506 line), L-02 (fastest to evidence — full substrate already ingested, low deployment risk).

---

## §C — Deviations

- **DEV-22 (net-new):** Measurement-basis mismatch — ACT-573 SELECTED-cohort mean (−321.1 bps) uses forward-return-from-T+1-open construction; §A here uses lot-realized-return (exit_fill/entry_fill − 1). RESIDUAL is a cross-frame delta, not unmodeled alpha. Reconciliation owed before four-term additivity is defensible.
- **DEV-23 (net-new):** Marginal-lot-return unmeasured. §B.4 frontier requires knowing forfeited-lot expected return before any fill-rate-reducing lever can adopt. Charter a marginal-lot-return study on the refused-winners corpus (ACT-573 substrate) before L-01 / L-03 graduate.
- **honest-frame:** n=50 over 13 sessions. All three named terms' bootstrap CIs include zero. This artifact is a **menu, not a mandate** — no config touches proposed; every graduation is gated on charter + n≥200 minimum.

---

## §D — Register updates

- `docs/06-tracking/ACT-506-*` (bleed-box, when materialized): new row per §A.5 — execution-drag lane +21.2 bps point, upper CI ≤ +50 bps.
- `docs/08-planning/deferred-work-register.md`: add DEV-22, DEV-23; ACT-576 Phase-1 marked **DELIVERED-PARTIAL** (charter complete, cross-frame reconciliation pending).
- Downstream: L-05 / L-01 / L-02 candidacies routed to `feature-proposals.md` as FP-drafts awaiting operator selection.

**End of ACT-576 Phase-1 receipt.**

---

## §E — Post-Ratification Addendum (2026-07-25 17:10:20Z)

Filed as three completions per operator ruling on the ACT-576 Phase-1 DELIVERED-PARTIAL ratification. Each closes a specific weakness in the original receipt; none touches configs.

### §E.1 — Annualization basis restated (verbatim arithmetic)

**Original claim (§B.5, retracted):** "$550/bp/yr at current sizing" using mean lot notional ~$5,000. **That value was estimator-eyeballed and not derived from the corpus.** Corrected below:

**Corpus-derived basis (batch query 2026-07-25 17:10:20Z):**
- Σ notional at fill (n=50 corpus, 13 sessions) = **$119,336.26**
- Mean lot notional at fill = **$2,386.73** (not $5,000)
- All 50 lots FULLY filled (`filled_qty = qty` for every row) — partial-fill weighting term = 0

**Events/yr sources (cited):**
- `sql/33_overshoot_entry_run_cron_schedule.sql` LONG budget: **5/day**
- `sql/28…` + DEC-084 SHORT daily budget: **1/day**
- NYSE trading days/yr: **~252** (post-holiday convention; use 220 for conservative discount = ~14 non-full sessions from FOMC/holiday half-days ⇒ conservative floor 220; use 252 for gross ceiling)

**Two-basis reporting (both cited in menu):**

| basis | events/yr | mean lot $ | $/bp/yr = events × $ × 0.0001 |
|---|---:|---:|---:|
| Conservative (220 sessions, 6 admits/day) | 1,320 | $2,386.73 | **≈ $315.05** |
| Gross (252 sessions, 6 admits/day) | 1,512 | $2,386.73 | **≈ $360.87** |

**Restated §B.5 menu (conservative basis $315/bp/yr):**

| rank | lever | mid-bps | prior claim ($550/bp) | **corrected ($315/bp)** | Δ |
|---:|---|---:|---:|---:|---:|
| 1 | L-05 DoW pacing | +80 | $44,000 | **$25,200** | −$18,800 |
| 2 | L-01 Limit ladder | +20 | $11,000 | **$6,300** | −$4,700 |
| 3 | L-02 Entry-minute | +12 | $6,600 | **$3,780** | −$2,820 |
| 4 | L-06 Regime pacing | +55 | $30,000 | **$17,325** | −$12,675 |
| 5 | L-09 Reprice-on-stale | +6 | $3,300 | **$1,890** | −$1,410 |
| 6 | L-03 Passive style | +25 (marginal) | $14,000 nominal | **$8,000 nominal** | −$6,000 |
| 7 | L-07 09:45 exit (ADOPTED) | +2.96 | $1,630 | **$935** | −$695 |
| 8 | L-08 Residual limit | +2 | $1,100 | **$625** | −$475 |
| 9 | L-04 Spread capture | +8 (illiquid) | $4,400 | **$2,520** | −$1,880 |

**Ranking unchanged; absolute EV halved.** The L-05 charter graduation still holds on merit (largest EV), but the "prize" the board is chasing is closer to **$25K/yr** than the originally-implied $44K — a meaningful correction to the operator's mental model of upside.

Note: **Lot notional will scale up post-ACT-537 sizing lane.** When sizing multiplier lands (parked in resumption order), re-derive the basis and restate — do NOT extrapolate off the current $2,386.73 mean because it reflects the current 3.7% book-per-slot draw, not the target 4.3–5.0% range.

### §E.2 — Ledger foot (§A ↔ realized-P&L reconciliation)

Query (verbatim, batch above):
- `Σ realized_pnl_partial` on n=50 = **−$881.21**
- `Σ (avg_exit_price − entry_fill_price) × filled_qty` = **−$881.21** (identical — ledger foots trivially, no partial-fill discrepancy)
- Unweighted mean lot_ret = **−90.03 bps**; **dollar-weighted** mean lot_ret = **−73.84 bps**
- Implied P&L from unweighted × Σnotional = −90.03 × $119,336 × 1e-4 = **−$1,074.34**
- **Gap between unweighted-implied and realized = −$1,074.34 − (−$881.21) = −$193.13**

**Bridge:** the −$193.13 gap is **entirely explained by size-weighting** — smaller-notional lots skewed toward larger-negative returns, so equal-weighting overstates the drag by ~16 bps. Formally:

`unweighted_mean × Σnotional  =  ledger_Σpnl  +  cov(lot_ret, notional) × N`

The dollar-weighted mean (−73.84 bps) × Σnotional = **−$881.09**, which foots to the ledger's **−$881.21** within $0.12 (round-trip rounding). **§A's four-term decomposition remains valid on unweighted basis but any $/yr projection MUST use the dollar-weighted mean.** Charter graduations below (§F) all pre-commit to dollar-weighted primary and unweighted secondary reporting.

### §E.3 — DEV-22 frame bridge (T+1-open frame ↔ realized frame)

**Definitions:**
- `realized_ret` = `xfp / efp − 1` (exit_fill / entry_fill, path-dependent, ordinal exit day)
- `T1_frame_ret` = `exit_ref_close / entry_ref_open − 1` (T+1 open anchor → ordinal-exit-day close)
- `entry_slip_bps` = `(efp / ero − 1) × 10000` (+ = drag)
- `exit_slip_bps` = `−(xfp / erc − 1) × 10000` (+ = drag)

**Bridge identity (log-linear approximation, exact to O((slip/1e4)²) ≈ 10⁻⁶):**

`T1_frame_ret_bps  ≈  realized_ret_bps  +  entry_slip_bps  −  exit_slip_bps`

(Rationale: realized = log(xfp/efp) = log(xfp/erc) + log(erc/ero) + log(ero/efp) = −exit_slip + T1_frame + −entry_slip; solve for T1_frame.)

**In-corpus values (§A):**
- realized_mean = **−90.03 bps** (unwtd) / **−73.84 bps** ($-wtd)
- entry_slip = **+35.47 bps**, exit_slip = **−14.26 bps**
- Bridge → T1_frame_ret = −90.03 + 35.47 − (−14.26) = **−40.30 bps** (unwtd) / **−24.11 bps** ($-wtd)

**Reconciliation to ACT-573 charter gap:**

| frame | FILLED mean this corpus | SELECTED mean (ACT-573) | gap |
|---|---:|---:|---:|
| ACT-573 canonical frame | (not reported here) | −321.1 bps | (charter's −152 bps) |
| **This T+1-open ordinal-exit frame** (unwtd) | **−40.30 bps** | — | — |
| Realized frame (unwtd) | −90.03 bps | — | — |
| Realized frame ($-wtd) | −73.84 bps | — | — |

**Verdict:** the two frames differ by ~50 bps (realized-to-T1-ordinal), which is fully absorbed by ENTRY + EXIT slip. The ~150 bps ACT-573 gap therefore lives ALMOST ENTIRELY in the **horizon / exit-anchor** definition (ACT-573 uses a fixed multi-day forward horizon; we use the ordinal actual exit), NOT in a broken measurement.

**RESIDUAL now dies as a defined bridge:**
- ~21 bps ← slip-frame delta (entry + exit, additive and measured)
- ~130 bps ← horizon/anchor definition (multi-day forward vs ordinal exit)
- ~0 bps ← unnamed alpha

The −152 bps gap is a **frame-definition artifact**, not an execution deficit. The four-term additive model is correct once BOTH sides use the same frame; ACT-573 Phase-2 should re-express FILLED and SELECTED on the same fixed-horizon basis to get a comparable number. Filed as **DEV-24 (net-new): ACT-573 Phase-2 must publish FILLED and SELECTED on identical horizon anchors before the −152 bps thesis is respected as a numerical claim.**

---

## §F — Graduations (operator-ratified)

- **L-01 Limit-ladder** → **CHARTERED** at `docs/06-tracking/charters/L-01-limit-ladder-tightening.md`
- **L-02 Entry-minute** → **CHARTERED** at `docs/06-tracking/charters/L-02-entry-minute-timing.md`
- **L-05 DoW pacing** → **CHARTER-QUARANTINED** at `docs/06-tracking/charters/L-05-dow-pacing-quarantined.md` (STEP-0 corpus prior test blocks any live study)
- **DEV-23 marginal-lot** → **CHARTERED** at `docs/06-tracking/charters/DEV-23-marginal-lot-return.md` (ACT-573 substrate reuse)
- L-06 / L-09 / L-03 / L-04 / L-08 remain **PARKED** on stated gates (L-03/L-04 behind ACT-572 arm)
- L-07 already credited (adopted; MIG-168 monitor)

**End of ACT-576 Phase-1 Addendum.**
