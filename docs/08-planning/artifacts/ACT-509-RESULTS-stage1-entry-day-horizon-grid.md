# ACT-509 — RESULTS: Stage-1 Entry-Day × Exit-Day ROI Grid (LONG, tier T1 vs T2)

> **Filed:** 2026-07-13 (evening, in parallel with E3-Mon / E4-Mon polls) | **Mode:** INVESTIGATION (read-only corpus SQL).
> **Corpus:** ratified study run `1888e113-f9b3-43f5-856c-d91666a3c121` (`param_grid_hash` prefix `a37e4b96`), detector `b7cdfcd8`, `bars_snapshot_max_date = 2026-07-02`.
> **Survivorship stamp:** `UPPER_BOUND_SURVIVORSHIP_BIASED` (verbatim from `overshoot_study_runs`; the grid inherits this stamp — read as *directional*, not point-precise).
> **Basis:** close-to-close per event, entry at close of `event_date + d_e` (trading days), exit at close of `event_date + d_x`. `d_e ∈ {1..5}`, `d_x ∈ {d_e+3 .. 20}`. Pure close-to-close variant only (the mixed T+1-open variant per charter §caveat-2 is deferred to a robustness follow-up; the pure form is the cleaner primary read).
> **Admissible universe:** LONG events in cells passing `mean_fwd_return_5d ≥ 0.0010` ∧ `arrival_count ≥ 1` at `exclusion_width_days = 5` (the ratified detector value). T1 vs T2 split by geometry (T1: `band='L_10_INF'` ∧ `w ∈ {1,2,3}` ∧ `mq ∈ {4,5}` ∧ `dd ∈ {1,2,3}`). N_T1 = 1,711; N_T2 = 132,674.

## 1. Heatmaps — mean return per slot-day (bps/day)

Reading: `bps/slot-day = mean_return_bps ÷ holding_days`. Current config = `(entry=T+1, exit=T+11, hold=10)` boxed.

### T1 (n≈1,711 per cell; drops to ~1,648 at exit_day=20 as recent events lack full 20-day forward window)

```
                        exit_day
 entry ─── 4     5     6     7     8     9    10    11    12    13    14    15    16    17    18    19    20
 T+1   |  28.4  28.9  32.1  30.8  28.0  27.5  28.2 [27.6] 25.8  21.8  21.7  22.7  23.0  22.7  23.6  24.2  24.1
 T+2   |   —    34.0  36.9* 34.3  30.4  29.1  29.8  29.1  27.0  22.6  22.3  23.3  23.5  23.2  24.1  24.5  24.4
 T+3   |   —     —    33.9  31.6  27.5  26.2  27.2  26.9  24.8  20.3  20.6  21.6  21.9  21.7  22.9  23.5  23.4
 T+4   |   —     —     —    33.0  27.3  25.7  26.9  26.4  24.1  19.5  19.5  20.5  21.0  20.7  22.1  22.7  22.6
 T+5   |   —     —     —     —    27.5  25.6  27.0  26.5  24.0  19.2  19.4  20.4  20.7  20.6  22.1  22.7  22.7
```

`*` = grid peak per-slot-day.  `[·]` = current live config.

**T1 peak:** `(entry=T+2, exit=T+6, hold=4 days)` = **36.89 bps/day** (n=1,711, all cells full).

### T2 (n≈132,674 per cell; drops to ~129,248 at exit_day=20)

```
                        exit_day
 entry ─── 4     5     6     7     8     9    10    11    12    13    14    15    16    17    18    19    20
 T+1   | 13.28 13.20 12.64 12.45 12.41 12.59 12.62[12.90]13.15 12.96 12.91 12.87 12.79 12.72 12.63 12.61 12.63
 T+2   |   —   12.89 12.31 12.14 12.11 12.36 12.40 12.74 13.03 12.84 12.80 12.78 12.72 12.66 12.59 12.58 12.61
 T+3   |   —     —   11.69 11.65 11.69 12.05 12.15 12.57 12.92 12.72 12.72 12.71 12.66 12.61 12.55 12.55 12.58
 T+4   |   —     —     —   11.66 11.63 12.00 12.14 12.57 13.06 12.83 12.80 12.79 12.73 12.68 12.60 12.60 12.62
 T+5   |   —     —     —     —   11.65 12.00 12.12 12.56 13.04 12.79 12.78 12.77 12.72 12.67 12.60 12.60 12.63
```

