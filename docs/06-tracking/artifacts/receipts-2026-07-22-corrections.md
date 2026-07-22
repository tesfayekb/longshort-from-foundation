# Corrections — Evening 07-22 Receipts (3 items + maiden posture)

> Filed 2026-07-22 20:25Z. Deviations first. INC-125 raw-evidence-only.
> Supersedes §(c) and §(f) of `receipts-2026-07-22-evening.md` on the two
> named points below; all other sections stand.

## (1) DIAL — INC-125 subpart filed (INC-125.b)

**Violation acknowledged.** The evening receipt §(c) (i) failed to paste the
raw `SELECT` for the chartered instrument (open-book, 20 surviving lots on
`as_of='2026-07-22'`), (ii) substituted a new uncharted metric
("realized-only breadth %below_p10") that was never ratified, and (iii)
inverted its own comparison ("30.77% just under 30" — 30.77 > 30).

### RETRACTION

The "realized-only breadth" table in §(c) is **RETRACTED**. It is neither
the ACT-536 dial-as-code instrument nor the ACT-549 clock input. It will
not be revived without a DW proposal that defines the metric, its ladder-N
floor, its trigger, and its relationship to the open-book dial.

### RAW SELECT — chartered instrument, verbatim

```sql
SELECT as_of_date, verdict, count(*)
FROM public.overshoot_dial_daily
WHERE as_of_date='2026-07-22' AND is_realized=false
GROUP BY as_of_date, verdict
ORDER BY verdict;
```

```
 as_of_date | verdict | count
------------+---------+-------
 2026-07-22 | no_data |    20
```

**Open-book breadth for 2026-07-22: 20/20 = `no_data`.** Marks are pending
(pre-close at query time 20:24Z UTC; the equity-snapshot slot at 21:10Z
lands SPY + broker-mark, dial `verdict` populates after the daily bar
backfill). No breach signal for ACT-549 can be derived from this row set;
the clock **does not advance** on today until the marks land and the
recompute re-runs.

### INC-125.b — one-line entry

**INC-125.b (2026-07-22, self-filed):** Evening receipt §(c) substituted a
non-chartered "realized-only breadth" derivation for the chartered
`overshoot_dial_daily` open-book verdict and rendered a prose inversion
("30.77% just under 30"). Standing rule reinforced: dial prints = raw
SELECT verbatim; no derivation, no prose paraphrase, no aggregation over
unchartered sub-slices. Fold into `deferred-work-register.md` under the
INC-125 parent row.

---

## (2) vs-SPY — verbatim card render (raw SQL of the identical computation)

