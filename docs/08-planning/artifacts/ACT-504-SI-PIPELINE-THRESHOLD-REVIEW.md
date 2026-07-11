# ACT-504 — SI Pipeline + Staleness Threshold Review (INVESTIGATION)

**Mode:** read-only, evidence-first. **Opened:** 2026-07-11.
**Trigger:** operator-sensed design tension — last SI snapshot = 2026-06-15;
detector `si_stale` refusals structurally suppressing SHORT-book firings.
**Deliverable:** findings + DEC table. No code changes.

---

## §1 — Source, endpoint, dating convention

| Item | Evidence |
|---|---|
| **Vendor** | Polygon "Stocks Advanced" SI endpoint |
| **Endpoint** | `GET /stocks/v1/short-interest?ticker=<T>&settlement_date.lte=<as_of>&sort=settlement_date.desc` — `supabase/functions/_shared/overshoot/polygon-short-interest-fetcher.ts:178-183` |
| **Upstream feed** | FINRA/SEC semi-monthly short-interest report (Polygon rebinds) |
| **`as_of_date` semantics** | **SETTLEMENT DATE** (not publication date). Polygon `settlement_date` → `report_date` → `as_of_date` upsert key. `polygon-short-interest-fetcher.ts:117-119`; upsert at `overshoot-short-interest-compute/index.ts:196` |
| **Publication cadence** | FINRA settles twice/month (~mid + EOM), disseminates **~T+8 business days** (≈ 11 calendar days) after settlement |
| **`computed_at`** | wall-clock of the compute run (row-provenance), NOT the vendor publication date. All 5,034 rows carry `computed_at = 2026-07-07` → manual back-population, not per-cycle attribution |

**Latest snapshots (as of query time 2026-07-11):**

```
as_of_date  rows  computed_at
2026-06-15   838  2026-07-07  ← latest settlement present
2026-05-29   839  2026-07-07
2026-05-15   839  2026-07-07
2026-04-30   839  2026-07-07
2026-04-15   839  2026-07-07
2026-03-31   839  2026-07-07
2026-03-13     1  2026-07-07  (partial pilot slice)
```

**Missing snapshot:** `2026-06-30 settlement` (would publish ~2026-07-13).

### Why 06-15 is the last snapshot (operational miss, NOT vendor-side)

- `cron.job overshoot-short-interest-compute` schedule = `'0 21 1,15 * *'` (active=true).
- `job_registry.overshoot.short_interest.compute` `enabled=true` **`updated_at = 2026-07-10 03:37:55 UTC`**.
- The 2026-07-01 21:00 UTC firing slot **preceded the arm** → the job was disarmed at July-1, did not run.
- `cron.job_run_details` returns zero rows for this job (retention window / arm-recency; PERF-D-B not yet landed).
- **First live autonomous fire:** 2026-07-15 21:00 UTC.
- All present rows were written by manual invocations of the compute handler on 2026-07-07 (backfill era pre-arming).

**Verdict:** the 06-30 settlement gap is **manual-era operational**, not a vendor outage. Polygon has the row (publication ~07-13); we simply won't pick it up until the 07-15 cron.

---

## §2 — Admission-window arithmetic

**Constants:** settlement cadence = mid-month + EOM (2 cycles / month, ~15 calendar days apart). Publication lag ≈ 8 business days ≈ **11 calendar days** after settlement. Staleness gate: `(asOf − as_of_date) ≤ DETECTOR_SI_STALENESS_MAX_DAYS = 20` (`overshoot-detection-run/index.ts:105`).

### Per-cycle admissibility (nominal, both crons fire on time)

| Cycle | Settlement | Publish (≈) | Visible in DB from | Admissible until (settlement + 20d) | Live-detector coverage |
|---|---|---|---|---|---|
| Mid-M | day 15 | day 26 | day 26 | day 5 of M+1 | ~10 calendar days |
| EOM-M | day 30 | day 11 of M+1 | day 11 of M+1 | day 20 of M+1 | ~10 calendar days |

### Gap between cycles (nominal, no misses)

- Mid-M admissibility ends day 5 of M+1.
- EOM-M admissibility begins day 11 of M+1 (once published).
- **Uncovered window: day 6–10 of M+1 = 5 calendar days ≈ 3–4 trading days per cycle.**

