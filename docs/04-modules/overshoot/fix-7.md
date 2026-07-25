# FIX-7 — Capacity Arithmetic Correction Memo

**Filed:** 2026-07-25 (weekend session). **Status:** CLOSED-CORRECTED.
**Supersedes:** the "shortfall table" framing used in the 2026-07-23
RULINGS pre-19:50Z pack, which conflated `capacity_remaining` (a per-run
headroom read) with `book_slots_open` (a whole-book capacity envelope).

## 1. What FIX-7 is

The 07-23 shortfall table reported "capacity_remaining per session" but
read it against the **daily entry budget** (`K = overshoot_daily_entry_
budget = 5`), not against the **sleeve capacity envelope** (long-cap 36
fresh / 40 realloc). That framing made the book look permanently
starved, when in fact the book is *filling on rails* toward its cap.

FIX-7 replaces the shortfall table with the correct arithmetic below.

## 2. Frozen inputs (cited, not asserted)

| Input | Value | Source |
|---|---|---|
| Long cap, fresh sleeve | **36** | `_shared/overshoot/si-freshness.ts:288` (`(0.90, 0.10) capacity (36, 4)`) + `sleeve-reallocation-writer_test.ts:41` |
| Long cap, SI-stale reallocated sleeve | **40** | same, `si-freshness.ts:289` (`(1.00, 0.00) capacity (40, 0)`); reallocation predicate `si-freshness.ts:124-131` |
| Daily long entry budget `K` | **5** | `overshoot_daily_entry_budget` in `system_config` (default per FIX-9 constants; refusal `daily_budget_reached`) |
| Daily short entry budget | **1** | `system_config.overshoot_short_daily_budget = 1` (DEC-084 / +sp1 wiring) — long-only mode active (DW-213/ACT-559), so this is dormant |
| Open lots at Fri 2026-07-24 close | **12** | `SELECT count(*) FILTER (WHERE status='open') FROM overshoot_lots` @ 2026-07-25 17:31:37Z → 12 |
| Trailing 3-session admit tally (07-22 / 23 / 24) | **5 / 2 / 5** (mean 4.0) | `overshoot_lots.entry_ts::date`, side='long' only |

## 3. Book-full arithmetic

`sessions_to_full = ceil((cap − open_lots) / rate)`

| Sleeve state | Cap | Slots to fill (cap − 12) | @ K=5/session (rails) | @ observed rate 4.0/session |
|---|---:|---:|---:|---:|
| Fresh (baseline; live today per long-only DW-213) | 36 | 24 | **5 sessions** → Fri **2026-07-31** close | **6 sessions** → Mon **2026-08-03** close |
| SI-stale reallocated | 40 | 28 | **6 sessions** → Mon **2026-08-03** close | **7 sessions** → Tue **2026-08-04** close |

**Honest one-line answer:** the book fills between **Fri 2026-07-31 and
Tue 2026-08-04**, depending on (a) whether the SI-stale sleeve
reallocation trips (36 vs 40) and (b) whether next week's admit rate
matches the rails (K=5) or the trailing mean (4.0). Not "starved"; not
"immediate". *Filling*.

## 4. What retires

- The **shortfall-table framing** — `capacity_remaining` reported as a
  per-run scalar is retained (FIX-7-b in `x-source-version`/probe output)
  but must not be interpreted as book-level headroom. Book-level headroom
  = `cap − open_lots` and is only meaningful against the sleeve cap.
- Any downstream language of the form *"the engine is failing to fill K
  because of shortfall"* is retired. The correct language is *"the engine
  admitted N/K on session S; remaining slots to sleeve-cap = M; expected
  book-full ~D at current rate"*.

## 5. What does NOT change

- No code change. FIX-7 is a framing correction, not a wire change.
- K=5, cap 36/40, and DEC-084 short pacing all stand as-is.
- The morning-exit monitor (MIG-168), FIX-8 completion filter, FIX-9
  pass-scoped idempotency, and +sp1/+si26 gates are unaffected.

## 6. Auditor cross-refs

- 07-23 shortfall receipt: `docs/06-tracking/artifacts/receipts-2026-07-22-evening.md`, `receipts-2026-07-22-corrections.md`.
- Sleeve capacity contract: `supabase/functions/_shared/overshoot/si-freshness.ts` §§124-131, 284-289.
- Reallocation writer & audit event grammar: `_shared/overshoot/sleeve-reallocation-writer.ts` (`overshoot.sleeve.reallocation_engaged` / `_disengaged`).
- Live open-lot count query used above: reproducible via `SELECT count(*) FILTER (WHERE status='open') FROM public.overshoot_lots`.

**Memo end. Register row closes on merge.**