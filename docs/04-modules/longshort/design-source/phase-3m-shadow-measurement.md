# Phase 3.M — Shadow-Book Measurement Harness

> **Owner:** Long-Short Module | **Last Reviewed:** 2026-06-19

## Purpose

Resolve **DW-109** — the §4.3.5 exclusion gate vs. coverage-weighted shrinkage choice — on **forward-return evidence**, not snapshot composition. ACT-240 established the *magnitude* (Variant A overturns 18/20 long + 16/20 short on a single as_of) but is structurally incapable of establishing *direction* (does the new entrant subsequently move?). Phase 3.M instruments a parallel shadow path so the eventual gate decision is defensible under the pre-registered rule in **DEC-059**.

## Scope

- Applies to the FP-052 combiner only.
- 3.M is *measurement-only*: the live 3.0c gated path (the published `combiner_book`) is **byte-identical** before and after every 3.M sub-phase.
- 3.M does NOT touch `combiner_book`, `combiner_rankings`, `combiner_feature_vectors`, `combiner_model_registry`, or any ranker/orchestrator `.ts`.

## Sub-phase ladder

| Sub-phase | Deliverable | Status |
|-----------|-------------|--------|
| **3.M-i** | Schema (MIG-100): `combiner_book_shadow`, `combiner_forward_returns`, `combiner_shadow_variant_config` + DEC-059 + this design doc | **LANDED (this commit)** |
| 3.M-ii    | Shadow assembler: no-exclusion reader over `signal_observations`, criticals-symmetric composite, `adjusted = composite × n / (n + k)` shrinkage, 12-variant writer | pending |
| 3.M-iii   | Edge fn `longshort-combiner-shadow-rank` + cron (post-3.0c-rank, daily, strict ordering) | pending |
| 3.M-iv    | Edge fn `longshort-combiner-forward-returns` + cron (post-close, daily, idempotent, trading-day-arithmetic) | pending |
| 3.M-v     | DW-109 promotion read-model (per-variant T+1/T+5/T+20 mean edge + paired-t + turnover) | pending |

## Architecture (3.M-ii…v scope; documented here for the build prompts that follow)

```
signal_observations  (the AUTHORITATIVE source — all tickers, no exclusion)
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│ shadow-assembler.ts (NEW, 3.M-ii)                            │
│  - reads signal_observations directly (NOT combiner_feature_ │
│    vectors — see "Source-of-truth note" below)               │
│  - per variant from combiner_shadow_variant_config:          │
│     1. apply inclusion_rule (gated/criticals_required/no_gate)│
│     2. compute composite via the same §6.4 formula as live   │
│        ranker (criticals-symmetric — see invariant note)     │
│     3. shrinkage adjustment: adjusted = composite × n/(n+k)  │
│     4. reuse computeRankings + seedBook pure helpers         │
│        from supabase/functions/_shared/longshort-combiner/   │
│  - writes combiner_book_shadow with PK (op,date,variant,…)   │
└──────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│ forward-returns.ts (NEW, 3.M-iv)                             │
│  - reads (combiner_book ∪ combiner_book_shadow) for matured  │
│    horizons {T+1, T+5, T+20} (trading-day offsets read off   │
│    the bar array, NOT calendar arithmetic, NOT Date.now())   │
│  - PolygonPriceHistoryFetcher.fetchClose(ticker, seed_date)  │
│    + .fetchClose(ticker, horizon_close_date)                 │
│  - raw_return       = close[horizon] / close[seed] - 1       │
│  - side_signed_return = (side='long' ? +1 : -1) × raw_return │
│  - typed-absence on price-fetch failure                      │
│    (price_source_status ∈ {polygon_404, fetch_error} ⇒       │
│     raw_return / side_signed_return NULL — never -999)       │
│  - writes combiner_forward_returns (idempotent UPSERT)       │
└──────────────────────────────────────────────────────────────┘
        │
        ▼
   DW-109 promotion read-model (3.M-v)
   per DEC-059: T+5 mean edge ≥ 15bp, paired t p<0.05, n≥30
```

