# DEC-083 (DRAFT — pre-stage; awaiting operator GO per frozen grammar)

**Status:** DRAFT — no code lands until operator utters the one-word GO. This file is the ratification target; on GO, promote into `approved-decisions.md` as `DEC-083` and cite from `docs/06-tracking/action-tracker.md`.

**Title:** Morning-Exit Adoption at 09:45 ET (T1+T2 primary time-exit cron move 19:50Z → 13:45Z).

**Authority chain (R-007 REPRODUCED).** Charter (ACT-509 Stage-2 morning-exit leg) → Pre-Screen v2 (T1 forfeit 4.30 bps / T2 5.36 bps ALIVE-STRONG) → Canonical SLICE-B substrate (6,538 pairs / 189,673 bars, MIG-167) → Committed SQL (`scripts/act-509/verdict-exec-cost-pooled.sql`, INC-135 discipline) → Pooled Verdict (conservative Δ = 2.956 bps at 09:45 ET, ADOPT for both tiers). Supervisor independently re-derived every delta; ratification recorded in R-007 ledger row.

**Honest-net envelope (recorded, not headline).** ≈ 2–3 bps/slot-night, ≈ **$600–800/yr BLEND**, ≈ **$9.7K/yr FLOOR**. Below the DEC-085 headline threshold; adopted on structural microstructure grounds plus positive-EV, cross-year texture consistency (all five years ADOPT-band; worst 2026 cell Δ = 4.530 bps < 5.0 T2-lower).

---

## §(a) T1+T2 time-exit primary cron: 19:50Z → 13:45Z (09:45 ET)

**What moves.** The T1+T2 realized-return-driven time-exit primary cron currently anchored at 19:50Z is repointed to **13:45Z (09:45 ET)**.

**What does NOT change.**

- Same limit-construction path (LOC/marketable-limit shim per FIX-1/2 rails; no new order-type surface).
- Same eligibility gate (`holdingDayOrdinal` cohort selection, age arithmetic per `intents.ts` — unchanged; T2 fires at age 10, T1 at age 9-plus-conditions per current binding).
- Same audit envelope (`overshoot.exit.run` via `_shared/strategy-audit.ts` per T4 / DEC-033).
- Same idempotency triple (T8).
- Same DEC-504-4 sleeve-reallocation posture (independent of exit-time; engagement decided at daily boundary).
- FIX-1 negative-age correction and FIX-2 grep-lock discipline apply verbatim to the moved cron.

**Governance carve-out (T5).** Cron config lives in `supabase/config.toml` (platform) but its schedule value is a strategy-specific parameter — this move edits only the schedule string, no platform-side abstraction changes.

## §(b) 19:50Z tick RETAINED as residual/retry sweep

The 19:50Z cron is NOT deleted. It is repurposed as the **residual/retry sweep**, catching:

- Cohort members that were refused at 13:45Z (stale-refusal survivors) — e.g., `si_stale_active` transient blocks, `daily_budget_reached` overflow, borrow-locate misses.
- Late-eligibility admissions that only became eligible after 13:45Z (edge cases where cohort assignment updates mid-session).
- Post-open fills that missed the morning window entirely (network / provider hiccup).

Same code path, same audit action, same idempotency triple — the sweep is guaranteed a no-op for lots already exited at 13:45Z (dedupe via `overshoot_lots.status='closed'`).

## §(c) FIX-8 same-morning redeploy at 14:05Z consuming freed cash

**Vehicle.** FIX-8 already exists as a locked contract (queued for build+arm tonight). Its K-arithmetic-across-passes is defined in `docs/04-modules/overshoot/fix-8.md` — cited verbatim below rather than restated:

- Pass-1 K = daily entry budget minus AM-consumed slots at pre-13:45Z snapshot.
- Pass-2 K = daily budget minus (pass-1 admits + AM-consumed) at 14:05Z snapshot — **now larger** because 13:45Z T1/T2 exits have freed 5–15 slots of cash.
- Cap invariant: pass-2 K ≤ (`OVERSHOOT_DAILY_ENTRY_BUDGET` = 5) minus any admits already booked today. Refill-glide-path ≤5/day post-Monday remains binding.

**Interplay.** The morning-exit move is the direct causal input to FIX-8's pass-2 having non-trivial capacity. Prior to DEC-083, pass-2 typically saw K=0 because exits hadn't fired yet. After DEC-083, pass-2 will routinely have K ≥ number-of-morning-exits — FIX-8's design assumption is finally met.

