# Overshoot Strategy Module (Skeleton)

> **Owner:** Trading Panel — Overshoot | **Last Reviewed:** 2026-07-02

## Purpose

Overshoot is a separate event-driven trading strategy that captures short-horizon mean reversion after acute idiosyncratic dislocations. It runs on a dedicated Alpaca paper account (broker-first from day one), with a parallel code tree, its own `overshoot_`-prefixed tables and `overshoot.*` crons, and its own operator console. This document is the module home; the strategy charter and full authority chain live at FP-069 (`docs/08-planning/feature-proposals.md`).

## Scope

Applies to everything under `src/features/overshoot/`, `src/pages/trading/overshoot/`, `supabase/functions/_shared/overshoot/`, `supabase/functions/overshoot-*`, `overshoot_*` database tables, `overshoot.*` cron jobs, `overshoot.*` RBAC permissions, and this documentation subtree. Does NOT apply to any `longshort_` / `combiner_` surface — see the separation contract below.

## Thesis + Evidence Pointers

**LONG tail:** 12-1-strong names that drop acutely (band parameter-selected, prior ~6-12% over 1-5 trading days), no earnings/catalyst in window, market/sector flat, stabilization-trigger entry, scale-out or time-stop exit. **SHORT tail (mirror):** 12-1-weak names that pop acutely, same exclusions plus a hard high-short-interest squeeze filter, fade on exhaustion. Capacity up to 20 per side, filled as events qualify. Occupancy is a measured output, never a target; long-tilted outcomes are acceptable when short-side qualification is sparse.