### Trading-day coverage table (~21 TD/month)

| Scenario | Covered TD/mo | Locked-out TD/mo | Coverage % |
|---|---|---|---|
| Both crons fire on time, publish on-time | ~17 | ~4 | **~81%** |
| One cron missed (current 07-01 miss) | ~9 | ~12 | **~43%** |
| Both crons fire, publish late by 3d | ~11 | ~10 | ~52% |
| Staleness widened to **28d** | ~21 | ~0 | ~100% (post-heal) |

**Operator "structurally locked out half the time" hypothesis — VERDICT:**
- **Current (post-06-30-miss) state: CONFIRMED** — since ~2026-07-06 the detector has been in permanent `si_stale` for all SHORT candidates; heals only when 07-15 cron fires AND 06-30 has published (~07-13). Both align at ~07-15.
- **Steady-state (both crons firing): REFUTED** — steady-state coverage is ~81%, not ~50%.
- **Structural risk: LOAD-BEARING** — any single cron miss (~one operator inattention event/month) drops coverage to ~43%. The 20d threshold has ZERO grace for a missed cycle; the runbook itself (`docs/04-modules/overshoot/overshoot.md:537`) states the derivation requires **≥ 21 days** to span one missed cycle + grace. **Current constant is off-by-one below its own documented derivation.**

---

## §3 — Study parity

**Search of `supabase/functions/_shared/overshoot/study/` for SI references:**

```
rg 'si_pct_float|short_interest|si_bucket|siStaleness' \
   supabase/functions/_shared/overshoot/study/
→ zero matches
```

**Study cell dimensions** (`study/cell-aggregation.sql.ts:99-169`):
`(side, band, window_days, momentum_quintile, drawdown_bucket, exclusion_width_days)` — **NO SI dimension.**

**Verdict:** the STUDY corpus is **SI-agnostic**. The SI squeeze gate (`si_pct_float ≥ squeezeSiPctFloatMin`) and the staleness gate are **live-ops overlays applied AFTER the cell-mean lookup**, SHORTS only (runbook §W3.3 line 537).

**Consequence:** loosening `DETECTOR_SI_STALENESS_MAX_DAYS` from 20 → 21..28 is **NOT a basis break**. It does not touch the study fixture, does not force fixture regeneration, and does not require re-derivation of cell means. It is a **tunable-by-DEC live-ops constant**. `squeezeSiPctFloatMin` (the level threshold) is likewise live-ops-tunable.

**Corollary:** re-derivation of the squeeze threshold itself (Option (b) below) is a legitimate live-ops study using retrospective SI + realized returns; it does not depend on the study-cell fixture.

---

## §4 — Options table (with costs)

| Opt | Description | Study-parity | One-time cost | Ongoing cost | Notes |
|---|---|---|---|---|---|
| **(a)** | **Status-quo + never-miss-a-cycle guard.** Keep 20d. Add: (i) July-15 attended fire + attest; (ii) SI-freshness watchdog cron (daily) emitting `si_stale_imminent` when `(today − max(as_of_date)) > 15` and `si_stale_active` when `> 20`; (iii) alert routing. | ✓ preserved | ~1 day (watchdog handler + cron + alert wiring) | +1 tiny cron/day (~negligible) | Does NOT fix the structural 5d/cycle gap; catches misses within 1 day; **cheapest and most conservative** |
| **(b)** | **Threshold re-derivation.** Live-ops study: fit `squeezeSiPctFloatMin × siStalenessMaxDays` against realized SHORT returns on frozen study events, holdout-split. Decile table → DEC. | ✓ preserved (SI is post-cell overlay) | 2–3 days (SQL + notebook + validation) | 0 | Legitimate iff SHORT sleeve W5 verdict passes; **do NOT invest before that** |
| **(c)** | **Daily short-sale-volume signal** (FINRA daily ShortVolume file, free). Complementary or replacement for `si_pct_float`. | ✗ **new signal → new study required** | ~1 week (ingest + fetcher + backfill) + ~1–2 weeks study | +1 daily cron, small storage | Semantics differ (flow vs stock); needs its own study before it can gate money |
| **(d)** | **Paid daily-SI feed (Ortex / S3 Partners / Data Explorers).** Real-time SI + borrow flow. | ✗ new signal → confirmation study | Ortex API ~$500–2,000/mo; S3 Partners institutional ~$25–50K/yr | 5–20% monthly cost hit on current $120K notional | **Overkill at current scale**; economic iff notional ≥ $1M AND W5 SHORT verdict passes |
| **(e)** | **IBKR borrow/availability data.** Real-time shares-available + borrow rate. | ✗ new signal (borrow-side, not SI) | ~1 week integration + FP-CANDIDATE-vii ledger entry | IBKR account minimum; borrow data free with account | **File as FP-CANDIDATE-vii** (already flagged); orthogonal to SI — measures supply, not demand |
| **(f)** | **Reallocate 10% SHORT sleeve to LONG book until SHORT unlocks.** Prices carry cost of doing nothing on shorts. | ✓ preserved (LONG book unchanged) | 0.5 day (config toggle + audit event) | LONG sleeve absorbs marginal capacity; SHORT re-enable = one-line DEC | **Zero regret** if SHORT sleeve fails W5; small opportunity cost if SHORT sleeve passes W5 AND a SHORT squeeze event lands during blackout |

