import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  applyMigrationSql,
  evaluatePredicates,
  findMarkersInSource,
  resolveJobStateFromMigrations,
  stripSqlComments,
  splitSqlRow,
  type JobState,
} from './check-handler-liveness-markers.ts';

Deno.test('stripSqlComments — removes line + block comments, preserves strings', () => {
  assertEquals(stripSqlComments("SELECT 1; -- comment\nSELECT 2;"), 'SELECT 1; \nSELECT 2;');
  assertEquals(stripSqlComments('/* block */ SELECT 1;').trim(), 'SELECT 1;');
  assertEquals(stripSqlComments("SELECT '-- not a comment';"), "SELECT '-- not a comment';");
});

Deno.test('splitSqlRow — respects quoted commas', () => {
  const cells = splitSqlRow("'a', 'b,c', true, 1");
  assertEquals(cells, ["'a'", "'b,c'", 'true', '1']);
});

Deno.test('applyMigrationSql — single-row INSERT establishes state', () => {
  const state = new Map<string, JobState>();
  applyMigrationSql(state, `
    INSERT INTO public.job_registry (id, enabled, trigger_type) VALUES ('j1', true, 'scheduled');
  `);
  assertEquals(state.get('j1'), { id: 'j1', enabled: true, trigger_type: 'scheduled', handler_path: null });
});

Deno.test('applyMigrationSql — multi-row INSERT with extra cols', () => {
  const state = new Map<string, JobState>();
  applyMigrationSql(state, `
    INSERT INTO public.job_registry (
      id, version, owner_module, description, schedule, trigger_type,
      class, priority, execution_guarantee, timeout_seconds, max_retries,
      retry_policy, concurrency_policy, replay_safe, enabled, status
    ) VALUES
      ('a', '1.0.0', 'm', 'd', '*/5 * * * *', 'scheduled', 'op', 'high', 'at_least_once', 30, 3, 'standard', 'forbid', false, false, 'registered'),
      ('b', '1.0.0', 'm', 'd', 'manual', 'manual', 'op', 'normal', 'at_least_once', 30, 1, 'none', 'allow', true, true, 'registered')
    ON CONFLICT (id) DO NOTHING;
  `);
  assertEquals(state.get('a')?.enabled, false);
  assertEquals(state.get('a')?.trigger_type, 'scheduled');
  assertEquals(state.get('b')?.enabled, true);
  assertEquals(state.get('b')?.trigger_type, 'manual');
});

Deno.test('applyMigrationSql — chronological overlay (MIG-044 insert false → MIG-045 set true → MIG-058 set false)', () => {
  const state = new Map<string, JobState>();
  // MIG-044 (seed enabled=false)
  applyMigrationSql(state, `
    INSERT INTO public.job_registry (id, schedule, trigger_type, enabled)
    VALUES ('longshort.reconciliation_periodic_sweep', '*/5 * * * *', 'scheduled', false);
  `);
  assertEquals(state.get('longshort.reconciliation_periodic_sweep')?.enabled, false);
  // MIG-045 (activate)
  applyMigrationSql(state, `
    UPDATE public.job_registry SET enabled = true WHERE id = 'longshort.reconciliation_periodic_sweep';
  `);
  assertEquals(state.get('longshort.reconciliation_periodic_sweep')?.enabled, true);
  // MIG-058 (disarm)
  applyMigrationSql(state, `
    UPDATE public.job_registry SET enabled = false WHERE id = 'longshort.reconciliation_periodic_sweep';
  `);
  assertEquals(state.get('longshort.reconciliation_periodic_sweep')?.enabled, false);
});

Deno.test('applyMigrationSql — UPDATE handler_path via IN list (multi-id)', () => {
  const state = new Map<string, JobState>();
  applyMigrationSql(state, `
    INSERT INTO public.job_registry (id, enabled, trigger_type) VALUES ('a', true, 'scheduled'), ('b', true, 'manual');
  `);
  applyMigrationSql(state, `
    UPDATE public.job_registry SET handler_path = 'supabase/functions/shared-h/index.ts' WHERE id IN ('a', 'b');
  `);
  assertEquals(state.get('a')?.handler_path, 'supabase/functions/shared-h/index.ts');
  assertEquals(state.get('b')?.handler_path, 'supabase/functions/shared-h/index.ts');
});

