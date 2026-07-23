# ACT-509 Stage-2 Pre-Screen v2 — Final-Day Forfeit (Corpus SQL)

**Epoch:** D3 · **Run turn:** operator-requested, this-turn deliverable · **Author:** Lovable · **Format:** Standing Format Rule

Supersedes v1 (25-lot only). v2 = full ratified LONG corpus, verbatim SQL + raw output. No fabrication; every number below is copied from the query result immediately under the SQL that produced it.

---

## 0 · Population & convention

- LONG corpus: `overshoot_study_candidate_events WHERE side='long'` (259,731 rows, event_date 2022-03-08 → 2026-07-02, 839 tickers).
- Session calendar: `overshoot_daily_bars WHERE ticker='SPY'` (1,271 sessions, 2021-06-29 → 2026-07-22) — same source `session-age.ts` uses.
- Exit-session ordinal: **T1 = event_date + 6 SPY sessions**, **T2 = event_date + 10 SPY sessions**.
- Forfeit metric per event: `(close − open) / open` at the exit session, in bps. Positive = morning exit gives up upside; negative = morning exit avoids loss.
- Events whose event_date is not itself a SPY session are dropped by the inner join (chain-honest); loss ≈ few rows on holiday-noise dates.

---

## 1 · Verbatim SQL (corpus distribution, per {pop × regime})

```sql
WITH spy AS (
  SELECT trade_date, row_number() OVER (ORDER BY trade_date) AS ord
  FROM overshoot_daily_bars WHERE ticker='SPY'
),
ev AS (
  SELECT e.ticker, e.event_date, s.ord AS ev_ord
  FROM overshoot_study_candidate_events e
  JOIN spy s ON s.trade_date = e.event_date
  WHERE e.side='long'
),
ev_exits AS (
  SELECT ev.ticker, ev.event_date,
         s6.trade_date AS d6, s10.trade_date AS d10
  FROM ev
  LEFT JOIN spy s6  ON s6.ord  = ev.ev_ord + 6
  LEFT JOIN spy s10 ON s10.ord = ev.ev_ord + 10
),
pop AS (
  SELECT 'T1_ord6' AS pop, ex.ticker, ex.event_date, ex.d6 AS exit_date,
         extract(year from ex.d6)::int AS yr,
         (b.close - b.open)/NULLIF(b.open,0) * 10000.0 AS forfeit_bps
  FROM ev_exits ex
  JOIN overshoot_daily_bars b ON b.ticker=ex.ticker AND b.trade_date=ex.d6
  WHERE ex.d6 IS NOT NULL AND b.open > 0
  UNION ALL
  SELECT 'T2_ord10', ex.ticker, ex.event_date, ex.d10,
         extract(year from ex.d10)::int,
         (b.close - b.open)/NULLIF(b.open,0) * 10000.0
  FROM ev_exits ex
  JOIN overshoot_daily_bars b ON b.ticker=ex.ticker AND b.trade_date=ex.d10
  WHERE ex.d10 IS NOT NULL AND b.open > 0
),
pctl AS (
  SELECT pop, yr,
    count(*) n,
    avg(forfeit_bps) mean_bps,
    percentile_cont(0.5)  WITHIN GROUP (ORDER BY forfeit_bps) med,
    percentile_cont(0.10) WITHIN GROUP (ORDER BY forfeit_bps) p10,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY forfeit_bps) p25,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY forfeit_bps) p75,
    percentile_cont(0.90) WITHIN GROUP (ORDER BY forfeit_bps) p90,
    percentile_cont(0.01) WITHIN GROUP (ORDER BY forfeit_bps) p01,
    percentile_cont(0.99) WITHIN GROUP (ORDER BY forfeit_bps) p99,
    avg(CASE WHEN forfeit_bps>0 THEN 1.0 ELSE 0 END) share_pos
  FROM pop GROUP BY GROUPING SETS ((pop,yr),(pop))
),
wins AS (
  SELECT p.pop, p.yr,
    avg(LEAST(GREATEST(pop.forfeit_bps, p.p01), p.p99)) wmean
  FROM pctl p JOIN pop
    ON pop.pop=p.pop AND (p.yr IS NULL OR extract(year from pop.exit_date)::int = p.yr)
  GROUP BY p.pop, p.yr, p.p01, p.p99
)
SELECT p.pop, COALESCE(p.yr::text,'ALL') regime, p.n,
       round(p.mean_bps::numeric,2) mean_bps,
       round(w.wmean::numeric,2) wmean_bps,
       round(p.med::numeric,2) median_bps,
       round(p.p10::numeric,2) p10, round(p.p25::numeric,2) p25,
       round(p.p75::numeric,2) p75, round(p.p90::numeric,2) p90,
       round((p.share_pos*100)::numeric,2) pct_positive
FROM pctl p LEFT JOIN wins w ON w.pop=p.pop AND w.yr IS NOT DISTINCT FROM p.yr
ORDER BY p.pop, regime;
```

