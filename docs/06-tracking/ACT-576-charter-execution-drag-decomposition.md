# ACT-576 Charter — Execution-Drag Decomposition (FILLED vs SELECTED, ~150 bps gap)

**Filed:** 2026-07-25 06:01Z  •  **Clock:** `SELECT now() → 2026-07-25 06:00:55Z`
**Source finding:** ACT-573 Phase-1 §3 — FILLED-LOTS-ONLY LONG (2026-07-08 → 2026-07-24): **n=50, mean −473.4 bps** vs SELECTED-cohort **−321.1 bps**. Gap = **~152 bps** to explain. SHORT side n=0 (debut Monday).
**Charter-before-run discipline:** per INC-136. Numbers land next turn.

---

## §1 — Frame

**Honest-frame:** n=50 filled lots over 13 sessions is directional-only. This charter decomposes a **gap**, not a level; the gap survives regime because both cohorts sit in the same window. The controllable share is the deliverable.

**No config flips off this artifact.** Its output feeds:
- **ACT-506 bleed-box** (per-lot slippage rail) as attackable line items
- **ACT-548** if a decomposition line reveals a structural cell defect
- **ACT-572 shadow-lane comparator** as the first apples-to-apples baseline (once IBKR shadow fires)

---

## §2 — Pre-committed decomposition (four terms, additive)

`gap_bps = ENTRY_SLIP + CLUSTER_MIX + EXIT_SLIP + RESIDUAL`

| term | definition | data source | expected sign |
|---|---|---|---|
| **ENTRY_SLIP** | `(fill_price / T+1_open_ref − 1)` per lot, signed by side, averaged. Reference = `overshoot_daily_bars.open` at admission's T+1. | `overshoot_lots.entry_fill_price` ⋈ `overshoot_daily_bars` | negative for LONG (paid up) |
| **CLUSTER_MIX** | Fill weighting of Friday/high-volatility sessions vs SELECTED cohort's uniform assumption. Compute weighted-mean SELECTED return under FILLED session-mix minus uniform SELECTED mean. | `overshoot_lots.entry_date` histogram vs SELECTED distribution | can be either sign |
| **EXIT_SLIP** | `(exit_fill / ordinal_exit_ref_close − 1)` signed. Reference = `close` at scheduled exit ordinal. Ties to **R-008 monitor** + **ACT-506** exit-slippage lane. | `overshoot_lots.exit_fill_price` ⋈ `overshoot_daily_bars` | negative for LONG (sold low) |
| **RESIDUAL** | `gap_bps − (ENTRY_SLIP + CLUSTER_MIX + EXIT_SLIP)`. Named categories only; no fudge factor. If \|RESIDUAL\| > 30 bps → open **DEV-NN** and investigate. | derived | ~0 if model complete |

### §2.1 Verdict grammar
- Report each term with **95% CI** (bootstrap, 1,000 resamples over the n=50 lots).
- Term is **NAMED-ATTACKABLE** if \|mean\| ≥ 15 bps AND CI excludes zero.
- Term is **NOISE-AT-N** if CI includes zero (accepted honestly, no forcing).
- **Controllable share** = ENTRY_SLIP + EXIT_SLIP (the R-008 lanes); routed to ACT-506 as line items.

---

## §3 — Deliverables (next turn)

1. Table of the 4 terms with mean, 95% CI, n, verdict.
2. Per-lot table (n=50) with entry_slip, exit_slip, session_date — feeds ACT-506.
3. One-paragraph operator read: "of the 152 bps gap, X bps is entry-slippage (attackable via …), Y bps is exit-slippage (attackable via …), Z bps is cluster-mix (structural to the window), R bps is residual (named or investigated)."
4. Register row for ACT-506 with the exact controllable-share figure.

---

## §4 — Not in scope

- SHORT-side decomposition (n=0 until Monday admits fire).
- Regime split (n=50 too thin).
- Cross-strategy comparison (no other strategy books share this basis).

---

## §5 — Sequencing

**Slot:** immediately after **ACT-570 Phase-1** (FINRA Reg SHO ingest) lands. Cost = one turn of SQL + one narrative artifact. Feeds ACT-506 bleed-box directly.