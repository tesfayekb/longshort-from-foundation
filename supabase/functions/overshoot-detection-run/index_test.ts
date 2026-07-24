/**
 * overshoot-detection-run/index_test.ts — FP-069 W3.5.b-i (ACT-462.b-i).
 *
 * Source-sentinel testing pattern (see W3.5.a fetcher tests): the handler is
 * DB-dependent and cannot be executed under Gate 11's no-network / no-DB
 * shape. Tests here assert that the handler SOURCE contains the invariants
 * the contract demands — a grep-based ratchet against silent regressions
 * (probe-before-gates ordering, boot-assertion pre-any-pipeline, typed-refusal
 * → outcome mapping, dry_run zero-persist branch, append_run_ids write path,
 * A4-column persistence targets). Live-DB validation is W3.5.c GATE-ZERO
 * territory.
 *
 * Rationale — mirrors overshoot-study-run's phase-coverage extraction pattern
 * (Gate 11 leak on Deno.serve()): importing the handler module itself would
 * bind Deno.serve and leak the listener op. We READ the file instead.
 */
import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  RATIFIED_STUDY_RUN_ID,
  RATIFIED_PARAM_GRID_HASH_PREFIX,
  RATIFIED_DETECTOR_VERSION,
} from '../_shared/overshoot/detector/detector.ts';

const SRC = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('DEC-023 envelope: uses createHandler + authenticateRequest + overshoot.manage RBAC', () => {
  assertStringIncludes(SRC, "import { createHandler, apiSuccess } from '../_shared/handler.ts'");
  assertStringIncludes(SRC, "import { authenticateRequest } from '../_shared/authenticate-request.ts'");
  assertStringIncludes(SRC, "checkPermissionOrThrow(authCtx.user.id, 'overshoot.manage')");
  assertStringIncludes(SRC, 'Deno.serve(createHandler(');
});

