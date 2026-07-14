# ACT-506 — RESULTS: Slippage Decomposition (Adapted)

> **Filed:** 2026-07-14 | **Mode:** read-only compute against `overshoot_audit_logs` +
> `overshoot_daily_bars` | **Cohorts probed:** 2026-07-07, 2026-07-08, 2026-07-09
> **Standing-rule basis:** charter-and-execute for read-only compute (2026-07-14 operator directive)

## Adaptation vs pre-committed method

**Field-availability audit (blocking gap named per charter caveat #1):**

| Charter field | Persisted? | Substitute used |
|---|---|---|
| `snapshot_mid_at_construction` | **NO** — no such key in `overshoot.entry.submitted.entry.metadata` (keys enumerated below) | None — the pure limit-vs-mid and mid-vs-open legs are **NOT COMPUTABLE**; collapsed into `open_to_limit` |
| `limit_price` (per lot) | **YES** — `metadata.limit_price` on `overshoot.entry.submitted.entry` | direct |
| `filled_avg_price` (per lot) | **YES** — `metadata.avg_fill_price` on `overshoot.lot.opened`, joined by `client_order_id` | direct |
| `close(T-1)` prior close | **YES** — `overshoot_daily_bars.close`, latest `trade_date < cohort_date` | direct |
| `open(T)` entry-day open | **YES** — `overshoot_daily_bars.open` on cohort_date | direct |
| `slippage_bps` (as logged by entry-runner) | **YES** — flat `50.0` on every row (limit-band construction constant, not a measurement) | reported alongside for comparison |

`overshoot.entry.submitted.entry` metadata keys observed: `attempt, capacity_per_side,
client_order_id, correlation_id, i5_reversion_pct, intent, limit_price, margin_multiplier,
minutes_to_close, order_id, orderSide_semantic, qty, regime, run_id, side, sizingBase,
slippage_bps, snapshot_age_ms, strategy_allocation_pct, ticker, tier`.

**Decomposition adapted (per charter caveat #1: "report N-covered and flag the gap — do NOT
fabricate or impute"):**

```
close→fill  =  overnight  +  open_to_limit  +  limit_to_fill
```

where `overnight = open(T) − close(T-1)`, `open_to_limit = limit_price − open(T)`,
`limit_to_fill = fill − limit_price`. All expressed in bps of `close(T-1)`. The charter's
finer split of the controllable leg into **limit-vs-mid** and **fill-vs-limit-fill-through**
is **NOT COMPUTABLE** at this cohort until `snapshot_mid_at_construction` is persisted.

## Cohort coverage

- 2026-07-07: **0 lots** in `overshoot.lot.opened` for this date — cohort is EMPTY in audit
  logs (contra the charter's `n=18`; either the 07-07 cohort was DRY or predates the audit-
  writer landing). **Excluded.**
- 2026-07-08: **18 lots** — full coverage on all measurable fields.
- 2026-07-09: **14 lots** — full coverage on all measurable fields.
- **Total measured: n = 32** (vs charter's planned n = 50).

## Measured decomposition (means, bps of `close(T-1)`)

| cohort | n | overnight | open→limit | limit→fill | close→fill (identity) | logged `slippage_bps` | `snapshot_age_ms` mean |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2026-07-08 | 18 | **+24.2** | **+129.2** | **−50.5** | **+102.8** | 50.0 (constant) | 2,643 |
| 2026-07-09 | 14 | **+164.2** | **+83.1** | **−50.4** | **+196.8** | 50.0 (constant) | 2,126 |

Identity checks (mean of components vs mean of totals): 24.2 + 129.2 − 50.5 = 102.9 ≈ 102.8
(0.1 bps rounding); 164.2 + 83.1 − 50.4 = 196.9 ≈ 196.8. Row-level identity within rounding
tolerance (SQL used the same denominator `close(T-1)` throughout).

## Headline

- **Close→fill mean across both cohorts (weighted by n=32):** `(18·102.8 + 14·196.8)/32 =
  **143.9 bps ≈ 1.44 %**` — consistent with ACT-505's measured 1–2% entry-slippage means (the
  ratifying prior).
- **Overnight leg dominates the between-cohort variance:** 07-09's +164 bps overnight (a
  wide-gap-open day) is the primary driver of its 197-bps total; 07-08's tighter +24 bps
  overnight leaves a 103-bps total that is mostly `open_to_limit`.
- **`limit_to_fill` is a tight ≈ −50 bps on BOTH cohorts** (fills print inside the limit by
  ≈ 0.5%, i.e. price improvement, as expected for a marketable buy limit).
- **`logged slippage_bps` is a construction constant, not a measurement:** flat 50 bps on
  every row → this is the entry-runner's limit-band offset (`limit = mid + 50 bps`), not a
  post-fill telemetry field. **Do NOT cite `slippage_bps` as observed slippage anywhere.**

## Verdict (framed exactly per charter §Deliverables item 5)

**"Is the controllable component consistent with intended limit construction (state the
expected bps under the current limit-band + queue-position assumptions), or does it indict
(a) limit-band width, (b) fire timing, or (c) queue-position tactics?"**

**Answer, provisional (blocked on `snapshot_mid_at_construction` persistence):**

- The **queue-position / fill-through** leg (`limit_to_fill ≈ −50 bps`) is **NOT indicting** —
  fills are inside the limit by half a percent, so marketable-limit aggression is not
  bleeding on the fill side.
- The **combined `open_to_limit` leg (+129 / +83 bps)** cannot be split without
  `snapshot_mid_at_construction`. Under the current 50-bps limit-band assumption:
  - Expected `limit_vs_mid ≈ +50 bps` (band construction).
  - Residual `mid_vs_open` = `open_to_limit − 50 bps` = **+79 bps** (07-08) / **+33 bps**
    (07-09) — this residual is the **drift between the opening print and the ~09:35 ET
    construction moment**.
- **Ranked by measured bps contribution to close→fill:**
  1. `open_to_limit` (129 / 83 bps) — dominated by the un-splittable open→mid drift;
     **cannot be indicted as limit-band or fire-timing without the mid snapshot.**
  2. `overnight` (24 / 164 bps) — **cohort-specific market gap, not a strategy defect** —
     verdict axis #1 comparison vs VI.I overnight distribution deferred to when VI.I is
     re-derived under ACT-517 provenance discipline.
  3. `limit_to_fill` (−50 / −50 bps) — **beneficial**, not indicting.

**Actionable conclusion:** The **controllable bleed is boxed to at most `+79 bps` and at
least `+33 bps` per cohort mean**, and lives inside `open_to_limit` between the opening
print and construction time. Whether this is limit-band width, fire timing, or an
un-modeled open-print drift **CANNOT be discriminated** at this deliverable — persisting
`snapshot_mid_at_construction` on the entry-runner audit event (a code change, gated
per money-path discipline) is the next step to close the split.

## Honest caveats (per charter — all preserved)

1. **`snapshot_mid_at_construction` NOT persisted** — the limit-vs-mid / fill-vs-limit split
   is not computable at this deliverable. Flagged, not fabricated. No imputation.
2. **LONG only** — no SHORT sleeve in the 32 lots (consistent with Wave-2 posture).
3. **`open(T)` is Polygon official open** — daily-bars source, not pre-market print.
4. **n = 32, not 50** — 07-07 cohort empty in audit logs; N-covered reported per cohort.
5. **VI.I overnight-distribution comparison DEFERRED** — VI.I is downstream of ACT-514,
   which the new INC-103 downgrades to `PROVENANCE-UNKNOWN`. Overnight-percentile placement
   reruns once ACT-515's engine re-derives the reference.

**END RESULTS.**