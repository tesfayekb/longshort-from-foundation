# ACT-517 — MEMO: Survivorship-Deflator Methodology

> **Filed:** 2026-07-14 | **Mode:** methodology memo (documentation-only; no compute,
> no code) | **Purpose:** put a defensible number-generating procedure on H2-2022 / 2023
> return understatement in ACT-514 / ACT-515 outputs.

## Problem statement

The ratified universe (`overshoot_universe`, 839 tickers) and the bar corpus
(`overshoot_daily_bars`, 854 tickers) are **today's roster**. Tickers that were tradable
during 2022-06-29 → 2024-12-31 but subsequently **delisted, bankrupted, acquired-at-
material-discount, or converted-to-equity-worthless** are absent. Any backtest that
re-samples from today's roster over 2022–2023 window **implicitly conditions on
"survived until 2026"** — a look-ahead filter that biases arrival selection toward the
winners.

**Direction of bias:** always UP on the strategy leg (winners over-represented). Sign is
unambiguous; only the magnitude is uncertain.

## Method — three-stage deflator (pinned BEFORE any number)

### Stage 1 — Universe delta inventory

Enumerate every ticker that (a) satisfied `overshoot_universe` liquidity floors on any
trading day in [2022-06-29, 2024-12-31] AND (b) is absent from the current
`overshoot_universe`. Sources:

- Polygon `/v3/reference/tickers?active=false` (delisted tickers with `last_updated_utc`)
- CRSP delisting file OR Compustat corporate-actions file (for terminal-return data)
- Fallback: SEC EDGAR Form 25 (delisting notifications) cross-referenced with last-known
  Polygon bar

**Deliverable:** `delisted_universe.csv` — ticker, first-trade-date, last-trade-date,
last-trade-close, delisting-reason (bankruptcy / M&A / listing-standard / voluntary /
other), terminal-return-vs-close-30d-prior (the honest capital-destruction number).

### Stage 2 — Counterfactual arrival re-sampling

For each `delisted_universe.csv` row, replay the ACT-511 T1 detector across its lifetime
(bar window). Every arrival that would have entered the strategy book had the ticker
been in-corpus is a **counterfactual entry**.

**For each counterfactual entry:**

1. Compute the strategy's forward-return over its 4-session hold using bar data through
   the ticker's last trading day.
2. If the ticker delisted DURING the hold window, mark the un-held portion as **terminal
   loss = terminal-return-vs-close-30d-prior** (from Stage 1). No fabrication — the
   terminal-return number comes from data, not assumption.
3. If the ticker survived past the hold window, its forward-return is measured normally.

**Deflator per year Y:**

```
deflator_Y  =  (Σ counterfactual_returns_Y + Σ measured_returns_Y)
             / (Σ measured_returns_Y)
           −  1
```

Yields a per-year, signed adjustment. Applied as **subtractive** to the ratified backtest's
annual return (survived-only sample over-states by this ratio).

### Stage 3 — Confidence band

Bootstrap 1,000 resamples of the counterfactual-arrival set. Report deflator central
estimate + 5th/95th percentile band per year. Present as a **BAND, not a point**; the
point estimate is not the deliverable.

## Pre-committed numerical guardrail

**REJECT** any deflator estimate that lies outside the range **[0.5 pp, 15 pp] per year**
as prima facie evidence of methodology error (either universe delta or terminal-return
computation broke). First-order-plausibility band from published survivorship-bias
literature on equity backtests (Malkiel 1995: 1.5%/yr; Elton et al. 1996: 0.9%/yr for
mutual-fund survivorship; Brown et al. 1992: 0.5%/yr → higher during bear windows).
**We expect 2022–2023 to land in the upper half of this band due to the bear-window
concentration of delistings.**

## Application to ACT-514 / ACT-515 results

Every strategy CAGR / total-return line item from the new ACT-515 engine gets:

```
reported_return_Y  =  measured_return_Y − deflator_Y  (band-annotated)
SPY benchmark: unchanged (buy-and-hold SPY has no survivorship gap)
```

The delta between (a) and (c) in ACT-515 config comparisons **narrows** by the deflator.

## What this memo will NOT do

- **No code delivered.** Stage 1 corpus is a data-acquisition task (Polygon delisted-ticker
  fetch + CRSP terminal-return join). Cost quote is a separate charter.
- **No point-estimate quoted here.** Any number in this memo is either a literature
  reference or a bounds-check guardrail — never a deliverable.
- **No auto-adoption.** ACT-515 primary output reports **measured** numbers with the
  deflator applied AS AN ANNOTATED BAND, not as a replacement.

## Sequencing

1. Stage 1 corpus acquisition (separate work-item; ≈1-2 days depending on data source).
2. ACT-515 engine landing (in-flight per operator ruling 2026-07-14).
3. Stage 2/3 replay bolted onto the ACT-515 engine (it already replays arrivals — the
   counterfactual set is an additional input stream).
4. Deflator published back to ACT-514-DELIVERABLE (which is `PROVENANCE-UNKNOWN` per
   INC-103) as part of its re-derivation.

## Cross-references

- ACT-514-DELIVERABLE — the survivorship-caveat carrier (now `PROVENANCE-UNKNOWN` per INC-103)
- ACT-515 — engine that will host the counterfactual replay
- ACT-516 — H1-2022 window backfill (bars already there; event re-run only)
- ACT-473 — regime N=1 (not healed by this deflator)
- Malkiel (1995), Elton et al. (1996), Brown et al. (1992) — literature bounds

**END MEMO.**