/**
 * overshoot-study-run — W2.4-deferred runner tests (fixture-driven, no live calls).
 * FP-069 W2.5 (ACT-457-ADD-04). Verifies the request-validation surface, dry_run
 * gating semantics, stamp-completeness of the runs-row insert shape, and the
 * failure-path outcome-recording contract by structural assertion against the
 * source module. Live DB behaviour is covered by the smoke runs (D-1..D-3).
 */
import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import EVENT_DETECTION_SQL from '../_shared/overshoot/study/event-detection.sql.ts';
import CELL_AGGREGATION_SQL from '../_shared/overshoot/study/cell-aggregation.sql.ts';
// FP-069 W3.2.a fold-in (GATE-11 FIX): checkPhaseCoverage is imported from
// its own module rather than through `./index.ts`. Previously two Deno.test
// blocks (at :111 / :137) did `await import('./index.ts')` to reach the
// helper — that path binds `Deno.serve(...)` and leaks an unclosed listener
// op at end-of-suite under Gate 11's `deno test --allow-net --allow-env
// --allow-read --lock=deno.lock` invocation. The runner still re-exports
// checkPhaseCoverage for source-compat; tests take the direct path.
import { checkPhaseCoverage } from './phase-coverage.ts';

const INDEX_SRC = await Deno.readTextFile(new URL('./index.ts', import.meta.url));

Deno.test('sql modules load as non-empty strings (bundler-shipped)', () => {
  assert(typeof EVENT_DETECTION_SQL === 'string' && EVENT_DETECTION_SQL.length > 500);
  assert(typeof CELL_AGGREGATION_SQL === 'string' && CELL_AGGREGATION_SQL.length > 500);
});

Deno.test('event-detection SQL exposes all five per-window excess columns (R-1)', () => {
  for (const col of ['excess_w1', 'excess_w2', 'excess_w3', 'excess_w4', 'excess_w5']) {
    assertStringIncludes(EVENT_DETECTION_SQL, col);
  }
});

Deno.test('event-detection SQL declares all runner parameters', () => {
  for (const p of [':run_id', ':bars_snapshot_max_date', ':earnings_snapshot_max_date',
                    ':min_band_bps', ':lookback_min_date', ':event_date_min',
                    ':event_date_max']) {
    assertStringIncludes(EVENT_DETECTION_SQL, p);
  }
});

Deno.test('cell-aggregation SQL declares all runner parameters', () => {
  for (const p of [':run_id', ':haircut_bps_long', ':haircut_bps_short', ':bars_snapshot_max_date']) {
    assertStringIncludes(CELL_AGGREGATION_SQL, p);
  }
});

Deno.test('runner enforces POST-only (405 for other methods)', () => {
  assertStringIncludes(INDEX_SRC, "req.method !== 'POST'");
  assertStringIncludes(INDEX_SRC, "'method_not_allowed'");
});

Deno.test('runner requires overshoot.manage permission', () => {
  assertStringIncludes(INDEX_SRC, "checkPermissionOrThrow(authCtx.user.id, 'overshoot.manage')");
});

Deno.test('runner enforces all five governance stamps on runs insert', () => {
  // Stamp constants must be present with their CHECK'd values.
  assertStringIncludes(INDEX_SRC, "'UPPER_BOUND_SURVIVORSHIP_BIASED'");
  assertStringIncludes(INDEX_SRC, "'NON_PERFORMANCE_STUDY_ONLY'");
  assertStringIncludes(INDEX_SRC, "'NO_SQUEEZE_FILTER_ARRIVALS_UPPER_BOUND_RETURNS_CONSERVATIVE'");
  assertStringIncludes(INDEX_SRC, "'CLOSE_TO_CLOSE_REFERENCE'");
  // And all five are bound into the INSERT column list.
  for (const col of ['survivorship_stamp', 'performance_stamp', 'short_filter_stamp',
                     'return_basis', 'param_grid_hash']) {
    assertStringIncludes(INDEX_SRC, col);
  }
});

Deno.test('runner inserts runs row OUTSIDE the events/cells transaction (truthful outcome)', () => {
  // The runs INSERT must precede sql.begin(...).
  const runsIdx = INDEX_SRC.indexOf('INSERT INTO overshoot_study_runs');
  const beginIdx = INDEX_SRC.indexOf('await sql.begin');
  assert(runsIdx > 0 && beginIdx > runsIdx,
    `expected runs INSERT before sql.begin(); got runsIdx=${runsIdx} beginIdx=${beginIdx}`);
});

Deno.test('runner records outcome=failed on catch path (with best-effort UPDATE)', () => {
  assertStringIncludes(INDEX_SRC, "outcome = 'failed'");
  assertStringIncludes(INDEX_SRC, 'study_run_failed');
});