Deno.test('injected clock: uses productionClock, never Date.now()', () => {
  assertStringIncludes(SRC, "import { productionClock } from '../_shared/longshort-clock.ts'");
  // No executable Date.now() call in handler body (money-path banned per
  // constitution). Strip line-comments before scanning so the docstring
  // reference on line 11 does not false-positive.
  const noComments = SRC.split('\n')
    .filter((l) => !/^\s*\*/.test(l) && !/^\s*\/\//.test(l))
    .join('\n');
  assertEquals(noComments.includes('Date.now('), false, 'Date.now() banned in kernel path');
  // performance.now() is allowed for durations (non-money, non-kernel).
});

Deno.test('boot assertion: BEFORE probe short-circuit and skip gates', () => {
  // The handler MUST reference the ratified constants BY NAME (single-home
  // discipline — no literal UUID/hash copies drifting outside detector.ts).
  // The tests import the constants and verify the identifier names appear.
  void RATIFIED_STUDY_RUN_ID; void RATIFIED_PARAM_GRID_HASH_PREFIX; void RATIFIED_DETECTOR_VERSION;
  assertStringIncludes(SRC, 'RATIFIED_STUDY_RUN_ID');
  assertStringIncludes(SRC, 'RATIFIED_PARAM_GRID_HASH_PREFIX');
  assertStringIncludes(SRC, 'boot_assertion_failed_priors_not_found');
  // Ordering check: boot query source must appear BEFORE probe short-circuit
  // AND BEFORE the kill-switch / disarmed gates.
  const idxBoot = SRC.indexOf('boot_assertion_failed_priors_not_found');
  const idxProbe = SRC.indexOf('alpaca_probe_failed');
  const idxKS = SRC.indexOf("strategy_key = 'overshoot'");
  const idxJR = SRC.indexOf("id = 'overshoot.detection.run'");
  assert(idxBoot > 0 && idxProbe > 0 && idxKS > 0 && idxJR > 0, 'markers present');
  assert(idxBoot < idxProbe, 'boot assertion must precede probe branch');
  assert(idxBoot < idxKS,    'boot assertion must precede kill-switch gate');
  assert(idxBoot < idxJR,    'boot assertion must precede job-disarmed gate');
});

Deno.test('FP-069 W3.8 T2.4: RATIFIED_DETECTOR_VERSION boot assertion (single-home)', () => {
  // Import present, typed hard-fail path present, ordering held.
  assertStringIncludes(SRC, 'RATIFIED_DETECTOR_VERSION,');
  assertStringIncludes(SRC, 'boot_assertion_failed_detector_version_malformed');
  assertStringIncludes(SRC, "/^[0-9a-f]{8}$/.test(RATIFIED_DETECTOR_VERSION)");
  // Ordering: version assert lives INSIDE the boot block, BEFORE probe/gates.
  const idxVer = SRC.indexOf('boot_assertion_failed_detector_version_malformed');
  const idxProbe = SRC.indexOf('alpaca_probe_failed');
  const idxKS = SRC.indexOf("strategy_key = 'overshoot'");
  const idxJR = SRC.indexOf("id = 'overshoot.detection.run'");
  assert(idxVer > 0 && idxProbe > 0 && idxKS > 0 && idxJR > 0, 'markers present');
  assert(idxVer < idxProbe, 'version assert precedes probe branch');
  assert(idxVer < idxKS,    'version assert precedes kill-switch gate');
  assert(idxVer < idxJR,    'version assert precedes job-disarmed gate');
  // No literal 8-hex copy of the version outside detector.ts single-home:
  // the handler references it BY NAME only.
  assertEquals(SRC.includes("'b7cdfcd8'"), false, "no literal version copy — single-home discipline");
});

Deno.test('FP-069 W3.8 T2.4 (INC-84 §5): dry-run envelope carries detector_version + tier_snapshot + selected[]', () => {
  // Envelope shape gates: dry_run_evidence field spread only under dryRun.
  assertStringIncludes(SRC, 'buildDryRunEvidence(events, selected)');
  assertStringIncludes(SRC, 'dry_run_evidence: dryRunEvidence');
  // Bundle-content proof: detector_version echoed from the ratified constant.
  assertStringIncludes(SRC, 'detector_version: RATIFIED_DETECTOR_VERSION');
  // Tier snapshot fields present:
  assertStringIncludes(SRC, 'long_t1_candidates');
  assertStringIncludes(SRC, 'long_t2_candidates');
  assertStringIncludes(SRC, 'short_candidates');
  assertStringIncludes(SRC, 'long_t1_selected');
  assertStringIncludes(SRC, 'long_t2_selected');
  assertStringIncludes(SRC, 'short_selected');
  assertStringIncludes(SRC, 'rank_score_by_tier');
  // Full selected[] projection with tier + rank_score + study_cell_ref:
  assertStringIncludes(SRC, 'selected: selected.map((e) => ({');
  assertStringIncludes(SRC, 'tier: e.tier,');
  // Zero new DB writes: no NEW INSERT/UPDATE statements added beyond
  // the pre-existing events/target/run-row writers. The dry-run gates on
  // events + targets remain intact (T2.3 headline gate held forward).
  assertStringIncludes(SRC, 'if (!dryRun && events.length > 0)');
  assertStringIncludes(SRC, 'if (!dryRun && selected.length > 0)');
});

Deno.test('probe short-circuit: BEFORE the three skip gates', () => {
  // FIX-3 (ACT-565) re-pin: probe taxonomy extended to include the
  // 'version' rail (INC-126.b). SEMANTIC PRESERVED and stated in the
  // test name — the probe short-circuit still fires BEFORE the two
  // skip gates (kill-switch supremacy note unchanged: the alpaca /
  // polygon / version probe branches all short-circuit before the
  // kill-switch and job-disarmed gates, so probes remain diagnostic
  // and cron-gated per FIX-3 policy).
  assertStringIncludes(SRC, "body.probe as ('alpaca' | 'polygon' | 'version' | undefined)");
  assertStringIncludes(SRC, 'probe_invalid_expected_alpaca_polygon_or_version');
  // W3.5.c live-probe wiring (α): sentinels moved from stub note to the
  // typed error codes emitted only inside the alpaca/polygon probe branch.
  assertStringIncludes(SRC, 'alpaca_probe_failed');
  assertStringIncludes(SRC, 'polygon_probe_failed');
  const idxProbeBranch = SRC.indexOf('alpaca_probe_failed');
  const idxKS = SRC.indexOf("strategy_key = 'overshoot'");
  const idxJR = SRC.indexOf("id = 'overshoot.detection.run'");
  assert(idxProbeBranch < idxKS, 'probe short-circuit precedes kill-switch');
  assert(idxProbeBranch < idxJR, 'probe short-circuit precedes job-disarmed');
  // FIX-3 rail: the version-probe branch also short-circuits BEFORE
  // both skip gates (no code change would leave it below).
  const idxVersionProbe = SRC.indexOf("probe: 'version',");
  assert(idxVersionProbe > 0, 'version probe branch present');
  assert(idxVersionProbe < idxKS, 'version probe short-circuit precedes kill-switch');
  assert(idxVersionProbe < idxJR, 'version probe short-circuit precedes job-disarmed');
});

// FIX-3 (ACT-565) — SOURCE_VERSION rail drift-guard. Mirrors entry/exit.
Deno.test('FIX-3 (ACT-565) SOURCE_VERSION rail: export present, probe echoes it, handler wired', () => {
  // FIX-2 bump 2026-07-23 (rail-parity — no money-path change in detection).
  // H-1 bump 2026-07-23 (+si26 — per-row SI envelope 20→26; detection-run only).
  assertStringIncludes(SRC, "export const SOURCE_VERSION = 'fb5fdf13+fix2+si26'");
  const idxProbeStart = SRC.indexOf("probe: 'version',");
  assert(idxProbeStart > 0, 'version-probe branch present');
  const probeBlock = SRC.slice(idxProbeStart, idxProbeStart + 400);
  assertStringIncludes(probeBlock, 'SOURCE_VERSION,');
  assertStringIncludes(probeBlock, 'RATIFIED_DETECTOR_VERSION,');
  assertStringIncludes(probeBlock, "BUILD_SHA: Deno.env.get('BUILD_SHA') ?? null");
  assertStringIncludes(SRC, '{ sourceVersion: SOURCE_VERSION }');
});

Deno.test('FP-069 W3.8 T3c (INC-84 §5): probe envelopes echo detector_version (alpaca + polygon)', () => {
  // Uniformity gate — every money engine's probe envelope carries the
  // ratified detector_version, matching the entry/exit engines' pattern.
  // Behavioral deploy proof per INC-84 §5: unauthenticated probes cannot
  // reach these branches (RBAC-gated), but authenticated probes self-attest
  // the deployed bundle carries the ratified detector identity (b7cdfcd8).
  const alpacaBlock = SRC.slice(SRC.indexOf("probe: 'alpaca',"), SRC.indexOf("probe: 'polygon',"));
  assertStringIncludes(alpacaBlock, 'detector_version: RATIFIED_DETECTOR_VERSION,');
  const polygonBlock = SRC.slice(SRC.indexOf("probe: 'polygon',"));
  assertStringIncludes(polygonBlock, 'detector_version: RATIFIED_DETECTOR_VERSION,');
  // No literal 8-hex copy in the handler — single-home discipline.
  assertEquals(SRC.includes("'b7cdfcd8'"), false, "no literal version copy in probe envelope");
});

Deno.test('RBAC deny: overshoot.manage checked before pipeline', () => {
  const idxRbac = SRC.indexOf("checkPermissionOrThrow(authCtx.user.id, 'overshoot.manage')");
  const idxPipeline = SRC.indexOf('Stage 1: bars-append leg');
  assert(idxRbac > 0 && idxPipeline > 0 && idxRbac < idxPipeline);
});

Deno.test('typed refusal → outcome mapping (all four classes present)', () => {
  // bars_missing_for_asof → no_op
  assertStringIncludes(SRC, "err instanceof BarsMissingForAsofError ? 'bars_missing_for_asof'");
  assertStringIncludes(SRC, "reason === 'bars_missing_for_asof' ? 'no_op' : 'failed'");
  // benchmarks_missing → failed
  assertStringIncludes(SRC, "err instanceof BenchmarksMissingError  ? 'benchmarks_missing'");
  // cap-breach → failed
  assertStringIncludes(SRC, "err instanceof EarningsCalendarCapBreachError ? 'earnings_calendar_cap_breach'");
  // staleness → no_op
  assertStringIncludes(SRC, "reason: 'earnings_calendar_stale'");
  assertStringIncludes(SRC, "outcome: 'no_op'");
});

Deno.test('dry_run zero-persist: event/target INSERTs are gated on !dryRun', () => {
  assertStringIncludes(SRC, 'if (!dryRun && events.length > 0)');
  assertStringIncludes(SRC, 'if (!dryRun && selected.length > 0)');
});

Deno.test('append_run_ids shape: {bars, earnings} written into detection run row', () => {
  assertStringIncludes(SRC, 'append_run_ids: { bars: string | null; earnings: string | null }');
  assertStringIncludes(SRC, 'append_run_ids = ${sql.json(appendRunIds)}::jsonb');
  // Both bars-append and earnings-append backfill_run_id must reach the writeback.
  assertStringIncludes(SRC, "kind='bars'".replace(/'/g, "'"));
  assertStringIncludes(SRC, "'earnings_fmp'");
  assertStringIncludes(SRC, 'barsBackfillRunId');
  assertStringIncludes(SRC, 'earningsBackfillRunId');
});

Deno.test('kernel live-parameterization: event_date_min = event_date_max = as_of', () => {
  assertStringIncludes(SRC, "import EVENT_DETECTION_SQL from '../_shared/overshoot/study/event-detection.sql.ts'");
  assertStringIncludes(SRC, 'DETECTION_PARAM_ORDER');
  // Both slice bounds bound to asOfDay in the sql.unsafe args (runner-parity).
  const argsBlock = SRC.slice(SRC.indexOf('sql.unsafe(detectionCore'), SRC.indexOf(']);'));
  assert(argsBlock.includes('asOfDay,             // :event_date_min = as_of'));
  assert(argsBlock.includes('asOfDay,             // :event_date_max = as_of'));
});

Deno.test('detector import: pure, unmodified (runDetector + constants only)', () => {
  assertStringIncludes(SRC, "import {\n  runDetector,\n  RATIFIED_STUDY_RUN_ID,\n  RATIFIED_PARAM_GRID_HASH_PREFIX,");
  // No monkey-patching / mutating the detector surface.
  assertEquals(SRC.includes('runDetector ='), false);
  assertEquals(SRC.includes('detector.ts\';\n\n// override'), false);
});

Deno.test('A4 persistence targets: overshoot_events + overshoot_target_positions columns aligned', () => {
  // overshoot_events columns list (per MIG-149 + MIG-156 tier verbatim).
  const eventCols = "['run_id','as_of_date','ticker','side','excess_w1','excess_w2','excess_w3','excess_w4','excess_w5','argmax_window_days','momentum_quintile','drawdown_bucket','days_to_nearest_earnings','earnings_alias_used','filter_passes','filter_refusal_reason','selected_for_entry','rank_score','study_cell_ref','tier']";
  assertStringIncludes(SRC, eventCols);
  // overshoot_target_positions columns list — DEC-504-4 WIRE (MIG-166)
  // added w5_reallocation_ref as the additive tail. The tail is ratified
  // truth: guard the exact column list so a silent drop (or reorder that
  // breaks the positional sql(...cols) helper) fails loudly.
  const targetCols = "['run_id','ticker','side','target_shares','target_notional','rank_score','computed_at','w5_reallocation_ref']";
  assertStringIncludes(SRC, targetCols);
  // overshoot_detection_runs INSERT column list — append_run_ids (MIG-152)
  // + detector_version + refusal_class_counts (MIG-165 / ACT-563 + INC-129).
  // All three are now ratified truth on the run row; assert the full
  // INSERT column tail as a single byte-scan so a silent drop of any one
  // fails the guard (nullable columns would otherwise defeat the point).
  assertStringIncludes(SRC, 'INSERT INTO overshoot_detection_runs');
  assertStringIncludes(SRC, 'append_run_ids, detector_version, refusal_class_counts');
  // DEC-504-4 WIRE — sleeves jsonb write on the run row (§22.5.1).
  // The UPDATE stamps posture AFTER finalizeRun so a partial failure
  // earlier leaves the default '{}' sleeves value truthful. Ratchet:
  assertStringIncludes(SRC, 'SET sleeves = ${sql.json({');
  assertStringIncludes(SRC, 'reallocation_active: sleeveDecision.reallocationActive');
  assertStringIncludes(SRC, 'w5_reallocation_ref: w5ReallocationRef');
});

Deno.test('FP-069 W3.8 T2.3 (MIG-156): tier round-trip — T1/T2/null persist verbatim via e.tier', () => {
  // Source-sentinel: the handler MUST forward the detector-emitted tier
  // ('T1' | 'T2' | null) into the overshoot_events INSERT without mapping,
  // coercion, or default. The detector already emits the tag (T2.1b @ b7cdfcd8);
  // this test ratchets against silent regressions dropping it again.
  //
  // Round-trip proof triangle (grep, not runtime — DB-independent per file docstring):
  //   (a) eventRows mapping contains a raw `tier: e.tier` field (no `?? null`,
  //       no `.toLowerCase()`, no coercion — verbatim pass-through).
  //   (b) column list terminates with 'tier' so INSERT column count matches row keys.
  //   (c) MIG-156 provenance comment cites the migration by number.
  assertStringIncludes(SRC, 'tier: e.tier,');
  // No coercion / default variants may creep in:
  assertEquals(SRC.includes('tier: e.tier ?? '),  false, 'no nullish coalescing on tier');
  assertEquals(SRC.includes('tier: e.tier ||'),   false, 'no || fallback on tier');
  assertEquals(SRC.includes('e.tier.toLowerCase'), false, 'tier stays literal T1/T2');
  // Column list terminates with 'tier' (MIG-156 additive tail):
  assertStringIncludes(SRC, "'study_cell_ref','tier']");
  // Provenance marker present (MIG-156 comment on the eventRows tier line):
  assertStringIncludes(SRC, 'MIG-156');
});

Deno.test('append leg ordering: backfill_runs row inserted BEFORE the upsert', () => {
  // bars leg
  const barsBlock = SRC.slice(SRC.indexOf('Stage 1: bars-append leg'), SRC.indexOf('Stage 2:'));
  const iBRun    = barsBlock.indexOf("INSERT INTO overshoot_backfill_runs (kind, started_as_of, row_count, request_count, outcome)\n        VALUES ('bars'");
  const iBBars   = barsBlock.indexOf('INSERT INTO overshoot_daily_bars');
  assert(iBRun > 0 && iBBars > 0 && iBRun < iBBars, 'bars: backfill_runs row precedes daily_bars upsert');
  // earnings leg
  const eBlock = SRC.slice(SRC.indexOf('Stage 2: forward-earnings-append leg'), SRC.indexOf('Stage 3:'));
  const iERun  = eBlock.indexOf("INSERT INTO overshoot_backfill_runs (kind, started_as_of, request_count, outcome)\n        VALUES ('earnings_fmp'");
  const iEUps  = eBlock.indexOf('INSERT INTO overshoot_earnings_calendar');
  assert(iERun > 0 && iEUps > 0 && iERun < iEUps, 'earnings: backfill_runs row precedes earnings_calendar upsert');
});

Deno.test('SI read within staleness window (DETECTOR_SI_STALENESS_MAX_DAYS bound) — cadence-amended 20→26 (2026-07-23, H-1)', () => {
  assertStringIncludes(SRC, 'DETECTOR_SI_STALENESS_MAX_DAYS = 26');
  assertStringIncludes(SRC, '(${asOfDay}::date - ${DETECTOR_SI_STALENESS_MAX_DAYS}::int)');
  // Negative sentinel — the retired 20d cap must NOT reappear as a literal.
  assert(!SRC.includes('DETECTOR_SI_STALENESS_MAX_DAYS = 20'),
    'retired 20d envelope literal must not resurface');
});

Deno.test('H-1 amendment triple: age 24 usable / 26 boundary / 27 excluded (per-row SI envelope semantics)', () => {
  // Mirrors the SQL clause `as_of_date >= (asOf - CAP)` at pure arithmetic
  // level. Guards the semantic (inclusive-at-boundary) independent of the
  // constant's numeric value.
  const CAP = 26;
  const dayMs = 86_400_000;
  const asOf = new Date('2026-07-24T00:00:00Z');
  const usable = (ageDays: number): boolean => {
    const rowDate = new Date(asOf.getTime() - ageDays * dayMs);
    const cutoff  = new Date(asOf.getTime() - CAP     * dayMs);
    return rowDate.getTime() >= cutoff.getTime();
  };
  assertEquals(usable(24), true,  'age 24 must be inside the 26d envelope (usable)');
  assertEquals(usable(26), true,  'age 26 must be on-boundary (usable — `<=`, not `<`)');
  assertEquals(usable(27), false, 'age 27 must be outside the 26d envelope (excluded)');
});

Deno.test('H-1 fix does NOT bump detector predicate spec — composite aff20a13 held (data-fetch envelope, not detector.ts predicate)', () => {
  // The 20→26 flip is the caller-side data-fetch envelope in this file's
  // index.ts, NOT the detector.ts spec predicate. The composite version
  // MUST remain aff20a13; selection-parity + detector canaries must stay
  // green. This test is the near-guard; the selection-parity_test.ts
  // 20-day byte-exact re-verify is the far-guard.
  assertEquals(RATIFIED_DETECTOR_VERSION, 'aff20a13',
    'detector composite must not bump on caller-envelope-only fixes');
});

Deno.test('SOURCE_VERSION carries the +si26 suffix (deploy-truth rail)', () => {
  assertStringIncludes(SRC, "SOURCE_VERSION = 'fb5fdf13+fix2+si26'");
});

Deno.test('DEC-504-4 WIRE: handler consumes overshootSleeveAllocation; BOTH branches byte-present (fresh 36/4, stale 40/0); no hardcoded post-decision caps', async () => {
  // Supersedes the original ACT-490 static-caps invariant. DEC-504-4 makes
  // the effective per-side capacity a FUNCTION of book-level SI staleness:
  //   fresh (si_stale_active=false) → LONG=36 / SHORT=4 (ratified baseline)
  //   stale (si_stale_active=true)  → LONG=40 / SHORT=0 (long-only reallocation)
  // A blind re-pin that only matched the current fresh-branch strings would
  // gut the guard the moment someone hardcoded either branch back in. So:
  //
  //   (a) ratified baseline constants still declared with the fresh values;
  //   (b) baseline flows into the sleeve decision via the per-side named
  //       params (longCapacity / shortCapacity), NOT as post-decision literals;
  //   (c) all downstream persistence + audit fields read sleeveDecision.*
  //       (dynamic) — the handler never restamps 36/4 or 40/0 as literals;
  //   (d) BOTH branches are byte-present in the shared allocator source
  //       (cross-file scan of si-freshness.ts) so a silent removal of the
  //       stale-branch reallocation fails the guard here, not silently in
  //       production.
  //
  // (a) baseline constants declared with the ratified fresh values.
  assertStringIncludes(SRC, 'DETECTOR_CAPACITY_LONG = 36');
  assertStringIncludes(SRC, 'DETECTOR_CAPACITY_SHORT = 4');
  // (b) sleeve decision fed by book-level staleness + per-side baseline.
  assertStringIncludes(SRC, "import {\n  analystRevisionStaleWarnActive,");
  assertStringIncludes(SRC, 'overshootSleeveAllocation,');
  assertStringIncludes(SRC, 'siStaleActive,');
  assertStringIncludes(SRC, 'const bookSiStaleActive = siStaleActive(');
  assertStringIncludes(SRC, 'const sleeveDecision = overshootSleeveAllocation(bookSiStaleActive, {');
  assertStringIncludes(SRC, 'longCapacity: DETECTOR_CAPACITY_LONG,');
  assertStringIncludes(SRC, 'shortCapacity: DETECTOR_CAPACITY_SHORT,');
  // (c) downstream reads the DECISION, never a fresh-branch literal.
  assertStringIncludes(SRC, 'sleeveDecision.reallocationActive');
  assertStringIncludes(SRC, 'sleeveDecision.longCapacity');
  assertStringIncludes(SRC, 'sleeveDecision.shortCapacity');
  // Negative sentinels — no post-decision hardcoded caps of either branch
  // (would silently gut the wire). Pre-ACT-490 scalar shape also stays retired.
  assertEquals(SRC.includes('DETECTOR_CAPACITY_PER_SIDE'), false,
    'ACT-490: scalar capacity constant retired');
  assertEquals(SRC.includes('capacityPerSide:'), false,
    'ACT-490: scalar capacityPerSide named param retired at handler call site');
  assertEquals(SRC.includes('long_capacity: 40'), false,
    'DEC-504-4: stale-branch caps must come from sleeveDecision, not a literal');
  assertEquals(SRC.includes('short_capacity: 0,'), false,
    'DEC-504-4: stale-branch caps must come from sleeveDecision, not a literal');
  assertEquals(SRC.includes('long_capacity: 36'), false,
    'DEC-504-4: fresh-branch caps must come from sleeveDecision, not a literal');
  assertEquals(SRC.includes('short_capacity: 4,'), false,
    'DEC-504-4: fresh-branch caps must come from sleeveDecision, not a literal');
  // (d) BOTH branches byte-present in the shared allocator (cross-file
  // scan). Guards against "collapse to fresh-only" or "collapse to stale-
  // only" edits sneaking past the handler-scoped grep.
  const ALLOC = await Deno.readTextFile(
    new URL('../_shared/overshoot/si-freshness.ts', import.meta.url),
  );
  assertStringIncludes(ALLOC, 'export function overshootSleeveAllocation(');
  // Fresh branch — passthrough of the baseline with reallocationActive=false.
  assertStringIncludes(ALLOC, 'if (!active) {');
  assertStringIncludes(ALLOC, 'return { ...baseline, reallocationActive: false };');
  // Stale branch — long absorbs short: capacities sum onto long, short → 0.
  assertStringIncludes(ALLOC, 'longCapacity: baseline.longCapacity + baseline.shortCapacity,');
  assertStringIncludes(ALLOC, 'shortCapacity: 0,');
  assertStringIncludes(ALLOC, 'reallocationActive: true,');
});

Deno.test('POLYGON_API_KEY_PROD_PROBE binding (D2 ratification)', () => {
  assertStringIncludes(SRC, "Deno.env.get('POLYGON_API_KEY_PROD_PROBE')");
  // No fallback chain.
  assertEquals(SRC.includes("|| Deno.env.get('POLYGON_API_KEY')"), false);
});

Deno.test('FP-069 W3.8 T2.4 corrective: finalizeRun carries dry_run marker on BOTH paths', () => {
  // Regression sentinel — prior defect: insertRunRow stamped dry_run into
  // durations_ms but finalizeRun overwrote the column with a fresh object
  // that dropped the flag, silently defeating the T2.4 console-pollution
  // filter (OvershootDetectorRuns.tsx WHERE durations_ms->>'dry_run' IS
  // DISTINCT FROM 'true'). Every finalizeRun call site must forward the
  // dryRun boolean, and the writer must merge it into durations_ms
  // unconditionally so a completed row is explicitly marked true|false —
  // absence of the key means pre-T2.4 legacy only.
  //
  // (a) writer signature accepts dryRun and merges it into the UPDATE
  //     payload for both the reason-carrying and reason-less branches.
  //     Signature grew an optional refusalCounts tail (INC-129, MIG-165)
  //     — the corrective's dry_run-on-both-paths semantic is unchanged;
  //     re-pin the exact shape so a future rename/removal of dryRun in
  //     the signature fails loudly.
  assertStringIncludes(
    SRC,
    'appendRunIds: { bars: string | null; earnings: string | null },\n  dryRun: boolean,\n  refusalCounts?: Record<string, number>,\n): Promise<void>',
  );
  assertStringIncludes(SRC, 'skip_reason: reason, dry_run: dryRun');
  assertStringIncludes(SRC, '{ ...durations, dry_run: dryRun }');
  // (b) every finalizeRun call site forwards dryRun — the success path
  //     now trails with `dryRun, tallyRefusalCounts(events)` (INC-129
  //     refusal-class-count pass-through); the three catch paths still
  //     trail with a bare `dryRun`. Grep for absence of the pre-corrective
  //     8-arg shape (no dryRun at all).
  // 4 call sites + 1 definition ('async function finalizeRun('). Total 5.
  const callSites = SRC.match(/finalizeRun\(/g) ?? [];
  assertEquals(callSites.length, 5, '4 finalizeRun call sites + 1 definition');
  // Success-path signature ratchet — dryRun then refusal tally.
  assertStringIncludes(SRC, '}, dryRun, tallyRefusalCounts(events));');
  // None of the four may end without dryRun forwarded:
  assertEquals(SRC.includes('earnings: null });'), false, 'bars-catch site must forward dryRun');
  assertEquals(SRC.includes('earnings: earningsBackfillRunId });'), false,
    'earnings-catch / staleness sites must forward dryRun');
});

Deno.test('FP-069 W3.8 T2.4 corrective A′: jsonb binding uses sql.json(), never pre-stringify', () => {
  // Regression sentinel — prior defect: JSON.stringify(payload)::jsonb caused
  // postgres.js to double-encode (driver JSON-serializes any parameter it
  // binds for jsonb; the pre-stringified string became a jsonb SCALAR STRING,
  // silently defeating every durations_ms->>'key' read including the T2.4
  // console-pollution filter). The corrective uses the repo idiom sql.json(x)
  // at both writer sites; no JSON.stringify at any jsonb bind point.
  assertStringIncludes(SRC, 'durations_ms = ${sql.json(payload)}::jsonb');
  assertStringIncludes(SRC, '0, 0, ${sql.json(durations)}::jsonb');
  assertStringIncludes(SRC, 'append_run_ids = ${sql.json(appendRunIds)}::jsonb');
  // No pre-stringify at any jsonb bind point in the run-row writers:
  assertEquals(SRC.includes('${JSON.stringify(payload)}::jsonb'), false,
    'finalizeRun payload must bind via sql.json(), not JSON.stringify');
  assertEquals(SRC.includes('${JSON.stringify({ ...durations, dry_run: args.dryRun })}::jsonb'), false,
    'insertRunRow durations must bind via sql.json(), not JSON.stringify');
  assertEquals(SRC.includes('${JSON.stringify(args.appendRunIds)}::jsonb'), false,
    'insertRunRow appendRunIds must bind via sql.json(), not JSON.stringify');
  assertEquals(SRC.includes('${JSON.stringify(appendRunIds)}::jsonb'), false,
    'finalizeRun appendRunIds must bind via sql.json(), not JSON.stringify');
});

// ═══ INC-125.b (2026-07-22) — decoupled book-level SI corpus-MAX read ═══
// Pathology closed: the pre-fix code derived `freshestSiAsOfDate` from
// the per-row `shortInterest` map, which is pre-filtered by the 20-day
// per-row envelope. Whenever the true corpus-MAX exceeded that envelope
// the map was empty → freshest=null → the sleeve writer stamped a
// fabricated `si_corpus_absent` reason instead of the real
// `si_stale_active`. Three source-sentinel ratchets so a future
// re-coupling fails at CI, not at maiden fire.

Deno.test('INC-125.b (a): book-level freshest comes from UNWINDOWED corpus-MAX SELECT', () => {
  // The decoupled SELECT — no window predicate, no ticker filter, just
  // `MAX(as_of_date)` off `overshoot_short_interest`. Enforce the exact
  // shape so a "small refactor" that re-adds a WHERE clause fails here.
  assertStringIncludes(SRC, 'SELECT MAX(as_of_date)::text AS freshest');
  assertStringIncludes(SRC, 'FROM overshoot_short_interest');
  // The variable name + source-of-truth binding.
  assertStringIncludes(SRC, 'const corpusMaxRows = await sql<{ freshest: string | null }[]>`');
  assertStringIncludes(SRC, 'const freshestSiAsOfDate: string | null = corpusMaxRows[0]?.freshest ?? null;');
});

Deno.test('INC-125.b (b): pre-fix derivation from per-row map is retired', () => {
  // Negative sentinel — the old loop over `shortInterest` that produced
  // the phantom-null must not reappear. Any of these substrings would
  // signal a regression to the coupled read.
  assertEquals(
    SRC.includes('for (const [, r] of shortInterest) {'),
    false,
    'INC-125.b: freshestSiAsOfDate must NOT be derived from the windowed shortInterest map',
  );
  assertEquals(
    SRC.includes('if (freshestSiAsOfDate === null || r.as_of_date > freshestSiAsOfDate) {'),
    false,
    'INC-125.b: per-row-derived freshest loop must stay retired',
  );
  // Corpus-MAX SELECT must appear BEFORE `bookSiStaleActive` so the
  // decoupled read is what feeds the staleness call, not a stale local.
  const idxSelect = SRC.indexOf('SELECT MAX(as_of_date)::text AS freshest');
  const idxBook = SRC.indexOf('const bookSiStaleActive = siStaleActive(');
  assert(idxSelect > 0 && idxBook > 0 && idxSelect < idxBook,
    'corpus-MAX SELECT must precede bookSiStaleActive');
});

Deno.test('INC-125.b (c): sleeves.prior echoed on transition edges only', () => {
  // Rule-8 audit reconstructability — engage/disengage rows must carry
  // the prior posture inline so operators do not need a second query to
  // pair the state edges. Noop stays null (current-posture fields
  // already carry the unchanged state).
  assertStringIncludes(SRC, "prior: sleeveTransition === 'noop' ? null : {");
  assertStringIncludes(SRC, 'reallocation_active: sleeveCtx.priorActive,');
  assertStringIncludes(SRC, 'engage_audit_id: sleeveCtx.priorEngageAuditId,');
});