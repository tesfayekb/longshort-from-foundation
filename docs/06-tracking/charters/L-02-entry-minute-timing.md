# Charter L-02 — Entry-Minute Micro-Timing (corpus backtest)

**Filed:** 2026-07-25 17:10:20Z • **Source:** ACT-576 Phase-1 §B.1 (rank 3)
**Class:** Execution-alpha • **Substrate:** `overshoot_minute_bars` (MIG-167)
**Method:** R-007 (per-minute reference-mid, cost as `entry_fill − minute_mid`), applied ENTRY-side (R-007 was EXIT-side).

## §1 — One-line thesis
Admit-minute (09:35 vs 09:40 vs 09:45 ET) has a measurable cost curve; the cheapest minute beats the current admit minute by ≥ 5 bps monotone over three consecutive minutes on the corpus.

## §2 — Pre-committed acceptance grammar (frozen at charter file time)

| gate | requirement | fail-open |
|---|---|---|
| G-1 substrate integrity | MIG-167 minute-bar coverage ≥ 95% at (ticker, minute) grain for the corpus window | REJECT — halt for backfill |
| G-2 Δ magnitude | `min(cost_curve[cheapest_minute]) < cost_curve[current_admit_minute] − 5 bps` | REJECT if gap < 5 bps |
| G-3 monotone envelope | Cost curve monotone across three consecutive minutes surrounding the winner (single-minute spikes REJECTED as noise) | REJECT if non-monotone |
| G-4 corpus size | n ≥ 1,000 admits AND ≥ 100 sessions in the backtest window | EXTEND corpus back one quarter then REJECT |
| G-5 replay-parity | detector-frozen replay pass on the shifted-admit-minute config produces the same admit ticker set as the current-admit-minute config | REJECT if selection drifts |
| G-6 no adverse-selection at open | fwd-1d realized return on cheapest-minute fills ≥ current-minute fills − 20 bps | REJECT if underperform |

**Adoption:** ALL SIX gates green → propose config flip via new DEC (`overshoot_entry_admit_minute`).

## §3 — Design
- **Corpus:** all `overshoot_lots` since MIG-167 completion (2026-07-01 forward).
- **Candidate minutes:** 09:35, 09:36, 09:37, 09:38, 09:39, 09:40, 09:41, 09:42, 09:43, 09:44, 09:45 (11 cells).
- **Reference mid per (ticker, minute):** `(minute_bar.high + minute_bar.low) / 2` from `overshoot_minute_bars`.
- **Cost function:** `cost_bps(t) = 10000 × (candidate_fill_at_t − mid_t) / mid_t`, signed positive-as-drag for LONG (paid up).
- **Curve output:** per-minute mean cost with 95% bootstrap CI (k=1000).

## §4 — Read grammar
Verdict lattice:
- **Cheapest minute AND monotone AND Δ ≥ 5 bps** → charter graduates to adoption proposal
- **Cheapest minute BUT non-monotone** → NOISE-AT-N, no adoption, retest at next quarter's corpus refresh
- **No minute beats current by 5 bps** → REJECT, publish curve as evidence and close

## §5 — Rollback
Config-flip only; no capital at risk. Rollback = revert DEC.

## §6 — Evidence artifact
`docs/06-tracking/L-02-cost-curve.md` with per-minute table (n, mean, CI) + monotonicity readout.
