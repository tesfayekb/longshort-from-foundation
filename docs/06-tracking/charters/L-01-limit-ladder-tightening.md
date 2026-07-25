# Charter L-01 — Limit-Ladder Tightening (90-day paper A/B)

**Filed:** 2026-07-25 17:10:20Z • **Source:** ACT-576 Phase-1 §B.1 (rank 2)
**Class:** Execution-alpha • **Substrate:** `overshoot-entry-run` limit-order construction
**Reference basis:** T+1 open (`overshoot_daily_bars.open`), consistent with ACT-576 §A frame.

## §1 — One-line thesis
Tighter limit ladder captures more of the ACT-506-documented ~−50 bps limit→fill improvement without paying it back in fill-rate loss.

## §2 — Pre-committed acceptance grammar (frozen at charter file time)

| gate | requirement | fail-open |
|---|---|---|
| G-1 fill rate | `fill_rate_arm ≥ 0.88` (arm) AND `|fill_rate_arm − fill_rate_ctrl| ≤ 0.04` | REJECT if either |
| G-2 entry slip | `mean(entry_slip_bps_arm) ≤ +20` AND `mean(entry_slip_bps_arm) < mean(entry_slip_bps_ctrl)` | REJECT if either |
| G-3 paired diff | paired-t p-value `< 0.10` on (arm − ctrl) `entry_slip_bps`, matched by session | REJECT if `p ≥ 0.10` |
| G-4 sample size | `n_arm ≥ 200 fills` AND `n_ctrl ≥ 200 fills`; **first-verdict look at n ≥ 100/arm (~4 weeks)** — informational only, does not adopt | window is **rolling-until-gates-clear** (no calendar deadline) |
| G-5 dollar-weighted | primary metric = **dollar-weighted** entry_slip_bps (per §E.2 discipline); unweighted reported as secondary | — |
| G-6 no adverse-selection | fwd-5d realized return on arm-fills ≥ ctrl-fills − 30 bps (rules out cherry-picking safer fills) | REJECT if arm underperforms by >30 bps |

**Adoption:** ALL SIX gates green → propose config flip via new DEC. **Any single fail → charter closes REJECTED; no partial adoption.**

**Launch-independence clause (2026-07-25 amendment):** The paper lane runs CONTINUOUSLY past the mid-August live date (ACT-577); this study never gates the launch — mid-Aug launches on the current ratified config; this lever adopts post-launch on its own evidence.

## §3 — Design
- **Arm A (control):** current limit-ladder as of `SOURCE_VERSION` = `fb5fdf13+fix2+fix8+sp1+fix9`.
- **Arm B (tighter):** limit anchored −10 bps closer to quote-mid (implementation detail: reduce marketable-crossing offset by 10 bps in `constructEntryLimit` / equivalent).
- **Randomization:** per-admit coin flip inside `overshoot-entry-run`, arm recorded on `overshoot_lots.metadata.limit_arm ∈ {A,B}`.
- **Session-matched pairing:** for each session, compute (arm B mean − arm A mean) as the pair; use these session-pairs for the paired-t on G-3.

## §4 — Window
- **Arm date (Arm-B code path landed):** Sun **2026-07-26**.
- **A/B live (first randomized admit):** Mon **2026-07-27** 13:35Z.
- **First-verdict look:** at n ≥ 100/arm (~4 weeks) — informational readout, no adoption.
- **End:** **rolling-until-gates-clear** — charter remains OPEN until ALL SIX gates resolve (green → adopt, any red → REJECT). No calendar deadline; no 90-day / 120-day cap. Runs continuously past the mid-August live date (ACT-577).

## §5 — Rollback
Arm-B admits routable to close on ordinary exit path; no state that requires unwind. If G-6 fires mid-window → **immediate charter-halt, arm B deprecated**.

## §6 — Evidence artifact
Weekly receipt to `docs/06-tracking/L-01-weekly-receipts.md`; final verdict artifact at `docs/06-tracking/L-01-final-verdict.md` with all six gate readouts side-by-side.
