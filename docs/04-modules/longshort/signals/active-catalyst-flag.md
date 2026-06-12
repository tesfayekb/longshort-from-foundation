# Signal #9 — Active Catalyst Flag (CROSSWIND §4.4.9)

**Status:** phase-3b-complete-stop (FP-049 / ACT-177, 2026-06-13 — MIG-091 applied DISARMED; `signal_registry` flipped `planned`→`live` with `job_registry_id='longshort.catalyst.compute'`; `JOB_ID_TO_SIGNAL_ID` extended to nine entries; ledger + DEC-057 §(f) addendum + DW-098 NYSE-calendar follow-up landed. **REGISTRY LIVE, CRON DISARMED** — arm-up is operator-side at the deploy + validation choreography turn per DEC-040 / DEC-048; DEC-043-pattern attestation OPEN pending first natural cron-fire wall-clock signature at next weekday 21:45 UTC after arm-up.).
**Vendors:** FMP (earnings-calendar + M&A + grades), Polygon (splits + dividends + news-keyword pages), Finnhub (FDA advisory), Tradier (DEC-057 §(i) typed-fallback only).
**Architecture:** SINGLE-INVOCATION (FP-047 shape). Ratified by the supervisor arithmetic gate 2026-06-13. Does NOT use the FP-045 queue-worker engine.

## 1. Formula — CROSSWIND §4.4.9 (verbatim, `docs/04-modules/longshort/design-source/CROSSWIND_SPEC.md:546-567`)

```
For each catalyst event E for name N in trailing 5 trading days:
   catalyst_weight(E) = 3.0 (Tier 1) | 1.5 (Tier 2) | 0.5 (Tier 3)
   age_weight(E)      = exp(-age_in_hours / catalyst_specific_half_life)
raw_signal_N         = Σ catalyst_weight(E) × age_weight(E)
Sign: Unsigned (always positive). Direction captured by other signals.
```

## 2. DEC-057 bindings (all ten clauses)

| Clause | Binding | Implementation site |
|---|---|---|
| §(a) Half-life table | Frozen: earnings 48h · M&A 96h · FDA 72h · regulatory 96h · guidance 48h · executive_change 72h · analyst_rating 24h · partnership 36h · dividend_change 36h · splits 24h. | `catalyst-types.ts` `CATALYST_HALF_LIFE_HOURS` (Object.freeze). |
| §(b) Keyword + verb gate | Word-boundary noun + action-verb match; numeric gate on guidance. `partners` ⊂ `partnership` substring collapse is structurally impossible. | `catalyst-keywords.ts` + `classify-catalyst-event.ts` `matchKeywordEvent`. |
| §(c) Decoupling | Catalyst fetchers MUST NOT edit Signal-#1/#8 modules. Phase-3a respects this: only `polygon-news-feed-fetcher.ts` had an additive `title?` / `description?` widen (Phase 1 ACT-174, supervisor-authorized Option B). | Fetcher set in `_shared/longshort-signals/active-catalyst/`. |
| §(d) Look-ahead gate (OCCURRED-ONLY) | `event_at <= as_of` enforced per-row at every fetcher AND in the classifier (defence-in-depth). Counted, never silent. | `catalyst-types.ts` `applyLookAheadGate`. |
| §(d) addendum (v1 approximation, Rule-8 append) | FMP earnings rows carry no time field — v1 anchors all such rows at 12:00 ET (blank-branch session anchor). Finnhub `bmo`/`amc` hour enrichment is a named follow-up (DW-097) contingent on Phase-7 IC ablation evidence. Materiality bounded at ≤ ±6.5h vs the §(a) 48h earnings half-life (~13% per-event age-weight envelope; panel z-score absorbs). | `fmp-earnings-calendar-fetcher.ts` header + DW-097. |
| §(e) Dividends declaration-date | Declaration date is the event_at; NEVER substitute ex-date. Missing declaration date → counted (`declaration_date_unavailable`), row dropped. | `polygon-dividends-fetcher.ts` + `tradier-corporate-actions-fetcher.ts`. |
| §(f) Window arithmetic | `window_start_at = nthPrecedingTradingDay(as_of, 5)`. v1 approximation: weekends-only (US exchange holidays NOT modelled). Bounded shortfall ≤ 1 trading day per double-holiday week, absorbed by 48h earnings half-life. | `active-catalyst-orchestrator.ts` `nthPrecedingTradingDay`. |
| §(g) IN-set (v1) | 10 event types: earnings · ma · splits · dividend_change · analyst_rating · fda_advisory · executive_change · guidance · regulatory_action · partnership. OUT-set (deferred to v2): FDA approval/rejection outcome, buyback announcement, conference, non-material product launch, investor day. | `catalyst-types.ts` `CatalystEventType` + `CATALYST_TIER_BY_EVENT_TYPE`. |
| §(h) 1h-bucket cross-vendor dedup | `dedup_key = ticker|event_type|hour_bucket(event_at)`. Vendor precedence: structured > keyword. Within tier: first-occurrence-wins. | `classify-catalyst-event.ts` `dedupKey` + `shouldReplace`. |
| §(i) Tradier typed-fallback | Tradier is invoked ONLY when Polygon splits OR dividends returned `unavailable`. 0 calls per fire in normal operation. `tradier_fallback_invoked` flag surfaces in audit + log. | `active-catalyst-orchestrator.ts` Stage 3. |
| §(j) Keyword precedence-flag | Every keyword row carries `meta.keyword_misclassification_risk: true` so the Phase-7 IC audit can isolate keyword-derived contribution. | `classify-catalyst-event.ts` keyword promotion. |