## Live-path invariance (load-bearing)

The published `combiner_book` (read by Phase-4 portfolio sizing and the `longshort.combiner.book_published` event) is **the live gated path**. Phase 3.M:

1. NEVER modifies `combiner_book`, `combiner_rankings`, `combiner_feature_vectors`, `combiner_model_registry`, `combiner_shap_attribution`.
2. NEVER alters `ranker.ts`, `book-seeder.ts`, `ranker-orchestrator.ts`, `feature-assembler.ts`, `feature-assembler-orchestrator.ts`.
3. Adds only new files under a `_shared/longshort-combiner-shadow/` namespace and new edge functions whose names are `*-shadow-*`.

Any 3.M sub-phase build that proposes a change to a live-path file is **out of scope** and requires its own FP.

## Source-of-truth note (critical — must NOT be substituted in 3.M-ii)

The shadow assembler **MUST** read from `signal_observations`, **NOT** `combiner_feature_vectors`. Excluded rows in `combiner_feature_vectors` persist with `features = {}` and `excluded_reason ∈ {missing_critical_signal_6, missing_critical_signal_7, below_coverage_threshold}`. Reading the vector table would silently collapse the `no_gate` and `criticals_required` variants to the gated-140 cohort and produce *false-negative* shadow evidence (the entire point of 3.M is to measure the ~700 names the gate excludes).

## Criticals-symmetric composite (invariant)

Under `inclusion_rule = 'no_gate'`, Signals #6 (cross_sectional_momentum_12_1) and #7 (short_term_reversal_1w) MUST be treated **symmetrically** with non-criticals — i.e. encoded as a typed-absence `{__value, __is_present}` pair that contributes to the composite only when present. The live §4.3.5 invariant (criticals are bare numerics on disk and presence-guaranteed for included rows) is preserved on the live path because the shadow path NEVER writes back to `combiner_feature_vectors`. The shadow composite is computed in-memory per-variant; it never persists a feature-vector representation.

## Forward-return horizons & trading-day arithmetic

Horizons are **trading-day** offsets, not calendar-day offsets:

- T+1 = next trading day after the seed `as_of_date`
- T+5 = 5th trading day after
- T+20 = 20th trading day after

The `horizon_close_date` is derived by indexing the Polygon bar array (`bars[i].t` ascending), NOT by calendar arithmetic. `Date.now()` / `new Date()` / `performance.now()` are banned in this module (Gate 1 `check-wall-clock.ts` enforces). The `seed_as_of_date` is parameterized by the caller (cron driver passes the matured date).

## Polygon call-budget (3.M-iv)

Estimated daily call budget under steady state:

- Union of unique tickers across (live book 40) ∪ (12 shadow variants × ≤40 each) — *dedupes by ticker* because Polygon returns the full bar series in one call.
- Upper-bound unique tickers per day ≈ 100–200 (most variants overlap heavily).
- 1 fetch per ticker per maturation day × 3 horizons that share a fetch ⇒ ~100–200 Polygon calls/day. Well under daily-cap budget.

## Turnover metric (free byproduct)

Per-variant day-over-day book overlap is computable directly from `combiner_book_shadow` via:

```sql
WITH today AS (SELECT ticker, side FROM combiner_book_shadow WHERE variant=$v AND as_of_date=$d),
     yest  AS (SELECT ticker, side FROM combiner_book_shadow WHERE variant=$v AND as_of_date=$d - INTERVAL '1 trading day')
SELECT COUNT(*) FILTER (WHERE t.ticker IS NOT NULL)::float
       / NULLIF(COUNT(*) FILTER (WHERE y.ticker IS NOT NULL), 0) AS jaccard
FROM today t FULL OUTER JOIN yest y USING (ticker, side);
```

