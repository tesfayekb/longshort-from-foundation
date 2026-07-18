# DEC-082 — Overshoot M&A-target both-sides RISK-CLASS GUARD (§6)

**Status:** ADOPTED (operator, 2026-07-18).
**Charter:** ACT-545 §3.3 (M&A target BOTH sides ADOPT-AS-RISK-CLASS-GUARD).
**Detector version target:** SAME next `RATIFIED_DETECTOR_VERSION` bump
as DEC-080 + DEC-081 — ONE atomic commit.
**Scope:** overshoot detector, BOTH admission legs (LONG + SHORT).
Classification: **§6 risk-class guard**, NOT an evidence-sized economics
adoption — the ratification rationale is structural, not the +/− bps
computation (see §4).

## 1. Ruling (operator verbatim)

> M&A-target both-sides exclusion — ADOPTED as a §6 risk-class guard
> (structural rationale on the record; sub-n-floor economics noted as
> directionally supporting, not evidence-sized; cite the longshort
> rule-3-3b-ma.ts precedent and the exact source table/field the
> detector reads, with its own freshness statement).

## 2. Exclusion definition (detector contract)

On BOTH admission legs (LONG and SHORT) for a candidate
`(ticker, as_of_date)`, the detector REFUSES the event iff there exists
an **ACTIVE** M&A action row where `ticker` is the deal TARGET.

Active = `status = 'announced'` and the row has NOT been superseded by
a same-deal `'closed'` or `'broken'` row keyed on
`(target_ticker, acquirer_ticker, announcement_date)`.

Refusal reason string: `ma_target_active` (new).
Hard refusal on BOTH legs — parity to CROSSWIND §3.3b LOCKED semantics
in longshort's `applyHardExclusions`
(`applies_to: 'both'`, book-symmetric).