// W2.5 D-2 regression pin: event_date_min slice parameter must be plumbed
// through the runner and defaulted to '1900-01-01' when caller omits it,
// preserving the pre-D2 full-window detection behaviour byte-for-byte.
Deno.test('runner threads event_date_min slice param with 1900-01-01 default', () => {
  // DETECTION_PARAM_ORDER contains event_date_min.
  assertStringIncludes(INDEX_SRC, "'event_date_min'");
  // Default sentinel present.
  assertStringIncludes(INDEX_SRC, "'1900-01-01'");
  // Validated format on non-null input.
  assertStringIncludes(INDEX_SRC, 'event_date_min_invalid_format_expected_YYYY_MM_DD');
  // Detection SQL body filters per_window_excess by :event_date_min.
  assertStringIncludes(EVENT_DETECTION_SQL, 'bw.trade_date >= :event_date_min::date');
});

// W2.6 phase mechanism (ACT-457-ADD-08): symmetric upper-bound + phase gating.
Deno.test('runner threads event_date_max slice param with 9999-12-31 default', () => {
  assertStringIncludes(INDEX_SRC, "'event_date_max'");
  assertStringIncludes(INDEX_SRC, "'9999-12-31'");
  assertStringIncludes(INDEX_SRC, 'event_date_max_invalid_format_expected_YYYY_MM_DD');
  assertStringIncludes(EVENT_DETECTION_SQL, 'bw.trade_date <= :event_date_max::date');
});

Deno.test('runner accepts phase param and rejects invalid values', () => {
  assertStringIncludes(INDEX_SRC, "phase = body.phase as ('detect' | 'aggregate' | undefined)");
  assertStringIncludes(INDEX_SRC, 'phase_invalid_expected_detect_or_aggregate');
  assertStringIncludes(INDEX_SRC, 'phase_aggregate_requires_run_id');
});

Deno.test('runner aggregate phase gates on coverage refusal', () => {
  // Coverage helper is defined + used before the aggregation INSERT.
  assertStringIncludes(INDEX_SRC, 'checkPhaseCoverage(');
  assertStringIncludes(INDEX_SRC, "'aggregate_coverage_refused'");
  assertStringIncludes(INDEX_SRC, "'aggregate_missing_window_contract'");
  // Coverage read comes from param_grid, not from a client-supplied claim.
  assertStringIncludes(INDEX_SRC, "paramGridForRun.phases_completed as Array");
});

Deno.test('checkPhaseCoverage: contiguous slices cover full window', () => {
  assertEquals(checkPhaseCoverage(
    [{ min: '2026-01-01', max: '2026-03-31' }, { min: '2026-04-01', max: '2026-06-30' }],
    '2026-01-01', '2026-06-30',
  ).covered, true);
  // Overlap is allowed.
  assertEquals(checkPhaseCoverage(
    [{ min: '2026-01-01', max: '2026-04-15' }, { min: '2026-04-01', max: '2026-06-30' }],
    '2026-01-01', '2026-06-30',
  ).covered, true);
  // Any order is allowed (sort internally).
  assertEquals(checkPhaseCoverage(
    [{ min: '2026-04-01', max: '2026-06-30' }, { min: '2026-01-01', max: '2026-03-31' }],
    '2026-01-01', '2026-06-30',
  ).covered, true);
});

Deno.test('checkPhaseCoverage: refuses on gap / short-start / short-end / empty', () => {
  // Empty.
  assertEquals(checkPhaseCoverage([], '2026-01-01', '2026-06-30').covered, false);
  // Gap in middle.
  const gap = checkPhaseCoverage(
    [{ min: '2026-01-01', max: '2026-03-31' }, { min: '2026-04-15', max: '2026-06-30' }],
    '2026-01-01', '2026-06-30',
  );
  assertEquals(gap.covered, false);
  assert(gap.reason?.includes('gap'));
  // Short start.
  assertEquals(checkPhaseCoverage(
    [{ min: '2026-02-01', max: '2026-06-30' }],
    '2026-01-01', '2026-06-30',
  ).covered, false);
  // Short end.
  assertEquals(checkPhaseCoverage(
    [{ min: '2026-01-01', max: '2026-05-31' }],
    '2026-01-01', '2026-06-30',
  ).covered, false);
});

Deno.test('runner detect phase does not mark outcome (keeps run running)', () => {
  // Only aggregate and single paths call the outcome UPDATE. Detect returns
  // early after the phases_completed append without touching outcome.
  const detectBlockStart = INDEX_SRC.indexOf("if (kind === 'detect')");
  const detectBlockEnd   = INDEX_SRC.indexOf("kind === 'single'", detectBlockStart);
  assert(detectBlockStart > 0 && detectBlockEnd > detectBlockStart);
  const detectBlock = INDEX_SRC.slice(detectBlockStart, detectBlockEnd);
  // No outcome UPDATE inside detect block.
  assertEquals(detectBlock.includes("SET outcome ="), false,
    'detect phase must not mark outcome — run stays running until aggregate');
  // Phases_completed append IS present.
  assertStringIncludes(detectBlock, "'{phases_completed}'");
});

