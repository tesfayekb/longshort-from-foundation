# DEC-076 — Long-short execution v1 default constants: governance home + recalibration schedule

- **ID:** DEC-076
- **Title:** Long-short execution v1 default constants — governance home + empirical-recalibration schedule (ratifies the already-in-code DW-145 / DW-146 / DW-147 constants as v1 defaults; pre-authorizes their supersession against paper-window evidence).
- **Plan Section:** longshort — execution calibration. Discharges FP-062 sub-step 6I.7 gap (d) (the "DW-145 / DW-146 / DW-147 calibration-DEC ratifications" open-gap line in the FP-062 roll-up at ACT-411). Tier A — clause (b) constants are money-path (every paper order routes through `computeLimitPrice`).
- **Date Approved:** 2026-06-30
- **Decision Type:** Tier A — financial-critical governance home for already-in-code execution constants. NO value change. Pre-authorized supersession path keeps the calibration ROI fully capturable.
- **Status:** active
- **Superseded By:** —
- **Supersedes:** the UNAUTHORED governance status of the 6 constants enumerated in clauses (a)–(c) (they remain byte-identical in code; this DEC supplies their DEC home).

## Framing (load-bearing — read this before reading the clauses)

This DEC is a **governance HOME, not a value LOCK**. The six constants enumerated below are ALREADY-IN-CODE at HEAD `9dcdc96a` (grep-confirmed values + line numbers cited verbatim per clause). This DEC:

1. **Ratifies** the existing values as v1 defaults (no value change; the constants stay byte-identical),
2. **Names** a governance home for each (closing the FP-062 gap (d) "UNAUTHORED" condition that the §14 + Rule-2 "silent default" failure-mode exists to prevent — a Tier-A money-path constant operating in live paper code with no DEC home is the precise failure shape we forbid), AND
3. **Pre-authorizes** an empirical-recalibration supersession path (clause (d)) so the calibration ROI is not foreclosed — recalibration against the paper-window evidence the original DW deferrals require is the SCHEDULED next move, not a separate authorization round.

Mirror of structural shape: this DEC's clause-based supersession discipline follows the DEC-070 precedent (DEC-070 clause (h) closed FP-057; DEC-070 clause (i) opened the DW-203 combiner-tick gate). Here, clauses (a)–(c) ratify v1 defaults; clause (d) is the named supersession trigger; clause (e) handles the DW-register transition.

## Context

At FP-062 sub-step 6I.7 roll-up (ACT-411 / 2026-06-30), gap (d) was named as one of five open gaps blocking discrete §10-Phase-6 closure: "DW-145 / DW-146 / DW-147 calibration-DEC ratifications — the 3 DEC-only homing determinations (NOOP_PCT, PRICE_OFFSET_*, QUOTE_MAX_STALENESS_S) remain UNAUTHORED; the in-code constants exist but have not been ratified against paper-window evidence under their own DEC-authoring turn." The DW deferral entries themselves (DW-145/146/147 in `deferred-work-register.md`) reserve the empirical recalibration to a post-E3-replay / paper-window window; the DEC-only homing has had no carrier until now.

Architectural posture (per Option A authorization 2026-06-30): the v1-default-ratified-now / empirical-recalibration-scheduled posture is dispositive over the defer-until-data posture, because the failure mode being prevented is governance (a Tier-A money-path constant with no DEC home), not calibration (which the supersession clause preserves intact).

---

## Decision

### Clause (a) — DW-145 noop-tolerance constants (E1 rebalance-planner band)

> **RATIFIED as v1 defaults (no value change):**
>
> - `NOOP_PCT = 0.02` — `supabase/functions/_shared/longshort-execution/rebalance-planner.ts:102`
> - `NOOP_FLOOR_USD = 50` — `supabase/functions/_shared/longshort-execution/rebalance-planner.ts:110`
>
> Together these define the E1 noop band: a target↔current divergence ≤ `max(NOOP_PCT × |target_notional|, NOOP_FLOOR_USD)` materializes as a `noop` intent (no broker submission) rather than a real order. The values shape commission/slippage drag and the engine's reactivity to price drift on the rank-30 pool.
>
> **Governance home:** this clause. **Calibration source for v1:** the E1-build named-constant pair surfaced at ACT-307 (FP-056 E1) as exports (not silent defaults; not phantom-zero anti-pattern), with no empirical replay evidence available at build time.
>
> **Recalibration trigger (clause (d) refers):** the empirical drift histogram measured from E3-replay-fixture surface + one paper window's worth of `longshort.execution.*` events (per DW-145 "Blocking Dependencies").

