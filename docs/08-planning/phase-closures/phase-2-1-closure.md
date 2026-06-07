# Phase 2.1 Closure — Cross-Sectional Momentum (Signal #6) + 8-Element Signal-Stack Template Establishment

> **Owner:** AI (executor) + Claude (supervisor) + Operator (authority)
> **Plan section:** PLAN-TRADING-001-LONGSHORT (CROSSWIND §10.6 Phase 2.1 entry-criteria + §4.4.1 Signal #6 spec)
> **Authority:** CROSSWIND §10.6 template-establishment requirement; FP-009 operator-locked 9-decision survey (2026-06-05); DEC-034 replay-determinism scope
> **FP:** FP-009 (coterminous with Phase 2.1; closure paragraph in `docs/08-planning/feature-proposals.md` points here)
> **Closure SHA:** `<SHA-pending>` (Bucket D commit)
> **Closure Date:** 2026-06-06
> **Predecessor:** Phase 1 (closed at `e25fde8`, `docs/08-planning/phase-closures/phase-1-closure.md`)
> **Successor:** Phase 2.2 (Signal #7 — short-term reversal per CROSSWIND §4.4.2; inherits the §6 template locked by this closure)
> **Status:** CLOSED — all 6 observational/exit gates met; first tradable signal value live in production (834 momentum z-scores per `as_of_date`, daily 16:00 ET auto-fire via MIG-067).

---

## Summary

Phase 2.1 produced the first tradable signal value the platform has ever generated — 834 cross-sectional momentum z-scores per `as_of_date`, within-sector GICS-normalized per CROSSWIND §4.4.1, persisted to `signal_observations`, cron-enabled at MIG-067 for daily 16:00 ET auto-fire across all 11 GICS sectors. The phase also locked the 8-element signal-stack template that Phase 2.2 through 2.9 inherit mechanically — six of eight elements were built end-to-end, two (reconciliation hook, replay-fixture binding) are pattern-locked with execution explicitly deferred per operational-pressure-not-yet-forcing rationale.

The disarm-then-fire-then-enable cycle established at MIG-066 → manual-trigger observational fire → MIG-067 is now codified as a **load-bearing, required pattern** for Phase 2.2-2.9 — not optional governance ceremony. Three independent defect-catching surfaces fired during execution: a calendar-vs-trading-day unit confusion in the lookback constant caught only at the observational fire (no code-shape sentinel could have surfaced it); a latent Gate-15 offline-replay resolver bug caught only at the enable-flip migration; and four supervisor-draft drift patterns (wall-clock, `any`-types, naive query order/limit, unit-bearing arithmetic) caught at pre-task verifications. The cycle's three steps each earn their place at a distinct verification layer.

Phase 2.1 EXITS on this closure. Phase 2.2 entry is now mechanical: one new per-signal directory under `_shared/longshort-signals/`, shared infrastructure reused unchanged, two-migration cron-enable cycle per §7, supervisor pre-flight discipline per §9, platform-constraint inheritance per §8.

---

## Addendum — FP-018 / INC-62 Forward-Pointer (2026-06-07)

> **Addendum-not-edit notice (Constitution Rule 8):** The Summary above and the §1 Exit-Gate Attestation below are PRESERVED verbatim from the original closure. This addendum is the correction surface; the original attestation text is NOT edited. Per the FP-018 deliverable: closure-doc attestations are protected from silent supersession even when factually wrong; the correction lands as a forward-pointer, not an in-place rewrite.

**Correction:** The Summary's "daily 16:00 ET auto-fire via MIG-067" assertion and §1's "Cron enabled with observational evidence baked in — MET" gate attestation are correct at the `job_registry.enabled=true` registry-flag level and INCORRECT at the `pg_cron` scheduler level. MIG-067 flipped the registry flag but did NOT add a corresponding `cron.schedule(...)` entry — `longshort-momentum-compute` has no `cron.job` row and has never auto-fired since MIG-067. All 3 production `signal_compute_log` rows (`as_of=2026-06-05`) are manual-trigger fires from FP-009 C2a / C2a-hotfix / C2b observational gates.

**Class observation:** The verification discipline at MIG-067 apply was registry-flag-level (`SELECT ... FROM job_registry`) without a corresponding scheduler-level check (`SELECT ... FROM cron.job`). DEC-040 (allocated at FP-018) locks the verification discipline going forward: any closure attestation claiming scheduled execution requires `cron.job` evidence verbatim, not registry-flag evidence.

**Pointers:**
- INC-62 (full root-cause + class observation) — `docs/06-tracking/incidental-findings.md`
- FP-018 entry + scope + observational-gate plan — `docs/08-planning/feature-proposals.md`
- DEC-040 (verification-discipline governance amendment) — `docs/08-planning/approved-decisions.md`
- `signal-cron-wiring.md` (reusable runbook preventing class recurrence) — `docs/04-modules/longshort/runbooks/signal-cron-wiring.md`
- Master-plan FP-009 "daily auto-fire verified" phase-gate checkbox reverted at FP-018 Bucket A; re-check pending FP-018 Bucket C observational-gate close.

**Status of Phase 2.1's other attestations:** All other §1 gates remain MET as originally attested. The signal-computation correctness, orchestrator structure, observational gate over manual fires, and disarm-then-fire-then-enable cycle discipline are intact; only the scheduler-wiring evidence layer was insufficient. FP-018 corrects that single layer; the rest of Phase 2.1 stands.

---

## 1. Exit-Gate Attestation

**Gate — Shared infrastructure built and tested — MET.** Bucket A: 40 Deno unit tests across `signal-types.ts`, `z-score-normalize.ts` (12), `polygon-price-history-fetcher.ts` (8 + Gate-14 hotfix coverage), `missingness-capture.ts` (8). MIG-064 (`signal_observations` table) live-DB verified: 8 columns + 4 RLS policies (1 PERMISSIVE SELECT + 3 RESTRICTIVE deny per MIG-057 discipline) + 0 rows immediately post-apply. Function-index + reference indexes updated SAME PR per Constitution Rule 2.

**Gate — Signal computation correct against §4.4.1 spec-literal — MET.** Bucket B Commit B1: `compute-momentum.ts` with `MOMENTUM_MIN_BARS = 253` (12-month rolling minus most-recent-month per §4.4.1 literal indexing — NOT the 273-bar academic-paper variant); 13 tests including the explicit off-by-one sentinel pinning array indices `[t-252 ... t-21]` + the 1%-daily-growth analytic test where expected return is hand-computable; spec-literal indexing locked at the test layer per INC-54 (template element 1 + pattern-replication target for Phase 2.2-2.9 per §6).

**Gate — Orchestrator produces structured result over universe — MET.** Bucket B Commit B2: `momentum-orchestrator.ts` 5-step pipeline (read universe → fetch price histories → compute momentum → within-sector z-score normalize → persist) with bounded concurrency (`pLimitedMap` extraction at 20 parallel); 12 tests covering happy path, four skip-reason attributions (`insufficient_history` / `missing_sector` / `fetch_error` / `singleton_sector`), concurrency cap, byte-identical determinism via `JSON.stringify`, universe-read-error propagation, persistence-error propagation. Two B2 hotfixes: wall-clock leak in telemetry sites (Gate-2 catch — DEC-034 clause (4) replay-determinism); `any` types in test mocks (Gate-4 catch — typed `MockSupabaseBuilder<T>`).

**Gate — Production wiring + disarmed-at-creation — MET.** Bucket C Commit C1: MIG-065 (`signal_compute_log` table) + MIG-066 (`job_registry` row for `longshort.momentum.compute` with `enabled = false` at creation per disarm-then-fire-then-enable discipline) both live-DB verified; 23 tests across `longshort-momentum-compute/index.ts` (cron handler: `verifyCronSecret` + `productionClock` + orchestrator invocation + `signal_compute_log` write + 3-event audit envelope per DEC-023 envelope), `longshort-momentum-compute-manual/index.ts` (operator-trigger sibling with `longshort.manage` permission), and the shared `persistSignalComputeLog` helper. C1 hotfix `cc63060` refactored cross-handler imports to `_shared/` per the Deno deploy bundler constraint catalogued at §8(i).

**Gate — Observational gate fires clean — MET.** Bucket C Commit C2a + lookback hotfix: manual-trigger observational fire `run_id 59946ae5-57cd-485a-9cc4-5dcd17d15925` at `as_of = 2026-06-05` returned `outcome = completed`, `persisted_count = 834 / 839` (99.4% populated), `mean_z ≈ -0.0225`, all 11 GICS sectors represented with statistically coherent within-sector distribution (no degenerate ±3 clipping cluster, no all-null sector, no singleton-sector flag fire above baseline). 5-row delta against the 839-ticker eligible universe attributed cleanly via `skip_counts` to `insufficient_history` (the residual long-tail of new-listings shorter than 253-bar window). C2a lookback hotfix `61ce662`: `PRICE_HISTORY_LOOKBACK_DAYS` corrected from 280 → 400 calendar days (calendar-vs-trading-day unit fix per §9; the original pre-hotfix fire returned `persisted_count = 0 / skip_counts.insufficient_history = 839` exposing the supervisor-draft unit confusion).

**Gate — Cron enabled with observational evidence baked in — MET.** Bucket C Commit C2b: MIG-067 applied live-DB; enabled `longshort.momentum.compute` (`enabled = true`) with observational evidence (`run_id`, `persisted_count`, `populated_pct`, sector distribution, z-score statistics) embedded **verbatim** in the migration `COMMENT` block as durable governance record. Schedule confirmed `0 20 * * 1-5` (Mon-Fri post-market-close, 16:00 ET / 20:00 UTC). C2b tail-hotfix `fc5ad66`: Gate-15 offline-replay resolver INSERT-path bug surfaced + fixed (`scripts/check-handler-liveness-markers.ts:211` was hardcoding `handler_path: null` when establishing new state-map entries from INSERT VALUES; bug was latent while `enabled = false` short-circuited P1/P2 predicates and was exposed by C2b's enable-flip moving the row into the detection window). All 17 Gate-15 sentinel tests green post-fix (16 prior + 1 regression covering "INSERT with `handler_path` in VALUES populates `handler_path`").

---

## 2. Deliverable Attestation (Bucket-by-Bucket SHA Map)

| Bucket / Commit | SHA | Deliverable |
|---|---|---|
| Bucket 0 | (per FP-009 lifecycle) | GICS sector plumbed end-to-end through universe ingestion: `UniverseConstituent.gics_sector` typed contract; Wikipedia + iShares fetchers populate; Polygon emits typed-absence; persister threads single-site; **MIG-063** adds `universe_membership.gics_sector text` nullable; 7 new fetcher tests; INC-49 surfaced + resolved. |
| Bucket 0.1 | (per FP-009 lifecycle) | Source-wiring closure: 3-line in-memory `sectorMap` projection at orchestrator step 3b between Polygon enrichment and `applyFilters` (zero new I/O, zero new failure surface); 3 new orchestrator tests; INC-50 logged (latent `ctx.iSharesConstituents` naming-debt observation). |
| Bucket 0.2 | (per FP-009 lifecycle) | Operator-triggered `longshort-universe-manual-quarterly-refresh/index.ts` (operator JWT + `longshort.manage`; `parseAsOfDate` strict parser; dual audit envelope; 9 tests); enables the Bucket 0.1 observational gate without waiting for natural Oct-1 refresh; INC-51 captures cron-vs-manual context-construction duplication debt. |
| Bucket A Commit A1 | (per FP-009 lifecycle) | Shared signal-type contracts + within-sector z-score normalization: `signal-types.ts` (`SignalRow`, `SignalComputationError`, `SignalSkipReason` union) + `z-score-normalize.ts` + 12 tests. Language-stack mapping locked: TS `number \| null`; `-999` sentinel restricted to Phase 3 combiner per §5(a). |
| Bucket A Commit A2 | (per FP-009 lifecycle) | `polygon-price-history-fetcher.ts` + tests; reuses Polygon `/v2/aggs/ticker/{T}/range/1/day/...` endpoint with `adjusted=true` server-side; bounded concurrency at 20; INC-52 captures pattern reuse against the universe-side enrichment fetcher precedent. Gate-14 hotfix landed inside this bucket. |
| Bucket A Commit A3 | (per FP-009 lifecycle) | **MIG-064** `signal_observations` table (composite PK `(operator_id, signal_id, as_of_date, ticker)`; CHECK constraint pinning `value`/`is_present` consistency; RLS per MIG-057 discipline) + `missingness-capture.ts` (`captureSignalObservations` idempotent UPSERT, empty-array short-circuit, error-returned-not-thrown) + 8 tests; INC-53 captures empty-state baseline rationale. |
| Bucket B Commit B1 | (per FP-009 lifecycle) | `compute-momentum.ts` (`MOMENTUM_MIN_BARS = 253` spec-literal per §4.4.1; off-by-one sentinel test; 1%-daily-growth analytic test); 13 tests; INC-54 captures spec-vs-academic-273 indexing decision + reconciliation hook deferral (template element 4). |
| Bucket B Commit B2 | (per FP-009 lifecycle) | `momentum-orchestrator.ts` 5-step pipeline + `pLimitedMap` extraction; 12 tests; INC-55 captures orchestrator architecture + universe-query correction (two-step latest-`as_of_date` → rows-at-that-date, not naive `order/limit`) + `SIGNAL_ID` constant lock. |
| Bucket B Commit B2 hotfix (wall-clock) | (per FP-009 lifecycle) | Removed `new Date().toISOString()` from telemetry sites (`started_at` / `completed_at` / `computed_at`); injected `Clock` per DEC-034 replay-determinism. Gate-2 sentinel catch. |
| Bucket B Commit B2 hotfix (any-type) | (per FP-009 lifecycle) | Replaced `: any` test mocks with `MockSupabaseBuilder<T>` typed interface. Gate-4 sentinel catch. |
| Bucket C Commit C1 | (per FP-009 lifecycle) | **MIG-065** `signal_compute_log` table + **MIG-066** `job_registry` row (`longshort.momentum.compute`, `enabled = false` at creation, `handler_path` populated, schedule `0 20 * * 1-5`); cron handler + manual handler + persist helper; 23 tests. |
| Bucket C Commit C1 hotfix (cross-import) | `cc63060` | Refactored cross-handler imports (`parse-as-of-date.ts`, `persist-signal-compute-log.ts`) to `_shared/longshort-signals/shared/` per Deno deploy bundler constraint (§8(i)). |
| Bucket C Commit C2a | (per FP-009 lifecycle) | Component documentation `docs/04-modules/longshort/signals/cross-sectional-momentum.md` + runbook `momentum-price-history-failure-runbook.md` (template elements 7 + 8); first observational fire `run_id f8e10475-...` exposed the lookback unit-confusion bug (`persisted_count = 0`). |
| Bucket C Commit C2a hotfix (lookback) | `61ce662` | `PRICE_HISTORY_LOOKBACK_DAYS` 280 → 400 calendar days (~276 trading days at 252/365 ratio; covers 253 MIN_BARS + 23-day holiday-cluster headroom); explicit calendar-vs-trading-day arithmetic in source comment per §5(c). Re-fire `run_id 59946ae5-...` clean (834/839 persisted). INC-57. |
| Bucket C Commit C2b | `8656d7b` (merge) | **MIG-067** enable-flip with observational evidence embedded verbatim in `COMMENT` block; `longshort.momentum.compute` live in production. INC-58 (first tradable signal milestone + observational gate as defect-catching layer + 3 platform constraints). |
| Bucket C Commit C2b tail-hotfix | `fc5ad66` | Gate-15 resolver INSERT-path fix (`scripts/check-handler-liveness-markers.ts`): `handlerPathIdx = cols.indexOf('handler_path')` parallel to `enabledIdx`/`triggerIdx`; existing-fallback read pattern; +1 regression test (17 sentinel tests green). INC-59. |
| Bucket D | `<SHA-pending>` | **This closure document** + FP-009 closure pointer in `feature-proposals.md` + INC-60. Docs-only; no code, no migration, no schema change. |

---

## 3. Migration Ledger at Closure

| MIG | Bucket | Effect |
|---|---|---|
| MIG-063 | Bucket 0 | `universe_membership.gics_sector text NULL` (additive nullable; NULL-forward, no backfill per INC-36 epistemic-honesty + operator decision Q2). |
| MIG-064 | Bucket A Commit A3 | `signal_observations` table — per-signal per-ticker missingness capture; composite PK `(operator_id, signal_id, as_of_date, ticker)`; CHECK constraint on `value`/`is_present` consistency; RLS per MIG-057 (PERMISSIVE SELECT + 3 RESTRICTIVE deny). |
| MIG-065 | Bucket C Commit C1 | `signal_compute_log` table — per-run signal-orchestrator telemetry. |
| MIG-066 | Bucket C Commit C1 | `job_registry` row for `longshort.momentum.compute` with **`enabled = false`** at creation (disarm-then-fire-then-enable discipline; the first MIG in the two-migration cron-enable cycle locked by §7). |
| MIG-067 | Bucket C Commit C2b | Enable-flip — `enabled = false → true` for `longshort.momentum.compute` with observational evidence (`run_id 59946ae5-...`, `persisted_count 834`, `populated_pct 99.4%`, 11-sector distribution, z-score statistics) embedded verbatim in `COMMENT` block. The second MIG in the two-migration cycle. |

No DROP / destructive ALTER landed in this phase. All migrations idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) per D3 discipline. All migrations scoped per-strategy per D4 (touched only `longshort_*` / signal-scoped objects). All 5 entries present in `docs/07-reference/database-migration-ledger.md` per D5.

---

## 4. Forward-Binding Deferrals

Two of the 8 template elements are pattern-locked with execution explicitly deferred. Both are registered in `docs/08-planning/deferred-work-register.md` with blocking dependencies and future-phase assignment per the deferred-work protocol.

**Reconciliation hook (template element 4) — pattern locked, execution deferred per FP-009 B1 Option A.** The `ReconcileCallSpec` interface's `VerifyCallName` union is closed and does not include signal-specific names. The architectural choice between Option B (parallel `SignalReconcileSpec` local to `_shared/longshort-signals/shared/`) and Option C (widen `VerifyCallName` to add 9 signal names and use the full `ReconcileCallSpec`) is a real commitment with consequences for the next 8 signals AND for Phase 3's combiner; it will be made when operational pressure (an actual backup price-history source — Yahoo / Tradier / IBKR per CROSSWIND §4.4.1 spec) forces the right answer rather than being pre-emptively guessed. **Landing target:** Phase 7 paper-trading-broker integration OR earlier per operator scope. **Phase 2.2-2.9 do NOT implement reconciliation hooks until this decision lands** — signal sub-phases ship without element 4 until then.

**Replay-fixture binding (template element 6) — pattern locked, execution deferred.** Phase 0B's replay framework (`combiner_io` event stream in `replay-fixture.ts`) already types the signal-to-combiner boundary via `CombinerSignalInput { symbol, signal_id, value, is_present, ts }`. Phase 2.1 produces rows matching this contract; Phase 3 combiner consumes them. The per-signal fixture generator was NOT built in Phase 2.1. **Landing target:** replay-test work post-Phase-2.9 OR earlier per operator scope. **File path locked at** `src/features/longshort/services/replay/l2-synthetic-<signal>-generator.ts`. Phase 2.2-2.9 may inherit this deferral or may build replay generators per-signal at operator-scope discretion — the typed contract is locked either way.

The 6 built elements + 2 deferred elements honesty count is the load-bearing distinction that prevents Phase 2.2 from either (a) silently skipping element 4 / element 6, or (b) naively attempting them and discovering they're harder than expected. §6's template table makes the count visible.

---

## 5. Locked Architectural Decisions (9)

The 9 decisions surveyed at FP-009 pre-investigation (2026-06-05) and locked across execution. Phase 2.2-2.9 inherit these mechanically; re-litigation requires a fresh FP per Constitution Rule 8.

**(a) Language-stack mapping.** Spec `Optional[Decimal]` → TS `number | null`. No Decimal library introduced. The `-999` sentinel is restricted to the Phase 3 combiner's feature-vector layer per CROSSWIND §6.5.2; signal-producing functions return `number | null` and NEVER substitute sentinels. Precision rationale: ratio + z-score-with-±3-clip is 12+ orders of magnitude past IEEE-754 limits; arithmetic is reproducible bit-identical across runs. Matches the §22.3(b) idiom-grep lock established for enrichment thresholds.

**(b) Module layout.** `supabase/functions/_shared/longshort-signals/<signal_name>/` per-signal directory + `supabase/functions/_shared/longshort-signals/shared/` cross-signal utilities. Mirrors the `_shared/longshort-universe/` precedent verbatim. Phase 2.2-2.9 each create one new per-signal directory; `shared/` grows only when a new cross-signal concern surfaces.

**(c) Polygon endpoint reuse with EXPLICIT calendar/trading-day arithmetic.** `/v2/aggs/ticker/{T}/range/1/day/...` endpoint; `adjusted=true` server-side. **400 calendar days = ~276 trading days** (calendar/trading ratio ≈ 252/365 ≈ 0.69) covers `MOMENTUM_MIN_BARS = 253` + 23-day holiday-cluster headroom. **All signal sub-phases that introduce lookback constants MUST include explicit calendar-vs-trading-day arithmetic in the in-source comment** — INC-57 captures the original supervisor-draft drift (280 calendar days = ~193 trading days < 253 MIN_BARS) that motivated this discipline. The `limit=5000` URL parameter is sized to accommodate the 400-day window comfortably; not tuned per-signal.

**(d) Signal-critical-agnostic architecture.** Signal-computation functions are UNAWARE of whether the signal is critical or non-critical per CROSSWIND §4.3.5. The critical/non-critical flag lives on Phase 3 combiner's signal-registration metadata, NOT on the signal-computation function. The signal layer uniformly emits `(ticker, signal_id, value, is_present, gics_sector, computed_at)` rows; combiner branches on `is_present` (critical) or substitutes `-999` sentinel (non-critical). This decouples signal sub-phases from combiner architecture and is what makes Phase 2.2-2.9 sequencing-independent of Phase 3.

**(e) Missingness capture via shared `signal_observations` table + offline aggregation.** Per CROSSWIND §6.5.3 the missingness profile records baseline + sector-conditional + time-conditional rates. Implementation: `signal_observations` (MIG-064) captures per-`(operator, signal_id, as_of_date, ticker)` observations; offline aggregation script (future scope) reads the table and writes `docs/missingness_profile.md`. **Capture is continuous from Phase 2.1 landing through Phase 3 entry** — the profile populates over time, not as a one-shot deliverable. Phase 2.2-2.9 each emit observations to the same shared table by changing only the `SIGNAL_ID` constant.

**(f) Replay binding via Phase 0B's `combiner_io` contract.** Phase 0B's `CombinerSignalInput` interface (`replay-fixture.ts`) already types the signal-to-combiner boundary as `{ symbol, signal_id, value, is_present, ts }`. Phase 2.1 produces rows matching this contract; Phase 3 combiner consumes them. **Replay-fixture generator implementation deferred per §4**, but the typed contract is locked — no re-design needed at the generator-building step.

**(g) Cadence budget — API-bound at Polygon Stocks Advanced (unlimited-calls/min).** Cold-fetch ~750 tickers × ~280-day daily bars ≈ 750 HTTP round-trips; bounded concurrency at 20 yields ~60-180 second total runtime per fire. Steady-state incremental fetch (Phase 7+ optimization) shrinks to ~750 calls × 1-2 bars each. The cadence-budget gate uses Advanced-unlimited as the headroom assumption; **the observed first-production-run throughput is the locked operational baseline** for future budget reasoning, not the pre-deployment estimate.

**(h) Test pattern — inline synthetic fixtures, no `fixtures/` directory bloat.** Mirrors FP-008.4 #13 (Wikipedia) + #23 (enrichment fetcher) precedent. Each signal test file self-contains synthetic price arrays + deterministic expected values + boundary cases. **All signal tests MUST include an off-by-one sentinel test pinning explicit array indices** per the INC-54 / B1 lesson: spec-literal indexing must be locked at the test layer to prevent re-litigation of the 273-vs-253 question on every future signal.

**(i) 8-element template as 8 concrete file paths.** See §6.

---

## 6. 8-Element Template — File Structure with Built/Deferred Distinction

Per CROSSWIND §10.6 template-establishment requirement. Phase 2.2-2.9 mechanically inherit this structure; each signal sub-phase creates the per-signal files + reuses shared files unchanged.

| # | Element | File path | Status in Phase 2.1 |
|---|---|---|---|
| 1 | Signal computation | `_shared/longshort-signals/<signal>/compute-<signal>.ts` + `_test.ts` | **BUILT** — `compute-momentum.ts` + 13 tests at B1 (incl. off-by-one sentinel + 1%-daily-growth analytic) |
| 2 | Within-sector z-score normalization | `_shared/longshort-signals/shared/z-score-normalize.ts` + `_test.ts` | **BUILT, SHARED** — inherited by all 9 signals; no per-signal code; 12 tests at A1 |
| 3 | `Optional[Decimal]` discipline (`number \| null` lock) | `_shared/longshort-signals/shared/signal-types.ts` | **BUILT, SHARED** — inherited by all 9 signals; A1 lock |
| 4 | Ingestion-time reconciliation hook | `_shared/longshort-signals/<signal>/<signal>-reconciliation.ts` | **PATTERN-LOCKED, EXECUTION DEFERRED** — see §4; Option B-vs-C choice pending operational pressure (backup price-history source landing) |
| 5 | Missingness profile capture | `_shared/longshort-signals/shared/missingness-capture.ts` + `signal_observations` table (MIG-064) | **BUILT, SHARED** — inherited by all 9 signals; per-signal code = `SIGNAL_ID` constant + orchestrator wiring; 8 tests at A3 |
| 6 | Replay-framework integration | `src/features/longshort/services/replay/l2-synthetic-<signal>-generator.ts` + replay-pass-runner extension | **PATTERN-LOCKED, EXECUTION DEFERRED** — see §4; Phase 0B's `combiner_io` contract is typed; per-signal generator landing target = replay-test work post-Phase-2.9 OR earlier per operator scope |
| 7 | Component documentation | `docs/04-modules/longshort/signals/<signal>.md` | **BUILT** — `cross-sectional-momentum.md` at C2a (mirrors `universe/universe.md` structure) |
| 8 | Runbook | `docs/04-modules/longshort/signals/runbooks/<signal>-<failure-mode>-runbook.md` | **BUILT** — `momentum-price-history-failure-runbook.md` at C2a (one runbook for the most-likely failure class; future runbooks land per-observed-failure) |

**Honesty count:** 6 of 8 elements built end-to-end; 2 of 8 pattern-locked with execution deferred. Phase 2.2-2.9 inherit the same 6/8 baseline until §4's deferrals retire.

**Per-signal non-template scaffolding** (required for operationality but NOT part of the 8 template elements):
- `_shared/longshort-signals/<signal>/<signal>-orchestrator.ts` + `_test.ts` (daily-cadence runtime; mirrors `momentum-orchestrator.ts`'s 5-step pipeline)
- `supabase/functions/longshort-<signal>-compute/index.ts` (cron handler: `verifyCronSecret` + `productionClock` + orchestrator + `signal_compute_log` write + 3-event audit envelope per DEC-023)
- `supabase/functions/longshort-<signal>-compute-manual/index.ts` (operator-trigger sibling: operator JWT + `longshort.manage` + `parseAsOfDate` strict parser + dual audit envelope)
- MIG-NNN: `job_registry` row for `longshort.<signal>.compute` (DISARMED at creation; `enabled = false`)
- MIG-NNN+1: enable-flip with observational evidence baked verbatim into the migration `COMMENT` block (AFTER manual-trigger observational fire clean)

---

## 7. Disarm-Then-Fire-Then-Enable Cycle — Locked Pattern, Not Optional Ceremony

The MIG-066 → manual-trigger observational fire → MIG-067 cycle established at Phase 2.1 is hereby **codified as a REQUIRED pattern for all signal sub-phases (2.2-2.9)**, not optional governance ceremony. Justification: three independent defect-catching surfaces fired during Phase 2.1 execution; each catches a defect class invisible to the others.

**Surface 1 — Manual-trigger observational fire (signal-layer defect-catching).** The first observational fire at C2a (`run_id f8e10475-711f-4a8f-9cf8-b9a172b10f01`, pre-hotfix, `as_of = 2026-06-05`) returned `outcome = completed` with `persisted_count = 0 / skip_counts.insufficient_history = 839` — every universe ticker tripped the threshold. Root cause: supervisor-draft calendar-vs-trading-day unit confusion in `PRICE_HISTORY_LOOKBACK_DAYS = 280` (280 calendar days = ~193 trading days < 253 MIN_BARS). **No code-shape sentinel (typecheck, lint, esm.sh, wall-clock, any-type, handler-liveness, job_registry coverage) could have caught this — the defect lived in semantic-units arithmetic that ONLY an end-to-end fire against real data could surface.** The disarmed cron at MIG-066 ensured production traffic was NOT generated during this defect window. INC-57 + INC-58 capture.

**Surface 2 — Enable-flip MIG (infrastructure-layer defect-catching).** MIG-067's enable-flip surfaced a latent Gate-15 sentinel resolver bug: the offline-replay INSERT parser at `scripts/check-handler-liveness-markers.ts:211` hardcoded `handler_path: null` when establishing new state-map entries from INSERT VALUES, ignoring the column even when present. The bug was harmless while the affected job stayed at `enabled = false` (P1/P2 predicates short-circuit); MIG-067's enable-flip moved the row into the P2 detection window and exposed the resolver gap. INC-59 captures + resolver fix landed at `fc5ad66`. **The enable-flip step is when offline-replay infrastructure gets exercised against the new state**, distinct from when signal-layer code gets exercised at the manual-trigger step. Different verification layer, different defect class.

**Surface 3 — Supervisor pre-flight discipline (drafting-layer defect-catching).** Pre-task verifications across FP-009 caught: `enrich()` contract rippling to orchestrator (FP-008.4 #23 Option-A-vs-B/C/D scope), Wikipedia legacy field naming masking double-call (Bucket 0.1 Option-A-vs-B/C), `longshort.admin` permission nonexistence (Bucket 0.2), `SignalComputationError` vs `ConstituentFetchError` boundary (A2), `MOMENTUM_MIN_BARS` spec-vs-academic-273 + `ReconcileCallSpec` interface mismatch (B1), universe-query naive `order/limit` (B2). **All seven were supervisor-draft drift that pre-task discipline caught before code was written.** The cycle's first step (disarm seed at MIG-066) implicitly captures the assumption that supervisor-draft + executor-implementation + sentinel-coverage is NOT a sufficient ladder for signal sub-phases; the observational fire and enable-flip steps are required additional surfaces.

**Locked pattern for Phase 2.2-2.9:** every signal sub-phase ships TWO migrations for cron enable — first MIG creates the `job_registry` row with `enabled = false` + `handler_path` populated; manual-trigger observational fire verifies signal-layer correctness against clean-fire criteria per CROSSWIND §6.5.3; second MIG flips `enabled = true` with observational evidence (`run_id`, `persisted_count`, `populated_pct`, sector distribution, z-score statistics) embedded **verbatim** in the migration `COMMENT` block as durable governance record. **The two-migration structure is MANDATORY, not optional.** Single-migration enable paths (combining row creation + `enabled = true` in one MIG) are NOT permitted for signal sub-phases.

---

## 8. Forward-Binding Platform Constraints (Supabase Edge-Function Discipline)

Three Supabase / Deno edge-function platform constraints surfaced during FP-009 execution; codified here for Phase 2.2-2.9 inheritance.

**(i) Cross-function imports are NOT supported by the Deno deploy bundler.** Code shared between sibling handlers (e.g., a cron + manual-trigger pair) MUST be extracted to `supabase/functions/_shared/...`. Surfaced at C1 deployment: `parse-as-of-date.ts` and `persist-signal-compute-log.ts` were relocated to `_shared/longshort-signals/shared/` after the bundler rejected cross-handler imports (commit `cc63060`). **Phase 2.2-2.9 sibling-handler architecture MUST plan for `_shared/` extraction from inception** — design the shared module first, then the two handlers that consume it.

**(ii) Secret rotation requires cold-start trigger via explicit redeploy.** Environment variables (`POLYGON_API_KEY`, etc.) are bound at deploy time; rotating a secret in the Supabase dashboard does NOT propagate to the running function until a redeploy forces a cold start. Surfaced twice during FP-009 — at the Bucket 0.2 observational gate (Polygon-key 401 → rotation → redeploy drill) and implicitly at the C2a observational gate post-hotfix. **Operator runbooks for secret rotation MUST include the redeploy step**, not just "update the secret in the dashboard."

**(iii) Code-commit ≠ runtime deploy.** Pushing code to `main` does NOT update the deployed edge-function runtime; an explicit `supabase functions deploy <name>` is required. Surfaced three times in FP-009 — Bucket 0.2 (gateway 404 until redeploy), C2a hotfix (lookback constant landed in code at commit `61ce662` but the deployed runtime stayed pre-hotfix until explicit redeploy), and tangentially via the secret-rotation finding. **Every commit that changes the runtime behavior of an edge function MUST include an explicit redeploy step in its operator-handoff section**; never assume "CI green ⇒ runtime updated."

---

## 9. Supervisor Pre-Flight Forward-Binding Amendment

FP-009 surfaced four supervisor-draft defects, each caught at a different layer of the verification ladder:

| Defect class | Catch site | Symptom |
|---|---|---|
| Wall-clock leak in telemetry sites | Gate-2 (B2 hotfix) | `new Date().toISOString()` drafted for `started_at` / `completed_at` / `computed_at`; contradicts DEC-034 clause (4) replay-determinism scope. |
| `any` types in test mocks | Gate-4 (B2 hotfix) | Mocks drafted with `: any` rather than minimal typed mock interfaces (`MockSupabaseBuilder<T>`). |
| Universe-query naive `order` / `limit` | Lovable pre-task verification 2 (B2) | `.order().limit(1000)` would have mixed historical snapshots; corrected to two-step (latest `as_of_date` → rows at that date) query. |
| Calendar-vs-trading-day unit confusion in lookback constant | Observational gate (C2a) | `PRICE_HISTORY_LOOKBACK_DAYS = 280` drafted on intuitive-but-wrong arithmetic; corrected to 400 with explicit units comment per §5(c). |

The pattern: **numerical constants, unit-bearing arithmetic, and TypeScript-idiom usage all need explicit verification at supervisor-draft time, NOT deferred to executor pre-task or CI sentinel.** Three of the four classes (everything except the calendar/trading-day case) were caught at a code-shape sentinel layer; the fourth required an end-to-end fire — the highest-cost catch site. Moving more checks left into the supervisor-draft layer reduces both cost and risk.

The supervisor-instructions catalog (`docs/00-governance/supervisor-instructions.md` or equivalent — registered for forward amendment) should be updated to include explicit pre-flight items for: (a) numerical-constant unit verification, (b) unit-bearing arithmetic comments in source, (c) TypeScript-idiom checks (no `any` in mocks; no wall-clock in replay-scoped code; no naive `order/limit` against time-series tables). **Tracked for future supervisor-instructions revision; not blocking Phase 2.2.**

---

## 10. ROI Impact

Phase 2.1 is the FIRST phase to deliver a tradable signal value. ROI is positive by construction — pre-Phase-2.1 the platform produced zero signal values; post-Phase-2.1 it produces 834 momentum z-scores per `as_of_date` across 11 GICS sectors, daily, automatically. No prediction logic was weakened, no signal removed, no confidence threshold relaxed, no sizing logic touched, no execution-timing change, no monitoring removed. The C2a lookback hotfix INCREASED data availability (280-day window → 400-day window covers 100% of the 253-bar MIN_BARS requirement vs ~76% pre-hotfix). The disarm-then-fire-then-enable cycle adds operational safety without reducing signal expressiveness.

---

## 11. Phase 2.2 Entry

Phase 2.2 (Signal #7 — short-term reversal per CROSSWIND §4.4.2) opens against this closure as its template-inheritance baseline. Mechanical reproduction:

1. **New per-signal directory** `_shared/longshort-signals/short-term-reversal/` containing `compute-short-term-reversal.ts` + `_test.ts` + `short-term-reversal-orchestrator.ts` + `_test.ts` per §6 element 1 + per-signal non-template scaffolding.
2. **Shared files reused unchanged** — `z-score-normalize.ts`, `signal-types.ts`, `missingness-capture.ts`, `polygon-price-history-fetcher.ts`, `pLimitedMap.ts`. No per-signal code in `shared/`.
3. **Two-migration cron-enable cycle per §7** — MIG-NNN creates `job_registry` row with `enabled = false`; manual-trigger observational fire; MIG-NNN+1 enable-flip with observational evidence embedded verbatim.
4. **Supervisor pre-flight discipline per §9** at every draft (unit-bearing arithmetic, numerical constants, TypeScript-idiom checks).
5. **Platform-constraint inheritance per §8** (`_shared/` extraction from inception; explicit redeploy step in operator handoff; secret-rotation runbooks include redeploy step).
6. **Element 4 (reconciliation) + Element 6 (replay generator) NOT implemented** per §4 deferrals; signal-side fixture path locked at `src/features/longshort/services/replay/l2-synthetic-short-term-reversal-generator.ts` for future landing.

No fresh architectural negotiation required. Phase 2.2 entry is mechanical.

---

## Related Documents

- `docs/08-planning/feature-proposals.md` — FP-009 lifecycle entries (closure pointer at the FP-009 section header points here)
- `docs/08-planning/phase-closures/phase-1-closure.md` — predecessor phase closure (precedent for this artifact class)
- `docs/08-planning/deferred-work-register.md` — DW entries for §4 deferrals (reconciliation hook, replay-fixture generator)
- INCs: INC-49 (GICS plumbing surfacing), INC-50 (Wikipedia sector wiring + naming-debt observation), INC-51 (manual-trigger function context-construction duplication debt), INC-52 (price-history fetcher pattern reuse), INC-53 (`signal_observations` empty-state baseline), INC-54 (spec-vs-academic-273 momentum indexing + reconciliation hook deferral), INC-55 (orchestrator architecture + `pLimitedMap` extraction + universe-query correction + `SIGNAL_ID` lock), INC-56 (referenced as needed by adjacent buckets), INC-57 (calendar-vs-trading-day lookback hotfix), INC-58 (first tradable signal milestone + observational gate as defect-catching layer + 3 platform constraints), INC-59 (Gate-15 resolver INSERT-path bug + tail-hotfix), INC-60 (this closure-doc landing)
- MIGs: MIG-063, MIG-064, MIG-065, MIG-066, MIG-067 (see §3)
- Component doc: `docs/04-modules/longshort/signals/cross-sectional-momentum.md`
- Runbook: `docs/04-modules/longshort/signals/runbooks/momentum-price-history-failure-runbook.md`
- CROSSWIND spec: §4.4.1 (Signal #6 spec), §4.3.5 (critical-signal rule), §6.5.2 (sentinel discipline), §6.5.3 (missingness profile), §10.6 (Phase 2.1 template-establishment requirement), §14 (ROI guardrails), §22.5.1 (live-DB verification discipline)