# ACT-509 Stage-2 — EXIT-MINUTE LEG (ELEVATED) Charter

> **Owner:** Overshoot strategy | **Filed:** 2026-07-23 (operator priority elevation)
> **Amended:** 2026-07-23 (operator variant correctly encoded — v1 supervisor mis-framing corrected: primary = SAME-DAY-EARLIER exit on ordinal-10, NOT next-morning exit)
> **Amended:** 2026-07-23 (pre-screen v2 ACCEPTED — final_day_forfeit measured on 259,721/259,715-event corpus, ALIVE-STRONG pooled with T1·2023 ALIVE-CONDITIONAL. One remaining term = morning_exec_cost. Adoption inequality pre-printed below.)
> **Mode:** INVESTIGATION only — read-only (1-min bars + `overshoot_lots` closed-lot ledger + ratified corpus). NO engine changes.
> **Sequencing:** Runs IMMEDIATELY AFTER Monday engine verdict. Ahead of ACT-537 (sizing), ACT-540 (insider×dislocation), ACT-541 (earnings-crash). Register reordered same PR.
> **Supersedes scope of:** ACT-509 Stage-2 original charter §"Intraday timing (CONDITIONAL — scope only)" — elevated to first-class execution leg.
> **Target:** Terminal morning-exit verdict within days of the engine table.

## Why elevated

ACT-558 v4 closed the freed-cash-idle-drag family at **blend $2.98K/yr (2.98% of $100K book) / floor $12.0K/yr (12.0%)** with the binding line:

> This ceiling IS the priced opportunity ACT-509 Stage-2 exists to test — the operator's morning-exit variant carries the pre-committed net-positive adoption rule.

No other queued item has a comparably priced, measurable, terminal-answer verdict awaiting a single study. Sizing / insider / earnings-crash lanes slide behind.

## AMENDMENT (2026-07-23) — Operator variant correctly encoded

**v1 mis-framed the variant.** Supervisor drafted "morning-exit = exit on ordinal-11 morning after holding one extra night." Operator's actual variant:

> Exit on the **ORDINAL-10 DAY** at `{09:31, 09:35, 09:45}` ET (hold shortens ~6.5h). **NO extra overnight exists.** Freed cash funds the **SAME morning's 09:35 admission wave** (sequencing: exit minute precedes entry minute; both configurable).

**Retired term:** `extra_overnight_effect` (belonged to the mis-framed variant). Kept only as ONE comparison cell for completeness, non-primary.

**New term (primary):** `final_day_forfeit` = ordinal-10 open→close move surrendered by leaving at the open — **MEASURED from `overshoot_daily_bars` across the ratified corpus** (mean/median/winsorized, per tier + regime), NOT assumed.

### Revised three-term arithmetic (morning cells)

For each morning exit-minute cell `m ∈ {09:31, 09:35, 09:45}` per tier, on the ORDINAL-10 session:

```text
net(m) = redeploy_gain − morning_exec_cost(m) − final_day_forfeit
```

- **(a) redeploy_gain** = one recovered slot-night at the measured blended edge. ACT-558 scalars unchanged: floor $10.60/sd, blend $4.05/sd.
- **(b) morning_exec_cost(m)** = `(spread + impact @ minute m) − (spread + impact @ 15:50)` from actual 1-min bars.
- **(c) final_day_forfeit** = `(close − open)/open` on the ordinal-10 session, measured across corpus. Signed: positive value = leaving-at-open surrenders a gain = SUBTRACTS from net. Negative value = leaving-at-open avoids a loss = ADDS to net.

### Pre-committed adoption inequality (per cell {tier × regime × minute m})

With `final_day_forfeit` now measured (pre-screen v2, ACCEPTED), Stage-2's minute grid carries **exactly one remaining unknown** — `morning_exec_cost(m)`. Adoption rule, mechanical, pre-printed:

```text
ADOPT minute m for {tier × regime}  iff  exec_cost_delta(m) < slot_night_gain − final_day_forfeit
                                                             (per that cell)
```

Where `exec_cost_delta(m) = (spread + impact @ m) − (spread + impact @ 15:50)`. Per-cell measured values from pre-screen v2 (bps, corpus):

| pop / regime | final_day_forfeit (mean / median) | slot_night_gain − forfeit @ BLEND (10.5) | @ FLOOR (42.42) | Verdict class |
|--------------|-----------------------------------|-------------------------------------------|-----------------|---------------|
| T1 ALL       | 4.30 / 3.16                        | ≈ 6.2 – 7.3 bps budget for exec_cost      | ≈ 38 – 39 bps   | ALIVE-STRONG  |
| T1 2023      | 13.43 / 9.39                       | mean: negative budget; median: 1.1 bps     | ≈ 29 – 33 bps   | ALIVE-CONDITIONAL |
| T1 2024      | −4.78 / −2.43                      | ≈ 12.9 – 15.3 bps budget                   | ≈ 44.8 – 47.2   | ALIVE-STRONG  |
| T2 ALL       | 5.36 / 4.19                        | ≈ 5.1 – 6.3 bps budget                     | ≈ 37 – 38 bps   | ALIVE-STRONG  |

The minute grid measures `exec_cost_delta(m)` and adopts cell-by-cell against this budget. Regime-stability check retained: adopted cell must hold under both BLEND and FLOOR scalar overlays unless operator pre-commits to a scalar choice.

### Comparison cell (non-primary) — mis-framed variant retained

One next-morning-exit (ordinal-11 open, after one extra night held) cell reported alongside primary grid for completeness. Not adopted regardless of verdict.

### Same-day reentry mechanics

