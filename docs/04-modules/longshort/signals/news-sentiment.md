# Signal #8 — News Sentiment Momentum (CROSSWIND §4.4.8)

**Status:** live (REGISTERED, **ARMED** — MIG-090 flipped
`job_registry.longshort.news.compute.enabled=true` 2026-06-12 paired
with operator-applied `cron.job` jobid 90 at `30 21 * * 1-5` UTC
(DEC-040 byte-match verified). DEC-043-pattern wall-clock attestation
**OPEN** — pending the first natural cron fire at the next weekday
21:30 UTC slot, distinguished from manual fires by completed_at
wall-clock-proximity to 21:30 UTC vs the as_of-derived midnight
signature of manual fires). **Schedule slot:** `30 21 * * 1-5` UTC
(after analyst 21:00, before options 22:00; non-overlapping init
triggers).
**Architecture:** SEQUENTIAL-FEED consumer on the FP-045 cursor-drain
queue engine — first of its kind. Operator ratification 2026-06-11
(Option 1 in the Phase-3 fork) after Phase-0 evidence (35–70 pages ×
6.3 s = 220–441 s) disqualified single-invocation against the 120 s
STOP gate and 150 s HTTP wall.
**Vendor:** Polygon `/v2/reference/news` (global feed, `next_url`
pagination). DEC-056 binds the v1 conscious approximations.

## 1. Formula — CROSSWIND §4.4.8 (verbatim, `CROSSWIND_SPEC.md:522`)

```
For each article A about name N in trailing 7 days:
  sentiment_A     = provider_sentiment(A)              // -1 to +1
  source_weight_A = 1.0 (tier-1: Reuters, Bloomberg, WSJ, FT, Dow Jones)
                    0.7 (tier-2: CNBC, Forbes, Barron's, NYT business)
                    0.4 (tier-3: Yahoo Finance, MarketWatch, aggregators)
                    0.1 (tier-4: blogs, regional, low-quality)
  age_weight_A    = exp(-age_in_hours / 24)
raw_signal_N = Σ sentiment_A × source_weight_A × age_weight_A
```

Within-sector z-score per §4.4.8 normalization clause; ±3σ winsorize;
typed-absence semantics on degenerate sectors (`singleton_sector`,
`zero_dispersion`) per the shared normalizer. Per-(article,ticker)
attribution per DEC-056 §(b) — POSITIVE divergence from the spec's
primary-tag heuristic, honored by the Polygon `insights[]` shape that
carries independent per-ticker sentiment per article (WWDC fixture:
AAPL→neutral while GOOG/GOOGL→positive on the same article).

## 2. DEC-056 bindings (v1 conscious approximations)

| Clause | Binding | Phase-3b status |
|---|---|---|
| §(a) categorical→numeric | `{positive:+1, neutral:0, negative:−1, mixed:0}` (frozen in `news-filters.ts → SENTIMENT_MAP`) | active |
| §(b) per-(article,ticker) attribution | `insights[].sentiment` per ticker direct (no primary-tag heuristic) | active |
| §(c) static publisher→tier table | `PUBLISHER_TIER_TABLE` (tier-1/2 seeded forward-compat; tier-3 = current entitlement pool) | active |
| §(d) unmapped publisher default | `DEFAULT_TIER_WEIGHT = 0.4` (tier-3 equivalent — lowest-risk Bayesian prior) | active |
| §(e) PR-wire deny-list | `PRESS_RELEASE_DENY_SET` — exclusion BEFORE staging (drop pre-feed_items) | active |
| §(f) time-decay + look-ahead | `age_hours = (asOf_ms − published_ms) / 3_600_000`; `published_utc ≤ as_of` gate re-applied PER PAGE in `fetchOnePage` | active |
| §(g) FinBERT v2 fallback | DEFERRED to v2 (1 % `news.insights_missing` tripwire — `insights[]` presence was 100 % in Phase-0 probe) | deferred |
| §(h) sparse-coverage names | typed skip `no_articles_in_window` per the universe-mass-balance discipline | active |
| §(i) typed-skip taxonomy | `no_articles_in_window`, `data_unavailable`, `fetch_error`, `missing_sector`, `singleton_sector`, `subscription_gated`; NO sentinel numerics | active |
| §(j) cadence governance | DEC-048 interim — `daily (after-close; queue-drained ~3-6 min; §4.4.8 5-min intraday target deferred per DEC-048)` | active |
| §(k) honest-semantics rider | v1 effective semantics = equal-weight aggregator sentiment (every surviving article at this entitlement is tier-3 0.4, a constant erased by within-sector z); seeded table self-activates if tier-1/2 publishers appear | active |

### DEC-056 Phase-3b addenda (Rule 8 — single-line each)

