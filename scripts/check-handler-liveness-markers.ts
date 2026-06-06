#!/usr/bin/env -S deno run --allow-read

/**
 * check-handler-liveness-markers — Gate-15 cross-artifact sentinel
 * (FP-008.4 Commit 10 / DW-084 / INC-39 recurrence-prevention).
 *
 * Pairs with the runtime two-invocation liveness rule (MIG-059 / Commit 9) as
 * defense-in-depth across the data + code dimensions. The runtime rule catches
 * an enabled+scheduled sweep that fires-but-reconciles-nothing-real at execution
 * time; this CI sentinel catches the upstream class — an enabled=true +
 * trigger_type='scheduled' job whose handler file is marked NOT FOR LIVE
 * INVOCATION or is backed by MOCK_*_FETCHER — before the bad state can ever ship.
 *
 * Authoritative ground truth:
 *   - Final job_registry state is derived by chronologically replaying every
 *     INSERT/UPDATE in supabase/migrations/*.sql (last write wins per id). This
 *     correctly resolves longshort.reconciliation_periodic_sweep to enabled=false
 *     after the MIG-044 (insert false) → MIG-045 (update true) → MIG-058 (update
 *     false) sequence.
 *   - handler_path comes from the MIG-060 backfill UPDATEs in the same migration
 *     tree (so the sentinel and the live DB agree without needing DB access at CI).
 *
 * Predicates (any violation fails the build):
 *   (P1) enabled=true AND trigger_type='scheduled' AND handler_path IS NOT NULL
 *        AND handler file matches a NOT-FOR-LIVE / MOCK_*_FETCHER marker.
 *   (P2) enabled=true AND trigger_type='scheduled' AND handler_path IS NULL
 *        (registry-completeness: an enabled scheduled job that dispatches to
 *        nothing). Clean at baseline (replay_chain + control rows are 'manual').
 *
 * Override: `// gate-15-allow: <ID>` on the marker line (or the immediately
 * preceding comment line) suppresses P1 for that one marker. Override registry
 * lives in docs/banned-patterns.md.
 *
 * Exit code: 0 = clean; non-zero = violations (CI fails the build).
 */

import { walk } from 'https://deno.land/std@0.224.0/fs/walk.ts';

export interface JobState {
  id: string;
  enabled: boolean | null;
  trigger_type: string | null;
  handler_path: string | null;
}

export interface Violation {
  rule: 'P1-marker' | 'P2-null-handler';
  job_id: string;
  handler_path: string | null;
  marker?: string;
  line?: number;
  text?: string;
}

export const MARKER_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'NOT-FOR-LIVE',  pattern: /NOT FOR LIVE INVOCATION/ },
  // Suffix-anchored on _FETCHER to avoid false-positives on e.g. MOCK_FIXTURE_DAY.
  { name: 'MOCK_*_FETCHER', pattern: /\bMOCK_[A-Z][A-Z0-9_]*_FETCHER\b/ },
];

const OVERRIDE_ANNOTATION = /\/\/\s*gate-15-allow:\s*\S+/;

// ---------- Pure core: SQL replay ----------

/** Strip SQL line+block comments. Conservative — string-literal contents are preserved. */
export function stripSqlComments(sql: string): string {
  let out = '';
  let i = 0;
  let inBlock = false;
  let inLine = false;
  let inString = false;
  while (i < sql.length) {
    const c = sql[i];
    const n = sql[i + 1];
    if (inLine) { if (c === '\n') { inLine = false; out += c; } i++; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i += 2; continue; } i++; continue; }
    if (inString) { if (c === "'" && n === "'") { out += "''"; i += 2; continue; } if (c === "'") inString = false; out += c; i++; continue; }
    if (c === '-' && n === '-') { inLine = true; i += 2; continue; }
    if (c === '/' && n === '*') { inBlock = true; i += 2; continue; }
    if (c === "'") { inString = true; out += c; i++; continue; }
    out += c;
    i++;
  }
  return out;
}

/** Split a SQL VALUES row "a, 'b,c', true" into typed cells, respecting quoted strings. */
export function splitSqlRow(row: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inString = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (inString) {
      if (c === "'" && row[i + 1] === "'") { cur += "''"; i++; continue; }
      if (c === "'") { inString = false; cur += c; continue; }
      cur += c; continue;
    }
    if (c === "'") { inString = true; cur += c; continue; }
    if (c === ',') { cells.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim().length > 0) cells.push(cur.trim());
  return cells;
}

/**
 * Split SQL into top-level statements at unquoted, unparenthesised, non-dollar-quoted ';'.
 * Conservative — keeps statement text verbatim (sans the trailing ';').
 */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inString = false;
  let depth = 0;
  let inDollar = false;
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (inDollar) {
      if (c === '$' && sql[i + 1] === '$') { inDollar = false; cur += '$$'; i += 2; continue; }
      cur += c; i++; continue;
    }
    if (inString) {
      if (c === "'" && sql[i + 1] === "'") { cur += "''"; i += 2; continue; }
      if (c === "'") inString = false;
      cur += c; i++; continue;
    }
    if (c === '$' && sql[i + 1] === '$') { inDollar = true; cur += '$$'; i += 2; continue; }
    if (c === "'") { inString = true; cur += c; i++; continue; }
    if (c === '(') { depth++; cur += c; i++; continue; }
    if (c === ')') { if (depth > 0) depth--; cur += c; i++; continue; }
    if (c === ';' && depth === 0) {
      if (cur.trim().length > 0) out.push(cur);
      cur = '';
      i++; continue;
    }
    cur += c; i++;
  }
  if (cur.trim().length > 0) out.push(cur);
  return out;
}

