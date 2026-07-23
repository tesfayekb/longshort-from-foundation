# DEC-083 — Morning-Exit Adoption at 09:45 ET (ACTIVE)

**Status:** ACTIVE — operator-ratified 2026-07-23 (one-word GO received). Index entry landed in `docs/08-planning/approved-decisions.md`. Execution artifacts (cron move, monitoring view, DST watch-row, R-008 ledger slot, 2026-07-24 pre-commit table) serialized across follow-on turns per anti-completion-theater discipline; sequence and receipts anchored below.

**Operator-GO provenance.** Operator utterance "DEC-083: GO — operator word received 2026-07-23. EXECUTE ADOPTION NOW, receipts binding" (turn timestamp 2026-07-23) discharges the draft-gate defined in the pre-GO §SEQUENCING block. No prior soft-GO exists; this is the single ratifying event.

**Execution ledger (post-GO).**

| Step | Artifact | Turn | Status |
|---|---|---|---|
| (1) Promote DEC-083 → approved-decisions.md | `docs/08-planning/approved-decisions.md` (DEC-083 index entry) | this turn | LANDED |
| (4) §(g) DST watch-row | `docs/06-tracking/dst-retiming-watch-2026-11-01.md` | this turn | LANDED |
| (5) R-008 slot opened | `docs/06-tracking/ACT-551-reproduction-ledger.md` (R-008 header) | this turn | LANDED |
| (6) 2026-07-24 morning pre-commit table | `docs/06-tracking/2026-07-24-morning-precommit.md` | this turn | LANDED |
| (2) Cron move 19:50Z → 13:45Z + seed + registry byte-match + §22.5.1 read-back | `sql/` seed + `cron.alter_job` + `job_registry` UPDATE (single transaction) | next turn | PENDING (requires seed-file + registry-row read; no fabricated read-back) |
| (3) Monitoring view `overshoot_morning_exit_calibration_daily` + auto-rollback rule | MIG-168 (planned) | after (2) | PENDING |

Serialization rationale: items (2) and (3) each require pre-transaction reads I have not honestly captured; batching them with the doc-only steps risks a fabricated read-back (INC-114/115/121 recurrence class). One item per turn, real receipts.

**Title:** Morning-Exit Adoption at 09:45 ET (T1+T2 primary time-exit cron move 19:50Z → 13:45Z).

**Authority chain (R-007 REPRODUCED).** Charter (ACT-509 Stage-2 morning-exit leg) → Pre-Screen v2 (T1 forfeit 4.30 bps / T2 5.36 bps ALIVE-STRONG) → Canonical SLICE-B substrate (6,538 pairs / 189,673 bars, MIG-167) → Committed SQL (`scripts/act-509/verdict-exec-cost-pooled.sql`, INC-135 discipline) → Pooled Verdict (conservative Δ = 2.956 bps at 09:45 ET, ADOPT for both tiers). Supervisor independently re-derived every delta; ratification recorded in R-007 ledger row.

**Honest-net envelope — CANONICAL EXPRESSION (operator-preferred, ratified 2026-07-23).**

Expressed as **yield on the idle slice** — the ~4.5 slots × $2.5K ≈ **$11.25K/night** of capital that DEC-083 activates for one extra overnight cycle per day (≈ 1/10th of book):

- Gross overnight edge on slice ≈ **26%/yr** (matches strategy blend — operator's intuition verbatim).
- Minus forfeit ≈ **13.5%/yr**.
- Minus friction ≈ **7.5%/yr**.
- **NET ≈ 6%/yr on the slice at BLEND** (≈ **86%/yr at FLOOR**), vs **0%/yr today** (slice idle at 19:50Z anchor).

**Whole-book equivalent (secondary line, not headline):** +0.6–1.2%/yr, ≈ $600–800/yr BLEND, ≈ $9.7K/yr FLOOR.

Below the DEC-085 whole-book headline threshold; adopted on structural microstructure grounds plus positive-EV, cross-year texture consistency (all five years ADOPT-band; worst 2026 cell Δ = 4.530 bps < 5.0 T2-lower). **The slice-yield framing is the canonical ROI expression; the whole-book % is the secondary line for portfolio-level views.**

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

The 19:50Z cron is retained as the **residual/retry sweep**, catching:

**Amendment (2026-07-23 GO turn discovery).** The pre-DEC-083 world had ONE row at 19:50Z (`overshoot.exit.run`, jobid 123). The GO transaction preserved jobid continuity on the primary by moving jobid 123 to `45 13 * * 1-5` and creating a NEW row `overshoot.exit.run.residual` (jobid 134) at `50 19 * * 1-5` with a byte-identical command body (md5 `3b2be524cd7f807e1a5eb89522945da5`). Framing correction: **the residual is a newly-created row; the original 19:50Z row became the moved primary.** The two-row post-state is the invariant §(b) guarantees; the identity mapping is the implementation detail this amendment nails down. DST watch-row (1) points at `overshoot.exit.run.residual` accordingly.

Catching:

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

## §(g) F1.a DST re-time watch-row addendum (binding regardless of GO timing)

**Motivating rail.** PIN-2 (overshoot.md L108) documents `pg_cron` as UTC-fixed; the F1.a re-time watch-row governs seasonal ET-anchored crons so they survive the US DST transition on **2026-11-01** (fall-back). The 19:50Z cron is already on that watch-row (19:50Z = 15:50 ET summer → 14:50 ET winter, ~70 min early).

**Addendum.** On DEC-083 GO, the new **13:45Z** cron (09:45 ET summer → 08:45 ET winter, ~45 min pre-open) MUST be added to the same F1.a 2026-11-01 watch-row so the winter drift is caught by the same instrumentation loop rather than silently mis-firing pre-open. **Any additional cron the adoption touches** (e.g., a 14:05Z FIX-8 redeploy anchor if adopted as ET-relative) inherits the same watch-row obligation.

**Handler-side guard already in place.** The exit-run handler reads `/v2/clock` on every run and refuses typed `market_closed` on pre-open / weekends / holidays (PIN-2), so a winter-mis-fired 13:45Z cron fails typed-closed rather than transacting. The watch-row is the *scheduling-layer* correction; the typed refusal is the *behavioural* safety net. Both remain in force.

**Applies whether DEC-083 GOs before or after 2026-11-01.** If GO lands pre-DST, the 13:45Z cron enters the watch-row at GO turn. If GO lands post-DST, the watch-row is amended in the same GO turn to include the (already-winter) new cron.

**Not landing now (no cron change until GO):** this addendum is a *policy* attachment; the watch-row entry is written in the GO turn alongside the actual cron move so the two artifacts land together.

---

## SEQUENCING

- **This turn:** DEC-083 DRAFT filed. **No code lands.**
- **On operator GO:** promote DEC-083 into `approved-decisions.md`; execute the single-line cron schedule change; land the monitoring view; open R-008 slot in the ledger.
- **On operator GO (adds from §(g)):** amend the F1.a 2026-11-01 DST re-time watch-row to include the 13:45Z cron (and any further ET-anchored crons DEC-083 touches).
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
- **PIN-2** (overshoot.md L108 — DST drift accepted DOCUMENTED + INSTRUMENTED; source of §(g) watch-row obligation).
- **F1.a 2026-11-01 DST re-time watch-row** — attachment target for §(g).