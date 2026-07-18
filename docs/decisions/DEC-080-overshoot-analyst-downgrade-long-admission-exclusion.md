# DEC-080 — Overshoot LONG-admission exclusion: analyst-downgrade proximity

**Status:** ADOPTED (operator, 2026-07-18).
**Charter:** ACT-544-v2 (side-relabeled ACT-544 correction pack).
**Detector version target:** next `RATIFIED_DETECTOR_VERSION` bump (post-a026dc51).
**Scope:** overshoot detector, LONG-admission leg only. SHORT leg untouched.

## 1. Ruling (operator verbatim)

> ACT-544-v2 analyst-downgrade LONG-admission exclusion — ADOPTED.

## 2. Exclusion definition (detector contract)

On LONG-admission evaluation for a candidate `(ticker, as_of_date)`, the
detector REFUSES the event iff there exists a row in
`public.analyst_revision_observations` such that:

- `ticker = candidate.ticker`, AND
- `direction = -1` (downgrade; the smallint sign convention already used by
  DEC-072 / DEC-071 upstream signal computation), AND
- `focal_published_at::date` is within **±3 calendar days** of
  `candidate.as_of_date` (inclusive on both edges).

Refusal reason string: `analyst_downgrade_proximate` (new).
Refusal is a HARD refusal — parity to the existing LONG-admission bar
family (no rank bypass, no size taper).

### Source of truth

- **Table:** `public.analyst_revision_observations`
- **Fields read:** `ticker`, `direction`, `focal_published_at`, `computed_at`
- **Upstream writer:** longshort analyst-revision signal compute (DEC-072
  brokerage-tier proxy). The detector consumes the OBSERVATION row directly;
  it does NOT consume the credibility-weighted signal (weights are a
  ranking concern; the exclusion is proximity+direction only, so a raw
  observation is the correct granularity and immune to weight drift).

## 3. Freshness path (staleness single-home)

A stale downgrade feed silently disables the exclusion (missing rows =
"no downgrade" = admit). This is the exact failure mode the SI-freshness
pattern (`_shared/overshoot/si-freshness.ts`, DEC-504-4) exists to prevent.

**Ruling:** the analyst-revision freshness predicate is added to the same
single-home module as a sibling helper, `analystRevisionStaleActive(asOf,
freshestComputedAt, maxDays)`, with `maxDays = 3` calendar days (matching
the DEC-072 continuous-refresh cadence; the analyst-revision compute cron
fires ≥1×/day on weekdays and same-day on catalyst-triggered runs).

**Behavior under stale feed:** LONG-admission refuses the WHOLE detection
run with reason `analyst_revision_feed_stale` (fail-safe: no admissions
under a blind feed, symmetric to the SI-freshness fail-closed treatment
on the SHORT leg). This is a strict guard, not a soft warning.

**Where wired:** `_shared/overshoot/detector/detector.ts` reads
`freshest_analyst_revision_computed_at` from the same rollup query that
today fetches the freshest SI as-of date; adds a second staleness check
alongside `siStaleActive`. Canary import guard extended to cover the
new predicate (mirroring the existing detector/sizing imports).

## 4. Economics — capacity model (BOTH numbers on the record)

Section B v2 measurement (ACT-544-v2): analyst-downgrade-proximate
LONG-admission events **n = 3,491**, regime-stable, dip-buying P&L
underperforms the no-signal baseline by **~90 bps/slot-day** per swapped
slot.

Two capacity accountings — both preserved for future audit:

| Assumption | Slot outcome | Net gain to sleeve |
|---|---|---|
| Excluded slots UNFILLED (leaves capacity idle) | −7.9% of long slots idle | **+7.4 bps/slot-day** (conservative floor) |
| Excluded slots REFILLED by next-ranked candidate (rank-selection with supply > slots, i.e. actual live behavior) | Same slot count filled | **≈ +90 bps/slot-day per swapped slot** (realistic) |

Under the live ranker with supply > slots (empirically true in every regime
of the 20-day parity window and the 07-08→today dial series), **refill is
reality**. `+7.4` is recorded as the conservative floor; `≈ +90` is the
expected realized effect. Both clear the 42.42 bps/slot-day dominance
floor (frozen rule, ACT-527 Section D).