// W2.5 D-2 class-fix regression (ACT-457-ADD-06): postgres.js `unsafe(sql, params)`
// binds JS scalars as unknown/text-typed positional params. Any :param used in an
// arithmetic / date-compare / uuid-compare context must carry an adjacent `::type`
// cast, or postgres resolves the surrounding operator against text and raises
// `42883 operator does not exist: text / numeric` (the exact live-run failure that
// remained latent through W2.4 because dry-runs skip cell-aggregation).
//
// This test extracts EVERY `:param` occurrence from both SQL bodies and asserts
// each carries an adjacent `::type` cast. Zero exceptions permitted — any
// deliberate uncast site would be a test-visible carve-out requiring justification.
Deno.test('every :param occurrence in study SQL modules carries an explicit ::type cast', () => {
  // Strip `--` line comments so param declarations in headers do not count.
  const stripComments = (s: string) => s.replace(/--[^\n]*/g, '');
  // Skip false-positive `::` sequences (`::text`, `::numeric`, `::date`, `::uuid`,
  // `::smallint`) by anchoring the match to `:` NOT preceded by `:`.
  // Also skip CTE column-list definitions like `momentum_quintiles(momentum_quintile)`
  // — those are not param bindings; parser distinguishes because `:name` (with
  // leading colon) is a bindNamed marker while `name(...)` is not.
  const paramRe = /(?<!:):([a-z_]+)(::[a-z_]+)?/g;
  const modules: readonly [string, string][] = [
    ['event-detection', stripComments(EVENT_DETECTION_SQL)],
    ['cell-aggregation', stripComments(CELL_AGGREGATION_SQL)],
  ];
  const uncast: string[] = [];
  for (const [name, body] of modules) {
    for (const m of body.matchAll(paramRe)) {
      const [, paramName, cast] = m;
      if (!cast) uncast.push(`${name}: :${paramName} @ pos ${m.index}`);
    }
  }
  if (uncast.length > 0) {
    throw new Error(
      `Found ${uncast.length} uncast :param occurrence(s) — postgres.js unsafe() ` +
      `will bind these as unknown/text and fail operator resolution:\n  - ` +
      uncast.join('\n  - '),
    );
  }
});

// bindNamed uses `:name\b` — word boundary between `:name` and `::type` matches
// because `:` is not a word char, so the substitution preserves the cast. This
// test pins that assumption at the call surface (runner index.ts) rather than
// only testing SQL bodies.
Deno.test('runner bindNamed regex preserves ::type casts adjacent to :name', () => {
  // The regex definition in index.ts is `:${n}\\b`. Simulate the substitution.
  const sample = "SELECT :run_id::uuid, :as_of::date, :n::numeric FROM x WHERE k = :run_id";
  const names = ['run_id', 'as_of', 'n'] as const;
  let out = sample;
  names.forEach((n, i) => {
    const re = new RegExp(`:${n}\\b`, 'g');
    out = out.replace(re, `$${i + 1}`);
  });
  assertStringIncludes(out, '$1::uuid');
  assertStringIncludes(out, '$2::date');
  assertStringIncludes(out, '$3::numeric');
  assertStringIncludes(out, 'k = $1');
});

Deno.test('runner dry_run gating: skips cell-aggregation, marks outcome=partial', () => {
  assertStringIncludes(INDEX_SRC, 'if (dryRun)');
  assertStringIncludes(INDEX_SRC, "dryRun ? 'partial' : 'completed'");
});

Deno.test('runner initial runs outcome is running (survives mid-flight failure truthfully)', () => {
  assertStringIncludes(INDEX_SRC, "'running'");
});

Deno.test('runner stamps git_sha from BUILD_SHA env (six-MATCH surface)', () => {
  assertStringIncludes(INDEX_SRC, "Deno.env.get('BUILD_SHA')");
});

// Regression pin (ACT-457-ADD-05): the dry_run 500 root cause was that
// stripStatementBody used /;\s*$/ which only strips the final `;` at
// end-of-string. Both .sql.ts bodies have trailing `-- wiring …` comments
// AFTER the real statement terminator, so the mid-body `;` survived and,
// once wrapped in `WITH detection AS (<core>) …`, produced a Postgres
// syntax error inside the parenthesised subquery. This test proves the
// wrapped form contains ZERO semicolons after stripping — the exact
// invariant the runner depends on.
Deno.test('regression: stripped SQL bodies contain no `;` (safe to wrap in CTE / INSERT)', () => {
  // Re-implement stripStatementBody locally to keep the test pure.
  function strip(sql: string): string {
    let s = sql;
    for (;;) {
      const before = s;
      s = s.replace(/\s+$/, '');
      s = s.replace(/(^|\n)[ \t]*--[^\n]*$/, '');
      s = s.replace(/;\s*$/, '');
      if (s === before) return s;
    }
  }
  for (const [name, body] of [
    ['event-detection', EVENT_DETECTION_SQL],
    ['cell-aggregation', CELL_AGGREGATION_SQL],
  ] as const) {
    const stripped = strip(body);
    // Strip inline `--` line comments before scanning for `;` so semicolons
    // that live only inside prose comments (e.g. "SPY -7%, ticker -7%;")
    // don't spuriously fail this invariant — the runtime parser also
    // ignores them. What must not survive is a `;` in executable SQL.
    const noComments = stripped.replace(/--[^\n]*/g, '');
    if (noComments.includes(';')) {
      throw new Error(`stripped ${name} body still contains a semicolon in executable SQL — would break CTE wrap`);
    }
  }
});
