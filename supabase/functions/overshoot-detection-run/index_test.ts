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
  assertStringIncludes(SRC, "body.probe as ('alpaca' | 'polygon' | undefined)");
  assertStringIncludes(SRC, 'probe_invalid_expected_alpaca_or_polygon');
  // W3.5.c live-probe wiring (α): sentinels moved from stub note to the
  // typed error codes emitted only inside the alpaca/polygon probe branch.
  assertStringIncludes(SRC, 'alpaca_probe_failed');
  assertStringIncludes(SRC, 'polygon_probe_failed');
  const idxProbeBranch = SRC.indexOf('alpaca_probe_failed');
  const idxKS = SRC.indexOf("strategy_key = 'overshoot'");
  const idxJR = SRC.indexOf("id = 'overshoot.detection.run'");
  assert(idxProbeBranch < idxKS, 'probe short-circuit precedes kill-switch');
  assert(idxProbeBranch < idxJR, 'probe short-circuit precedes job-disarmed');
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
  // overshoot_target_positions columns list.
  const targetCols = "['run_id','ticker','side','target_shares','target_notional','rank_score','computed_at']";
  assertStringIncludes(SRC, targetCols);
  // overshoot_detection_runs INSERT column list (append_run_ids MIG-152 present).
  assertStringIncludes(SRC, 'INSERT INTO overshoot_detection_runs');
  assertStringIncludes(SRC, 'append_run_ids');
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

Deno.test('SI read within staleness window (DETECTOR_SI_STALENESS_MAX_DAYS bound)', () => {
  assertStringIncludes(SRC, 'DETECTOR_SI_STALENESS_MAX_DAYS = 20');
  assertStringIncludes(SRC, '(${asOfDay}::date - ${DETECTOR_SI_STALENESS_MAX_DAYS}::int)');
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
  //     payload for both the reason-carrying and reason-less branches:
  assertStringIncludes(SRC, 'appendRunIds: { bars: string | null; earnings: string | null },\n  dryRun: boolean,\n)');
  assertStringIncludes(SRC, 'skip_reason: reason, dry_run: dryRun');
  assertStringIncludes(SRC, '{ ...durations, dry_run: dryRun }');
  // (b) every finalizeRun call site forwards dryRun as the trailing arg —
  //     grep for absence of the pre-corrective shape (8-arg call without
  //     dryRun trailing). The old signature ended `{ bars: ..., earnings: ... });`
  //     with no dryRun; the corrective ends `}, dryRun);` for the success
  //     path and `..., dryRun);` for the three catch paths.
  // 4 call sites + 1 definition ('async function finalizeRun('). Total 5.
  const callSites = SRC.match(/finalizeRun\(/g) ?? [];
  assertEquals(callSites.length, 5, '4 finalizeRun call sites + 1 definition');
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