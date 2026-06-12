# Insider Transactions (Signal #4)

> **Owner:** longshort strategy module | **Phase:** Phase 3 / FP-050 (EDGAR rebuild) | **Status:** 🟡 **REGISTRY-LIVE / CRON-DISARMED (ACT-187, 2026-06-12 — FP-050 Phase 3 complete).** EDGAR pipeline implemented end-to-end (Phase 1 fetcher trio + Phase 2 orchestrator rewiring + per-accession `index.json` discovery per DEC-058 §(i) (A) ruling); `polygon-form4-fetcher.ts` DELETED per DW-094 (ACT-186 recovery). `signal_registry.insider_transactions_90d.status='live'` with truth-in-telemetry DEC-048 interim cadence string; `job_registry.longshort.insider.compute = {schedule:'15 21 * * 1-5' UTC, enabled:false}` (MIG-093, evening-family gap slot per DEC-058 §(k)). Arm-up = Phase 4 (deploy + operator validation fire + DEC-040 byte-match + DEC-043-pattern first-natural-fire attestation). Historical FP-042 / ACT-155 / ACT-156 sections preserved below per Rule 8.

## FP-050 — EDGAR-rebuild Phase 3 status (registry-live, cron-disarmed)

**DEC-058 bindings index (all 11 clauses ratified — see `docs/08-planning/approved-decisions.md` for verbatim text).**

