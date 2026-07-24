# ACT-573 — Refused-Winners Forensics (Cohort Study)

**Status:** CHARTERED (charter-before-build per INC-136).
**Chartered:** 2026-07-24 evening.
**Owner:** overshoot module (read-only study).
**Related:** ACT-509 (ROI grid — sibling read-only), ACT-544/DEC-080/081
(exclusion adoption precedent), ACT-548 (backfill substrate),
DW-227 (ranking-predictive-value question this study answers),
42.42 bps/slot-day dominance floor (ratified adoption gate),
Catalog #65 (NO ARTIFACT, NO ASSERTION).

## 0. Honest-frame clause (READ FIRST — binding on any downstream ruling)

**12 live sessions = directional, not decisive.** No threshold / rank
/ K / cap tweak ships from this study alone. Any pattern found in the
live cohort MUST graduate to the ratified 2022–2026 corpus study
(same cells, same verdict grammar) BEFORE any config change. Adoption
gate remains the standard evidence ladder vs the 42.42 bps/slot-day
dominance floor. **Today's marks are excluded as evidence** — the
0–2d open-cohort is by-design red at entry week; using it as ROI
proof-point would repeat the fabrication class documented in INC-114
/ INC-115 (Catalog #62).

## 1. Population

Every detection-night candidate since **2026-07-08** (inclusive) with
stored rank + refusal class (or ADMITTED), joined to forward daily
bars for tier-appropriate exit basis.

**Sources (chains verbatim in Phase-1 SQL):**

| Column | Source table |
|---|---|
| Detection-night candidate | `overshoot_detection_runs` × `overshoot_events` (or refusal event mirror) |
| Rank | `overshoot_events.metadata->>'rank'` (primary path) with fallback to detection-run selection payload |
| Refusal class | `overshoot_events.action` + `overshoot_events.reason_class` (as emitted by entry-run refusal typing) |
| Admitted | `overshoot_lots` (opened on that detection date) |
| Forward returns | `overshoot_daily_bars` at entry-basis rule per tier |

## 2. Entry basis + exit horizon (per tier — apples-to-apples)

Match the ratified frontier (R-1) conventions:

| Tier | Entry basis | Exit basis |
|---|---|---|
| T1 | T+2 open | ordinal-6 close (per current R-1) |
| T2 | T+1 open | ordinal-10 close |

Cohorts that were REFUSED price the SAME entry basis / SAME exit basis
(so we're asking: "if we HAD admitted them, what would the same-rule
return have been?"). This is the honest apples-to-apples statement.

## 3. Cells (mechanical, verdict grammar pre-committed)

### Cell A — refusal_class × tier
Rows: one per refusal class emitted by the entry-run (verbatim strings
from `TERMINAL_ACTIONS` + non-terminal set + admitted).
Columns: `n`, `mean_bps`, `median_bps`, `win_rate`, `dispersion (σ)`.

### Cell B — rank-decile × tier
Rows: rank buckets {1–5, 6–10, 11–15, 16+} restricted to entry-eligible
survivors (post-τ, post-hard-exclusion).
Columns: same as A.

### Cell C — refused-winner feature scan
Sub-population: refused rows whose forward return exceeds tier-median
of admitted. For each: `excess_size_bps`, `sector (gics)`, `mcap_bucket`,
`gap_pct_at_detect`, `dollar_vol_20d`. Compare distributions vs the
admitted-winner sub-population using KS statistic; flag features where
`p<0.05` AND effect-size (Cliff's δ) > 0.2.

## 4. Pre-committed deliverables

1. **Cohort table** — Cells A + B rendered as one flat CSV/markdown,
   chains verbatim, `n<50` cells INSUFFICIENT-N-tagged.
2. **One-line answer** to the operator's question:
   > *"Are the refused outperforming the admitted anywhere, and on
   > what feature?"*
   
   Grammar: `"YES on {refusal_class or rank_bucket}, shared feature =
   {feature or 'none isolated'}, delta_bps = {N}, n = {N}."` OR
   `"NO refused sub-population outperforms admitted at tier-blend
   n>=1000."` OR `"INSUFFICIENT-N — all candidate cohorts n<1000."`
3. **Feature-scan table** (Cell C) — one row per feature, KS + δ + p.

## 5. Verdict grammar (mechanical, no interpretation)

For a candidate finding to graduate from directional (this study) to
actionable:

- **Directional pass (this study, live cohort):** `n >= 100` in the
  cohort cell AND `mean_bps > admitted_tier_mean_bps + 50` AND
  `win_rate > admitted_tier_win_rate + 0.10`.
- **Graduation:** Same cell re-computed on the ratified 2022–2026
  corpus with `n >= 1000` AND per-slot-day return `>= 42.42 bps` AND
  monotone-stable across ±1 refusal-class boundary AND ±1 rank
  decile.
- **Adoption:** DEC filed, R-1 re-parameterization, full evidence
  ladder — this charter does NOT authorize any config flip on its
  own.

## 6. Weekend Phase-1 SQL (deliverable this weekend)

Single SQL file at `scripts/act-573/refused-winners-cohort.sql`
producing Cells A + B + C as three `\copy` outputs. Read-only, no
schema changes, no writes to any table. Runtime target: < 60s on the
production corpus.

## 7. Explicitly out of scope

- Any engine change (entry-run, exit-run, detector, ranker, sizing).
- Any τ / cap / K change proposed from this study alone.
- Any cross-strategy generalization (overshoot only).
- Corpus re-fit (this consumes the ratified corpus; does not re-fit
  it).
- Live-cohort adoption gate — cannot happen without corpus graduation.

## 8. Cross-touchpoints

- **ACT-509 (ROI grid):** studies TIMING of admitted design.
- **ACT-574 (entry-day offset grid):** studies TIMING of the admitted
  cohort. ACT-573 is the parallel — TIMING vs SELECTION.
- **DEC-080/081/082:** current exclusion adoptions precedent for the
  evidence-ladder discipline this study inherits.
- **DW-227 (ranking predictive value):** ACT-573 Cell B directly
  answers this open question.

## 9. Acceptance

Study is DONE when:

1. This charter committed.
2. Phase-1 SQL committed at `scripts/act-573/refused-winners-cohort.sql`.
3. Three cohort artifacts produced (Cells A/B/C) filed under
   `docs/06-tracking/artifacts/ACT-573-Phase-1-*.csv`.
4. One-line answer per §4 filed in `docs/06-tracking/action-tracker.md`.
5. Any directional-pass finding is queued (not adopted) into the
   corpus-study charter (future ACT).
