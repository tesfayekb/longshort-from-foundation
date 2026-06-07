/**
 * Deno test suite for `longshort-signal-monitor` cron edge function —
 * FP-010 Bucket A Commit A3 source-sentinel regression suite.
 *
 * In-process source-sentinel tests (handler source is read as text and
 * pattern-matched). Same precedent as FP-009 C1's
 * `longshort-momentum-compute/index_test.ts` — the `Deno.serve(createHandler(...))`
 * harness coupling is out of unit-test scope; behavioral coverage of the
 * three A1 predicates lives in `_shared/longshort-signals/shared/check-signal-compute-failures_test.ts`
 * (23 tests, all green at A1 closure).
 *
 * Coverage envelope: ~18 tests across 5 categories:
 *
 *   (A) Canonical-pattern conformance vs FP-009 C1 (5 tests)
 *       — writeStrategyAuditEvent imported + logAuditEvent NEVER imported
 *       — createHandler wraps the serve callback
 *       — apiError + apiSuccess used for responses
 *       — supabaseAdmin singleton imported (no per-request createClient)
 *
 *   (B) Cron-auth + wall-clock + import discipline (3 tests)
 *       — verifyCronSecret early-return pattern
 *       — productionClock sole wall-clock source (Gate-2 sentinel)
 *       — JOB_ID_TO_SIGNAL_ID consumed from the shared mapping file
 *
 *   (C) Constants pinning (4 tests)
 *       — 4 audit action constants present + match event-index commitments
 *       — 3 alert_config UUIDs match MIG-068 verbatim
 *       — STALE_HOURS_MONDAY=72 + STALE_HOURS_WEEKDAY=36 named constants
 *       — 3 alert-type metric_key strings match MIG-068 metric_keys
 *
 *   (D) Weekday-aware staleness logic (3 tests)
 *       — asOf.getUTCDay() consulted
 *       — Monday branch selects STALE_HOURS_MONDAY
 *       — Tue-Fri branch selects STALE_HOURS_WEEKDAY
 *
 *   (E) Alert-flow semantics (3 tests)
 *       — emitAggregateAlert helper structure (one INSERT, N audit events)
 *       — alert_history.id threaded into audit event metadata
 *       — aggregate metric_value semantics per alert_type
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const HANDLER_SOURCE = await Deno.readTextFile(
  new URL('./index.ts', import.meta.url),
);

// ── helpers ────────────────────────────────────────────────────────────────

/** Strip block + line comments so doc-commentary doesn't trigger sentinels. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\*.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
}

const CODE = codeOnly(HANDLER_SOURCE);

// ── (A) Canonical-pattern conformance vs FP-009 C1 ────────────────────────

Deno.test('(A1) writeStrategyAuditEvent imported from _shared/strategy-audit.ts (T4 audit-writer compliance)', () => {
  assert(
    HANDLER_SOURCE.includes("import { writeStrategyAuditEvent } from '../_shared/strategy-audit.ts'"),
    'missing writeStrategyAuditEvent import — T4 trap requires this for strategy code',
  );
  // Positive use check — at least one invocation in handler code.
  assert(
    /writeStrategyAuditEvent\s*\(\s*\{/.test(CODE),
    'writeStrategyAuditEvent imported but never invoked',
  );
});

Deno.test('(A2) logAuditEvent NEVER imported (T4 audit-writer trap protection)', () => {
  // logAuditEvent in _shared/audit.ts is hardcoded to platform audit_logs.
  // Strategy code MUST NOT use it (DEC-033 v4.1 clause 4 + T4 trap).
  // Check against code-only (comments stripped) so doc-commentary that
  // NAMES the forbidden symbol doesn't false-positive — the trap is about
  // import/invocation, not mention.
  assert(
    !CODE.includes('logAuditEvent'),
    'T4 VIOLATION: logAuditEvent appears in strategy handler — use writeStrategyAuditEvent',
  );
  assert(
    !CODE.includes("_shared/audit.ts"),
    'T4 VIOLATION: _shared/audit.ts imported (platform audit-writer) — use _shared/strategy-audit.ts',
  );
});

Deno.test('(A3) createHandler wraps Deno.serve callback (canonical envelope)', () => {
  assert(
    HANDLER_SOURCE.includes("import { createHandler, apiSuccess } from '../_shared/handler.ts'"),
    'missing createHandler import from _shared/handler.ts',
  );
  assert(
    /Deno\.serve\s*\(\s*createHandler\s*\(/.test(CODE),
    'Deno.serve must wrap createHandler(...) per canonical envelope (FP-009 C1 mirror)',
  );
});

Deno.test('(A4) apiError + apiSuccess used for response construction (no raw new Response)', () => {
  assert(HANDLER_SOURCE.includes("import { apiError } from '../_shared/api-error.ts'"), 'missing apiError import');
  assert(/apiSuccess\s*\(/.test(CODE), 'apiSuccess never invoked');
  assert(/apiError\s*\(\s*500/.test(CODE), 'apiError(500, ...) never invoked for failure path');
  // The verifyCronSecret return path is allowed to return its own Response
  // (constructed inside cron-auth.ts), so we permit `return cronAuthError`.
  // Reject raw `new Response(JSON.stringify(...))` in handler code.
  assert(
    !/new\s+Response\s*\(\s*JSON\.stringify/.test(CODE),
    'raw new Response(JSON.stringify(...)) in handler — use apiError/apiSuccess',
  );
});

Deno.test('(A5) supabaseAdmin singleton imported (no per-request createClient)', () => {
  assert(
    HANDLER_SOURCE.includes("import { supabaseAdmin } from '../_shared/supabase-admin.ts'"),
    'missing supabaseAdmin singleton import',
  );
  assert(
    !/createClient\s*\(/.test(CODE),
    'per-request createClient(...) in handler — use supabaseAdmin singleton',
  );
  assert(
    !HANDLER_SOURCE.includes('@supabase/supabase-js'),
    'direct @supabase/supabase-js import in handler — singleton is the sole client surface',
  );
});

// ── (B) Cron-auth + wall-clock + import discipline ────────────────────────

Deno.test('(B1) cron-auth wired via verifyCronSecret early-return (NOT operator JWT)', () => {
  assert(HANDLER_SOURCE.includes("import { verifyCronSecret } from '../_shared/cron-auth.ts'"),
    'missing verifyCronSecret import');
  assert(/const\s+cronAuthError\s*=\s*verifyCronSecret\s*\(\s*req\s*\)/.test(CODE),
    'missing const cronAuthError = verifyCronSecret(req) early-return pattern');
  assert(/if\s*\(\s*cronAuthError\s*\)\s*return\s+cronAuthError/.test(CODE),
    'missing if (cronAuthError) return cronAuthError early-return');
  assert(!HANDLER_SOURCE.includes('authenticateRequest('),
    'unexpected authenticateRequest on cron handler — operator JWT is for manual-trigger siblings');
});

Deno.test('(B2) productionClock is the sole wall-clock source — Gate-2 sentinel', () => {
  assert(
    HANDLER_SOURCE.includes("import { productionClock } from '../_shared/longshort-clock.ts'"),
    'productionClock must import from _shared/longshort-clock.ts (DEC-034 chokepoint)',
  );
  assert(
    /productionClock\.getWallClockTs\s*\(\s*\)/.test(CODE),
    'missing productionClock.getWallClockTs() invocation',
  );
  // No-arg `new Date()` is banned. `new Date(<expr>)` with explicit arg is
  // permitted (idiomatic boundary derivation, e.g. `new Date(asOf.getTime() - X)`).
  assert(
    !/new\s+Date\s*\(\s*\)/.test(CODE),
    'wall-clock leak: no-arg new Date() found (DEC-034 clause 4 ban — use productionClock)',
  );
  assert(!/Date\.now\s*\(/.test(CODE), 'wall-clock leak: Date.now() found');
  assert(!/performance\.now\s*\(/.test(CODE), 'wall-clock leak: performance.now() found');
});

Deno.test('(B3) JOB_ID_TO_SIGNAL_ID consumed from the shared mapping file', () => {
  assert(
    HANDLER_SOURCE.includes("import { JOB_ID_TO_SIGNAL_ID } from '../_shared/longshort-signals/shared/job-signal-mapping.ts'"),
    'JOB_ID_TO_SIGNAL_ID must import from the shared registry per FP-010 Locked Decision Point 3',
  );
  assert(/JOB_ID_TO_SIGNAL_ID\s*\[/.test(CODE),
    'JOB_ID_TO_SIGNAL_ID imported but never indexed');
});

// ── (C) Constants pinning ─────────────────────────────────────────────────

Deno.test('(C1) four audit action constants present + match event-index commitments', () => {
  assert(HANDLER_SOURCE.includes("'longshort.signal_monitor.started'"),  'missing .started constant');
  assert(HANDLER_SOURCE.includes("'longshort.signal_monitor.completed'"), 'missing .completed constant');
  assert(HANDLER_SOURCE.includes("'longshort.signal_monitor.failed'"),   'missing .failed constant');
  assert(HANDLER_SOURCE.includes("'longshort.signal_monitor.alert'"),    'missing .alert constant');
});

Deno.test('(C2) three alert_config UUIDs match MIG-068 verbatim', () => {
  assert(HANDLER_SOURCE.includes("'f0100068-0001-4000-8000-000000000001'"),
    'ALERT_CONFIG_ID_FAILED UUID drift vs MIG-068 row 1');
  assert(HANDLER_SOURCE.includes("'f0100068-0002-4000-8000-000000000002'"),
    'ALERT_CONFIG_ID_LOW_WATER_MARK UUID drift vs MIG-068 row 2');
  assert(HANDLER_SOURCE.includes("'f0100068-0003-4000-8000-000000000003'"),
    'ALERT_CONFIG_ID_STALE UUID drift vs MIG-068 row 3');
});

Deno.test('(C3) STALE_HOURS_MONDAY=72 + STALE_HOURS_WEEKDAY=36 named constants (no magic numbers)', () => {
  assert(/const\s+STALE_HOURS_MONDAY\s*=\s*72\b/.test(CODE),
    'STALE_HOURS_MONDAY must be a named const = 72 (FP-010 Point 4 lock)');
  assert(/const\s+STALE_HOURS_WEEKDAY\s*=\s*36\b/.test(CODE),
    'STALE_HOURS_WEEKDAY must be a named const = 36 (FP-010 Point 4 lock)');
});

Deno.test('(C4) three alert-type metric_key strings match MIG-068 metric_keys', () => {
  assert(HANDLER_SOURCE.includes("'signal_compute_failed'"),         'missing signal_compute_failed metric_key');
  assert(HANDLER_SOURCE.includes("'signal_compute_low_water_mark'"), 'missing signal_compute_low_water_mark metric_key');
  assert(HANDLER_SOURCE.includes("'signal_compute_stale'"),          'missing signal_compute_stale metric_key');
});

// ── (D) Weekday-aware staleness logic ─────────────────────────────────────

Deno.test('(D1) asOf.getUTCDay() consulted for weekday-aware threshold selection', () => {
  assert(/asOf\.getUTCDay\s*\(\s*\)/.test(CODE),
    'getUTCDay() must be called on asOf for weekday selection (FP-010 Point 4)');
});

Deno.test('(D2) Monday branch selects STALE_HOURS_MONDAY', () => {
  // Pattern: `dayOfWeekUtc === 1 ? STALE_HOURS_MONDAY : STALE_HOURS_WEEKDAY`
  // Tolerant regex — whitespace + variable name variance allowed.
  assert(
    /===\s*1\s*\?\s*STALE_HOURS_MONDAY\s*:\s*STALE_HOURS_WEEKDAY/.test(CODE),
    'Monday branch (UTC day 1) must select STALE_HOURS_MONDAY; Tue-Fri select STALE_HOURS_WEEKDAY',
  );
});

Deno.test('(D3) stale predicate invoked with the dynamically selected staleHours', () => {
  // The handler should pass the resolved staleHours (not a literal 36) to
  // checkSignalComputeStale. Pattern: `checkSignalComputeStale(rows, asOf, staleHours, expectedSignalIds)`.
  assert(
    /checkSignalComputeStale\s*\(\s*rows\s*,\s*asOf\s*,\s*staleHours\s*,/.test(CODE),
    'checkSignalComputeStale must receive the dynamically-selected staleHours variable',
  );
});

// ── (E) Alert-flow semantics ──────────────────────────────────────────────

Deno.test('(E1) emitAggregateAlert helper: one alert_history INSERT, N audit events', () => {
  // Helper exists and INSERTs into alert_history.
  assert(
    /async\s+function\s+emitAggregateAlert/.test(CODE),
    'emitAggregateAlert helper must exist (aggregate-row-per-alert-type semantic per FP-010 (d))',
  );
  assert(
    /\.from\s*\(\s*['"]alert_history['"]\s*\)\s*[\s\S]{0,80}\.insert\s*\(/.test(CODE),
    'emitAggregateAlert must INSERT into alert_history',
  );
  // Helper iterates payloads and writes one audit event per signal.
  assert(
    /for\s*\(\s*const\s+payload\s+of\s+args\.payloads\s*\)/.test(CODE),
    'emitAggregateAlert must iterate args.payloads to emit per-signal audit events',
  );
});

Deno.test('(E2) alert_history.id threaded into audit event metadata (single-hop cross-reference)', () => {
  // The per-signal audit event metadata must include alert_history_id
  // referencing the inserted row's id (so AdminHealthPage can join from
  // the alert_history glance to the per-signal forensic detail).
  assert(
    /alert_history_id\s*:\s*ahRow\.id/.test(CODE),
    'audit event metadata must include alert_history_id: ahRow.id for cross-reference',
  );
});

Deno.test('(E3) aggregate metric_value semantics per alert_type (count / min / threshold)', () => {
  // Failed: metric_value = failedPayloads.length (count)
  assert(
    /metricValue\s*:\s*failedPayloads\.length/.test(CODE),
    'failed alert metric_value must be failedPayloads.length (count of failed rows)',
  );
  // Low-water-mark: metric_value derived from a min reduction over populated_pct
  assert(
    /minPopulatedPct/.test(CODE),
    'low-water-mark alert must derive minPopulatedPct over triggered payloads',
  );
  // Stale: metric_value = staleHours (applied threshold per FP-010 Point 4 / INC-61 deferral)
  assert(
    /metricValue\s*:\s*staleHours/.test(CODE),
    'stale alert metric_value must equal the applied staleHours threshold (option A per FP-010)',
  );
});

// ── (F) Misc — handler path pinning for B1 (handler_path field) ───────────

Deno.test('(F1) handler path matches B1\'s eventual handler_path registration', () => {
  const importPath = new URL('./index.ts', import.meta.url).pathname;
  assertEquals(
    importPath.endsWith('/supabase/functions/longshort-signal-monitor/index.ts'),
    true,
    `handler path drift — B1 MIG-069 will register handler_path='supabase/functions/longshort-signal-monitor/index.ts'; got ${importPath}`,
  );
});