# PEAD — Post-Earnings Drift (Signal #2)

> **Owner:** longshort strategy module | **Phase:** Phase 2.6 / FP-044 | **Status:** compute + Finnhub Estimate-1 fetcher pair + orchestrator + cron/manual handlers + disarmed `job_registry` row (MIG-081) + `signal_registry` rename ('pead' → 'pead_sue_20d') + planned→live flip landed. Cron wiring + enable-flip pending operator-run DEC-043 attestation. Vendor lock per DEC-053 (split-vendor: FMP for Signal #1, **Finnhub Estimate-1 for Signal #2**, both retained at $144/mo within the $150 ceiling).

Detailed component reference for Signal #2 (post-earnings drift, 20-day decayed SUE) — the sixth wired signal of nine (§4.4.1–§4.4.9) and the **first signal in the stack sourced from Finnhub** (the prior five are Polygon / Tradier). Three new architectural firsts here: (a) a **dual-fetcher orchestrator** (estimates + actuals joined on `(year, quarter)`); (b) a **typed `zero_dispersion` skip** that strictly forbids an ε-fallback per DEC-051 / DEC-053; (c) an explicit **conscious T-0 approximation** of the §4.4.6 spec's T-5 consensus anchor (documented in DEC-053 and re-documented here per the three-place discipline).

## Purpose

Per CROSSWIND §4.4.6: signal value is the **standardized unexpected earnings (SUE)** for each name's most recent earnings report, **time-decayed** by trading days since the report on a 20-day half-life. Formally:

```
SUE          = (eps_actual − consensus_estimate) / sigma_proxy
sigma_proxy  = (epsHigh − epsLow) / 2.698      -- DEC-051 range-proxy denominator
signal_value = SUE × exp(−trading_days_since_report / 20)
```

Per §4.3.5 the signal is **NON-CRITICAL**: names without a recent earnings report (> 60 trading days), without enough analyst coverage (`numberAnalysts < 2`, DEC-052), or with a degenerate estimate range (`epsHigh == epsLow`) do NOT get excluded from ranking — the orchestrator records a typed skip (`no_recent_earnings`, `pead_panel_below_floor`, `zero_dispersion`) and the ticker contributes via the Phase 3 combiner's missingness imputation. The system keeps working without this signal.

## Three conscious-approximation flags (three-place discipline per DEC-053)

These three deviations from a literal §4.4.6 read are pinned in code headers + this doc + DEC-053. They are NOT hidden — surface, don't hide (the longshort module's §2 axiom 4).

1. **T-0 consensus anchor instead of the spec's T-5.** §4.4.6 verbatim calls for `consensus_estimate_EPS_at_T-5_days`. Finnhub's `/stock/earnings` snapshot is the consensus AS OF the report date (T-0), not T-5. The residual deviation is the pre-earnings-week revision activity ("walk-down" effect — analysts often nudge estimates down in the final days before a report). Measured SUE may therefore be **slightly DAMPENED** versus a true T-5 consensus — some of the surprise has already been absorbed into the consensus by T-0. **The deviation is NOT avoided; it is INHERITED.** Flagged for Phase-7 scrutiny: if measured alpha materially depends on T-5-vs-T-0 timing, a successor DEC adds an earnings-calendar anchor and back-walks the eps-estimate revision history. v1 ships T-0; v2 may refine.
2. **`sigma_proxy = (epsHigh − epsLow) / 2.698` (DEC-051).** The exact analyst-estimate standard deviation is not entitled by Finnhub Estimate-1. The 2.698 divisor is the **expected range of a standard-normal sample of size 4** — the median analyst panel size in the SPY ~$2B–$10B mid-strata; it converts a min/max range into a moment-matched σ estimate. Justification: (a) free of a fabricated denominator floor (no ε hack); (b) self-correcting under wider panels (the range grows roughly with √log N, the proxy grows accordingly); (c) the alternative (raw `epsHigh − epsLow`) systematically overstates dispersion by ~2.7×, deflating measured SUE uniformly. v1 ships the 2.698 divisor; Phase-7 may calibrate per N.
3. **`numberAnalysts >= 2` floor (DEC-052).** Names with a single analyst (N=1) have `epsHigh == epsLow == epsAvg` by construction — sigma_proxy is structurally zero, SUE is undefined. Forcing them in would require either an ε-fallback (forbidden by DEC-051 / DEC-053) or fabricated dispersion. Excluding N=1 is the only honest choice. **Small-cap consequence:** the §3.3 universe's lower-cap strata (≤ $500M) skew toward thin analyst coverage; a non-trivial fraction of small-caps will skip via `pead_panel_below_floor`. This is the documented price of typed absence over phantom signal — the absent names route through the combiner's missingness imputation, never through a fabricated zero. Measured small-cap coverage attrition is a Phase-7 monitoring item.

