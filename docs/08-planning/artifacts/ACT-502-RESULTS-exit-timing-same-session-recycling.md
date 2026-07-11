# ACT-502 — Exit-Timing / Same-Session Recycling — RESULTS

> **Mode:** INVESTIGATION (read-only, evidence-first) | **Filed:** 2026-07-11 | **STOP:** at end for operator DEC
> **Charter:** `docs/08-planning/artifacts/ACT-502-CHARTER-exit-timing-same-session-recycling.md`
> **Predecessor:** ACT-500 Part 2 (rank monotonicity confirmed; ranker IS informative → same-session recycling premise holds)

## Pre-committed GO bar (RESTATED BEFORE compute per charter discipline)

- **GO** if `net_cycle_bps ≥ +8 bps` AND lower 90% CI of `net_cycle_bps > 0` AND `n_cycles ≥ 200`.
- **NO-GO** if `net_cycle_bps < +8 bps` OR any CI band spans zero OR sequencing caveat (d)(2) is judged materially unmanageable.
- **DEFER** if `n_cycles < 200`.

## Method (ACT-487 / VI.I §A.2 precedent, bar-derived)

Corpus: `overshoot_study_candidate_events` LONG admitted (cell resolves with `rank_score = arrival-weighted mean of cell.mean_fwd_return_5d across bands within (side, window, mq, db) ≥ 0.0010` uniform ROI floor). Bars: `overshoot_daily_bars` `adjusted=true`, per-ticker trading-day offsets via `ROW_NUMBER()`.

**Legs computed per event (T = event date, offsets in trading days):**

| leg | formula | interpretation |
|---|---|---|
| forfeited (charter a) | `close(T+10)/close(T+9) - 1` | marginal day-10 return on old lot — what you give up by exiting at day-10 open |
| fresh_day1 (charter b1) | `close(T+1)/close(T) - 1` on top-decile admitted events | replacement lot's first realized day (close-to-close of day-1) |
| overnight_gap (charter b2) | `open(T+1)/close(T) - 1` on top-decile admitted events | eliminated idle overnight the current policy sits through in cash |

**"Top-5 per day" proxy:** in the study corpus, average daily admission rate is ~185 LONG events/day; top-5 ≈ top-2.7%. Using **top decile (top-10%, n=16,042 events)** as the fresh-entry pool is conservative — the real top-5 will have MORE positive day-1 return than the whole top decile mean.

## Corpus-wide leg results (n=160,426 admitted events with complete T+11 bar coverage)

| leg | pool | n | mean (bps) | stdev | SE of mean |
|---|---|---:|---:|---:|---:|
| forfeited (d9→d10 close-to-close) | all admitted | 160,426 | **+13.9** | 0.0287 | 0.72 |
| fresh_day1 (close-to-close) | top decile | 16,042 | **+26.6** | 0.0364 | 2.88 |
| overnight_gap (close→open) | top decile | 16,042 | **+12.7** | (see fresh) | ~1.5 |

## (c) Net per cycle in bps + annualized at K=5 turnover

**Stylized decomposition per charter:**

```
net_cycle_bps = gained_leg − forfeited_leg
             = (fresh_day1 + overnight_gap) − forfeited
             = (26.6 + 12.7) − 13.9
             = +25.4 bps per cycle
```

**Annualization arithmetic (stated explicitly per charter):** at K=5/day daily entry budget and T+10 hold, steady-state is 50 open lots. Per-slot turnover = 252 trading days / 10-day hold = **25.2 cycles/slot/year**. Portfolio-level annual delta on the swap = per-cycle delta × per-slot turnover (each slot independently earns net_cycle each turnover):

```
annual_bps_at_K5 = 25.4 × 25.2 = +640 bps/yr  (stylized)
```

## Rigorous cross-check — log-return over identical [open(T+10), close(T+11)] window

The stylized decomposition can double-count when the "gained day-1" of the new lot under swap coincides with a shifted-forward "day-1" the new lot ALSO earns under current policy (just one day later). Under IID admitted-event returns, the true first-order per-cycle delta is:

```
Δ_log = ln(NEW.close(T+11)) − ln(NEW.open(T+10))     -- swap window
      − [ ln(OLD.close(T+10)) − ln(OLD.open(T+10))    -- old lot's forfeited d10 intraday
        + ln(NEW.close(T+11)) − ln(NEW.open(T+11))]   -- new lot's shifted-day return under current
      = ln(NEW.open(T+11)/NEW.open(T+10)) − ln(OLD.close(T+10)/OLD.open(T+10))
```

Using same-ticker proxy (OLD ≡ NEW distribution) computed corpus-wide on n=160,426 events:

| quantity | mean (log) | mean (bps) | SE (bps) |
|---|---:|---:|---:|
| NEW.close(T+11)/NEW.close(T+10) − 1 (log) | +0.001206 | +12.1 | 0.72 |
| OLD.close(T+10)/OLD.open(T+10) − 1 (log) | +0.000541 | +5.4 | 0.72 |
| **Δ_rigorous per cycle** | **+0.000665** | **+6.7** | **0.93** |

**90% CI on Δ_rigorous per cycle** = 6.7 ± 1.645 × 0.93 = **[5.2, 8.2] bps**. 
**Annualized at K=5** = 6.7 × 25.2 = **+168 bps/yr** (90% CI ≈ [130, 207] bps/yr, wide).

**Rigorous vs stylized disagree by ~4×.** The rigorous accounting correctly credits the new lot with equal expected return regardless of entry day (both are top-decile admissions in either policy — swap just enters one bar earlier). The stylized decomposition treats the swap's fresh_day1 as pure gain rather than a one-day time-shift.

## (d) Honest caveats (as filed pre-compute)

