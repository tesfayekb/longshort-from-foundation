# ACT-515 CAPSTONE (3/4) — R1 LONG-ONLY MICRO-RECEIPT

**Filed:** 2026-07-26 • **Config:** 1x-const, `disableShortAdmits=true` (smallest additive input flag, `reconstructor.ts::disableShortAdmits`)
**Test pin:** `reconstructor_test.ts::"LONG-ONLY — disableShortAdmits refuses every SHORT candidate; LONG unaffected"` (19/19 GREEN).
**Runner:** `scripts/act-515/matrix/run-long-only.ts` • **haircutMode:** `study` • **Clock:** FixedClock(1_704_000_000_000ms)
**Hypothesis:** ≈ +37% total / similar DD to R1 1x-const baseline (+35.14% / 11.86% DD) — settles whether the honest edge is long-only.

## §1 — Invocation

| field | value |
|---|---|
| window | 2022-06-29 .. 2026-07-10 |
| sessions | 1,011 |
| slate loaded | 34,516 (L 25,150 / S 9,366) |
| carrier sessions | 1,007 |
| starting equity | $100,000.00 |
| K (daily budget) | 5 |
| wallet caps | long 0.90 / short 0.10 |
| disableShortAdmits | **true** |

## §2 — Frozen columns

| column | value |
|---|---|
| total_admits | **4,693** (LONG 4,693 / SHORT 0 — flag verified) |
| max_concurrent_long | 32 |
| max_concurrent_short | 0 |
| allocation_cap_refusals | 0 |
| daily_budget_refusals | 6,465 |
| ending_equity | **$144,137.27** |
| **total_return_pct** | **+44.14%** |
| worst_calendar_year | 2024 |
| worst_calendar_year_return | +4.32% |
| **max_drawdown_pct** | **11.13%** |
| dd_peak / trough / recovery | 2024-11-26 / 2025-04-08 / 2025-09-11 |
| cumulative_carry_usd | $0.00 (no short leg) |
| exit_price_unavailable | 1 (SATS, permitted skip) |
| exit_calendar_exhausted | 5 (tail anchors) |

## §3 — Ledger-foot identity (study envelope)

```
start          = 10,000,000c
Σrealized      = +4,413,758c
−carry         =         0c
+unreal(term)  =         0c
─────────────────────────────
predicted end  = 14,413,758c
actual end     = 14,413,727c
Δ              =       -31c
envelope       =      4,693c  (total_admits + max(0, open_lots_term))
status         =    WITHIN
```

## §4 — Comparison vs R1 1x-const baseline

| metric | 1x-const (baseline, L+S) | 1x-const LONG-ONLY | Δ |
|---|---:|---:|---:|
| total return | +35.14% | **+44.14%** | **+9.00pp** |
| max DD | 11.86% | **11.13%** | -0.73pp |
| worst-year | -1.66% (2024) | +4.32% (2024) | +5.98pp |
| total admits | 4,902 | 4,693 | -209 |
| ending equity | $135,141 | $144,137 | +$8,996 |

**Read (one line):** removing the SHORT leg improves total return by +9pp, tightens DD by 0.7pp, and flips 2024 from red to green — the honest baseline is **long-only**. The SHORT leg (209 lots at +3.16 bps/lot mean per V-E) was a net drag on both return and DD in the sealed corpus.

## §5 — Eligibility grammar (frozen)

| clause | threshold | actual | verdict |
|---|---|---:|:---:|
| cagr ≥ 15% | 15% | **9.62%** (4.03y horizon) | ✗ |
| worst-year ≥ 0% | 0% | +4.32% | ✓ |
| dd ≤ 1.5×cagr | 14.43% | 11.13% | ✓ |
| lots ≥ 300 | 300 | 4,693 | ✓ |

**VERDICT: TEXTURE** — passes DD/worst-year/lots, misses CAGR clause by ~5.4pp. Not decision-eligible on its own; provides the **numeric substrate for path (iii)** in the ACT-577 amendment ("explicit operator ruling to run the 1x long-only low-vol profile live").

## §6 — Provenance
- Kernel: `scripts/act-515/kernel/*` (untouched this turn).
- Orchestrator: `scripts/act-515/matrix/orchestrator.ts` (pass-through only).
- Reconstructor: `scripts/act-515/matrix/reconstructor.ts` (SHORT-branch early-exit with typed skip `short_admits_disabled`).
- Cache SHAs: per `cache-shas.ts` (turn-2B seal).
- Runner: `scripts/act-515/matrix/run-long-only.ts`.