## 3. Per-vendor TokenBucket pacing (multi-vendor first in this repo)

One TokenBucket per **vendor** (generalisation of Catalog #39: one bucket per vendor, never one-per-fetcher). Constructed at the handler boundary and shared by every fetcher that hits that vendor.

| Vendor | Cap (raw) | Budget | TokenBucket rate | Fetchers paced |
|---|---|---|---|---|
| FMP | 750 req/min | × 0.85 | **10.625 req/s** | earnings-calendar, M&A, grades |
| Polygon | 10 req/s self-imposed (DEC-056) | × 0.85 | **8.5 req/s** | splits, dividends, news-keyword pages |
| Finnhub | 300 req/min | × 0.85 | **4.25 req/s** | FDA-advisory |
| Tradier | n/a | n/a | **no bucket (typed-fallback; 0 calls/fire)** | corporate-actions (fallback only) |

Concurrent dispatch **across** vendors via `Promise.all`; serial drain **within** each vendor by the bucket itself.

## 4. IN-set / OUT-set (DEC-057 §(g), v1 subset verbatim)

**IN (10 types — score-contributing at v1):** earnings · ma · splits · dividend_change · analyst_rating · fda_advisory · executive_change · guidance · regulatory_action · partnership.

**OUT (deferred to v2 — NOT scored at v1):** FDA approval/rejection outcome · buyback announcement · conference · non-material product launch · investor day.

## 5. Tier table (CROSSWIND §4.4.9 verbatim, frozen via DEC-057 §(g))

| Tier | Weight | IN-set types at v1 |
|---|---|---|
| Tier 1 | 3.0 | earnings, ma, fda_advisory, regulatory_action, guidance, executive_change |
| Tier 2 | 1.5 | analyst_rating, partnership, dividend_change, splits |
| Tier 3 | 0.5 | (none in IN-set at v1 — all §4.4.9 Tier-3 types are in the OUT-set) |

## 6. Pre-flight arithmetic — Phase-3 architecture decision (supervisor-ratified 2026-06-13)

Reproduced **verbatim** from the supervisor-ratified arithmetic row. Evidence: `docs/04-modules/longshort/signals/news-sentiment.md:70,74,96` (`OBSERVED_PAGE_LATENCY_S = 10.2 s/page`, measured run `9e8395a7`); FP-047 single-invocation envelope; DEC-056 Polygon 10 rps × 0.85.

| Component | Calls (lo–hi) | Latency contribution (lo–hi) | Vendor bucket |
|---|---|---|---|
| FMP earnings-calendar (windowed) | 1–2 | 0.3–0.8 s | FMP 750/min × 0.85 |
| FMP M&A (early-stop) | 1–2 | 0.3–0.8 s | FMP |
| FMP grades | 1–2 | 0.3–0.8 s | FMP |
| Polygon splits | 1 | 0.3–0.6 s | Polygon 10 rps × 0.85 |
| Polygon dividends | 1 | 0.3–0.6 s | Polygon |
| Finnhub FDA-advisory | 1 | 0.3–0.6 s | Finnhub 300/min × 0.85 |
| Polygon-news keyword (10-cal-day, `limit=1000`) | 3–4 pages | **30.6–40.8 s** (3–4 × 10.2 s) | Polygon (shared bucket w/ splits+dividends) |
| Tradier corporate actions | 0 (typed-fallback only) | 0 s | — |
| **TOTAL calls** | **8–13** | — | — |
| **TOTAL latency** (concurrent across vendors; news pages sequential within Polygon bucket; structured fetchers ride in parallel and finish well before news tail) | — | **≈ 31–42 s** (news-dominated); upper-bound robustness ceiling with structured-tail + jitter + dedup ≈ **40–55 s** | — |
| **STOP gate** | — | 120 s | — |
| **Headroom** | — | **lower-bound 65 s, upper-bound 78 s** vs 120 s STOP; ≥ 95 s vs 150 s HTTP wall | — |

**Ruling:** Both bounds land under 120 s with ≥ 65 s headroom → **SINGLE-INVOCATION (FP-047 shape)**.

## 7. Window arithmetic (DEC-057 §(f))

`window_start_at = nthPrecedingTradingDay(as_of, 5)`. v1 implementation walks weekends-only (Sat/Sun skipped); US exchange holidays NOT modelled. Bounded shortfall ≤ 1 trading day per double-holiday week (e.g., Thanksgiving, Christmas), materially absorbed by the §(a) 48h earnings half-life (~13% age-weight envelope per event). Holiday-calendar refinement is a named follow-up under DW-097.

## 8. Skip taxonomy

| Reason | When |
|--------|------|
| `no_catalyst_events_in_window` | Universe symbol has zero deduped in-window events. EXPECTED for most names on most days (§4.4.9 missing-data clause). |
| `data_unavailable` | All in-window content for this ticker is malformed (non-finite `event_at`, unknown `event_type`). Never coerced to 0. |
| `missing_sector` / `singleton_sector` | Sector-side: shared z-score normalizer typed-absence semantics. |

No sentinel numerics anywhere. Mass balance: `|persisted| + |skips| = |universe|`.

## 9. Audit meta (catalyst_meta — emitted on `.completed` / `.manual_completed`)

`{ total_event_count, by_tier:{1,2,3}, keyword_source_count, cross_vendor_duplicates_dropped, future_event_excluded, verb_gate_drops, numeric_gate_drops, declaration_date_unavailable, tradier_fallback_invoked, vendor_unavailable:{fmp_earnings, fmp_ma, fmp_grades, polygon_splits, polygon_dividends, polygon_news_keyword, finnhub_fda} }`. Carried in `writeStrategyAuditEvent.metadata.catalyst_meta`; not persisted in `signal_compute_log` (no jsonb metadata column at v1).

## 10. Wall-clock discipline (DEC-034 clause 4, d066c890 pattern)

`as_of` is the ONLY timestamp that enters compute inputs. `started_at` / `completed_at` are stamped from injected `liveClock` (default `productionClock`) at orchestrator ENTRY and FINALIZATION respectively — NEVER at `as_of` (which would silently equate the two and reintroduce the FP-047 defect). Test 5 / Test 8 in `active-catalyst-orchestrator_test.ts` pin the advancing-clock invariant.

## 11. Registry truth (Phase 3b — live-DB §22.5.1 reads, post-MIG-091)

- `signal_registry.active_catalyst_flag` — **`{status:'live', cadence:'daily (after-close; single-invocation ~31-55s; interim per DEC-048 — §4.4.9 spec target is 5-min intraday, Phase 7 picks final cadence)', planned_phase:NULL, job_registry_id:'longshort.catalyst.compute'}`** (verified via `SELECT signal_id, status, cadence, planned_phase, job_registry_id FROM signal_registry WHERE signal_id='active_catalyst_flag'`).
- `job_registry.longshort.catalyst.compute` — **`{enabled:false, schedule:'45 21 * * 1-5', trigger_type:'scheduled', status:'registered', handler_path:'supabase/functions/longshort-catalyst-compute/index.ts', timeout_seconds:150, max_retries:2}`** (verified via `SELECT id, enabled, schedule, trigger_type, status, handler_path, timeout_seconds, max_retries FROM job_registry WHERE id='longshort.catalyst.compute'`).
- **Slot reasoning (`45 21 * * 1-5`):** lands AFTER analyst (`0 21 * * 1-5`) AND after news (`30 21 * * 1-5` + observed ~6 min queue drain → wraps by ~21:36 UTC); lands BEFORE options-flow (`0 22 * * 1-5`). No two init triggers fire on the same minute and the news queue drain is comfortably finished before catalyst starts → no cross-signal vendor-bucket contention even though catalyst and news both pace against the Polygon bucket.
- `JOB_ID_TO_SIGNAL_ID` — **9 entries** post-Phase-3b (was 8 after MIG-089b news). Cross-reference test `(2h)` pins the catalyst entry to the orchestrator's `SIGNAL_ID` export; set-membership test `(5)` pins the exact 9-entry key list.
- **Cron arm-up:** operator-side at the deploy + validation choreography turn per DEC-040 byte-match attestation discipline. `sql/15_longshort_catalyst_cron_schedule.sql` carries the placeholder-bearing `cron.schedule()` template + post-apply verification SQL; not committed to `cron.job` by this migration.
- **DEC-043-pattern attestation:** OPEN. Closes when the first natural cron-fire row lands in `signal_compute_log` with wall-clock proximity to 21:45 UTC (distinct from the manual-fire `as_of`-derived midnight signature).