**Confirmed:** Alpaca paper/margin account — same-day proceeds from a market-open sale are immediately available for market-open purchases within the same session (T+0 buying power via margin; settlement is T+1 but non-blocking for purchases against margin). **No settlement-block risk** on the 09:31→09:35 exit→admission sequence in paper. Production cash-account variant would need explicit confirmation; scoped out of this study.

## Scope

**Data:**
- 1-min bars for the realized-exit dates (all 50 closed lots in `overshoot_lots` where `closed_at IS NOT NULL`)
- Sampled study-era set targeting **n ≥ 1000 per cell** across the ratified 1888e113 corpus
- Corpus already staged: 3.1M 1-min bars (confirmed earlier receipt)

**Exit-minute grid (per tier T1, T2) — ORDINAL-10 SESSION:**
`{09:31, 09:35, 09:45, 10:00, 15:00, 15:50, close}` ET
(Primary morning cells: 09:31, 09:35, 09:45. Baseline: 15:50. Comparison cell for retired variant: ordinal-11 open.)

**Entry-minute grid (retained per original Stage-2 charter):**
`{09:35, 10:00, 10:30, 11:00, 14:00}` ET — T+0/pre-close refusal RE-CONFIRMED on minute data while corpus is loaded.

## Three-term arithmetic — see AMENDMENT above (supersedes original v1 text)

Original v1 text retired. Primary variant now = same-day-earlier exit; term (c) is `final_day_forfeit` measured on ordinal-10 open→close.

## Verdict grammar (mechanical, pre-committed, binding)

```text
if net(m) > 0 AND n_cell ≥ 1000 AND regime_stable(±1 minute perturbation):
    → MORNING-EXIT ADOPTS at minute m
    → idle night dies; ACT-558 ceiling becomes CAPTURED prize
else (net ≤ 0 OR n < 1000 OR knife-edge):
    → 15:50 STANDS
    → ACT-558 ceiling closes as STRUCTURALLY UNRECOVERABLE
    → freed-cash-idle-drag family CLOSED PERMANENTLY (no future re-open without new evidence)
```

Regime-stability: monotone across ±1 minute perturbations on the exit axis. Knife-edge (adjacent-minute collapse) disqualifies.

## Pre-screen (TONIGHT, before Monday) — decision rule

**Pre-committed:**
- If corpus mean `final_day_forfeit` > **~+20 bps** → forfeit swamps the $10.60 / $4.05 per-slot-night gain → **variant likely fails**; report and stop cheaply.
- If ≈ 0 or negative → final day is chop, not recovery → **variant ALIVE**; Stage-2 minute grid prices only the execution term.

Delivered same-turn as this amendment. See companion artifact `ACT-509-STAGE2-PRESCREEN-final-day-forfeit.md` for the verbatim SQL + result tables + verdict.

## Deliverables (single artifact)

`ACT-509-STAGE2-EXIT-MINUTE-RESULTS-*.md` containing:

1. Exit-minute heatmap per tier: `net(m)` with n_cell, dispersion, regime-stability marks
2. Three-term decomposition table per morning cell (a, b, c printed from arithmetic)
3. Entry-minute re-confirmation grid (T+0/pre-close refusal check)
4. Verdict line per the mechanical grammar above
5. If ADOPT: DEC filing path (this charter does NOT auto-flip config — DEC + R-1 re-parameterization required)
6. If STAND: ACT-558 family final-closure stamp; deferred-work-register update

## Honest caveats (pre-committed)

1. Cells with n < 1000 reported but CANNOT satisfy the decision rule — thin-cell wins are advisory only.
2. Spread/impact proxies from 1-min OHLC are approximations; real fills at 09:31 will have wider dispersion than measured. The $12.0K floor / $2.98K blend already price this uncertainty as a CEILING, not an expectation.
3. `extra_overnight_effect` measurement window depends on corpus ordinal-10 slice coverage; sub-cell N reported per tier.
4. Detector version `a026dc51` at time of filing; any detector re-fit before study runs invalidates cell attribution and requires re-run.
5. This charter authorizes MEASUREMENT ONLY. Adoption is a DEC.

## Cross-touchpoints

- **ACT-558 v4:** priced prize; family CLOSES on this verdict either way.
- **ACT-515 engine verdict (Monday):** gating predecessor — study launches immediately after.
- **ACT-493 exit adoption:** measures re-parameterization impact if morning-exit ADOPTS.
- **VI.I (overnight-gap conventions), Part V (deployment-cap), VI.J (pre-committed thresholds):** binding.
- **R-1 (ratified frontier config):** morning-exit minute is an R-1 parameter; adoption = DEC.

## Not doing

- No engine changes to `overshoot-entry-run`, `overshoot-exit-run`, or the detector.
- No τ / cap / cell-boundary re-fit.
- No cross-strategy generalization.
- No adoption without DEC + full evidence ladder.

## Sequencing (binding)

```text
tonight receipts (19:50Z tail → 21:10Z snapshot → 22:00Z detection)
  → FIX-2 pre-market (Fri)
  → FIX-8 Friday
  → Monday engine verdict (ACT-515)
  → **ACT-509 Stage-2 exit-minute leg (this charter)**
  → ACT-537 sizing
  → ACT-540 insider × dislocation
  → ACT-541 earnings-crash
```

## Cross_ref

- ACT-509 (original charter, entry-day × horizon × intraday grid)
- ACT-509 Stage-1 RESULTS (ratified)
- ACT-558 v4 (priced prize; family closes on this verdict)
- ACT-515 (engine — gating predecessor)
- ACT-493 (exit adoption — downstream if ADOPT)
- Detector `a026dc51`, R-1 frontier, VI.I / Part V / VI.J