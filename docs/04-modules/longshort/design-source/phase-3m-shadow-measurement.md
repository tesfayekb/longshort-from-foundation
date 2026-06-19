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
| 3.M-ii    | Shadow assembler: no-exclusion reader over `signal_observations`, criticals-symmetric composite, `adjusted = composite × n / (n + k)` shrinkage, 12-variant writer | **PURE LAYER LANDED** (ACT-242) — `shadow-constants.ts` / `shadow-assembler.ts` / `shadow-ranker.ts` + tests; orchestrator + writer pending 3.M-iii |
| 3.M-iii   | Edge fn `longshort-combiner-shadow-rank-manual` + shadow-ranker orchestrator (12-variant in-memory compute → chunked UPSERT into `combiner_book_shadow`); cron sibling deferred to 3.M-v phase-extension | **ORCHESTRATOR + MANUAL EDGE FN LANDED** (ACT-243) — `shadow-ranker-orchestrator.ts` + manual handler; deployed; live §22.5.1 smoke pending operator JWT |
| 3.M-iv    | Edge fn `longshort-combiner-forward-returns-manual` + pure accruer + orchestrator (per-ticker dedup, bounded-concurrency Polygon fetch, anti-join idempotent UPSERT into `combiner_forward_returns`); cron sibling deferred to 3.M-v | **MANUAL EDGE FN + ACCRUER + ORCHESTRATOR LANDED** (ACT-244) — `forward-return-constants.ts` / `forward-return-accruer.ts` / `forward-return-orchestrator.ts` + manual handler; deployed; live §22.5.1 smoke pending operator JWT |
| 3.M-v     | DW-109 promotion read-model (per-variant T+1/T+5/T+20 mean edge + paired-t + turnover) | pending |

> **Cross-ref:** the locked promotion criteria + §1a single-checkpoint evaluation rule live in [`docs/decisions/DEC-059-dw109-resolution-rule.md`](../../../decisions/DEC-059-dw109-resolution-rule.md) (first cross-ref under the ratified standalone-DEC convention).
>
> **3.M-ii pure-layer note (ACT-242):** the shadow ranker's composite is a deliberate, isolated fork of the live `computeComposite` — the live function THROWS on an absent critical (load-bearing §4.3.5 invariant) and that throw is preserved untouched; the shadow composite guards on presence instead (criticals-symmetric, never throws) so the gate-relaxed regimes can be measured. A regression-tie unit test in `shadow-ranker_test.ts` asserts that for fully-gated input at `{ inclusionRule: 'gated', k: 0 }` the two rankers produce identical `(ticker, long_rank, short_rank)` — the load-bearing guard against silent drift.
>
> **3.M-iii orchestrator note (ACT-243):** the shadow orchestrator floors the universe to the latest `universe_membership` snapshot ≤ `as_of` (verbatim with the live `feature-assembler-orchestrator.ts`), reads exact-`as_of` `signal_observations` via `fetchAllRows` (1000-row PostgREST cap defeat — same corrective as ACT-237), intersects signal rows with the floored universe set (drops non-universe tickers), then computes ALL 12 active variants from `combiner_shadow_variant_config` in memory BEFORE any UPSERT. Any `ShadowBookOverlapError` returns `outcome:'failed'` with ZERO partial write. Persistence is a chunked UPSERT into `combiner_book_shadow` with `onConflict='operator_id,as_of_date,variant,side,rank_within_side'`; every row carries `computed_at = as_of.toISOString()` (DEC-034 (4) — no wall-clock). NOT writing `combiner_rankings_shadow` at 3.M-iii (book-only; per-variant ranks table is deferred and re-derivable from the book at forward-return read time). NO cron in this sub-phase — operator-invoked smoke only.

