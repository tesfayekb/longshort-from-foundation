# ACT-569 — SHORT-ARM DEEP INVESTIGATION

**Chartered:** 2026-07-23 pre-sleep. **Status (this file):** (a)-(c) DELIVERED tonight (window allowed — SQL chains bound; results below). (d)-(f) QUEUED for Friday 07-24 analysis lane alongside the tail queue. **Verdict grammar pre-committed:** TAPE-CONSISTENT / CALIBRATION-SUSPECT / DEFECT (see §(f)).

**Framing.** Over the 12 sessions 2026-07-08 → 2026-07-23 the SHORT arm has admitted **6 total** (4 on 07-20, 1 on 07-17, 1 on 07-16, 0 on the other 9 sessions). The question is whether this 0-heavy run is (i) tape being uncooperative for the short thesis, (ii) a threshold miscalibration, or (iii) a defect (feed / classifier / sign convention).

---

## (a) Threshold Truth — Constants, Ratification, Regime Handling

| Constant | Value | File:Line | Ratification |
|---|---|---|---|
| `DETECTOR_SHORT_EXCESS_THRESHOLD` | `0.08` | `supabase/functions/overshoot-detection-run/index.ts:144` | Detector spec v2 (`DETECTOR_PREDICATE_SPEC_V2_JSON`, `short.excess_min: 0.08`, `supabase/functions/_shared/overshoot/detector/detector.ts:622`); frozen by INC-106 flip and re-pinned in Gate-11 fix (spec-sha `df339497…`). |
| `DETECTOR_SQUEEZE_SI_PCT_FLOAT_MIN` | `0.20` | `supabase/functions/overshoot-detection-run/index.ts:145` | INC-106 direction flip: `si_pct_float >= 0.20` refuses as `si_above_squeeze_threshold`. Ratified in `approved-decisions.md:852` (R2). Threshold VALUE flagged as `pending_ACT-527_curve` in detector spec (`detector.ts:622`, `short.inc_106_direction_flip.threshold_status`). |
| `shortExcessThreshold` (param, sign-agnostic; compared to `|excess|`) | `0.08` | `detector.ts:315`, `detector.ts:777` | Same as row 1. |
| Copy-of these constants inside `overshoot-sweep-diagnostic` | `0.08` / `0.20` | `supabase/functions/overshoot-sweep-diagnostic/index.ts:49-50` | Kept in-sync manually — divergence would be a defect (log as INC-nnn if observed). |

**Regime multiplier?** **No.** Grep of `overshoot-detection-run/index.ts` and `_shared/overshoot/detector/` confirms neither `shortExcessThreshold` nor `squeezeSiPctFloatMin` is multiplied by regime state (BULL / BEAR) or sleeve state (ENGAGED / DISENGAGED). Sleeve state gates **whether** short admissions are considered (DEC-504-4-A currently disengaged on dial breadth); it does **not** scale the numeric threshold when engaged. **This is important for the (f) verdict:** any hypothesis that "the threshold is auto-tightened in BULL" is refuted by code inspection.

---

## (b) Nightly SHORT Funnel Since 2026-07-08

All counts from `overshoot_events WHERE side='short'` (lowercase — see incidental note below). Sessions ordered newest → oldest.

| Session | Cands | Excess-below | SI unavail | SI stale | SI ≥ squeeze | Geom out-of-set | Earn prox | Capacity | Survivors | Where the pool died |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 2026-07-23 | 258 | 215 | 21 | 0 | 0 | 16 | 6 | 0 | **0** | Excess (83%), then SI-unavail on top-conviction tail |
| 2026-07-22 | 324 | 286 | 22 | 0 | 0 | 13 | 3 | 0 | **0** | Excess (88%), then SI-unavail on top-conviction tail |
| 2026-07-21 | 321 | 292 | 12 | 0 | 0 | 14 | 3 | 0 | **0** | Excess (91%), same tail pattern |
| 2026-07-20 | 198 | 157 | 0  | 0 | 2 | 21 | 2 | 12 | **4** | Excess (79%); **SI feed HEALTHY** — 4 survivors admitted, `si_above_squeeze_threshold=2` fired, `capacity` cap engaged |
| 2026-07-17 | 142 | 98  | 22 | 0 | 0 | 19 | 2 | 0 | **1** | Excess (69%); SI-unavail 15% |
| 2026-07-16 | 171 | 118 | 26 | 0 | 0 | 26 | 0 | 0 | **1** | Excess (69%); SI-unavail 15% |
| 2026-07-15 | 277 | 238 | 15 | 0 | 0 | 24 | 0 | 0 | **0** | Excess (86%); SI-unavail on tail |
| 2026-07-14 | 281 | 251 | 9  | 0 | 0 | 21 | 0 | 0 | **0** | Excess (89%) |
| 2026-07-13 | 269 | 227 | 14 | 0 | 0 | 28 | 0 | 0 | **0** | Excess (84%); geometry tail |
| 2026-07-10 | 371 | 328 | 13 | 0 | 0 | 30 | 0 | 0 | **0** | Excess (88%); geometry tail |
| 2026-07-09 | 415 | 344 | 14 | 0 | 0 | 57 | 0 | 0 | **0** | Excess (83%); geometry 14% |
| 2026-07-08 | 386 | 279 | 19 | 0 | 0 | 88 | 0 | 0 | **0** | Excess (72%); geometry 23% (heaviest geom-refuse session) |

