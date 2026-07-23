# DEC-504-4 AMENDMENT — Cadence-Aware SI Staleness (2026-07-23)

**Status:** RATIFIED (operator ruling, thread record, 2026-07-23)
**Parent:** DEC-504-4 (2026-07-16) — WITHIN-OVERSHOOT SI-stale reallocation
**Root-cause defect:** INC-129 (a) PICKUP-LAG + (b) THRESHOLD-BELOW-CADENCE
**Motivating live instance:** 2026-07-22 sleeve-reallocation engage episode
**Ratification record:** this thread (operator message 2026-07-23 pre-19:50Z)

---

## 1. Deviation from prior baseline

| Item | Prior | Amended |
|---|---|---|
| `OVERSHOOT_SI_STALENESS_MAX_DAYS_DEFAULT` | 21 (strict `>`) | **26** (strict `>`) |
| `overshoot.short_interest.compute` cron | `0 21 1,15 * *` (twice-monthly) | **`0 21 * * 1-5`** (daily Mon–Fri 21:00Z) |
| Staleness semantics | "SI is older than N days" | **"the expected publication FAILED to arrive"** |
| Age > cap consequence | Ritual DEC-504-4 engage on healthy cadence | **Alert-tier: publication cycle missed** |
| UI chip cadence-awareness | Static age display | Age + `next publication expected ~MM-DD` |

---

## 2. Why 26

```
26 = 15d FINRA settlement interval + ~11d worst-normal publication lag
```

Empirically the freshest observation ages to ~24–26 calendar days between
cycles under healthy cadence. A 21d strict-`>` cap therefore fired
`si_stale_active = TRUE` for 3–5 calendar days every cycle on healthy
feeds, ritually engaging DEC-504-4 sleeve reallocation for non-failures.

Under age > 26, the flag now genuinely indicates a **missed publication
cycle** (FINRA/API failure), not the cadence breathing.

---

## 3. Motivating instance — 2026-07-22 engage (first live ritual)

On 2026-07-22 the freshest SI as_of was 2026-07-01 (age 21 → 22 across
the day boundary) — a legal, cadence-expected observation. Under the
21d cap the book-level flag flipped `TRUE`, DEC-504-4 engaged and the
short sleeve was folded into long. Under the amended 26d cap:
`age 21 ≤ 26 → FRESH → engage would not have occurred`. This is
recorded here as the motivating case; the engage row remains valid
under the pre-amendment contract and is NOT retroactively invalidated.

---

## 4. Companion cron fix

`overshoot.short_interest.compute` moves from `0 21 1,15 * *` to
`0 21 * * 1-5` (daily Mon–Fri 21:00Z). The function is idempotent
per D3 (`ON CONFLICT DO NOTHING` on the `(as_of_date, ticker)` PK),
so re-fires on days without a new FINRA publication are safe no-ops
at ~zero cost. Every publication is therefore captured the day it
lands.

**One-shot companion:** operator invokes the function once at
~14:00Z 2026-07-24 to catch the 2026-07-15 publication same-day if
landed; retry Friday if not.

---

## 5. Tests (landed in this amendment)

In `supabase/functions/_shared/overshoot/si-freshness_test.ts`:

- `age 24 fresh` — `siStaleActive('2026-08-08', '2026-07-15', 26) === false`
- `age 26 fresh-boundary` — `siStaleActive('2026-08-10', '2026-07-15', 26) === false`
- `age 27 stale` — `siStaleActive('2026-08-11', '2026-07-15', 26) === true`
- `DEC-504-4 AMENDMENT default = 26` — `OVERSHOOT_SI_STALENESS_MAX_DAYS_DEFAULT === 26`

Sleeve-writer test dates re-anchored (`2026-07-27` / `2026-07-01` /
`2026-06-30`) to preserve the "cap fresh / cap+1 stale" pair semantics
under the new threshold.

---

## 6. Expected sequence (acceptance test)

1. Tomorrow (2026-07-24) ~14:00Z: operator one-shot invokes
   `overshoot-short-interest-compute`.
2. If 07-15 publication has landed at FINRA: `freshest = 2026-07-15`,
   age = 9 (as of 2026-07-24) → `si_stale_active = FALSE` (well
   under 26).
3. `DEC-504-4` sleeve DISENGAGES — the acceptance test fires.
4. Daily cron (`0 21 * * 1-5`) captures each subsequent publication
   the day it appears; the ritual is extinguished.

Under the amended 26d threshold, this week's 07-22 engage would not
have occurred (see §3).

---

## 7. UI companion (landed next turn per operator sequencing)

- Overview SI-staleness chip: cadence-aware, display `age Nd (of 26d
  cap) — next publication expected ~MM-DD` computed from the
  settlement calendar.
- Universe staleness chip: cadence-aware, `fresh ≤ 9d / stale > 9d`
  vs the daily-refresh cadence. Same design principle as the SI
  fix — staleness is measured against expected cadence.

---

## 8. Cross-refs

- Code: `supabase/functions/_shared/overshoot/si-freshness.ts`
  (constant + amendment block), `sql/30_overshoot_short_interest_cron_schedule.sql`
  (schedule + amendment header)
- Tests: `si-freshness_test.ts`, `sleeve-reallocation-writer_test.ts`
- Tracking: INC-129 (this thread, `docs/06-tracking/incidental-findings.md`)
- Parent: DEC-504-4 (2026-07-16)
- Precedent: DEC-080-v2 / DEC-081-v2 weekday-cadence amendment
  (2026-07-21) — same class of fix (cadence-aware staleness threshold)
  applied to analyst-revision feed.