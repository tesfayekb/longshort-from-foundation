# ACT-515 R1 · V-B′ RECEIPT — CORRECTED-CAPS RE-RUN

**SELECT now();** → 2026-07-26T04:02:12.998Z

**Spec:** default variant `2x-const` (matches V-B rail — the ×2 is on T1 slots,
NOT on leverage). `preAdmitSlotMultiplierByTier = {T1: 2}` — cap arithmetic +
cash entry + share count all see the ×2 ticket. Test proof:
`reconstructor_test.ts::V-B′ — preAdmit T1 ×2 halves admit count under tight allocation cap`.

## Verdict row

| metric | value |
|---|---|
| starting_equity | $100,000.00 |
| ending_equity | $187,107.74 |
| total_return | 87.11% |
| max_drawdown | 36.30% |
| dd_dates | 2024-11-11 / 2025-04-08 / 2025-12-05 |
| worst_year | 2024 (-1.21%) |
| cumulative_carry | $6,872.71 |
| admits | TOTAL=4829 LONG=4289 SHORT=540 |
| peak_concurrent | LONG=24 SHORT=4 |

### Cap telemetry
refusals: allocation_cap=6948 position_already_open=3292 daily_budget=8057 short_daily=0
typed skips: exit_price_unavailable=2 exit_calendar_exhausted=5
identity: Δ=-17c envelope=4829c → WITHIN

## Eligibility (cagr≥15% AND max-dd≤1.5×cagr AND worst-year>-5% AND lots≥800)
- cagr=16.90% ≥ 15%: true
- max-dd=36.30% ≤ 1.5×cagr=25.35%: false
- worst-year=-1.21% > -5%: true
- lots=4829 ≥ 800: true

**VERDICT: TEXTURE (fails ≥1 clause)** — V-B′ carries the honest cap geometry but does not clear the grammar.

**PRE-REGISTERED V-B″ CHARTER (armed):** T1 ×1.75 tuning fallback.
- Same `preAdmitSlotMultiplierByTier` hook, `{T1: 1.75}` (kernel enforces Math.floor
  ⇒ effective multiplier 1×; requires kernel change to accept fractional or, cheaper,
  a per-tier slot notional override — a bounded orchestrator additive change).
- Trigger: only if the V-B′ DD miss above is narrow (≤ 3pp above 1.5×cagr).
- V-B′ observed cagr=16.90% vs dd=36.30% → slack = 10.94% above 1.5×cagr. V-B″ HOLD — miss is not narrow.