### Clause (b) — DW-146 marketable-limit pricing constants (Tier-A money-path; every paper order routes through these)

> **RATIFIED as v1 defaults (no value change):**
>
> - `PRICE_OFFSET_NORMAL_USD = 0.01` — `supabase/functions/_shared/longshort-execution/pricing.ts:40`
> - `PRICE_OFFSET_HIGH_PRICED_USD = 0.05` — `supabase/functions/_shared/longshort-execution/pricing.ts:47`
> - `HIGH_PRICED_THRESHOLD_USD = 500.00` — `supabase/functions/_shared/longshort-execution/pricing.ts:54`
>
> These govern the marketable-limit price the order-submitter posts at the broker boundary. The submitter posts `bid + offset` (buy) or `ask − offset` (sell) on every paper order. The two offsets are TIER-SELECTED (not additive): when `mid ≥ HIGH_PRICED_THRESHOLD_USD` the 5¢ HIGH_PRICED offset REPLACES the 1¢ NORMAL offset.
>
> **Boundary operator (literal-over-mental-model — cited from the code, not asserted):** `pricing.ts:173` reads:
>
> ```ts
> const offset = mid >= threshold ? offHigh : offNormal;
> ```
>
> The operator is `>=` (INCLUSIVE — a mid of exactly `$500.00` selects the HIGH_PRICED 5¢ tier). This matches the existing in-code comment at `pricing.ts:172` ("Threshold inclusive: $500+/share → mid ≥ 500.00") and the pure-test coverage at `pricing_test.ts` ("$499.95/$500.05 straddle (mid=500.00) → HIGH_PRICED (inclusive)").
>
> **Governance home:** this clause. **Calibration source for v1:** DEC-068 clause (k).3 verbatim, sourced from CROSSWIND_SPEC.md §8.2 L756/758. These are SPEC-AUTHORED defaults — the §8.2 spec itself reserves *"Phase 0 validates buffer width"*, meaning v1 is the spec-authored starting point pending empirical confirmation that 1¢ / 5¢ actually win the spread on the rank-30 large/mid-cap pool.
>
> **Recalibration trigger (clause (d) refers):** paper-window fill-evidence (NORMAL / HIGH_PRICED tier-bucketed marketable-limit win-rate vs. miss-rate) per DW-146 "Blocking Dependencies".

### Clause (c) — DW-147 quote-staleness ceiling (the `verify_quote_freshness` noise-tolerant ROI knob)

> **RATIFIED as v1 default (no value change):**
>
> - `QUOTE_MAX_STALENESS_S = VERIFY_QUOTE_FRESHNESS_TOLERANCE.max_age_s` (= `5`) — `supabase/functions/_shared/longshort-execution/order-submitter.ts:78`; sourced from `supabase/functions/_shared/longshort-verifiers/verify_quote_freshness.ts` (`VERIFY_QUOTE_FRESHNESS_TOLERANCE.max_age_s = 5`).
>
> The CROSSWIND §11.0.7 #3 verifier tolerance; mis-tuning over-fires the freshness verifier (cost: skipped MTM cycles) or under-fires it (cost: stale-quote-priced orders). Failure-action is `mtm_skipped_quote_stale` (not order-block), so this is a noise-tolerant verifier knob, not a hard money-path invariant.
>
> **Governance home:** this clause. **Calibration source for v1:** CROSSWIND §11.0.7 #3 default (*"Default max_age_s = 5"*).
>
> **Recalibration trigger (clause (d) refers):** per-symbol quote-age histogram (p50 / p95 / p99 by symbol tier) from one paper window's quote-fetch latency + observed `quote.ts` lag, per DW-147 "Blocking Dependencies".

### Clause (d) — SUPERSESSION TRIGGER (the ROI-preservation clause; mirrors DEC-070 clause-discipline shape)