**Reads.**

1. **Excess threshold refuses 69-91% of every night's pool.** This is expected — most tickers on any day do not have a large dislocation. The interesting cohort is the residual (~15-30% of the pool).
2. **Post-07-21 SHORT survivors = 0, coinciding with `detector_version = aff20a13` first appearing on 07-22.** 07-20 (last session with `detector_version = NULL`, pre-MIG-165) was the last session with survivors > 0. This is **suggestive**, not conclusive — 07-15, 07-14, 07-13, 07-10, 07-09, 07-08 were also survivor-0 under the NULL detector, so "pre-aff20a13 was fine" is false. But the **contrast between 07-20 (4 survivors, SI feed healthy) and 07-21-23 (0 survivors, SI unavail dominating the top tail)** points at **si_unavailable** as the current pool-killer, not the excess or squeeze thresholds.
3. **`si_above_squeeze_threshold` fires only 2 total** across all 12 sessions (both on 07-20). The INC-106 refusal class is essentially dormant — either (i) high-SI tickers rarely make it to the top-conviction band (tape reality), or (ii) they are being intercepted earlier by `si_unavailable` (feed defect masking the squeeze gate). This is the exact question (d)-(f) will answer.

---

## (c) Near-Miss Distribution — Top-20 Short Excess vs Threshold (last 10 sessions)

Metric per session: `max_abs_excess` over `excess_w1…w5` per candidate; take the top-20 by that metric; then report {min, p50, max} of the top-20 and count how many are ≥ 100% / ≥ 90% / ≥ 20% of the 0.08 threshold.

| Session | Top-20 min | Top-20 p50 | Top-20 max | ≥100% of 0.08 | ≥90% (0.072) | ≥20% (0.016) |
|---|---:|---:|---:|---:|---:|---:|
| 2026-07-23 | 0.1007 | 0.1212 | 0.2360 | **20** | 20 | 20 |
| 2026-07-22 | 0.1000 | 0.1151 | 0.2061 | **20** | 20 | 20 |
| 2026-07-21 | 0.0850 | 0.1114 | 0.1836 | **20** | 20 | 20 |
| 2026-07-20 | 0.1010 | 0.1200 | 0.2566 | **20** | 20 | 20 |
| 2026-07-17 | 0.1180 | 0.1298 | 0.2774 | **20** | 20 | 20 |
| 2026-07-16 | 0.1318 | 0.1608 | 0.2579 | **20** | 20 | 20 |
| 2026-07-15 | 0.0975 | 0.1177 | 0.3134 | **20** | 20 | 20 |
| 2026-07-14 | 0.0935 | 0.1248 | 0.2964 | **20** | 20 | 20 |
| 2026-07-13 | 0.0991 | 0.1194 | 0.2443 | **20** | 20 | 20 |
| 2026-07-10 | 0.0968 | 0.1146 | 0.2563 | **20** | 20 | 20 |

**Decisive read (calibration vs tape).**

- The framing question was: *"are candidates dying at 90% of the bar (calibration) or at 20% (tape)?"*
- **Answer: neither — the top-20 short-side candidates every session are ALL AT OR ABOVE 100% of the excess bar** (min top-20 = 0.085-0.132 across all 10 sessions, all ≥ 0.08). The excess threshold is **NOT** the mechanism killing the near-miss cohort. **This decisively rules out excess-threshold miscalibration** as the SHORT-arm-0 explanation.

