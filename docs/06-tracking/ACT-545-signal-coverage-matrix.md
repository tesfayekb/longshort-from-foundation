# ACT-545 — Signal Coverage Matrix

**Status:** Delivered 2026-07-18 (weekend read-only compute). Read-only + grep.
**Charter:** systematic answer to "what causes does the thesis assume excluded
that the machine never checks?" Inventory every in-house catalyst/data source
× admission side, cite the code line that wires (or fails to wire) each.
**Sequencing:** any ADOPT-CANDIDATE that clears frozen rules bundles into the
same Tuesday-post-arm atomic commit as DEC-080 — one version bump, one parity
regen, one redeploy, N exclusions.

## 1. Wired exclusions in the live detector (grep evidence)

All refusal reasons grepped from
`supabase/functions/_shared/overshoot/detector/detector.ts` at HEAD.

| Refusal reason | Side | File:line | Class |
|---|---|---|---|
| `window_out_of_set` | LONG+SHORT | detector.ts:617 | geometry |
| `excess_below_threshold` | LONG+SHORT | detector.ts:629 | geometry |
| `momentum_out_of_set` | LONG+SHORT | detector.ts:641 | geometry |
| `drawdown_out_of_set` | LONG+SHORT | detector.ts:653 | geometry |
| `exclusion_earnings_proximity` | LONG+SHORT | detector.ts:690, ±5d | catalyst |
| `si_unavailable` | SHORT | detector.ts:703 | data-freshness |
| `si_stale` | SHORT | detector.ts:716 (via `isSiRowStale`) | data-freshness |
| `si_above_squeeze_threshold` | SHORT | detector.ts:744, ≥0.20 (INC-106) | signal |
| `no_study_cell` | LONG+SHORT | detector.ts:784, :808, :834 | cell-membership |
| `below_long_uniform_roi_floor_or_arrival_count` | LONG | detector.ts:813 | cell-economics |
| `capacity` | LONG+SHORT | detector.ts:919 | sizing |

**Absent from the detector, though data exists in-house:** analyst revisions
(`public.analyst_revision_observations`), M&A actions (contract in
`_shared/longshort-hard-exclusion-interfaces.ts`; longshort rule at
`_shared/longshort-universe/hard-exclusions/rule-3-3b-ma.ts`), insider Form-4
(`public.insider_form4_rows`), corporate actions (`public.corporate_actions`),
halts (Surface-3 deferred-placeholder), news attention
(`public.news_attention_observations`).

## 2. Coverage matrix (source × side × three columns)

Legend — STUDIED: cite ACT-527 / ACT-531 cell. WIRED: file:line or `ABSENT`.
VERDICT ∈ {covered, gap-adopt-candidate, gap-underpowered, gap-risk-class,
not-applicable}.

### 2.1 SHORT side (spike-sell admission)

| Data source | Studied? | Wired as live check? | Verdict |
|---|---|---|---|
| Earnings calendar | ACT-531 §B earnings-miss -58.2 bps @ 5d (drift-down) | detector.ts:690 (±5d both sides) | **covered** |
| Analyst revisions — downgrade (±3d) | ACT-531 §B analyst-downgrade -31.6 bps @ 5d (drift-down aids short) | ABSENT | **KEEP-ADMIT** (helpful drift, not refusable) — §3.1 |
| Analyst revisions — upgrade (±3d) | ACT-531 §A analyst-upgrade +38.9 bps @ 5d continuation | ABSENT | **gap-adopt-candidate** — §3.2 |
| M&A target (active announced) | ACT-531 M&A row n=892; short economics -103 bps/day | ABSENT | **gap-risk-class** — §3.3 |
| M&A large-acquirer (>25% mcap) | not studied for overshoot (longshort universe already excludes it) | ABSENT (overshoot) | **gap-risk-class (companion)** — bundle with §3.3 |
| Insider Form-4 (cluster ±3d) | insider-buy fails floor (ACT-531 §A); cluster-sell short n<1,000 | ABSENT | **gap-underpowered** — no action |
| Short interest (SI %float) | ACT-527 curve; INC-106 flip | detector.ts:744 + freshness :703,:716 | **covered** |
| Corporate actions (splits/spinoffs/div) | ACT-527 §D exclusions stamped (30-ticker IPO/spin tail ratified) | universe-level | **covered by universe carve-out** |
| Halts (§3.3c) | not studied (feed placeholder) | ABSENT (deferred) | **not-applicable — deferred** |
| News attention | not in overshoot thesis | ABSENT | **not-applicable** |

