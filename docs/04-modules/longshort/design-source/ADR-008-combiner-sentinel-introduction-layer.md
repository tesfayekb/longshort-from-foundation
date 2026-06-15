# ADR-008: Combiner Sentinel-Introduction Layer

**Status:** Accepted
**Date:** 2026-06-14 (FP-052 (3.0) authoring)
**Deciders:** Crosswind operator (sole decision authority for v1 per §11.0.12.5)
**Related:** ADR-003 (enforcement-as-scripts-not-prose — the `scripts/check-sentinel-patterns.ts` enforcement substrate codified there is the live mechanism that this ADR authorizes a single exception against); ADR-004 (live-DB verification discipline); CROSSWIND §4.3.5 (critical-exclusion + coverage gates); CROSSWIND §6.4 (count-normalized fallback ranker); CROSSWIND §6.5.1 (feature-vector construction — CORRECT sentinel-introduction anchor; spec-internal mis-citation routes to §6.5.6 tracked at DW-102); CROSSWIND §6.5.2 (sentinel-introduction locked value `Decimal('-999')`); CROSSWIND §6.5.3 (missingness companion); CROSSWIND §6.5.6 (SHAP attribution — NOT the sentinel site); FP-052 (3.0) feature-proposals entry; DW-102 (spec mis-citation correction); Constitution Rule 8 (approved-plan preservation — this ADR satisfies the documented-reason clause for a single banned-pattern exception); `docs/banned-patterns.md` override registry; `scripts/check-sentinel-patterns.ts` + `scripts/check-sentinel-patterns_test.ts`.

## Context

CROSSWIND §6.5.2 locks the sentinel value `Decimal('-999')` as the canonical "non-critical signal missing" marker that the combiner's feature-vector layer emits for any (ticker, signal) tuple where the underlying signal returned `is_present=0` AND the §4.3.5 critical-exclusion gate did NOT exclude the ticker outright (critical-signal absence is fail-shut; non-critical signal absence is sentinel-marked-and-carried so the count-normalized denominator at §6.4 is unbiased).

`scripts/check-sentinel-patterns.ts` enforces a project-wide ban on `-999` (and the related magic-number family `0`, `-1`, `999`, `9999`) in monetary / signal / sizing / P&L code paths to prevent silent phantom-default contamination (the "money-path zero" failure mode catalogued in `docs/ai-failure-modes.md`). The script is the live ADR-003 enforcement substrate.

FP-052 (3.0) authoring requires the combiner's feature-assembler to introduce `Decimal('-999')` at exactly one source line — the layer §6.5.1 calls the "feature-vector construction layer" — and to do so under explicit, registered, single-site authorization so the ban remains binding everywhere else.

## Decision

Authorize a single banned-pattern exception for `Decimal('-999')` introduction at exactly ONE source-line site:

**Authorized site:** `supabase/functions/_shared/longshort-combiner/feature-assembler.ts`, at the line constructing the `Decimal('-999')` value to populate a feature-vector cell for a non-critical absent signal.

**Required source annotation (verbatim):** `// allow-sentinel-fallback` on the same source line OR the immediately preceding source line. The annotation token MUST match this exact string (no whitespace variation other than the leading `//` comment marker). The enforcement script reads the annotation as the override token.

**Override-registry entry:** `docs/banned-patterns.md` MUST carry an entry at the FP-052 (3.0) build PR registering the exception with file path + line-anchor + ADR-008 cross-reference. Without the registry entry the override is INVALID even if the source annotation is present (enforcement script reads both).

**Out-of-scope (explicitly NOT authorized):** any other site emitting `Decimal('-999')` in signal / combiner / ranking / book / P&L code paths. The 3.0 build's CI gate (`scripts/check-sentinel-patterns.ts`) MUST fail on ANY second site emerging.

## Rationale

Three alternatives considered at FP-052 (3.0) authoring:

1. **Status-quo silent introduction without override** — REJECTED. Violates `scripts/check-sentinel-patterns.ts` ban; CI red on the 3.0 build; would force either deactivating the ban (worst — opens the family across the codebase) or hand-tuning the script to silently allow `Decimal('-999')` in `_shared/longshort-combiner/` (also bad — drift surface).
2. **Use a typed `Optional<Decimal>` everywhere and never introduce `-999`** — REJECTED. CROSSWIND §6.5.2 locks the sentinel value as a load-bearing contract for the count-normalized §6.4 ranker's denominator math (`is_present` companion column reads the sentinel as the disambiguator between "absent" and "present-but-zero"). Removing the sentinel requires re-deriving the entire §6.4 path AND the §6.5.3 missingness profile — out of scope for 3.0 and contrary to the spec.
3. **Authorize a single annotated site with override-registry binding (THIS ADR)** — ACCEPTED. Preserves the ban everywhere else; makes the single authorized site greppable, auditable, and CI-enforced; aligns with the §6.5.1 feature-vector-construction-layer contract; mirrors the `// allow-*` annotation pattern already used elsewhere in `_shared/` for narrow exceptions (precedent: e.g., the wall-clock allow-annotations enforced by `scripts/check-wall-clock.ts`).

## Consequences

**Positive:**
- Spec contract (§6.5.2 sentinel) honored.
- Ban (`scripts/check-sentinel-patterns.ts`) remains binding everywhere else.
- 3.0 build's exit-gate assertion (`SELECT 1 FROM combiner_rankings WHERE ranker_source <> 'count_normalized_fallback'` returns zero rows) is queryable downstream of the feature-vector layer that uses this sentinel.
- ADR + override-registry pairing makes the exception greppable and auditable.

**Negative / monitored:**
- Single annotated site is a focal point for review discipline at the 3.0 build PR; the source comment MUST not migrate to a second site under any "helpful refactoring" pressure.
- Override-registry entry MUST land in the same commit as the source annotation; the 3.0 build PR commit-shape gate enforces this co-landing.

**Future:**
- If FP-052.3 (LambdaRank promotion) changes the sentinel-introduction surface (e.g., adopts a typed `Optional<Decimal>` end-to-end), this ADR MUST be superseded with an explicit `superseded-by` pointer per Constitution Rule 8.
- If DW-102 (CROSSWIND_SPEC.md mis-citation correction) lands, this ADR's §6.5.1 anchor citation continues to hold (correction strengthens the binding, does not invalidate it).

## Enforcement

The 3.0 build PR MUST land:
1. The annotated source line in `feature-assembler.ts`.
2. The `docs/banned-patterns.md` override-registry entry.
3. A `scripts/check-sentinel-patterns_test.ts` sentinel pinning that EXACTLY ONE allow-annotated site exists under `supabase/functions/_shared/longshort-combiner/`.

Item (3) is the regression fence: if a second allow-annotated site is added under that path, the test fails. If the single authorized site is removed, the test fails (catches accidental deletion that would silently re-route the §6.5.2 contract through unannotated sentinel emission elsewhere).