### Carry cost of "do nothing" (Option f baseline math, coarse)

- SHORT sleeve target = 10% of $120K = $12K.
- Historical SHORT event-arrival rate per study cells ≈ 0.5–1.5 events/week/universe (order-of-magnitude; W5 will verify).
- If SHORT sleeve mean edge ≈ LONG (unproven — assume 40 bps/event × 4 events/mo = 160 bps/mo on sleeve ≈ ~$19/mo on $12K), idle SHORT ≈ ~$19–50/mo opportunity cost.
- **Compared to (d) Ortex: $500+/mo cost. Option (f) dominates by >10× at current scale.**

---

## §5 — W5 short-sleeve framing (the load-bearing overlay)

Every SHORT-side investment above (b, c, d, e) is **conditioned on the W5 SHORT-sleeve verdict** — the sleeve has not yet proved it earns its capital. Track C entry-slippage was LONG-only. Exit-slippage window opens 2026-07-22 (also LONG-first). The SHORT sleeve has **no independent live-fills evidence yet**.

**Decision principle:** no heavy investment in SI infrastructure before the SHORT sleeve proves it earns its capital. Cheap operational guards (a, f) are approved-tier; study/data investments (b–e) wait on the W5 SHORT verdict.

---

## §6 — DEC TABLE (operator ratifies each row; investigation STOPS here)

| # | Question | Recommendation | Blocking? |
|---|---|---|---|
| **DEC-504-1** | Ratify SI vendor-dating and cron-miss diagnosis: 06-30 settlement absent = operational (job armed 07-10, post 07-01 slot); autonomous heal at 07-15 fire | ratify + acknowledge current SHORT-book is in `si_stale` blackout through ~07-15 | no |
| **DEC-504-2** | Threshold correction: raise `DETECTOR_SI_STALENESS_MAX_DAYS` from **20 → 21** (aligns with runbook derivation `overshoot.md:537`; single-cycle-miss grace) | ratify — study-parity-neutral typo fix; bundled on next detector touch (VERSION-HASH event; detector-fixture regen required) | fixture regen cost documented |
| **DEC-504-3** | Option (a) SI-freshness watchdog: daily cron + `si_stale_imminent` (>15d) + `si_stale_active` (>20d) alerts | ratify — cheapest operational hardening; blocks recurrence of the 07-01 miss class | no |
| **DEC-504-4** | Option (f) SHORT-sleeve reallocation to LONG during `si_stale_active` windows, auto-reversing on heal | **DECIDE** — economically dominant vs (d); operator judgment on strategic optics (LONG-only during blackouts) | **operator call** |
| **DEC-504-5** | Option (b) threshold re-derivation study | **DEFER** behind W5 SHORT-sleeve verdict; charter as W5-05 pending that gate | conditional |
| **DEC-504-6** | Option (c) daily short-sale-volume ingestion | **DEFER**; scope-only entry to `docs/08-planning/feature-proposals.md` as FP-CANDIDATE-viii | no |
| **DEC-504-7** | Option (d) paid Ortex-class feed | **REJECT at current scale**; re-open only at notional ≥ $1M AND W5 SHORT verdict passes | no |
| **DEC-504-8** | Option (e) IBKR borrow feed | log to `docs/08-planning/feature-proposals.md` as **FP-CANDIDATE-vii** (already-noted); orthogonal to SI decision | no |