## Scope

**In scope (this component owns):**
- Daily per-ticker SUE + decay-weighted PEAD computation per §4.4.6.
- Within-sector GICS z-score normalization (±3 clip) — reused shared helper.
- Per-ticker typed-absence attribution into the `SignalSkipReason` buckets (the four shared + the three Signal-#2-specific: `no_recent_earnings`, `pead_panel_below_floor`, `zero_dispersion`).
- Idempotent UPSERT persistence into `signal_observations`.
- Per-run telemetry into `signal_compute_log`.
- Cron + manual operator-trigger production wiring (FP-044); cron is **DISARMED** at MIG-081.
- New entitlement-aware Finnhub fetcher pair: `FinnhubEpsEstimateFetcher` (consensus + dispersion + `numberAnalysts`) + `FinnhubEarningsFetcher` (actual EPS + at-report estimate snapshot + report date).

**Out of scope (other components / phases):**
- T-5 consensus refinement — deferred (see flag #1; Phase-7 monitoring item).
- Earnings-calendar anchor (`/calendar/earnings`) — would supply a refined report-date timestamp for the decay denominator; not needed v1 (the `/stock/earnings` row carries `date` directly).
- Combiner-stage missingness imputation — Phase 3.
- Cron wiring / enable-flip / cron-attributable attestation — separate operator step per DEC-040 + DEC-043.

## Architecture

```text
universe_membership (load latest snapshot)
        │
        ▼
pLimitedMap (concurrency=5; Finnhub 300rpm ≫ 839 names sequential ≈ 2.8 min)
   per ticker:
     Promise.all([
       FinnhubEpsEstimateFetcher.fetchEpsEstimates(ticker)  // consensus + dispersion + numberAnalysts per period
       FinnhubEarningsFetcher.fetchEarnings(ticker)          // actuals + at-report estimate + report date
     ])
       ├─ 403 (any)  → typed skip (subscription_gated)
       ├─ 404 (any)  → typed skip (data_unavailable)
       ├─ other 4xx/5xx → throws → caught → fetch_error
       └─ both ok → join on (year, quarter), pick latest reported quarter
         │
         ▼
   computePead(latestQuarter, as_of)
       ├─ no quarter within 60 trading days   → zero_dispersion / no_recent_earnings / pead_panel_below_floor
       ├─ numberAnalysts < 2                  → pead_panel_below_floor       (DEC-052 floor)
       ├─ epsHigh == epsLow                   → zero_dispersion              (DEC-051/053 — NO ε-fallback)
       └─ all gates pass → SUE × exp(-trading_days / 20)
         │
         ▼
   within-sector z-score (±3 clip)
         │
         ▼
   captureSignalObservations UPSERT → signal_observations
         │
         ▼
   persistSignalComputeLog → signal_compute_log
```

## Schemas

- **`signal_observations`** — MIG-064. Shared with all 9 signals; this signal writes rows with `signal_id='pead_sue_20d'`.
- **`signal_compute_log`** — MIG-065 + MIG-071 (`skipped_detail`). One row per run.
- **`SIGNAL_ID` constant** — `'pead_sue_20d'`, exported from `_shared/longshort-signals/pead/pead-orchestrator.ts`. Locked for Phase 3 combiner consumption. The placeholder seed (`signal_id='pead'`) shipped at MIG-075 was renamed in MIG-081 to match this export — drift sentinel in `job-signal-mapping_test.ts` (`(2f)`) pins the mapping.
- **`job_registry` row** — MIG-081 seeds `id='longshort.pead.compute'` with `enabled=false`. Schedule `'0 23 * * 1-5'` (weekdays 23:00 UTC — the empty slot after insider 19, momentum/reversal 20, signal-monitor + short-interest 21, options 22). **INTERIM cadence per DEC-048**; Phase 7 picks the final cadence. Enable-flip + cron wiring are a separate operator step.
- **`signal_registry` row** — MIG-081 sets `status='live'`, `job_registry_id='longshort.pead.compute'`, `stale_after_hours=48`, `cadence='daily (after-close; interim per DEC-048 — §4.4.6 spec target is event-triggered, Phase 7 picks final cadence)'`. Cadence text follows the MIG-079 truth-in-telemetry precedent.

## Error Modes

Seven `SignalSkipReason` values: the four shared (`fetch_error`, `missing_sector`, `singleton_sector`, `insufficient_history`) plus three Signal-#2-specific:

- `no_recent_earnings` — most recent reported quarter is > 60 trading days from `as_of`. Per §4.4.6 the PEAD signal is mechanically bounded to ~one quarter of drift; stale reports are not signal, they are noise.
- `pead_panel_below_floor` — `numberAnalysts < 2` (DEC-052). Documented small-cap consequence (see flag #3).
- `zero_dispersion` — `epsHigh == epsLow` (DEC-051 / DEC-053). **Strictly no ε-fallback** — typed absence, never fabricated denominator. This is the load-bearing anti-phantom guard for Signal #2.

### Known vendor anomaly — `epsHigh < epsLow` ordering (watch-only)

On rare occasions Finnhub `/stock/eps-estimate?freq=quarterly` returns a row where `epsHigh < epsLow` on negative-EPS panels — the high/low fields are surfaced as-emitted by the vendor rather than min/max-canonicalized. The `(epsHigh − epsLow) / (2 × 1.349)` σ_proxy then resolves to a **negative** value, which `compute-pead.ts:128` traps via `sigma_proxy <= 0 → zero_dispersion`. The behavior is correct: a non-positive σ_proxy is no more meaningful than a structurally zero one, and DEC-051 / DEC-053 forbid an ε-fallback in either case — typed absence is the only honest outcome.

**First observed:** FP-045 Phase-3 validation run `signal_queue_runs.run_id=451b9ee7-…`, 2026-06-10. **Single occurrence in 839 names: SATS** (`period=2026-03-31`, `epsHigh=-1.2495 epsLow=-1.1662 → σ_proxy=-0.0309`; persisted in `signal_compute_log.skipped_detail`). **Status: watch-only** — no orchestrator or fetcher change. If the rate of negative-σ trips climbs above ~5 names per run on this universe, escalate via a fetcher-level min/max canonicalization (would need its own ADR + the `_pattern-vendor-fetcher-filter-honesty.md` `verifyFieldsPresent` extension to cover ordering, not just presence).

`subscription_gated` and `data_unavailable` are emitted by the fetcher pair on 403 / 404; the orchestrator funnels both into the same typed-absence flow as the other non-critical signals.

## Cron-attestation gate (DEC-043)

This FP intentionally ships the cron job DISARMED. End-to-end attestation that the cron path works requires, per DEC-043:
- A `200` response in `net._http_response` for the `cron.job` invocation, AND
- A real artifact row in `signal_compute_log` with a wall-clock `completed_at` (NOT a midnight-manual signature).

Until both pieces of evidence exist post wire-and-enable, this signal's cron path is NOT attested as live — the registry row's presence alone is not evidence (per FP-039 / INC-69 lineage). The manual handler (`longshort-pead-compute-manual`) is the recommended path for validating math + persistence + entitlement-degradation independently of cron.

## References

- **CROSSWIND §4.4.6** — signal spec (verbatim).
- **DEC-048** — cadence governance: daily is interim, Phase 7 picks.
- **DEC-051** — sigma_proxy range-proxy formula.
- **DEC-052** — N≥2 analyst floor.
- **DEC-053** — split-vendor lock (Finnhub for Signal #2) + T-0 conscious approximation.
- **FP-044** — feature proposal.
- **MIG-081** — `job_registry` seed + `signal_registry` rename + planned→live flip.
- **ACT-160 / ACT-161** — reconciliation probe + Phase 1 execution.