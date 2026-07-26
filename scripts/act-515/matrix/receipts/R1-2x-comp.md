# ACT-515 R1 · 2x-comp · Full Receipt

```
RECEIPT — ACT-515 R1 · variant=2x-comp
SELECT now();  →  2026-07-26T03:08:06.099Z
── CAVEATS ────────────────────────────────────────────────────────
· Compacted-corpus basis: slate = TOP-N=25 per (event_date, side) per
  overshoot-matrix-export v=matrix-export-v2-devv. SHORT side pre-
  qualified in the SELECT against certified kernel geometry (DEV-V
  V-β-SCOPED). Full-corpus reconstruction out of scope for this turn.
· Survivorship bound (universe.jsonl trailer): 839
  corpus tickers vs 905 active today; 15 corpus-only
  (delisted between study and receipt). Reported as bound only —
  the runner does NOT re-filter against a replay-time universe (M-1 law).
· Pacing: matrix charter runs WITHOUT DEC-084 short-daily ramp
  (shortDailyBudget = K = 5). Binding SHORT constraints are the
  4-slot book cap + 0.10 wallet cap per frozen matrix row.
· SHORT participation: shorts compete inside the shared K=5 by rank
  (production-faithful steady-state; DEC-084 1/day is a live rollout lane,
  not chartered geometry) — 209 short lots, peak 4 concurrent, short cap
  binds rarely; a separate-short-lane variant is a possible FUTURE matrix
  row on operator word, not this one.
· Haircut mode: 'study' (frozen matrix basis). Ledger-foot identity
  asserted within envelope |Δ| ≤ lots_count cents. Cent-EXACT identity
  proven by orchestrator_test.ts TEST 1 (haircutMode='none').
· Corpus run: 1888e113-f9b3-43f5-856c-d91666a3c121   Cell-map run: 1888e113-f9b3-43f5-856c-d91666a3c121
  Slate total: 34,516 rows across 5 yearly slices.
· INC-147 delta re-fetch: 1,078 windows / 11,094 bar rows appended
  (bars-windows-delta.jsonl). Superset assertion: live-walk admits are
  sizing-proportional across variants, so this delta covers all three.
· Pre-authorized typed skips (permitExitDegradation=true): true market
  gaps surviving maxCarry=5 (exit_price_unavailable) and tail lots whose
  exit runs past pinned calendar (exit_calendar_exhausted). Listed per
  config below; >20 exit_price_unavailable = STOP.

── INVOCATION + COUNTS ────────────────────────────────────────────
  variant=2x-comp  leverage=2x  mode=comp
  starting_equity=$100,000.00  wallet_caps=long:0.9/short:0.1
  budgets={k:5, shortDailyBudget:5}   haircutMode=study
  sessions_walked=1,011 / 1,011   window=2022-06-29..2026-07-10
  slate_rows=34,516 (LONG 25,150 / SHORT 9,366)
  slate_off_calendar_skipped=0   entry_session_carriers=1,007
  admits: TOTAL=4,894  LONG=4,693  SHORT=201
  cap-bind telemetry:
    refusals — allocation_cap=835  position_already_open=2,920
               daily_budget=14,480  short_daily_budget=0
    max concurrent — LONG=32  SHORT=4

── PRE-AUTHORIZED TYPED SKIPS ─────────────────────────────────────
  exit_price_unavailable (post maxCarry=5): count=1 — threshold=20
    · 2026-06-18  LONG   SATS    lot=2026-06-18#613184  reason=no close within maxCarryDays=5 of scheduled exit 2026-06-25
  exit_calendar_exhausted (tail lots past pinned calendar): count=5
    · 2026-07-07  LONG   PCG     lot=2026-07-07#575523  reason=calendar has no session at ord-6 beyond eventDate=2026-07-02 (anchor spec long/T1 = {"mode":"event","n":6})
    · 2026-07-07  LONG   D       lot=2026-07-07#602760  reason=calendar has no session at ord-6 beyond eventDate=2026-07-02 (anchor spec long/T1 = {"mode":"event","n":6})
    · 2026-07-07  LONG   EIX     lot=2026-07-07#573940  reason=calendar has no session at ord-6 beyond eventDate=2026-07-02 (anchor spec long/T1 = {"mode":"event","n":6})
    · 2026-07-07  LONG   IDA     lot=2026-07-07#605462  reason=calendar has no session at ord-6 beyond eventDate=2026-07-02 (anchor spec long/T1 = {"mode":"event","n":6})
    · 2026-07-07  LONG   LNT     lot=2026-07-07#634227  reason=calendar has no session at ord-6 beyond eventDate=2026-07-02 (anchor spec long/T1 = {"mode":"event","n":6})

── THE VERDICT ROW (config-matrix.md columns) ─────────────────────
  starting_equity          = $100,000.00
  ending_equity            = $185,350.10
  total_return_pct         = 85.35%
  cumulative_carry_usd     = $319.96
  worst_calendar_year      = 2024
  worst_calendar_year_ret  = 2.43%
  max_drawdown_pct         = 27.03%
  dd_peak_date             = 2024-11-11
  dd_trough_date           = 2025-04-08
  dd_recovery_date         = 2025-12-04
  dd_duration_sessions     = 100
  dd_recovery_sessions     = 166

── TERMINAL IDENTITY (study-mode envelope) ────────────────────────
  starting_equity_cents      = 10,000,000
  Σ realized_cents           = 8,566,939   (LONG 11,011,534 / SHORT -2,444,595)
  − cumulative_carry_cents   = 31,996
  + terminal_unrealized_c    = 0   (open lots at last session = 0)
  = predicted_end_cents      = 18,534,943
  actual  end_cents          = 18,535,010
  Δ = +67c over 4,894 lots — envelope=4,894c → WITHIN study-mode rounding envelope

── EQUITY-SHAPE NOTES ─────────────────────────────────────────────
  first_admit_session      = 2022-06-30
  last_admit_session       = 2026-07-06
  peak_concurrent_lots     = LONG 32  SHORT 4  (book caps = 36L / 4S at 1x-const rail; scale with variant)
  sessions_with_carry      = 80 / 1,011
  peak_cash_debit_usd      = $80,543.44
  terminal_session         = 2026-07-10   terminal_open_lots = 0
```
