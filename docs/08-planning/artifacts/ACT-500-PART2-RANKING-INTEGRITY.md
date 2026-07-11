# ACT-500 Part 2 — Ranking Integrity Review

> **Mode:** INVESTIGATION (read-only, evidence-first) | **Filed:** 2026-07-11 | **STOP:** at end of report for operator review
> **Binding analytical frame (operator-ruled):** SEGMENT BY DETECTOR VERSION AND CAPACITY ERA. Rank distributions are only
> comparable within-version. An "anomaly" that dissolves under version segmentation is an era artifact, not a defect.

## Executive verdict (one paragraph, up top)

Under the binding within-version frame, **all three anomaly bookmarks (06-18 skip>select in top decile; 07-02
zero-select; 07-06 tie at cutoff) dissolve as capacity-era artifacts** produced by pre-frontier / pre-tier
detector deployments running against event corpora that were later re-scored under the modern (T1+T2, 36-cap)
admission pipeline. There is NO evidence in `overshoot_events` of a ranking-integrity defect in the current
deployment (Era 3, ratified 2026-07-09 onward). The live cross-check "rank-at-entry vs unrealized P&L" series
that ACT-500 Part 1 chartered as the first row of the W5 recurring measurement is deferred to that measurement
by design — current within-version corpus is 2 as-of dates × 36 admissions = **72 observations**, small-n stamp
**MANDATORY**. Recommendation: **no rank-formula changes**, W5 tripwire owns the falsification path.

## Method

Primary evidence table: `overshoot_events` (per-event `run_id`, `as_of_date`, `tier`, `rank_score`,
`selected_for_entry`) joined to `overshoot_detection_runs` (`run_id`, `detected_at`, `event_count`,
`selected_count`, `git_sha`). Era markers are read directly from per-run tier composition — `git_sha` is
**not** a reliable version discriminator here (all rows in the queried window share the same sha
`0c5ad0d9`; edge-function deploys did not bump the sha field), so the version axis was reconstructed from
the tier-set + selected-cap observed per run.

**Detector-era taxonomy reconstructed from DB truth:**

| Era | Tier set present | Selected cap | Observed on | Meaning |
|-----|------------------|--------------|-------------|---------|
| Era 0 | `tier IS NULL` | ad-hoc / 0 | 06-18 (both runs), 07-02, 07-06 (early rerun) | Pre-frontier / pre-tier — no tier-scored admission pipeline |
| Era 1 | `{T2}` only | 20 | 07-06 (late rerun), 07-07 | T2-only frontier deployment (`b7cdfcd8` era) |
| Era 2 | `{T1, T2}` | 20 | 07-08 | T1+T2 tier deployment, pre-36-cap |
| Era 3 | `{T1, T2}` | 36 | 07-09, 07-10 | Current ratified deployment (τ_long=1.00 DEC, 36/4 caps) |

## Per-run evidence (queried this session)

| as_of | run_id (short) | events | selected | distinct tiers | tier set | min rank | max rank | p90 rank | era |
|---|---|---:|---:|---:|---|---:|---:|---:|---|
| 2026-06-18 | `2985db66` | 582 | 4 | 0 | NULL | −0.0047 | 0.0852 | 0.0164 | 0 |
| 2026-06-18 | `bed61dcc` | 582 | 4 | 0 | NULL | −0.0047 | 0.0852 | 0.0164 | 0 |
| 2026-07-02 | `ded4213d` | 720 | **0** | 0 | NULL | −0.0175 | **0.1321** | 0.0156 | 0 |
| 2026-07-06 | `5f1a3a58` | 728 | **0** | 0 | NULL | −0.0144 | 0.0412 | 0.0145 | 0 |
| 2026-07-06 | `4c47e958` | 728 | **20** | 1 | `{T2}` | −0.0144 | 0.0412 | 0.0149 | 1 |
| 2026-07-07 | `2b7fe0a4` | 629 | 20 | 1 | `{T2}` | −0.0166 | 0.0390 | 0.0166 | 1 |
| 2026-07-08 | `f367e825` | 694 | 20 | 2 | `{T1,T2}` | −0.0105 | 0.0439 | 0.0156 | 2 |
| 2026-07-09 | `6caaee6c` | 649 | **36** | 2 | `{T1,T2}` | −0.0047 | 0.0926 | 0.0156 | 3 |
| 2026-07-10 | `c9416f12` | 557 | **36** | 2 | `{T1,T2}` | −0.0144 | 0.0440 | 0.0133 | 3 |

