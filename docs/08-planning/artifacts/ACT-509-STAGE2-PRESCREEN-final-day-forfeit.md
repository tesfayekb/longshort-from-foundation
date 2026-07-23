# ACT-509 Stage-2 — Pre-Screen: `final_day_forfeit` distribution

> **Filed:** 2026-07-23 (same turn as charter amendment)
> **Mode:** INVESTIGATION only. Read-only SQL on existing daily bars. Zero new data.
> **Purpose:** Answer TONIGHT — before Monday's engine verdict — whether the operator's same-day-earlier morning-exit variant is priced-alive or priced-dead by the ordinal-10 open→close distribution alone.

## Pre-committed decision rule (binding, filed BEFORE compute)

> If corpus mean `final_day_forfeit` > **~+20 bps** → forfeit swamps the $10.60 (floor) / $4.05 (blend) per-slot-night gain → **variant likely fails**; report and stop cheaply.
> If ≈ 0 or negative → final day is chop, not recovery → **variant ALIVE**; Stage-2 minute grid prices only the execution term.

## Verbatim SQL — corpus stats

```sql
WITH ranked AS (
  SELECT e.event_id, e.ticker, e.event_date, e.side, e.momentum_quintile,
         b.trade_date, b.open, b.close,
         ROW_NUMBER() OVER (PARTITION BY e.event_id ORDER BY b.trade_date) AS td_ord
  FROM overshoot_study_candidate_events e
  JOIN overshoot_daily_bars b
    ON b.ticker = e.ticker
   AND b.trade_date > e.event_date
   AND b.trade_date <= e.event_date + INTERVAL '25 days'
),
d10 AS (
  SELECT event_id, side, momentum_quintile, trade_date, open, close,
         (close - open) / NULLIF(open,0) AS oc_ret
  FROM ranked WHERE td_ord = 10 AND open > 0
)
SELECT ... FROM d10 [+ winsorized 1/99];
```

## Corpus result (n = 523,646 events; 2022-03-08 → 2026-07-02)

| Bucket | n | mean bps | median bps | winsorized 1/99 mean bps |
|---|---:|---:|---:|---:|
| ALL | 523,646 | **+3.57** | +2.94 | **+3.05** |
| side=long | 259,715 | +5.36 | +4.19 | +4.66 |
| side=short | 263,931 | +1.81 | +1.64 | +1.46 |
| momentum_quintile=1 (low) | 116,618 | +6.76 | +1.62 | — |
| momentum_quintile=2 | 89,962 | +3.42 | +2.70 | — |
| momentum_quintile=3 | 81,734 | +3.64 | +3.34 | — |
| momentum_quintile=4 | 81,997 | +3.72 | +4.73 | — |
| momentum_quintile=5 (high) | 106,926 | +3.15 | +5.02 | — |

**Regime (winsorized 1/99 mean by trade year):**

| Year | n | mean bps |
|---|---:|---:|
| 2022 | 90,448 | +3.61 |
| 2023 | 95,265 | **+6.66** |
| 2024 | 102,571 | **−0.12** |
| 2025 | 116,167 | +4.51 |
| 2026 (YTD) | 119,195 | +1.03 |

## Live 25-lot cross-check

Applied same ordinal-10 open→close measurement to the realized closed-lot ledger (`overshoot_lots WHERE closed_at IS NOT NULL`), keyed on `entry_ts::date` as event anchor.

| Metric | Value |
|---|---:|
| Total closed lots | 46 |
| Lots with ordinal-10 bar present | 18 |
| Mean bps | +78.68 |
| Median bps | +49.76 |
| Min bps | −578.58 |
| Max bps | +434.78 |

**Honest caveats on live cross-check:**
- Thin sample (n=18); no distributional weight.
- Survivor-cohort bias: these lots survived to ordinal-10, so tape-favored names are over-represented.
- Hot-tape era: closed lots concentrate in 2026-07, a run of positive continuation.
- Corpus (n=523,646) is the primary signal; live is CROSS-CHECK ONLY, flagged as directional-not-authoritative.

## Verdict against pre-committed rule

**Corpus winsorized ALL: +3.05 bps.** Long: +4.66. Short: +1.46. All well under the +20 bps failure threshold. Ordinal-10 open→close is **CHOP not RECOVERY** at scale.

**→ VARIANT ALIVE.**

Stage-2 minute grid (elevated, sequenced immediately after Monday engine verdict) now needs to price only:

```text
net(m) = redeploy_gain − morning_exec_cost(m) − final_day_forfeit
       ≈ ($10.60 floor / $4.05 blend per slot-night) − morning_exec_cost(m) − ~$3.05×qty/slot
```

(final_day_forfeit converted to $ at Stage-2 time using per-lot notional; corpus-level bps translation is approximate here.)

## Regime caveat (binding forward)

2024 flat (−0.12 bps) and 2023 hot (+6.66 bps) show clear tape-dependence. Stage-2 minute grid MUST report per-regime cells (year buckets at minimum, VIX/regime-tag preferred if available). Adoption decision cannot use single-regime cell.

## Same-day reentry mechanics (charter §"Same-day reentry mechanics")

**Alpaca paper/margin:** same-morning 09:31 exit → 09:35 admission is non-blocking (T+0 buying power via margin; T+1 settlement does not block same-session purchases). Production cash-account variant would require explicit re-confirmation.

## Sequencing

Pre-screen delivered TONIGHT. Charter amended same PR. Register reordered same PR. Full Stage-2 minute grid runs immediately after Monday engine verdict. Verdict target: within days of engine table.

## Cross_ref

- ACT-509 Stage-2 charter (this amendment)
- ACT-558 v4 (priced prize; family closes on Stage-2 verdict)
- ACT-515 (engine — gating predecessor)
- Ratified corpus `1888e113`, detector `a026dc51`