# ACT-580 S10′ — Signal-Ranked Winners

**Verdict (one line):** STEP-A HALT — 0 of 11 longshort-lane signals qualify as DENSE on the build window; fusion-of-fog gate fires; STEP-B not executed.

**Labels:** k-ledger increments to 10 (S10′ registered). Bar-tightened. Momentum-family holdout is SPENT — any 2026 read against S5-L construction is a **RE-USE-OF-SPENT-HOLDOUT** and cannot ratify.

---

## §0 Deviations (first, per protocol)

1. `signal_registry` has no `direction` / `bullish_threshold_spec` columns (schema: signal_id, signal_num, display_name, spec_ref, cadence, status, criticality, stale_after_hours, planned_phase, job_registry_id, display_order, timestamps). Bullish-state definitions would have to be sourced from `spec_ref` docs, not the registry. **Moot** given STEP-A halt.
2. `signal_observations` inventoried 11 signal_ids (charter said "8"). All 11 audited below.

---

## §1 STEP-A — Signal-Density Audit (gate)

**Source table:** `public.signal_observations` (columns: signal_id, ticker, as_of_date, value, is_present, gics_sector). Governance: `is_present=false` rows are typed absences; excluded from present-row counts.

**Build window (per S5-L convention):** 2022-06-29 → 2025-12-31 (the 2022-06-29 → 2026-07-10 R1 window minus the S5-L holdout 2026-01→2026-07 that is now SPENT).

### Per-signal density (all years present in table)

| signal_id | present_rows | tickers | date range | build-window rows | build-window tickers | verdict |
|---|---:|---:|---|---:|---:|---|
| active_catalyst_flag | 4,860 | 736 | 2026-06-12 → 2026-07-24 | **0** | **0** | THIN |
| analyst_revision_drift | 6,955 | 439 | 2026-06-10 → 2026-07-24 | **0** | **0** | THIN |
| cross_sectional_momentum_12_1 | 29,073 | 835 | 2026-06-05 → 2026-07-24 | **0** | **0** | THIN |
| insider_transactions_90d | 1,594 | 181 | 2026-06-14 → 2026-07-24 | **0** | **0** | THIN |
| market_24m_cumulative_return | 25 | 1 | 2026-06-23 → 2026-07-24 | **0** | **0** | THIN (macro, N=1) |
| market_realized_vol_6m | 25 | 1 | 2026-06-23 → 2026-07-24 | **0** | **0** | THIN (macro, N=1) |
| news_sentiment_7d | 3,045 | 308 | 2026-06-12 → 2026-07-24 | **0** | **0** | THIN |
| options_flow_imbalance_5d | 547 | 94 | 2026-06-10 → 2026-07-15 | **0** | **0** | THIN |
| pead_sue_20d | 10,223 | 836 | 2026-06-10 → 2026-07-21 | **0** | **0** | THIN |
| short_interest_change_30d | 24,163 | 839 | 2026-06-08 → 2026-07-24 | **0** | **0** | THIN |
| short_term_reversal_1w | 28,591 | 838 | 2026-06-05 → 2026-07-24 | **0** | **0** | THIN |

**DENSE count on build window: 0 / 11.** Charter threshold for STEP-B: ≥3.

### The audit's point (verbatim per charter)

> "if <3 qualify, STOP and report the audit before any portfolio math — fusion of fog is banned."

The longshort-lane signal substrate is a **~6-week 2026 slice** — populated by the live signal jobs (per `sql/14_longshort_signal_cron_schedule.sql` and successors) that began emitting in mid-2026. **There is zero build-window history on any signal.** Even the two signals with the most rows (`cross_sectional_momentum_12_1` at 29k, `short_term_reversal_1w` at 28k) are entirely inside the last ~50 sessions.

Consequence: a signal-ranked-winners study on the build window would be a null study — the "count of bullish signals" would be zero for every name on every rebalance. STEP-B is not runnable.

---

## §2 STEP-B — Portfolio Math (NOT EXECUTED)

Skipped per STEP-A gate. No cadence grid run. No frozen columns. No control comparison. No paper-arm move.

---

## §3 What this rules out vs what it doesn't

- **Rules out:** any signal-count fusion study on the R1 build window using `signal_observations` as-is. The substrate does not exist there.
- **Does not rule out:** the S5-L verdict (bare 12-1 D10, pool of ~90 winners) — that used its own price-history substrate, not `signal_observations`, and its verdict stands. The blend receipt stands.
- **Does not rule out:** re-running S10′ **prospectively** on live-tape as `signal_observations` accumulates — but that is a live-paper study, not a build-window study, and requires its own pre-registration + horizon (charter it separately with N-months-of-live-tape and a new bar).

### Adjacent-substrate options (out of scope; noted for the charter)

If the operator wants a build-window signal-ranked study, the substrate must come from batch-reconstruction tables that DO span 2022–2025: `analyst_revision_observations`, `news_attention_observations`, `pead_consensus_observations`, `reversal_ungated_observations`, `overshoot_short_interest`. Each carries its own coverage / semantics questions (S2's lesson) and each new fusion requires its own pre-registration and k-slot.

---

## §4 Ledger updates

- k-ledger: **k=10 registered, k=10 CONSUMED-BY-HALT** (spec was frozen and executed; STEP-A verdict IS the receipt).
- Bar remains tightened (CAGR ≥ 18% ∧ Sharpe ≥ 1.15 for any promotion out of build).
- Momentum-family holdout: **SPENT** (used by S5-L). Any 2026 signal-substrate read is a **RE-USE-OF-SPENT-HOLDOUT** and cannot ratify.
- Multiple-comparison ledger: 8/8 chartered families (S1, S1-b, S2, S3, S4, S5, S9-a pending, S10′) — S10′ now filed as **HALT-AT-STEP-A**.

---

## §5 Next up

- **S9-a sector dip-buy** (still owed): runs next per its own charter; 11 GICS-composite construction from `sql/44_overshoot_universe_sector.sql` tags; RSI(2)<10 → next-open per-name basket; T+5 or RSI(2)>60 exit; 19 bps/leg/name; standing four-clause gate; receipt `docs/06-tracking/receipts/ACT-580-S9a-SECTOR-DIP-BUY.md`.
- **Paper-arm decision:** waits on S9-a verdict (S10′ contributed no positive signal to the fusion pot).

---

*Receipt produced: 2026-07-26. Chains: `signal_observations` inventory (Supabase read-only), no writes, no portfolio compute.*