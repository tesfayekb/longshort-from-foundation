# ADR-008a: Combiner Sentinel-Introduction Layer — Repositioned to 3.2 Model-Input Builder

**Status:** Accepted
**Supersedes:** [ADR-008](./ADR-008-combiner-sentinel-introduction-layer.md) — per Constitution Rule 8 `superseded-by` discipline; ADR-008 was unconsumed by code at supersession time (no `feature-assembler.ts` source file existed yet — supersession is decision-layer only, no code revert required).
**Date:** 2026-06-16 (ACT-234 — FP-052 sentinel-design reposition 3.0b → 3.2)
**Deciders:** Crosswind operator (sole decision authority for v1 per §11.0.12.5)
**Related:** ADR-008 (this ADR supersedes it — authorized-site relocation); ADR-003 (enforcement-as-scripts-not-prose — `scripts/check-sentinel-patterns.ts` substrate unchanged); ADR-004 (live-DB verification discipline); CROSSWIND §2/L387 (None-canonical axiom 3); §4.3.5 (critical-exclusion + coverage gates); §6.4 (count-normalized fallback ranker — reads `__is_present`, NEVER reads `-999`); §6.5.1/§6.5.3 (sentinel introduced at exactly one place; all other code paths use `Optional[Decimal]`); §6.5.2 (sentinel value locked at `Decimal('-999')`); §6.5.4 (training data replicates missingness profile, replayed at Phase 3 training); §6.5.6 (SHAP attribution — NOT the sentinel site; spec-internal mis-citation tracked at DW-102); FP-052 (3.0b/3.2) feature-proposals entry; ACT-234 (this supersession); Constitution Rule 8 (approved-plan preservation — supersession is the mandated mutation mechanism); `docs/banned-patterns.md` override registry; `scripts/check-sentinel-patterns.ts` + `scripts/check-sentinel-patterns_test.ts`.

## Context

ADR-008 authorized the `Decimal('-999')` sentinel-introduction site as `supabase/functions/_shared/longshort-combiner/feature-assembler.ts`, with on-disk persistence of `-999` into `combiner_feature_vectors.features` jsonb cells. Dual independent investigation (Claude + Lovable, READ-ONLY reconciliation against HEAD `1b23b44d` per ACT-234) refuted that authorization on four independent spec axes:

1. **§6.5.3 L649–651** locks the sentinel-introduction site as "the feature-vector construction **function** that assembles the 16-feature **input to the combiner** … All other code paths use `Optional[Decimal]`." The DB persistence boundary (write to `combiner_feature_vectors.features`, read back later) is operationally one of the "other code paths" that §6.5.3 binds to `Optional[Decimal]`. Storage is not the construction function.
2. **§6.5.4 L657–662** says training samples "include `is_present_i = 0` rows with `value_i = Decimal('-999')`" but explicitly grounds this in a missingness profile "captured per Phase 2 sub-phase and **replayed** at Phase 3 combiner training." The `-999` value is re-introduced at train-time from typed-absence + the profile; the spec does not require on-disk sentinel persistence in the feature store.
3. **§2/L387 axiom 3** establishes `None` as the canonical absence representation; synthetic numerics on disk are the SENTINEL defect class absent a necessity-narrowed ADR exception. No necessity exists: `__is_present=0` carries absence; `Decimal('-999')` is bit-exactly reconstructible from the spec-locked constant (§6.5.2).
4. **§6.4 consumer reality.** The count-normalized fallback formula `Σ(z_i × is_present_i) / max(1, Σ is_present_i)` reads `__is_present` (absent → zero contribution to both numerator and denominator); it NEVER reads `-999`. The only consumer of the `-999` sentinel is the 3.2 LightGBM model input layer.

ADR-008's "authorized site = `feature-assembler.ts`" choice was therefore mispositioned by one layer: the assembler must build typed-absence and persist that to disk; the in-process model-input builder (3.2) reads typed-absence from the feature store and materializes `(value=Decimal('-999'), is_present=0)` tuples in memory immediately before LightGBM `.predict()`.

## Decision

Authorize a single banned-pattern exception for `Decimal('-999')` introduction at exactly ONE source-line site:

**Authorized site:** the **3.2 in-process model-input construction function** that assembles the 16-feature input vector passed to LightGBM `.predict()` for combiner inference. Exact source path resolved at the FP-052 (3.2) build PR (conceptually under `supabase/functions/_shared/longshort-combiner/` adjacent to the LightGBM model loader). The function reads typed-absence from `combiner_feature_vectors.features` (or from the in-process assembler output for fresh ticks) and materializes the `(value, is_present)` feature pair the model was trained on.