> **3.M-iv accrual job note (ACT-244):** the FR orchestrator reads BOTH `combiner_book` (live, no `variant` column — rows are tagged `LIVE_VARIANT_LABEL='live_gated'` per DEC-059 §2/§pairing) and `combiner_book_shadow` (12 active variants) via `fetchAllRows`, crosses with `HORIZONS_TD=[1,5,20]`, applies a calendar-day maturation floor `MATURATION_FLOOR_CAL_DAYS={1:1,5:5,20:20}` (provably loose — H trading days always span ≥ H calendar days; the bar array is the authoritative maturation check), anti-joins against rows already in `combiner_forward_returns` (full PK), dedups survivors to distinct tickers, then fetches Polygon adjusted-daily bars at `FR_CONCURRENCY=20` via `PolygonPriceHistoryFetcher` (re-used verbatim from FP-009 Bucket A; `FR_LOOKBACK_DAYS=60` calendar days brackets the 20-trading-day max horizon). Per-ticker failures become typed `'error'` bundles and surface as `price_source_status='fetch_error'` rows with `raw_return=NULL` / `side_signed_return=NULL` (per the `combiner_forward_returns_typed_absence_chk` CHECK); ONE bad ticker NEVER crashes the run (mirrors `momentum-orchestrator.ts`). `accrueReturns(...)` is the DB-free pure layer: `raw_return = bars[seed_idx+H].close / bars[seed_idx].close − 1`; `side_signed_return = side==='short' ? −raw_return : raw_return`. Persistence is a chunked UPSERT into `combiner_forward_returns` with `onConflict='operator_id,source_table,variant,seed_as_of_date,ticker,horizon_td'` and `computed_at = as_of_run.toISOString()` (DEC-034 (4) — no wall-clock). NOTE: both `ranker_source` vocab values flow into FR via the `source_table` + `variant` discriminators (FR has no `ranker_source` column); the live arm carries `(source_table='combiner_book', variant='live_gated')`, every shadow arm carries `(source_table='combiner_book_shadow', variant=<one of 12>)`. NO write to `combiner_rankings_forward_returns` (does not exist; book-keyed FR is the 3.M-iv authoritative emission). NO cron — operator-invoked smoke only at 3.M-iv.

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

## Maturation-retry semantics (3.M-iv corrective, ACT-245)

