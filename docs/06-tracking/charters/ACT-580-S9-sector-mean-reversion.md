# ACT-580 S9 — Sector mean-reversion + rotation — Phase-0 Charter (pre-registered)

**Filed:** 2026-07-26 (same message as ACT-580 S5 GO — pre-registered BEFORE any S9 query).
**Class:** ACT-580 family extension (2 sub-families: S9-a primary + S9-b rotation).
**Owner:** operator-proposed; motivation: low-instrument-count / low-turnover structure directly answers S4's cost-annihilation lesson.
**k-ledger:** S9-a → k=7, S9-b → k=8. Bar-tightening law (charter §1) applies.

## §1 Motivation (verbatim)

Low-instrument-count and low-turnover structure directly answers S4's cost lesson (86 bps/day toll booth vs 5 bps/day gross edge). Sector-level substrate reduces both the number of legs per rebalance and the rebalance frequency, giving the gross edge a fighting chance to survive the cost model. Unified-physics law (S1..S5 six-substrate agreement) applies: long-only expression is the honest read; S9-a is pre-registered LONG-ONLY.

## §2 Substrate (FROZEN)

- **11 self-built GICS sector composites** from the 905 composite universe (ACT-571 sealed output).
- **Membership:** as-tagged in `overshoot_universe.gics_sector` (added via `sql/44`, backfilled). No survivorship patching beyond the §7 disclosure below.
- **Composite construction spec (FROZEN):** equal-weight daily close chain of active members per session. A composite's daily close on session `t` = mean(close[ticker, t]) across tickers with `gics_sector = S` AND bar present on `t`. No rebalancing artefacts modeled inside the composite — it is a *reference series*, not itself a tradable instrument.
- **12th reference:** SPY as market benchmark (not sector-labeled).
- **Tradable proxy per sector S:** the **10 most-liquid constituents** of sector S by trailing-60-session ADV as-of the SIGNAL DATE, equal-weight. **The machine trades names, not indexes.** Proxy basket recomputed monthly (first Monday of month) to avoid daily churn from ADV micro-shifts; the SAME 10-name proxy basket is used for all S9-a triggers in that month.

## §3 Windows (INHERITED from ACT-580 charter §3)

- Build window: 2022-01-01 → 2025-12-31 (subject to composite warmup; disclosed in Phase-1 receipt deviations).
- Locked 2026 holdout: 2026-01-01 → present. ONE LOOK per surviving sub-family.

## §4 Cost model (INHERITED from ACT-580 charter §4)

Per-NAME (per basket constituent), per-side: 19 bps/leg (5 bps half-spread ADV bucket B for top-10-liquid names + 14 bps ACT-506 slippage). Round-trip per name = 38 bps. Basket cost per full-entry-full-exit = 38 bps × 10 names / 10 = **38 bps per basket round-trip** (equal-weight cancels the name count in per-basket bps terms).

**Cost showcase:** S9-a expected trigger rate at bar-eye estimate ~3–6 triggers/sector/year (RSI(2)<10 is rare) × 11 sectors × 5-session hold vs 21-session hold → tolerable turnover.

## §5 S9-a — SECTOR DIP-BUY (primary)

**Direction: LONG-ONLY** (per unified-physics law; symmetric spec explicitly rejected — the physics has spoken six times).

**Signal (FROZEN):**
> `RSI(2)` on the sector composite's daily close chain. Using Wilder's smoothing: `avgGain(2) / avgLoss(2)`; `RSI = 100 − 100/(1+RS)`. Trigger: **`RSI(2) < 10` at session close**.

**Entry:** BUY the sector's tradable proxy basket at the NEXT session's OPEN. Basket = the 10 most-liquid constituents by trailing-60-session ADV as-of trigger date (locked at monthly proxy-basket refresh; see §2).

**Exit:** first of:
1. `RSI(2) > 60` at session close → exit next open, OR
2. `T+5` sessions (calendar-count: 5 trading days from entry) → exit at close of T+5.

**Costs:** 38 bps per basket round-trip (charter §4 applied per-name, netted equal-weight across the 10-name basket).

**Secondary texture column (NOT a gate-shot):** record Bollinger `%B < 0` at same trigger date. Reported for texture only — does NOT modify entry rule, does NOT count as a second family test.

