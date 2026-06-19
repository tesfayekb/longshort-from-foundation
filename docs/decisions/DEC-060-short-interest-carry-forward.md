# DEC-060 — Short-Interest Carry-Forward Design (Pre-Registered)

> **Owner:** Long-Short Module | **Last Reviewed:** 2026-06-19
> **Status:** active
> **Pre-registered:** 2026-06-19 (before any DW-106 carry-forward row has been emitted)
> **Supersedes:** none
> **Superseded by:** —

## Purpose

Lock the short-interest carry-forward design **before** the writer cron lands (DW-106-c) so the rare-tail staleness bound, the no-decay choice, the heal-date stamping mechanism, the forward-only scope, and the `carried_forward` flag cannot be retroactively tuned to the evidence the rule will later be applied to. Mirrors DEC-059's pre-registration discipline.

The downstream consumer of this decision is the DEC-059 n≥30 measurement clock: the §1 "all 30+ seed-days measured AFTER DW-106 coverage-heal lands" condition resolves against the **heal_date** stamped by the mechanism described here.

## Scope

Applies to:
- Signal `short_interest_change_30d` (Signal #9) only.
- The Phase-2 signal-layer writer side; the combiner reader is untouched.

Does NOT apply to:
- Any other signal (#1/#2/#3/#4/#5/#6/#7/#8). The 5 implicitly-carrying event-window signals + the 2 daily-native price signals + PEAD's explicit decay are out of scope. DW-108 typed-absence uniformity stays separate/deferred.
- The combiner reader (`feature-assembler-orchestrator.ts`, `ranker-orchestrator.ts`). Reader-side at-exact-`as_of` query is locked by test and remains unchanged.
- LightGBM training / promotion (3.3 FP).
- Any backfill of pre-heal as_of dates.

## The Decision (verbatim — these parameters are locked)

### (i) Hold-last-value, NOT decay

Short interest is a **state** (the current short book), not an event. The signal value `-(SI_pct_float[T] - SI_pct_float[T-2])` already encodes time-as-Δ across two SEC reports. Layering decay on top of the held value would double-discount the time dimension and degrade the signal monotonically with as_of-distance from publication — wrong for a state variable, and inconsistent with how the signal is consumed downstream (the §6.4 fallback and the 3.2 LightGBM input both read the raw z-score, not a decayed envelope).

The carry rule is therefore: **on every weekday cron fire, re-emit the most recent published SI row's value verbatim**, with the publication date carried as `as_of_publication` metadata and the current as_of stamped as the row's `as_of_date`. The held value is byte-identical to the last publication until a successor publication arrives or the staleness bound trips.

### (ii) 22-calendar-day staleness bound

- FINRA publishes short interest **twice monthly** (1st and 15th business-day adjacent), so the natural inter-publication interval is ~15 calendar days.
- The bound MUST cover one missed-publication delay (holiday slippage, vendor latency) plus a small buffer — otherwise it trips false typed-absence on cycles that are merely late, not missed.
- **22 calendar days** = ~15d cadence + ~5d max observed publication slip + ~2d buffer. Trips to typed-absence only on a **genuinely missed cycle** (two consecutive non-publications), which is the actual error mode this bound exists to detect.

Rejected alternatives:
- **<20d (e.g. 16d, 18d):** Tight enough to trip on the worst historically-observed late cycles. Re-introduces the n=4 gate-fail failure mode the carry-forward exists to eliminate; costs coverage on exactly the holiday-slipped cycles where continuity matters most. NOT acceptable.
- **≥30d:** Silently feeds month-old short-interest data into the combiner. Concrete ROI bleed: a 30d-stale SI value can no longer reflect the actual short book and the `-(SI[T] - SI[T-2])` Δ becomes structurally meaningless. NOT acceptable.

The bound is a **read-time rare-tail parameter**. It does NOT shift the DEC-059 n≥30 clock (that clock starts at `heal_date` regardless of the bound), and it does NOT affect coverage on the normal-cadence path (the held value is superseded by a fresh publication well before 22d). Re-tuning post-data requires a superseding DEC per §(vi).

### (iii) `heal_date` stamping

- A new `system_config` row keyed `dw_106_short_interest_heal_date` (jsonb `{"heal_date": "YYYY-MM-DD"}`) is **upserted at runtime on the first carry-row-emitting cron fire** — i.e. the first operationally-healed as_of after the DW-106-c writer cron is armed.
- The `system_config` table shape (`key text PK, value jsonb`) confirmed at DW-106-a accommodates this upsert without migration.
- Stamped **once**, never overwritten thereafter; the value-version trigger logs any divergence.
- The 3.M read-model + DEC-059 §1 evaluation filter `combiner_forward_returns.as_of_date >= heal_date` on this stamp.
- Citation-locked to the FP-053 closure SHA.
- Stamping is a **DW-106-c runtime concern**, NOT DW-106-a (this DEC) scope. DW-106-a confirms the mechanism is admissible and locks the key name + payload shape; DW-106-c implements the upsert in the cron handler.

### (iv) Forward-only — no backfill

DEC-059 §1 requires n≥30 paired seed-days measured **AFTER** DW-106 coverage-heal. Pre-heal seed-days are **explicitly excluded** by the rule regardless of their data quality. Backfilling carry-forward rows into pre-heal as_of dates would therefore:
- Buy **zero acceleration** of the n≥30 clock (the §1 cutoff is `as_of_date >= heal_date`, not `row_exists`);
- **Corrupt** the cutoff semantics (a backfilled row carries no operational provenance — it is a re-derivation of what the writer would have emitted, not what it did emit);
- Risk smuggling a relaxed-criteria seed-day into the measurement window if a future operator forgets the heal_date filter.

Forward-only is the **safe** default and the **fastest** option (backfill buys no time-to-gate-decision acceleration).

### (v) `carried_forward` audit flag

- The DW-106-a migration adds `signal_observations.carried_forward boolean NOT NULL DEFAULT false` with CHECK `(carried_forward = false OR (is_present = true AND value IS NOT NULL))` — a carried row MUST be a present, non-null held value.
- The combiner reader treats `carried_forward=true` rows identically to native publication rows by design; the flag is **audit-only** and MUST NOT leak into the feature vector. A DW-106-b reader-side regression test pins this.
- The flag enables forensic queries: per-signal carry rate per day, drift between carried and native cohorts, audit trail of the heal_date transition.

### (vi) Pre-registration clause

This decision is locked **2026-06-19**. Any change to:
- the hold-last-value rule (vs. decay or any other transform)
- the 22-calendar-day staleness bound
- the heal_date stamping mechanism (key name, payload shape, one-time vs re-stampable semantics)
- the forward-only scope (vs. any backfill)
- the `carried_forward` flag semantics or its audit-only constraint

requires (a) an explicit FP authored *before* the change is applied to any in-flight carry emission, AND (b) a superseding DEC that cites the empirical or design reason. Changes that respond to the actual evidence ("the bound trips too often, lower it to 18d") are explicitly forbidden — that is the failure mode this rule exists to prevent.

## Why these numbers

- **22 calendar days:** covers FINRA's ~15d cadence + ~1 missed-publication delay (5d slack) + 2d buffer. <20d trips false typed-absence on holiday-slipped cycles; ≥30d silently feeds month-old shorts. 22d trips to typed-absence only on a genuinely missed cycle.
- **Hold-last-value (no decay):** short interest is a state variable; the Δ form already encodes time; decay would double-discount and degrade the signal monotonically with as_of-distance.
- **Heal-date stamped once at first carry-emission:** the operational definition of "DW-106 coverage-heal landed" is the first as_of where the writer actually emitted a carry row, not the FP-053 commit SHA — the latter is the design landing, the former is the data landing.
- **Forward-only:** backfill buys zero clock acceleration (DEC-059 §1 filters on as_of >= heal_date, not on row existence) and corrupts the cutoff semantics.

## What this DEC does NOT decide

- The exact cron schedule (DW-106-c).
- The exact handler skeleton (DW-106-c — will mirror `longshort-short-interest-compute` and reuse `verifyCronSecret` + `writeStrategyAuditEvent`).
- The carry rate's actual empirical value (only observable post-heal).
- Whether the bound will ever need re-tuning — answer comes from post-heal telemetry only, and any re-tune requires §(vi).

## Authority

Operator-authorized supervisor session 2026-06-19. Pre-registered at FP-053 / ACT-248. Schema foundation landed at this commit's migration (`signal_observations.carried_forward` + CHECK).

## Dependencies

- [DW-106](../08-planning/deferred-work-register.md) — the deferred work item being resolved across DW-106-a/b/c
- [FP-053](../08-planning/feature-proposals.md) — parent feature proposal
- [DEC-059](DEC-059-dw109-resolution-rule.md) — downstream consumer of `heal_date`; §1 n≥30 cutoff resolves against the stamp this DEC defines
- [Signal #9 (`short_interest_change_30d`)](../04-modules/longshort/signals/short-interest-change.md) — the sole signal whose writer the carry-forward modifies (FP-041 / MIG-076; status ARMED)
- `public.system_config` table (key/jsonb shape — confirmed at DW-106-a as carry-capable)

## Used By / Affects

- All future DW-106-b (pure carry logic) + DW-106-c (cron + heal_date upsert) work.
- The DEC-059 n≥30 measurement-window evaluation.
- Any AI agent implementing or reviewing the short-interest carry must read this DEC verbatim and confirm the parameters before authoring code.

## Risks If Changed

CRITICAL — silently relaxing the staleness bound (≥30d) re-introduces stale-shorts ROI bleed; silently tightening it (<20d) re-introduces the coverage failure mode this work exists to eliminate; silently re-stamping `heal_date` invalidates the DEC-059 n≥30 clock; silently backfilling corrupts the §1 cutoff. Changes require both an FP and a superseding DEC per §(vi).

## Related Documents

- [approved-decisions.md](../08-planning/approved-decisions.md) — index entry (DEC-060 row)
- [Deferred Work Register](../08-planning/deferred-work-register.md) — DW-106 (in-progress, FP-053)
- [Feature Proposals](../08-planning/feature-proposals.md) — FP-053 entry
- [Signal #9 module doc](../04-modules/longshort/signals/short-interest-change.md)