**So where do the top-20 die?** Per-ticker refusal reasons for top-10 on 07-23 / 07-22 / 07-20 (raw SQL results appended below):

| Session | Ticker | Max excess | Refusal reason | Selected |
|---|---|---:|---|---|
| 07-23 | ACI | 0.2360 | `exclusion_earnings_proximity` | false |
| 07-23 | PEGA | 0.1932 | `exclusion_earnings_proximity` | false |
| 07-23 | TSLA | 0.1658 | `momentum_out_of_set` (q3) | false |
| 07-23 | ISRG | 0.1581 | **`si_unavailable`** | false |
| 07-23 | PATH | 0.1559 | **`si_unavailable`** | false |
| 07-23 | QLYS | 0.1543 | `drawdown_out_of_set` (bucket 3) | false |
| 07-23 | DOCN | 0.1375 | `excess_below_threshold` on argmax w=1 (short spec `windows=[1..5]`, argmax w=1 is valid — this classification wants a second look) | false |
| 07-23 | ISRG (07-22) | 0.1488 | **`si_unavailable`** | false |
| 07-23 | HIMS (07-22) | 0.1379 | **`si_unavailable`** | false |
| 07-20 | SNDK | 0.1958 | *(none — admitted)* | **true** |
| 07-20 | GLW  | 0.1711 | *(none — admitted)* | **true** |
| 07-20 | SMCI | 0.1290 | *(none — admitted)* | **true** |

**Reads.**

1. **`si_unavailable` is intercepting high-conviction shorts on 07-22 and 07-23** (ISRG, PATH, HIMS, WDAY, TYL among the top-10). This is the leading candidate for the (f) DEFECT branch — investigate the SI feed's coverage of large-cap growth tickers in the (d)/(e) lane.
2. **`exclusion_earnings_proximity` also intercepts the very top of the tail** (ACI, PEGA, TMUS on 07-23) — this is by design (DEC / detector spec `short.earnings_exclusion_days: 5`), not a defect.
3. **`momentum_out_of_set` and `drawdown_out_of_set` account for the geometry residual** — short spec is `momentum=[1,5]` and `drawdown=[4,5]`; TSLA at q3 momentum and QLYS at drawdown bucket 3 correctly refused.
4. **DOCN on 07-23 warrants a spot-check under (e)** — max excess 0.1375 but classified `excess_below_threshold`. The argmax window is w=1; the classification code uses the argmax-window excess against the threshold. If argmax was mis-computed or the |excess| vs signed-excess comparison flipped, this is a computation defect. Filed as **spot-check candidate #1** for §(e).

---

## (d) Studied-Arrival Comparison — QUEUED (Friday analysis lane)

**Task.** From the ratified study corpus (long/short study-cell grid, `overshoot_study_candidate_events` + `overshoot_study_cell_results`), compute the **studied SHORT qualification rate per session** for this universe, project the **expected admits over the 12 live sessions** with a Poisson band, and test whether observed admits = **6** falls INSIDE the band (→ TAPE-CONSISTENT) or OUTSIDE (→ CALIBRATION-SUSPECT / DEFECT).

**Method.**

1. Filter study corpus to sessions matching the live sample's regime (BULL, dial-breadth range).
2. Compute λ_short_daily = mean qualifying-short count per studied session, restricted to the current live universe.
3. Expected admits over 12 sessions = 12·λ_short_daily; Poisson 95% band = `[qpois(0.025, 12λ), qpois(0.975, 12λ)]`.
4. Compare observed 6.

**Delivered:** Friday tail queue.

---

## (e) Computation Spot-Check — QUEUED

**Candidates (pre-selected from (c)):**

1. **DOCN 07-23** — classified `excess_below_threshold` at max_abs_excess 0.1375; argmax_window=1. Question: does the engine's excess-vs-threshold comparison honor the argmax-window value, and is the sign convention symmetric for shorts?
2. **ISRG 07-23** — classified `si_unavailable` at max_abs_excess 0.1581. Question: does `overshoot_short_interest` actually lack a fresh row for ISRG on 07-23, or is the freshness lookup mis-joining?
3. **SNDK 07-20** — admitted at max_abs_excess 0.1958. Positive control — hand-recompute from bars, confirm engine's number matches, confirm sign convention.

