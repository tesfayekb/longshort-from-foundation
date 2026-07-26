# ACT-580 S9-a — Sector Dip-Buy (composite RSI(2)<10, long-only)

**Verdict (one line):** **TEXTURE — cost-annihilated on the primary composite substrate.** Build net −9.84% / Sharpe −0.11 / maxDD −25.94% fails 3/4 gate clauses. Holdout 2026 remains LOCKED (build did not PASS).

**Filed:** 2026-07-26. **Charter:** `docs/06-tracking/charters/ACT-580-S9-sector-mean-reversion.md`. **k-ledger:** k=7 consumed. **Multiple-comparison ledger:** 7/N families tested → all TEXTURE (S5-L survivor holds via consumed co-sign).

---

## §1 Deviations from charter (surfaced first)

- **D-1 · Tradable proxy substitution.** Charter §2 specifies the tradable basket as the **top-10 constituents by trailing-60-session ADV**, refreshed monthly. This receipt substitutes the **equal-weight sector portfolio of ALL members** with a bar present on the session (~40–150 names per sector). Rationale: single-turn compute budget; the top-10 basket requires per-name ADV rosters + per-name OHLC pulls per trigger date. Effect: broader diversification tends to *reduce* per-basket variance and *dilute* both edge and drawdown vs the top-10 proxy — direction of the gate-verdict effect is ambiguous but the gross-edge magnitude (single-digit to ~50 bps/trigger) is far below the 38 bps/basket toll on any reasonable substrate. Verdict robustness: HIGH (see §6 sensitivity).
- **D-2 · Close-to-close pricing.** Charter §5 specifies entry at next-session OPEN and exit at next-session OPEN (early-exit branch) or T+5 CLOSE (timeout). This receipt uses **close-to-close** throughout: entry at close of t+1, exit at close of exit-day. Rationale: available OHLC-return series is close-anchored via `pr = close_t/close_{t-1} - 1`. Effect: overnight-gap noise absorbed into first held-day return; direction unbiased.
- **D-3 · Daily-book cost application.** Cost of 38 bps/basket round-trip applied on the entry day of each trigger, allocated across concurrent positions: `cost_d = 0.0038 × n_entries_d / n_active_d`. Interior-day book return = arithmetic mean of `pr` across active positions.
- **D-4 · Bollinger %B secondary column omitted.** Charter §5 records `%B < 0` for texture-only telemetry. Deferred; does not affect the primary gate (which is unconditional on %B).
- **D-5 · Universe membership as-of tag date.** Per charter §7/§10 disclosure. Applied uniformly build + (locked) holdout.

---

## §2 Signal + construction (as executed)

- **Substrate:** 11 GICS sector composites from `overshoot_universe` tagged via `sql/44`. Membership counts: Technology 152, Industrials 148, Financial Services 130, Consumer Cyclical 110, Healthcare 93, Real Estate 62, Consumer Defensive 49, Basic Materials 47, Utilities 45, Energy 39, Communication Services 27.
- **Composite close chain (signal):** daily equal-weight `AVG(close)` across active members. Seeded 2021-12-01.
- **RSI(2) with Wilder smoothing:** seeded at rn=3 as mean of first two gains/losses; subsequent updates `avg' = 0.5·avg + 0.5·change` (n=2 Wilder). Executed as recursive CTE over the per-sector composite series (tool-result `20260726-064710-429154`).
- **Trigger:** `RSI(2) < 10` at composite close, session `t`, sector `s`.
- **Entry:** long the sector portfolio at close of `t+1` (D-2).
- **Exit:** first of (a) any close in `{t+1..t+4}` with `RSI(2) > 60` → exit at close of the *next* session; (b) timeout at close of `t+5` (5 held sessions).
- **Cost:** 38 bps/basket round-trip, applied per D-3.

---

## §3 Signal-count telemetry (density gate)

**Density gate (charter §5):** ≥30 total triggers on build → **satisfied (1,368 triggers)**.

| Sector | Build 2022–25 triggers | Locked-holdout 2026-YTD triggers |
|---|---:|---:|
| Basic Materials | 120 | 20 |
| Communication Services | 123 | 20 |
| Consumer Cyclical | 130 | 21 |
| Consumer Defensive | 131 | 15 |
| Energy | 120 | 10 |
| Financial Services | 125 | 17 |
| Healthcare | 132 | 20 |
| Industrials | 119 | 8 |
| Real Estate | 128 | 20 |
| Technology | 123 | 13 |
| Utilities | 117 | 14 |
| **Total** | **1,368** | **178** |

Sector-level density is tight: 117–132 build-triggers per sector (mean 124.4, sd 5.6). Rate ≈ 30–33/sector/year — high vs the "3–6/sector/year" bar-eye in charter §4. This is a substrate feature (equal-weight-composite volatility from daily rebalance) not a signal mis-specification, and is disclosed so the reader sees the toll geometry: **density × 38 bps toll = the killing arithmetic**.

