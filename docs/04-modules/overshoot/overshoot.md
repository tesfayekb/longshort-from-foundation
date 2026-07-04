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

## Live-Price Source Contract (binding, 2026-07-04 operator directive)

**Verbatim operator directive (record):** ALL market prices — live quotes, snapshots, NBBO, pre-open reversion checks, marketable-limit price construction, any MTM or decision reference — source from POLYGON exclusively (Stocks Advanced plan, real-time entitled; key = `POLYGON_API_KEY_PROD_PROBE` per the ACT-462.a caveat). Alpaca market-data endpoints (`data.alpaca.markets`, `/v2/stocks/*`) are FORBIDDEN as price sources — the account's data plan is delayed IEX; a delayed price in an entry/exit decision is a silent-wrong-price defect class. Distinction binding: Alpaca remains AUTHORITATIVE for broker truth (fills and their execution prices, positions, equity, order status) per §2 axiom 2 — the fence is on market-data reads, not account-state reads. The `data.alpaca.markets` entry in both paper clients' URL allow-lists is capability-without-consumer: fence comment added at that line in the overshoot client (one-line comment edit, no behavior change); separation-guard-style check to be added to the W3.6.d/e test matrices: zero `data.alpaca.markets` / `/v2/stocks/` consumers in overshoot execution paths. Mirrors the longshort precedent (Polygon quote fetchers for live prices; Alpaca for account truth). **W3.6.b proceeds unchanged — its fetchers read order/account truth only.**

**Data-source registry (per surface):**