**Density gate:** minimum 30 triggers across 11 sectors over build window for the receipt to be admissible. Below that, verdict = INSUFFICIENT-N.

## §6 S9-b — SECTOR ROTATION (separate k-slot)

**Direction: LONG-ONLY.**

**Signal (FROZEN):**
> On the **first Monday** of each calendar month (nearest trading session if Monday is a holiday), rank the 11 sector composites by trailing 6-month (126 trading sessions) composite return. LONG the **top 3** sectors, equal-weight across the three baskets (each basket = its 10-name tradable proxy, equal-weight within).

**Hold:** one calendar month (exit at first-Monday-open of the NEXT month).

**Costs:** 38 bps per basket round-trip × 3 baskets × turnover fraction. Turnover computed from actual monthly ranking (name-level, not basket-level: overlap across months reduces trades). Reported in Phase-1 receipt.

## §7 INTRADAY LEG — DEFERRED-TYPED

Charter operator note: "zero intraday sector substrate owned; row filed, unblocks only on a data purchase IF daily passes." Formally: **S9-c INTRADAY** is filed as DEFERRED-TYPED. No k-slot consumed until unblocked. Unblock condition: (a) either S9-a or S9-b PASS on build AND holdout, AND (b) operator authorizes intraday sector-composite data purchase. Until then, this row is a placeholder — no queries, no k-cost.

## §8 Gates (INHERITED, TIGHTENED)

Standing four clauses at the tightened bar (per S4 informal continuation):
- Net CAGR ≥ 15% (build) + ≥ 4pp margin on holdout
- Net Sharpe ≥ 1.0 (build) + ≥ 0.20 margin on holdout
- maxDD ≤ 1.5 × CAGR
- ≥ 300 trades (S9-a: leg count across triggers × 10-name basket × 2 sides; S9-b: leg count across monthly rotations × 30 names × 2 sides)

**Holdout locked** unless PASS on build. ONE receipt per sub-family: `docs/06-tracking/receipts/ACT-580-S9a-SECTOR-DIP-BUY.md`, `docs/06-tracking/receipts/ACT-580-S9b-SECTOR-ROTATION.md`.

## §9 Execution order

1. S9-a — immediately after S5 receipt lands (this turn).
2. S9-b — after S6 PAIRS receipt.
3. S9-c INTRADAY — DEFERRED-TYPED per §7.

## §10 Survivorship / honesty disclosures (verbatim)

- Membership tags via `sql/44` are AS-OF the tag date; historical composition drift is NOT patched. This is a known-unknown biasing composites toward currently-listed names.
- The tradable proxy (10 most-liquid by ADV) selects the survivors' liquid subset — an additional survivorship layer. Both are disclosed and applied uniformly build + holdout.
- Composite warmup: RSI(2) needs 2 sessions; monthly-6m ranking needs 126 sessions. First admissible S9-a trigger date = 2022-01-04 (2 sessions after 2021-12-31 sealed-cache start). First admissible S9-b rebalance = 2022-01-03 requires 126-session lookback into 2021 (available in sealed cache: bars start 2021-06-29 → first admissible = ~2022-01-first-Monday).

## §11 Register rows

```
ACT-580.S9      SECTOR MEAN-REVERSION + ROTATION (sub-lane)     PHASE-0-SPEC-LOCKED
ACT-580.S9-a    Sector dip-buy (composite RSI(2)<10, long-only) PHASE-0-SPEC-LOCKED
ACT-580.S9-b    Sector rotation (top-3 6mo return, monthly)     PHASE-0-SPEC-LOCKED
ACT-580.S9-c    Sector intraday leg                             DEFERRED-TYPED (unblocks on §7)
```

**k-ledger update at file-time:** was 6/8 tested (5 texture pre-S5 + S5 texture at land); S9-a pre-registers as **k=7**, S9-b as **k=8**. Total planned tests after S9 = 10 across S1..S9 lanes (S7 blocked, S8 deferred, S9-c deferred). Tightened bar continues to apply.

**End Phase-0.** Phase-1 S9-a executes on GO — the operator's GO in this turn's message applies.