No schema cost; pre-registered (per DEC-059) to be weighed **net-of-cost** at the Phase-5 promotion gate so a gross winner that churns is not promoted on gross edge alone.

## DW-109 promotion (pre-registered — VERBATIM from DEC-059)

- **Primary:** promote a relaxed variant to live ONLY IF `mean(variant.side_signed_return − live_gated.side_signed_return)` at the T+5 horizon ≥ **15 bp**, paired t-test **p<0.05**, on **n ≥ 30 paired seed-days** measured **after DW-106 coverage-heal**.
- **Corroboration (directional, not magnitude):** T+1 and T+20 mean edges have the **same sign** as T+5.
- **Tie-break across qualifying variants:** highest T+5 mean edge; ties broken by lower variance of the daily edge series.
- **Net-of-cost guard:** per-variant turnover weighed at the Phase-5 promotion gate; a gross qualifier with disqualifying turnover is not promoted on gross alone.
- **Pre-registration clause:** this rule is locked **before** any post-DW-106 data accrues; changes require an explicit FP + superseding DEC.

## Dependency note — when can DW-109 actually resolve?

Phase 3.M-ii through 3.M-v can begin measurement immediately after they land, BUT DW-109 cannot **resolve** until ≥30 paired seed-days accrue **post-DW-106 coverage-heal** (currently SI=0, options=32, news=97 on 2026-06-16; five of nine signals sparse). Deciding the gate against today's degraded snapshot would lock in an artifact of pipeline gaps, not a property of the cohort. Realistic earliest resolution: 8–12 weeks after DW-106 lands.

## Schema (MIG-100, applied 2026-06-19)

### `combiner_book_shadow`
- PK `(operator_id, as_of_date, variant, side, rank_within_side)`
- UNIQUE `(operator_id, as_of_date, variant, ticker)`
- `inclusion_rule ∈ {gated, criticals_required, no_gate}`, `k ≥ 0`, `side ∈ {long, short}`
- RLS: SELECT on `longshort.view`; writes service_role-only (3 RESTRICTIVE deny policies)

### `combiner_forward_returns`
- PK `(operator_id, source_table, variant, seed_as_of_date, ticker, horizon_td)`
- `source_table ∈ {combiner_book, combiner_book_shadow}`, `horizon_td ∈ {1, 5, 20}`
- `price_source_status ∈ {success, polygon_404, fetch_error}`
- **Typed-absence CHECK** (`combiner_forward_returns_typed_absence_chk`): success ⇒ all return fields NOT NULL; non-success ⇒ raw_return + side_signed_return NULL. **No -999, ever.**
- RLS identical to `combiner_book_shadow`.

### `combiner_shadow_variant_config`
- PK `(variant)`. Seeded with 12 active rows (cross-product of `{gated, criticals_required, no_gate} × {0, 3, 5, 10}`).
- Adding `k=2` (or any new variant) later is **one INSERT** — no migration, no code change. This is the config-driven family knob.

## Dependencies

- MIG-100 (this commit) — schema landing
- DEC-059 — locked resolution rule
- DW-109 — the question being measured
- DW-106 — coverage-heal (blocking dependency for DW-109 *resolution*, not for measurement start)
- ART-017 / CROSSWIND §4.3.5, §6.4 — the live gate + composite formula being compared against

## Used By / Affects

- 3.M-ii…v build FPs (subsequent commits)
- DW-109 promotion FP (future, post-evidence)

## Risks If Changed

HIGH — this doc is the design lock for the next four sub-phase build prompts. Any drift in the source-of-truth note, criticals-symmetric composite, or typed-absence rule allows a future build to silently degrade the measurement.

## Related Documents

- [longshort.md](../longshort.md)
- [DEC-059](../../../decisions/DEC-059-dw109-resolution-rule.md)
- [Deferred Work Register — DW-109](../../../08-planning/deferred-work-register.md)
- [Feature Proposals — FP-052](../../../08-planning/feature-proposals.md)