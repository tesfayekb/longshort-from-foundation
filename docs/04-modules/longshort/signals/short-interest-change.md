# Short-Interest Change (Signal #5)

> **Owner:** longshort strategy module | **Phase:** Phase 2.3 / FP-041 | **Status:** compute + entitlement-aware fetchers + orchestrator + cron/manual handlers + disarmed `job_registry` row (MIG-076) + `signal_registry` planned→live flip landed. **Revision-fix (FP-041 addendum):** `si_pct_float` is DERIVED in the orchestrator as `short_interest / share_class_shares_outstanding` (NOT read as a phantom field from the SI endpoint, which doesn't exist). Cron wiring + enable-flip pending operator-run DEC-043 attestation.

Detailed component reference for Signal #5 (short-interest changes, 30-day) — the third of nine signals (§4.4.1–§4.4.9). Unlike the daily price signals #6/#7, this is the **first non-price signal** in the stack, with three new architectural firsts: (a) a new external Polygon fetcher (`polygon-short-interest-fetcher.ts`); (b) a **twice-monthly** cadence (cron `0 21 1,15 * *`); (c) **NON-CRITICAL** semantics — gracefully degrades when source data is unavailable or entitlement-gated.

## Purpose

Per CROSSWIND §4.4.3 verbatim: signal value is `-1 × (SI_pct_float[T] - SI_pct_float[T-2_reports])` — the **negated** change in short-interest as a fraction of float across two SEC reports (≈ 30 calendar days). The `-1 ×` is load-bearing: FALLING short interest (shorts covering) becomes a POSITIVE signal (bullish); RISING short interest (shorts piling on) becomes a NEGATIVE signal (bearish). Without the negation this becomes a "follow-the-shorts" duplicate. The sign-flip is pinned in `compute-short-interest_test.ts`.

`si_pct_float` for each report is **derived**, not fetched: `si_pct_float = short_interest / share_class_shares_outstanding` where `short_interest` is the raw share count from Polygon's `/stocks/v1/short-interest` endpoint and `share_class_shares_outstanding` comes from Polygon's `/v3/reference/tickers/{ticker}` reference endpoint (same endpoint the universe-enrichment fetcher already consumes — no new entitlement). The derivation is performed inside the orchestrator so the pure compute function stays denominator-agnostic.

Per §4.3.5 the signal is **NON-CRITICAL**: tickers for which the source returns no entitlement (HTTP 403), no record (HTTP 404), or insufficient reports do NOT get excluded from ranking — the orchestrator records a typed skip and the ticker contributes via the Phase 3 combiner's missingness imputation (`-999, is_present=0`). The system keeps working without this signal.

## Scope

**In scope (this component owns):**
- Twice-monthly per-ticker raw short-interest-change computation per §4.4.3.
- Within-sector GICS z-score normalization (±3 clip) — reused shared helper.
- Per-ticker typed-absence attribution into the seven `SignalSkipReason` buckets (the four shared + `data_unavailable`, `subscription_gated`, and `missing_shares_outstanding` — the last for tickers where the reference endpoint returns no usable `share_class_shares_outstanding`).
- Idempotent UPSERT persistence into `signal_observations`.
- Per-run telemetry into `signal_compute_log`.
- Cron + manual operator-trigger production wiring (FP-041); cron is DISARMED at MIG-076.
- New entitlement-aware Polygon short-interest fetcher AND new entitlement-aware Polygon shares-outstanding fetcher (`polygon-shares-outstanding-fetcher.ts`) for the denominator side input.

**Out of scope (other components / phases):**
- FINRA / EDGAR backup fetcher — documented in the fetcher header as a future hardening item; will fall through here when Polygon returns subscription-gated / data-unavailable. Not implemented in FP-041.
- §3.3e SI > 25% short-book exclusion — already lives in the existing §3.3 exclusion logic (level-based, unrelated to this change signal).
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
       PolygonShortInterestFetcher.fetchShortInterest(ticker, as_of, 6)   // raw short_interest counts
       PolygonSharesOutstandingFetcher.fetchShares(ticker)                // share_class_shares_outstanding
     ])
       ├─ SI 403  → typed skip (subscription_gated)
       ├─ SI 404  → typed skip (data_unavailable)
       ├─ shares 403/404/missing/zero/negative/NaN → typed skip (missing_shares_outstanding)
       ├─ other 4xx/5xx after retries → throws → caught → fetch_error
       └─ both ok → derive per report:
               si_pct_float = short_interest / shares
         │
         ├─ reports.length < 3 → typed skip (insufficient_history)
         └─ computeShortInterestChange(reports) → raw signal
        │
        ▼
zScoreNormalizeWithinSector (within-GICS, ±3 clip)
        │
        ▼
SignalRow[] → captureSignalObservations (idempotent UPSERT)
        │
        ▼
