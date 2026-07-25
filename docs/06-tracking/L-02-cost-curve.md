# L-02 — Entry-Minute Cost Curve (evidence artifact)

**Study opened:** 2026-07-25 19:21:17Z • **Charter:** `docs/06-tracking/charters/L-02-entry-minute-timing.md`
**Method:** R-007 applied ENTRY-side. Per-minute reference-mid = `(minute_bar.high + minute_bar.low)/2`; `cost_bps = 10000 * (fill − mid)/mid`, positive-as-drag for LONG.

## One-line answer
**REJECT — INSUFFICIENT-CORPUS + SUBSTRATE-GAP.** Gates G-1 and G-4 both red; adoption grammar precluded. No config flip proposed.

## Gate readout (frozen grammar, verbatim from charter §2)

| gate | requirement | actual | verdict |
|---|---|---|---|
| G-1 substrate integrity | MIG-167 minute-bar coverage ≥ 95% at (ticker, minute) grain for corpus window | 0 / 62 admits match a `(ticker, admit_minute)` bar in `overshoot_minute_bars` (0.0%). Corpus admit minutes {09:36, 09:55, 11:08, 11:14} ET; MIG-167 substrate holds bars anchored to exit-side R-007 minutes {09:35, 09:40, 09:45}, not entry minutes. | **RED — REJECT** |
| G-2 Δ magnitude | `min(cost_curve[cheapest]) < cost_curve[current] − 5 bps` | N/A — curve uncomputable under G-1 fail | **N/A** |
| G-3 monotone envelope | Monotone across three consecutive minutes surrounding winner | N/A | **N/A** |
| G-4 corpus size | n ≥ 1,000 admits AND ≥ 100 sessions | n = 62 admits across ~13 sessions (2026-07-08 → 2026-07-24). ~16× below admit floor; ~7.7× below session floor. | **RED — REJECT** (extension one quarter back would not reach 1,000 given current admit cadence of K=5/day) |
| G-5 replay-parity | Detector-frozen replay pass on shifted-admit-minute config produces same admit ticker set | N/A — no shifted-minute config proposed | **N/A** |
| G-6 no adverse-selection at open | fwd-1d realized return on cheapest-minute fills ≥ current − 20 bps | N/A | **N/A** |

## Substrate query (verbatim)

```sql
WITH admits AS (
  SELECT lot_id, symbol, side, entry_ts, cost_basis,
    date_trunc('minute', entry_ts) AS admit_minute,
    (entry_ts AT TIME ZONE 'America/New_York')::time AS et_time
  FROM overshoot_lots
  WHERE entry_ts >= '2026-07-01' AND status != 'canceled'
),
matched AS (
  SELECT a.*, ((b.h + b.l)/2.0)::numeric AS mid,
    CASE WHEN a.side='long'
      THEN 10000.0*(a.cost_basis - (b.h+b.l)/2.0)/((b.h+b.l)/2.0)
      ELSE 10000.0*((b.h+b.l)/2.0 - a.cost_basis)/((b.h+b.l)/2.0)
    END AS cost_bps
  FROM admits a
  LEFT JOIN overshoot_minute_bars b
    ON b.ticker=a.symbol AND b.ts=a.admit_minute
)
SELECT to_char(et_time,'HH24:MI') AS minute_et,
       count(*) n, count(mid) n_matched,
       round(avg(cost_bps)::numeric,2) mean_cost_bps
FROM matched GROUP BY 1 ORDER BY 1;
```

### Result (verbatim)

| minute_et | n | n_matched | mean_cost_bps |
|---|---|---|---|
| 09:36 | 12 | 0 | — |
| 09:55 | 14 | 0 | — |
| 11:08 | 18 | 0 | — |
| 11:14 | 18 | 0 | — |

Total n = 62 admits, 0 matched to a same-minute bar in `overshoot_minute_bars`.
Substrate contents: 211,783 bars • 719 tickers • 1,082 days (2022-03-16 → 2026-07-23) • slice_tags {a, b}. The corpus is present in the substrate horizontally but not at the (ticker, admit_minute) grain the entry-side R-007 method requires — SLICE-A/B were anchored to exit-side minutes, not entry minutes.

## Verdict lattice application (charter §4)

> "No minute beats current by 5 bps → REJECT, publish curve as evidence and close."

Adoption grammar is precluded upstream of the curve itself. **Charter closes REJECT-INSUFFICIENT-CORPUS.** Launch-independence clause: paper lane runs unchanged; mid-Aug live launch (ACT-577) proceeds on the current ratified admit-minute policy.

## Re-open conditions
A future rerun becomes viable when BOTH:
1. `overshoot_minute_bars` acquires a slice covering candidate entry minutes {09:35–09:45 ET} for the admitted-ticker set (new MIG or a Turn-C ingest extending SLICE-A/B); AND
2. Cumulative admit count reaches n ≥ 1,000 (at K=5/day cap, ~200 trading sessions post-launch — earliest natural gate is ~2027-Q2 unless K rises).

Filed as **DW-L-02-REOPEN** in the deferred-work register with those two blockers.

## References
- Charter: `docs/06-tracking/charters/L-02-entry-minute-timing.md`
- Substrate MIG: `sql/MIG-167_overshoot_minute_bars.sql` (via ledger)
- Method precedent (exit-side R-007): ACT-576 Phase-1 §B.1 rank-3 lever