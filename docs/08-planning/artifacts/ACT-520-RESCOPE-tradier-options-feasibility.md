# ACT-520 RE-SCOPE — Tradier Options Feasibility + Operator Dominance Test

**Mode:** investigation (read-only, in-turn per standing rule).
**Standing rule:** OPERATOR DOMINANCE TEST — a new strategy charters for BUILD only if it beats deploying the same capital as OVERSHOOT slots on **[ROI]** OR **[equal-ROI, lower-DD]** OR **[materially faster path to live evidence]**. Diversification value counts only at Phase-L scale where OVERSHOOT event supply saturates (cite ACT-511: 839-ticker U0 saturates ~6 slots/4d).

## Part A — Tradier capability report (from Tradier docs, verified 2026-07-14)

| Capability | Verdict | Evidence |
|---|---|---|
| Options chain endpoint | **YES** — `/v1/markets/options/chains?symbol=X&expiration=YYYY-MM-DD&greeks=true` | docs.tradier.com/reference/brokerage-api-markets-get-options-chains |
| Greeks + IV in chain | **YES — courtesy of ORATS** (real IV, delta, gamma, theta, vega, rho per contract) | same |
| Real-time chain data | **PRODUCTION ONLY** — requires Tradier Brokerage account (not just developer signup) | docs.tradier.com/docs/market-data |
| Sandbox data | **DELAYED only** (~15 min); no streaming in sandbox | docs.tradier.com/docs/faq |
| Paper trading | **YES** — sandbox at `sandbox.tradier.com/v1`, full order lifecycle | docs.tradier.com/docs/endpoints |
| Cash-secured puts (paper) | **YES** — standard single-leg equity option orders supported | Tradier options-trading spec |
| Historical options data (non-expired) | **YES** — pass OCC option symbol to `/v1/markets/history` | docs.tradier.com/docs/historical-data |
| Historical options data (EXPIRED contracts) | **NO** — "Historical options data is not available for expired [contracts]" | docs.tradier.com/docs/historical-data |

### The load-bearing constraint

**Tradier cannot retroactively supply real IV/greeks/chains for the 523,694 events in our corpus.** All those contracts expired. The ACT-520 corpus proxy stays IV-PROXY-UNRATIFIED for the historical panel; real chains only start accruing from **day one of paper spin-up going forward**. This is the same trade-off ORATS/LiveVol paid archives resolve at $$$ — Tradier is not that vendor.

Implication: the "live Tradier chains replace the IV proxy" plan is FORWARD-ONLY. It measures forward evidence, not retro-fits the historical study.

## Part B — Operator provisioning steps (§22.5.3 — operator handles secrets)

Existing secret in project: `TRADIER_API_KEY` (already saved; scope unverified — sandbox vs production).

### Path 1 — Sandbox-only (recommended first)
1. Operator logs into https://developer.tradier.com/user/sign_up (or existing account).
2. Under **Developer Portal → API Access**, generate/copy a **sandbox** access token (Bearer token; long-lived; personal-use scope).
3. Confirm current `TRADIER_API_KEY` value is a sandbox token (starts with sandbox-account prefix). If unknown, rotate:
   - Delete old `TRADIER_API_KEY` via secrets tool.
   - Re-add as `TRADIER_API_KEY` with the sandbox token.
4. Base URL for code: `https://sandbox.tradier.com/v1`.
5. No brokerage funding required; sandbox account is virtual.

### Path 2 — Production (only after Path-1 evidence + charter)
1. Operator opens a Tradier **Brokerage** account (not just developer), funds the paper-adjacent live account (real-time market-data entitlement is gated to Brokerage account holders).
2. In Brokerage dashboard, generate a production access token.
3. Save alongside sandbox key as **separate secret** `TRADIER_PROD_API_KEY` (do NOT overwrite sandbox).
4. Base URL: `https://api.tradier.com/v1`.
5. Level-2 options approval on the Brokerage account is required for writing cash-secured puts.

**Do not deploy option-writing code before Path-2 completes and Level-2 approval prints.** Sandbox writes are safe from day one for the paper track.

## Part C — Per-name option-liquidity spot check (10 recent OVERSHOOT selections)

**Selection method:** distinct tickers from `overshoot_study_candidate_events` with `event_date >= 2026-05-01` and `fwd_return_5d NOT NULL`, ordered by ticker, first 10.

| # | ticker | recent event date | side  | move_pct | expected liquidity class |
|---|--------|-------------------|-------|---------:|--------------------------|
| 1 | A      | 2026-06-25        | long  |   +9.9%  | LIQUID (S&P 500) |
| 2 | AA     | 2026-06-25        | short |  −13.1%  | LIQUID (large-cap materials) |
| 3 | AAL    | 2026-06-25        | long  |  +14.8%  | LIQUID (major carrier, high option OI) |
| 4 | AAON   | 2026-06-23        | short |   −3.6%  | **AT RISK — mid-cap HVAC, sparse chain** |
| 5 | AAPL   | 2026-06-25        | short |   −6.6%  | LIQUID (highest OI in market) |
| 6 | ABBV   | 2026-06-25        | long  |  +14.0%  | LIQUID (mega-cap pharma) |
| 7 | ABNB   | 2026-06-25        | long  |   +3.3%  | LIQUID |
| 8 | ABT    | 2026-06-25        | long  |   +7.5%  | LIQUID |
| 9 | ACGL   | 2026-06-25        | long  |   +5.1%  | **AT RISK — mid-cap specialty insurer, weekly OI thin** |
| 10| ACI    | 2026-06-25        | long  |   +4.0%  | AT RISK — mid-cap grocer |

