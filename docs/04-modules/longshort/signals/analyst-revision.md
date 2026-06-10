# Signal #1 — Analyst Revision Drift (CROSSWIND §4.4.5)

**Status:** live (DISARMED — MIG-087 ships `enabled=false`; operator-run step
enables after the FP-047 Phase-3 validation fire).
**Vendor:** FMP Premium `/stable/price-target-latest-news` (discovery) +
`/stable/price-target-news?symbol={t}` (per-symbol history). Split-vendor
lock per DEC-053.
**Architecture:** Branch A+H (single-invocation, NOT queue-worker). Locked
by FP-047 Phase-0 mechanical probe (5-symbol stratified test — NKE / KO /
DDOG / TYL / HYLN). DEC-055 governs binding decisions.

## 1. Formula — CROSSWIND §4.4.5 (verbatim, `docs/04-modules/longshort/design-source/CROSSWIND_SPEC.md:466`)

```
signal_N = Σ over R in trailing 30d:
   direction(R) × min(|magnitude(R)|, 0.50)
                × analyst_credibility_weight(R)
                × exp(-age_days / 5)
```

Per-revision (responsive to single new revisions), NOT consensus-average
smoothing. Coverage initiations and rating reiterations count as zero;
per-revision magnitude clipped at ±50%.

## 2. Term bindings (DEC-055)

| Term | Binding | Authority |
|------|---------|-----------|
| `direction(R)` | `sign(newTarget − priorTarget)` (REVISION direction, NOT implied-upside vs. spot) | DEC-055 §(c) — the NKE probe ($62→$50 on $44 spot) ratified the strict-prior approach |
| `magnitude(R)` | `(newTarget − priorTarget) / priorTarget`, clipped to ±0.50 by the formula's `min(·, 0.50)` | DEC-055 §(b) |
| `analyst_credibility_weight(R)` | `1.0` uniform in v1 | DEC-055 §(a) |
| `age_days` | `(as_of − publishedDate)` in calendar days, derived from injected `as_of` only | DEC-034 (4) — no wall-clock |
| Window | `0 ≤ ageDays ≤ 30` calendar days, INCLUSIVE on both ends | test-pinned (`compute-analyst-revision_test.ts` test 8) |
| Adjusted/raw pairing | Use `adjPriceTarget` on BOTH rows iff finite & > 0 on both; else `priceTarget` on BOTH. NEVER mix. | Stated rule, test-pinned (`compute-analyst-revision_test.ts` tests 10a/10b) |

## 3. NKE-shaped justification (the semantic-drift case)

The Phase-0 probe documented an analyst PT cut on NKE: prior $62 → new $50
with spot ≈ $44. The naive "implied-upside" reading
`sign(priceTarget − priceWhenPosted) = sign(50 − 44) = +1` would emit a
**bullish** signal. The §4.4.5-faithful revision reading
`sign(50 − 62) = −1` emits a **bearish** signal of magnitude
`|50 − 62| / 62 ≈ −0.1935` (post-clip `−0.1935`). This is the single
highest-impact correctness decision in the signal; the strict-prior approach
is non-negotiable.

## 4. Identity normalization (DEC-055 §(f) — phantom-prior prevention)

`normalizeAnalystKey(name, company)` = `toLowerCase()` then strip every
non-alphanumeric character. Match requires BOTH normalized fields equal AND
`analystName` non-empty on BOTH sides. Empty-name rows match nothing.
The canonical DDOG-shaped hazard (firm-matched, empty analyst-name history)
returns typed absence — never a phantom prior. Window is strictly BEFORE the
focal `publishedDate` with maximum age 365 days.

## 5. Pacing — both bounds (Catalog #39 + FP-044 lesson)

Single shared `TokenBucket` per vendor sized at 750 req/min × 0.85 ≈
**10.625 req/s**. Both fetchers receive the same paced `HttpFetch` —
never one-bucket-per-fetcher.

| Bound | Typical (H≈100) | Worst case (H=839) |
|-------|-----------------|--------------------|
| Rate-bound floor `(37 + H) / 10.625` | ≈12.9 s | ≈82.4 s |
| Latency-bound `(37 + H) × 0.4 / 6`   | ≈9.1 s  | ≈58.4 s |

`H` = number of universe symbols with ≥1 in-window focal event = number of
history-endpoint calls. Worst-case binding bound = **rate-bound 82.4 s**
vs the **150 s HTTP wall** → ~45 % headroom.

**Earnings-season note:** revision clustering raises H toward the worst
case. The worst-case row is the operating guarantee.

## 6. Skip taxonomy (DEC-055 §(g))

| Reason | When |
|--------|------|
| `no_revisions_in_window` | Universe symbol has zero in-window focal events. EXPECTED for the long tail. |
| `revision_prior_unavailable` | ≥1 in-window focal event(s), zero recovered same-analyst priors. NO implied-upside fallback. |
| `zero_magnitude_only` | All scored pairs have `newTarget === priorTarget` (reiterations). Typed absence beats a fabricated zero. |
| `data_unavailable` | History endpoint returned 404 / empty array, or all in-window focal rows had non-finite/non-positive targets. |
| `subscription_gated` | Feed or history endpoint returned 401/402/403. |
| `fetch_error` | Persistent 429 / network failure / parse failure. |
| `missing_sector` / `singleton_sector` | Sector-side: shared z-score normalizer typed-absence semantics. |

No sentinel numerics anywhere. No fabricated ε. Mass balance:
`|persisted| + |skips| = |universe|`.

## 7. Registry truth (MIG-087)

- `job_registry.longshort.analyst.compute` — `enabled=false`,
  `schedule='0 21 * * 1-5'`, `handler_path='supabase/functions/longshort-analyst-compute/index.ts'`,
  `timeout_seconds=150`, `trigger_type='scheduled'`.
- `signal_registry.analyst_revision_drift` — `status='live'`,
  `cadence='daily (after-close; single-invocation ~15-90s; interim per DEC-048 — §4.4.5 spec target is 15-min intraday, Phase 7 picks final cadence)'`,
  `planned_phase=NULL`, `job_registry_id='longshort.analyst.compute'`.
- `JOB_ID_TO_SIGNAL_ID['longshort.analyst.compute'] = 'analyst_revision_drift'`
  (drift-sentinel test cross-references the orchestrator's `SIGNAL_ID` export).

## 8. Files

- Orchestrator: `supabase/functions/_shared/longshort-signals/analyst-revisions/analyst-revision-orchestrator.ts`
- Compute (pure): `supabase/functions/_shared/longshort-signals/analyst-revisions/compute-analyst-revision.ts`
- Identity: `supabase/functions/_shared/longshort-signals/analyst-revisions/analyst-identity.ts`
- Feed fetcher: `supabase/functions/_shared/longshort-signals/analyst-revisions/fmp-price-target-feed-fetcher.ts`
- History fetcher: `supabase/functions/_shared/longshort-signals/analyst-revisions/fmp-price-target-history-fetcher.ts`
- Cron handler: `supabase/functions/longshort-analyst-compute/index.ts`
- Manual handler: `supabase/functions/longshort-analyst-compute-manual/index.ts`
- Migration: `supabase/migrations/20260610160333_e0c9ecdf-ec19-4db9-8cc2-7bdc8204505e.sql` (MIG-087)