**Method.** Pull `overshoot_daily_bars` for each ticker at as_of and w=1..5 back-windows; recompute the excess formula per detector spec; compare to `overshoot_events.excess_w{1..5}` and to the argmax classification.

**Delivered:** Friday tail queue.

---

## (f) Verdict — PRE-COMMITTED GRAMMAR, ASSIGNMENT PENDING (d)/(e)

**Tonight's evidence (a)-(c) already narrows the space:**

- Excess-threshold miscalibration is **REFUTED** by (c) — top-20 short candidates every session are all ≥ 0.08.
- `si_above_squeeze_threshold` (INC-106 gate) is **DORMANT** — 2 fires in 12 sessions, both on 07-20. Not the killer.
- The **actual killer of high-conviction shorts on 07-21 → 07-23 is `si_unavailable`** — pointing at feed-coverage.

**Verdict slots:**

| Verdict | Trigger | Operator decision |
|---|---|---|
| **TAPE-CONSISTENT** | (d) shows observed 6 admits ∈ Poisson band AND (e) all three spot-checks reproduce | None — SHORT arm is fine, tape is uncooperative for the short thesis in a BULL regime with dial-disengaged posture. |
| **CALIBRATION-SUSPECT** | (d) shows observed 6 admits OUTSIDE Poisson band low tail AND (e) reproduces AND the (c) refusal-class mix points at a specific tunable threshold | Charter threshold re-study (analog to ACT-527 short curve completion) — no code fix, no rollback. |
| **DEFECT** | (e) shows any computation mismatch (excess-sign flip, argmax mis-computation, freshness join defect) OR (c)'s `si_unavailable` cohort turns out to have fresh SI rows the engine is not seeing | Tier-A fix under change-control (constitution Rule 6) — new INC-nnn + branch + tests + regression evidence. **Strong prior at this stage** given the `si_unavailable` weight in (c). |

**Verdict:** ASSIGNED after (d) and (e) land Friday.

---

## Incidental Notes (log-only, do NOT expand this file's scope)

- **Side casing.** `overshoot_events.side` is stored lowercase (`'short'` / `'long'`). Any query using `side='SHORT'` returns zero rows and is a **silent-bug landmine**. Flag for INC-nnn on Friday if any consumer is querying uppercase.
- **`detector_version` NULL pre-2026-07-22.** Pre-MIG-165 runs lack the stamp; ACT-529 already covered redeployment on version bumps. Any historical parity work must join on `as_of` date + git_sha, not on `detector_version`.

## Cross-Refs

- ACT-527 short-side threshold curve (pending completion — this ACT will consume its output for (d)).
- INC-106 direction flip (`approved-decisions.md:852` R2).
- DEC-504-4-A (dial-based sleeve disengage — orthogonal to threshold questions).
- Detector spec v2 (`detector.ts:622`, spec-sha `df339497…`).
- FIX-8 completion pass (`docs/04-modules/overshoot/fix-8.md`) — unrelated but note that FIX-8 does not re-run the detector; SHORT-arm-0 is upstream of FIX-8.

---

## ACT-569(f)-EARLY — H-1 BRANCH CLOSED BY FIX (filed 2026-07-24 pre-market, out-of-band from Friday (d)-(f) lane)

**Trigger.** Operator "PROVE-THEN-FIX" order (2026-07-24 zero-exposure window). H-1 hypothesis (per-row SI envelope below FINRA natural cadence) proven then fixed in a single turn.

**Proof (STEP 1).** ACT-569(a)-early SELECT against `overshoot_short_interest` UNWINDOWED for the top-cited si_unavailable short candidates:

| ticker | run_date | has_row | as_of_date | age | inside_20d | inside_26d |
|---|---|---|---|---|---|---|
| HIMS | 07-22 | ✅ | 2026-06-30 | 22 | ❌ | ✅ |
| ISRG | 07-22 | ✅ | 2026-06-30 | 22 | ❌ | ✅ |
| PATH | 07-22 | ✅ | 2026-06-30 | 22 | ❌ | ✅ |
| TYL  | 07-22 | ✅ | 2026-06-30 | 22 | ❌ | ✅ |
| WDAY | 07-22 | ✅ | 2026-06-30 | 22 | ❌ | ✅ |
| HIMS | 07-23 | ✅ | 2026-06-30 | 23 | ❌ | ✅ |
| ISRG | 07-23 | ✅ | 2026-06-30 | 23 | ❌ | ✅ |
| PATH | 07-23 | ✅ | 2026-06-30 | 23 | ❌ | ✅ |
| TYL  | 07-23 | ✅ | 2026-06-30 | 23 | ❌ | ✅ |
| WDAY | 07-23 | ✅ | 2026-06-30 | 23 | ❌ | ✅ |

