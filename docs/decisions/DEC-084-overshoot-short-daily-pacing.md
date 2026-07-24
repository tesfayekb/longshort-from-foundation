# DEC-084 — Overshoot Short-Side Daily Pacing

**Status:** ADOPTED (operator ruling 2026-07-24, pre-Monday 2026-07-27 13:35Z).
**Charter:** ACT-569 (H-1 branch closed by si26 fix; short arm re-qualification
expected 2026-07-24 22:00Z detection onward). This DEC precedes the first
possible short admission, arming the per-side pacing floor before live shorts
enter the book.
**Owner:** overshoot module.
**Interlocks:** ACT-501 (K=5 global daily budget), DEC-080/081/082 (three-guard
bundle), DEC-083 §c / FIX-8 (completion-pass), DW-213/ACT-559 (long-only mode
lifted at first short admit).

## 1. Ruling

Introduce a per-side **short daily entry budget**, distinct from the global
K=5 admission cap. Default value = **1 short admission per session**. Config
key `overshoot_short_daily_budget` in `system_config`; constant fallback
`OVERSHOOT_SHORT_DAILY_BUDGET_DEFAULT = 1`.

A short candidate that has passed the allocation-cap gate but would exceed
the per-side budget is refused with the typed action
`overshoot.entry.short_daily_budget_reached`. Such a refusal does **not**
consume the global K slot — longs (or later shorts in a raised-budget world)
may still fill the remaining K.

## 2. Ladder arithmetic (verbatim, per operator)

> "1 short admit/day × ~5-session SHORT hold ≈ rolling 4-5 concurrent short
> lots → the ladder converges onto the 4-cap in steady state, giving an
> enter-1/exit-1 rhythm that mirrors the long side (which enters ~5/day
> against a 36-cap and settles into enter-5/exit-5 rhythm at maturity)."

Global K=5 unchanged. Short book cap `OVERSHOOT_CAPACITY_SHORT = 4`
unchanged. Long book cap `OVERSHOOT_CAPACITY_LONG = 36` unchanged.

## 3. Config-not-constant + expansion path

`system_config.overshoot_short_daily_budget` holds the live budget so
raises do not require code deploys. **Expansion path** (verbatim):

> "budget raises only by operator DEC gated on live short-sleeve
> evidence (W5.e verdict); roadmap: toward long-side parity
> (cap 36-class) as evidence accrues."

A raise is not implicit from "no live incidents": absence of evidence is
not evidence of absence for an arm that has zero ratified live-fill
history at DEC promotion. Each raise gets its own DEC citing the W5.e
verdict batch that motivated it.

## 4. FIX-8 (DEC-083 §c) interplay

`overshoot.entry.short_daily_budget_reached` is added to
`OVERSHOOT_COMPLETION_TERMINAL_ACTIONS` — a short refused in pass-1 for
per-side pacing is TERMINAL for the day (same reasoning as
`daily_budget_reached`: the ratified admission rate is preserved
regardless of pass count; pass-2 must not re-admit beyond the per-side
budget). Completion-pass `shortEffectiveBudget` = ledger-truth
`priorAdmittedShorts` subtracted from `shortDailyBudget` (mirrors
`computeRemainingBudget`).

## 5. Gate placement (STRICT)

Per-target loop order, unchanged except for the new gate:

```
  position_already_open → regime → reference_bar → i5 → sizing →
  allocation_cap → SHORT_DAILY_BUDGET (side==='short' only) →
  daily_budget → buying_power → shortability → entry_price → submit
```

Short-budget gate is BEFORE the global K gate so shorts refused for
per-side pacing do not consume K. Longs skip the gate entirely (no
`side==='long'` branch — the shorts-only guard is the single condition).

## 6. Identity extension

Identity closure (updated):
```
targets_loaded = orders_submitted
               + position_already_open + regime + refbar + i5 + sizing
               + allocation_cap_reached
               + short_daily_budget_reached
               + daily_budget_reached
               + buying_power + shortability + entry_price
               + submit_failed + fill_unfilled_no_lots
```

## 7. Response envelope

`short_daily_budget` block added to every response (long-only-mode days
show `consumed=0, refusals=0`). Fields: `default`, `configured`,
`source` (`system_config` | `default_fallback`), `effective_budget`,
`consumed`, `refusals`.

## 8. Deploy-truth rail

`SOURCE_VERSION` bumped `fb5fdf13+fix2+fix8` → `fb5fdf13+fix2+fix8+sp1`.
Probe echo required GREEN before Monday 13:35Z.

## 9. Monday 2026-07-27 13:35Z milestone expectation

Post-si26, the short arm is expected to re-qualify. Under DEC-084:
**at most ONE short admit**; any additional short candidates that pass
allocation_cap will be refused with the typed action
`overshoot.entry.short_daily_budget_reached`. Full funnel owed on the
first short-admit receipt (milestone), with DEC-080/081/082 guards +
W5/provenance stamps intact.

## 10. Tests (grep-anchored)

- `daily-budget_test.ts` — pure primitive: default=1, boundary,
  3-candidate ladder, config raise, malformed, remaining helper,
  long/short interplay (K unaffected by short-refusal).
- `completion-pass-allow-list_test.ts` — enumeration includes
  `short_daily_budget_reached`; classifier returns `terminal`.
- `overshoot-entry-run/index_test.ts` — source-sentinels for tally
  field, config load, gate placement (AFTER allocation_cap, BEFORE
  global K), shorts-only guard, counter increment, response envelope,
  completion-pass ledger recompute, SOURCE_VERSION rail.