`WindowedGainCard` computes book-vs-SPY from `overshoot_equity_snapshots`
(`broker_equity`, `spy_close`) by taking `(latest/base − 1) * 100` on each
series and subtracting. Base row = earliest snapshot in the selected
window. Raw SQL of the identical computation, run at 20:24Z with the
latest snapshot (07-21; 07-22's 21:10Z slot is future):

```sql
SELECT snapshot_date, broker_equity, spy_close, spy_source, fetched_at
FROM public.overshoot_equity_snapshots
ORDER BY snapshot_date DESC LIMIT 10;
```

```
 snapshot_date | broker_equity | spy_close | spy_source            | fetched_at
---------------+---------------+-----------+-----------------------+-----------------------------
 2026-07-21    |     98288.70  |    748.28 | overshoot_daily_bars  | 2026-07-21 21:10:02.447+00
 2026-07-20    |     94777.99  |    742.09 | overshoot_daily_bars  | 2026-07-20 21:10:01.663+00
 2026-07-17    |     94759.30  |    743.29 | overshoot_daily_bars  | 2026-07-17 21:10:02.162+00
 2026-07-16    |     94657.86  |    750.72 | overshoot_daily_bars  | 2026-07-16 21:10:01.487+00
 2026-07-15    |     98001.47  |    754.81 | overshoot_daily_bars  | 2026-07-15 21:10:01.125+00
 2026-07-14    |    100092.77  |    751.83 | overshoot_daily_bars  | 2026-07-14 21:10:01.709+00
 2026-07-13    |     97818.63  |    749.17 | overshoot_daily_bars  | 2026-07-13 21:10:03.169+00
 2026-07-10    |     99983.92  |    754.95 | overshoot_daily_bars  | 2026-07-10 21:10:01.291+00
 2026-07-09    |     99869.07  |    751.71 | overshoot_daily_bars  | 2026-07-09 14:07:09.419+00
```

**Card render values (verbatim from the hook's computation), 07-21 tip:**

| window | base_date | book Δ%      | SPY Δ%       | vs-SPY (pp)  |
|--------|-----------|--------------|--------------|--------------|
| 7d     | 2026-07-15 | +0.293%     | −0.865%      | **+1.158**   |
| MTD/ITD (from 07-09 first row) | 2026-07-09 | −1.583% | −0.456% | **−1.127** |
| 1d (07-20→07-21) | 2026-07-20 | +3.703% | +0.834% | **+2.868** |

Arithmetic reproducible from the two columns above; no derived quantity
leaves the RPC/hook layer. 07-22 row lands at 21:10Z; card re-renders on
that write. Prose delta from evening §(f) is superseded by the numeric
card here.

---

## (3) Schedule ruling — acknowledged

- **ACT-564 spec file** — locked to **tonight**. Verbatim paste, docs-only.
  Lands as `docs/08-planning/specs/ACT-564-strategy-profile-page.md` this
  turn (see below).
- **ACT-564 full page build** — tomorrow's FIRST deliverable.
- **Tomorrow's PARALLEL lane** — ACT-515 canary byte-match + engine configs
  (second consecutive carry on the canary; engine holds two standing
  operator answers: drawdown at 1x/2x, sector-cap verdict).
- **Hygiene queue** — DW-224, ACT-560, HK-001 prose slot BEHIND the two
  above.
- **ACT-558 overnight-cash-drag** — one more night carry, then it becomes
  a **NAMED SLIP** on the register.

---

## (4) 22:00Z Maiden Flight — DEC-504-4 SI-STALE BRANCH — FUTURE (~T-1.5h)

UTC now at query time = **2026-07-22 20:24:41Z**. 22:00Z artifact not yet
available. Pre-committed flipped-table verdict rubric (per INC-125,
judged only on first sight of the actual row, no forward paraphrase):

- [ ] **Engaged audit row** on `overshoot_audit_logs` — actor=`system` or
      `si-freshness`, event carries `active=true`, `prior={long:36,short:4}`,
      `target={long:40,short:0}`, non-null `correlation_id`.
- [ ] `overshoot_detection_runs.sleeves` = `{"active":true,"long_target":40,`
      `"short_target":0,"prior":{"long":36,"short":4},"reason":"si_stale_active"}`.
- [ ] `overshoot_detection_runs.detector_version` = `'aff20a13'`.
- [ ] `overshoot_detection_runs.refusal_class_counts` populated with the
      FULL 15-class union (INC-129 drift-guard), explicit zeros for
      zero-firing classes — no missing keys.
- [ ] `overshoot_target_positions` = **40 LONG rows, 0 SHORT rows**, every
      row carrying `w5_reallocation_ref` (non-null).

**Investigate-don't-rationalize:** if `si_stale_active=TRUE` and any of
the five above is missing, the DEC-504-4 wire is defective and a Tier-A
incident is filed same turn. No "eventual consistency" excuse; the writer
is idempotent and synchronous.

---

## (5) DW-225 — Step (b) disposition for the 2 'U' hits

Per `DW-225-wall-clock-overshoot-scan.md` §2, the two `U` (UI-display)
hits are:

| # | file:line | verbatim | class | step-(b) disposition |
|---|---|---|---|---|
| 22 | `src/features/overshoot/components/portfolio/reconcile.ts:65` | `daysHeldFrom(entryIso, now: Date = new Date())` | U | `// allow-now-in-business-logic: ADR-003 U — UI 'days held' chip; `now` is injectable, tests pass a fixed clock. |
| 23 | `src/features/overshoot/components/OvershootOverview.tsx:101` | `const now = new Date();` | U | `// allow-now-in-business-logic: ADR-003 U — UI 'as of' render clock; render-only, not a decision surface. |

**Path:** annotate both in the same commit that arms the scanner scope
(step-c); the scanner won't enter `src/features/overshoot/components/`
yet — deferred to a follow-up UI-clock policy (DW-225.a) — but the
annotations land now so the policy lift is mechanical when it arrives.
No code fix; no defect; no money-path leakage.

---

## Docs queue tonight — after this file

1. `docs/08-planning/specs/ACT-564-strategy-profile-page.md` — spec paste (this turn).
2. `docs/08-planning/deferred-work-register.md` — fold INC-125.b + this
   corrections cite + DW-225 step-(b) disposition rows.

All other hygiene items (DW-224, ACT-560, HK-001) slot BEHIND tomorrow's
parallel lane per ruling (3).