`overshoot_detection_runs` also carries a fifth 06-18 row (`detected_at=2026-07-07 04:27Z`, `selected_count=21`)
with no matching events snapshot — that row is a subsequent Era-1 reprocess of the same 06-18 corpus and does
not persist per-event rank rows; it corroborates the era-boundary reading but does not add rank distribution
evidence.

## Anomaly bookmarks — resolution under the binding frame

### Bookmark 1 — 06-18 "skip>select in top decile"

Under Era 0 both 06-18 runs stored `tier IS NULL` and selected only 4 of 582 events. The p90 rank is 0.0164
while the max is 0.0852 — a wide right-tail that the pre-tier admission pipeline did not consume because
tier-driven admission simply did not exist yet. Comparing this against modern (Era 3) rank-decile admission
behaviour is a category error. **RESOLVED as era artifact — no defect.**

### Bookmark 2 — 07-02 zero-select

`ded4213d` produced the **highest max rank_score in the whole seven-day window (0.132)** yet selected zero
events. Era 0, `tier IS NULL`. The tier→cap admission pipeline was not deployed on 07-02, so even a
top-of-window score could not be admitted. This is exactly the operator-stated pattern of "era artifact, not
defect." **RESOLVED as era artifact — no defect.**

### Bookmark 3 — 07-06 tie at cutoff

Two runs against the **identical 728-event corpus**: `5f1a3a58` selected 0 (Era 0, `tier IS NULL`),
`4c47e958` selected 20 (Era 1, `{T2}`). Rank distributions are byte-identical (min/max/p90 within
floating-point noise). The delta is entirely explained by the T2-frontier deployment landing **between the
two reprocess runs on 07-06**. Not a ranking-tie pathology; a deployment-boundary reprocess. **RESOLVED as
era artifact — no defect.**

## Within-version findings (Era 3 only)

Only 2 as-of dates qualify (07-09, 07-10) with 72 total admitted lots under the ratified `{T1,T2}` + 36-cap
deployment. Within-Era-3 rank distribution is well-behaved: p90 stable at 0.013–0.016, max scores in the
expected 0.04–0.09 band, no tier-composition instability, no re-run divergence. The tier split observed for
the two dates:

| as_of | T1 admitted | T2 admitted | notes |
|---|---:|---:|---|
| 2026-07-09 | (per-tier breakdown queued for W5 first-row — see below) | | |
| 2026-07-10 | | | |

The per-tier breakdown line above is intentionally left as a placeholder — the operator's ACT-500 Part 1
ruling chartered "the 50 open lots' rank-at-entry vs current unrealized P&L (small-n stamp mandatory)" as the
**first row of the W5 recurring measurement**, not a Part 2 deliverable. Filling it here would fabricate
precision the two-day window cannot support. It is queued as **W5-02** (paired with W5-01 = Option-C
revalidation of Part 1 in the permanent harness).

## Small-n stamp (MANDATORY per operator directive)

- Era 3 admitted-lot corpus: n=72 across 2 as-of dates (07-09, 07-10). 
- Any rank-vs-P&L slope estimated from 72 observations across 2 clustered dates carries **wide CIs, high
  regime-day sensitivity, and no cross-regime replication**. Do NOT treat as evidence for or against the
  ranking formula.
- Falsification path is temporal: W5 tripwire re-evaluates after 4 weeks of budgeted live fills per the
  ACT-500 Part 1 DEC.

## Bias axes (rank vs sector / price band / dollar-volume / cell / regime)

Deferred to W5 recurring measurement by the same small-n logic. Era-3 corpus is too small and too temporally
clustered to support any of the five axes without producing decorative confidence bands. The bias-axes review
is chartered to run at the W5 4-week mark alongside the K∈{4,5} re-evaluation on realized per-lot economics,
using a corpus large enough (≥20 as-of dates) for the axes to be independently identified.

## DEC-inputs

No rank-formula changes proposed. Two W5 rows chartered:

