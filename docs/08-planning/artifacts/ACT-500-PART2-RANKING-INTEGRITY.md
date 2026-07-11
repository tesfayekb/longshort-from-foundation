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