| Surface | Source | Endpoint(s) | Notes |
| --- | --- | --- | --- |
| Daily-bar commons (historical) | Polygon | `/v2/aggs/grouped/…` (adjusted) | ACT-455 / W1a. |
| Live quotes / snapshots (real-time) | Polygon | Snapshot + NBBO (Stocks Advanced) | W3.6.e stabilization re-check + entry-price construction. |
| Pre-open reversion re-check | Polygon | Snapshot (prevDay + lastQuote in one response) | I5 DEFAULT-DENY on unavailable / reverted. |
| Marketable-limit price construction | Polygon | NBBO | W3.6.e. |
| MTM / decision reference prices | Polygon | Snapshot | Any surface consuming a "current price". |
| Fills + execution prices | Alpaca (paper, account #2) | `/v2/orders/:id` | Broker truth. W3.2 fill-fetcher. |
| Positions | Alpaca (paper, account #2) | `/v2/positions`, `/v2/positions/:sym` | Broker truth. W3.2 position-fetcher. |
| Equity / buying-power | Alpaca (paper, account #2) | `/v2/account` | Broker truth. W3.6.b account-fetcher (I7-#7). |
| Order status / open orders | Alpaca (paper, account #2) | `/v2/orders?status=open`, `/v2/orders/:id` | Broker truth. W3.6.b open-orders-fetcher + W3.2 fill-fetcher. |
| Shortability | Alpaca (paper, account #2) | `/v2/assets/:sym` | Broker truth. W3.2 shortability-fetcher. |

**W3.6.d/e enforcement (deferred to those waves):** the test matrices for the exit engine (W3.6.d) and entry engine (W3.6.e) MUST include a separation-guard-style assertion — zero `data.alpaca.markets` / `/v2/stocks/` consumers in overshoot execution paths. Failure to include the assertion is a STOP for W3.6.d/e closure.

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
| W2.3 | Event-detection SQL + fixtures + EXPLAIN ANALYZE against the bars index. | ✓ ACT-457-ADD-02 |
| W2.4 | R-1 qualification semantics + `overshoot-study-run` edge fn (`INSERT ... SELECT` wrappers over the W2.3 SQL, single txn, injected clock, RBAC `overshoot.manage`, `dry_run` supported). | ✓ ACT-457-ADD-03 |
| W2.5 | 90-day smoke run + operator inspection. | pending |
| W2.6 | Full ~4-year run over the eventable window. | pending |
| W2.7 | W2 close: coverage/arrival tables + module doc W2-CLOSED stamp. | pending |

### Events-stored-once semantic

Each qualifying event persists once with its measured covariates (move, window achieved, momentum quintile, drawdown bucket, signed days-to-nearest-earnings). Band and exclusion-width membership are derived at aggregation. Row count stays O(n_events), not O(n_events × n_bands × n_widths); the event row remains vendor-truth.

### Benchmarks are non-universe

The 14 ETF tickers backfilled in W2.1 (SPY/QQQ/IWM + XLK/XLF/XLE/XLV/XLY/XLP/XLI/XLU/XLB/XLRE/XLC) land in `overshoot_daily_bars` but are NOT added to `overshoot_universe`. All coverage queries scope via a universe join — benchmarks never inflate active-ticker counts. Later inceptions (XLRE 2015-10-08, XLC 2018-06-19) are date-plausible and expected.

### FINRA-SI procurement (named, not chartered)

The short-tail bias-direction stamp closes only under `SQUEEZE_FILTER_APPLIED`. That requires broker-grade FINRA bimonthly short-interest coverage over the full study window (not the current live-only feed). Prospective FP: `FP-CANDIDATE-FINRA-SI-BACKFILL` — new `overshoot_short_interest_snapshots` table + procurement path + study re-run. Named for continuity; not chartered.

### W2.3 study-design SQL (CLOSED 2026-07-03, ACT-457-ADD-02)

Two SQL files land in-repo this wave (no writes yet — INSERT wiring is W2.4):

- `supabase/functions/_shared/overshoot/study/event-detection.sql`
- `supabase/functions/_shared/overshoot/study/cell-aggregation.sql`
- `supabase/functions/_shared/overshoot/study/event-detection_fixture_test.sql` (invariant assertions)

**Design pins as implemented:**

| Pin | Choice | Rationale |
|-----|--------|-----------|
| **P1 — idiosyncrasy** | Mechanism (a): **excess vs SPY**. `move_pct = ticker_ret(W) − spy_ret(W)`. Long/short trigger via sign + `\|excess\| ≥ min_band_bps`. | Single tuned parameter (band threshold); no separately calibrated flatness constant that would require its own study. Directly implements the DW-212 idiosyncratic thesis. |
| **P2 — momentum quintile** | `NTILE(5) OVER (PARTITION BY trade_date ORDER BY momentum_12_1)` over the universe of names with non-NULL momentum on that date. Momentum = `close(t-21)/close(t-252) − 1`. | Cross-sectional per event date, not a longitudinal ranking. |
| **P3 — events once** | One row per `(ticker, event_date, side)`. Row persists ALL FIVE per-window excesses (`excess_w1..w5`) plus argmax descriptors (`move_pct`, `window_days`). Aggregation derives per-cell membership by `\|excess_wN\| ≥ band_lo` for the cell's N — **qualification semantics per R-1 (ACT-457-ADD-03)**. Same event can contribute to multiple `(W, band)` cells, which is the correct arrival-rate accounting for independently-configured live detectors. Argmax columns retained as descriptive summary of the loudest window. | No per-combination materialization; cross-cell participation is a semantic feature, not double-counting. |
| **P4 — alias earnings** | Declarative `alias_map` VALUES CTE (BRK.B→BRK.A, GOOG→GOOGL, FOX→FOXA, NWS→NWSA). Nearest earnings per event via `ORDER BY ABS(distance), distance DESC LIMIT 1` (ties break to AFTER side). `days_to_nearest_earnings` SIGNED (positive = after event). | ADD-06 spec verbatim. `alias_used` NULLable, holds the earnings-side ticker when mapped. |
| **P5 — returns** | Raw close-to-close `fwd_return_{1,5,20}d` stored on events via `LEAD` (LEAD returns NULL at the horizon ⇒ typed absence, never a truncated pseudo-return). Haircut + SPY-excess applied at aggregation. | Cell PnL columns store haircut-adjusted `side_sign × raw − haircut_bps/10000`. |
| **P6 — lookback** | `event_date >= :lookback_min_date`. Usable candidacy begins where BOTH the 252d momentum and the 5d excess lookbacks are satisfied (~2022-07-01 under the current bars snapshot). Earlier dates excluded, not NULL-padded. | Enforced pre-argmax in `per_window_excess`. |
| **P7 — determinism** | All bounds are parameters (`:run_id`, `:bars_snapshot_max_date`, `:earnings_snapshot_max_date`, `:min_band_bps`, `:lookback_min_date`, `:haircut_bps_*`). No `now()`, no `current_date`, no wall-clock inside SQL. The runner (`overshoot-study-run`) substitutes `:name` positionally via a `bindNamed` helper and injects the clock via `productionClock`. | Enables deterministic replay against a pinned snapshot. |

**Symmetric-P1 emergent behaviour (documented, not a defect):** on a market-wide crash day where SPY drops sharply and a ticker holds steady, the excess-vs-SPY definition yields a legitimate LONG-side dislocation event for that ticker. Live-universe scale rarely produces this artifact clustered on a single day; the fixture surfaces it (2026-06-23 rows) and it is a correct application of the symmetric definition, not a bug.

**Fixture invariants exercised (ACT-457-ADD-02 evidence block):** P1 (BBB market-wide → absent), P4 (GOOG→GOOGL alias with +3 signed distance), P5 (fwd_20d NULL at horizon), P6 (DDD pre-lookback → absent). P2 momentum quintile and drawdown bucket are DEFERRED from fixture testing because LAG(252) offset cannot be parameterized; both are exercised in the W2.5 90-day smoke run against real bars.

**EXPLAIN plan shape (90-day slice, no ANALYZE):** PK-index-driven `Index Scan on overshoot_daily_bars_pkey` for both ticker and SPY reads; `Merge Join` bars⇔universe consuming PK ordering directly into `WindowAgg` (no Sort node); `Hash Join` for SPY alignment (SPY = 1,284 rows). Total cost ≈ 90k for ~1.04M rows through WindowAgg. No seq-scan, no external sort, no spill risk indicators.

### W2.4 window-semantics reconciliation (CLOSED 2026-07-03, ACT-457-ADD-03)

**R-1 decision: QUALIFICATION over ARGMAX.** The grid's W dimension is the *detector-configuration* axis. A live detector configured `(W, band)` fires whenever `|excess_W| ≥ band`, independent of any other window's excess for the same event. ARGMAX partitioning (initial W2.3 impl) would arbitrarily assign each event to a single `(W, band)` cell, systematically understating arrival rates in cells whose events happen to have a "louder" neighbor cell. Under qualification, one calendar-day event can populate multiple `(W, band)` cells across the same side — that is the correct accounting for arrival-rate analysis.

**Storage:** the event row now persists `excess_w1..excess_w5` (numeric, NULL when the W-day lookback isn't satisfied). `move_pct` and `window_days` are retained as descriptive argmax summaries. Cell aggregation joins events by `CASE window_days WHEN 1 THEN excess_w1 ... END >= band_lo` per cell.

**Fixture proof:** scenario EEE — a sharp +8% one-day move on 2026-06-22 — reports argmax `window_days=1`, and its `excess_w3=+0.0800` is materialized on the same row, proving a live `(W=3, band=0.05)` detector fires on the same event alongside the `(W=1, band=0.05)` detector. Full ACTUAL≡EXPECTED evidence in ACT-457-ADD-03.

### W2.4 runner (`overshoot-study-run`)

Manual-invocation edge function (no cron). Contract: `POST { as_of?, param_grid?, slippage_haircut_bps_long?=5, slippage_haircut_bps_short?=15, min_band_bps?=300, run_label?, dry_run? }`. RBAC-gated by `overshoot.manage`; uses `productionClock` for the injected wall clock; uses `SUPABASE_DB_URL` via `postgres.js` to execute the study SQL bodies as `INSERT ... SELECT`. Sequence: snapshot ceilings → INSERT runs row (`outcome='running'`, **outside** the events/cells txn so failure is truthfully recorded) → txn { INSERT candidate_events, INSERT cell_results } → UPDATE runs `outcome='completed'`. Failure path rolls back the txn and UPDATEs runs to `'failed'`. `dry_run=true` executes detection as `SELECT count(*)` only and marks the runs row `'partial'`.

### W2.5 CLOSED (2026-07-04, ACT-457-ADD-06 + ADD-07)

D-1 through D-5 all PASS. First-ever successful live end-to-end: run `045d2dfc…2700` (90-day slice, 200 / 58.9s / 39,857 events / 6,000 cells / `outcome='completed'`). Latent cast-class bug (postgres.js unknown-type param resolution against `text` in arithmetic and date-compare contexts) uncovered by D-2 live probe and fixed as a class across both study SQL modules (6 `::date` + 2 `::numeric` casts). Machine-checkable regression test asserts every `:param` in both bodies carries an adjacent `::type` cast. Byte-exact hand-checks: three cells at the SQL level (largest arrival, mid-band, zero-cell) + two feature-level features (`drawdown_bucket=3` and `momentum_quintile=1` for ADP 2026-07-02, event 120077) all reconciled to stored values byte-exact.

### W2.6 phase mechanism (READY, NOT YET RUN — ACT-457-ADD-08)

Contract extension: `POST { …, phase?: 'detect'|'aggregate', run_id?, event_date_max?, event_date_min_full?, event_date_max_full? }`. `phase='detect'` seeds `overshoot_study_runs.param_grid = { window:{event_date_min_full, event_date_max_full}, phases_completed:[] }` on first call, appends `{min, max, event_count, completed_at}` per subsequent call. `phase='aggregate'` refuses (`409 aggregate_coverage_refused`) unless the union of `phases_completed` covers `[min_full, max_full]` contiguously (1-day gap tolerance; overlap allowed). Then runs cell-aggregation over the FULL events table for `run_id` — exact statistics preserved (no median-merge approximation). Legacy no-phase path unchanged.

**Measured budget** (from W2.5 empirical data): full-window detection ≈ 62.8s / 483,837 events; 90d slice ≈ 47s detect + 15.5s aggregate; projected full-window aggregation ≈ 189s over ~239K events → 251.8s total end-to-end vs 400s edge-fn ceiling = **2.1× margin**. **Fallback** (documented, not implemented): if the aggregate call ever exceeds ceiling, split into 6 slice-aggregate + merge; median approximated via T-digest or sort-merge over stored per-slice fwd-return arrays.

**Proposed W2.6 invocation plan (operator-owned, awaiting authorization):**

1. `W26_D1_BOOT` — dry, 90d, phase omitted (backward-compat probe on new deploy).
2. `W26_D2_DETECT_[1..6]` — `phase='detect'`, six 183-day slices spanning `[2023-07-05, 2026-07-02]`, first call omits `run_id`, subsequent calls pass the returned `run_id`. Expected per-slice: ~39K–42K events, ~80–90s wall.
3. `W26_D3_AGGREGATE` — `phase='aggregate'`, same `run_id`. Expected: ~189s wall, 6,000 cells, `outcome='completed'`.
4. `W26_D4_GATES` — six-MATCH, byte-exact hand-check of 3 cells against a full-window recomputation, coverage-refusal negative test (omit one detect slice, confirm 409).

### W2.6 CLOSED (2026-07-04, ACT-457-ADD-09 + ADD-10 + ADD-11)

**PIN-1 evidence correction (ADD-09).** W2.5 G1(b) narrated the momentum-quintile hand-check population as "848 tickers"; correctly-scoped population per runner SQL (`bars JOIN active_universe`) is **833** = (839 active universe) ∩ (non-NULL momentum_12_1). Quintile outcome invariant (ADP → Q1 either way); runner SQL scoping is correct — **no code defect**.

**PIN-2 slice-plan correction (ADD-10).** `lookback_min_date` = `MIN(bars.trade_date)+252` = **2022-03-08** (not the earlier heuristic `bars_max−4y=2023-07-05`). Full study window = **[2022-03-08, 2026-07-02] = 1577 days**. Six contiguous 263-day slices: `[2022-03-08..2022-11-25]`, `[…11-26..2023-08-15]`, `[…08-16..2024-05-04]`, `[…05-05..2025-01-22]`, `[…01-23..2025-10-12]`, `[…10-13..2026-07-02]`.

**Full ratified run (ADD-11).** `run_id=1888e113-f9b3-43f5-856c-d91666a3c121`, `outcome=completed`.

- **Detect (6 slices):** 85,638 + 69,165 + 65,575 + 76,252 + 84,400 + 102,807 = **483,837 events** (byte-exact vs D-1 baseline). Mean 64.6s ± ~3s per slice.
- **Aggregate:** 54.9s wall, 6,000 cells (12 bands × 5 windows × 5 mq × 5 db × 4 xw). Zero-cell anti-phantom: 109 zero-arrival cells, **0 phantom stat leaks**.
- **Tail split:** long=241,281 / short=242,556 (0.53% short skew; 90-day slice's 16.1% skew was a window artifact).
- **Alias earnings:** 219 events used `alias_used` (BRK.B/GOOG/FOX/NWS OR-map).
- **3-cell byte-exact hand-check (continuity):** `(long, L_10_INF, w=5, mq=3, db=3, xw=5)` = arrival 227 + all 6 stats byte-exact; `(short, S_10_INF, w=5, mq=5, db=5, xw=5)` = arrival 94 byte-exact; `(long, L_05_06, w=3, mq=1, db=3, xw=5)` = populated non-degenerate.
- **Negative probe:** aggregate on fresh run_id → **400 `phase_aggregate_requires_run_id`** (stricter input-validation gate; earlier than the anticipated 409 `aggregate_missing_window_contract`). Categorical refusal is preserved.

**Duration reality-check vs W2.6-READY model.** Boot dry no-phase: 60.3s (model 62s ✓). Detect: 64.6s ± 3s per slice (model 85s — SQL faster than projected). Aggregate: 54.9s (model 189s — pessimism source: `overshoot_study_candidate_events` is materialized once; aggregate does NOT re-run detection). **Full end-to-end wall ≈ 7m 45s**. The 400s/aggregate ceiling has **7.3× margin**, not 2.1× — the phase mechanism, while correct and useful for future windows exceeding 400s, is not strictly required for the current study window. **Full-window single-shot detect fits in 60s.** Candidate for W2.7 simplification proposal (not rollback — the phase mechanism remains sound).

**W2.7 opens:** module-doc W2 section stamped CLOSED, publish coverage + arrival-rate tables, publish representative-cell selection, honest write-up of the phased-vs-single-shot tradeoff, close FP-069 W2.

### W2.7 CLOSED — W2 close-out (2026-07-04, ACT-457-ADD-12)

FP-069 **W2 CLOSED**. Read-out evidence tables T1–T6 published verbatim in ACT-457-ADD-12 (with SQL), sourced entirely from run `1888e113-f9b3-43f5-856c-d91666a3c121` against `overshoot_study_cell_results` / `overshoot_study_candidate_events`. Parameter ratification (band × window × momentum-quintile × drawdown-bucket × exclusion selection) is a distinct supervisor-tier decision at the W3 gate — **not** authored in W2.

**Read-out headlines (evidence in ACT-457-ADD-12):**

- **T2 answers the charter's >40%-drawdown question with data.** LONG upper-tail (`L_08_10 ∪ L_10_INF`, w=3, excl=5), deepest drawdown bucket (db=5): mean_r5 = +0.05% (near-zero), hit_rate_5d = 45.0%, but mean_r20 = **+4.71%** at n=1,032 — the reversion signature is delayed, not absent, consistent with DW-212's r5 stagnation but eventual rebound of already-crashed names. SHORT db=5: mean_r5 = **−2.47%**, mean_r20 = **−7.14%**, hit_rate = 42.5% at n=1,521 — the strongest short-tail edge in T2, deep-drawdown pops fade hardest.
- **T4 validates the 12-1 momentum thesis directly.** LONG mq=5 (upper-tail band group, w=3, excl=5): mean_r5 = **+1.10%**, mean_r20 = **+4.90%**, hit_rate = 54.8% (vs mq=1 at −0.12% / +1.44% / 47.0%). SHORT mq=5: mean_r5 = **−1.52%**, mean_r20 = **−4.29%**, hit_rate = 39.9%. Both tails concentrate edge in the extreme momentum quintile — the charter's central hypothesis.
- **T5 shows the top-edge is a persistent signature, not a 5-day fluke.** All **20/20** top cells (10 long by max mean_r5, 10 short by min mean_r5, n≥100) have `SIGN(mean_r5) == SIGN(mean_r20)`. Every top-edge cell clusters in the extreme bands (`L_10_INF` / `S_10_INF` / `S_08_10`).
- **T3 reframes the exclusion filter.** Across widths 0/3/5/7 the mean_r5 barely moves (long: −0.007pp end-to-end; short: +0.002pp) while arrivals shrink 26–32%. The filter is a **decorrelation contract** (avoiding double-counting adjacent same-ticker dislocations) rather than an edge multiplier. Parameter selection may choose the smallest exclusion satisfying the decorrelation acceptance without paying arrival-rate.
- **T6 shows capacity is not binding.** Three plausible detector configs (`|m|≥7% w≤2`, `|m|≥10% w≤3`, `|m|≥15% w≤5`, all excl=5) yield 4–11 candidate arrivals per trading day per side (upper bound before exclusion; T3 implies ~26% reduction with excl=5). Every plausible config is arrival-rich vs the 20-slot-per-side book cap. W3's live detector will need a ranking/priority discipline (mq × db × band × turnover-tolerance), not accept-all.
- **T1 supplies the full detector-configuration menu.** 60 rows per tail across `band × window` at excl=5, with arrival-rate-per-ticker-year normalized as `arrival_count / 839 (active universe) / 4.3176 y`.

**Phase-mechanism disposition: KEEP.** The phased detect/aggregate contract stays in-code. Rationale: (a) proven byte-exact against the single-shot baseline in W2.6 (Δ=0 across 483,837 events; 3-cell hand-check byte-exact); (b) it is the ONLY sanctioned path for future windows that exceed the 400s edge-fn ceiling — the FINRA-SI backfill charter (see "FINRA-SI procurement" above) would widen the study window materially and possibly cross the ceiling; (c) it carries zero runtime cost on the legacy no-phase path (backward-compat is byte-for-byte, per ACT-457-ADD-08 C1). The observation that the current 4.32-year window fits single-shot detect (60s vs 400s ceiling = **7.3× margin**) is *not* grounds for rollback — the mechanism is the escape hatch, not the default.

**Single-shot option note.** For study re-runs on the current window shape (≤5y, ~500K events), the single-shot no-phase invocation is the operationally-simpler choice: one edge-fn call vs 6 detect + 1 aggregate + 1 coverage check. The phased path remains the sanctioned choice when (i) event volume or window length projects wall-time above 300s (60% of ceiling), or (ii) an operator wants per-slice pause/resume around a suspected-flaky window. Both paths write the SAME rows to `overshoot_study_candidate_events` / `overshoot_study_cell_results` — the runs-row `param_grid.phases_completed` array is the only structural difference and its presence/absence does NOT affect downstream reads.

**Effective-vs-nominal window-start reconciliation.** ACT-457's original arithmetic block computed the usable window as `[bars_min + 252 trading days, bars_max − 20 trading days] ≈ [2022-06-27, 2026-06-04]`. The runner's **effective** boundary is `lookback_min_date = MIN(bars.trade_date) + 252 = 2022-03-08` — 111 calendar days earlier than the nominal, because `bars_min` in the nominal used a heuristic (approx `2021-06-29 + 252 CAL days`) while the runner reads the true minimum trade_date from the pinned snapshot and adds 252 TRADING days. The upper bound `2026-07-02` intentionally EXCLUDES the 20d forward-return safety margin: `fwd_return_20d` is materialized via `LEAD`, returning typed-NULL beyond the horizon (P5 discipline — no truncated pseudo-returns). Both boundaries are honest; the effective window is *wider* than the ADD nominal implied. Downstream: the ADD nominal-window arithmetic row (ACT-457, "Usable study window (arithmetic accepted)") is superseded-under-pointer by the runner-derived value for future study runs.

## Wave 3 — Live detector + broker-first execution (OPENED 2026-07-04, ACT-458)

**W3 GO ratified** (operator, post-W2.7). Detector priors (from operator ratification):

- **LONG**: `excess_w ≥ +10%` for w∈{1,2,3}; `momentum_quintile ∈ {4,5}`; `drawdown_bucket ∈ {1,2,3}`; `exclusion_width = ±5`. Ranked selection.
- **SHORT**: `excess_w ≤ −8%` for w∈{1..5}; `drawdown_bucket ∈ {4,5}`; `momentum_quintile ∈ {1,5}`; `exclusion_width = ±5`; **unconditional live squeeze filter** applied on top. Ranked selection.
- **Capacity**: up to 20 slots/side (variable inventory; T6 confirmed arrival-richness is such that ranking, not capacity, is the design problem).
- **Cadence**: EOD (T close), stabilization-trigger entry at T+1 (per W3 pre-build investigation I2 recommendation).

**P-A** (Alpaca paper account #2 + `ALPACA_PAPER_KEY_OVERSHOOT` / `ALPACA_PAPER_SECRET_OVERSHOOT`) confirmed provisioned.

### W3.1 CLOSED — execution-substrate schema (2026-07-04, ACT-458)

Seven overshoot-namespaced tables landed via one atomic migration. Live evidence (information_schema.tables + pg_policies) confirms all seven present with expected column counts and RLS enabled with the ratified policy trio (SELECT via `has_permission(auth.uid(), 'overshoot.view')`; RESTRICTIVE deny of authenticated writes on non-audit tables; service-role FOR ALL on write-heavy tables; audit is INSERT-only for authenticated + service-role ALL).

| Table | Cols | Role in the money path |
| --- | --- | --- |
| `overshoot_detection_runs` | 10 | One row per EOD detector fire. `outcome ∈ {running,completed,failed,no_op}`, `durations_ms jsonb`, `correlation_id`, `git_sha`. |
| `overshoot_events` | 21 | The W4 console substrate. `excess_w1..w5`, `argmax_window_days`, `momentum_quintile`, `drawdown_bucket`, `days_to_nearest_earnings`, `earnings_alias_used`, `filter_passes jsonb` (per-filter pass/fail with reasons), `filter_refusal_reason`, `selected_for_entry`, `rank_score`, `study_cell_ref jsonb` (P-B#4 lookup provenance). |
| `overshoot_lots` | 14 | FIFO tax-lot ledger. Byte-shape mirror of `longshort_lots` MINUS `locate_id` and `wash_sale_*` (dropped v1 per W3 investigation I3/I5: no pre-trade locate requirement in overshoot priors; wash-sale accounting deferred to a later wave). Drop is pinned in `COMMENT ON TABLE`. |
| `overshoot_target_positions` | 7 | `run_id, ticker, side, target_shares, target_notional, rank_score, computed_at`; PK `(run_id, ticker, side)`. |
| `overshoot_reconciliation_state` | 10 | Byte-shape mirror of `longshort_reconciliation_state`. State-as-projection cache; authoritative log is `reconciliation_events`. |
| `overshoot_short_interest` | 6 | Polygon-derived cache. `si_pct_float` = raw SI ÷ current shares-outstanding — **conscious approximation** pinned in `COMMENT ON TABLE` verbatim in spirit with the longshort short-interest-orchestrator precedent. Typed absence via NULL (§9 SENTINEL — never fabricated zero). |
| `overshoot_audit_logs` | 10 | Mirror of `longshort_audit_logs`. Append-only. Sole sanctioned writer is `_shared/strategy-audit.ts writeStrategyAuditEvent({strategyKey:'overshoot', ...})`. |

**Strategy-audit registry**: `KNOWN_STRATEGY_KEYS` in `supabase/functions/_shared/strategy-audit.ts` gains `'overshoot'` (additive; no structural edit). Router now resolves `strategyKey='overshoot'` → `overshoot_audit_logs` via the existing `resolveStrategyAuditTable` template. Unknown-key fallback path (`unknown_strategy_key` structured failure) is UNCHANGED — a call from any strategy not on the list still returns a typed failure without throwing.

**No new permission was created.** `overshoot.view` is expected pre-existing from earlier study waves (referenced by the study-substrate policies).

**Gates cleared this step:** `npx eslint supabase/functions/_shared/strategy-audit.ts` clean (exit 0); `deno check supabase/functions/_shared/strategy-audit.ts` clean (exit 0); §22.5.1 live-DB evidence pasted in ACT-458; both `deno.lock` files untouched (no dependency change). Pre-existing linter warnings (SECURITY DEFINER on legacy DB functions; service-role `USING(true)` on FOR ALL policies) are the ratified longshort pattern class — not introduced by this migration.

**W3.2 readiness**: overshoot-broker sibling adapter tree (`supabase/functions/_shared/overshoot-broker/`) is the next step per the W3 wave-plan (investigation I3). No secrets probed this step per operator instruction.

### W3.2 CLOSED — overshoot-broker sibling adapter tree (2026-07-04, ACT-459.a/b/c)

The broker surface the W3 money-path will call sits at `supabase/functions/_shared/overshoot-broker/`. Six adapters + one interfaces file, delivered across three atomic sub-turns (ACT-459.a/b/c), all gate-clean.

| File | Role | Endpoint |
| --- | --- | --- |
| `overshoot-broker-interfaces.ts` | Signature-identical redeclaration of the ten `Broker*` types the six adapters consume. B1(a) owned-interface ruling (HttpFetch precedent, W1b ACT-456). | n/a |
| `overshoot-broker/alpaca-paper-client.ts` | Auth + fetch primitive. Secrets `ALPACA_PAPER_KEY_OVERSHOOT` / `ALPACA_PAPER_SECRET_OVERSHOOT`. INC-77 paper-only-URL allow-list preserved verbatim. Four typed error classes with `Overshoot*` prefix. `fetchImpl` test-seam. | — |
| `overshoot-broker/alpaca-order-submitter.ts` | Submit an order. DW-149 market-order `limit_price` omission preserved. `submitted_at` ISO-or-injected-`ts` fallback. **B2 discipline — `client_order_id` OPAQUE passthrough**, explicitly tested. | POST /v2/orders |
| `overshoot-broker/alpaca-order-canceller.ts` | Cancel an order. 422 → idempotent no-op (Alpaca terminal-order semantics). All other statuses propagate typed. | DELETE /v2/orders/:id |
| `overshoot-broker/alpaca-fill-fetcher.ts` | Poll fill state. Trichotomy preserved (unfilled / partial / filled). `avg_fill_price` TYPED ABSENCE — never fabricated 0-fill on `null` or empty-string. `fetched_at = ts`. | GET /v2/orders/:id |
| `overshoot-broker/alpaca-position-fetcher.ts` | Broker-truth positions. 404 → `null`. FP-068 W1 additive fields (`unrealized_pl` / `unrealized_intraday_pl` / `lastday_price`) preserved with typed-absence branching. **Broker-truth surface — persisted-projection semantics untouched by this layer.** | GET /v2/positions{,/{symbol}} |
| `overshoot-broker/alpaca-shortability-fetcher.ts` | Pre-trade SHORT gate. Inactive/non-tradable → structurally not shortable regardless of stale flag. 4xx → EXPLICIT `shortable: false` result echoing requested symbol (NEVER fabricated `true`). 5xx / network errors propagate typed per DEC-034 (3). `easy_to_borrow` typed-absence → `null`. | GET /v2/assets/{symbol} |

**Transcription-over-allowlisting rationale (MAINTENANCE-DUALITY NOTE, NAMED FUTURE AUDIT ITEM).** Every overshoot adapter is a **behavior-identical, byte-shape-equivalent** transcription of its longshort sibling — POST bodies, endpoint paths, error branches, and the INC-77 paper-only-URL allow-list are all identical. Only three rebindings differ: type imports (`../overshoot-broker-interfaces.ts`), client + error-class imports (`Overshoot*` prefix), and class name.

The alternative — a single shared adapter with a strategy-key allow-list — was explicitly rejected. A shared adapter re-introduces the exact membrane the separation guard exists to prevent: a single edit path can silently divert overshoot's account-#2 traffic into longshort's account #1 (or the reverse). The membrane is worth the maintenance cost.

**The price of membrane independence** is that the two INC-77 paper-only-URL allow-list copies (and the client shapes generally) must be kept in sync manually. This is a **named future audit item** — cadence: reviewed at every subsequent overshoot broker-surface amendment AND at the start of each W3 sub-wave (W3.3 / W3.4 / …). The audit compares:
1. `PAPER_ONLY_ALLOWED_URL_PREFIXES` between the two clients (bytes MUST match unless divergence is DEC-ratified).
2. Adapter method signatures and error-branch structure per sibling pair.
3. INC-77 guard closure — construction-time throw semantics MUST match.

Drift MUST be surfaced in the audit block of the initiating sub-turn's ACT entry. Silent drift is a §22.8-class stop condition.

**Blocker rulings (verbatim, from ACT-459):** **B1(a)** overshoot tree OWNS its execution contract (signature-identical transcription, NOT an import). **B2(a)** NO CID scheme / intent / state-machine content in W3.2; opaque passthrough only; scheme lands at W3.4. **B3(a)** operator-local `curl` paste is the account-#2 credential-value gate (paste in ACT-459: `PA37Y0DBAZD5`, ACTIVE, `shorting_enabled: true`, distinct from account #1 `PA3CRAJBSVZO` per `docs/06-tracking/incidental-findings.md:954`). Runtime GATE-ZERO probe (edge-runtime secret visibility) deferred to W3.3.

**Gates cleared this wave:** ESLint clean on all 10 new files; `deno check` clean on all 10 new files; separation guard 0 violations at every sub-turn (`_shared/overshoot-broker/*` predicate added to `scripts/check-overshoot-separation.ts` at W3.2.a); Gate-11 subset over `_shared/overshoot-broker/` at W3.2.c close: **43 passed | 0 failed (329ms)**. Lockfile hygiene: `deno.lock` root untouched across all three sub-turns; `supabase/functions/deno.lock` gained the postgresjs → std@0.132.0 subtree at W3.2.a merge (`ebfd06f7`) as a legitimate consequence of the gate-11 refactor extending the type-checker's transitive-resolution reach over `overshoot-study-run/index.ts`; corrected characterization landed in ACT-459.a-ADD; forward-binding rule §22.8.4 (lockfile diffs enumerated pre-commit; "untouched" verified by `git diff`, never asserted) now binds. Supervisor-side CI check-runs on `ebfd06f7`: strong-evidence SUCCESS, toolchain-parity SUCCESS, separation-guard SUCCESS.

**W3.3 readiness**: overshoot short-interest sibling fetcher (over `OvershootAlpacaPaperClient` or a Polygon-shaped analog per the longshort SI orchestrator precedent) + first disarmed cron. The runtime **GATE-ZERO** probe seam (edge-runtime visibility of `ALPACA_PAPER_KEY_OVERSHOOT` / `ALPACA_PAPER_SECRET_OVERSHOOT`) arrives with W3.3's first live-runtime touch.

**Negative-probe acceptance.** The fresh-aggregate 400 `phase_aggregate_requires_run_id` refusal (W2.6 NEG probe) is ACCEPTED as a valid coverage-refusal proof. The stricter input-validation gate fires earlier than the anticipated 409 `aggregate_missing_window_contract`; the categorical no-run_id-no-aggregate contract is preserved. No code change warranted.

**Run-of-record lineage (for W3 pinning).** `run_id=1888e113-f9b3-43f5-856c-d91666a3c121`, `param_grid_hash=a37e4b96…f354e80`, `git_sha=0c5ad0d9`, `outcome=completed`, `as_of=2026-07-02`, `bars_snapshot_max_date=2026-07-02`, `earnings_snapshot_max_date=2026-07-02`, stamps: `survivorship=UPPER_BOUND_SURVIVORSHIP_BIASED`, `performance=NON_PERFORMANCE_STUDY_ONLY`, `short_filter=NO_SQUEEZE_FILTER_ARRIVALS_UPPER_BOUND_RETURNS_CONSERVATIVE`, `return_basis=CLOSE_TO_CLOSE_REFERENCE`. Any W3 parameter-ratification reads must scope to this run_id.

**W3 gate status.** W2 obligations are discharged. W3 opens on operator ratification of a detector-parameter tuple (band × window × momentum-quintile × drawdown-bucket × exclusion-width) informed by T1–T6, plus provisioning of the second Alpaca paper account and its two secrets (per the SEPARATION CONTRACT §1). Parameter ratification is a supervisor-tier decision, not a build task.

### W3.3 CLOSED — short-interest commons populated under audited arm-bracket (2026-07-04, ACT-460.a/b.i/b.ii/b.iii + ACT-460.b.iii.arm)

The overshoot short-interest common (`public.overshoot_short_interest`) is populated end-to-end. The `overshoot-short-interest-compute` edge function is **deployed-disarmed**: the code, registry seed, deployed bundle, and GATE-ZERO dual-vendor probes are live, but the `job_registry.overshoot.short_interest.compute.enabled` row remains `false` and no `cron.job` row wires it — the batch that populated the table ran under a manual audited arm-bracket, not a cron fire.

**Substrate state (W3.3 CLOSED, 2026-07-04):**

| Surface | State | Notes |
| --- | --- | --- |
| `overshoot-short-interest-compute/index.ts` | DEPLOYED (517 lines; sha256 `7cac0924…70d0ea` on HEAD `0fb08235…`) | DEC-023 envelope; `overshoot.manage` RBAC; injected clock (`productionClock.getWallClockTs()`); resumable batch (`{as_of?, probe?, tickers?, batch_size?, resume_from?}`); three skip gates (kill-switch / job-disarmed / probes). |
| `_shared/overshoot/polygon-shares-outstanding-fetcher.ts` + `_test.ts` | LANDED (ACT-460.a) | Signature-identical transcription of the longshort sibling; typed-absence on unavailable. |
| `_shared/overshoot/polygon-short-interest-fetcher.ts` + `_test.ts` | LANDED (ACT-460.a) | Raw SI share counts + typed-absence DTC (prefer `days_to_cover`, else `short_interest / avg_daily_volume`, else null — never fabricated zero). |
| `job_registry` row `overshoot.short_interest.compute` | SEEDED, DISARMED (MIG-151) | `enabled=false, status='registered'`, schedule `'0 21 1,15 * *'`, handler_path exact match to deployed function. Disarm-fire-enable convention honored. |
| `sql/30_overshoot_short_interest_cron_schedule.sql` | AUTHORED-PENDING-APPLY | NOT executed in W3.3. Header states the four-step post-apply verification block; arming deferred to a future operator-authorized W3 arming gate. |
| `cron.job` overshoot rows | ZERO throughout W3.3 | Verified pre-bracket AND post-bracket. |
| `overshoot_short_interest` rows | 5,034 across 839/839 active tickers, 7 distinct as_of dates spanning `2026-03-13 → 2026-06-15` | 42 rows with `si_pct_float=NULL` (7 shares-unavailable tickers — denominator typed-absence); 0 rows with `dtc=NULL`; 21 source_run_ids partitioning the write (20×240 + 1×234). |

**A3 derivation contract (byte-verbatim to `_shared/longshort-signals/short-interest-change/short-interest-orchestrator.ts:319-335`):** `si_pct_float = r.short_interest / shares` under `Number.isFinite(shares) && shares > 0`; typed-null fallback when `shares === null`. Conscious-approximation (current shares-outstanding used to denominate historical SI counts) documented at the divide site, in the `COMMENT ON TABLE overshoot_short_interest`, and in the compute file's header docstring.

**GATE-ZERO dual-vendor probes (both PASS, ACT-460.b.ii):**
- ALPACA: 200 `account_last4=AZD5, status=ACTIVE, paper=true, correlation_id=13e5affb-4b93-4936-bbc9-b0ee1a9ab8d0` — B3 (account #2 `PA37Y0DBAZD5`) validated as the edge runtime sees them; zero `SVZO` cross-contamination.
- POLYGON: 200 `status=reports, report_count=6, correlation_id=0eb4c1b0-19a2-40c1-9bff-2b3ab0ace49a` — one SI fetch, zero writes.

**Arm-bracket protocol (ACT-460.b.iii.arm) — the pre-arming manual-run procedure documented here for reuse.** The compute's SKIP GATE #2 (job disarmed) is the sole seam blocking manual runs against a disarmed registry row. Until either sql/30 is armed or a `force:true` bypass ships, batches run inside this audited bracket:

**STRUCTURAL FENCE (definition, binding for this module):** "cron arming" is executing `sql/30` or creating/enabling any `cron.job` row targeting the compute. A `job_registry.enabled` flip inside an audited bracket is **NOT** cron arming provided `cron.job WHERE jobname LIKE 'overshoot%'` holds zero rows for the bracket's duration. The disarm gate blocking a batch is the convention functioning correctly, not a defect.

**Seven-step protocol (every step recorded in the initiating ACT entry, verbatim pastes):**
1. **FENCE PROOF** — `SELECT count(*) FROM cron.job WHERE jobname LIKE 'overshoot%'` MUST equal 0. Non-zero → STOP.
2. **PRE-STATE** — `SELECT id, enabled FROM job_registry WHERE id='overshoot.short_interest.compute'` MUST show `enabled=false`.
3. **ARM** — `UPDATE job_registry SET enabled=true WHERE id='overshoot.short_interest.compute'` (note: `status` column is bound by `job_registry_status_check ∈ {'registered','paused','poison'}`; keep as `'registered'` — do NOT set to `'enabled'`).
4. **BATCH** — direct-`localStorage` §7.5 loop script, resume-by-cursor over the active universe to `done=true`. Fixed `as_of` (reused by step 5). Per-invocation `[#NN]` log lines + TOTALS + RUN_IDS pasted back verbatim.
5. **IDEMPOTENCY** — re-invoke ONE batch at the same `as_of` (no `resume_from`, so it hits the first-`batch_size` slice deterministically). Prove: `md5(string_agg(ticker|as_of_date|si_pct_float|dtc, ',' ORDER BY ticker,as_of_date))` byte-identical before/after; `distinct_run_ids` same slice = 1 (upsert fully overwrites `source_run_id`/`computed_at`); `si_pct_float, dtc` unchanged.
6. **DISARM** — `UPDATE job_registry SET enabled=false ...`; POST-STATE `SELECT` paste confirms `enabled=false`.
7. **FENCE RE-PROOF** — cron.job overshoot count still 0.

STOP conditions: fence-proof non-zero at step 1 or 7; batch surfacing a compute defect (the row is re-disarmed BEFORE stopping); any `sql/30` execution.

**Named future design item (evidence-gated, NOT built now):** if the arm-bracket cadence becomes a repeated burden, a `force:true` bypass on SKIP GATE #2 keyed to `overshoot.manage` RBAC (or a longshort manual-sibling analog) is the amendment to consider. Not required by any pending wave.

**§22.5.1 evidence bundle (verbatim reads):** totals `5,034 rows / 839 distinct tickers / 839 active universe / zero-row count = 0 / 7 distinct as_of dates / min 2026-03-13 max 2026-06-15`. Typed-absence: `si_pct_float_null_rows=42` across 7 shares-unavailable tickers (sample ACGL, BLD, HON, JHG — `si_pct_float=NULL` with `dtc≠NULL`, `source_run_id` present); SI-unavailable→no-row shape stated in compute header lines 60–65 and verified by `si_unavailable_count=0` across all 21 invocations. dtc coverage: `dtc_null_rows=0 / dtc_derived_rows=5,034`. Spot cross-check (AAPL): `2026-06-15 si_pct_float=0.0098 dtc=2.76`, `2026-05-29 0.0106/3.38`, `2026-05-15 0.0094/2.74` — plausibility PASS (mega-cap SI% ≈ 1%, DTC 2.7–3.4d). Runs attribution: 21 UUIDs partitioning 5,034 rows as 20×240 + 1×234.

**Idempotency proof (delta-0):** `derivation_hash_pre=derivation_hash_post=24b6e4bc1c176ae97d126385e675b42f` on the first-40-ticker slice; only `source_run_id`/`computed_at` refreshed.

**Incidental fix-forward (ACT-460.b.iii):** four `apiError()` sites in `overshoot-backfill-bars-manual/index.ts` were passing extra `{detail, correlationId}` props incompatible with the shape — extra context now routes to `console.error(...)` before the `apiError(status, code, {correlationId})` call. Redeploy `d24fd4f4…7102b7da` on HEAD `9e149090…`; 55/55 gate-11 subset PASS.

**W3.4 readiness:** detector kernel + byte-exact study-parity property test (the basis-fidelity gate — kernel outputs must match study-cell outputs bit-for-bit on the ratified `run_id=1888e113-f9b3-43f5-856c-d91666a3c121` fixture). **Do NOT begin W3.4 until operator authorizes.**

### W3.4 CLOSED — detector kernel-reuse + basis-fidelity gate + live orchestration (2026-07-04, ACT-461.a/b/c)

**Architecture ratified (R-3 AGREE, three sub-turns).** The live detector REUSES `_shared/overshoot/study/event-detection.sql.ts` as the shared kernel — parameterized `event_date_min = event_date_max = as_of` — with a TS orchestration layer wrapped around it. The kernel is already a pure `SELECT` (`export default sql;` at :296); the study runner concatenates `INSERT INTO overshoot_study_candidate_events (cols) ${detectionCore}` at two call-sites (`overshoot-study-run/index.ts:404` batched, `:461` legacy single-shot). No refactor was needed; kernel-reuse is byte-untouched.

**Fixture-first parity (W3.4.a).** Three JSONL fixtures captured under rule β (quantile-partition of distinct event_dates ascending, rank `ceil(q×N)` 1-based at q ∈ {0.05, 0.50, 0.95}, thresholds `n_events≥200 ∧ n_long≥20 ∧ n_short≥20`, forward-walk on failure): `2022-05-24` (536 rows), `2024-05-02` (432 rows), `2026-04-15` (698 rows) — all under `_shared/overshoot/detector/fixtures/*.jsonl`, 18 kernel-derived columns per row, canonical ordering `(ticker, side, window_days, alias_used NULLS FIRST, move_pct)`, JSON `null` for typed absence, provenance headers pin `run_id=1888e113-…`, `param_grid_hash=a37e4b96…`, capture HEAD SHA.

**Basis-fidelity parity gate (W3.4.b) — LIVE ALL-MATCH.** `_shared/overshoot/detector/basis-fidelity_test.ts` imports `EVENT_DETECTION_SQL` unmodified, mirrors the runner's `bindNamed(stripStatementBody(...), DETECTION_PARAM_ORDER)` pipeline, executes live against production commons with immutable provenance binds, computes `sha256(body)` via the identical canonical serializer, and asserts byte-equality against the fixture headers with **zero tolerance**. All three fixture days MATCH: `2022-05-24 → e19f8a78…c9f09c6 MATCH`, `2024-05-02 → 986b0dad…d2e933e75 MATCH`, `2026-04-15 → e74fbe84…36ad58ef MATCH`. LIVE tests env-gated via `ignore: !ENV_READY` (`OVERSHOOT_PARITY_LIVE=1 && SUPABASE_DB_URL.length > 0`; sibling precedent `insider-r2-concurrent-claim_test.ts:87`); non-gated pure tests (harness logic + fixture byte-integrity) always run in CI.

**Detector orchestration (W3.4.c) — pure module `_shared/overshoot/detector/detector.ts`.**

| Surface | Contract |
| --- | --- |
| Purity | Zero DB / zero network / zero wall-clock / zero `Deno.serve`. All inputs (candidate rows, SI rows, study-cell stats, shortability, as-of date, params) injected. Wiring to live reads lives in the W3.5 edge function. |
| Filter pipeline (per (ticker,side) group; kernel argmax by `|excess|` within the side's allowed window set) | (0) side-window-set → (1) excess-threshold (LONG ≥ +0.10, SHORT ≤ −0.08) → (2) momentum-quintile-in-set (LONG {4,5} / SHORT {1,5}) → (3) drawdown-bucket-in-set (LONG {1,2,3} / SHORT {4,5}) → (4) earnings-exclusion (`|dte| > 5`) → (5) si-squeeze-gate (SHORT only) → (6) study-cell-lookup → (7) capacity-slot. Every stage records a `filter_passes[]` entry (pass/fail + reason + detail). |
| Refusal taxonomy (verbatim `RefusalReason` union — persisted in `overshoot_events.filter_refusal_reason`; stable strings; renaming needs a `filter_passes` schema migration) | `excess_below_threshold`, `window_out_of_set`, `momentum_out_of_set`, `drawdown_out_of_set`, `exclusion_earnings_proximity`, `si_unavailable`, `si_stale`, `si_below_squeeze_threshold`, `no_study_cell`, `capacity`. |
| SI squeeze gate | SHORTS only, UNCONDITIONAL, DEFAULT-DENY. `squeezeSiPctFloatMin` (named param — caller-supplied; no hard default baked here). `siStalenessMaxDays` (named param — derivation: SEC settles short interest twice per calendar month at mid-month + month-end with ~8-business-day publication delay; a fresh row lands within ~15 calendar days of publication, so `siStalenessMaxDays ≥ 21` spans one missed cycle plus grace). Missing row → `si_unavailable`; `si_pct_float === null` → `si_unavailable` (typed absence, NEVER 0); `(asOf − as_of_date) > siStalenessMaxDays` → `si_stale`; `si_pct_float < threshold` → `si_below_squeeze_threshold`. |
| Rank score | `overshoot_study_cell_results` lookup for run `1888e113-…` (boot assertion `assertStudyProvenance` reuses the harness pattern in `basis-fidelity_test.ts:277-294`). Cell absent OR `mean_fwd_return_5d IS NULL` → REFUSED `no_study_cell` with the exact cell key persisted. `rank_score = mean_fwd_return_5d × sideSign` (LONG +1 / SHORT −1) so higher = better across both sides. NEVER defaulted. |
| Slot-aware selection | `capacityPerSide` (named param — charter default 20). Selection = `rank_score DESC` with `|excess| DESC` tiebreak, per side. Unselected-but-qualified candidates persist with `selected_for_entry = false` and `filter_refusal_reason = 'capacity'` — the W4 console MUST see what was passed over as well as what was taken. |
| LONG shortability recording (P-B#5) | `shortabilityLookup` optional; result recorded on LONG events (typed-null otherwise). NEVER gates. |

**Refused-with-reason test matrix (`detector_test.ts`).** 18/18 passed (`deno test --no-check --allow-read _shared/overshoot/detector/detector_test.ts` → `ok | 18 passed | 0 failed (25ms)`). Coverage: (a) boot-assertion accept + hard-fail on run_id mismatch + hard-fail on hash mismatch (3 tests); (b) every prior-filter refusal (window, excess, momentum, drawdown, earnings-exclusion — 5 tests); (c) every SI refusal (si_unavailable-no-row, si_unavailable-typed-null, si_stale, si_below_squeeze_threshold — 4 tests); (d) every study-cell refusal (lookup-null, mean-null — 2 tests); (e) selection determinism with |excess| tiebreak + capacity persistence (1 test); (f) LONG shortability recording never-gates (1 test); (g) never-silent-drop contract — every (ticker,side) group yields exactly one observable output row (1 test); (h) happy-path selection (1 test).

**Gates cleared this wave (W3.4.c).** `deno check` clean on both new files; `npx eslint` clean on both new files; guard-real-tree `check-overshoot-separation` = 0 violations, `check-wall-clock` = 0 violations; Gate-11 subset on `detector_test.ts` = 18/18 PASS. **Lockfile diff-command output (per R-LOCK-2(c) rule upgrade):** `git diff ef8c5730 HEAD --stat -- supabase/functions/deno.lock deno.lock` → `(no diff — HEAD == ef8c5730 pre-turn commit)`. Both lockfiles measured post-edit: `deno.lock 47513B`, `supabase/functions/deno.lock 51849B` (byte-identical to pre-turn). No dependency was added by the pure module (imports are the same std/postgres already resolved by the harness). Six-MATCH N/A (no edge-function deploy this sub-turn).

**§7.5 same-day sequencing constraint (W3.5 readiness).** The detector reads `overshoot_daily_bars` at close-of-T through the kernel's SELECT. The W3.5 EOD edge function MUST call the daily bars-append job BEFORE invoking the detector for as-of=T; the detection-run edge function will (a) verify bar for `as_of` is present (typed refusal `bars_missing_for_asof` if not — no synthetic fill), (b) call kernel with `event_date_min=event_date_max=as_of`, (c) fetch SI + study-cell + shortability inputs, (d) call `runDetector`, (e) upsert into `overshoot_events` (PK on `run_id, ticker, side`), (f) write one `overshoot_detection_runs` row with `outcome ∈ {completed,failed,no_op}` and `durations_ms` per stage. All parameter values (thresholds, capacity, staleness window) come from a single named-param source hashed into `overshoot_detection_runs.git_sha`/param provenance — the same DEC-023 envelope pattern the SI compute uses.

**W3.5 readiness:** `overshoot-detection-run` edge function under DEC-023 envelope; bars-append sequencing (invoke-before-detect); RBAC `overshoot.manage`; disarmed cron seed at `T close + N minutes`; kill-switch skip gate; boot-assertion for study-run provenance; §7.5 invocation shape identical to `overshoot-short-interest-compute` (probe modes short-circuit BEFORE skip gates). **Do NOT begin W3.5 until operator authorizes.**

## Wave 3.5 — Detection-Run Pipeline (LANDED at ACT-462.b, 2026-07-04)

**Entry point.** `supabase/functions/overshoot-detection-run/index.ts` (DEC-023 envelope, RBAC `overshoot.manage`). Cron seed disarmed at MIG-152; cron wiring authored (not applied) at `sql/31_overshoot_detection_run_cron_schedule.sql` (`0 22 * * 1-5`); operator arms at W3.5.c after GATE-ZERO + dry-run + first-real-detection attestation.

**7-stage pipeline (verbatim order — the money-path setup contract).**

1. **Method + JSON parse.** POST-only guard. Body: `{ as_of?: 'YYYY-MM-DD', probe?: boolean, dry_run?: boolean, correlation_id?: string }`.
2. **RBAC.** `authenticateRequest` + `checkPermissionOrThrow('overshoot.manage')`. Denials 401/403 with correlation_id.
3. **Boot assertion (fail-fast, pre-pipeline).** Import `RATIFIED_STUDY_RUN_ID` + `RATIFIED_PARAM_GRID_HASH_PREFIX` + `assertStudyProvenance` from `_shared/overshoot/detector/detector.ts` (single home — zero duplication, zero detector edits). Assert `overshoot_study_runs` holds exactly one row with `run_id = <full UUID equality> AND param_grid_hash LIKE '<prefix>%' AND outcome='completed'`. Failure → typed `boot_assertion_failed_priors_not_found` 500 with correlation_id, BEFORE any subsequent stage. Rank-score integrity is proven at the door, never assumed downstream.
4. **Probe short-circuit.** `probe=true` short-circuits BEFORE the skip gates so credential hygiene stays observable when the job is disarmed or a kill-switch is engaged (INC-77 posture, mirrored from `overshoot-short-interest-compute`). The live GATE-ZERO wiring against the Polygon grouped endpoint lands at W3.5.c.
5. **Two skip gates.** (a) kill-switch: `kill_switches` any non-`'active'` state on `strategy_key='overshoot'` → `.skipped` reason=`global_kill_switch_active`. (b) job-disarmed: `job_registry` id=`overshoot.detection.run` `enabled=false` → `.skipped` reason=`job_disarmed`.
6. **Data pipeline (6 sub-steps, each with typed refusal → outcome mapping).**
    - **Bars-append leg.** `PolygonGroupedDailyFetcher.fetchGroupedDaily(as_of)` → `buildBarsAppendRows(...)` → INSERT `overshoot_backfill_runs` row `kind='bars'` BEFORE the upsert (satisfies the `overshoot_daily_bars.source_run_id` FK; run_id captured into `append_run_ids.bars`) → upsert `overshoot_daily_bars` on `(ticker, trade_date)`.
    - **Forward-earnings-append leg.** INSERT `overshoot_backfill_runs` row `kind='earnings_fmp'` BEFORE the upsert (satisfies the `overshoot_earnings_calendar.source_run_id` FK; run_id captured into `append_run_ids.earnings`) → `appendForwardEarnings(...)` (7 calendar-day forward window: `exclusionWidthDays=5` sourced from the detector's own named-parameter config + `marginDays=2` calendar days; ACT-462.a operator ratifications) → upsert `overshoot_earnings_calendar` on `(ticker, announcement_date, source)`. **Cap-breach:** `EarningsCalendarCapBreachError` before any write; retry-with-smaller-window forbidden as silent narrowing.
    - **Earnings-calendar staleness predicate.** `isEarningsCalendarStale({ lastFetchedAt, asOf, thresholdHours: 26 })` — 24h cron + 2h grace; symmetric with `si_stale` cadence (D1).
    - **Kernel live-parameterization (runner-parity bind).** Reuses `EVENT_DETECTION_SQL` byte-identical to the study runner source-of-truth via `stripStatementBody()` + `bindNamed()` + `DETECTION_PARAM_ORDER` (mirroring `overshoot-study-run/index.ts:126-134`). `event_date_min=event_date_max=asOfDay` produces exactly one candidate slice at the detection as_of.
    - **SI read.** 20d staleness window against `overshoot_short_interest`.
    - **Detector call.** `runDetector(...)` — the W3.4-ratified pure kernel, unmodified. Study-cell lookup keyed to `RATIFIED_STUDY_RUN_ID`.
7. **Persistence.** `overshoot_events` (all rows, PK `(run_id, ticker, side)`) + `overshoot_target_positions` (only if `!dryRun`; PK DO NOTHING). Finalize `overshoot_detection_runs` with `outcome`, `event_count`, `selected_count`, `durations_ms` (per-stage timing), `append_run_ids` (the reserved shape below), `git_sha`, `correlation_id`.

**Append-attribution design (MIG-152 — the load-bearing linkage).** `overshoot_detection_runs.append_run_ids jsonb NULL` carries the shape `{"bars": <uuid>, "earnings": <uuid|null>}`, wiring the detection run to the two `overshoot_backfill_runs` rows the pipeline created. Rationale (operator-ratified A2): no `kind`-enum change on `overshoot_backfill_runs` — detection append legs insert rows with the EXISTING `'bars'` / `'earnings_fmp'` kinds, truthful `outcome` / `row_count` / `request_count`, BEFORE their upserts, structurally FK-satisfying. Linkage explicitly NOT stashed in `durations_ms` (lying-name class). Column is nullable to allow refusal-path rows before either leg completes.

**Refusal → outcome taxonomy.** Every typed refusal from the W3.5.a modules reaches the `overshoot_detection_runs` row — zero swallowed errors, one canonical mapping:

| Refusal (typed) | `outcome` | `reason` |
|---|---|---|
| `BarsMissingForAsofError` (non-session / empty whitelist intersection) | `no_op` | `bars_missing_for_asof` |
| `BenchmarksMissingError` (denominator would silently drift) | `failed` | `benchmarks_missing` |
| `EarningsCalendarCapBreachError` (silent-truncation guard) | `failed` | `earnings_calendar_cap_breach` |
| `isEarningsCalendarStale = true` | `no_op` | `earnings_calendar_stale` |
| `boot_assertion_failed_priors_not_found` | (500 before persistence) | typed body reason |

**`dry_run` semantics.** The full 6-stage data pipeline runs (including the detector) in dry-run mode. `overshoot_events` and `overshoot_target_positions` INSERTs are gated on `!dryRun`; the `overshoot_detection_runs` row is always written with `dry_run: true` stamped into `durations_ms`. Dry-run zero-persistence is source-sentinel tested.

**Naming caveat (`POLYGON_API_KEY_PROD_PROBE`, operator D2 ruling, carried from ACT-462.a).** The pipeline binds `POLYGON_API_KEY_PROD_PROBE` for grouped-daily fetch. The `_PROD_PROBE` suffix is a **legacy naming artifact** — this IS the production-plan Polygon credential; single named key, no fallback chains. Rebinding to a new name was rejected on the grounds that duplicate-value secrets are a rotation hazard that outweighs the naming semantics. **Runtime validity is proven ONLY by the W3.5.c GATE-ZERO probe from the edge runtime against the grouped endpoint** — sandbox probes are design-shape evidence only (W1 lesson standing).

**W3.5.c readiness sequence.** (1) deploy `overshoot-detection-run` via `supabase--deploy_edge_functions`; (2) GATE-ZERO probe from the edge runtime against the Polygon grouped endpoint (proves `POLYGON_API_KEY_PROD_PROBE` valid runtime credential); (3) `dry_run=true` invocation on a known-good as_of, assert `event_count>0`, `selected_count>=0`, zero `overshoot_events` / `overshoot_target_positions` rows persisted; (4) first real detection via §7.5 invocation shape (probe-mode short-circuit exercised); (5) evidence bundle collection; (6) W3.5 wave closure per §22.3(e).

## §8 First-light (W3.5 CLOSED — ACT-462.c + finalization)

**Run lineage (two banked LIVE runs, both audited under ARM→DRY→LIVE→DISARM brackets):**

*(1) `ded4213d-0a78-46b5-aab7-393dbd7b4bcd`* — as_of=`2026-07-02`, `selected_count=0`, banked as designed-selectivity artifact. **Surfaced the D-1 defect** (`bandLabelFor` operator/bin mismatch → 100% `no_study_cell`), fixed at ACT-462.c: extracted `_shared/overshoot/detector/band-label.ts` as pure signed-excess classifier mirroring `cell-aggregation.sql.ts` verbatim (inclusive-lo / exclusive-hi; ±0.10 → `_10_INF`).

*(2) `2985db66-a9f2-4a8f-9e7a-4259d1bd4a38`* — as_of=`2026-06-18`, `selected_count=4` (L=3, S=1). **Accounting identity 582 = 4 + 578 ✅** persisted DB counts. DRY/LIVE parity identical (event_count, selected_count, earnings_duplicates_dropped all match byte-for-byte). Real `study_cell_ref`s across two bands proves bin-boundary logic beyond `_10_INF`: `VRT/L/L_10_INF/w=2`, `GLW/L/L_10_INF/w=1`, `INTC/L/L_10_INF/w=2`, `RH/S/S_08_10/w=5`. Refusal histogram: 358 excess / 125 window / 33 si-squeeze / 32 momentum / 29 drawdown / 1 earnings-exclusion = 578. `no_study_cell = 0` — ACT-462.c live-verified end-to-end.

**Sweep calibration (offline `overshoot-sweep-diagnostic`, 12 trading days 2026-06-16→2026-07-02):** 9/12 non-empty selection days, **1/12 both-sided (06-18 → arm date)**. Designed selectivity, not defect.

**Sizing rule v1 (source-documented placeholder — `overshoot-detection-run/index.ts:604-620`):** `target_shares=0`, `target_notional=0`, real `rank_score` payload. Broker sizing deferred to W3.6. `overshoot_target_positions` UPSERT idempotent by PK `(run_id, ticker, side)` + `ON CONFLICT DO NOTHING`.

**Append leg (live-verified DEFECT-2 dedupe):** `earnings_vendor_row_count=255`, `earnings_duplicates_dropped=34`, `earnings_appended_row_count=221` — mirrors W1b backfill fetcher `keep-first` semantics per source ledger.

**Non-ratifications (SI freshness):** SI-append leg in detection handler NOT ratified. Durable fix is `sql/30_overshoot_short_interest_cron_schedule.sql` at the W3 arming gate; interim guard is the detector's `si_stale` typed refusal.

**Read-only wave surface:** `supabase/functions/overshoot-sweep-diagnostic/index.ts` (enumerate/single/batch modes; DEC-023 envelope; `overshoot.manage`; SELECT-only). Operational tool, not a strategy surface.

**Forward rule (per INC-82):** registry bracket flips (`job_registry.enabled`) MUST use the data-write tool path (W3.3 precedent), not the migration tool. Applies to W3.6+.

**W3.6 preview:** entry/execution engine — marketable-limit T+1-open with pre-open stabilization re-check (P-B ratified), broker sizing replacing zero placeholders. EXECUTION-CONTRACT ratification block (I1–I7) delivered as pre-build investigation; awaiting operator ratification before build begins.