The `combiner_forward_returns` anti-join treats ONLY `price_source_status='success'` rows as terminal. Non-success typed-absence rows (`fetch_error`, `polygon_404`) are re-attempted every run and overwritten in place by the `onConflict` UPSERT the moment the horizon trading day's close settles on Polygon. The bar array — NOT the calendar maturation floor (`MATURATION_FLOOR_CAL_DAYS[H]`) — is the authoritative maturation signal: the floor is a pre-fetch pruning optimization that admits the tuple as soon as `run_date − seed ≥ H` calendar days, which under the 3.M-v daily cron lands one calendar day before the H-th *trading* day's close has settled (e.g. a T+1 seed at 23:30 UTC on day D first fires the FR job at 03:00 UTC on D+1, when D+1's bar is still pre-market on Polygon). Without the retry semantics this would write `fetch_error` and the legacy anti-join would lock the now-computable return out forever; with them, the row flips to `success` on the next run and overwrites the typed-absence row by PK.

Permanent gaps (delisted, halted long-term, ticker change) remain terminal typed-absence indefinitely — the correct DEC-059 outcome (the tuple drops out of both numerator and denominator of every (V − live_gated) pairing). DW-110 logs the optional observability split (`horizon_pending` enum) and Polygon-budget cap for permanent-gap retries — pure observability + budget, NOT correctness; the anti-join fix carries the measurement series through to DEC-059 resolution unaided.

## 3.M-v — daily cron arming (ACT-246)

Two cron edge fns mirror the `longshort-momentum-compute` skeleton VERBATIM (cron-only `verifyCronSecret`; sole-wall-clock `productionClock.getWallClockTs()`; `.started`/`.completed`/`.failed` audit envelope with `trigger:'cron'`):

- **`longshort-combiner-shadow-rank`** at `30 23 * * 1-5` (23:30 UTC weekdays) — reuses `createShadowRankerOrchestrator` to seed `combiner_book_shadow` for all 12 active variants daily. No `POLYGON_API_KEY` check (orchestrator reads `signal_observations` only).
- **`longshort-combiner-forward-returns`** at `0 3 * * 2-6` (03:00 UTC Tue–Sat — morning after US trading) — reuses `createForwardReturnOrchestrator` to accrue matured T+1/T+5/T+20 returns into `combiner_forward_returns`. `POLYGON_API_KEY` checked → 500 `polygon_api_key_unset`. INDEPENDENT of shadow-rank — iterates PAST matured seeds (today's seed gets accrued tomorrow at the T+1 boundary, then again at T+5/T+20 as bars settle, per the ACT-245 retry corrective).

Neither fn carries a `job_registry` row — 3.M is the shadow-measurement harness (DEC-040 scoping; visibility = the shadow tables + `longshort_audit_logs`). Both 200-on-completed AND 200-on-failed (clean orchestrator failure path with typed `failure_reason`); per-ticker `fetch_error` / `polygon_404` rows are NORMAL typed-absence (the retry semantics flip them to `success` once bars settle). 500 reserved for orchestrator throw.

The schedule is **operator-applied** via `sql/19_longshort_combiner_shadow_cron_schedule.sql` through the Supabase SQL Editor (§22.5.3, NOT the migration tool). Existing `CRON_SECRET` is REUSED — no new secret minted. The template carries an ASCII-quote self-check (`grep -P '[\x{2018}…]'`) defending against the jobid:78 curly-quote crash class, plus the canonical post-apply verification block (DEC-040 clauses 1–3). The DEC-059 measurement window for DW-109 opens on operator schedule-apply.

## Phase 3.M COMPLETE (closure summary)

- **3.M-i (MIG-100 / ART-026)** — 3-table schema (`combiner_book_shadow`, `combiner_forward_returns`, `combiner_shadow_variant_config`) + 12 active variants seeded.
- **3.M-ii (ACT-242)** — pure no-exclusion shadow ranker (criticals-symmetric composite + coverage shrinkage) + regression-tie test against the live ranker on fully-gated input (E4: 40/40 byte-identical) + DEC-059 §1a single-checkpoint clause.
- **3.M-iii (ACT-243 / ART-029)** — `shadow-ranker-orchestrator.ts` (universe-floored, paginated `signal_observations` read, all-12-variants in-memory compute → chunked UPSERT) + `longshort-combiner-shadow-rank-manual` edge fn.
- **3.M-iv (ACT-244 / ART-030)** — `forward-return-orchestrator.ts` + `forward-return-accruer.ts` (dedup-by-ticker bounded-concurrency Polygon fetch, anti-join idempotent UPSERT, typed-absence per the CHECK — never -999) + `longshort-combiner-forward-returns-manual` edge fn.
- **3.M-iv corrective (ACT-245 / DW-110)** — anti-join filtered to `price_source_status='success'` so non-success typed-absence rows retry every run until the horizon bar settles (closes latent cron-timing systemic return-loss; pairs with 3.M-v cron arming).
- **3.M-v (ACT-246 / ART-031 + ART-032)** — two cron edge fns deployed + 401-probed + Deno-tested (combiner suite 100 → 112 PASS) + operator-applied schedule template `sql/19_*_shadow_cron_schedule.sql`. **DEC-059 measurement window opens on operator schedule-apply**.

Phase 3.M is closed at ACT-246 from the code-and-deploy side. The remaining gate is operator schedule-apply + the 30-paired-seed-day accrual window (DEC-059 §1a). DW-109 resolution and any DW-110 observability work (horizon_pending enum, permanent-gap retry bound) are out of 3.M scope.

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