function unquote(cell: string): string {
  const t = cell.trim();
  if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
  return t;
}

function parseBool(cell: string): boolean | null {
  const t = cell.trim().toLowerCase();
  if (t === 'true') return true;
  if (t === 'false') return false;
  return null;
}

/**
 * Apply one migration's SQL to the in-memory job state map. Recognises:
 *   - INSERT INTO public.job_registry (cols...) VALUES (vals), (vals), ...
 *   - UPDATE public.job_registry SET col = val [, col = val] WHERE id = '...'
 *     (also IN (...) lists for multi-id updates).
 * Anything else is ignored — surfaces an exception only on a recognised shape
 * that fails to parse (so a future shape that needs new support is loud).
 */
export function applyMigrationSql(state: Map<string, JobState>, sqlRaw: string): void {
  const sql = stripSqlComments(sqlRaw);
  // Split into top-level statements at ';' that are not inside string literals,
  // parentheses, or dollar-quoted blocks ($$ ... $$). MIG-044's row descriptions
  // contain literal ';' inside quoted strings, so naive split breaks parsing.
  const statements = splitSqlStatements(sql);

  // INSERTs — match against each statement individually.
  const insertRe = /^\s*INSERT\s+INTO\s+public\.job_registry\s*\(([^)]+)\)\s*VALUES\s*([\s\S]+?)(?:ON\s+CONFLICT[\s\S]*)?$/i;
  let m: RegExpExecArray | null;
  for (const stmt of statements) {
    m = insertRe.exec(stmt);
    if (!m) continue;
    const cols = m[1].split(',').map(c => c.trim().toLowerCase());
    const idIdx = cols.indexOf('id');
    const enabledIdx = cols.indexOf('enabled');
    const triggerIdx = cols.indexOf('trigger_type');
    const handlerPathIdx = cols.indexOf('handler_path');
    if (idIdx < 0) continue;
    const valuesBlock = m[2];
    // Split top-level rows: "(...), (...), (...)"
    const rows: string[] = [];
    let depth = 0;
    let cur = '';
    let inString = false;
    for (let i = 0; i < valuesBlock.length; i++) {
      const c = valuesBlock[i];
      if (inString) {
        if (c === "'" && valuesBlock[i + 1] === "'") { cur += "''"; i++; continue; }
        if (c === "'") inString = false;
        cur += c; continue;
      }
      if (c === "'") { inString = true; cur += c; continue; }
      if (c === '(') { depth++; if (depth === 1) { cur = ''; continue; } cur += c; continue; }
      if (c === ')') { depth--; if (depth === 0) { rows.push(cur); cur = ''; continue; } cur += c; continue; }
      if (depth > 0) cur += c;
    }
    for (const row of rows) {
      const cells = splitSqlRow(row);
      if (cells.length < cols.length) continue;
      const id = unquote(cells[idIdx]);
      if (!id) continue;
      const existing = state.get(id);
      const enabled = enabledIdx >= 0 ? parseBool(cells[enabledIdx]) : existing?.enabled ?? null;
      const trigger = triggerIdx >= 0 ? unquote(cells[triggerIdx]) : existing?.trigger_type ?? null;
      // Honour handler_path when present in INSERT VALUES (MIG-066/FP-008.4 #8 pattern).
      // Pre-fix this was hardcoded null, which left handler_path-in-INSERT rows latently
      // null-handler in the offline-replay sentinel state; the gap was harmless while
      // enabled=false but surfaced as a P2-null-handler violation at MIG-067's enable-flip.
      // See INC-59 / FP-009 Bucket C C2b tail-hotfix.
      const handlerPath = handlerPathIdx >= 0 ? unquote(cells[handlerPathIdx]) : existing?.handler_path ?? null;
      // INSERT ... ON CONFLICT DO NOTHING: keep existing if already present.
      if (existing) continue;
      state.set(id, { id, enabled, trigger_type: trigger, handler_path: handlerPath });
    }
  }

  // UPDATEs
  const updateRe = /^\s*UPDATE\s+public\.job_registry\s+SET\s+([\s\S]+?)\s+WHERE\s+([\s\S]+?)\s*$/i;
  for (const stmt of statements) {
    m = updateRe.exec(stmt);
    if (!m) continue;
    const setClause = m[1];
    const whereClause = m[2];
    const sets: Array<{ col: string; val: string }> = [];
    // Split SET pairs on top-level commas.
    let cur = '';
    let inString = false;
    for (let i = 0; i < setClause.length; i++) {
      const c = setClause[i];
      if (inString) {
        if (c === "'" && setClause[i + 1] === "'") { cur += "''"; i++; continue; }
        if (c === "'") inString = false;
        cur += c; continue;
      }
      if (c === "'") { inString = true; cur += c; continue; }
      if (c === ',') { sets.push(parseSet(cur)); cur = ''; continue; }
      cur += c;
    }
    if (cur.trim().length > 0) sets.push(parseSet(cur));

    // Resolve target ids from WHERE.
    const ids = parseWhereIds(whereClause);
    for (const id of ids) {
      const existing = state.get(id);
      if (!existing) continue; // UPDATE of unknown id — ignore (consistent with PG no-op).
      for (const { col, val } of sets) {
        if (col === 'enabled') existing.enabled = parseBool(val);
        else if (col === 'trigger_type') existing.trigger_type = unquote(val);
        else if (col === 'handler_path') existing.handler_path = unquote(val);
      }
    }
  }
}

