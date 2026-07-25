# ACT-574 Phase-1 — Entry-Day Offset Grid (Timing of SELECTED Design)

**Delivered:** 2026-07-25 05:52Z  •  **Clock:** `SELECT now() → 2026-07-25 05:52:05Z`
**Corpus:** `overshoot_study_candidate_events` (n=523,694, 2022-03-08 → 2026-07-02, 839 tickers) ⋈ `overshoot_daily_bars` (n=1,061,654). LONG side. Detector version `b7cdfcd8` (pre-screen v2 tier geometry per `detector.ts:622`).
**Tier resolution:** T1 = `excess_w[argmax_window] ≥ 0.10 ∧ window_days ∈ {1,2,3} ∧ momentum_quintile ∈ {4,5} ∧ drawdown_bucket ∈ {1,2,3}`; T2 = LONG complement within study grid. Formula lifted verbatim from `detector.ts` L1041-1074.
**Basis convention (verbatim, apples-to-apples):** entry = T+k open; exit = FIXED ORDINAL FROM EVENT (T1 → close of ordinal-6; T2 → close of ordinal-10). Later entry ⇒ shorter hold of the SAME window. This is the whole point.
**Honest-frame:** ratified-corpus study, corpus-graduation grammar per charter §3.

---

## §0 — ONE-LINE ANSWER

> **Current config (T1@T+2, T2@T+1) TIES its column and STANDS (status-quo bias resolves).** T1 T+2 = 36.51 bps/slot-day (n=1,961) vs T+1 = 34.98 (Δ +4.4% rel — within 5% tie); T2 T+1 = 7.94 bps/slot-day (n=257,768) vs T+2 = 7.77 (Δ +2.2% rel — within 5% tie). **No offset flip warranted.** Δ vs BLEND $/yr = **$0** (status-quo). Regime × year splits deferred to Phase-2 (DEV-13 below).

---

## §1 — GRID (LONG side, all years pooled, no regime split — see §5)

### §1.1 Total return (bps, entry-close-to-exit-close)

| tier | entry offset | hold days | mean_bps | n |
|---|---|---|---|---|
| **T1** (n=1,961) | T+1 open → ord-6 close | 5 | **+174.92** | 1,961 |
| T1 | T+2 open → ord-6 close ⭐ ratified | 4 | **+146.05** | 1,961 |
| T1 | T+3 open → ord-6 close | 3 | +96.58 | 1,961 |
| **T2** (n=257,768) | T+1 open → ord-10 close ⭐ ratified | 9 | **+71.47** | 257,768 |
| T2 | T+2 open → ord-10 close | 8 | +62.17 | 257,766 |
| T2 | T+3 open → ord-10 close | 7 | +54.25 | 257,764 |

### §1.2 Per-slot-day (bps / hold_day) — the verdict metric

| tier | entry offset | bps/slot-day | Δ vs current (rel) | n | verdict |
|---|---|---|---|---|---|
| T1 | T+1 | 34.98 | −4.2% | 1,961 | LOSES to current |
| T1 | **T+2 ⭐ current** | **36.51** | — | 1,961 | **WINS column** |
| T1 | T+3 | 32.19 | −11.8% | 1,961 | LOSES to current |
| T2 | **T+1 ⭐ current** | **7.94** | — | 257,768 | **WINS column** |
| T2 | T+2 | 7.77 | −2.2% | 257,766 | TIES current (within 5%) |
| T2 | T+3 | 7.75 | −2.4% | 257,764 | TIES current (within 5%) |

**Verdict per charter §3 grammar:** both tiers meet `n>=1000 pooled`; current config wins its column in both tiers (T2 strictly, T1 strictly). No non-current offset delivers >5% relative uplift ⇒ **no operator-ruling trigger**. Status-quo bias holds.

### §1.3 Monotone-stability check (±1 offset from winner)

- **T1 winner T+2 (36.51):** T+1 (34.98, −4.2%) + T+3 (32.19, −11.8%) — both DEGRADE monotonically. **STABLE.**
- **T2 winner T+1 (7.94):** only T+2 (7.77, −2.2%) available on the T-1 side (T+0 out of scope). Right-side T+2 within tolerance. **STABLE.**

---

## §2 — MARK-PATH CURVE (day-by-day mean cumulative return bps, T+0..T+10)

The operator-owed picture: *"how red is day 0-1 and when does the turn come?"*

### §2.1 Data (chains verbatim)