persistSignalComputeLog (run telemetry, aggregate skip_counts + skipped_detail)
```

Files (paths relative to `supabase/functions/`):
- Compute: `_shared/longshort-signals/short-interest-change/compute-short-interest.ts` (+ `_test.ts`)
- Orchestrator: `_shared/longshort-signals/short-interest-change/short-interest-orchestrator.ts` (+ `_test.ts`)
- Short-interest fetcher: `_shared/longshort-signals/shared/polygon-short-interest-fetcher.ts` (+ `_test.ts`)
- Shares-outstanding fetcher: `_shared/longshort-signals/shared/polygon-shares-outstanding-fetcher.ts` (+ `_test.ts`)
- Cron handler: `longshort-short-interest-compute/index.ts` (+ `index_test.ts`)
- Manual handler: `longshort-short-interest-compute-manual/index.ts` (+ `index_test.ts`)
- Migration: `supabase/migrations/20260608154900_…sql` (MIG-076 — `job_registry` seed disarmed + `signal_registry` planned→live flip)

## Key constants

| Constant | Value | Source |
|---|---|---|
| `SIGNAL_ID` | `'short_interest_change_30d'` | `short-interest-orchestrator.ts` |
| `SHORT_INTEREST_MIN_REPORTS` | `3` | `compute-short-interest.ts` (locks §4.4.3 indexing) |
| `DEFAULT_SHORT_INTEREST_LIMIT` | `6` | `polygon-short-interest-fetcher.ts` (≥ 3 with headroom) |
| `SHORT_INTEREST_FETCH_LIMIT` | `6` | `short-interest-orchestrator.ts` |
| Cron schedule | `'0 21 1,15 * *'` | MIG-076 (twice-monthly, 1st + 15th, 21:00 UTC) |
| `stale_after_hours` (registry) | `384` (= 16 days) | MIG-076 (1 cycle + ~2-day slack) |
| Classification | NON-CRITICAL (§4.3.5) | — |

## Entitlement & graceful degradation

The Polygon short-interest endpoint may be **subscription-gated** depending on tier. The fetcher distinguishes:

| Source response | Result | Orchestrator skip reason | Operator action |
|---|---|---|---|
| HTTP 200 + reports | `{ kind: 'reports', reports }` | (compute runs) | none |
| HTTP 200 + empty | `{ kind: 'reports', reports: [] }` | `insufficient_history` | wait for next report cycle |
| HTTP 404 | `{ kind: 'unavailable', reason: 'data_unavailable' }` | `data_unavailable` | wait for next report cycle |
| HTTP 403 | `{ kind: 'unavailable', reason: 'subscription_gated' }` | `subscription_gated` | upgrade Polygon tier OR schedule the FINRA backup |
| Shares-outstanding endpoint 403 / 404 / missing field / zero / negative / NaN | `{ kind: 'unavailable', … }` | `missing_shares_outstanding` | investigate ticker (often non-equity / delisted); never produces Infinity/NaN |
| HTTP 401 / 5xx / parse / timeout | throws `SignalComputationError` | `fetch_error` | investigate |

An all-missing universe is still `outcome='completed'` (degraded) with `persisted_count=0`. The `subscription_gated` count in `signal_compute_log.skip_counts` is the operator's signal that the FINRA backup is needed.

## Conscious approximation — current-shares-for-historical-SI

Polygon's reference endpoint exposes ONLY the **current** `share_class_shares_outstanding`. The signal needs short-interest at TWO historical SEC report dates (T and T-2 ≈ 30 calendar days). Both historical raw `short_interest` counts are denominated by current shares-outstanding.

Why this is acceptable for v1:

1. Shares-outstanding moves on the order of quarters/years (corporate actions); short interest moves on a two-week cadence by entire orders of magnitude.
2. The signal is `-(SI%[T] - SI%[T-2])`; with a common denominator the percentage change is dominated by the SI numerator change.
3. A point-in-time shares-outstanding history would be more precise (split/buyback dates do shift the denominator) but is not exposed by this Polygon endpoint; a FINRA + EDGAR cross-source would be needed and is intentionally deferred (out of FP-041 scope; same backup-source roadmap as the SI fetcher itself).

Per §2 axiom 4 (anti-phantom — conscious-approximation discipline) this approximation is documented in three places by design: the orchestrator's file-level header, this page, and the orchestrator's `function-index.md` row. Silent approximations are forbidden; this one is visible.

## Authority

FP-041 + FP-041 revision-fix addendum (`docs/08-planning/feature-proposals.md`) · ACT-153 + ACT-153a (`docs/06-tracking/action-tracker.md`) · CROSSWIND §4.4.3 + §4.3.5 + §3.3e + §2 axiom 4 · MIG-076 (`docs/07-reference/database-migration-ledger.md`) · DEC-040 (disarmed-seed + separate enable-flip step) · DEC-043 (end-to-end attestation standard).