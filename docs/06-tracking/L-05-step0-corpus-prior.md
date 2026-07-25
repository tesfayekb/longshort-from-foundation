# L-05 STEP-0 — Corpus Prior Test (Day-of-Week Long Forward-Return Tilt)

**Charter:** `docs/06-tracking/charters/L-05-dow-pacing-quarantined.md`
**Ruling:** STEP-0 quarantine — corpus prior test MUST pass before any
live A/B is chartered. Post-hoc pattern → data-snooping caveat governs
(ACT-570 Phase-1 Stage-2 grammar).
**Now:** `SELECT now() → 2026-07-25 17:16:24.866219Z`.
**Corpus:** `public.overshoot_study_candidate_events`, `side='long'`,
`fwd_return_5d IS NOT NULL`. Total n = **255,649** events.
**Reference basis:** `fwd_return_5d` (5-session forward return from
event-date reference — same construction as ACT-573 Phase-1).

---

## ONE-LINE ANSWER

**FAIL.** All four quarantine sub-gates fail. Wed lift over the
Thu/Fri max is **−0.36 bps** (required ≥ **+25 bps**); non-monotone
(Wed < Fri); non-robust across 2022–2025 (best DoW rotates yr-by-yr);
earnings-scrubbed residual is negative (Wed 38.48 vs Fri 39.65). L-05
is **NOT-A-SIGNAL** under Constitution Rule 8. The $25K/yr projected
prize is **RETRACTED** on the record.

---

## §1 Gate table (verbatim per charter §STEP-0)

| Gate | Requirement | Observed | Verdict |
|---|---|---|---|
| G1 n ≥ 10,000 / DoW | Every DoW cell ≥ 10k | Mon 47,050 · Tue 53,323 · Wed 52,340 · Thu 52,385 · Fri 50,551 | **PASS** (only PASS gate) |
| G2 Wed lift ≥ +25 bps | mean(Wed) − max(mean(Thu), mean(Fri)) ≥ +25 | 39.19 − max(39.11, 39.55) = **−0.36 bps** | **FAIL** (~70× short) |
| G3 Monotone Wed>Thu AND Wed>Fri | Both inequalities strict | Wed>Thu: +0.08 ✓ · Wed>Fri: **−0.36 ✗** | **FAIL** |
| G4 k=10,000 bootstrap CI excluding zero | Wed−max(Thu,Fri) CI does not straddle 0 | Δ=−0.36 bps; per-cell SD ≈ 1,400 bps; SE(Δ) ≈ √(σ²/n_W + σ²/n_max) ≈ 8.6 bps → 95% CI ≈ [−17, +17] bps. Zero is inside by 20× | **FAIL** |
| G5 Regime-robust 2022–2025 | Wed the best (or tied-best) DoW in every year | 2022 best=Wed(18.51) · 2023 best=Mon(87.65) · 2024 best=Thu(52.54) · 2025 best=Mon(61.79). Wed best only 1/4 years | **FAIL** |
| G6 Earnings-confound residual ≥ +15 bps | Δ still ≥ +15 after `|days_to_nearest_earnings| > 3` scrub | Wed 38.48 vs Fri 39.65 → residual = **−1.17 bps** | **FAIL** |

**Score:** 1/6 gates pass (only the sample-size floor). The charter
conjunctive rule (all substantive gates must pass) trips at G2 alone;
G3–G6 remove any wiggle room.

---

## §2 Evidence chains (SQL verbatim — reproducible)

```sql
-- G1/G2/G3 — pooled DoW cells (all yrs, no earnings filter)
SELECT EXTRACT(DOW FROM event_date)::int AS dow,
       COUNT(*) AS n,
       ROUND(AVG(fwd_return_5d)*10000, 2) AS mean_bps
FROM public.overshoot_study_candidate_events
WHERE side='long' AND fwd_return_5d IS NOT NULL
GROUP BY 1 ORDER BY 1;
-- dow 1 (Mon): 47,050 · 39.63
-- dow 2 (Tue): 53,323 · 38.91
-- dow 3 (Wed): 52,340 · 39.19
-- dow 4 (Thu): 52,385 · 39.11
-- dow 5 (Fri): 50,551 · 39.55

-- G6 — earnings-confound residual (|days_to_nearest_earnings| > 3)
SELECT EXTRACT(DOW FROM event_date)::int AS dow,
       COUNT(*) AS n,
       ROUND(AVG(fwd_return_5d)*10000, 2) AS mean_bps
FROM public.overshoot_study_candidate_events
WHERE side='long' AND fwd_return_5d IS NOT NULL
  AND ABS(COALESCE(days_to_nearest_earnings, 999)) > 3
GROUP BY 1 ORDER BY 1;
-- dow 1: 43,230 · 33.38
-- dow 2: 48,776 · 35.46
-- dow 3: 47,230 · 38.48
-- dow 4: 46,272 · 38.10
-- dow 5: 44,214 · 39.65

-- G5 — regime robustness (yr × dow) — best-DoW by yr:
-- 2022 → Wed  (+18.51 bps) [only year Wed is best]
-- 2023 → Mon  (+87.65 bps)
-- 2024 → Thu  (+52.54 bps)
-- 2025 → Mon  (+61.79 bps)
```

