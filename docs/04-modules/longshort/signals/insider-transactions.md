# Insider Transactions (Signal #4)

> **Owner:** longshort strategy module | **Phase:** Phase 2.4 / FP-042 | **Status:** compute + officer-title classifier + entitlement-aware Form 4 fetcher + orchestrator + cron/manual handlers + disarmed `job_registry` row (MIG-077) + `signal_registry` planned→live flip landed. Cron wiring + enable-flip pending operator-run DEC-043 attestation.

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
pLimitedMap (concurrency=20)
   per ticker:
     Promise.all([
       PolygonForm4Fetcher.fetchForm4(ticker, as_of, 90)              // Form 4 rows
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
               ├─ filterQualifyingTransactions (drop holdings + apply §4.4.4 code/10b5-1 filter)
               ├─ classifyRoleWeight per row (3-tier title-heuristic; null → drop)
               ├─ Σ shares × price × sign × role_weight × exp(-age/14) / market_cap
               ├─ qualifying_count==0 OR market_cap==0 → typed skip (no_qualifying_transactions)
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