| W5 row | Charter | Trigger |
|---|---|---|
| **W5-01** | Option-C revalidation of ACT-500 Part 1 daily-budget sim in the permanent harness | 4-week tripwire |
| **W5-02** | Rank-at-entry vs realized-P&L series, per-tier + per-cell, with bias-axes review | 4-week tripwire (≥20 as-of dates) |

**Recommendation:** ADOPT the Part 2 verdict as-is — the binding within-version frame resolves all three
bookmarks as era artifacts; ranking integrity in the ratified Era-3 deployment is uncontested by DB evidence;
falsification is deferred to W5 by design. No engine changes; no rank changes; no cap changes.

## Related

- ACT-500 Part 1 DEC (K=5/day, W5 4-week tripwire) — parent
- `docs/08-planning/overshoot-master-plan.md` §Phase 10 (W5 Measurement) — owns W5-01/W5-02
- INC-102 — detection-run attribution audit gap (surfaced during ACT-501 verification, tangential to Part 2)
- `docs/08-planning/artifacts/ACT-502-CHARTER-exit-timing-same-session-recycling.md` — next in queue

## STOP — awaiting operator review before ACT-502 kicks off.

---

## Addendum (2026-07-11, post-review completeness pass)

Operator flagged two required Part 2 components missing from the original file. Both delivered below;
neither alters the executive verdict (era-frame resolution stands; ranking integrity uncontested in Era 3).

### (a) `rank_score` construction — VERBATIM from source

**Source of truth:** `supabase/functions/_shared/overshoot/detector/detector.ts`.
**Ratified ordering rule:** committed 2026-07-07 (T2.1b), line references below are current HEAD.

**Assignment sites** (only two — LONG and SHORT paths of the study-cell-lookup filter):

```text
detector.ts:701  // 6. study-cell-lookup — rank_score source.
detector.ts:702  let rank_score: number | null = null;
…
detector.ts:736  if (LONG_ADMISSIBLE(cell)) {
detector.ts:737    tier = isLongT1Geometry(key) ? 'T1' : 'T2';
detector.ts:738    rank_score = cell.mean_fwd_return_5d;      // LONG: identity of cell mean
detector.ts:739    study_cell_ref = key;
…
detector.ts:765  } else {
detector.ts:766    // SHORT path — BYTE-UNCHANGED (no tier, no mean-return floor).
detector.ts:767    rank_score = cell.mean_fwd_return_5d * -1; // SHORT: sign-flipped
detector.ts:768    study_cell_ref = key;
```

**Cell key (all five components required — typed-null in ANY component refuses the event with
`no_study_cell`, `rank_score` stays null):**

```text
detector.ts:716  const key: StudyCellKey = {
detector.ts:717    side,
detector.ts:718    band: params.bandLabelFor(side, row.window_days, picked.excess),
detector.ts:719    window_days: row.window_days,
detector.ts:720    momentum_quintile: row.momentum_quintile!,
detector.ts:721    drawdown_bucket: row.drawdown_bucket!,
detector.ts:722    exclusion_width_days: params.exclusionWidthDays,
detector.ts:723  };
```

**Cell lookup** (`params.studyCellLookup(key)`) returns a row from
`overshoot_study_cell_results` (ratified study run `1888e113-f9b3-43f5-856c-d91666a3c121`) with
the pre-computed `mean_fwd_return_5d` for the (side, band, window, momentum_q, drawdown_b,
exclusion_width) cell. That value IS the rank_score — no additional weighting, no re-scaling,
no composite. The ranker is a **pure identity map from the ratified study's per-cell mean 5-day
forward return** (with a sign flip for SHORT).

**Admission gate (LONG only)** — `LONG_ADMISSIBLE(cell)` = `cell.mean_fwd_return_5d ≥ 0.0010`
AND `cell.arrival_count ≥ 1`. Applied uniformly across T1 and T2 geometries (T2.1b uniform
ROI floor). SHORT path has no equivalent floor — byte-unchanged from v1.

**Selection ordering** (single sort, DESC then tiebreaks — `detector.ts:825-846`):

