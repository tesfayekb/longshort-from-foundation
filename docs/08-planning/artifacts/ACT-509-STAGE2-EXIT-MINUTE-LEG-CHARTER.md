# ACT-509 Stage-2 — EXIT-MINUTE LEG (ELEVATED) Charter

> **Owner:** Overshoot strategy | **Filed:** 2026-07-23 (operator priority elevation)
> **Mode:** INVESTIGATION only — read-only (1-min bars + `overshoot_lots` closed-lot ledger + ratified corpus). NO engine changes.
> **Sequencing:** Runs IMMEDIATELY AFTER Monday engine verdict. Ahead of ACT-537 (sizing), ACT-540 (insider×dislocation), ACT-541 (earnings-crash). Register reordered same PR.
> **Supersedes scope of:** ACT-509 Stage-2 original charter §"Intraday timing (CONDITIONAL — scope only)" — elevated to first-class execution leg.
> **Target:** Terminal morning-exit verdict within days of the engine table.

## Why elevated

ACT-558 v4 closed the freed-cash-idle-drag family at **blend $2.98K/yr (2.98% of $100K book) / floor $12.0K/yr (12.0%)** with the binding line:

> This ceiling IS the priced opportunity ACT-509 Stage-2 exists to test — the operator's morning-exit variant carries the pre-committed net-positive adoption rule.

No other queued item has a comparably priced, measurable, terminal-answer verdict awaiting a single study. Sizing / insider / earnings-crash lanes slide behind.

## Scope

**Data:**
- 1-min bars for the realized-exit dates (all 50 closed lots in `overshoot_lots` where `closed_at IS NOT NULL`)
- Sampled study-era set targeting **n ≥ 1000 per cell** across the ratified 1888e113 corpus
- Corpus already staged: 3.1M 1-min bars (confirmed earlier receipt)

**Exit-minute grid (per tier T1, T2):**
`{09:31, 09:35, 10:00, 15:00, 15:50, close}` ET

**Entry-minute grid (retained per original Stage-2 charter):**
`{09:35, 10:00, 10:30, 11:00, 14:00}` ET — T+0/pre-close refusal RE-CONFIRMED on minute data while corpus is loaded.

## Three-term arithmetic (morning cells)

For each morning exit-minute cell `m ∈ {09:31, 09:35, 10:00}` per tier:

```text
net(m) = redeploy_gain − morning_exec_cost(m) − extra_overnight_effect
```

Where:

- **(a) redeploy_gain** = one recovered slot-night at the measured blended edge.
  - Basis: ACT-558 v4 blended edge = **$4.05/slot-day** (arithmetic printed in v4 artifact: `2500 × (42.42×0.4 + 8.09×0.6) / 10000`).
  - One night = one slot-day recovered per morning-exit lot.

- **(b) morning_exec_cost(m)** = `(spread + impact @ minute m) − (spread + impact @ 15:50)`
  - Measured from ACTUAL 1-min bars (bid-ask spread proxy from OHLC range; impact from volume-weighted deviation from VWAP-of-minute).
  - NEVER assumed. NEVER modeled from vendor library defaults.
  - Zero baseline: 15:50 is the current production exit minute.

- **(c) extra_overnight_effect** = `close_to_open_drift(ordinal-10 positions, corpus)`
  - Measured across corpus, NOT assumed.
  - Signed: negative drift = morning-exit AVOIDS a loss = ADDS to net; positive drift = morning-exit MISSES a gain = SUBTRACTS from net.
  - Bootstrap CI reported; cell-conditional (T1 vs T2) reported separately.

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