# DEC-081 — Overshoot SHORT-admission exclusion: analyst-upgrade proximity

**Status:** ADOPTED (operator, 2026-07-18).
**Charter:** ACT-545 §3.2 (SHORT analyst-upgrade ADOPT-CANDIDATE row).
**Detector version target:** SAME next `RATIFIED_DETECTOR_VERSION` bump
as DEC-080 + DEC-082 — ONE atomic commit lands all three exclusions
(operator ruling 2026-07-18).
**Scope:** overshoot detector, SHORT-admission leg only. LONG leg
untouched by this DEC (DEC-080 handles LONG).

## 1. Ruling (operator verbatim)

> Short-side analyst-upgrade exclusion (±3d, analyst_revision_observations
> direction=+1, freshness via the DEC-080 analystRevisionStaleActive
> sibling) — ADOPTED.

## 2. Exclusion definition (detector contract)

On SHORT-admission evaluation for a candidate `(ticker, as_of_date)`,
the detector REFUSES the event iff there exists a row in
`public.analyst_revision_observations` such that:

- `ticker = candidate.ticker`, AND
- `direction = +1` (upgrade; smallint sign convention per DEC-072), AND
- `focal_published_at::date` is within **±3 calendar days** of
  `candidate.as_of_date` (inclusive on both edges).

Refusal reason string: `analyst_upgrade_proximate` (new).
Refusal is a HARD refusal — parity to the existing SHORT-admission bar
family (no rank bypass, no size taper). Symmetric to DEC-080's
LONG-side `analyst_downgrade_proximate`.

### Source of truth

- **Table:** `public.analyst_revision_observations` (same source as
  DEC-080 — raw observation, not credibility-weighted signal;
  weight-drift-immune).
- **Fields read:** `ticker`, `direction`, `focal_published_at`,
  `computed_at`.
- **Upstream writer:** DEC-072 longshort analyst-revision compute.

## 3. Freshness path (piggybacks DEC-080)

Reuses `analystRevisionStaleActive(asOf, freshestComputedAt, maxDays=3)`
in `_shared/overshoot/si-freshness.ts` (added by DEC-080). NO second
implementation — single-home discipline (INC-91 precedent, DEC-504-4
co-location).

**Behavior under stale feed:** DEC-080's run-level
`analyst_revision_feed_stale` refusal ALREADY blocks the WHOLE detection
run (both legs) fail-closed. This DEC inherits it — no new guard.

## 4. Economics — capacity model (BOTH numbers on the record)

ACT-545 §3.2: analyst-upgrade-proximate SHORT-admission events
**n = 3,104**, regime-stable, spike-selling P&L drifts UP against the
short (shorted name continues higher post-upgrade) by **+38.9
bps/slot-day** vs baseline SHORT geometry.

| Assumption | Slot outcome | Net gain to sleeve |
|---|---|---|
| Excluded slots UNFILLED | slots idle | **+3.9 bps/slot-day** (conservative floor) |
| Excluded slots REFILLED (live regime, supply > slots) | Same slot count filled | **≈ +42 bps/slot-day per swapped slot** (marginal-pass at 42.42 floor) |

Refill is reality under the live ranker (supply > slots across the
20-day parity window and 07-08→today dial series). Marginal-pass at
42.42 is **operator-noted and ratified**, not a re-open — ACT-527 frozen
rules permit regime-stable evidence-sized adoption.

## 5. Implementation sequencing (operator ruling)

Tuesday post-arm; first effective book Wednesday 22:00Z. ONE commit
bundles DEC-080 + DEC-081 + DEC-082.

**ACT-532 atomic-flip checklist — ONE commit:**
- (a) `runDetector` predicate: add `analyst_upgrade_proximate` on
  SHORT leg. Run-level `analyst_revision_feed_stale` (DEC-080) covers
  both legs.
- (b) `DETECTOR_PREDICATE_SPEC_V2_JSON`: rewrite BOTH LONG (DEC-080) and
  SHORT (this DEC) admission blocks + the §6 M&A block (DEC-082).
- (c) `PREDICATE_SPEC_V2_SHA256`: recompute ONCE.
- (d) `RATIFIED_DETECTOR_VERSION`: single bump from `a026dc51` to new
  first-8-hex; cite compute command in commit body.
- (e) `selection-parity_test.ts`: re-pin version constant AND regenerate
  20 frozen parity days with per-day delta in fixture header
  (LONG drops on downgrade days, SHORT drops on upgrade days, BOTH drop
  on M&A-target days).
- (f) `detector_test.ts:704` re-pin.
- (g) `si-freshness_test.ts` canary block: DEC-080's
  `analystRevisionStaleActive` import assertion covers both legs.
- (h) ACT-532 extended check — `grep -rn "a026dc51" supabase/` and
  every prior version-pinning literal after the bump; MUST return zero
  (INC-113 / Gate-11 dispatcher-pin lesson).

**ACT-529 uniformity:** commit IS deployment across
`overshoot-detection-run`, `-entry-run`, `-exit-run`, `-fill-sweep`.
Time the commit AFTER Tuesday's `overshoot.exit.run` fires and closes
so Tuesday stamps under OLD `a026dc51`.

**Verification (Wednesday 22:00Z):**
- Detection row stamps NEW `detector_version`.
- ≥1 refusal row `analyst_upgrade_proximate` expected (~2–3/day base
  rate per ACT-545).
- `analyst_revision_feed_stale` MUST NOT fire (pre-landing freshness
  verified).

## 6. Rollback

Revert commit; ACT-529 auto-deploy restores `a026dc51` uniformly.
Fixture regen deterministic.

## 7. Cross-refs

- ACT-527 §D (frozen rules, 42.42 dominance floor)
- ACT-529 (uniform redeploy on version bump)
- ACT-531 §A (ACT-543 sleeve — LONG-side upgrade continuation
  candidate; orthogonal to this SHORT-side exclusion)
- ACT-532 (atomic checklist)
- ACT-545 §3.2 (measurement)
- DEC-072 (upstream writer)
- DEC-080 (LONG-side sibling, same commit)
- DEC-082 (M&A both-sides guard, same commit)
- DEC-504-4 / `_shared/overshoot/si-freshness.ts` (single-home)
- INC-91 (single-home precedent), INC-106 (orthogonal same-version stamp)