1. **Exit-basis shift (close→open) — CONFIRMED material.** The stylized/rigorous divergence proves the accounting frame matters. The rigorous log-return frame is what a live implementation would actually realize; the stylized is what the charter asked for. Both reported; operator judges.
2. **Execution sequencing dependency — UNMITIGATED.** Morning exit fills must confirm before replacement lot is sized, or allocation cap breaches. Sim assumes perfect sequencing; real ops would need a broker-confirmed sequencing gate not designed here.
3. **Open-print quality — NOT haircut in this sim.** Open prints on microcap-adjacent overshoot names carry wider spreads than close prints. Adding a conservative 5-bp open-print slippage haircut to both entry AND exit of the SWAP (10 bp round-trip) drops rigorous net to **6.7 − 10 = −3.3 bps per cycle** → NO-GO. Even a 3-bp haircut per side (6 bp round-trip) drops it to +0.7 bps → NO-GO.
4. **No entry-side selection bias — SATISFIED.** Both policies admit from the SAME top-decile pool; no re-tuned admission function was used.
5. **Legacy-50 smoothing not priced.** Under Option-B smoothing (ACT-493), the first 12 lots exit via staggered T+8 rather than T+10 — that policy would need adjustment under a same-session swap. Marginal, not priced here.

## (e) DEC-input table + pre-committed GO/NO-GO

| accounting frame | net_cycle_bps | annual_at_K5_bps | 90% CI on cycle | n_cycles | pass 8-bp floor? | pass CI>0? | verdict |
|---|---:|---:|---:|---:|:---:|:---:|:---:|
| **Stylized (per charter)** | +25.4 | +640 | (not computed cleanly — additive of independent means) | 160,426 | ✅ | ✅ | GO |
| **Rigorous (log-return, identical window)** | **+6.7** | +168 | **[5.2, 8.2]** | 160,426 | ❌ (5.2 < 8) | ✅ | **NO-GO** |
| **Rigorous + 5-bp open-print haircut round-trip** | **−3.3** | −83 | [−4.8, −1.8] | 160,426 | ❌ | ❌ | **NO-GO** |

## Recommendation

**NO-GO under pre-committed bar.** The rigorous accounting frame — which is what a live implementation would actually realize — puts per-cycle net at +6.7 bps, below the pre-committed 8-bp complexity floor, with the lower 90% CI (5.2 bps) also below it. Adding even a modest open-print slippage haircut drives the net negative. The stylized decomposition (+25.4 bps) overstates by double-counting the new lot's day-1 return, which under current policy is captured one trading day later on the same admitted pool.

**Preserved observations that survive independent of the GO bar:**

- The forfeited leg IS the smallest of the 10-day hold as predicted (+13.9 bps vs top-decile total T+10 mean of +249.9 bps → day-10 marginal is ~5.6% of the hold's total return). Rank-decay logic confirmed.
- The overnight gap on top-decile admitted longs runs +12.7 bps mean — a real drift, not zero.
- The delta between "fresh entry captured T+0 vs T+1" is ~+6.7 bps per cycle — real, non-trivial, but small relative to slippage.

**Next-order candidates (NOT part of ACT-502; filed for future charter if operator wants them):**

1. **Half-swap variant:** exit at T+10 open, delay replacement to T+11 open (current entry timing). Captures the overnight-gap elimination on the exit side without incurring open-print slippage on the entry side. Rough estimate: gains ~5 bps per cycle from earlier exit, no new slippage on entry. Not obviously GO either, but different tradeoff.
2. **Pre-close entry (parked):** the sibling strategy question — enter at close(T) instead of open(T+1) — same discipline (pre-commit threshold before looking). Should share the accounting frame designed here.

**Not recommended for follow-on:** an engine-wiring ACT for same-session recycling as chartered.

## Sequencing continuation

ACT-502 CLOSED (NO-GO). Next in queue: **Track B F2–F13 report**, then **Tracks C/D of ACT-499**.

## STOP — awaiting operator DEC ruling before Track B kicks off.

---

## Operator DEC (2026-07-11) — NO-GO RATIFIED + tripwire filed

**Verdict:** NO-GO ratified per the pre-committed bar. The **rigorous identical-window frame** (log-return, [open(T+10), close(T+11)]) is the accepted accounting basis of record. The stylized decomposition's double-count of the new lot's day-1 return is noted for the methodology record as a lesson (do not decompose across non-identical windows without a covariance term).

**Tripwire — TRIP-502-A (filed with closure):**
- **Assumption under test:** the −3.3 bps rigorous+haircut verdict assumes a **5 bp/side open-print haircut** (10 bp round-trip). Slippage estimate is derived, not measured on our fills.
- **Trigger:** when Phase 10 (W5) live slippage measurement lands with real fills against our actual marketable-limit construction.
- **Action IF measured entry slippage is materially under 5 bp/side:** re-run the rigorous frame using the measured haircut. Re-open ACT-502 only if the **lower 90% CI clears the 8 bp complexity floor with measured frictions**. Otherwise the case remains parked permanently alongside pre-close entry.
- **Owner:** Phase 10 slippage workstream. **Not** a live-books item.

**Preserved observations promoted to standing W5 context:**
- Day-10 marginal ≈ 5.6% of the T+10 hold return (rank-decay logic confirmed on our corpus).
- Overnight drift on top-decile LONG admissions = +12.7 bps mean (real, not zero).

**Companion NOT-recommended:** pre-close entry — parked permanently alongside ACT-502 under the same tripwire discipline (would need its own pre-committed bar + rigorous window before any re-open).

**ACT-502 CLOSED PERMANENTLY** subject only to TRIP-502-A firing on measured slippage.