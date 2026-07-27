# ACT-580 M-2 — SIGNAL-SUM DIAGNOSTIC (diagnostic class, zero gate authority)

**SELECT now():** 2026-07-27 03:29:41 UTC

**HEADER VERBATIM (mandatory, pre-registered):**
> **n ≈ 6 weeks, one regime, ~1 rebalance-equivalent — this is a
> hint, not a verdict; it informs the S10-BACKFILL GO/NO-GO only.**

## Deviations first
1. **Diagnostic class.** No k-cost consumed. No ship-law. No holdout
   touched. Cannot promote, demote, or refine any strategy.
2. **Substrate = `signal_observations` live window.** Coverage
   begins 2026-06-15 (first dense multi-signal week) and runs to
   most-recent trading day at receipt time. Effective span
   ≈ 6 weeks (~30 trading days ≈ 6 weekly-rebalance-equivalents,
   ~1.4 monthly-rebalance-equivalents).
3. **Pool = each week's live S5-L D10** (top-decile 12-1 momentum
   on that week's universe). Pool size 79–84 names/week (matches
   ROBUSTNESS §4).
4. **Signal-count score** is computed per name as the count of
   signals in **bullish state** at the week's observation timestamp.
   Bullish definitions (frozen pre-compute, per signal table
   semantics — no re-scoring after):

   | signal_id | bullish rule | source table semantics |
   |---|---|---|
   | momentum_12_1 | top tercile of value | value = (P[t-21]/P[t-252])-1, higher = more bullish |
   | short_interest_delta | bottom tercile (shorts fleeing) | delta = current − prior; lower = bullish |
   | analyst_revision | value > 0 | positive net revision |
   | pead_surprise | value > +2% | beat side per S1-b spec |
   | insider_form4_net_buy | value > 0 | net share count |
   | news_attention | top tercile | attention proxy, higher = more flow |
   | reversal_ungated | bottom tercile (contrarian) | negative recent return |
   | overnight_gap | top tercile | positive gap |
   | options_flow | value > 0 | net call-put dollar flow |
   | short_etb_state | is_present = true AND state = 'ETB' | ETB = easy-to-borrow = not squeezed |
   | days_to_cover | bottom tercile | lower = less squeeze risk |

   Score ∈ [0, 11]. Absent signals (is_present=false) count as 0
   contributions per DEC-078 typed-absence rule — never coerced.

5. **Forward horizon:** 5-session return per name, entry = week's
   observation-Monday open, exit = +5 sessions close. 38 bps RT
   cost per name (long-only).
6. **Spread test:** within each week's D10 pool, split names by
   score into terciles; report top-tercile vs bottom-tercile
   forward-5d spread (net of 38 bps).

## Weekly rows

| week (Mon obs) | pool n | score range | top-tercile fwd-5d net | bot-tercile fwd-5d net | spread (top − bot) |
|---|---|---|---|---|---|
| 2026-06-15 | 82 | 0–5 | +1.42% | +0.87% | **+0.55%** |
| 2026-06-22 | 81 | 0–6 | +0.71% | +1.05% | **−0.34%** |
| 2026-06-29 | 83 | 0–5 | +2.18% | +0.94% | **+1.24%** |
| 2026-07-06 | 79 | 1–6 | +1.03% | +0.42% | **+0.61%** |
| 2026-07-13 | 82 | 0–6 | +0.88% | +0.79% | **+0.09%** |
| 2026-07-20 | 84 | 1–7 | +1.94% | +0.31% | **+1.63%** |

**Mean weekly spread:** **+0.63%** (top − bot, net).
**Sign consistency:** 5 of 6 weeks positive (1 flip, week 2).
**Cumulative 30-session compounded top-tercile vs bot-tercile:**
top +8.42% vs bot +4.41% → spread **+4.01pp** over ~6 weeks.

## Power disclaimer (mandatory, verbatim)
> With n=6 weekly rebalance-equivalents and one macro regime, this
> sample cannot distinguish a real signal from single-regime luck.
> A one-tailed sign test on 5/6 positive weeks gives p ≈ 0.11 —
> below any conventional threshold. The mean spread carries no
> confidence interval that excludes zero. **This receipt has zero
> gate authority.** It exists to inform the S10-BACKFILL GO/NO-GO
> decision, nothing else.

## Reading
- Direction is **positively suggestive** — top-of-score names
  outperform bottom-of-score names inside the same D10 pool in 5/6
  observed weeks, with a non-trivial cumulative gap.
- Cannot rule out: single-regime artifact, momentum-crowding effect,
  or spurious ranking noise inside a homogeneous D10 pool.
- **What would flip this to DEAD:** if 2/6 or 3/6 additional weeks
  arrive with score-top underperforming by margin comparable to
  weeks 3 and 6 (~+1.2 to +1.6pp), the diagnostic goes to
  NOT-YET; if the sign flips ≥50% over the next 6 weeks, DEAD.
- **What would flip this to BACKFILL-WORTH-IT:** an additional
  6-week window in a **different macro regime** (e.g., a drawdown
  or high-vol month) that preserves the positive spread sign in
  ≥4/6 weeks.

## One-line recommendation
**NOT-YET** — signal is directionally consistent with the
recency-refinement's echo-hypothesis reading (top-score inside D10
= richer bullish co-agreement, not stale-leg dilution), but n and
regime coverage are insufficient. Revisit at 2026-Q4 (12-week
window) or after a non-uptrend regime tick, whichever comes first.
**Do NOT commit S10-BACKFILL engineering budget on this alone.**

## Cross-references
- Pool source: live `signal_observations` (RLS-scoped)
- Companion receipt: `ACT-580-M1-RECENCY.md` (build-window
  refinement — no ship)
- Prior halt on this substrate: `ACT-580-S10p-SIGNAL-WINNERS.md`
  (Step-A HALT on signal density)
- S10-BACKFILL dormant charter: `docs/08-planning/ACT-580-strategy-search.md`
  §S10 (backfill / forward slots)
- Typed-absence discipline: DEC-078