**T2 peak:** `(entry=T+1, exit=T+4, hold=3 days)` = **13.28 bps/day** — barely above the plateau `(1,12) = 13.15` and `(2,12) = 13.03`. Flat, no meaningful ridge.

## 2. Refusal-interaction funnel under τ_long = 1.00

Approximation: `reversionPct(d_e) ≈ (1 − close_{d_e−1}/close_event) × (1 + move_pct) / move_pct`. `d_e = 1` uses `close_event / close_event` → reversion = 0 by construction. Event survives if `reversionPct ≤ 1.00`.

| entry_day | T1 pass  | T1 attrition | T2 pass    | T2 attrition |
|-----------|----------|--------------|------------|--------------|
| T+1       | 1,711    | —            | 132,674    | —            |
| T+2       | 1,701    | −0.6%        | 128,601    | −3.1%        |
| T+3       | 1,677    | −2.0%        | 124,229    | −6.4%        |
| T+4       | 1,655    | −3.3%        | 120,632    | −9.1%        |
| T+5       | 1,634    | −4.5%        | 117,651    | −11.3%       |

Under τ_long = 1.00 (the ratified plateau setting per ACT-488), attrition is mild: T+2 entry costs only 0.6% of the T1 pipeline. The winning T1 config `(2, 6)` inherits n=1,701 post-τ (survivorship-honest denominator) — nothing to worry about.

## 3. GO / NO-GO ruling per the pre-committed decision rule (charter §"decision rule")

Rule: config change is **GO** iff (a) ≥ 15% annualized-per-$ improvement vs current `(T+1 → T+10)`, (b) N ≥ 1,000 in the winning cell, (c) monotone-stable across ±1 day perturbations on both axes.

### T1 → **GO** on `(entry=T+2, exit=T+6, hold=4)`

- **(a) Improvement:** 36.89 / 27.65 − 1 = **+33.4%** ≫ +15% ✓
- **(b) N:** 1,711 (post-τ 1,701) ≥ 1,000 ✓
- **(c) Monotone stability (±1):**
  - `(1,5)=28.9`, `(1,6)=32.1`, `(1,7)=30.8`
  - `(2,5)=34.0`, `(2,6)=36.9*`, `(2,7)=34.3`
  - `(3,5)= —`, `(3,6)=33.9`, `(3,7)=31.6`

  Peak surrounded by neighbors in `[28.9, 34.3]` — soft dome, no knife-edge cliff. **Monotone-stable ✓.**

### T2 → **NO-GO** — current config `(T+1 → T+10)` stands

- Best alternate `(entry=T+1, exit=T+4)` = 13.28 bps/day vs current 12.90 = **+2.9%** ≪ +15% ✗
- The entire T2 grid sits on a flat plateau `[11.6, 13.3]`; no cell clears the threshold. Filed as **tripwire T2-A** for re-review at next quarterly corpus refresh: watch whether the `(1,12)` / `(2,12)` shelf ever rises to ≥ 14.8 bps/day, which would flip the ruling.

## 4. Answers to operator's two questions

**Q1 — "Does entering T+2 / T+3 beat T+1?"**

- **T1: YES**, decisively at T+2. Peak per-slot-day return moves from 27.6 bps/day (at current `T+1, hold=10`) to **36.9 bps/day at `T+2, hold=4`** — the T1 continuation is real (+2.7 bps of extra mean-return on day T+2 relative to T+1 for equal exit dates, and shorter holds monetize each dislocation-day at higher intensity). T+3 also beats T+1 (33.9 vs 27.6) but adds no meaningful edge over T+2 and pays a further 1.4 percentage points in τ-attrition.
- **T2: NO.** The T2 grid is a flat plateau — T+2 (12.9 peak) and T+3 (12.9 peak) sit at essentially the same per-slot-day as T+1 (13.3 peak). The operator's continuation hypothesis is a T1 phenomenon; T2 shows no continuation edge net of τ-attrition.

**Q2 — "Does a shorter hold beat T+10 on per-deployed-dollar-per-day?"**

