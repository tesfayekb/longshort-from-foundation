# ACT-506 — W5-01 CHARTER: True Slippage Decomposition per Lot

> **Owner:** Overshoot strategy | **Filed:** 2026-07-13 (operator-directed, promoted from ACT-505 follow-up FU-2)
> **Mode:** INVESTIGATION only — read-only, NO engine changes | **Queue position:** BEHIND ACT-493 (exit adoption, Thursday 2026-07-17 deadline). W5-01 / W5-02 / W5-03 may interleave among themselves.
> **ROI rank:** FIRST of the three W5 follow-ups (highest-leverage — directly indicts or exonerates limit construction / fire timing).

## Purpose

Decompose the ACT-505-measured **1–2% close→fill entry slippage** into its three components, per lot, from
`overshoot_audit_logs` (joined with `overshoot_events` / `overshoot_lots` / `overshoot_daily_bars`), so the
**controllable** slippage component is priced in bps and the verdict *"is our limit construction or fire timing
broken?"* becomes an evidence-backed one-line answer rather than a hand-wave.

## Decomposition (pre-committed, filed BEFORE compute)

For every filled lot in the three cohorts (2026-07-07 / 07-08 / 07-09; n = 18 + 14 + 18 = 50):

```
close→fill  =  overnight  +  open_drift  +  controllable
```

- **Overnight leg** = `open(T+1) − close(T)` per name. Basis is the prior settled close (Polygon EOD) vs the
  opening print on the entry day. Compared against **VI.I's full overnight-gap distribution for the study
  universe** (mean / median / p10 / p25 / p75 / p90) — NOT just VI.I's median. Whether the cohort's measured
  overnight sits inside its expected band is verdict axis #1.
- **Open-drift leg** = `snapshot_mid_at_construction − open(T+1)`. Captures the intraday move between the
  opening print and the moment the entry runner constructed the limit (~09:35 ET). Uncontrollable at v1 (fire
  time is scheduled); documented but not indicting.
- **Controllable leg** = split into two sub-components:
  - **Limit-vs-mid spread** = `limit_price − snapshot_mid_at_construction` — limit construction choice.
  - **Fill-vs-limit fill-through** = `filled_avg_price − limit_price` — marketable-limit aggression / queue
    position.

## Deliverables (single results artifact `ACT-506-RESULTS-*`)

1. **Per-lot table** (n=50): `ticker, cohort_date, close_prior, open_entry_day,
   snapshot_mid_at_construction, limit_price, filled_avg_price, overnight_bps, open_drift_bps,
   limit_vs_mid_bps, fill_vs_limit_bps, controllable_total_bps, close_to_fill_total_bps` — identity
   `overnight + open_drift + controllable == close_to_fill` must hold per row (tolerance ≤ 0.1 bps rounding).
2. **Cohort×tier aggregates** (mean / median / p25 / p75 / stdev / N) for each of the four components.
3. **Overnight-leg percentile placement** vs VI.I distribution — one line per cohort: *"cohort's overnight mean
   sits at pXX of VI.I overnight distribution"* — flags whether cohort overnights are inside / outside band.
4. **Controllable-slippage headline** — single mean-bps number across all 50 lots, plus per-cohort breakout.
5. **Verdict (framed exactly):** *"Is the controllable component consistent with intended limit construction
   (state the expected bps under the current limit-band + queue-position assumptions), or does it indict (a)
   limit-band width, (b) fire timing, or (c) queue-position tactics? Rank by measured bps contribution."*

## Honest caveats (pre-committed)

1. `snapshot_mid_at_construction` provenance depends on the entry-runner audit log actually persisting mid at
   construction. Confirm the field name + coverage in `overshoot_audit_logs` before compute; if missing for
   any of the 50 lots, report N-covered and flag the gap — do NOT fabricate or impute.
2. `filled_avg_price` on partial fills reflects volume-weighted broker fills. SHORT sleeve remains unfilled
   under Wave-2 — LONG lots only in scope.
3. `open(T+1)` uses Polygon official open, not the pre-market print — documented convention, not defect.
4. Any lot missing `snapshot_mid_at_construction`, `limit_price`, or `filled_avg_price` is enumerated
   individually and excluded from aggregates.

## Sequencing

- **Gate:** ACT-493 (exit adoption, deadline Thursday 2026-07-17) — real-money remediation takes priority.
- **Interleave:** W5-01 / W5-02 / W5-03 have no mutual dependency; any order is fine.
- **Downstream:** none this week. If controllable leg indicts, a follow-up charter on limit-band / fire-timing
  tuning is deferred to that verdict.

## Not doing (out of scope)

- No changes to `overshoot-entry-run` limit construction or fire timing.
- No changes to `overshoot_audit_logs` schema.
- No study-corpus recomputation (W5-02 territory).

## Cross_ref

- ACT-505 (parity audit — measured the 1–2% cohort entry-slippage means this decomposes)
- VI.I (overnight-gap distribution baseline)
- `supabase/functions/overshoot-entry-run/` (limit construction, read-only reference)
- ACT-493 (gating charter)
- ACT-507 (W5-02, sibling) / ACT-508 (W5-03, sibling)