**Acquirer >25% ratio guard (CROSSWIND §3.3b acquirer arm):** DEFERRED.
The longshort precedent excludes large acquirers with
`deal_size_usd / acquirer_market_cap > 0.25`. This DEC covers TARGET
only (the risk-class rationale — deal-pinned upside cap + unbounded
break-risk downside — attaches to the target's geometry, not the
acquirer's). Acquirer-side adoption tracked as a **follow-up
candidate** (ACT-546), NOT bundled into this commit; the ACT-545 matrix
row is TARGET-scoped.

### Source of truth

- **Table:** `public.ma_actions`
  (schema aligned to `MAAction` interface in
  `supabase/functions/_shared/longshort-hard-exclusion-interfaces.ts` —
  the longshort precedent's canonical shape).
- **Fields read:** `target_ticker`, `acquirer_ticker`, `status`,
  `announcement_date`, `updated_at`.
- **Active-status predicate:** `status = 'announced'`
  (mirrors `rule-3-3b-ma.ts:isActive`).
- **Upstream writers (dual-source, superset semantics):**
  1. FMP `/stable/mergers-acquisitions-latest`
     (DEC-057 §(b); adapter
     `supabase/functions/_shared/longshort-signals/active-catalyst/fmp-ma-fetcher.ts`).
  2. Tradier corporate-actions `merger_acquisition` sub-array
     (adapter
     `supabase/functions/_shared/longshort-signals/active-catalyst/tradier-corporate-actions-fetcher.ts`).
- **Prerequisite MIG (bundled in the atomic commit):** if
  `public.ma_actions` is not yet materialized in the overshoot-visible
  schema at commit time, add MIG-NNN scaffolding the table +
  ingestion-cursor row alongside the detector-code changes (same PR,
  D5 ledger entry). Verified before land.

### Longshort precedent cited (verbatim contract source)

- `supabase/functions/_shared/longshort-universe/hard-exclusions/rule-3-3b-ma.ts`
  (CROSSWIND v0.9 §3.3 LOCKED; `applies_to: 'both'` book-symmetric).
- `supabase/functions/_shared/longshort-universe/hard-exclusions/apply-hard-exclusions.ts`
  (orchestrator; longExcluded / shortExcluded both flip on
  `applies_to === 'both'`).
- Interface: `supabase/functions/_shared/longshort-hard-exclusion-interfaces.ts`
  (`MAAction` — same shape the overshoot detector reads).

Overshoot **re-uses the same TABLE** (single-source ingestion; both
strategies read from `public.ma_actions`). It does NOT re-import the
longshort rule module — trading-panel contract T5 forbids sibling
strategies importing from each other. Instead, overshoot's detector
predicate replicates the TARGET-arm semantics inline (small, closed
predicate; the shared surface is the DATA, not the code).

## 3. Freshness path (own statement — corporate-actions cursor)

M&A ingestion runs daily via the FMP + Tradier fetchers. Overshoot
detector reads `public.ma_ingestion_cursor.updated_at` (or the
equivalent last-successful-run cursor exposed by the ingestion cron)
and refuses the WHOLE detection run with reason
`ma_feed_stale` when `age(asOf, cursor.updated_at) > 2 business days`.

**Rationale for 2 business days (vs 3 for analyst revisions):** M&A
announcements are event-driven (not scheduled like earnings), and a
target ticker can be tagged ANY trading day. Staleness tolerance is
tighter than the analyst-revision cadence to keep the guard tight.

**Single-home discipline:** the M&A staleness predicate lands as a
NEW sibling in `_shared/overshoot/si-freshness.ts`:
`maStaleActive(asOfIso, cursorUpdatedAtIso, maxBusinessDays)`. NO
second implementation elsewhere (INC-91 pattern; DEC-504-4 co-location
comment extended). Canary import guard extended to cover the new
predicate.

**Empty-cursor behavior:** if `cursorUpdatedAtIso` is NULL (feed never
ran), `maStaleActive` returns TRUE (fail-closed) — distinct from the
`siStaleActive` "no data ≠ stale" semantic. Rationale: absent M&A data
would silently ADMIT names that a functioning feed would refuse — the
exact failure mode this guard exists to catch.

## 4. Economics — directional support, NOT evidence-sized

ACT-545 §3.3: **n = 892** (fails the frozen n ≥ 1,000 rule of ACT-527
§D). Measured dip-buying / spike-selling behavior on M&A-target names
runs **-103 bps/slot-day** vs baseline (both directions). This is
recorded as **directional support**, NOT as the ratification basis.

**Ratification basis (structural, on the record):**
- Deal-pinned upside CAP: an announced acquisition pins the target's
  upper bound near the deal price; overshoot's LONG geometry
  (buy-the-dip on a downside dislocation expecting mean-revert
  upward) has no room to work.
- Unbounded break-risk downside: deal breaks are gap-shaped events
  (10–40% single-day drops are typical); overshoot's SHORT geometry
  gets caught in one-way squeezes when a competing bid arrives, and
  its LONG geometry gets torched on the break.
- Corporate-actions class fits §6 (risk-class guards) — same
  category as the CROSSWIND §3.3b LOCKED rule; the longshort
  precedent adopts on structural grounds, not economic n.

Frozen n ≥ 1,000 rule is NOT waived — it is **NOT INVOKED**: this is a
risk-class guard, not an economics adoption. ACT-527 §D compliance
maintained.

## 5. Implementation sequencing (operator ruling)

Same window as DEC-080 + DEC-081 — Tuesday post-arm, first effective
book Wednesday 22:00Z. ONE commit bundles all three.

**ACT-532 atomic-flip checklist — ONE commit (union across DEC-080/081/082):**
- (a) `runDetector` predicate: add `ma_target_active` on BOTH legs +
  run-level `ma_feed_stale`.
- (b) `DETECTOR_PREDICATE_SPEC_V2_JSON`: add §6 risk-class-guards
  block with the M&A entry (target-side, both admission legs);
  LONG + SHORT admission blocks get their analyst additions (DEC-080/081).
- (c) `PREDICATE_SPEC_V2_SHA256`: recompute ONCE across the union.
- (d) `RATIFIED_DETECTOR_VERSION`: single bump from `a026dc51`.
- (e) `selection-parity_test.ts`: 20-day regen; M&A-target days drop
  BOTH counts (per-day delta in fixture header).
- (f) `detector_test.ts:704` re-pin.
- (g) `si-freshness_test.ts` canary block: assert `maStaleActive`
  import from the single-home module (alongside the DEC-080
  `analystRevisionStaleActive` assertion).
- (h) MIG-NNN (if needed): `public.ma_actions` +
  `public.ma_ingestion_cursor` scaffolding, D5 ledger entry, GRANTs
  per public-schema policy (`authenticated` + `service_role` at
  minimum; `anon` only if a policy allows).
- (i) ACT-532 extended grep: zero hits on `a026dc51` and prior
  version literals after the bump (INC-113 lesson).

**ACT-529 uniformity:** commit IS deployment across the four bundling
functions. Time commit AFTER Tuesday's `overshoot.exit.run` closes
under OLD version.

**Verification (Wednesday 22:00Z):**
- Detection row stamps NEW `detector_version`.
- `ma_feed_stale` MUST NOT fire (freshness pre-verified).
- Refusal `ma_target_active` fires iff Wednesday's slate intersects
  any active `ma_actions` target — expected 0–1 refusals/day at
  current base rate (M&A-target ticker overlap with the overshoot
  universe is thin).

## 6. Rollback

Revert commit → ACT-529 auto-deploy restores `a026dc51` uniformly.
MIG scaffolding is idempotent (IF NOT EXISTS; D3) — rollback of code
without rollback of table is safe (unused columns).

## 7. Cross-refs

- ACT-527 §D (frozen rules; §D compliance maintained — this is a
  risk-class guard, not an economics adoption, so n ≥ 1,000 not invoked)
- ACT-529 (uniform redeploy)
- ACT-531 §A (M&A-target continuation cell noted under-powered — this
  DEC is the risk-class guard, not the continuation sleeve)
- ACT-532 (atomic checklist)
- ACT-545 §3.3 (matrix row; structural rationale)
- ACT-546 (follow-up — acquirer >25% ratio guard; deferred)
- CROSSWIND v0.9 §3.3b (longshort LOCKED rule — data-source precedent)
- DEC-057 §(b) (FMP M&A ingestion authority)
- DEC-080 (LONG-side analyst-downgrade exclusion, same commit)
- DEC-081 (SHORT-side analyst-upgrade exclusion, same commit)
- DEC-504-4 / `_shared/overshoot/si-freshness.ts` (single-home; adds
  `maStaleActive` as a new sibling)
- INC-91 (single-home precedent)
- INC-106 (orthogonal same-version stamp)
- `supabase/functions/_shared/longshort-universe/hard-exclusions/rule-3-3b-ma.ts`
  (cited precedent contract)