- **§(architecture)** Sequential-feed on the FP-045 cursor-drain queue engine, ratified by operator 2026-06-11 after the latency-bound breach (35–70 pages × 6.3 s = 220–441 s vs the 120 s STOP gate and 150 s HTTP wall) disqualified single-invocation; Option 1 in the Phase-3 fork.
- **§(cap-provenance)** Polygon `/v2/reference/news` rate cap reads "unlimited" per the operator dashboard → SELF-IMPOSED engineering cap 10 req/s (rate-bound at this entitlement is trivially non-binding, ≈1.76 s/slice — the latency bound 94.5 s/slice is the binding number); recorded as self-imposed per anti-phantom discipline ("unlimited" is not a pacing parameter).
- **§(architecture) corrected-arithmetic addendum (supervisor ruling 2026-06-12, operator-visible at arm-up prompt)** The original 35–70-page latency-bound that motivated sequential-feed conflated the Polygon default page size with `limit=1000`: at `limit=1000` the true 7d global pool is ≈928 articles ≈ 2 pages ≈ 22 s end-to-end (measured, run `9e8395a7`). The sequential-feed architecture is **RETAINED** on three forward-looking grounds: (1) robustness to pool growth — vendor expansions or upgraded entitlements could push pool size above the 120 s single-invocation gate; (2) validated path — the engine + dedupe + telemetry contracts are now live-fire-validated by runs 72d7f1e3/74e46ece/9e8395a7 and re-architecting would discard that evidence; (3) cross-signal serialization — slice/sweeper crons already drain news alongside PEAD/options/analyst at minute granularity without extra coordination. The 35–70-page figure is reframed as a robustness ceiling, NOT a binding pre-flight number.
- **§(coverage)** First-clean-run coverage = 96 persisted / 839 universe = **11.4 %** at the v1 4-publisher entitlement (3 tier-3 + 1 PR-wire excluded; tier-1/2 absent). Sparse-coverage is a KNOWN v1 property — DEC-056 §(h) typed-skip `no_articles_in_window` (743 names this run) is the discipline. Precedent: options-flow Phase 4 ran at comparable sparse coverage on a similar entitlement footprint. The combiner must treat news as a presence-aware input (a present z-score is a real signal; an absent value is `no_articles_in_window`, not a 0).
- **§(meta-non-persistence)** Per-name `meta.prExcluded` / `meta.unmappedPublisherCount` live on the slice events + `signal_queue_feed_items` rows, NOT on the per-name `signal_observations.meta` payload (the feed-mode finalizer's `computeFromItems` adapter passes `tierMapped: true` to preserve `raw` exactly — see §5.2). Recorded as a named v1 limitation; aggregate is recoverable from `signal_queue_feed_items` post-hoc and a future Phase-4 MIG could add `tier_mapped boolean` to feed_items if per-name precision becomes observable-evidence-required.

## 3. Pre-flight arithmetic (both-bounds discipline per Catalog #39)

| Bound | Formula | Value | vs wall | Status |
|---|---|---:|---|---|
| **Latency-bound (binding)** | `pagesPerSlice × OBSERVED_PAGE_LATENCY_S = 10 × 10.2` | **102 s** | 18 s headroom vs 120 s STOP gate; 48 s vs 150 s HTTP wall | SAFE |
| Rate-bound (non-binding) | `pagesPerSlice / (10 rps × 0.85)` = `10 / 8.5` | ≈1.18 s | n/a — latency dominates by ≈87× | non-binding |
| Runaway guard | `maxPages` | 100 | exceeds Phase-0 observed worst-case (70 pages) by ≈1.4× | SAFE |

`OBSERVED_PAGE_LATENCY_S = 10.2` is the MEASURED end-to-end per-page
wall from run `9e8395a7-6f5f-4bd0-a213-149a06a5af5a` (20.4 s ÷ 2 pages,
including fetch + 3317-row upsert + finalize). It SUPERSEDES the prior
Phase-0 row 17 fetch-only figure (6.3 s/page, retained here as
provenance per Rule 8: the superseded number was a fetch-only probe and
did not include the per-page upsert + finalize cost). The structural
arithmetic is asserted by `news-sentiment-queue-registration_test.ts`
— any tweak of `pagesPerSlice` or `OBSERVED_PAGE_LATENCY_S`
mechanically breaks the test before the table here goes stale.

**Full-run estimate (post DEC-056 §(architecture) corrected
arithmetic):** Typical run at the v1 entitlement (≈928-article 7d pool
→ ≈2 pages) completes in 1 slice ≈22 s end-to-end. The Phase-0
35–70-page worst-case is retained as a robustness ceiling — at 10
pages/slice it would drain in ⌈70/10⌉ = 7 slices ≈ 7 min. Both fit the
truth-in-telemetry cadence `"daily (after-close; queue-drained
~3-6 min …)"` registered alongside.

**First-CLEAN-run measurement (run `9e8395a7-6f5f-4bd0-a213-149a06a5af5a`,
as_of 2026-06-12, fired 02:11:40 UTC — third sequential-feed fire; first
two terminal-failed pre-INC-73/74 fixes):** `feed_pages_fetched = 2`,
single slice, wall 02:11:40.064 → 02:12:00.503 = **20.4 s end-to-end**
(slice fetch+upsert+finalize). Per-page wall ≈ **10.2 s/page** (2 pages
including the 3317-row upsert overhead — strictly higher than the
Phase-0 6.3 s/page fetch-only number). The 2-page count is dramatically
below the Phase-0 35–70 estimate — the vendor `next_url` chain
terminated at page 2 for this as_of, not a slice-cap hit (cursor drained
to NULL cleanly, no runaway-guard trip). Latency-bound headroom held
with margin to spare. Forward binding: this measurement is one
data-point; the binding pre-flight numbers remain the Phase-0 row 17
evidence (6.3 s/page, 35–70 pages worst-case) until a multi-fire
distribution is collected.

## 4. WWDC per-ticker example (CROSSWIND §4.4.8 + DEC-056 §(b))

Polygon Phase-0 probe item — WWDC keynote 2026-06-09 10:00 UTC,
publisher Benzinga (tier-3, weight 0.4), `insights[]`:
- `{ticker: 'AAPL', sentiment: 'neutral'}` → sentimentNum = 0.0
- `{ticker: 'GOOG',  sentiment: 'positive'}` → sentimentNum = +1.0
- `{ticker: 'GOOGL', sentiment: 'positive'}` → sentimentNum = +1.0

At `as_of = 2026-06-11 16:00 UTC`, age_hours ≈ 54; decay = `exp(-54/24)`
≈ `0.105`. Each ticker's per-article contribution:
- AAPL: `0.0 × 0.4 × 0.105` = **0.0** (neutral; included in
  `articleCount` but raw unchanged)
- GOOG:  `1.0 × 0.4 × 0.105` ≈ **+0.0419**
- GOOGL: `1.0 × 0.4 × 0.105` ≈ **+0.0419**

Demonstrates DEC-056 §(b) per-(article,ticker) attribution: one article
contributes INDEPENDENTLY to three names with three distinct sentiment
values. The §4.4.8 primary-tag heuristic is honored by mechanism
stronger than the spec.

## 5. Sequential-feed mode — engine wiring (FP-045 / FP-048 Phase 3a+3b)

News is the FIRST sequential-feed consumer on the engine. The
registration declares `mode: 'sequential-feed'` and supplies two
adapters:
- `fetchPage({cursorToken, asOf})` — wraps `PolygonNewsFeedFetcher.fetchOnePage`
  (additive Phase-1 surface, supervisor-authorized 2026-06-12 per the
  "never edited" = no semantic drift in verified modules
  interpretation; existing Phase-1 fetcher tests passed UNMODIFIED as
  the byte-equivalence regression fence). Per-page classify
  (`classifyArticle` per insight) → `FeedItemRecord[]`. Unavailable
  outcomes (subscription_gated, rate_limited, first-page
  data_unavailable) throw `SignalComputationError` → engine records
  `fetch_error`. Mid-walk `end` → `{items: [], nextToken: null}` so
  the engine finalizes the run normally.
- `computeFromItems({ticker, gicsSector, items, asOf})` — wraps
  `computeNewsSentiment` with `items` reconstructed into
  `NewsArticleEntry[]`. Zero-item names emit the kernel's typed
  `no_articles_in_window` skip — the mass-balance ruling (every
  universe name accounted for: value OR typed skip) lives in the
  consumer.

### 5.1 Processed-count semantics (named per operator directive)

| Counter | Meaning | Stamped where |
|---|---|---|
| `signal_queue_runs.feed_pages_fetched` | Pages fetched across all slices for this run (drain counter; runaway-guard against `maxPages`). | Incremented in the slice-worker per successful `fetchPage` call. |
| `signal_compute_log.persisted_count` | FINAL ticker count — universe names with a non-skip value. **Never pages.** | Stamped by the finalizer after `computeFromItems` runs per universe ticker. |
| `signal_compute_log.skip_counts.*` | Per-skip-reason bucket counts (mass-balance: persisted + Σ skips = universe_size). | Stamped by the finalizer. |

### 5.2 v1 limitation — `meta.unmappedPublisherCount` not recoverable from feed_items

The Phase-1 `classifyArticle` returns `tierMapped: boolean` so the kernel
can populate `meta.unmappedPublisherCount`. `signal_queue_feed_items`
stores `tier_weight` (the numeric) but NOT `tier_mapped` (the boolean).
At our current entitlement, tier-3 publishers (Benzinga, Motley Fool,
Investing.com) all carry weight 0.4 = `DEFAULT_TIER_WEIGHT` — making
tier-3 and unmapped indistinguishable post-hoc from `tier_weight` alone.

The wrapper passes `tierMapped: true` to the compute, which preserves
the `raw` value exactly. The only loss is the per-name observability
count of unmapped publishers. The aggregate is recoverable post-hoc
from `signal_queue_feed_items` if needed. A future Phase-4 MIG could
add `tier_mapped boolean` to feed_items if observability evidence
demands per-name precision. Documented as a v1 accepted limitation
rather than silently dropped (axiom 3).

## 6. Vendor + classification primitives

| Module | Owner | Phase | Notes |
|---|---|---|---|
| `polygon-news-feed-fetcher.ts` | longshort | FP-048 Phase 1 + Phase-3b additive | `fetchFeed` (in-process loop) + `fetchOnePage` (per-page primitive, Phase-3b additive; supervisor-authorized 2026-06-12). Look-ahead gate re-applied per page. Typed error taxonomy. Key masking on errors. |
| `news-filters.ts` | longshort | FP-048 Phase 1 | DEC-056 §(a)/(c)/(d)/(e) static tables + `classifyArticle` (single per-article entry point). |
| `compute-news-sentiment.ts` | longshort | FP-048 Phase 2 | Pure compute — kernel for §4.4.8 formula. No clock, no I/O. `NEWS_WINDOW_HOURS = 168`, `NEWS_DECAY_TAU_HOURS = 24`. |
| `news-sentiment-queue-registration.ts` | longshort | FP-048 Phase 3b | Sequential-feed consumer registration. Wraps the three modules above into the engine's `FeedFetchPageFn` + `FeedComputeFromItemsFn` shape. |

## 7. Edge-function surface

| Function | Auth | Notes |
|---|---|---|
| `longshort-news-compute` | `verifyCronSecret` | Daily enqueue shim. Mirrors PEAD/options-flow/analyst shim shape. Delegates to `initQueueRun(productionQueueRegistry.get('news_sentiment_7d'))`; returns 202. **DISARMED** at MIG-089b. |
| `longshort-news-compute-manual` | JWT + `longshort.manage` | Operator-triggered manual init. `parseAsOfDate({as_of:'YYYY-MM-DD'})` + future-date guard; dual-audit envelope (`manual_triggered` BEFORE init paired with `RUN_STARTED` on success or `manual_failed` on throw). |

## 8. Migration ledger entries

- **MIG-089a** (FP-048 Phase 3a) — substrate: `signal_queue_feed_items` table + `signal_queue_runs.feed_cursor` / `feed_pages_fetched` columns + nullability precondition assertion. RLS deny-write to authenticated, read via `longshort.view`.
- **MIG-089b** (FP-048 Phase 3b) — registry truth: inserts `longshort.news.compute` into `job_registry` (DISARMED, schedule `30 21 * * 1-5`); flips `signal_registry.news_sentiment_7d` from `planned`/`intraday (5 min)`/`Phase 2.8` to `live` with truth-in-telemetry cadence. Metadata-only DML; no DDL; no new slice/sweeper job rows (MIG-084 rows are shared engine rows, signal-agnostic by design).
- **MIG-090** (FP-048 arm-up — this PR) — flips `job_registry.longshort.news.compute.enabled` `false`→`true`, paired with operator-applied `cron.job` jobid 90 at `30 21 * * 1-5` UTC. DEC-040 byte-match (cron.job.schedule == job_registry.schedule == `30 21 * * 1-5`, byte-identical). DEC-043-pattern attestation OPEN — pending first natural cron-fire wall-clock signature at next weekday 21:30 UTC. Metadata-only `UPDATE`; no DDL; no GRANT/RLS/policy changes.

## 9. Cross-references

FP-048 (this signal's planning entry); DEC-056 (v1 bindings + §(k)
rider + Phase-3b §(architecture)/§(cap-provenance) addenda); DEC-047
(queue engine architecture); DEC-048 (cadence governance — interim
cadence per `job_registry.schedule`); FP-045 (queue engine — extended
by Phase 3a to support sequential-feed mode); MIG-082/083/084 (engine
substrate); MIG-089a/MIG-089b (this signal's schema + registry);
`queue-worker.md` (engine module doc — Phase 3b consumer row + the
sequential-feed mode section); CROSSWIND §4.4.8 (the binding spec).