function parseSet(pair: string): { col: string; val: string } {
  const eq = pair.indexOf('=');
  return { col: pair.slice(0, eq).trim().toLowerCase(), val: pair.slice(eq + 1).trim() };
}

function parseWhereIds(where: string): string[] {
  // id = 'X'
  const eq = /id\s*=\s*'([^']+)'/i.exec(where);
  if (eq) return [eq[1]];
  // id IN ('a', 'b', ...)
  const inMatch = /id\s+IN\s*\(([\s\S]+?)\)/i.exec(where);
  if (inMatch) {
    const list = inMatch[1];
    const out: string[] = [];
    const re = /'([^']+)'/g;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(list)) !== null) out.push(mm[1]);
    return out;
  }
  return [];
}

// ---------- Pure core: marker scan ----------

export function findMarkersInSource(source: string): Array<{ marker: string; line: number; text: string }> {
  const lines = source.split('\n');
  const hits: Array<{ marker: string; line: number; text: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (OVERRIDE_ANNOTATION.test(line)) continue;
    // Allow override on the immediately-preceding line (mirrors gate-13 convention).
    if (i > 0 && OVERRIDE_ANNOTATION.test(lines[i - 1])) continue;
    for (const { name, pattern } of MARKER_PATTERNS) {
      if (pattern.test(line)) {
        hits.push({ marker: name, line: i + 1, text: line.trim() });
      }
    }
  }
  return hits;
}

// ---------- Pure core: predicate evaluation ----------

export function evaluatePredicates(
  jobs: Iterable<JobState>,
  readHandler: (path: string) => string | null,
): Violation[] {
  const violations: Violation[] = [];
  for (const job of jobs) {
    if (job.enabled !== true) continue;
    if (job.trigger_type !== 'scheduled') continue;
    if (job.handler_path === null) {
      violations.push({ rule: 'P2-null-handler', job_id: job.id, handler_path: null });
      continue;
    }
    const src = readHandler(job.handler_path);
    if (src === null) {
      violations.push({
        rule: 'P2-null-handler',
        job_id: job.id,
        handler_path: job.handler_path,
        marker: 'handler-file-not-found',
      });
      continue;
    }
    for (const hit of findMarkersInSource(src)) {
      violations.push({
        rule: 'P1-marker',
        job_id: job.id,
        handler_path: job.handler_path,
        marker: hit.marker,
        line: hit.line,
        text: hit.text,
      });
    }
  }
  return violations;
}

// ---------- Thin CLI ----------

export async function resolveJobStateFromMigrations(rootDir = '.'): Promise<Map<string, JobState>> {
  const state = new Map<string, JobState>();
  const files: string[] = [];
  try {
    for await (const entry of walk(`${rootDir}/supabase/migrations`, { exts: ['.sql'], includeDirs: false })) {
      files.push(entry.path);
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  files.sort(); // filename timestamps sort chronologically by construction
  for (const path of files) {
    const sql = await Deno.readTextFile(path);
    applyMigrationSql(state, sql);
  }
  return state;
}

if (import.meta.main) {
  const state = await resolveJobStateFromMigrations();
  const violations = evaluatePredicates(state.values(), (path) => {
    try { return Deno.readTextFileSync(path); }
    catch (e) { if (e instanceof Deno.errors.NotFound) return null; throw e; }
  });
  if (violations.length === 0) {
    console.log(`check-handler-liveness-markers: CLEAN — ${state.size} jobs scanned, 0 violations`);
    Deno.exit(0);
  }
  console.error(`check-handler-liveness-markers: FAIL — ${violations.length} violation(s):`);
  for (const v of violations) {
    if (v.rule === 'P1-marker') {
      console.error(`  [P1-marker] job=${v.job_id} handler=${v.handler_path}:${v.line} marker=${v.marker}`);
      console.error(`    ${v.text}`);
    } else {
      console.error(`  [P2-null-handler] job=${v.job_id} handler_path=${v.handler_path ?? 'NULL'} (${v.marker ?? 'enabled+scheduled with no handler file'})`);
    }
  }
  Deno.exit(1);
}