**Investigation STOPS. No files touched outside this artifact.**

---

## §6.1 — DEC ratification (operator, 2026-07-11) — investigation CLOSED

All eight ratified. Landing notes below are binding.

| # | Ruling | Landing / follow-through |
|---|---|---|
| **DEC-504-1** | RATIFY | Diagnosis accepted. 07-15 21:00 UTC firing is the autonomous heal. Add to week's watchlist: (a) `net._http_response` = HTTP 200; (b) fresh `overshoot_short_interest` rows at `as_of_date = 2026-06-30`; (c) that evening's detection-run showing `si_unavailable` refusal-count drop. |
| **DEC-504-2** | RATIFY | `DETECTOR_SI_STALENESS_MAX_DAYS`: 20 → 21 at `overshoot-detection-run/index.ts:105` (single-homed). Runbook-aligned (`overshoot.md:537`). Detector-golden fixture regen accounted for in the landing PR. **Folded together with INC-102 attribution-row fix** onto the next detection-run touch — one landing, two items. |
| **DEC-504-3** | RATIFY | SI-freshness watchdog. Alert thresholds aligned to the corrected constant: `si_stale_imminent` > 15d (HIGH digest), `si_stale_active` > 21d (post-fix). Folded onto the dispatcher's next touch alongside the deferred cap-compliance digest line. |
| **DEC-504-4** | RATIFY **with two guards** | Short-sleeve → LONG reallocation during `si_stale_active` windows, auto-reversing on heal. **Guards:** (i) implemented as **SIZING-LAYER overlay ONLY** — detector continues to evaluate and refuse shorts normally so the W5 SHORT-sleeve measurement stays uncontaminated; (ii) sizing reads sleeve state at run time, typed audit event on every flip. **Tier-A** change; lands in the **ACT-493 window** (dormant until cap unfreezes ~07-20 regardless). |
| **DEC-504-5** | RATIFY (DEFER) | Chartered as **W5-05** behind the SHORT-sleeve verdict. |
| **DEC-504-6** | RATIFY (DEFER) | Scope-only entry to `docs/08-planning/feature-proposals.md` as **FP-CANDIDATE-viii**. |
| **DEC-504-7** | RATIFY (REJECT) | Paid Ortex-class feed rejected at current scale. Re-open conditions per §4 stand. |
| **DEC-504-8** | RATIFY | Ledger note on `FP-CANDIDATE-vii` (IBKR borrow feed). |

**ACT-504 CLOSED.** Terminal artifact = this file.

---

## §7 — Evidence appendix

- Fetcher endpoint URL construction: `supabase/functions/_shared/overshoot/polygon-short-interest-fetcher.ts:178-190`
- `settlement_date` → `report_date` mapping: same file :117-119
- Upsert into `overshoot_short_interest(as_of_date, ticker)`: `overshoot-short-interest-compute/index.ts:196, :479`
- Detector staleness constant: `overshoot-detection-run/index.ts:105` `DETECTOR_SI_STALENESS_MAX_DAYS = 20`
- Detector staleness predicate: same file :543 `AND as_of_date >= (${asOfDay}::date - ${DETECTOR_SI_STALENESS_MAX_DAYS}::int)`
- Runbook derivation stating `≥ 21`: `docs/04-modules/overshoot/overshoot.md:537`
- Cron schedule: `sql/30_overshoot_short_interest_cron_schedule.sql`; `cron.job` schedule=`0 21 1,15 * *` active=true
- `job_registry.overshoot.short_interest.compute` enabled=true, `updated_at=2026-07-10 03:37:55 UTC`
- Study SI-agnosticism: `rg 'si|short_interest' supabase/functions/_shared/overshoot/study/` → zero matches; cell dims at `study/cell-aggregation.sql.ts:99-169`