> Each of clauses (a) / (b) / (c) IS SUPERSEDED by a follow-on DEC authored against the E3-replay / paper-window empirical distribution specific to that clause's named trigger:
>
> - clause (a) → drift histogram (E3 + one paper window of `longshort.execution.*` events);
> - clause (b) → paper-window fill-evidence by tier (NORMAL / HIGH_PRICED win-rate vs. miss-rate);
> - clause (c) → per-symbol quote-age histogram (p50 / p95 / p99 by symbol tier).
>
> Until the relevant supersession DEC is authored and ratified, the v1 values in clauses (a)–(c) are AUTHORITATIVE. The supersession may take the form of a clause amendment to this DEC, a clause amendment to DEC-068 clause (k), or a standalone DEC — the carrier is at operator discretion at the recalibration moment; the trigger condition is fixed here.
>
> **This DEC does provide a governance home for the v1 values; it does NOT foreclose recalibration against empirical evidence.** Recalibration is the SCHEDULED next move, not a separate authorization round. The calibration ROI stays fully capturable — the supersession path is named and pre-authorized, not contingent on future operator approval. (Mirrors DEC-070's "ratifies X; does NOT supersede Y" shape and DEC-070 clauses (h)/(i) closed-vs-open discipline.)

### Clause (e) — DW-register transition + addenda

> DW-145, DW-146, and DW-147 transition `Status: open` → `Status: open-RATIFIED-V1-PENDING-EMPIRICAL-RECALIBRATION` (mirroring the `open-CONTAINED` shape DW-204 uses at ACT-410).
>
> A Rule-8 addendum is appended to each of the three DW entries recording the DEC-076 ratification + the supersession trigger named in clause (d). **Original DW-145 / DW-146 / DW-147 fields are PRESERVED VERBATIM (Constitution Rule 8 additive); the addenda are appended-only.**

---

## Dependencies

- DEC-068 clause (k).3 (the constants table the clause-(b) v1 values are sourced from); clause (k).7 (the explicit DW-145/146/147 reservations now homed here).
- CROSSWIND_SPEC.md §8.2 L756/758 (clause-(b) spec authority + "Phase 0 validates buffer width" reservation).
- CROSSWIND §11.0.7 #3 (clause-(c) verifier-tolerance default).
- FP-056 E1 (clause-(a) constants surfaced as exports at ACT-307); FP-056 E2 (clause-(b) constants surfaced in `pricing.ts` at ACT-309); FP-056 E3 (the replay-evidence checkpoint that all three supersession triggers in clause (d) reference).
- DW-145 / DW-146 / DW-147 (the three deferred-work entries this DEC ratifies-with-supersession-trigger).
- FP-062 sub-step 6I.7 roll-up at ACT-411 (the open-gap-(d) line this DEC discharges).
- Constitution Rule 2 (no silent defaults — the DEC home this clause supplies is the discharge).
- Constitution Rule 8 (additive supersession discipline — the original DW fields are preserved; addenda are appended).

## Used By / Affects

- `supabase/functions/_shared/longshort-execution/rebalance-planner.ts` (clause (a)).
- `supabase/functions/_shared/longshort-execution/pricing.ts` (clause (b)) — every paper order routes through `computeLimitPrice` here.
- `supabase/functions/_shared/longshort-execution/order-submitter.ts` + `supabase/functions/_shared/longshort-verifiers/verify_quote_freshness.ts` (clause (c)).
- FP-062 Status roll-up — gap (d) flips from "UNAUTHORED" to "RATIFIED at DEC-076 / ACT-415" (Phase-6 discrete-closure gates (c) DW-058-B2 disposition + (e) live-fills validation REMAIN OPEN; this DEC closes ONLY gap (d) — Phase 6 is NOT closed).

## Risks If Changed

- **Clause (b) is Tier-A money-path.** Any value change before the clause-(d) supersession trigger fires (paper-window fill-evidence) would alter the marketable-limit posture of every paper order in flight — must wait for the supersession DEC.
- Premature supersession (authoring a recalibration DEC before the trigger data is in hand) would re-introduce the "silent default" failure mode this DEC closed.
- Re-classifying this DEC as a value LOCK (removing or weakening clause (d)) would foreclose the calibration ROI and re-open the FP-062 gap (d) in spirit even if the text stays. Clause (d) is load-bearing.

## Related Documents

- [DEC-068 — long-short execution authorization](DEC-068-longshort-execution-authorization.md) (clause (k).3 / clause (k).7).
- [DEC-070 — long-short cadence rebuild](DEC-070-longshort-cadence-rebuild.md) (structural precedent for clause-based supersession).
- `docs/08-planning/feature-proposals.md` (FP-056 E1/E2/E3 charter rows; FP-062 sub-step 6I.7 roll-up gap (d)).
- `docs/08-planning/deferred-work-register.md` (DW-145 / DW-146 / DW-147 entries + DEC-076 ratification addenda appended per clause (e)).
- `docs/04-modules/longshort/design-source/CROSSWIND_SPEC.md` §8.2 (clause (b) authority); §11.0.7 #3 (clause (c) authority).

## ACT

ACT-415 (this DEC + the three DW addenda + the FP-062 gap (d) roll-up update).