- **T1: YES.** Optimal hold is **4 trading days**, not 10. Turnover math (below) shows the shorter hold delivers 33% more dollars per deployed dollar per year despite lower total mean return per trade — the wallet cycles 2.5× more often.
- **T2: NO.** The T2 mean-return curve is nearly linear in hold length within the (1, ·) row — per-slot-day is essentially flat (12.4–13.3 across holds 3..19). No meaningful turnover uplift is available.

## 5. Exact per-day dollar arithmetic (per $100K per year per slot)

Assumptions (Part V deployment convention): $100K deployed per slot, 252 trading days/year. Annualized per-slot yield = `bps_per_slot_day × 252 × $100,000 / 10,000 = bps_per_slot_day × $2,520`.

| Config | bps/slot-day | $/year per $100K per slot | vs current | Turnover (fills/yr/slot) |
|--------|-------------:|--------------------------:|-----------:|-------------------------:|
| **T1 current** `(entry=T+1, exit=T+11, hold=10)` | 27.65 | **$6,968** | — | 25.2× |
| **T1 proposed** `(entry=T+2, exit=T+6, hold=4)`  | 36.89 | **$9,296** | **+$2,328 (+33.4%)** | 63.0× |
| T2 current `(entry=T+1, exit=T+11, hold=10)`     | 12.90 | $3,251 | — | 25.2× |
| T2 best-alt `(entry=T+1, exit=T+4, hold=3)`      | 13.28 | $3,347 | +$96 (+2.9%) *(below GO)* | 84.0× |

**Live-book delta if T1 recommendation is adopted (T2 unchanged):**

- T1 events comprise ~1.3% of the admissible LONG corpus by event count (1,711 / 134,385). Live cohorts 07-07/07-08/07-09 filled 50 lots; T1 fraction among filled ≈ 1–2 lots (small — most live capital sits in T2). **Book-level $ impact is bounded until T1 arrival rate grows** — the recommendation is high-per-lot ROI, low-per-book share.
- Capacity flag: at 63× turnover the T1 slot demands ~4× the T1 arrival rate of the current config to stay full. If T1 arrivals are ~400/year across the whole market (rough corpus estimate: 1,711 / ~4.3 corpus years), a single T1 slot at hold=4 fills easily (63 fills < 400); scaling to N T1 slots is bounded by N × 63 ≤ ~400 ⇒ **≤ ~6 T1 slots** are supportable at the proposed cadence. Above ~6, slot idleness eats the per-day return. Flag for R-1 re-parameterization.

## 6. Stage-2 (intraday-minute grid) — gating status

Stage-1 kept **T+1** for T2 (majority arm by lot count) and moved T1 to **T+2**. Charter §Stage-2 trigger required *both* T+1 staying AND ACT-506 open-drift ≥ 25% of close→fill gap. **Result: PARTIAL trigger.** T2 keeps T+1; T1 does not. Two paths:

- **(P1)** Scope intraday grid only for the T2 arm — mechanically defensible, and T2 is the majority of book capital. Still gated on ACT-506's open-drift finding.
- **(P2)** Defer Stage-2 scoping to post-DEC (once T1's `(2, 6)` is either ratified or rejected), on the argument that intraday timing on T2 alone is a smaller lever than the T1 horizon shift. **Operator DEC required to choose P1 vs P2.**

Either way: Stage-2 remains fully gated on ACT-506's slippage decomposition per charter — no intraday build here.

## 7. Cross-touchpoints (per charter §"cross-touchpoints — must flag")

- **ACT-493 (exit adoption engine):** the T1 recommendation shortens the hold from T+10 to T+6 (event-date basis), i.e. from 10 to 4 trading days after entry. **ACT-493's exit engine must be able to trigger at hold=4 for T1-tagged lots, at hold=10 for T2-tagged lots** — a tier-conditional exit horizon. This is a nontrivial parameter surface change; flag as an ACT-493 STEP-B design input, do NOT land the horizon flip until ACT-493 exit engine ships and can absorb the tier-conditional trigger. The current 07-17 deadline is unchanged.
- **ACT-506 (W5-01):** Stage-2 gating dependency, unchanged.
- **R-1 (ratified frontier config):** entry-day and hold-horizon are R-1 parameters. Any adoption of the T1 finding is a **DEC** requiring the full evidence ladder (VI.I overnight-gap sanity, Part V deployment-cap re-check, VI.J pre-committed-threshold documentation, promotion pathway). **This charter does NOT authorize a config flip.**
- **INC-96 (allocation-cap over-cap window):** at hold=4 the T1 slot turnover triples; the LIFO attribution assumption in the cap arithmetic should be sanity-checked under the higher-frequency cycle before any DEC lands.

## 8. Honest caveats (per charter)

1. Pure close-to-close basis only in this pass. The charter also promised a T+1-open entry-leg variant as robustness — filed as a **follow-up robustness check** on the T1 winner (should the improvement survive `open(T+2)` entry basis at approximately equal magnitude, the DEC is stronger; if it collapses, the T1 finding is basis-fragile). Not gating.
2. Refusal-funnel uses a pricing-only proxy for `reversionPct` (`move_pct` as denominator surrogate); the live I5 recheck uses Polygon pre-open snapshot vs `t_close_ref` and `pre_event_ref` from `overshoot_daily_bars`. The proxy overstates attrition slightly at large `move_pct` (log/linear approximation error). Directional read only; does not affect the GO/NO-GO ruling given the small measured attrition.
3. Corpus stamp is `UPPER_BOUND_SURVIVORSHIP_BIASED` — absolute bps levels are optimistic; RELATIVE comparisons across grid cells (which is what the decision rule uses) are robust to a uniform survivorship overhang.
4. Cell admission uses `exclusion_width_days = 5` (ratified detector value); the other three widths (0, 3, 7) in the corpus are ignored per detector convention.
5. T1 arrival-rate estimate (~400/year) is a corpus-average; regime-conditional arrival could be lower, capping N-slots-supportable well below the 6 above. Flag for regime.ts audit if the DEC advances.

## 9. Ranked findings

| Rank | Finding | Magnitude | Consequence |
|-----:|---------|-----------|-------------|
| 1 | **T1 shorter-hold-at-T+2 dominates T+1 T+10** | +33.4% per-$/day | GO threshold cleared; T1 R-1 re-parameterization DEC recommended |
| 2 | T1 refusal-funnel attrition at T+2 is negligible | 0.6% | Survivorship-honest N holds |
| 3 | T2 grid is a flat plateau — no config change beats current | +2.9% best-alt vs current | NO-GO; tripwire T2-A filed |
| 4 | T1 capacity-supportable slot count ≤ ~6 at hold=4 cadence | arrival-rate bounded | Flag for R-1 slot-count re-parameterization |
| 5 | Tier-conditional exit horizon required (T+6 T1, T+11 T2) | design surface change | ACT-493 STEP-B input |

## 10. Verdict (framed exactly per charter)

> **T1: GO** on `(entry=T+2, exit=T+6, hold=4)` — beats current `(T+1, T+11)` by **+33.4%** on annualized per-deployed-dollar return, N = 1,711 ≥ 1,000, monotone-stable across ±1 day perturbations, refusal-funnel attrition trivial (0.6%). Adoption is a **DEC** re-parameterizing R-1; **NOT auto-applied**. Sequenced after ACT-493 (exit engine must support tier-conditional horizon).
>
> **T2: NO-GO** — best alternate improves per-$/day by only +2.9%, well below the 15% floor. Current `(T+1, T+11)` stands, with tripwire T2-A watching the `(1,12)` / `(2,12)` shelf.
>
> **Stage-2 intraday grid:** partial trigger — scope decision (T2-only vs deferred) requires operator DEC; gating on ACT-506 open-drift finding is unchanged.

## Cross_ref

- ACT-509 charter (`docs/08-planning/artifacts/ACT-509-CHARTER-entry-day-horizon-intraday-ROI-grid.md`)
- ACT-505 (parity audit — motivated the ROI-grid question)
- ACT-493 (exit engine — MUST land the tier-conditional horizon before any T1 DEC)
- ACT-506 (W5-01 — Stage-2 trigger)
- ACT-488 (τ_long = 1.00 ratification — refusal-funnel parameter)
- Ratified study run `1888e113-f9b3-43f5-856c-d91666a3c121`, detector `b7cdfcd8`, R-1 frontier config
- VI.I / VI.J / Part V (pre-DEC gates for any adoption)