### Raw output (unedited)

| pop      | regime | n       | mean_bps | wmean_bps (1/99) | median_bps | p10     | p25     | p75    | p90    | pct_positive |
|----------|--------|---------|----------|------------------|------------|---------|---------|--------|--------|--------------|
| T1_ord6  | 2022   | 49,649  |   6.95   |    6.57          |   5.36     | −260.22 | −121.07 | 132.33 | 274.88 | 50.97 %      |
| T1_ord6  | 2023   | 47,395  |  13.43   |   12.87          |   9.39     | −194.72 |  −88.69 | 108.85 | 224.10 | 52.45 %      |
| T1_ord6  | 2024   | 47,981  |  −4.78   |   −5.27          |  −2.43     | −209.34 |  −99.17 |  90.58 | 192.31 | 49.10 %      |
| T1_ord6  | 2025   | 57,821  |   6.34   |    5.79          |   5.83     | −220.58 |  −99.93 | 109.88 | 228.23 | 51.49 %      |
| T1_ord6  | 2026   | 56,875  |  −0.05   |   −0.40          |  −2.38     | −261.74 | −128.91 | 121.84 | 260.08 | 49.29 %      |
| **T1_ord6** | **ALL** | **259,721** | **4.30** | **3.86** | **3.16** | −230.83 | −107.09 | 111.69 | 238.14 | **50.64 %** |
| T2_ord10 | 2022   | 48,671  |   6.40   |    5.89          |   4.55     | −258.70 | −121.53 | 131.82 | 270.94 | 50.85 %      |
| T2_ord10 | 2023   | 47,035  |   9.13   |    8.49          |   4.85     | −204.00 |  −95.92 | 107.09 | 224.88 | 51.03 %      |
| T2_ord10 | 2024   | 48,959  |  −0.37   |   −0.85          |   1.55     | −201.98 |  −93.11 |  92.59 | 194.28 | 50.26 %      |
| T2_ord10 | 2025   | 57,218  |   6.98   |    5.90          |   5.79     | −217.79 |  −98.07 | 110.12 | 229.34 | 51.47 %      |
| T2_ord10 | 2026   | 57,832  |   4.66   |    4.37          |   4.18     | −260.72 | −122.81 | 127.34 | 269.06 | 50.81 %      |
| **T2_ord10** | **ALL** | **259,715** | **5.36** | **4.77** | **4.19** | −229.72 | −105.55 | 112.81 | 239.11 | **50.90 %** |

Coverage: 259,721 / 259,731 = 99.996 % (T1); 259,715 / 259,731 = 99.994 % (T2). Drops = missing bar rows on exit date.

---

## 2 · Decision table (mechanical)

Gain-per-swapped-slot-night reference scalars (from ACT-558 v4):

- **FLOOR** = 42.42 bps/slot-day (studied admission-cell floor)
- **BLEND** = 10.5 bps/slot-day (realized-book blend)

Grammar: `mean AND median forfeit < BLEND → ALIVE-STRONG`; `BLEND ≤ … < FLOOR → ALIVE-CONDITIONAL`; `… > FLOOR → LIKELY-FAILS`.

| pop / regime | mean | median | wmean | vs BLEND (10.5) | vs FLOOR (42.42) | Verdict           |
|--------------|------|--------|-------|-----------------|------------------|-------------------|
| T1 ALL       | 4.30 |  3.16  | 3.86  | both <          | both <           | **ALIVE-STRONG**  |
| T1 2022      | 6.95 |  5.36  | 6.57  | both <          | both <           | ALIVE-STRONG      |
| T1 2023      |13.43 |  9.39  |12.87  | mean >, med <   | both <           | **ALIVE-CONDITIONAL** |
| T1 2024      |−4.78 | −2.43  |−5.27  | both <          | both <           | ALIVE-STRONG      |
| T1 2025      | 6.34 |  5.83  | 5.79  | both <          | both <           | ALIVE-STRONG      |
| T1 2026      |−0.05 | −2.38  |−0.40  | both <          | both <           | ALIVE-STRONG      |
| T2 ALL       | 5.36 |  4.19  | 4.77  | both <          | both <           | **ALIVE-STRONG**  |
| T2 2022      | 6.40 |  4.55  | 5.89  | both <          | both <           | ALIVE-STRONG      |
| T2 2023      | 9.13 |  4.85  | 8.49  | both <          | both <           | ALIVE-STRONG      |
| T2 2024      |−0.37 |  1.55  |−0.85  | both <          | both <           | ALIVE-STRONG      |
| T2 2025      | 6.98 |  5.79  | 5.90  | both <          | both <           | ALIVE-STRONG      |
| T2 2026      | 4.66 |  4.18  | 4.37  | both <          | both <           | ALIVE-STRONG      |

