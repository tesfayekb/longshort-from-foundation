# ACT-574 — Entry-Day Offset Grid (Timing of Admitted Design)

**Status:** CHARTERED (charter-before-run per INC-136).
**Chartered:** 2026-07-24 evening.
**Owner:** overshoot module (read-only corpus study).
**Related:** ACT-509 (ROI grid — sibling; ACT-509 asks entry×exit ROI;
ACT-574 asks entry-offset holding-exit-fixed), ACT-573 (parallel —
selection vs timing), R-1 (ratified frontier config: T1@T+2, T2@T+1),
42.42 bps/slot-day dominance floor, VI.I (overnight-gap conventions),
Part V (deployment-cap arithmetic), Catalog #65.

## 0. Operator challenge (READ FIRST)

> *"Is T+1/T+2 per-tier still the optimum, or does shifting entry
> later improve net?"*

Answered by re-running the ratified corpus across entry offsets, with
the exit LEG FIXED at the R-1 ordinal (counted from EVENT, not from
entry). Later entry ⇒ shorter hold of the SAME window. State this
apples-to-apples convention explicitly on every artifact — it is the
whole point.

## 1. Population

Same as ACT-509 Stage-1: ratified corpus events
(`overshoot_study_candidate_events` ⋈ `overshoot_daily_bars` ⋈
`overshoot_study_cell_results`), detector version `b7cdfcd8`, R-1
frontier config. Read-only.

## 2. Cells

**Grid:** `entry_offset ∈ {T+1 open, T+2 open, T+3 open}` ×
`tier ∈ {T1, T2}` × `regime ∈ {bull, neutral, bear}` (VIX-tercile
bucketing per corpus convention) × `year ∈ {2022, 2023, 2024, 2025, 2026}`.

**Exit:** FIXED at R-1 ordinal per tier — T1 ordinal-6-close from
event; T2 ordinal-10-close from event. Later entry ⇒ fewer holding
days of the same window.

**Measure (per cell):**

1. `mean_total_return_bps` — entry-basis close-to-exit-close (VI.I
   convention; entry uses T+k open basis where bars allow).
2. `holding_days_actual` (= ordinal − k) — for the per-slot-day
   denominator.
3. `per_slot_day_bps` = `mean_total_return_bps / holding_days_actual`.
4. `n`, `median`, `win_rate`, `dispersion (σ)`.

**Plus:** the DAY-BY-DAY average mark path per tier from
`T+0 close` through `exit_ordinal close`, one curve per tier —
the operator-owed picture: "how red is day 0–1 really, and when does
the turn come?"

## 3. Verdict grammar (pre-committed, binding)

Current config `(T1@T+2, T2@T+1)` must **WIN or TIE its column** at
`n>=1000 pooled per tier` for the ratified answer to stand.

Formally, the column-winner is the offset with highest
`per_slot_day_bps` at `n>=1000 pooled`. Ties (within 5% relative)
resolve TO CURRENT CONFIG (status-quo bias — refuses noise-driven
flips).

If a NON-current offset wins its column strictly (>5% relative uplift
at `n>=1000`), the finding routes to **operator ruling** with:

1. Delta in `bps/slot-day` (absolute and relative).
2. Delta in `$/yr at BLEND` — computed as `delta_bps_per_slot_day ×
   deployment_cap × trading_days_per_year / 10000`, using ratified
   Part V wallet-cap arithmetic.
3. Monotone-stability check across ±1 offset day (T+k winner must
   not collapse at T+k±1).

Thin cells (`n<1000` pooled per tier) are INSUFFICIENT-N-tagged and
CANNOT satisfy the ruling threshold — they are advisory only.

## 4. Deliverables

1. **One table** — grid rendered as flat markdown/CSV with chains
   verbatim, per-cell `n/mean/median/win_rate/σ/per_slot_day_bps` and
   INSUFFICIENT-N tags.
2. **Mark-path curve** — per tier, one PNG (matplotlib acceptable
   substrate) with T+0..T+exit_ordinal on x, mean cumulative return
   bps on y, one line per tier, IQR shading.
3. **One-line answer:** `"Current config (T1@T+2, T2@T+1) {WINS |
   TIES | LOSES to X} at n>=1000; delta = {N} bps/slot-day; $/yr at
   BLEND = {N}."`

## 5. Sequencing

Weekend slate, slots **AFTER**:

- ACT-571 (universe refresh re-point — Monday-10Z hard gate).
- ACT-515 engine configs (a)–(e) run.

Independent of:

- ACT-573 (studies REFUSED pool; this studies TIMING of admitted).
- ACT-509 Stage-2 (studies INTRADAY timing of a fixed entry offset).

## 6. Cross-touchpoints (must flag in results)

- **R-1 (ratified frontier config):** entry-offset is an R-1
  parameter; any change is a DEC + full evidence ladder.
- **Part V wallet-cap:** $/yr blend uses ratified deployment cap.
- **VI.I overnight-gap conventions:** entry-basis mix (T+k open +
  settled closes) documented per cell.
- **ACT-493 (exit adoption engine):** exit horizon FIXED here (this
  charter does NOT touch exit ordinal); no ACT-493 touchpoint unless
  a later charter proposes exit change from ACT-574 findings.

## 7. Honest caveats (pre-committed)

1. Later entry ⇒ shorter hold of same window. This is BY DESIGN
   apples-to-apples. It is NOT a comparison of "same holding period,
   different entry" — that is ACT-509 Stage-1 scope.
2. Corpus was fit under detector `b7cdfcd8`; no re-fit performed.
   Cells whose win depends on a currently-disarmed detector version
   are flagged.
3. Regime bucketing follows corpus VIX-tercile convention; a cell
   winning ONLY in a single regime × year × tier combo is
   INSUFFICIENT-N-flagged even if pooled `n>=1000` (regime
   robustness required).

## 8. Explicitly out of scope

- Any engine change (entry-run, exit-run, detector).
- Intraday timing within an entry day (ACT-509 Stage-2 scope).
- Exit-ordinal changes (would break the apples-to-apples convention).
- Cross-strategy generalization.
- Corpus re-fit.

## 9. Acceptance

Study is DONE when:

1. This charter committed.
2. SQL committed at `scripts/act-574/entry-offset-grid.sql` producing
   Grid table + mark-path underlying series.
3. Grid table + mark-path curve filed under
   `docs/06-tracking/artifacts/ACT-574-*`.
4. One-line answer per §4 filed in `docs/06-tracking/action-tracker.md`.
5. Any WIN routing to operator ruling includes the three deliverables
   in §3 (delta bps, delta $/yr, monotone-stability check).