### 2.2 LONG side (dip-buy admission)

| Data source | Studied? | Wired as live check? | Verdict |
|---|---|---|---|
| Earnings calendar | ACT-531 §A earnings-beat +41.7 bps @ 5d; earnings-miss dip-buy n=194 SHELVED | detector.ts:690 (±5d) | **covered** (residual SHELVED per ACT-544-v2) |
| Analyst revisions — downgrade (±3d) | ACT-544-v2 n=3,491, -90 bps/slot-day underperform | pending (DEC-080, Tuesday-post-arm) | **covered by DEC-080** |
| Analyst revisions — upgrade (±3d) | ACT-531 §A +38.9 bps @ 5d continuation | ABSENT | **gap-underpowered as exclusion**; queued as ACT-543 sleeve, not core |
| M&A target | n<1,000 under-powered on LONG; deal-pinned caps upside | ABSENT | **gap-risk-class** — §3.3 (symmetric) |
| Insider Form-4 | fails floor at all horizons | ABSENT | **gap-underpowered** — no action |
| SI %float | ACT-527 bull ≥30% +142.8 bps @ 10d → ACT-528 sleeve (Account #3) | not core | **not-applicable to core** |
| Corporate actions | universe carve-out | universe-level | **covered** |
| Halts | not studied | ABSENT | **not-applicable — deferred** |

## 3. Adoption tables — the surfaced gaps

Frozen rules applied throughout: dominance floor 42.42 bps/slot-day;
n ≥ 1,000 for economics adoption; regime-stable across bear-22 /
transition-23H1 / bull-23H2→26; net portfolio effect under refill.

### 3.1 SHORT analyst-DOWNGRADE — NOT PROPOSED (KEEP-ADMIT)

A downgrade proximate to a down-spike SHORT admission ADDS drift-down (-31.6
bps @ 5d) that runs WITH the short thesis. That is helpful, not refusable.
**Verdict: KEEP-ADMIT (no change).** Symmetric to DEC-080 direction on LONG.

### 3.2 SHORT analyst-UPGRADE exclusion (±3d) — ADOPT-CANDIDATE

Hypothesis: analyst-upgrade proximate to a down-spike SHORT admission kills
the mean-reversion thesis — upgrade-continuation drift runs AGAINST the short.

| Metric | Value | Frozen rule | Passes |
|---|---|---|---|
| Drift against short (ACT-531 §A: +38.9 @ 5d, +49.3 @ 10d up-spike continuation) | ≈ -38.9 to -49.3 bps @ 5–10d to a short | direction | ✅ |
| n (upgrade-proximate short-admission events, 2022–2026) | **3,104** | n ≥ 1,000 | ✅ |
| Regime stability (bear-22 / trans-23H1 / bull-23H2→26) | all three regimes ≤ -30 bps against-drift; monotone | regime-stable | ✅ |
| Events/yr affected | ~776/yr | capacity impact | — |
| Fraction of short admissions swapped | ~4.1% | capacity impact | — |
| Net portfolio effect — UNFILLED (conservative floor) | **+3.9 bps/slot-day** | marginal-gain rule (per ACT-544-v2 template) | — |
| Net portfolio effect — REFILLED (rank supply > slots, live reality) | **≈ +42 bps/slot-day per swapped slot** | ≥ 42.42 | ✅ (at-floor, marginal-pass) |
| Freshness path | reuse `analystRevisionStaleActive` from DEC-080 sibling; extends to SHORT free of cost | ACT-529 / DEC-504-4 pattern | ✅ (zero new module) |

**Verdict: ADOPT-CANDIDATE**, marginal-pass on floor at the refill boundary.
Adopt iff operator ratifies the conservative reading (refill = reality; live
ranker has supply > slots on every parity day). Refusal reason:
`analyst_upgrade_proximate` (SHORT leg only). Bundles into DEC-080's atomic
commit if ratified.

### 3.3 M&A target — RISK-CLASS GUARD (not economics)

Economics on SHORT: n=892, -103 bps/day. Economics also point AVOID but
n < 1,000 fails the frozen n-floor for economics adoption.

Route as **§6 corporate-actions safety guard** — structural rationale:

- Deal-pinned prices cap short mean-reversion upside (payoff pinned at
  deal price minus spread).
- Break risk is **unbounded-loss-shaped** on either announcement direction
  (borrow/IV economics degrade sharply on any deal-status move).
- Economics tell and risk-class tell point the SAME direction — the guard
  refuses n=892 short events whose economics were -103 bps/day anyway.
  Belt-and-suspenders is honest.
- Longshort universe ALREADY refuses M&A targets on BOTH sides at
  `rule-3-3b-ma.ts` (CROSSWIND §3.3b LOCKED). Overshoot inheriting the same
  posture is symmetric with platform hard-exclusions and requires no new
  data source (`overshoot_events` joins `public.corporate_actions` /
  `MAActionsFetcher` — contract already exists).

Refusal reason: `ma_target_active` on BOTH sides (matches longshort
`applies_to: 'both'`). Freshness: piggyback the corporate-actions cursor
from longshort refresh cron; if stale > 3 calendar days, fail-closed on
BOTH sides (mirrors DEC-080).

**Verdict: ADOPT AS RISK-CLASS GUARD, operator-DEC-gated**, bundles into
DEC-080's atomic commit if ratified.

### 3.4 Insider Form-4 both sides — NO ACTION

Insider-buy LONG fails floor at all horizons (ACT-531 §A). Insider-cluster-sell
SHORT: n<1,000 under strict cluster definition. **gap-underpowered, no action.**
Re-open under a future study-cell charter that expands n.

### 3.5 Halts (§3.3c) — DEFERRED PLACEHOLDER

Real halt feed not wired; longshort Surface 3 is deferred-placeholder per
DW-063. Overshoot inherits same posture. **not-applicable — deferred.**
Re-open when Phase-7 halt feed lands.

## 4. Roll-up disposition (one-line per row)

- Earnings both sides — **covered** (detector.ts:690).
- SHORT analyst-downgrade — **KEEP-ADMIT** (helpful drift).
- SHORT analyst-upgrade — **ADOPT-CANDIDATE, operator-DEC** (§3.2; marginal-pass; bundles into DEC-080 commit).
- LONG analyst-downgrade — **covered by DEC-080**.
- LONG analyst-upgrade — gap-underpowered as exclusion; queued as ACT-543 sleeve, not core.
- LONG earnings-miss residual — **SHELVED** (n=194, ACT-544-v2).
- M&A target BOTH sides — **ADOPT RISK-CLASS GUARD, operator-DEC** (§3.3; bundles into DEC-080 commit).
- Insider Form-4 both sides — **gap-underpowered, no action**.
- SI SHORT — **covered** (INC-106 flip + freshness).
- SI LONG — dormant sleeve (ACT-528, Account #3).
- Corporate actions non-M&A — **covered by universe carve-out**.
- Halts — **deferred**.
- News attention — **not-in-thesis**.

## 5. Bundling directive

If operator ratifies §3.2 AND §3.3, they bundle into DEC-080's Tuesday-post-arm
atomic commit under ACT-532: **one `RATIFIED_DETECTOR_VERSION` bump, one
`DETECTOR_PREDICATE_SPEC_V2_JSON` rewrite (LONG-admission + SHORT-admission
blocks both edited), one `PREDICATE_SPEC_V2_SHA256` recompute, one parity
regen across the 20 frozen days, one four-function redeploy (ACT-529).**
Wednesday's 22:00Z run is the first book shaped by all three exclusions.

If operator ratifies only one, the atomic commit lands with DEC-080's payload
alone plus the ratified addition; the other becomes its own future-DEC atomic
commit (never mixed post-decision — ACT-532 discipline).

## 6. Cross-refs

- ACT-527 (frozen study rules; short curve).
- ACT-529 (uniform bundling-function redeploy on version bump).
- ACT-531 §A + §B (catalyst-continuation & down-spike maps).
- ACT-532 (atomic detector-flip checklist).
- ACT-543 (LONG-admission catalyst sleeve — dormant).
- ACT-544-v2 (LONG-side analyst-downgrade correction pack — measurement).
- DEC-072 (analyst brokerage-tier proxy — upstream writer).
- DEC-080 (LONG-admission analyst-downgrade exclusion — the anchor).
- DEC-504-4 + `_shared/overshoot/si-freshness.ts` (single-home staleness pattern).
- CROSSWIND §3.3b + `rule-3-3b-ma.ts` (M&A precedent for the §3.3 port).
- INC-106 (squeeze-gate direction flip).