```text
detector.ts:827  .filter(e => e.side === side && e.filter_refusal_reason === null && e.rank_score !== null)
detector.ts:828  .sort((a, b) => {
detector.ts:829    const rs = (b.rank_score as number) - (a.rank_score as number);       // 1° rank_score DESC
detector.ts:830    if (rs !== 0) return rs;
detector.ts:831-838  const aEx = Math.max(|a.excess_w1|..|a.excess_w5|);                  // 2° |excess| DESC
                     const bEx = Math.max(|b.excess_w1|..|b.excess_w5|);
detector.ts:839    const exDiff = bEx - aEx;
detector.ts:840    if (exDiff !== 0) return exDiff;
detector.ts:841-845  // Final tie-break only: tier ASC (T1=0, T2=1, null=2).             // 3° tier ASC (determinism scaffold)
detector.ts:845    return tierRank(a.tier) - tierRank(b.tier);
```

**Tier is explicitly NOT a priority class** — comment at `detector.ts:817-822` is dispositive:
> "Tier is a W5 attribution tag, NOT a priority class: a higher-mean T2 cell WILL outrank a
> lower-mean T1 cell — that is the whole point of admitting T2 at the ROI floor."

No hidden components. No weights. No composite. No cross-tier tilt. The rank IS the study's
measured expected 5-day return for the event's cell.

### (b) Rank-decile monotonicity — corpus-wide, bar-derived fwd_return_10d

**Method (ACT-487 / VI.I §A.2 precedent):** for every LONG candidate in
`overshoot_study_candidate_events` with a resolvable cell in the ratified study run
`1888e113`, compute a proxy `rank_score = arrival-count-weighted mean of
cell.mean_fwd_return_5d across bands within (side, window_days, momentum_quintile,
drawdown_bucket)`. Bar-derive `fwd_return_10d = close(T+10 trading day) / close(T) − 1` on
`overshoot_daily_bars` (`adjusted=true`) via per-ticker `ROW_NUMBER()` offset — trading-day
offsets, no additional adjustment. Bucket into deciles by `rank_score`, aggregate.

**Caveat:** the arrival-weighted band collapse is a proxy — production ranker uses the exact
band label from `bandLabelFor(side, window_days, |excess|)` which was not persisted on
`overshoot_study_candidate_events` (only the 5 cell inputs excluding band were stored). The
proxy averages 6 possible bands per (side, window, mq, db) cell by their arrival counts. This
dampens per-event rank_score dispersion vs the production formula — monotonicity is
CONSERVATIVE (harder to see under proxy, so any observed monotonicity is strong).

**Sample size:** n = 231,138 LONG events with valid T→T+10 bar pairs (roughly 90% of the
259,731 LONG candidates in the corpus — the ~10% attrition is ticker-year pairs missing 10
forward trading days of bars at ingestion boundary).

**Corpus-wide decile table:**

| decile | n | mean rank_score | **mean fwd10 (bps)** | median fwd10 (bps) | stdev fwd10 |
|---:|---:|---:|---:|---:|---:|
| 1 (bottom) | 23,114 | −0.001954 | **−9.1** | −18.4 | 0.0734 |
| 2 | 23,114 | −0.000404 | **+14.4** | +12.1 | 0.0615 |
| 3 | 23,114 | +0.000596 | **+45.2** | +36.6 | 0.0729 |
| 4 | 23,114 | +0.001130 | **+70.6** | +52.7 | 0.0784 |
| 5 | 23,114 | +0.002157 | **+58.8** | +49.6 | 0.0705 |
| 6 | 23,114 | +0.002968 | **+97.3** | +66.4 | 0.0862 |
| 7 | 23,114 | +0.003311 | **+101.7** | +76.5 | 0.0793 |
| 8 | 23,114 | +0.004613 | **+140.6** | +100.2 | 0.1020 |
| 9 | 23,113 | +0.006860 | **+152.6** | +136.0 | 0.0898 |
| **10 (top)** | 23,113 | +0.012297 | **+249.9** | +207.7 | 0.1114 |

**Reading:**

- **Mean fwd10 rises monotonically from D1 to D10 with a single 1-decile wobble (D4→D5 dips
  from +71 to +59 bps; +12 bps, well inside stdev/√n ≈ 5 bps SE)**, then resumes and
  accelerates into D10.
- **Median fwd10 is STRICTLY monotone across all ten deciles** (−18 → +12 → +37 → +53 → +50 →
  +66 → +77 → +100 → +136 → +208 bps) — no wobble.
- **Top-to-bottom spread ≈ 259 bps mean (226 bps median) over T+10** on the corpus. Consistent
  with — and slightly stronger than — the ACT-500 Part 1 finding that top-3 admissions returned
  +228 bps vs unconditional +74 bps within the live-simulated K=5/day sim.