## 5. Shelved companion

Earnings-miss LONG-admission exclusion residual: **SHELVED** (n = 194,
fails frozen n ≥ 1,000 rule). Re-open only on evidence expansion, new
study-cell charter.

## 6. Implementation sequencing (operator ruling)

1. **NO CHANGES pre-Monday-open.** The detector-code path must not shift
   Monday's book and must not muddy Monday's six-lot exit attribution
   (LITE / SNDK ± any T1s that mature).
2. **NO CHANGES during Tuesday's arming session.** The `overshoot.exit.run`
   Sunday-PM ruled arm (see ACT-542 filing for the actual arm timing) and
   any Tuesday cron work land first.
3. **Landing window: Tuesday post-arm.** First effective book:
   **Wednesday's 22:00Z detection run**.
4. **ACT-532 atomic-flip checklist — ONE commit:**
   - (a) `runDetector` predicate: add the `analyst_downgrade_proximate`
     refusal on the LONG-admission leg + the `analyst_revision_feed_stale`
     run-level refusal.
   - (b) `DETECTOR_PREDICATE_SPEC_V2_JSON`: rewrite the LONG-admission
     self-description block to state the new refusal truthfully; keep the
     SHORT-leg block unchanged.
   - (c) `PREDICATE_SPEC_V2_SHA256`: recompute from the new JSON body.
   - (d) `RATIFIED_DETECTOR_VERSION`: bump from `a026dc51` to the new
     first-8-hex of `(study_full_hash || spec_v2_json)`. Cite the compute
     command in the commit body.
   - (e) `selection-parity_test.ts`: re-pin the version constant AND
     regenerate all 20 frozen parity days with the per-day delta stated
     in the fixture header (expected: LONG-admission counts drop on days
     with in-window downgrades; SHORT-admission counts unchanged).
   - (f) `detector_test.ts:704`: re-pin the self-description assertion.
   - (g) `si-freshness_test.ts` canary block: extend to require the new
     `analystRevisionStaleActive` symbol be imported from the single-home
     module by detector.ts.
5. **ACT-529 uniformity — same commit deploys everywhere.**
   `overshoot-detection-run`, `overshoot-entry-run`, `overshoot-exit-run`,
   `overshoot-fill-sweep` all bundle `RATIFIED_DETECTOR_VERSION`; auto-deploy
   means the commit IS the deployment. **Time the commit accordingly** —
   land after Tuesday's `overshoot.exit.run` fires and completes so the
   Tuesday run stamps under the OLD version and closes cleanly.
6. **Verification (Wednesday 22:00Z, first effective run):**
   - Detection row stamps the NEW `detector_version`.
   - At least one refusal row with reason `analyst_downgrade_proximate`
     is expected on Wednesday's slate (from ACT-544-v2 base rate, ~2–4/day
     under current universe size).
   - `overshoot_short_interest` freshness path (SI leg) continues to fire
     `si_above_squeeze_threshold` as usual — orthogonal.

## 7. Rollback

Detector-version bump is the rollback handle. If Wednesday's tally shows
any anomaly outside the expected LONG-admission count band, revert the
commit; auto-deploy restores `a026dc51` uniformly across all four
bundling functions (ACT-529). Fixture regeneration is deterministic and
re-runnable.

## 8. Cross-refs

- ACT-527 (frozen study rules, dominance floor 42.42 bps/slot-day)
- ACT-528 (bull sleeve REGIME-GATED-PROPOSAL — separate account, separate
  book; this DEC is core-overshoot, not the bull sleeve)
- ACT-529 (uniform bundling-function redeploy on any `RATIFIED_DETECTOR_VERSION`
  bump)
- ACT-531 Section A (up-spike continuation map)
- ACT-532 (atomic detector-flip checklist)
- ACT-544-v2 (side-relabeled correction pack — the measurement backing
  this DEC)
- DEC-072 (analyst brokerage-tier proxy — upstream writer of
  `analyst_revision_observations`)
- DEC-504-4 / `_shared/overshoot/si-freshness.ts` (single-home staleness
  pattern this DEC extends)
- INC-106 (squeeze-gate direction flip — orthogonal, both live under
  the same next-version stamp)