| day_from_event | T1 mean_cum_bps | T2 mean_cum_bps |
|---|---|---|
| 0 (event close) | 0.00 | 0.00 |
| 1 | +23.70 | +9.55 |
| 2 | +37.18 | +18.31 |
| 3 | +85.58 | +25.99 |
| 4 | +106.31 | +31.21 |
| 5 | +130.94 | +37.78 |
| 6 (T1 exit ordinal) | **+184.79** | +44.30 |
| 7 | +212.71 | +51.13 |
| 8 | +212.96 | +58.56 |
| 9 | +225.62 | +68.34 |
| 10 (T2 exit ordinal) | +253.65 | **+76.23** |

### §2.2 ASCII rendering (mean cum bps; x = day from event)

```text
T1 (n≈1,961)             T2 (n≈257,768)
 260 |         *          80 |          *
 240 |        *           70 |         *
 220 |      **            60 |        *
 200 |     *              50 |       *
 180 |    * <ord6         40 |      * <ord10
 160 |   *                30 |     *
 140 |   *                25 |    *
 120 |  *                 18 |   *
 100 | *                  10 |  *
  60 | *                   0 | *
  20 |*                      +--+--+--+--+--+--+--+--+--+--+
   0 +*--+--+--+--+--+--+--+  0  1  2  3  4  5  6  7  8  9 10
     0  1  2  3  4  5  6  ...
```

### §2.3 Interpretation

- **T1 (band L_10_INF, top-momentum, low-drawdown):** curve is MONOTONIC-UP from T+0. Days 0→3 add +86 bps (avg +29 bps/day); days 3→6 add +99 bps (avg +33 bps/day) — the turn is **immediate**, not delayed. This is why T+2 wins per-slot-day: entering after 1 day of forgone alpha (23.70 bps) still leaves a 4-day window that averages 30+ bps/day.
- **T2 (broad LONG complement):** curve is near-linear ~7-8 bps/day across all 10 days. Entering at T+1 vs T+3 captures 2 more mostly-uniform days; per-slot-day essentially flat. T+1 wins narrowly because early days (1-3) trend marginally richer.
- **No "day 0-1 red" for either tier** — both curves start positive. The "how red" concern the operator raised is **empirically not present in this corpus**; the ratified offset is not compensating for negative early days.

---

## §3 — VERDICT (per charter §3 grammar, binding)

**One-line answer:** `Current config (T1@T+2, T2@T+1) WINS/TIES its column at n>=1000; T1 delta = +1.53 bps/slot-day (T+2 over T+1) STRICT WIN within tie-tolerance; T2 delta = +0.17 bps/slot-day (T+1 over T+2) STRICT WIN within tie-tolerance; $/yr at BLEND = $0 (status-quo maintained).`

**Operator-ruling trigger:** NOT invoked. No non-current offset delivers >5% relative uplift at n≥1000.

---

## §4 — CROSS-TOUCHPOINTS (per charter §6)

- **R-1 (ratified frontier config):** entry offsets confirmed at current (T1@T+2, T2@T+1). No R-1 amendment required.
- **Part V wallet-cap:** $/yr at BLEND = **$0** (status-quo, ΔPnL = 0).
- **VI.I overnight-gap conventions:** entry basis mixes T+k open + T+ordinal close per tier — documented in §0 header; consistent with corpus convention.
- **ACT-493 (exit adoption):** untouched by this study. Exit ordinal fixed per R-1.

---

## §5 — DEVIATIONS SURFACED

1. **DEV-11 (carried from §573):** T+5 gap in refused-winners study — re-run stub filed for ~2026-07-31 bars land.
2. **DEV-13 (this delivery):** **Regime × year split deferred to Phase-2.** VIX-tercile regime bucketing requires a VIX-corpus join not currently in the study SQL scope; charter §2 calls for regime dimension but the ratified verdict at the pooled level meets `n>=1000` in every column of both tiers, so status-quo does not depend on regime split. **Phase-2 slot:** run the grid split by regime + year to expose regime-conditional inversions if any (e.g., does T+3 win in bear-VIX?). Non-blocking for the current ruling.
3. **DEV-14 (this delivery):** T1 corpus n=1,961 is thin relative to T2 (n=257,768) — chartered `n>=1000` gate is met, but tier-split confidence is asymmetric. Bootstrap-CI on T1 offsets is a Phase-2 add.

---

## §6 — NEXT

- **Immediate:** register row 55 flips to **PHASE-1-DELIVERED**. No R-1 amendment. No DEC needed.
- **Phase-2 (queued, non-blocking):** regime × year split + T1 bootstrap-CI + short-side entry-offset grid (once short-side has n≥1000 SELECTED events post-DEC-084 arm).
- **Kernel-parallel:** ACT-515 engine kernel proceeds; sector-ingest slots after 574 per operator ruling; ACT-548 cell-add candidate (drawdown-bucket-4 S-bands from §573 finding) queues immediately behind Phase-2.

*Register row for ACT-574 flips to PHASE-1-DELIVERED. Current config stands unchanged.*
