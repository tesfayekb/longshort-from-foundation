# ACT-564 — Strategy Profile Page (Read-Only) — SPEC

> **Status:** SPEC-LOCKED (tonight). Build lands as tomorrow's first deliverable.
> **Owner module:** overshoot (per T1 layout). Mirrors permissible for longshort later.
> **Charter:** operator-visible, one-glance identity of a live strategy: what it
> is, what it decides on, what it refuses on, what it costs, and what it's
> currently doing — all pulled from the SSOT the engine already writes to.
> No writes. No wall-clock in the render kernel beyond ADR-003-U "as-of" chip.

## §1 Route + shell

- **Route:** `/trading/overshoot/profile` (registered via
  `src/config/trading-navigation.ts` façade import from
  `src/features/overshoot/index.ts`; T5 carve-out compliant).
- **RBAC:** `overshoot.view` (T3 two-segment).
- **Layout:** `TradingLayout` shell; strategy pages under
  `src/pages/trading/overshoot/ProfilePage.tsx` importing ONLY from
  `@/features/overshoot`.
- **Component root:** `src/features/overshoot/components/profile/StrategyProfilePage.tsx`.

## §2 Data sources (all read-only, all existing SSOT)

| Section | Table / view / registry | Notes |
|---|---|---|
| Identity header | `overshoot_strategy_config` (single row) + `job_registry` filtered `overshoot_%` | Version, corpus_run_id, xw, ladder, min_n. |
| Capacity posture | `overshoot_detection_runs` latest `sleeves` jsonb | Renders `active`, `long_target`, `short_target`, `prior`, `reason`. |
| Freshness dials | derived from `si-freshness` helper via edge fn `overshoot-detection-run` GET metadata | `si_stale_active`, `analyst_stale_active`, `ma_stale_active` (age vs 21d/4d/4d). |
| Refusal ledger | `overshoot_detection_runs.refusal_class_counts` (latest) | 15-class INC-129 union; explicit zeros shown. |
| Book snapshot | `overshoot_lots` (open) + `overshoot_target_positions` (latest run) | Counts by side; W5-ref presence indicator. |
| Dial verdict | `overshoot_dial_daily` (today, `is_realized=false`) | Raw verdict counts; no derived breadth. |
| Equity/vs-SPY | `overshoot_equity_snapshots` (last 90d) | Reuses `WindowedGainCard`. |
| Cron cadence | `job_registry` where key LIKE `overshoot_%` | `cron`, `last_run_at`, `next_expected_at`, status chip. |
| Governance | static: DECs cited (023, 080-v2, 081-v2, 082, 504-4, 034) | Prose block, docs-linked. |

**No new tables. No new RPCs. No writes.** If a data field doesn't exist
yet in SSOT, the section renders typed-absence ("—") — never a synthesised
value (§2-axiom-4 discipline).

## §3 Tabs (single page; anchor tabs, not routes)

1. **Identity** — strategy card: name, phase, detector_version, corpus_run_id,
   ladder rungs, min_N floor, xw, review cadence.
2. **Posture** — capacity sleeves (fresh vs stale branch), freshness dials
   (SI/analyst/M&A + last age in days), engaged-audit-row indicator.
3. **Decisions** — refusal-class table (15 rows, latest run counts + 7d
   trailing mean); admission funnel (universe → eligible → candidates →
   admitted → placed → filled) from latest run.
4. **Book** — open lots by side, cohort-tuple stamps (band/win/mq/dd),
   W5-ref coverage %, T2-age distribution.
5. **Performance** — `WindowedGainCard` (7d/MTD/1d) + dial verdict tally
   (today's open-book raw SELECT, verbatim).
6. **Governance** — DEC citations, active kill-switches
   (`kill_switches` where scope='overshoot'), open incidents (INC-*)
   pointer to `deferred-work-register.md`.

## §4 Empty-states + honesty rules

- No `broker_equity` row for today → "Pending 21:10Z snapshot" chip.
- `spy_close IS NULL` → "SPY bar pending" (no fabricated compare).
- `refusal_class_counts` missing a key → **red border** on the table
  (INC-129 drift alarm, not a fallback).
- `sleeves` jsonb absent → "Pre-DEC-504-4 run" chip; never invents branch.
- Dial verdict `no_data` for all rows → "Marks pending" chip; percentage
  breadth **is not computed** (§(1) rule from `receipts-2026-07-22-corrections.md`).

## §5 Non-goals

- No writes, no admin actions, no dry-run kicks (those live in the
  admin overshoot page).
- No new derivations (breadth-% derivations require a chartered DW).
- No cross-strategy comparisons (long-short profile will mirror this
  spec; sibling-import ban T5 applies).
- No wall-clock in kernels; the single UI "as of" chip uses ADR-003-U
  render clock only.

## §6 Acceptance (tomorrow's build gate)

- Route reachable at `/trading/overshoot/profile`; RBAC denies without
  `overshoot.view` (e2e).
- All six tabs render against live data; all typed-absence chips fire
  when the underlying column is null (unit).
- No new tables, no new migrations, no new edge functions in the diff.
- Byte-scan: no `Date.now()` / no-arg `new Date()` in the render tree
  beyond the two ADR-003-U annotated hits (DW-225 disposition).
- Storybook / component test for `StrategyProfilePage` with a fabricated
  SSOT read-mock covering the empty-state matrix in §4.

## §7 Out-of-scope follow-ups

- Long-short profile page (mirror this spec after Phase-L gate).
- Interactive drill-downs into refusal classes (deferred to a DW).
- Historical posture playback (needs a snapshot table not yet ratified).

**Spec closed. Build begins tomorrow.**