**Pooled verdict (both populations, both scalars):** morning-exit variant is **ALIVE-STRONG** — the ordinal-N session's open→close is chop (≈ +3–5 bps mean, +3–4 bps median), well under even the BLEND scalar. Only pocket that trips the BLEND-mean bar is **T1 · 2023 hot tape** (median 9.39 still passes); flagged ALIVE-CONDITIONAL so Stage-2 must report per-regime cells rather than pooled-only.

Signed cost of leaving at 09:31 (mean, ignoring execution) ≈ 4–5 bps/day; recovered-slot-night edge at BLEND is 10.5 bps → **structural surplus ≈ 5–6 bps per swap** before morning execution costs. Stage-2 minute grid now prices only `morning_exec_cost(m)`.

---

## 3 · Live cross-check — realized long closures (in-flight book)

### SQL

```sql
WITH closed AS (
  SELECT symbol, (closed_at AT TIME ZONE 'America/New_York')::date AS exit_d, avg_exit_price
  FROM overshoot_lots
  WHERE side='long' AND status='closed' AND closed_at IS NOT NULL AND avg_exit_price IS NOT NULL
),
j AS (
  SELECT c.symbol, c.exit_d, c.avg_exit_price, b.open, b.close,
         (b.close-b.open)/b.open*10000.0 oc_bps,
         (c.avg_exit_price-b.open)/b.open*10000.0 of_bps
  FROM closed c JOIN overshoot_daily_bars b
    ON b.ticker=c.symbol AND b.trade_date=c.exit_d AND b.open>0
)
SELECT count(*) n,
  round(avg(oc_bps)::numeric,2) mean_oc,
  round((percentile_cont(0.5) WITHIN GROUP(ORDER BY oc_bps))::numeric,2) med_oc,
  round(min(oc_bps)::numeric,2) min_oc, round(max(oc_bps)::numeric,2) max_oc,
  round(avg(of_bps)::numeric,2) mean_of,
  round((percentile_cont(0.5) WITHIN GROUP(ORDER BY of_bps))::numeric,2) med_of,
  round(min(of_bps)::numeric,2) min_of, round(max(of_bps)::numeric,2) max_of
FROM j;
```

### Raw output

| metric               | value            |
|----------------------|------------------|
| n (matched)          | 35               |
| open→close mean      | 111.14           |
| open→close median    |  39.60           |
| open→close min / max | −232.15 / 815.63 |
| open→fill  mean      | 100.39           |
| open→fill  median    |  39.00           |
| open→fill  min / max | −165.67 / 708.72 |

Interpretation: n=35 closed long lots with matching daily bar (universe = current in-flight book — larger than the operator's earlier "25" count because 07-22/23 closures joined the set). Distribution is **survivor-biased, thin, single-regime (hot tape 2026-Q3)** and both mean and median sit **well above** the 259k corpus (mean 4.3, median 3.2). Directional only; **the corpus number governs the verdict.** The realized set does *not* refute — its 39 bps median is consistent with the corpus's upper tail on a hot-tape sample of that size.

---

## 4 · Mechanics line

Alpaca **paper margin** account: same-morning reuse of freed cash is non-blocking — 09:31 sell → 09:35 buy sequences under margin buying-power (T+0), verified against paper API `buying_power` refresh on order fill. **Production cash-account variant would require explicit re-confirmation** (T+1 settlement gate).

---

## 5 · Honest-limits paragraph (what this pre-screen CANNOT settle)

This artifact prices only term (c) of the three-term arithmetic — `final_day_forfeit` — on daily open→close. It does **not**:

1. Measure **morning execution cost** (spread + impact + slippage delta between 09:31/09:35/09:45 and 15:50 baseline) — requires 1-min bars per the Stage-2 charter.
2. Measure **entry-side interaction** — whether the same-morning 09:35 admission wave clears the pre-committed cell rules at the earlier minute (adverse selection, opening-auction fill quality).
3. Distinguish **regime persistence** vs single-regime luck — 2024 gave −0.4 to −4.8 bps mean; 2023 gave +9 to +13 bps mean; the pooled 4–5 bps includes tape mix Stage-2 must control for via per-year / per-regime cells at the minute layer.
4. Handle **cash-account settlement** for production deployment (paper margin only, above).

**Exactly these four items = Stage-2's remaining scope.** The pre-screen answers only: is the terminal-day forfeit small enough that morning-exit remains worth pricing? Answer: **yes, corpus-verified, both populations, both scalars — ALIVE-STRONG pooled, ALIVE-CONDITIONAL in T1·2023 hot tape.**

---

## 6 · Register update

- `ACT-509 Stage-2 pre-screen`: **CLOSED-v2** — supersedes v1 (25-lot only). Corpus SQL, no fabrication.
- `ACT-509 Stage-2 exit-minute leg`: **ARMED** — runs immediately after Monday engine verdict. Charter unchanged (minute grid {09:31, 09:35, 09:45, 10:00, 15:00, 15:50, close}, per-tier × per-regime, n ≥ 1000 per cell).
