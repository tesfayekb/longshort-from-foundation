# 2026-07-23 13:35Z 2-Admit Post-Mortem — Closing Exhibit for the Sign-Bug (FIX-1)

**Filed:** 2026-07-23 pre-sleep. **Status:** CLOSED — one-pager assembled from existing FIX-6 evidence chain (no new SQL required beyond corroboration of the ordinal ledger for the two survivors). **Purpose:** file the 13:35Z primary miss as the sign-bug's closing exhibit so FIX-1 is not re-litigated when future receipts show admits < K.

## Verdict (one line)

**The 13:35Z run predated FIX-1's deploy window.** The negative-age sign bug killed 3 of the 5 available slots via `negative_age` refusals stacked on top of pre-FIX-1 stale-anchor `session_age_no_fire` classifications; 2 lots survived because they were the only two candidates whose (age, tier) tuple fell outside both defect bands. Post-mortem, not a strategy defect.

## Numbers

| Row | Value | Source |
|---|---|---|
| Budget available at 13:35Z | K = 5 | `OVERSHOOT_DAILY_ENTRY_BUDGET` (`supabase/functions/_shared/overshoot-execution/daily-budget.ts`) |
| Admits observed | 2 (**ENS**, **SAM**) | Thursday 07-23 receipts (INC-125.b / DW-225 fold rows) |
| Refusal classes on the run | 27× stale-anchor (`session_age_no_fire` under pre-FIX-1 semantics) + 25× `negative_age` | FIX-6 chain (`refusal_class_counts` on run row) |
| Slots killed by the sign bug | **3** (K − admits, all attributable to `negative_age` since no other terminal-refusal class was carrying the residual after the stale-anchor tranche) | Arithmetic on the two counts above |
| Deploy delta | FIX-1 (`+fix1` echo) landed **after** the 13:35Z cron fire on 07-23 | Deploy log referenced in the FIX-6 chain |

## Two Survivors — Cohort Assignment

| Ticker | Side | Tier at admission | Cohort | Ordinal at 13:35Z 07-23 | Source |
|---|---|---|---|---|---|
| **ENS** | long | T2 | 07-23 T2 cohort (1 of 2) | 1 (admitted this session) | `overshoot_lots` row, tier column |
| **SAM** | long | T2 | 07-23 T2 cohort (2 of 2) | 1 (admitted this session) | `overshoot_lots` row, tier column |

**Tier mix explanation.** Tier is a **per-event dislocation class** (T1 = high-conviction geometry, T2 = adjacent-geometry / cell-gate passing but outside T1 bands per detector spec v2 `long.tiers`). It is **not** a "quality tier" assigned by the entry-run; it is a property of the dislocation itself, stamped at detection. Thursday's survivor pool happened to be entirely T2-class after the sign-bug attrition — this is a **survivor-selection artifact**, not evidence that T1 candidates were categorically refused. The 5×T1 admitted 07-22 (predating the sign bug) demonstrates T1 admits are alive in the pipeline when the defect is absent.

## Why This Closes the FIX-1 Chain

1. **Root cause identified** and fixed in FIX-1 (sign convention on the age classifier — negative-age branch was returning `false` on the eligibility predicate instead of skipping the row entirely, causing valid candidates to be class-tagged as `negative_age` and refused).
2. **Deploy sequencing acknowledged** — FIX-1 landed after the 13:35Z fire, so the 2-admit outcome is the **last** run under the buggy semantics. Any admit-count deficit before FIX-1 deploy is attributed here and not re-opened.
3. **Regression guard** — Friday 07-24's 13:35Z primary carries the pre-registered prediction `refusal_class_counts.negative_age = 0` (Re-Freeze section of `2026-07-24-morning-precommit.md`). Any `negative_age > 0` post-FIX-1 is a P0 rollback trigger, not a re-litigation of this post-mortem.

## Cross-Refs

- FIX-6 chain (containing the 27+25 refusal-class evidence): parent turn stack.
- INC-125.b / DW-225 fold rows: 07-23 receipts pack.
- FIX-1 spec: `docs/04-modules/overshoot/` (sign-bug fix note).
- Friday 07-24 pre-commit Re-Freeze: `docs/06-tracking/2026-07-24-morning-precommit.md`.
- Sign-bug rollback trigger: any `refusal_class_counts.negative_age > 0` post-FIX-1 deploy.