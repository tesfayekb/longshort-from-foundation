# ACT-515 R1 · VERDICT TABLE (populated from three-config + SPY-BH)

**Source template:** `scripts/act-515/verdict-table-template.md` (kept
pristine; do not overwrite). This populated instance covers rows R1
(1x-const), R3 (2x-const), R4 (2x-comp), R5 (SPY-BH). R2 (1x-comp) is not
in the current three-config run and remains PENDING pending operator scope.

**Committed:** 2026-07-26. Numbers from `receipts/R1-*.md` (this session)
and `receipts/R1-spy-bh.md`.

## §1 Primary five-row table (columns per template §1)

> Not all template columns are computed by the current receipt runner
> (Sharpe / Sortino / days-in-call / mean·max lots / % days at cap need a
> daily-equity emitter that isn't wired yet). Filled cells cite receipt
> values; unfilled cells stamp `PENDING-EMITTER`.

| Row | C1 sep22-mo | C2 max-dd | C3 dd-dates (peak / trough / recovery) | C4 dd-dur-d | C5 dd-rec-d | C6 CAGR | C7 Sharpe | C8 Sortino | C9 days-in-call | C10 mgn-int $ | C11 mean/max lots | C12 % days at cap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 `1x-const` | PENDING-EMITTER | 11.86% | 2024-11-11 / 2025-04-08 / 2025-10-06 | 100 | 124 | ≈7.8% (35.14% over 4.02y) | PENDING-EMITTER | PENDING-EMITTER | 0 (by construction) | $0.00 | max=32 (mean PENDING-EMITTER) | PENDING-EMITTER |
| R2 `1x-comp`  | PENDING | PENDING | PENDING / PENDING / PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | 0 (by construction) | 0 (by construction) | PENDING | PENDING |
| R3 `2x-const` | PENDING-EMITTER | 20.00% | 2024-11-11 / 2025-04-08 / 2025-10-06 | 100 | 124 | ≈14.4% (71.11% over 4.02y) | PENDING-EMITTER | PENDING-EMITTER | 12 / 1,011 | $50.31 | max=32 (mean PENDING-EMITTER) | PENDING-EMITTER |
| R4 `2x-comp`  | PENDING-EMITTER | 27.03% | 2024-11-11 / 2025-04-08 / 2025-12-04 | 100 | 166 | ≈16.7% (85.35% over 4.02y) | PENDING-EMITTER | PENDING-EMITTER | 80 / 1,011 | $319.96 | max=32 (mean PENDING-EMITTER) | PENDING-EMITTER |
| R5 `spy-bh`   | PENDING-EMITTER | 19.00% | 2025-02-19 / 2025-04-08 / 2025-06-27 | 34 | 55 | 18.66% | PENDING-EMITTER | PENDING-EMITTER | 0 (by construction) | 0 (by construction) | n/a | n/a |

*CAGR for R1/R3/R4 is a receipt-derived approximation: `(end/start)^(1/years) − 1`
with years = 1,011 sessions / 252. Sharpe/Sortino/monthly Sep-2022 and cap-day
percentages require a daily equity-series emitter (see PENDING-EMITTER note).*

## §2 Five-deepest DDs sub-table (per row)

PENDING-EMITTER — requires a full DD-ranking pass over the equity series
that the receipt writer does not currently retain to disk. Deferred.

## §3 2022-H2 monthly matrix vs SPY

PENDING-EMITTER — requires a monthly-close aggregation of the equity series;
not currently emitted. Deferred.

## §4 Regime-exit counterfactual

Out of scope for the R1 pack (charter's mechanism d1/d2/d3 verdicts run
separately). Placeholders remain per template §4/§5/§6.

## §5 Full-window rows on adoption pass

No adoption votes taken this session.

## §6 Verdict summary

No mechanism verdicts this session — the three-config receipt was the
goal. The verdict against SPY-BH benchmark:

- 1x-const beats SPY-BH **on drawdown** (11.86% vs 19.00%) but trails on
  total return (35.14% vs 98.49%). Consistent with a lower-exposure lane.
- 2x-const roughly matches SPY-BH DD (20.00% vs 19.00%) with a lower total
  return (71.11% vs 98.49%). Leverage buys return but does not close the
  gap with SPY over this window.
- 2x-comp **exceeds** SPY-BH DD (27.03% vs 19.00%) while still trailing
  total return (85.35% vs 98.49%). Compounding produces the biggest
  drawdown of the four with only a modest return premium over 2x-const.

## §7 Operator read paragraphs

### R1 `1x-const`

> A single-notional $100k rail over the study window ends at $135,137.67
> (+35.14%, ≈7.8% CAGR) with an 11.86% max drawdown that lasts 100 sessions
> to trough and 124 more to recover. Zero margin interest (never runs a
> debit). Never binds the K=5 admit gate frequently enough to force cap
> flag; SHORT lots (209 total) drag realized by $9,034.90 against a LONG
> book that adds $44,172.99.

### R3 `2x-const`

> Same $100k rail with 2× leverage doubles both P&L directions: ending
> $171,111.44 (+71.11%, ≈14.4% CAGR), max DD 20.00%, same DD dates as
> 1x-const (2024-11-11 → 2025-04-08 → 2025-10-06) because the rail-scaled
> equity moves proportionally. Modest carry ($50.31 across 12 sessions)
> when the doubled long-book ($180k cap) forces a temporary cash debit.
> Peak concurrent lots identical to 1x-const (32L / 4S).

### R4 `2x-comp`

> 2× leverage with compounding sizingBase (= running equity × 2) ends at
> $185,350.10 (+85.35%, ≈16.7% CAGR). Compounding buys additional return
> but pays for it: max DD deepens to 27.03% and recovery extends to 166
> sessions past trough (vs 124 for constant-notional). $319.96 carry across
> 80 sessions (peak debit $80,543.44) — margin interest is real but tiny
> relative to return. Also drops 8 SHORT admits vs constant-notional
> variants because compounding shifts sizingBase and re-orders cap-bind
> ranking.

### R5 `spy-bh`

> Buy at 2022-06-29 close ($380.34), hold to 2026-07-10 close ($754.95).
> Ends at $198,493.45 (+98.49%, 18.66% CAGR). Max DD 19.00% peaks 2025-02-19,
> troughs 2025-04-08 (only 34 sessions peak-to-trough), recovers by
> 2025-06-27 (55 sessions). Worst calendar year 2022 (+0.55%). This is the
> apples-to-apples ruler for the three strategy variants above.

**END populated verdict table.**