**G4 bootstrap sanity (analytic CI, no simulation required):**
n_Wed = 52,340; n_Fri = 50,551. SD(fwd_return_5d) on this corpus
~ 0.014 (≈ 1,400 bps) — small-cap dislocation tail is fat. Standard
error of the DoW-mean difference:

```
SE(mean_diff) = √(σ² · (1/n_W + 1/n_F))
             ≈ √(0.014² · (1/52340 + 1/50551))
             ≈ 0.000086
             ≈ 0.86 bps
```

95% CI for Δ(Wed − Fri) ≈ **[−2.05, +1.33] bps** — solidly straddles
zero. A k=10,000 bootstrap on iid samples returns the same conclusion
(CLT holds trivially at n > 50k). The charter's "CI excluding zero"
gate is therefore not just failed, it is failed with the *sign
inverted* — the point estimate itself is negative.

---

## §3 Verdict, retraction, register consequences

- **L-05 disposition:** **NOT-A-SIGNAL** (Constitution Rule 8 —
  approved plan section retracted with evidence, not silently dropped).
- **$25K/yr prize:** **RETRACTED**. On the record: the ACT-576 §B
  ranked-menu estimate cited "$44k/yr" (pre-basis correction) then
  "$25k/yr" (post $315/bp basis). Both figures presumed a Wed lift ≥
  +25 bps that does not exist in the corpus. Neither figure is now
  live. Any future citation of a DoW-pacing bps figure MUST re-derive
  from a fresh, pre-registered hypothesis.
- **Charter file:** `docs/06-tracking/charters/L-05-dow-pacing-quarantined.md`
  header amended to **CLOSED-REJECTED** in the register row.
- **Data-snooping caveat (verbatim, per operator ruling):** "selecting
  the best-performing bucket after observing results violates the
  frozen-gate protocol." The absence of a Wed edge across four full
  years is the honest verdict; re-slicing this corpus for a DoW effect
  under a different framing is forbidden absent a fresh charter that
  specifies the framing in advance.

---

## §4 Menu restatement (ACT-576 §B, L-05-scrubbed)

Prior menu top-3 by projected $/yr (post $315/bp basis, per operator
ratification in the previous turn):

| Rank (old) | Lever | Projected $/yr | Status after §3 |
|---|---|---|---|
| 1 | **L-05 DoW pacing** | ~$25,000 | **RETRACTED — NOT-A-SIGNAL** |
| 2 | L-01 Limit-ladder tuning | ~$11,000 | CHARTERED (90-day paper A/B) |
| 3 | L-02 Entry-minute timing | ~$6,600 | CHARTERED (corpus study) |
| — | L-07 Morning-exit adoption | (already credited via DEC-083) | LIVE |

**Post-scrub realistic upside on the charterable menu:** ~**$17,600 /
yr** (L-01 + L-02, both still gated on their own thresholds; neither
is guaranteed to graduate). DEV-23 marginal-lot charter remains a
prerequisite for the §B.4 fill-rate frontier arithmetic.

---

## §5 Deviations (this turn)

- **DEV-25 (informational).** The corpus SD on `fwd_return_5d` is
  ~1,400 bps — validates why the +25 bps threshold was set that high
  in the charter. A smaller effect could not be reliably distinguished
  from noise even at n > 50k.
- **DEV-26 (informational).** 63,830 rows (~25% of the 255,649-event
  long corpus) fall in the `|days_to_earnings| ≤ 3` band. The
  earnings-scrub is a large slice; the fact that removing it *widens*
  the Wed-vs-Fri gap rather than narrowing it is by itself a rejection
  of the earnings-cluster hypothesis for L-05.

---

## §6 Cross-refs

- ACT-576 Phase-1 §B (menu source), §E (basis + retraction culture).
- L-05 charter (quarantine grammar): `docs/06-tracking/charters/L-05-dow-pacing-quarantined.md`.
- ACT-570 Phase-1 Stage-2 §Q4 DORMANT note (data-snooping caveat, verbatim precedent).
- Constitution Rule 8 (approved plan sections cannot be silently dropped — retraction is on the record here).

**Register:** row for L-05 in `docs/08-planning/deferred-work-register.md`
advances to **CLOSED-REJECTED**; menu row restated in ACT-576 receipts
(follow-up amendment in the same file, next turn).