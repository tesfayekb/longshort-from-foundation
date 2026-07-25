# 2026-07-27 Monday Slate — Pre-Committed (re-pinned per B3)

**Filed:** 2026-07-25T05:34:12Z. Supersedes any implicit "engine table
on Monday" expectation. B3 ruling accepted DEV-13: kernel is a
multi-turn workstream; ACT-515 matrix lands **mid-week**, not Monday.

## Pre-Committed Table (Monday 2026-07-27, UTC)

| Time (UTC) | Event | EXPECTED behaviour | Success signal | Failure signal |
|---|---|---|---|---|
| **10:00Z** | `overshoot-universe-refresh` scheduled fire (jobid 133, ACT-571 dual-lane, INC-141-b audit fix) | Both sources fail-CLOSED per DEV-9 (iShares CDN blocks Deno edge IPs, FMP tier-walled per DEV-10). Response `{ok:false,status:'both_sources_failed'}` PLUS one `overshoot.universe.refresh.refused` audit row. Zero writes to `overshoot_universe`. Universe stays 905 @ 07-21 seed. | HTTP 200, `{ok:false,status:'both_sources_failed'}`, refusal audit row present, universe row count unchanged. | Silent 200 with no audit row (INC-140 regression); any writes to universe; unexpected `{ok:true}`. |
| **13:30Z** | Rail check — deploy freshness | `SOURCE_VERSION='fb5fdf13+fix2+fix8+sp1+fix9'` on entry / exit / detection / fill-sweep; `x-source-version` header matches. | 4/4 probes return expected version. | Any function on older version. |
| **13:35Z** | Primary entries (`overshoot.entry.run`) — **first full-K morning post-fixes** | Long budget 5; short budget **1** (DEC-084). Negative-age EXTINCT (FIX-6). SI staleness 26d (H-1). Expected: SNDK first among short candidates (H-1 empirical verdict; SIGN-CORRECT continuation-short per ACT-575). **MILESTONE receipt required** if any short admits. Boxed-position: DOCN LONG blocks DOCN SHORT (symbol-scoped). | Run `outcome=completed`; long ≤5; short ≤1; stamps carry `SOURCE_VERSION`, `detector_version=aff20a13`, `refusal_class_counts`, `w5_reallocation_ref` (if sleeve active). | `negative_age` refusals > 0; short admits > 1; missing stamps. |
| **13:45Z** | Morning-exit (DEC-083 anchor) — **session 2 of R-007 5-session watch** | Ordinal-mature lots close at open+15m; per-fill `realized_slip_bps` GREEN (< 8.755 bps mean); `SOURCE_VERSION` echoed. | ≥1 lot closes; slip GREEN; `avg_exit_price` populated. | Slip RED (need ≥3 of 5 for rollback); zero admits when eligibility > 0. |
| **14:00Z** | Catch-up + FINRA orchestrator (chain gate ~08-03 per DW-236) | Reconciliation resolves `expected_divergence_handled` for 13:45Z-closed lots. FINRA re-attempt may be manual (DW-236 not until 08-03). | Reconciliation `outcome=expected_divergence_handled` OR `reconciled_ok`; no pages against 13:45Z-closed cohort. | Novel `outcome` class; pages on just-closed lots. |
| **14:05Z** | FIX-8 completion pass — post-maiden operational cadence | Pass-aware idempotency (FIX-9); consumes freed cash. `pass-2 K ≤ 5 − total_admits_today`. `pass='completion'` stamps per-admit. | Run `outcome=completed`; per-admit `pass='completion'`; K reconciles. | Pass-2 K > invariant (P0); missing `pass` stamp. |

## What is NOT on Monday's slate

- **ACT-515 engine matrix.** ~~Kernel is multi-turn (types → clock →
  admit → size → mark → exit → equity/DD; fixture #1 byte-exact green
  + fixture #2 2023-Q2 built during `mark`/`equity`; then per-config
  chains). Register row carries **mid-week** — never Monday.~~
  **UPDATE 2026-07-26 — INTEGRATION GATE COMPLETE (register row flipped).**
  Kernel bring-up (Modules 1–7) landed + gate half-1 (fixture-i byte-exact) +
  gate half-2 (fixture-ii 2023-Q2 CHK-1/2/3 + TERMINAL Δ=0c, cash-invariant
  class-killer green — see INC-146). Matrix pull-forward RATIFIED per
  operator ROI-first standing rule: **matrix window re-dated 2026-07-26..27**
  (ahead of schedule, was mid-week). First compute (1x-const baseline)
  begins next turn; delivery grammar one config per receipt.
  **CI note (ca4b413 red / tip 7ef44d52 green):** `ca4b413` red = mid-batch
  snapshot without the seam fix (git-verified: 0 `entryCash` hits at
  ca4b413, 6 at tip 7ef44d52; local gate green at tip); tip-run is the
  record; per §22.8.5(b) atomicity-is-a-hint, gate verdicts bind to
  cumulative tip state, not mid-batch snapshots. **FORWARD RULE:** fix +
  its test land in the SAME edit batch wherever the platform allows, so no
  future mid-batch snapshot can flash a certified gate red.
- **(e) sector-cap.** Blocked on sector-metadata ingest per B2
  amendment. Ingest workstream (~3 turns) filed separately.
- **DW-236 FINRA orchestrator.** Chain gate ~08-03.

## Weekend chains re-sequenced (per B3, parallel to kernel bring-up)

1. **ACT-573 Phase-1** — refused-winners forensics (folds DEV-8
   dual-side walkthrough + λ corpus rate). SQL-only. **NEXT.**
2. **ACT-574** — entry-day offset grid. SQL-only.
3. **ACT-570 Phase-0/1.** Documented + SQL where kernel-independent.
4. **Kernel bring-up** — `engine/types.ts` first, one module per turn,
   unit-tested. In parallel to (1)–(3), on separate turns.

## Supervisor Pre-Registered Predictions

1. 10:00Z fires `both_sources_failed` with audit row present. Silent-200 = P0.
2. 13:35Z: long 5-of-5 filled; short 0 or 1 (SNDK candidacy live, morning-bar dependent).
3. SNDK if admitted short → MILESTONE receipt same session (pre-committed).
4. Morning-exit session-2 slip mean 4–7 bps GREEN.
5. FIX-8 pass-2 K ≥ 1.

**Post-hoc:** any prediction wrong recorded symmetrically in Monday receipts (Catalog #62 discipline).