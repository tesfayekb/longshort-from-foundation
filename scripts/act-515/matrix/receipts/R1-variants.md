# ACT-515 R1 · VARIANT RECEIPTS (V-A / V-C on sealed artifacts)

═══════════════════════════════════════════════════════════════════
## V-A rank-elite

**SELECT now();** → 2026-07-26T03:27:57.946Z
**Spec:** admit rank≤5; slot=$5k via leverage=2 on $100k const rail

Corpus filter: kept 9187 slate rows, skipped 25329 by rank>5.

### Verdict row

| metric | value |
|---|---|
| starting_equity | $100,000.00 |
| ending_equity | $107,190.65 |
| total_return | 7.19% |
| max_drawdown | 26.45% |
| dd_dates | 2023-02-13 / 2025-04-08 / UNRECOVERED |
| worst_year | 2023 (-9.58%) |
| cumulative_carry | $18.08 |
| admits | TOTAL=4387 LONG=3687 SHORT=700 |
| peak_concurrent | LONG=20 SHORT=4 |

### Cap telemetry
refusals: allocation_cap=902 position_already_open=1596 daily_budget=1661 short_daily=0
typed skips: exit_price_unavailable=1 exit_calendar_exhausted=5
identity: Δ=-43c envelope=4387c → WITHIN

### Eligibility (cagr≥15% AND max-dd≤1.5×cagr AND worst-year>-5% AND lots≥800)
- cagr=1.75% ≥ 15%: false
- max-dd=26.45% ≤ 1.5×cagr=2.62%: false
- worst-year=-9.58% > -5%: false
- lots=4387 ≥ 800: true
**VERDICT: TEXTURE (fails ≥1 clause)**

═══════════════════════════════════════════════════════════════════
## V-C rank-elite×2xcomp

**SELECT now();** → 2026-07-26T03:27:58.318Z
**Spec:** admit rank≤5; leverage=2 on running-equity comp basis

Corpus filter: kept 9187 slate rows, skipped 25329 by rank>5.

### Verdict row

| metric | value |
|---|---|
| starting_equity | $100,000.00 |
| ending_equity | $105,355.99 |
| total_return | 5.36% |
| max_drawdown | 25.53% |
| dd_dates | 2023-02-13 / 2026-03-06 / UNRECOVERED |
| worst_year | 2023 (-9.46%) |
| cumulative_carry | $0.21 |
| admits | TOTAL=4355 LONG=3687 SHORT=668 |
| peak_concurrent | LONG=20 SHORT=4 |

### Cap telemetry
refusals: allocation_cap=1036 position_already_open=1573 daily_budget=1582 short_daily=0
typed skips: exit_price_unavailable=1 exit_calendar_exhausted=5
identity: Δ=20c envelope=4355c → WITHIN

### Eligibility (cagr≥15% AND max-dd≤1.5×cagr AND worst-year>-5% AND lots≥800)
- cagr=1.31% ≥ 15%: false
- max-dd=25.53% ≤ 1.5×cagr=1.96%: false
- worst-year=-9.46% > -5%: false
- lots=4355 ≥ 800: true
**VERDICT: TEXTURE (fails ≥1 clause)**

═══════════════════════════════════════════════════════════════════
## V-B / V-D — DEFERRED-SCOPE-FENCE (typed)

**V-B (T1-priority, T1 slots ×2):** requires a per-lot sizing hook on the
orchestrator to override `KERNEL_SLOT_CONCENTRATION` for T1 admits. Not
expressible via the existing `SizingVariantId` enum (which is fixed at
four values; slot-concentration is a kernel constant, not per-tier).
Implementation path: add `slotMultiplierByTier?: Record<Tier, number>` to
`OrchestratorInput`; kernel size.ts already isolates slot math to one line.
Change is bounded and testable; deferred for a dedicated build turn.

**V-D (regime-gated leverage):** requires per-session variant switching
(2×-comp when prior-session SPY close > its 200-SMA, else 1×-comp). Needs
a `variantResolver: (session: SessionDate) => SizingVariantId` hook plus
a warmup fallback for the first 200 sessions (operator-frozen: regime=1×
during warmup). Both are additive orchestrator changes with kernel scope
preserved. Deferred to the same build turn as V-B.

Neither deferred variant fabricates numbers here.
