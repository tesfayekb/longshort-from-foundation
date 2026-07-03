# Overshoot Strategy Module (Skeleton)

> **Owner:** Trading Panel — Overshoot | **Last Reviewed:** 2026-07-02

## Purpose

Overshoot is a separate event-driven trading strategy that captures short-horizon mean reversion after acute idiosyncratic dislocations. It runs on a dedicated Alpaca paper account (broker-first from day one), with a parallel code tree, its own `overshoot_`-prefixed tables and `overshoot.*` crons, and its own operator console. This document is the module home; the strategy charter and full authority chain live at FP-069 (`docs/08-planning/feature-proposals.md`).

## Scope

Applies to everything under `src/features/overshoot/`, `src/pages/trading/overshoot/`, `supabase/functions/_shared/overshoot/`, `supabase/functions/overshoot-*`, `overshoot_*` database tables, `overshoot.*` cron jobs, `overshoot.*` RBAC permissions, and this documentation subtree. Does NOT apply to any `longshort_` / `combiner_` surface — see the separation contract below.

## Thesis + Evidence Pointers

**LONG tail:** 12-1-strong names that drop acutely (band parameter-selected, prior ~6-12% over 1-5 trading days), no earnings/catalyst in window, market/sector flat, stabilization-trigger entry, scale-out or time-stop exit. **SHORT tail (mirror):** 12-1-weak names that pop acutely, same exclusions plus a hard high-short-interest squeeze filter, fade on exhaustion. Capacity up to 20 per side, filled as events qualify. Occupancy is a measured output, never a target; long-tilted outcomes are acceptable when short-side qualification is sparse.

