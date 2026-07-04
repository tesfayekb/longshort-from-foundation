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
                    ':min_band_bps', ':lookback_min_date', ':event_date_min']) {
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
  assertStringIncludes(EVENT_DETECTION_SQL, 'bw.trade_date >= :event_date_min');
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