Deno.test('findMarkersInSource — NOT FOR LIVE INVOCATION flagged', () => {
  const src = `/**\n * NOT FOR LIVE INVOCATION.\n */\nexport const x = 1;`;
  const hits = findMarkersInSource(src);
  assertEquals(hits.length, 1);
  assertEquals(hits[0].marker, 'NOT-FOR-LIVE');
});

Deno.test('findMarkersInSource — MOCK_*_FETCHER flagged; MOCK_FIXTURE_DAY not', () => {
  const hits = findMarkersInSource(`const MOCK_BP_FETCHER = {};\nconst MOCK_FIXTURE_DAY = 1;`);
  assertEquals(hits.length, 1);
  assertEquals(hits[0].marker, 'MOCK_*_FETCHER');
});

Deno.test('findMarkersInSource — gate-15-allow override honored (same line)', () => {
  const hits = findMarkersInSource(`const MOCK_BP_FETCHER = {}; // gate-15-allow: ADR-XXX`);
  assertEquals(hits.length, 0);
});

Deno.test('findMarkersInSource — gate-15-allow override honored (preceding line)', () => {
  const hits = findMarkersInSource(`// gate-15-allow: ADR-XXX — test override\nconst MOCK_BP_FETCHER = {};`);
  assertEquals(hits.length, 0);
});

Deno.test('evaluatePredicates — P1: enabled+scheduled handler with marker → violation', () => {
  const jobs: JobState[] = [
    { id: 'sweep', enabled: true, trigger_type: 'scheduled', handler_path: 'h.ts' },
  ];
  const v = evaluatePredicates(jobs, () => `/* NOT FOR LIVE INVOCATION */\n`);
  assertEquals(v.length, 1);
  assertEquals(v[0].rule, 'P1-marker');
});

Deno.test('evaluatePredicates — enabled=false → not flagged even with markers', () => {
  const jobs: JobState[] = [
    { id: 'sweep', enabled: false, trigger_type: 'scheduled', handler_path: 'h.ts' },
  ];
  const v = evaluatePredicates(jobs, () => `NOT FOR LIVE INVOCATION`);
  assertEquals(v.length, 0);
});

Deno.test('evaluatePredicates — trigger_type=manual → not flagged', () => {
  const jobs: JobState[] = [
    { id: 'm', enabled: true, trigger_type: 'manual', handler_path: 'h.ts' },
  ];
  const v = evaluatePredicates(jobs, () => `NOT FOR LIVE INVOCATION`);
  assertEquals(v.length, 0);
});

Deno.test('evaluatePredicates — P2: enabled+scheduled + NULL handler_path → violation', () => {
  const jobs: JobState[] = [
    { id: 'orphan', enabled: true, trigger_type: 'scheduled', handler_path: null },
  ];
  const v = evaluatePredicates(jobs, () => null);
  assertEquals(v.length, 1);
  assertEquals(v[0].rule, 'P2-null-handler');
});

Deno.test('evaluatePredicates — clean handler → no violation', () => {
  const jobs: JobState[] = [
    { id: 'ok', enabled: true, trigger_type: 'scheduled', handler_path: 'h.ts' },
  ];
  const v = evaluatePredicates(jobs, () => `export const x = 1;`);
  assertEquals(v.length, 0);
});

Deno.test('resolveJobStateFromMigrations — current repo: sweep resolves enabled=false; clean at Gate-15 baseline', async () => {
  const state = await resolveJobStateFromMigrations();
  const sweep = state.get('longshort.reconciliation_periodic_sweep');
  assertEquals(sweep?.enabled, false, 'sweep MUST resolve to enabled=false after MIG-058');
  assertEquals(sweep?.handler_path, 'supabase/functions/longshort-reconciliation-tick/index.ts');

  // Baseline: Gate-15 must be clean.
  const violations = evaluatePredicates(state.values(), (path) => {
    try { return Deno.readTextFileSync(path); }
    catch (e) { if (e instanceof Deno.errors.NotFound) return null; throw e; }
  });
  if (violations.length > 0) console.error('UNEXPECTED Gate-15 VIOLATIONS:', violations);
  assertEquals(violations.length, 0, 'Repository must be clean at the Commit 10 baseline');
});