**Evidence spine:** DW-212 (2026-07-02 short-book forensic — 74% of the live short leg's ~$1,022 / 44h loss came from 6 names > 40% below 52-week highs bouncing against a flat SPY (−0.135%); reversal-1w sanctioned-null for all 16 shorts). Overshoot harvests the opposite side of that effect. The >40% drawdown bucket is a tested dimension, not an assumed one; naive "long everything 40% off highs" has negative expected edge until the band is parameter-selected against event-arrival-rate and slippage haircuts.

## SEPARATION CONTRACT (binding, preserve verbatim)

(1) **BROKER** — a SECOND, dedicated Alpaca paper account; new secrets (`ALPACA_PAPER_KEY_OVERSHOOT` / `ALPACA_PAPER_SECRET_OVERSHOOT`, operator-provisioned via Dashboard at Wave 3 per §22.5.3); new client instance; the INC-77 paper-only-guard PATTERN reused, existing client code never modified. Rationale: the longshort rebalance is broker-sourced and closes any account position outside its target book — a shared account means systematic liquidation of overshoot positions. (2) **DATABASE** — reads shared strategy-agnostic market facts (`signal_observations`, the Wave-1 commons); writes ONLY `overshoot_`-prefixed tables; never writes any `longshort_` / `combiner_` row. **PERFORMANCE-LEDGER PRINCIPLE (operator-ratified):** the ONLY performance numbers overshoot ever reports derive from broker (paper) fills in `overshoot_fills` / `overshoot_positions`; any study/parameter artifact lives in `overshoot_study_`-prefixed tables, labeled NON-PERFORMANCE, structurally never merged into any performance surface. (3) **CODE** — parallel tree (`supabase/functions/_shared/overshoot/` + `overshoot-*` edge fns); may import leaf utilities (clock, Polygon fetcher, z-score helpers); MUST NOT import anything under `longshort-execution/`; no existing file gains an import from the overshoot tree; CI-grep-enforced from Wave 1. (4) **CRON** — `overshoot.*` jobs in free slots, disarmed at creation; the live strategy's jobids (51/76/78/87/88/89/90/91/95/97/100/106/109/110/114) untouched. (5) **DOCS** — spec lives in `docs/04-modules/overshoot/`; `CROSSWIND_SPEC.md` and all current-strategy sections: zero edits; project FP/DW/ACT ledgers are shared bookkeeping only.

## Performance-Ledger Principle

Overshoot's only sanctioned performance surface is real paper-fill data captured on the dedicated Alpaca paper account (`overshoot_fills`, `overshoot_positions`, downstream reconciled ledgers). Study outputs (parameter grids, event-arrival counts, historical dislocation stats) live exclusively in `overshoot_study_`-prefixed tables and are labeled NON-PERFORMANCE at the schema level. There is no path — read view, join, aggregate, UI card, or exported report — that merges study numbers into a performance surface. This is a constitutional invariant of the module, not a convention.

## Born-With-The-Lessons

Every overshoot build wave inherits these from v1, non-retrofit:
- Paper-only URL guard on the overshoot Alpaca client (INC-77 pattern reused verbatim).
- Injected clock everywhere; zero raw `Date.now()` / `new Date()` in overshoot kernels (DEC-034 discipline).
- Typed absence; no sentinel numerics on any money path.
- Audit events carry `outcome_class` (`refused_*` / `submitted` / `no_op`) from the first event write (DW-208 lesson).
- Event-idempotency keys on the detector — one dislocation produces one event no matter how many ticks re-observe it.
- Disarm-fire-enable convention on every overshoot cron at creation.
- Overshoot-owned `verify_position`-class reconciliation against account #2 from the first trading wave.
- Producer/consumer cadence coherence verified to fixed-point at design time (DW-208 / DW-210 / DW-211 lesson).

## Wave Ladder

- **W0 — Charter (this landing).** FP-069 entry + this module skeleton + DW-212 + ACT-454. Zero code, zero migration, zero cron, zero secret.
- **W1 — Data commons.** Overshoot-owned MIGs for a daily-bars table + ~5y Polygon backfill (~2,500 tickers, adjusted); a historical earnings-calendar table + backfill (the load-bearing exclusion filter — source chosen by dual-investigation at W1); CI import-guard enforcing the separation contract.
- **W2 [DECISION-GATED at W1 close, operator call] — Historical parameter-selection study.** Grid: drop/pop % × window × momentum-quintile × 52w-drawdown-bucket × earnings-exclusion; conservative slippage haircuts baked in; outputs = parameter choices + event-arrival rates ONLY, `overshoot_study_` tables, non-performance by construction. Operator may KEEP (front-loads parameter learning) or DROP (literature priors, tuned on paper evidence).
- **W3 — Broker-first execution build.** Live event detector over the W1 commons + entry/exit engine + `overshoot_` ledger fed by REAL paper fills on account #2 + own reconciliation + outcome-classified audit from v1. Pre-condition: operator provisions account #2 and the two secrets.
- **W4 — Operator console UI.** Own tree, read-only, injected clock: the event-detector monitor (dislocations detected, per-filter pass/fail with reasons, entries vs skips) + positions/closed-today/equity on account #2 (FP-068 pattern-set reused, not imported).
- **W5 — Measurement + scale decision on real paper numbers only.** No study number ever becomes a scale trigger.

## No Shared Write-Surface With Longshort (Invariant)

Overshoot code MUST NOT write, upsert, delete, or otherwise mutate any row in any table whose name is prefixed `longshort_`, `combiner_`, or that is otherwise owned by the long-short strategy. This includes indirect writes via shared writer helpers under `supabase/functions/_shared/longshort-execution/`, `supabase/functions/_shared/longshort-combiner/`, and any strategy-owned audit surface. Reads from strategy-agnostic commons (`signal_observations`, market facts) are the sole sanctioned cross-boundary interaction, and only as reads. Any violation — even a "temporary" one for a smoke test — is a STOP-condition and reverts the offending change.

## Earnings-Exclusion Is Load-Bearing

News-driven drops drift (PEAD literature): a stock that falls on an earnings miss tends to continue falling for days-to-weeks, not reverse. The reversion edge overshoot targets lives exclusively in non-fundamental dislocations (liquidity air-pockets, index-inclusion sweeps, sector-rotation over-reactions, single-name algorithmic cascades). Trading a dislocation without a clean earnings-exclusion filter mixes two regimes with opposite expected returns and can produce a null or negative net edge even when the pure-reversion sub-population is strongly positive. Consequently the W1 historical earnings-calendar backfill is a **hard gate** on both the W2 study and on live W3 trading — the strategy will not enter a position whose event window overlaps a known earnings date, and the study will not fit parameters on event windows lacking earnings coverage.

## Dependencies

- FP-069 (charter, authority hierarchy anchor).
- DW-212 (evidence spine — short-book forensic).
- INC-77 (paper-only guard pattern to reuse).
- DEC-034 (injected-clock discipline).
- `PolygonPriceHistoryFetcher` (importable leaf utility, W1 data commons).
- `signal_observations` (shared strategy-agnostic market facts, read-only).

## Used By / Affects

Nothing yet — this is a skeleton. At W3/W4 landing this section enumerates overshoot edge functions, cron jobs, and UI routes.

## Risks If Modified

HIGH — this module operates a second broker account against real paper fills. Any change to the separation contract, the performance-ledger principle, or the born-with-the-lessons list requires an FP + operator ratification. Silent tightening of any dislocation threshold (drop %, exclusion window) that reduces expected trade count is ROI-negative and must be surfaced in the work-complete ROI section.

## Related Documents

- [FP-069](../../08-planning/feature-proposals.md) — Charter.
- [DW-212](../../08-planning/deferred-work-register.md) — Evidence.
- [ACT-454](../../06-tracking/action-tracker.md) — Charter landing.
- [Constitution](../../00-governance/constitution.md).

## Wave-1a Data Commons — Landed State (ACT-455, 2026-07-03)

**Tables (all `overshoot_*`, RLS on, RESTRICTIVE deny-writes + `overshoot.view`-gated SELECT):**

| Table | Purpose | Primary key |
| --- | --- | --- |
| `overshoot_backfill_runs` | Lineage row per backfill invocation (kind, cursor, request/row counts, outcome). | `run_id` (uuid) |
| `overshoot_universe` | Ticker spec table (seeded from `universe_membership`, 839 rows at seed). | `ticker` |
| `overshoot_daily_bars` | Adjusted OHLCV + VWAP + trade_count; `source_run_id` FK to `overshoot_backfill_runs`. `vwap` and `trade_count` are NULLABLE — typed absence, never 0-coerced. | `(ticker, trade_date)` |
| `overshoot_earnings_calendar` | Dual-source earnings (`finnhub` primary, `fmp` cross-audit); `hour` is NULLABLE (`'bmo'` / `'amc'` / NULL). Finnhub empty-string / `dmh` / unknown session and all FMP rows persist as SQL NULL — never a synthesized session. | `(ticker, announcement_date, source)` |

**RBAC:** `overshoot.view` (read) + `overshoot.manage` (invoke backfills) seeded and granted to Administrator; DEC-031 two-segment discipline preserved.

**Fetchers (in `supabase/functions/_shared/overshoot/`, parallel-tree per separation contract):**
- `PolygonDailyOhlcvFetcher` — adjusted daily OHLCV+VWAP+trade_count over an injected `as_of` window. Constructor-injected `apiKey` + `httpFetch`. HTTP 404 → `null` (typed absence); other non-2xx / timeouts throw `OvershootFetchError` with ticker context.
- `FinnhubEarningsFetcher` — per-ticker calendar with the load-bearing session flag; empty-string / `dmh` / unknown → SQL NULL.
- `FmpEarningsCalendarFetcher` — bulk range calendar; `hour` always NULL (cross-audit only).

**Manual invocation surfaces (deployed):**
- `overshoot-backfill-bars-manual` — `POST` handler. Contract: `{ probe?, tickers?, full?, lookback_days?, as_of?, resume_from? }`. Probe path (`{probe:true}`) exercises the Polygon key against AAPL, writes nothing, and returns `{ probe:true, ok, bar_count }` — the A5 gate-zero probe.
- `overshoot-backfill-earnings-manual` — `POST` handler. Contract: `{ source: 'finnhub'|'fmp', from, to, tickers?, full?, resume_from? }`. Finnhub is per-ticker; FMP is one bulk range call.

**CI membrane:** `scripts/check-overshoot-separation.ts` + `.github/workflows/overshoot-guards.yml` enforce the separation contract at every PR. **Allowlist semantics (W1b turn-2, ACT-456)**: entries are the LIVE subset of the FP-069-ratified leaf set (clock, fetch-with-timeout, z-score-normalize, polygon-price-history-fetcher). Ratified-but-not-yet-imported leaves are NOT pre-listed — they are added the first time overshoot code genuinely imports them, in the same PR that introduces the import, citing the charter clause. A non-ratified addition requires an FP-069 charter amendment BEFORE the allowlist edit lands. Any entry whose specifier does not contain `'longshort'` is unreachable dead weight (the predicate only fires on `longshort`-matching specifiers) and must not be listed. **Current allowlist (2 entries)**: `longshort-universe/shared/fetch-with-timeout.ts`, `longshort-clock.ts`. Removed W1b turn-1: `longshort-universe-interfaces.ts` (HttpFetch now overshoot-owned at `_shared/overshoot/http-fetch.ts`). Removed W1b turn-2: `parse-as-of-date.ts` (unreachable + not a ratified charter leaf). Longshort files may not import anything overshoot. The workflow pins Deno to `v1.46.3` for guard reproducibility.

## Wave-1b Executor Runbook (backfill completion)

**Not an operator runbook** — this is the executor-facing invocation loop that closes W1 at ACT-456 (the next ACT). Pattern:

1. **Bars, full universe.** Invoke `overshoot-backfill-bars-manual` with `{ full: true, lookback_days: 1830 }`. The handler iterates `overshoot_universe` alphabetically, paces 250 ms between tickers, and stamps each bar with the run's `source_run_id`. On failure/timeout, re-invoke with `{ full: true, resume_from: '<last_cursor>' }` — `last_cursor` is echoed in the previous response and in `overshoot_backfill_runs.cursor`. Expected total: ≈839 tickers × ~5 y ≈ ~1.05 M bar rows.

   **W1b turn-8 batching (DEFECT-3 remediation, ACT-456).** `full:true` processes AT MOST `batch_size` tickers per invocation (default 60, max 120) — sized so ~60 × 1.25 s ≈ 75 s stays under the edge worker CPU/wall-clock ceiling (§22.8.5 class). The response gains `done: boolean` (true iff the batch reached the end of the alphabetical universe). Resume semantics are **exclusive** (`t > resume_from`); the operator loop passes the previous `last_cursor` verbatim. Expected invocation count for a cold full backfill: ⌈839/60⌉ ≈ **14**. A single un-capped `full:true` invocation triggered HTTP **546 `WORKER_RESOURCE_LIMIT`** (turn-7 → turn-8 discovery); this is now catalogued as a §22.8.5-class platform constraint.

   **DevTools frame-context note (turn-8).** The browser-side fallback script MUST run in the **preview iframe context** — switch DevTools' JavaScript-execution context selector to the preview frame before pasting. A dynamic `import('/src/integrations/supabase/client.ts')` from the parent (`lovable.dev`) frame 404s. Frame-agnostic alternative: read the session token from `localStorage.getItem('sb-<project-ref>-auth-token')` and construct the request with explicit `Authorization: Bearer …` + `apikey` headers (§7.5 pattern; token never written to any surface).
2. **Earnings, Finnhub, full universe.** Invoke `overshoot-backfill-earnings-manual` with `{ source: 'finnhub', from: '2021-07-03', to: '2026-07-03', full: true }`. Same resume-by-cursor pattern; 1.1 s inter-ticker pacing.

   **W1b D-5 batching (DEFECT-3b remediation, ACT-456-ADD-03).** The Finnhub `full:true` path processes AT MOST `batch_size` tickers per invocation (default **40**, max **60**) — sized so ~40 × 2.7 s ≈ 108 s stays under the edge worker CPU/wall-clock ceiling (§22.8.5-class, mirroring the bars-fn D-4 remediation). The response gains `done: boolean`. Resume semantics on this path are **inclusive** (`t >= resume_from`); idempotent upsert on `(ticker, announcement_date, source)` makes cursor-boundary re-processing harmless. Loop the operator script until `done === true`. The D-5 earnings window is `from: '2021-06-01'` (one-month pre-window margin before the bars left edge 2021-06-29) so the earnings-exclusion filter can look backward from the earliest possible dislocation date. Expected invocation count: ⌈839/40⌉ ≈ **21**. DEFECT-3 class is now **closed**: both `overshoot-backfill-*-manual` full-paths are batch-capped.
3. **Earnings, FMP, bulk range chunks.** Invoke `overshoot-backfill-earnings-manual` with `{ source: 'fmp', from: '2021-07-03', to: '2021-12-31' }`, then step `to` forward in ≤6-month chunks through `2026-07-03`. FMP caps the response window; the handler makes exactly one HTTP call per invocation.
4. **W1 close bar — full Finnhub↔FMP cross-audit.** SQL over the populated 839-ticker sample: agreement rate on `(ticker, announcement_date)`; hour-flag coverage on the Finnhub table; typed-absence NULL count. Emit as the ACT-456 evidence block.

Batch hard-cap for named-ticker invocations is 50 (`full:true` is uncapped). Each invocation writes ONE `overshoot_backfill_runs` row regardless of failure mode; failures accumulate in `failures[]` (first 10 in response) and `outcome` is `completed` / `partial` / `failed` based on `row_count` vs `failure_count`.

**Secrets required at invocation time:** `POLYGON_API_KEY` (bars), `FINNHUB_API_KEY` (finnhub earnings), `FMP_API_KEY` (fmp earnings). If unset, the function returns 500 `<vendor>_api_key_unset` before opening any run row.

### W1b invocation caveats (from ACT-456 turn-5 evidence, 2026-07-03)

**Curl-tool token-injection defect.** The `supabase--curl_edge_functions` platform tool does NOT forward the browser preview's bearer token to overshoot edge functions (observed turns 3-4: two consecutive HTTP 401 `UNAUTHORIZED` with the preview session provably live via `get_my_authorization_context` returning `is_superadmin: true` and JWT unexpired). Until the tool is fixed, all W1b executor invocations use the **ratified §7.5 browser-side fallback**: a DevTools snippet on the preview origin that reads `supabase.auth.getSession().data.session.access_token` in-memory and constructs the request with an explicit `Authorization: Bearer …` header + `apikey` header. Token must NEVER be `console.log`'d, embedded in a doc, or serialized to any surface — request-header-only. No service-role bypass, no server-side JWT construction.

**Two internal executor defects surfaced in turn-5 smoke (must be fixed before W1 close bar):**

1. **Bars — `volume bigint` vs Polygon fractional volumes.** Polygon `/v2/aggs` returns `v` as a floating-point number for adjusted aggregates (e.g. AAPL `37308155.220558`, NVDA `171584839.114167`). `overshoot_daily_bars.volume` is `bigint`, so every row upsert fails with `invalid input syntax for type bigint: "…"`. Two candidate remediations (operator decision required, per ROI-guardrails principle — do NOT silently coerce): (a) widen `overshoot_daily_bars.volume` to `numeric(20,6)` (preserves vendor precision; migration MIG-NNN); (b) `Math.round()` in the fetcher (lossy transform of raw vendor value — standard practice in equity data pipelines but a schema-vs-code choice). Turn-5 result: 0 bar rows written across both D-2a and D-3 invocations.
2. **FMP earnings — batch-upsert PK collision.** FMP bulk-range responses contain duplicate `(ticker, announcement_date, source)` tuples within a single call (e.g. duplicate rows for the same reporting date). The single `.upsert(payload, { onConflict: 'ticker,announcement_date,source' })` fails with `ON CONFLICT DO UPDATE command cannot affect row a second time`. Remediation: in-memory dedupe of `payload[]` on the PK tuple before upsert, keeping last occurrence. Fix is code-local to `overshoot-backfill-earnings-manual/index.ts`.

**Idempotency-signal caveat.** The D-3 turn-5 delta-0 result is a **degenerate idempotency signal** — both writes wrote 0 rows because both failed identically on the same bigint defect. A meaningful idempotency verification requires re-running D-3 after defect (1) is fixed and D-2a yields a positive row count.

### W1b turn-6 remediation (2026-07-03, ACT-456 turn-6)

**Bars-table volume semantics — `numeric` (not `bigint`).** DEFECT-1 ratified as option (a): `overshoot_daily_bars.volume` widened from `bigint` to `numeric` (lossless). Polygon adjusted volume is fractional by vendor construction (split/dividend adjustments produce non-integer share counts); rounding at ingest would silently distort a money-adjacent vendor value, which the ROI-guardrails principle forbids. Fetcher passes vendor `v` through untouched — no change to `polygon-daily-ohlcv-fetcher.ts`. Applies to all downstream consumers: read the column as numeric and preserve fractional precision through analytical surfaces.

**FMP dedupe — keep-FIRST.** DEFECT-2 ratified as in-memory PK-tuple dedupe on `(ticker, announcement_date, source)`, keep-FIRST occurrence, with a `duplicates_dropped: <n>` counter surfaced in the earnings-fn response JSON (and in W1b evidence). No schema change; no other row-semantic change. FMP responses within a single bulk range occasionally repeat identical PK tuples; keep-FIRST is the deterministic, order-preserving choice.

### W1b D-6 close-out (2026-07-03, ACT-456-ADD-05)

**FMP full-window cross-audit backfill complete.** 6 sequential bulk-range chunks (2021-H2, 2022, 2023, 2024, 2025, 2026-YTD), 5 completed + 1 failed (D-6.1 2021-H2 → 0 rows, likely vendor 404/empty). Elapsed 8.0s wall. Loop totals: row_count=19,711 · duplicates_dropped=289. Post-paste-back DB: `overshoot_earnings_calendar` per-source totals — finnhub **16,572** · fmp **19,747** (fmp span 2022-12-30 → 2026-07-03, fmp distinct tickers 11,122 — fetcher is bulk-range unfiltered by design). PK duplicates=0. All 839 active-universe tickers present in FMP (zero-row-vs-universe list = ∅), which resolves the A2 arithmetic (834 finnhub-covered, 5 typed-absent: BRK.B/FOX/GOOG/NWS/RBA — 4 class-B/C shells + RBA a confirmed Finnhub coverage gap).

**Three findings staged for D-7 (must be honored by the W1 close bar, not silently averaged):**

1. **F-1 — FMP pre-2022 coverage gap.** `/stable/earnings-calendar` returned 0 rows for 2021-06-01..2021-12-31. Cross-audit for pre-2022 is unavailable on the current API tier; finnhub (1,656 rows in 2021-H2) is the sole source for that segment. D-7 must scope the agreement-rate computation to the intersection window and report the pre-2022 finnhub-only coverage separately (not fold it into a single agreement percentage).
2. **F-2 — 2026 forward-calendar asymmetry.** FMP publishes ~2,082 additional forward Q3/Q4 2026 estimate rows (finnhub `to='2026-07-01'` vs fmp `to='2026-07-03'`; per-ticker finnhub calls returned mostly actuals). **D-7 date-agreement cross-audit MUST be scoped to intersection window (2022-12-30 → 2026-07-01) AND to the 839 active universe** (`INNER JOIN overshoot_universe u ON u.ticker = e.ticker AND u.active`) — an unscoped comparison would compute a spurious low ratio.
3. **F-3 — Finnhub RBA coverage gap.** RBA (RB Global, 2023 Ritchie Bros rebrand) is present in FMP and absent in Finnhub — Finnhub coverage gap, not a symbol invalidity. D-7 mapping-review table to enumerate this + spot-check class-B shells (BRK.B/FOX/GOOG/NWS) which FMP echoes under the B ticker (dedup-at-report decision required).

**Per-source per-year coherence** (universe-scoped finnhub vs all-US-bulk fmp; the ratio reflects the scope diff, not disagreement): 2022 0.815 · 2023 0.829 · 2024 0.832 · 2025 0.837 (tight ~0.83 cluster inside intersection). 2021 (0.0, F-1) and 2026 (0.447, F-2) are boundary cases as above.

> **SUPERSEDED-BY-DEFECT (2026-07-03, ACT-456-ADD-06):** the per-year coherence ratios above were computed against FMP responses that were silently truncated by the ≈4,000-row response cap (DEFECT-4). The ~0.83 ratio is a cap artifact, not a real coverage relationship. See W1b D-7 close-out below for the true intersection-scoped active-universe agreement (99.15%) and the true universe-scope diff (fmp 26,480 all-US tickers vs finnhub 836 scoped). The ADD-05 findings that all 839 active-universe tickers appear in FMP and that RBA is a Finnhub coverage gap survive at higher confidence.

### W1b D-7 close-out · W1 CLOSED (2026-07-03, ACT-456-ADD-06)

**DEFECT-4 (FMP 4,000-row response cap) registered + remediated.** FMP `/stable/earnings-calendar` silently truncates any response at ≈4,000 rows with no explicit error. Year-chunk requests (D-6) dropped ~95% of the data. Monthly ALSO insufficient (peak Feb 2024 = 4,000); weekly insufficient in peak/quarter-transition weeks. **Adaptive remediation script**: weekly-first with auto-descend to daily on any truncated week; HARD-STOP on daily truncation. Execution: 321 chunks (266 weekly + 55 daily on 10 auto-descended weeks), elapsed 202.9s, non200=0. Result: fmp 19,747 → **355,184 rows** (+335,437), distinct tickers 11,122 → **26,480**, span 2021-07-06 → 2026-07-03, PK dup=0.

**F-4 residual (4 quarter-end daily hard-stops).** 4 days remain FMP-cap-truncated at daily granularity (2021-12-30, 2022-12-30, 2023-03-30, 2023-06-29). FMP endpoint accepts date-only (`from`/`to`), no datetime granularity → finer temporal chunking unavailable. **Materiality:** active-universe coverage on those days = {1, 5, 4, 7} / 839 — quarter-end DAY is not a common large-cap report day (large-caps file 10-Q 2-6 weeks LATER). The 4,000-truncation drops the small-cap tail; the active universe is materially unaffected. **Disposition:** NON-BLOCKING for earnings-exclusion substrate; W2 backlog carries a per-ticker-scoped FMP recovery option (code change) if signal-tuning ever demands sub-universe small-cap coverage.

**Cross-audit results (intersection 2021-07-06 → 2026-07-01, `INNER JOIN overshoot_universe u ON u.ticker=e.ticker AND u.active`):**

| metric | value | threshold | verdict |
|---|--:|--:|---|
| finnhub active-univ rows | 16,484 / 834 tickers | — | — |
| fmp active-univ rows | 16,623 / 836 tickers | — | — |
| exact-date match | 16,236 (98.50%) | — | — |
| ±1-day match | 108 (0.66%) | — | — |
| **≤±1d total agreement** | **99.15%** | ≥95% | **PASS ✓** |
| disagreement >1d | 100 (0.61%) | — | label-drift/reschedule artifacts |
| single-source-finnhub | 40 (0.24%) | — | mainly class-B shells (BF.B pattern) |
| single-source-FMP | 278 (1.67%) | — | FMP preliminary/revised repeats |
| **coverage holes <10 anns** | **12 / 839 = 1.43%** | <5% | **PASS ✓** |
| PK dup earnings | 0 | 0 | PASS ✓ |
| PK dup bars | 0 | 0 | PASS ✓ |

**Bars-side (standing requirement):** 1,031,050 rows · 840 distinct tickers (839 active + AAPL D-2 smoke) · per-ticker min=117 (MRSH IPO 2026-01-14) / median=1,258 / max=1,258 (~5y trading days) · span 2021-06-29 → 2026-07-02 · 36 tickers <1000 bars, all traced to legitimate 2022-2026 IPO/spin/rebrand debuts (COR, PR, CRBG, GEN, FBIN, GEHC, NXT, CXT, KVUE, RVTY, KNF, CAVA, EG, SN, TKO, CART, VLTO, CPAY, SOLV, GEV, ULS, CNH, SW, TLN, TXNM, GAP, EXE, SARO, FLG, XYZ, SGI, SNDK, MZTI, PSKY, MRSH, + FISV cycle).

**F-3 mapping recommendation for W2/W3 query-time OR-map (NOT built this turn):** BRK.B→BRK.A · GOOG→GOOGL + FMP-echo · FOX→FOXA + FMP-echo · NWS→NWSA + FMP-echo · RBA→FMP-only · BF.B→Finnhub-only. Preferred over storage-duplication (keeps substrate vendor-truth-preserving).

### Substrate state (W1 CLOSED — finalized 2026-07-03)

| substrate | count | span | source(s) | known limitations |
|---|--:|---|---|---|
| `overshoot_daily_bars` | 1,031,050 rows, 840 tickers | 2021-06-29 → 2026-07-02 | Polygon adjusted daily OHLCV+VWAP+trade_count | `volume numeric` (fractional adjusted); 36 tickers <1000 bars are IPO-age (documented) |
| `overshoot_earnings_calendar` (finnhub) | 16,572 rows, 836 tickers | 2021-06-01 → 2026-07-01 | Finnhub per-ticker (carries `hour` bmo/amc/NULL) | 5 zero-row active tickers (BRK.B + 4 class-B shells) + RBA gap (F-3); BF.B covered here only |
| `overshoot_earnings_calendar` (fmp) | 355,184 rows, 26,480 tickers | 2021-07-06 → 2026-07-03 | FMP bulk range (no `hour`); cap-remediated via weekly+adaptive-daily | F-1 pre-2021-07-06 absent (Finnhub-only for that segment); F-4 4 quarter-end days cap-truncated on small-cap tail (active-univ non-blocking) |
| separation guard | active | — | `scripts/check-overshoot-separation.ts` + `.github/workflows/overshoot-guards.yml` | CI-enforced |

**Refresh cadence:** open item — daily incremental append design (finnhub-per-ticker + fmp-weekly window slide) deferred to W2/W3 charter, not built this turn.

**W1 CLOSED per §22.3(e).** W2 KEEP/DROP decision gate NEXT (operator).
- [Change Control Policy](../../00-governance/change-control-policy.md).
## Wave 2 — Historical parameter-selection study (OPENED 2026-07-03, ACT-457)

**Gate outcome:** operator KEEP at the W1 close gate. W2 is a NON-PERFORMANCE parameter-selection study; every row it writes is quarantined in `overshoot_study_*` tables and structurally cannot merge into any performance surface (performance-ledger principle).

### Ratified stamps (persisted at row-level as CHECK-constrained columns)

- `survivorship_stamp = 'UPPER_BOUND_SURVIVORSHIP_BIASED'` — the study runs on the current active universe; delisted/acquired names of the past are not reconstructed. Every arrival rate and return figure is an **upper bound**.
- `performance_stamp = 'NON_PERFORMANCE_STUDY_ONLY'` — no study number is a performance number by construction.
- `short_filter_stamp` ∈ {`NO_SQUEEZE_FILTER_ARRIVALS_UPPER_BOUND_RETURNS_CONSERVATIVE`, `SQUEEZE_FILTER_APPLIED`} — W2 runs under the former (per-metric bias direction: short-tail ARRIVALS = upper bound, short-tail RETURNS = conservative/understated because squeeze-prone names live entry excludes are included). The latter unlocks once FINRA-SI backfill lands (candidate FP named at ACT-457, not chartered).
- `return_basis = 'CLOSE_TO_CLOSE_REFERENCE'` — the study NEVER simulates stabilization-trigger entries. Trigger design is W3's job, where only real paper fills teach.
- `drawdown_bucket` is a **tested dimension** (not an assumption). Arrival rates are the primary output; returns are secondary priors.

### Ratified parameter grid (3,000 cells/tail per R1)

- 6 move bands per tail × 5 windows (1/2/3/4/5 trading days) × 5 momentum quintiles × 5 drawdown buckets × 4 exclusion widths = **3,000 cells per tail**, 6,000 across both tails.
- Slippage haircut defaults (R3): **5 bps long / 15 bps short**, applied at aggregation time (never on the event row itself).

### Substrate (landed this turn, service-role-only)

| Table | Purpose | PK |
|---|---|---|
| `overshoot_study_runs` | One row per study run; carries all five stamps + slippage haircuts + `param_grid` (jsonb) + `param_grid_hash` + bars/earnings snapshot max-dates + `as_of` (injected) + `git_sha` + outcome. | `run_id` (uuid) |
| `overshoot_study_candidate_events` | One row per event (vendor-truth). Stores raw close-to-close `fwd_return_{1d,5d,20d}`; band + exclusion-width membership derived at aggregation, never materialized. | `event_id` (bigserial) |
| `overshoot_study_cell_results` | Aggregated cell results (arrival counts + haircut-applied return stats per (side, band, window, momentum quintile, drawdown bucket, exclusion width)). | `(run_id, side, band, window_days, momentum_quintile, drawdown_bucket, exclusion_width_days)` |

RLS: enabled on all three; RESTRICTIVE deny for `authenticated`; service-role writes only. No `overshoot.view` grant in W2 (operator UI reads deferred to W4).

### Usable study window

`overshoot_daily_bars` spans 2021-06-29 → 2026-07-02 (~5y). Subtracting the 12-month momentum lookback + 20-day forward-return tail gives an eventable window of approximately **2022-06-27 → 2026-06-04 ≈ ~4 years**. This is the operational bound for W2.5 (90-day smoke) and W2.6 (full run).

### W2 wave plan

| Sub-wave | Deliverable | Status |
|---|---|---|
| W2.0 | CI-pin fix: `overshoot-guards.yml` deno-version → `v2.9.1` (v1.46.3 cannot parse Deno-2.x lockfile v5). | ✓ this turn |
| W2.1 | Benchmark bars backfill (SPY/QQQ/IWM + 11 sector ETFs; non-universe rows). | ✓ this turn (paste-back evidence in ACT-457-ADD-01) |
| W2.2 | Study-schema migration (three quarantine tables + stamps + RLS). | ✓ this turn |
| W2.3 | Event-detection SQL + fixtures + EXPLAIN ANALYZE against the bars index. | pending |
| W2.4 | Study-run function (two-phase: candidate emission → aggregation), idempotent per `run_id`. | pending |
| W2.5 | 90-day smoke run + operator inspection. | pending |
| W2.6 | Full ~4-year run over the eventable window. | pending |
| W2.7 | W2 close: coverage/arrival tables + module doc W2-CLOSED stamp. | pending |

### Events-stored-once semantic

Each qualifying event persists once with its measured covariates (move, window achieved, momentum quintile, drawdown bucket, signed days-to-nearest-earnings). Band and exclusion-width membership are derived at aggregation. Row count stays O(n_events), not O(n_events × n_bands × n_widths); the event row remains vendor-truth.

### Benchmarks are non-universe

The 14 ETF tickers backfilled in W2.1 (SPY/QQQ/IWM + XLK/XLF/XLE/XLV/XLY/XLP/XLI/XLU/XLB/XLRE/XLC) land in `overshoot_daily_bars` but are NOT added to `overshoot_universe`. All coverage queries scope via a universe join — benchmarks never inflate active-ticker counts. Later inceptions (XLRE 2015-10-08, XLC 2018-06-19) are date-plausible and expected.

### FINRA-SI procurement (named, not chartered)

The short-tail bias-direction stamp closes only under `SQUEEZE_FILTER_APPLIED`. That requires broker-grade FINRA bimonthly short-interest coverage over the full study window (not the current live-only feed). Prospective FP: `FP-CANDIDATE-FINRA-SI-BACKFILL` — new `overshoot_short_interest_snapshots` table + procurement path + study re-run. Named for continuity; not chartered.