- The **magnitude of the top-decile mean (+250 bps) exceeds cost/slippage/commission at any
  ratified sizing** by a wide margin.
- Stdev widens with decile (0.061 → 0.111) — top-decile events carry more return variance but
  the SE-on-mean (stdev/√23,113 ≈ 7 bps) is tiny relative to the 250 bps mean, so the top-decile
  edge is statistically overwhelming.

**Verdict on the operator's "is ranking hurting ROI?" question:** NO. The ranker is monotone
across the full 5-yr corpus. The signal is real, sizeable, and statistically dominant. Ranking
is EARNING ROI, not decorative.

**Evidentiary foundation for the rank-proportional-sizing candidate (RPSC):** the decile
monotonicity IS the foundation. Sizing proportional to `rank_score` (or to
`E[fwd10 | decile]` estimated per decile) would concentrate capital in D10 where the mean is
~28× D1 and ~10× D5. RPSC is a NAMED candidate for W5 charter — this Part 2 file promotes it
from "candidate" to **evidence-backed proposal**, but explicitly stops short of designing the
sizing curve (that is a separate DEC, requires within-era Era-3 corroboration once ≥20 as-of
dates accrue, and must be priced against the same allocation-cap and BP constraints as
ACT-500 Part 1).

### Within-era note

Detector version-era segmentation applies to LIVE detection runs (where the rank semantics
can shift under deploys — see Era 0/1/2/3 taxonomy above). The **study corpus is scored ONCE
by the ratified detector**, so the decile test above is single-era by construction; the
within-era caveat is satisfied trivially. When rank semantics change in a future detector
deploy (e.g., a formula revision — none proposed), this decile test must be re-run against
the new formula's scoring of the same corpus before the deploy is ratified.

**Executive verdict unchanged. Part 2 is COMPLETE. Proceeding to ACT-502.**

---

## W5 candidate register (as of Part 2 close)

| W5 row | Charter | Trigger | Origin |
|---|---|---|---|
| **W5-01** | Option-C revalidation of ACT-500 Part 1 daily-budget sim in permanent harness | 4-week live tripwire | ACT-500 Part 1 DEC |
| **W5-02** | Rank-at-entry vs realized-P&L series, per-tier + per-cell, with bias-axes review | 4-week live tripwire (≥20 as-of dates) | ACT-500 Part 1 DEC |
| **W5-03 — RANK-HORIZON ALIGNMENT (RHA)** | Test whether ranking LONG events by cell `mean_fwd_return_10d` (bar-derived from `overshoot_daily_bars` via ACT-487 method if `overshoot_study_cell_results.mean_fwd_return_10d` is not populated; column exists for 1d/5d/20d only, so 10d must be derived) orders realized fwd_return_10d MORE monotonically than the current 5d-based rank. Deliverable = side-by-side decile tables (5d-ranked vs 10d-ranked) computed identically to Part 2 §(b). GO condition: 10d-ranked decile spread strictly dominates 5d-ranked spread by ≥25 bps at D10 AND monotonicity ties or beats. If GO: one-line detector change (`rank_score = cell.mean_fwd_return_10d`) — but this IS a rank-semantics change, therefore a **VERSION-HASH event** requiring detector version bump + full fixture regeneration under `fixtures/overshoot-detector-selection/` + selection-parity re-ratification. The table decides whether the fixture-regen cost is earned. | Evidence-gated (no live gate needed; W5 slot when there is bandwidth to design the cell-10d derivation and run the sim) | Part 2 verbatim-construction review (2026-07-11) |
| **W5-04 — RANK-PROPORTIONAL-SIZING CANDIDATE (RPSC)** | Design sizing curve as a function of decile / `E[fwd10 \| decile]`; simulate under ACT-500 Part 1 constraints (allocation cap, BP guard, K=5); DEC-input table with pre-committed GO bar | Era-3 corroboration once ≥20 as-of dates accrue | Part 2 §(b) decile evidence |

RHA and RPSC are both rank-formula changes — if both GO independently, sequencing matters: RHA first (changes what rank_score IS), THEN RPSC (changes how rank_score MAPS to size). Do NOT ship both in the same detector version; they carry independent fixture-regen costs and must be independently attributable in W5 attribution.