**Evidence spine:** DW-212 (2026-07-02 short-book forensic — 74% of the live short leg's ~$1,022 / 44h loss came from 6 names > 40% below 52-week highs bouncing against a flat SPY (−0.135%); reversal-1w sanctioned-null for all 16 shorts). Overshoot harvests the opposite side of that effect. The >40% drawdown bucket is a tested dimension, not an assumed one; naive "long everything 40% off highs" has negative expected edge until the band is parameter-selected against event-arrival-rate and slippage haircuts.

## SEPARATION CONTRACT (binding, preserve verbatim)

(1) **BROKER** — a SECOND, dedicated Alpaca paper account; new secrets (`ALPACA_PAPER_KEY_OVERSHOOT` / `ALPACA_PAPER_SECRET_OVERSHOOT`, operator-provisioned via Dashboard at Wave 3 per §22.5.3); new client instance; the INC-77 paper-only-guard PATTERN reused, existing client code never modified. Rationale: the longshort rebalance is broker-sourced and closes any account position outside its target book — a shared account means systematic liquidation of overshoot positions. (2) **DATABASE** — reads shared strategy-agnostic market facts (`signal_observations`, the Wave-1 commons); writes ONLY `overshoot_`-prefixed tables; never writes any `longshort_` / `combiner_` row. **PERFORMANCE-LEDGER PRINCIPLE (operator-ratified):** the ONLY performance numbers overshoot ever reports derive from broker (paper) fills in `overshoot_fills` / `overshoot_positions`; any study/parameter artifact lives in `overshoot_study_`-prefixed tables, labeled NON-PERFORMANCE, structurally never merged into any performance surface. (3) **CODE** — parallel tree (`supabase/functions/_shared/overshoot/` + `overshoot-*` edge fns); may import leaf utilities (clock, Polygon fetcher, z-score helpers); MUST NOT import anything under `longshort-execution/`; no existing file gains an import from the overshoot tree; CI-grep-enforced from Wave 1. (4) **CRON** — `overshoot.*` jobs in free slots, disarmed at creation; the live strategy's jobids (51/76/78/87/88/89/90/91/95/97/100/106/109/110/114) untouched. (5) **DOCS** — spec lives in `docs/04-modules/overshoot/`; `CROSSWIND_SPEC.md` and all current-strategy sections: zero edits; project FP/DW/ACT ledgers are shared bookkeeping only.

## Performance-Ledger Principle

Overshoot's only sanctioned performance surface is real paper-fill data captured on the dedicated Alpaca paper account (`overshoot_fills`, `overshoot_positions`, downstream reconciled ledgers). Study outputs (parameter grids, event-arrival counts, historical dislocation stats) live exclusively in `overshoot_study_`-prefixed tables and are labeled NON-PERFORMANCE at the schema level. There is no path — read view, join, aggregate, UI card, or exported report — that merges study numbers into a performance surface. This is a constitutional invariant of the module, not a convention.

## Born-With-The-Lessons

Every overshoot build wave inherits these from v1, non-retrofit:
- Paper-only URL guard on the overshoot Alpaca client (INC-77 pattern reused verbatim).
- Injected clock everywhere; zero raw `Date.now()` / `new Date()` in overshoot kernels (DEC-034 discipline).
- Typed absence; no sentinel numerics on any money path.
- Audit events carry `outcome_class` (`refused_*` / `submitted` / `no_op`) from the first event write (DW-208 lesson).
- Event-idempotency keys on the detector — one dislocation produces one event no matter how many ticks re-observe it.
- Disarm-fire-enable convention on every overshoot cron at creation.
- Overshoot-owned `verify_position`-class reconciliation against account #2 from the first trading wave.
- Producer/consumer cadence coherence verified to fixed-point at design time (DW-208 / DW-210 / DW-211 lesson).

## Wave Ladder

- **W0 — Charter (this landing).** FP-069 entry + this module skeleton + DW-212 + ACT-454. Zero code, zero migration, zero cron, zero secret.
- **W1 — Data commons.** Overshoot-owned MIGs for a daily-bars table + ~5y Polygon backfill (~2,500 tickers, adjusted); a historical earnings-calendar table + backfill (the load-bearing exclusion filter — source chosen by dual-investigation at W1); CI import-guard enforcing the separation contract.
- **W2 [DECISION-GATED at W1 close, operator call] — Historical parameter-selection study.** Grid: drop/pop % × window × momentum-quintile × 52w-drawdown-bucket × earnings-exclusion; conservative slippage haircuts baked in; outputs = parameter choices + event-arrival rates ONLY, `overshoot_study_` tables, non-performance by construction. Operator may KEEP (front-loads parameter learning) or DROP (literature priors, tuned on paper evidence).
- **W3 — Broker-first execution build.** Live event detector over the W1 commons + entry/exit engine + `overshoot_` ledger fed by REAL paper fills on account #2 + own reconciliation + outcome-classified audit from v1. Pre-condition: operator provisions account #2 and the two secrets.
- **W4 — Operator console UI.** Own tree, read-only, injected clock: the event-detector monitor (dislocations detected, per-filter pass/fail with reasons, entries vs skips) + positions/closed-today/equity on account #2 (FP-068 pattern-set reused, not imported).
- **W5 — Measurement + scale decision on real paper numbers only.** No study number ever becomes a scale trigger.

## No Shared Write-Surface With Longshort (Invariant)

Overshoot code MUST NOT write, upsert, delete, or otherwise mutate any row in any table whose name is prefixed `longshort_`, `combiner_`, or that is otherwise owned by the long-short strategy. This includes indirect writes via shared writer helpers under `supabase/functions/_shared/longshort-execution/`, `supabase/functions/_shared/longshort-combiner/`, and any strategy-owned audit surface. Reads from strategy-agnostic commons (`signal_observations`, market facts) are the sole sanctioned cross-boundary interaction, and only as reads. Any violation — even a "temporary" one for a smoke test — is a STOP-condition and reverts the offending change.

## Earnings-Exclusion Is Load-Bearing

News-driven drops drift (PEAD literature): a stock that falls on an earnings miss tends to continue falling for days-to-weeks, not reverse. The reversion edge overshoot targets lives exclusively in non-fundamental dislocations (liquidity air-pockets, index-inclusion sweeps, sector-rotation over-reactions, single-name algorithmic cascades). Trading a dislocation without a clean earnings-exclusion filter mixes two regimes with opposite expected returns and can produce a null or negative net edge even when the pure-reversion sub-population is strongly positive. Consequently the W1 historical earnings-calendar backfill is a **hard gate** on both the W2 study and on live W3 trading — the strategy will not enter a position whose event window overlaps a known earnings date, and the study will not fit parameters on event windows lacking earnings coverage.

## Dependencies

- FP-069 (charter, authority hierarchy anchor).
- DW-212 (evidence spine — short-book forensic).
- INC-77 (paper-only guard pattern to reuse).
- DEC-034 (injected-clock discipline).
- `PolygonPriceHistoryFetcher` (importable leaf utility, W1 data commons).
- `signal_observations` (shared strategy-agnostic market facts, read-only).

## Used By / Affects

Nothing yet — this is a skeleton. At W3/W4 landing this section enumerates overshoot edge functions, cron jobs, and UI routes.

## Risks If Modified

HIGH — this module operates a second broker account against real paper fills. Any change to the separation contract, the performance-ledger principle, or the born-with-the-lessons list requires an FP + operator ratification. Silent tightening of any dislocation threshold (drop %, exclusion window) that reduces expected trade count is ROI-negative and must be surfaced in the work-complete ROI section.

## Related Documents

- [FP-069](../../08-planning/feature-proposals.md) — Charter.
- [DW-212](../../08-planning/deferred-work-register.md) — Evidence.
- [ACT-454](../../06-tracking/action-tracker.md) — Charter landing.
- [Constitution](../../00-governance/constitution.md).
- [Change Control Policy](../../00-governance/change-control-policy.md).