| Clause | Binding |
|---|---|
| §(a) | Transaction-code IN-set `{P, S}` per §4.4.4 verbatim; M/C/A/G/F/I OUT at v1; parser preserves all codes; compute layer is single filter authority. |
| §(b) | **Dual-date axis — Option A.** Persist BOTH `transaction_date` AND `acceptance_datetime`; look-ahead gate keys on `acceptance_datetime ≤ as_of` (timestamp comparison); decay age on `transaction_date`. Two-layer enforcement (boundary fetcher + parser). Closes the FP-042 blind spot (~5.95-day max look-ahead bias). |
| §(c) | 10b5-1 EXCLUDE — form-level body scan (`/10b5[- ]?1/i`); conservative over-exclusion; per-row attribution upgrade deferred to DW-100. |
| §(d) | Role weights — reuse DEC-044 verbatim (CEO/CFO 1.0, NEOs 0.7, Sec-16 0.4, indep dirs 0.3, 10%+ 0.5); DEF-14A NEO enrichment deferred to DW-093. |
| §(e) | Formula reuse — FP-042 `compute-insider.ts` unchanged; only data source replaced. |
| §(f) | CIK fetch-per-fire of `company_tickers.json` + frozen `INSIDER_CIK_OVERRIDES` (NXT→1953967 seeded); unmapped emits typed `kind:'unresolved'` → `ticker_to_cik_unresolved` skip. |
| §(g) | UA from `EDGAR_CONTACT_EMAIL` at construction (fail-loud absent); self-imposed 5 rps cap (half SEC's 10 rps headroom — DEC-034). |
| §(h) | Form 4 / 4-A identical treatment; idempotency triple `(issuer_cik, accession_number, transaction_seq)`; orchestrator-side most-recent-accession preference on `(issuer, owner, date, seq)`. |
| §(i) | **Architecture — daily-feed primary + single-invocation.** ~18s/fire incremental (well within `timeout_seconds=600`); ~25 min one-shot backfill. NOT the FP-045 queue-engine. **Discovery revision (operator (A) ruling 2026-06-12):** per-accession `index.json` fetch via `edgar-accession-index-fetcher.ts` (13 tests) — primary-doc selection + atomic `acceptance_datetime` from one truth-source, NO heuristic tiebreak (INC-70 rule). Per-CIK submissions feed REJECTED for the discovery step (added join layer + recent-filings cap edge). |
| §(j) | Cross-signal additive independence with DEC-057 §(c) Tier-2 "significant insider transaction" — both signals score the same event independently by explicit design (catalyst measures decayed event-presence; insider measures dollar-weighted magnitude). Double-count prevention = additive independence, NOT silent gating. |
| §(k) | **Cadence — `15 21 * * 1-5` UTC (evening-family gap slot).** Lands between analyst (21:00) and news (21:30 + drain). as_of↔acceptance convention LOCKED to timestamp comparison (`acceptance_datetime_ts ≤ as_of_ts`) matching every sibling signal's look-ahead gate. EDGAR 22:00-ET filing-cutoff trade-off named honestly via §(b) `not_yet_knowable_excluded` — late-accepted filings carried to D+1. Post-cutoff `0 3 * * 2-6` UTC alternative REJECTED for consistency-beats-cleverness. Phase-7 IC ablation reopens. |

**Dual-date axis (diagram-in-prose, §(b) hard contract).**

```text
EDGAR Form 4 row
   │
   ├── transaction_date     ──► age_days = (as_of − transaction_date) / 14
   │                           (decay anchor, spec §4.4.4 formula)
   │
   └── acceptance_datetime  ──► gate: acceptance_datetime_ts ≤ as_of_ts
                               (look-ahead gate, timestamp comparison)
                               │
                               ├── PASS  → row enters 90d window
                               └── FAIL  → not_yet_knowable_excluded++
                                          (HONEST exclusion; row reappears
                                           in D+1 fire when acceptance ≤ as_of)

Two-layer enforcement (no silent default):
   parser-level:    `edgar-form4-parser.ts`  — missing acceptance ⇒ kind:'unparseable'
   boundary-level:  `edgar-form4-fetcher.ts` — refuses HTTP without acceptance pre-validation
```

**§(i) arithmetic row (single-invocation envelope, post per-accession-index revision).**

| Step | Operation | Calls | Latency |
|---|---|---|---|
| 1 | `company_tickers.json` (CIK map) | 1 | ~1.0 s |
| 2 | Daily-index sweep (90 weekday-business-days) | ~64 | ~6.4 s @ 5 rps |
| 3 | Per-accession `index.json` (qualifying accessions, ~50/fire S&P-900) | ~50 | ~5.0 s @ 5 rps |
| 4 | Form 4 XML fetch + parse (post §(b) gate) | ~50 | ~5.0 s @ 5 rps |
| **Total** | **incremental fire** | **~165 HTTPS** | **~17.4 s** (rounds to the DEC-058 §(i) ~18 s/fire seeded envelope) |

Backfill (one-shot, 90-trading-day cold start) bounds at ~25 min one-shot per DEC-058 §(i) — well within `timeout_seconds=600` budget at single-invocation cadence (operator-validated arithmetic in DEC-058 §(i) verbatim).

**Registry truth (live-DB §22.5.1 post-MIG-093 reads, 2026-06-12).**

- `job_registry.longshort.insider.compute = {schedule:'15 21 * * 1-5', handler_path:'supabase/functions/longshort-insider-compute/index.ts', enabled:false, status:'registered'}` — schedule retuned from FP-042-era `0 19 * * 1-5`; `enabled` STAYS FALSE through Phase 3.
- `signal_registry.insider_transactions_90d = {status:'live', cadence:'daily (after-close; single-invocation ~18s/fire incremental; acceptance-gated per DEC-058 §(b) — late-accepted filings carried to next fire; interim per DEC-048 — §4.4.4 30-min intraday revisit is a future enhancement-FP, Phase 7 picks final cadence)', job_registry_id:'longshort.insider.compute', planned_phase:NULL}`.
- `JOB_ID_TO_SIGNAL_ID['longshort.insider.compute'] = 'insider_transactions_90d'` already present at `supabase/functions/_shared/longshort-signals/shared/job-signal-mapping.ts:47` (NO duplication — Constitution Rule 5).

**What's NOT decided at Phase 3.** Phase 4 arm-up (deploy + operator validation fire + DEC-040 byte-match against operator-applied `cron.job` + DEC-043-pattern first-natural-fire wall-clock signature) follows supervisor verification of this commit. Signal #4 STAYS DISARMED through the end of Phase 3.

---

## Historical record (FP-042 / ACT-156 — preserved per Rule 8)

The sections below are the FP-042 ship + ACT-156 disarm + INC-70 root-cause record. Preserved verbatim as governance history. The EDGAR rebuild above SUPERSEDES the Polygon-fetcher path described below — the FP-042 compute / classifier / filter / z-score code is reused byte-unchanged; only the data-acquisition layer was replaced.

Detailed component reference for Signal #4 (insider transactions, 90-day, 14-day decay) per CROSSWIND §4.4.4 — the fourth of nine signals. Sparse-by-design: most names have zero qualifying insider transactions in any given 90-day window, which is the NORMAL state, not failure.

## Purpose

§4.4.4 spec formula (verbatim):

```text
raw_signal_N = Σ_qualifying( shares × price × sign × role_weight × exp(-age_days / 14) ) / market_cap

sign        = +1 for 'A' (acquired / purchase, bullish)
            = −1 for 'D' (disposed / sale,    bearish)
age_days    = (as_of − transaction_date) in days  (clamped to 0 for future-dated rows)
market_cap  = shares_outstanding × latest_close
```

**Filter (load-bearing).** First gate drops `record_type='holding'` rows (Polygon's Form 4 endpoint returns both). Then:

| code | included? | rationale |
|---|---|---|
| `P` (open-market purchase) | YES, all | spec §4.4.4 — all purchases are bullish signal |
| `S` (sale) AND `aff_10b5_one === false` | YES | spec — discretionary sales only |
| `S` AND `aff_10b5_one === true` | NO | EXCLUDE 10b5-1 planned sales |
| `S` AND `aff_10b5_one` missing/null | NO | conservatively excluded (cannot prove discretionary) |
| `M` / `C` / `A` / `G` and others | NO | option exercises, grants/RSU vests, gifts — not informative trades |

**Sign is load-bearing.** A pure-buy ticker MUST yield positive `raw_signal`; a pure-discretionary-sale ticker MUST yield negative. Both directions are pinned by tests.

## DEC-044 — Title-heuristic NEO proxy (conscious approximation)

"NEO" (Named Executive Officer) is a DEF-14A proxy-statement concept and is **not** a Form 4 field. Per DEC-044, Signal #4 v1 approximates the §4.4.4 NEO=0.7 weight tier via a deterministic 3-tier `officer_title` classifier:

| Tier | Weight | Match | Notes |
|---|---|---|---|
| 1 | 1.0 | `/\bceo\b\|\bcfo\b\|chief executive officer\|chief financial officer\|(?<!vice\s)\bpresident\b/i` | C-suite + President. The `(?<!vice\s)` lookbehind PREVENTS "Vice President" / "Executive Vice President" / "Senior Vice President" from accidentally matching here. The compound "CEO AND PRESIDENT" (real DELL Form 4 title) matches via `\bceo\b`. |
| 2 | 0.7 | `/chief\s+[a-z]+\s+officer\|\bevp\b\|\bsvp\b\|executive vice president\|senior vice president/i` | NEO-proxy tier — other "Chief X Officer" (COO/CTO/CMO/CIO/...) + EVP/SVP. |
| 3a | 0.4 | `is_officer === true` (no title match) | Generic Section-16 officer. |
| 3b | 0.5 | `is_ten_percent_owner === true` AND NOT officer/director | Pure 10%+ owner (institutional shareholders). An officer-AND-10%-owner resolves to 0.4 (officer wins per highest-applicable-weight tie-break). |
| 3c | 0.3 | `is_director === true` AND NOT officer | Independent director. |
| — | null | none of the above | Row dropped from the sum (typed-absence, not zero). |

**Multi-role tie-break.** Highest applicable weight wins (a CEO who also holds 12% is 1.0, not 0.5).

**Visibility (§2 axiom 4).** Every persisted observation carries `role_tier_source='title_heuristic'` (exported as `ROLE_TIER_SOURCE` from `compute-insider.ts`). The approximation is visible, not silent.

**Upgrade path.** Authoritative NEO enrichment via annual DEF 14A proxy statements is registered as DW-093. The `role_tier_source` column makes the upgrade a forward-compatible backfill.

## Scope

**In scope (this component owns):**
- Daily-after-close per-ticker compute per §4.4.4 (weighted-decay dollar-flow / market_cap).
- §4.4.4 filter (transaction-vs-holding gate + transaction-code + 10b5-1 exclusion).
- 3-tier title-heuristic role classifier (DEC-044).
- Within-sector GICS z-score normalization (±3 clip).
- Per-ticker typed-absence attribution into eight `SignalSkipReason` buckets including new `no_qualifying_transactions`.
- Idempotent UPSERT persistence into `signal_observations`; telemetry into `signal_compute_log`.
- New entitlement-aware Polygon Form 4 fetcher (`polygon-form4-fetcher.ts`). Reuses FP-041's `PolygonSharesOutstandingFetcher` and the existing `PolygonPriceHistoryFetcher` for the market-cap denominator.
- Cron + manual operator-trigger production wiring; cron is DISARMED at MIG-077.

**Out of scope (other components / phases):**
- DEF-14A authoritative NEO enrichment (DW-093, deferred).
- 30-min intraday polling cadence (noted in §4.4.4 as a future refinement; v1 is daily-after-close).
- EDGAR backup fetcher (Polygon is entitled; future hardening).
- Combiner-stage missingness imputation — Phase 3.
- Cron wiring / enable-flip / cron-attributable attestation — separate operator step per DEC-040 + DEC-043.

## Architecture

```text
universe_membership (load latest snapshot)
        │
        ▼
ONE market-wide Form 4 fetch (ACT-155):
  PolygonForm4Fetcher.fetchForm4MarketWide(as_of, 90)
    → paginated /stocks/filings/vX/form-4?transaction_date.gte=…&lte=… (NO ticker=)
    → next_url cursor pagination (≤50 pages × 1000 rows)
    → grouped locally by tickers[0] (primary-issuer attribution)
    → Map<ticker, Form4Row[]>
        │
        ▼
for each universe ticker: filterQualifyingTransactions(rowsByTicker.get(t) ?? [])
    │
    ├─ 0 qualifying → typed skip (no_qualifying_transactions)  ← MOST TICKERS, no market-cap fetch
    │
    └─ ≥1 qualifying:
         pLimitedMap (concurrency=20, ONLY over qualifying tickers — typically <100):
           Promise.all([
             PolygonSharesOutstandingFetcher.fetchShares(ticker)            // shares (FP-041 reuse)
             PolygonPriceHistoryFetcher.fetchPriceHistory(ticker, as_of, 7) // latest close
           ])
       ├─ form4 403  → typed skip (subscription_gated)
       ├─ form4 404  → typed skip (data_unavailable)
       ├─ shares 403/404/missing/zero/negative → typed skip (missing_shares_outstanding)
       ├─ price null/empty → typed skip (data_unavailable)
       ├─ other 4xx/5xx after retries → throws → caught → fetch_error
       └─ all ok → market_cap = shares × close
               │
               ├─ classifyRoleWeight per row (3-tier title-heuristic; null → drop)
               ├─ Σ shares × price × sign × role_weight × exp(-age/14) / market_cap
               ├─ market_cap==0 → typed skip (missing_shares_outstanding, defensive)
               └─ raw_signal
         │
         ▼
zScoreNormalizeWithinSector (within-GICS, ±3 clip)
         │
         ▼
SignalRow[] → captureSignalObservations (idempotent UPSERT)
         │
         ▼
signal_compute_log (telemetry, includes skip_counts + skipped_detail)
```

## FP-042 / ACT-155 — Market-wide-fetch addendum (CPU-limit fix)

The deployed cron handler died with HTTP 546 `WORKER_RESOURCE_LIMIT`
(CPU-time-exceeded, NOT memory, NOT wall-time) on the first full-universe
invocation. Cause: per-ticker Form 4 fetch across ~839 tickers totals
~2517 HTTPS calls (Form 4 + shares + price ×839) + 839 JSON parses, ~3–5×
short-interest's CPU footprint, blowing the ~2 s edge-isolate CPU budget
~6 s after boot. No `signal_compute_log` row landed.

The fix replaces the per-ticker Form 4 calls with ONE market-wide paginated
fetch (`fetchForm4MarketWide`) keyed by the 90-day date window with NO
`ticker=` parameter. Rows are returned for all issuers in the window,
grouped locally by `tickers[0]` (primary-issuer attribution; multi-ticker
rows are attributed only to the first listed ticker — rows without
`tickers[]` are dropped, no fabricated attribution). Then:

- `filterQualifyingTransactions` is applied per-universe-ticker BEFORE
  any per-ticker fetch. Most names have zero qualifying transactions and
  skip with `no_qualifying_transactions` without ever incurring a
  shares/price HTTPS call — collapsing the per-ticker side-fetches from
  1678 to typically <200.
- `shares + price` (concurrency=20) is fetched ONLY for tickers with
  qualifying transactions, and the per-ticker compute proceeds exactly
  as before (`computeInsiderSignal`, classifier, decay, divide-by-zero
  guard, z-score, persist are byte-unchanged).

Entitlement handling on the market-wide call: 403 → all-universe
`subscription_gated` skip; 404 → all-universe `data_unavailable` skip; a
throw → all-universe `fetch_error` skip (the run still `completed` with
`persisted_count=0`, mirroring the per-ticker degradation semantics).

This market-wide-fetch-by-date + group-by-ticker pattern is the template
for the remaining feed-signals (#1 analyst, #2 PEAD, #3 options, #8 news);
any per-ticker-across-the-universe fetch would hit the same CPU wall.

## Expected operational profile

UNLIKE momentum / reversal (dense) or short-interest (dense across SI-reported names), insider transactions are SPARSE-by-design. A healthy fire on a ~800-ticker universe typically yields:

- A minority of tickers (~5-20% depending on market conditions, earnings calendar, and lockup windows) carry real z-scored values.
- The majority skip with `no_qualifying_transactions` and contribute `is_present=0` to the combiner.
- `subscription_gated` / `data_unavailable` / `fetch_error` counts should be 0 on a healthy fire (the endpoint is entitled).

## Cross-references

- FP-042 (the implementing FP); ACT-154; DEC-044 (title-heuristic decision); DW-093 (deferred DEF-14A upgrade); MIG-077 (job_registry seed + signal_registry flip).
- CROSSWIND §4.4.4 (signal spec); §4.3.5 (non-critical signal rule); §2 axiom 4 (conscious-approximation discipline).
- Code: `_shared/longshort-signals/shared/polygon-form4-fetcher.ts`; `_shared/longshort-signals/insider-transactions/compute-insider.ts`; `_shared/longshort-signals/insider-transactions/insider-orchestrator.ts`; `supabase/functions/longshort-insider-compute/index.ts`; `supabase/functions/longshort-insider-compute-manual/index.ts`.
- Reuse: `_shared/longshort-signals/shared/polygon-shares-outstanding-fetcher.ts` (FP-041); `_shared/longshort-signals/shared/polygon-price-history-fetcher.ts` (FP-009).

## FP-042 / ACT-156 — Signal #4 disarmed (INC-70 — Polygon Form 4 endpoint filters are no-ops; EDGAR rebuild deferred to DW-094)

After the ACT-155 market-wide fix, the next fire returned HTTP 200 but with telemetrically-impossible skip counts (`fetch_error:839 + no_qualifying_transactions:839` for an 839-ticker universe — 1678 skips; `signal_compute_log.run_id='1021808b-4b1c-4b04-bb45-d989d56b5193'`). A 9-variant probe of `/stocks/filings/vX/form-4` against the deployed `POLYGON_API_KEY` confirmed the endpoint **silently ignores `ticker` (every multi-ticker syntax) and `transaction_date.gte/lte`** at our Stocks Advanced entitlement tier — every variant returned a byte-identical 1.85 MB / 1000-row firehose; `ticker=AAPL` returned rows NOT containing AAPL. Only `limit=` is honored.

**Implication.** The original FP-042 per-ticker fetcher was producing a phantom signal since deploy: same firehose fetched 839×, locally filtered by `tickers[0]===ticker`, ~0 matches per name (the firehose is dominated by recent high-volume filers, not our S&P 900 universe), compute layer marked each ticker `no_qualifying_transactions` — perfectly indistinguishable from the EXPECTED sparse profile. Looked sparse, was wrong. The ACT-155 CPU failure was the lucky trigger that exposed the silent data bug.

**Disarm.** `signal_registry.status` for `insider_transactions_90d` flipped `'live' → 'planned'` at ACT-156 (data UPDATE; no new MIG). `job_registry.longshort.insider.compute.enabled` stays `false` (was disarmed since FP-042 ship). The combiner imputes the non-critical signal's absence per §6.5; the long-short stack continues to rank on momentum / reversal / short-interest.

**P2 telemetry fix.** The ACT-155 catch block on a market-wide throw is rewritten to return `outcome='failed'` with a single `failure_reason='form4 market-wide fetch failed: <thrown message>'` and `skipped: []`, short-circuiting before the qualifying-filter loop. A run can never again show two skip classes for the same ticker. The `kind:'unavailable'` (typed entitlement) branch is UNCHANGED.

**FP-042 compute / classifier / filter / z-score code is UNTOUCHED** and remains in the codebase — it is correct and reused as-is when the EDGAR fetcher lands. Only the data-acquisition layer needs replacing.

**Rebuild path (DW-094).** SEC EDGAR direct: `User-Agent`-keyed GET against `data.sec.gov/submissions/CIK{cik10}.json` filtered to `form='4'`, per-accession-number XML fetch, parse Form 4 XML to per-transaction rows matching the existing `Form4Row` shape. EDGAR is the original source Polygon resells; authoritative per-CIK filtering, no entitlement, well-documented schemas. The FP-042 compute / classifier / filter / z-score layer is the contract this new fetcher targets.

**Pattern lesson (codified).** See [`_pattern-vendor-fetcher-filter-honesty.md`](./_pattern-vendor-fetcher-filter-honesty.md) — every vendor-endpoint fetcher MUST implement a `verifyFilterHonored()` pre-flight before trusting any documented filter. Applies to Signals #1 / #2 / #3 / #8.

**Cross-references.** INC-70 (the endpoint failure); DW-094 (the EDGAR rebuild); ACT-156 (this disarm + P2 fix); FP-042 second addendum (Rule 8); ACT-154 (original ship); ACT-155 (market-wide rewrite); DW-093 (DEF-14A NEO enrichment — independent but parallel); `signal_compute_log.run_id='1021808b-…'` (diagnostic exhibit).