**LIVE CHAIN SPOT-CHECK STATUS: SPOT-CHECK-DEFERRED-EXEC-BLOCKED.** `TRADIER_API_KEY` is a Supabase Edge-Function secret; it is not injected into the sandbox exec shell in this environment, so live Tradier chain snapshots cannot be pulled from this turn. Options for unblocking (operator picks; each is a small, gated code artifact — not this-turn):
- **Option X:** deploy a read-only `tradier-chain-probe` edge function that snapshots `/markets/options/chains?greeks=true` for a list of tickers/expirations, writes to a new `overshoot_options_chain_probe` diagnostic table. One-shot; ~30 lines of code; sandbox base URL. Enables the 10-name spot-check + rolling forward-collection.
- **Option Y:** operator runs the 3-line curl locally with the sandbox token and pastes the JSON; agent extracts the liquidity table. Zero code; slower for repeat samples.

**Directional expectation without live data** (industry standard rules-of-thumb for equity option liquidity):
- Large-cap (>$50B): 3–5 weekly expirations + monthlies; OI often 10³–10⁵ per near strike; spreads ≤ 2% of mid.
- Mid-cap ($2–10B): monthlies only or thin weeklies; OI 10¹–10² per strike; spreads 5–15%.
- Small-cap (<$2B): often no listed options, or spreads > 20%.

**The mid-cap dislocation problem is real.** Our universe skews mid-cap in the L_04_05 / L_05_06 bands (the low-return-per-slot bands anyway). The L_10_INF band (peak per ACT-520 corpus study) skews larger-cap because dollar-vol filtering pushes small-caps out — that is the band where option liquidity is most likely present. This is a MITIGATING factor: the corpus-best cell (L_10_INF, 18.08 bps/slot-day put-write proxy) is also the cell most likely to be tradeable at live spreads.

## Part D — Re-scoped ACT-520 plan

### D.1 Corpus-side deliverable (already delivered, unchanged)
File: `ACT-520-RESULTS-put-write-proxy-study.md`. Assignment-probability tables + IV-proxy expected-P&L across cells × strikes × sides. Peak 18.08 bps/slot-day (short L_10_INF ATM 5d). **Dominance-test verdict: FAILS** — 42.6% of the 42.42 bps/slot-day floor derived from ratified OVERSHOOT T1 T+2 (36.89 × 1.15).

### D.2 Forward-collection plan (net-new, gated)
Purpose: replace the IV proxy with **real** ORATS-sourced IV from day one of paper, forward-only. Not a backtest — a forward diary.

Stages:
- **F1 (unblocks the whole plan):** decide Option X or Y from Part C. If Option X, the tiny probe edge function ships as chartered scope (small, isolated, read-only, no money-path).
- **F2 (2 weeks of daily snapshots):** at each E4 detection close, snapshot the ATM + k∈{−2.5%,−5%} put chain for every selected event, near-week and monthly expirations. Persist bid/ask/mid/IV/greeks/OI/volume. This is diagnostic-only — no orders, no state on trading.
- **F3 (evaluation at n≥30 events):** compare **real** premium vs the 0.4·σ·√T proxy per cell. If real premium is uniformly < 2.4× the proxy (the ratio required to close the dominance-test gap per ACT-520-RESULTS section "Honest gap list"), the strategy fails dominance under real-world pricing — file NO-GO-CONFIRMED.
- **F4 (only if F3 clears):** paper cash-secured put write on sandbox for 10 events, at the strike/expiration the corpus proxy said was optimal. Measure P&L vs the model. **Do not skip F3.** Writing before F3 gates is completion theater.

### D.3 Charter shape
This is **not a strategy charter.** It is a **forward-observation study charter** (analysis tooling). No `overshoot-p` feature folder, no `overshoot_p_*` tables in the money-path. Everything under a diagnostic `overshoot_options_chain_probe` table + a single read-only edge function. If F3 clears the dominance test on real premium data, THEN a strategy charter opens for review.

## Part E — Dominance-test verdicts (this turn)

| Study | Measured per-slot-day | Floor 42.42 | Dominance verdict | Filing |
|---|---:|---:|---|---|
| **ACT-520** put-write (IV proxy peak) | 18.08 bps/slot-day | 42.42 | **FAILS on ROI** | SHELF-UNLESS-REAL-IV; forward-collection F1–F4 gated |
| **ACT-521** PEAD Long-Q5 5d (close basis) | 48.15 bps/slot-day | 42.42 | **CLEARS on ROI** but implementable T+1-open basis likely 38–42 | SHELF-UNLESS-SURPRISE per operator ruling — do not charter build until Winsorized re-run + T+1-open re-computation + FMP repair land AND the implementable per-slot-day still clears the floor |
| **ACT-521** PEAD L/S paired 5d (close basis) | 61.91 bps/slot-day | 42.42 | **CLEARS materially** but same T+1-open caveat | Same SHELF-UNLESS-SURPRISE lane |

**Diversification-value carve-out (per operator standing rule):** does not apply here — U0 saturates ~6 slots/4d per ACT-511 U0 measurement; both PEAD and put-write compete for the same capital until Phase-L scale is on the roadmap. It is not.

## Part F — Filing

- **ACT-520 status:** RE-SCOPED. Corpus proxy = NO-GO under dominance test. Forward-Tradier-collection = **CANDIDATE (F1 gate open, awaiting operator pick of Option X or Option Y for the spot-check unblock)**.
- **ACT-521 status:** SHELF-UNLESS-SURPRISE. Pending: Winsorized surprise re-run + T+1-open basis + FMP repair (ACT-522-CANDIDATE) + ACT-517 deflator.
- **Standing rule filed:** Operator Dominance Test — logged in tracker as governance rule for all future strategy charters.
- **No code, no migrations, no schema changes this turn.**