**10/10 (100%) — H-1 PROVEN.** `si_unavailable` was envelope-artifact, not data-absence. Same class as book-level 21d bug DEC-504-4-A fixed.

**Fix (STEP 2).** `DETECTOR_SI_STALENESS_MAX_DAYS: 20 → 26` at two string-identical declaration sites:

- `supabase/functions/overshoot-detection-run/index.ts:146` (production data-fetch envelope; SOURCE_VERSION bumped `fb5fdf13+fix2` → `fb5fdf13+fix2+si26`).
- `supabase/functions/overshoot-sweep-diagnostic/index.ts:51` (diagnostic funnel — kept in lockstep to prevent phantom si_unavailable in future funnel scans).
- Two-constant design comment block in `_shared/overshoot/si-freshness.ts` amended to note the two constants now coincide at 26 by shared cadence with distinct roles (envelope `<=` vs book-level strict `>`).
- Cross-ref comments at both sites naming each other; shared-home refactor queued as DW-234.

**Detector spec bytes UNTOUCHED.** `detector.ts` not modified. `RATIFIED_DETECTOR_VERSION === 'aff20a13'` re-asserted in the 32/32 detection-run suite (new near-guard test). Selection-parity byte-exact far-guard structurally holds (fixtures + detector source unchanged).

**Tests.** 32/32 GREEN in `overshoot-detection-run` (28 baseline + 4 new):
1. `SI read within staleness window ... — cadence-amended 20→26` — asserts `= 26` present and `= 20` retired.
2. `H-1 amendment triple: age 24 usable / 26 boundary / 27 excluded` — pure-arithmetic mirror of the SQL envelope semantics.
3. `H-1 fix does NOT bump detector predicate spec — composite aff20a13 held` — near-guard on composite version.
4. `SOURCE_VERSION carries the +si26 suffix (deploy-truth rail)`.

**Deploy + probe verify.**
- Deployed: `overshoot-detection-run`, `overshoot-sweep-diagnostic` (2026-07-24 pre-market).
- Probe: `curl -X POST .../functions/v1/overshoot-detection-run -d '{"probe":"version"}'` — response header `x-source-version: fb5fdf13+fix2+si26` **verified**. (Body auth-gated per DEC-023; header rail is the deploy-truth surface per FIX-3.)

**§22.5.1-style receipt.**

| Surface | Expected | Observed | Status |
|---|---|---|---|
| Constant flip (detection-run) | `DETECTOR_SI_STALENESS_MAX_DAYS = 26` | present at line 146 | ✅ |
| Constant flip (sweep-diagnostic) | `= 26` string-identical | present at line 51 | ✅ |
| Cross-ref comments | both sites name the other | present at both | ✅ |
| si-freshness two-constant block | updated w/ cadence-coincidence note | updated (lines 30-66) | ✅ |
| SOURCE_VERSION bump | `fb5fdf13+fix2+si26` (detection-run only) | present at line 50 | ✅ |
| detector.ts UNTOUCHED | composite `aff20a13` held | RATIFIED_DETECTOR_VERSION asserted green | ✅ |
| Test suite | 32/32 detection-run | 32/32 | ✅ |
| Deploy | both functions | both deployed | ✅ |
| Probe echo | `x-source-version: fb5fdf13+fix2+si26` | matched | ✅ |

**H-1 branch verdict:** **CLOSED BY FIX (proven → amended → deployed → verified in a single turn).** The (f) VERDICT grammar's DEFECT branch is REALIZED for H-1 — Tier-A fix landed under change-control with pre-fix proof, tests, and post-fix probe evidence. Live confirmation Friday 22:00Z (si_unavailable collapse) pre-committed in `2026-07-24-morning-precommit.md`.

**H-2 stays Friday (orphan-stack trace).** The six 07-16/17/20 short detection-survivors that never admitted — trace each through the entry funnel and name the gate that killed each, verbatim. Chartered lane remains as originally specified.

**Deviations from operator order.** None substantive. One approved: sweep-diagnostic constant also flipped (D-1 ruling); one deferred: detector.ts stale `>= 21` header-comment refresh filed as DW-233 (D-2 ruling).