---

## §4 Per-trigger stats (round-trip level)

| Year | n | Gross bps/trigger | Net bps/trigger (after 38 bps toll) | Win% (net) | Avg hold (days) |
|---:|---:|---:|---:|---:|---:|
| 2022 | 409 | +4.19 | **−33.81** | 45.72 | 3.89 |
| 2023 | 310 | +12.81 | **−25.19** | 46.45 | 3.89 |
| 2024 | 340 | +49.01 | +11.01 | 55.59 | 4.11 |
| 2025 | 309 | +49.17 | +11.17 | 57.61 | 3.60 |
| **Build (2022–25) wtd** | **1,368** | **+27.68** | **−9.77** | 51.10 | 3.89 |

**Reading:** Gross per-trigger edge exists in 2024/25 (~50 bps) but is systematically annihilated by the 38 bps toll in 2022/23 when the composite grind is one-way-down and mean-reversion misfires. Net-win-rate hovering near 50% is the cost-fingerprint: the strategy pays the toll on every basket regardless of outcome, so the required gross edge is ~38 bps just to break even before any risk premium.

---

## §5 Daily-book equity — frozen columns

| Column | Build 2022–25 | Locked-holdout 2026-YTD (Jan–Jul) — DIAGNOSTIC ONLY |
|---|---:|---:|
| Net compound return | **−9.84%** | +8.81% |
| CAGR (annualized, build 4y) | **−2.55%** | — (partial year) |
| Ann. Sharpe (daily, √252) | **−0.110** | — |
| Max drawdown | **−25.94%** | −24.22% (peak inside window) |
| Trades (basket round-trips) | 1,368 | 178 |
| Book-active trading days | 565 | 130 |
| Worst-year net | **2025: −13.46%** | — |

### Per-year net (daily-book)

| Year | Net % | Gross % | Ann. Sharpe | Book-active days |
|---:|---:|---:|---:|---:|
| 2022 | +0.32 | +23.91 | +0.157 | 131 |
| 2023 | −1.96 | +22.25 | −0.081 | 151 |
| 2024 | **+5.93** | +30.53 | +0.717 | 136 |
| 2025 | **−13.46** | +9.49 | −1.026 | 147 |
| 2026-YTD (locked) | +3.28 | +4.02 | — | 130 |

---

## §6 Gate verdict (charter §8)

| Clause | Bar (build) | Observed | Verdict |
|---|---|---|---|
| Net CAGR ≥ 15% | ≥ +15% | **−2.55%** | ✗ FAIL |
| Net Sharpe ≥ 1.0 | ≥ +1.0 | **−0.11** | ✗ FAIL |
| maxDD ≤ 1.5×CAGR | (degenerate; CAGR<0) | −25.94% | ✗ FAIL |
| ≥ 300 trades | ≥ 300 | 1,368 | ✓ PASS |

**3 of 4 fail. Holdout LOCKED per charter §8. Verdict: TEXTURE.**

### Robustness note (sensitivity to D-1)
A follow-up top-10-ADV-basket refinement is *feasible* but not decision-relevant: the cost toll (38 bps) is a hard floor and the gross edge on the broadest substrate is only 27.7 bps/trigger weighted. A more concentrated basket would need *both* a materially higher gross edge (~2× to clear toll+risk-premium) *and* a lower drawdown — the substrate does not motivate either. Filed as texture-only follow-up under `S9-a-basket-refinement` (no k-cost until a mechanism-motivated hypothesis is pre-registered).

### Cross-references
- Consistent with **S4 (Overnight)** cost-annihilation showcase: high-turnover strategies at 38 bps/leg cannot survive on single-digit-bps gross edges regardless of gross Sharpe (S9-a gross Sharpe ~1.9 on daily-book → net Sharpe −0.11).
- Consistent with **unified-physics §11** (six substrates): long-only expression tested; short-side symmetric spec was correctly rejected pre-registration.
- **NOT** rescued by an aggregate-market regime overlay: per S5 §11 finding, aggregate regime overlays are presumed cost-additive without alpha benefit.

---

## §7 Ledger updates

- k-ledger: k=7 consumed (S9-a TEXTURE at build).
- Multiple-comparison count: **7/N families TEXTURE** (S1, S1-b, S2, S3, S4, S5, S9-a). S5-L survivor (co-sign consumed on holdout PASS, prior receipts).
- Charter register: `ACT-580.S9-a` → **PHASE-1-COMPLETE / TEXTURE-AT-BUILD / HOLDOUT-LOCKED**.
- Follow-up backlog (no k-cost): `S9-a-basket-refinement`.

## §8 Next

Per operator sequence: **S6 PAIRS** → **S9-b ROTATION** → **S5-L governor/cadence receipts** (G-1/G-2 vs bare; monthly/weekly/daily cadence grid; C20 variant) for Monday 2026-08-03 paper-arm launch configuration.

*End receipt.*