**Chartered as adoption's redeploy half.** FIX-8 build+arm tonight is now doubly motivated: it is both the queued item AND the second half of DEC-083's daily lifecycle. Landing without FIX-8 would strand freed cash until the following session.

## §(d) 14:00Z catch-up leg — interplay

The existing 14:00Z catch-up heartbeat is UNCHANGED in trigger, cadence, and semantics. Ordering within the 13:45Z → 14:00Z → 14:05Z window is:

1. **13:45Z** — DEC-083 primary time-exit fires (T1+T2 cohorts).
2. **14:00Z** — catch-up heartbeat runs against post-exit ledger; reconciles broker vs ledger with cash already updated by 13:45Z sweep. Expected divergence at this heartbeat is now HIGHER for legitimate reasons (many just-closed lots settling); reconciliation classifier already handles `expected_divergence_handled`.
3. **14:05Z** — FIX-8 pass-2 fires with K refreshed from post-exit + post-catchup snapshot.

No cron reordering required — the 15-minute stagger 13:45 → 14:00 → 14:05 is already the natural sequence.

## §(e) Monitoring — first-week receipts

**Metric.** For each realized 09:45 ET fill in the first five sessions post-adoption:

```
realized_slip_bps = abs(fill_avg_price - vwap(09:45 minute bar)) / vwap * 1e4
```

**Comparator.** The R-007 estimator [b] mean at 09:45 = **8.755 bps** pooled; the conservative-Δ prediction is **2.956 bps** vs the 15:50 baseline. Monitoring hook:

- **GREEN:** first-week mean `realized_slip_bps` < 8.755 bps (proves the estimator is conservative-upward as R-007's SLICE-A n=1 calibration suggested).
- **YELLOW:** 8.755–13.0 bps (within estimator envelope; continue monitoring, no action).
- **RED:** > 13.0 bps for ≥3 of 5 sessions (predictive floor breached; auto-trigger rollback per §(f)).

**Where recorded.** Per-fill row into `overshoot_lots` (already carries `avg_exit_price` + `closed_at`); computed daily by a lightweight follow-on view `public.overshoot_morning_exit_calibration_daily` (created in the GO turn, not now).

**Follow-on ledger.** Row R-008 (planned) — first-week calibration receipt, filed at day-5 close.

## §(f) Rollback

**Single cron revert.** Change the 13:45Z schedule string back to 19:50Z. Zero code change, zero migration. The 19:50Z residual/retry sweep continues running unchanged (now temporarily catches everything again, matching pre-DEC-083 posture).

**Trigger conditions:**

1. §(e) RED metric (predictive floor breach for ≥3 of 5 sessions).
2. Any two-day cumulative realized loss attributable to morning-exit fills exceeding **2× honest-net envelope** (≈ 6 bps/slot-night average across the two days).
3. Operator judgment.

**Post-rollback.** File R-009 (rollback receipt), keep DEC-083 record with `superseded-by-rollback` status, revive charter only on new evidence.

---

## SEQUENCING

- **This turn:** DEC-083 DRAFT filed. **No code lands.**
- **On operator GO:** promote DEC-083 into `approved-decisions.md`; execute the single-line cron schedule change; land the monitoring view; open R-008 slot in the ledger.
- **Held queue tonight (independent of DEC-083 GO):** FIX-2 grep-lock+build+deploy+probe (zero-exposure window to 13:30Z) → FIX-8 build+arm (now doubly motivated) → SPY one-shot → FIX-7 memo → Turn-5 stack → replay harness.

## CROSS-REFS

- **R-007** (reproduction ledger; ratifies adoption).
- **ACT-509 Stage-2 Pre-Screen v2** (T1/T2 forfeit budgets).
- **MIG-167** (canonical SLICE-B substrate).
- **INC-135** (commit-before-execute sampling discipline).
- **FIX-1** (negative-age correction), **FIX-2** (grep-lock+deploy rail), **FIX-8** (K-arithmetic across passes — DEC-083 §(c)'s locked contract).
- **DEC-504-4** (sleeve reallocation — orthogonal, unaffected by exit-time move).
- **ACT-558 v4** (honest-net ceiling arithmetic; source for the $600–800 BLEND / $9.7K FLOOR envelope).
- **T4** (audit-writer trap — no platform audit_logs writes), **T5** (strategy/platform separation), **T8** (idempotency), **T9** (MFA via panel policy — unchanged).