**Required source annotation (verbatim):** `// allow-sentinel-fallback: ADR-008a` on the same source line OR the immediately preceding source line. The annotation MUST match the scanner regex `/\/\/\s*allow-sentinel-fallback:\s*ADR-\d+/` at `scripts/check-sentinel-patterns.ts:39` — the `: ADR-NNN` suffix is mandatory (ADR-008's prose omission of the suffix would have failed the override check at the assembler; this ADR fixes that prose defect per ACT-234 F1).

**Override-registry entry:** `docs/banned-patterns.md` MUST carry an entry at the FP-052 (3.2) build PR registering the exception with file path + line-anchor + ADR-008a cross-reference. Without the registry entry the override is INVALID even if the source annotation is present (enforcement script reads both).

**At 3.0b (feature assembler):** NO `Decimal('-999')` source line, NO `// allow-sentinel-fallback` annotation, NO `docs/banned-patterns.md` entry, NO `check-sentinel-patterns_test.ts` single-site pinning. `combiner_feature_vectors.features` stores TYPED-ABSENCE only: non-critical signals as `{__value: <z-score>|null, __is_present: 0|1}`; critical signals as bare numeric (excluded upstream if missing).

**Out-of-scope (explicitly NOT authorized):** any site other than the 3.2 model-input construction function emitting `Decimal('-999')` in signal / combiner-assembler / ranking / book / P&L code paths. The 3.2 build's CI gate (`scripts/check-sentinel-patterns.ts`) MUST fail on ANY second site emerging — and MUST also fail if a `-999` literal appears in the 3.0b feature-assembler (the assembler is now affirmatively forbidden from the sentinel).

## Rationale

Three alternatives considered at ACT-234 reconciliation:

1. **Status-quo ADR-008 (authorized site at feature-assembler, on-disk persistence)** — REJECTED. Violates §2/L387 axiom 3 (on-disk synthetic numeric without necessity); misreads §6.5.3 (DB persistence is an "other code path"); pays the axiom-3 cost without any consumer benefit at 3.0b/3.0c (the §6.4 fallback never reads `-999`).
2. **Eliminate the sentinel entirely (typed-absence end-to-end including LightGBM input)** — REJECTED for v1. CROSSWIND §6.5.2 locks `Decimal('-999')` as the sentinel value the LightGBM model is trained against; the §6.5.4 missingness-profile replay mechanism assumes the model sees `(value=-999, is_present=0)` tuples. Eliminating the sentinel at the model boundary requires re-deriving §6.5.2 + §6.5.4 + the §6.5.5 stress-test gates — out of scope, contrary to spec.
3. **Reposition the authorized site to the 3.2 in-process model-input builder; typed-absence on disk at 3.0b (THIS ADR)** — ACCEPTED. Honors §6.5.3 literally (exactly one source line constructs `Decimal('-999')`, in-process, immediately before `.predict()`); honors §2/L387 axiom 3 (disk holds typed-absence only); preserves §6.5.4 (sentinel re-introduced at model-input time from typed-absence + locked constant); preserves §6.4 consumer behavior (unchanged — fallback ranker reads `__is_present` directly, ignores the absent path's value); makes the single authorized site greppable, auditable, and CI-enforced; fixes ADR-008's prose annotation defect (`: ADR-008a` suffix matches scanner regex).

## Consequences

**Positive:**
- §2/L387 axiom 3 honored (no on-disk synthetic numeric in the feature store).
- §6.5.3 single-introduction-site contract honored at the layer the spec actually specifies (the function that assembles the 16-feature input TO the combiner = the model-input builder, not the persistence layer upstream of it).
- §6.4 fallback ranker (3.0c) consumes typed-absence directly via `__is_present` — zero downstream behavior change.
- MIG-099 schema (LANDED at ACT-233) requires NO modification — `features jsonb` accepts both shapes; the ACT-234 reposition is doc-only.
- 3.0b build's CI gate (`scripts/check-sentinel-patterns.ts`) remains binding everywhere — including across the 3.0b assembler (now affirmatively sentinel-forbidden).
- Annotation prose defect (ADR-008 lacked `: ADR-NNN` suffix vs scanner regex) corrected — the literal annotation that lands at 3.2 will match the override-check on first compile.

**Negative / monitored:**
- Train-time pipeline (3.3 LambdaRank promotion) MUST replay the missingness profile from typed-absence to materialize `(value=-999, is_present=0)` training samples per §6.5.4 — this is the same code path the spec already requires, but its correctness is now load-bearing for model fidelity (previously the on-disk `-999` would have been a redundant safety net).
- Single annotated site at the 3.2 model-input builder is a focal point for review discipline at the 3.2 build PR; the source comment MUST not migrate to the 3.0b assembler under any "helpful refactoring" pressure (would re-introduce the axiom-3 violation ADR-008a corrects).
- ADR-008 history preserved per Rule 8 (status flipped to Superseded with `superseded-by` pointer; file retained for audit lineage; no silent deletion).

**Future:**
- If FP-052.3 (LambdaRank promotion) adopts a typed `Optional<Decimal>` end-to-end including the LightGBM input boundary (would require spec changes to §6.5.2 + §6.5.4 + §6.5.5), this ADR MUST be superseded with an explicit `superseded-by` pointer per Constitution Rule 8.
- DW-102 (CROSSWIND_SPEC.md mis-citation of sentinel site as §6.5.6 SHAP instead of §6.5.1 feature-vector construction) remains tracked separately; its resolution does not affect this ADR's authorized-site decision.

## Enforcement

The 3.0b build PR MUST land WITHOUT:
1. Any `Decimal('-999')` source line in `_shared/longshort-combiner/feature-assembler.ts` or anywhere else in the 3.0b surface.
2. Any `// allow-sentinel-fallback` annotation in the 3.0b surface.
3. Any `docs/banned-patterns.md` entry referencing the 3.0b assembler.

The 3.2 build PR MUST land:
1. The annotated source line in the 3.2 model-input construction function (literal `// allow-sentinel-fallback: ADR-008a`).
2. The `docs/banned-patterns.md` override-registry entry referencing the 3.2 builder + ADR-008a.
3. A `scripts/check-sentinel-patterns_test.ts` sentinel pinning that EXACTLY ONE allow-annotated site exists under `supabase/functions/_shared/longshort-combiner/` AND it is the 3.2 model-input builder path (not the 3.0b assembler).

Item (3) of the 3.2 enforcement is the regression fence: catches both "second site added" and "single site migrated back to the 3.0b assembler" defects.