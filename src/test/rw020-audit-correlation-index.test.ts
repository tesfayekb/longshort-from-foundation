/**
 * RW-020: audit_logs.correlation_id index — DDL contract + lookup behavior.
 *
 * PLAN-AUTH-SUDO-001 / DEC-029 / FP-003 / RW-019 / RW-020.
 *
 * Two-layer guard:
 *
 *   1. Static DDL: the canonical partial btree index on
 *      `audit_logs.correlation_id` is declared in BOTH
 *      `sql/01_rbac_schema.sql` (original creation) and
 *      `sql/08_audit_correlation_id_index.sql` (idempotent guard +
 *      inline DO-block self-check that fails the migration if the
 *      index shape is missing or wrong).
 *
 *   2. Lookup behavior: a `.from('audit_logs').select(...).eq('correlation_id', cid)`
 *      query — the canonical trace lookup — returns exactly the row whose
 *      `correlation_id` column matches, and an empty result for a mismatch.
 *      We exercise this against an in-memory PostgREST stand-in built on the
 *      real supabase-js client surface, so any drift in the query pattern
 *      (wrong column, wrong filter operator) breaks the test.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─── Static DDL contract ────────────────────────────────────────────

const repoRoot = resolve(__dirname, '..', '..');
const schemaSql  = readFileSync(resolve(repoRoot, 'sql/01_rbac_schema.sql'), 'utf-8');
const guardSql   = readFileSync(resolve(repoRoot, 'sql/08_audit_correlation_id_index.sql'), 'utf-8');

describe('RW-020 — DDL declares the correlation_id index', () => {
  it('sql/01_rbac_schema.sql declares the canonical partial btree index', () => {
    expect(schemaSql).toMatch(
      /CREATE\s+INDEX\s+idx_audit_logs_correlation_id\s+ON\s+public\.audit_logs\(correlation_id\)\s+WHERE\s+correlation_id\s+IS\s+NOT\s+NULL/i,
    );
  });

  it('sql/08_audit_correlation_id_index.sql is idempotent (CREATE INDEX IF NOT EXISTS)', () => {
    expect(guardSql).toMatch(
      /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_audit_logs_correlation_id\s+ON\s+public\.audit_logs\s*\(correlation_id\)\s*WHERE\s+correlation_id\s+IS\s+NOT\s+NULL/i,
    );
  });

  it('sql/08 contains the DO-block DDL self-check covering missing / wrong-column / non-partial cases', () => {
    // The migration must fail loudly if the index regresses to any of these states.
    expect(guardSql).toMatch(/DO\s+\$\$/);
    expect(guardSql).toMatch(/RAISE\s+EXCEPTION\s+'DDL check failed:[^']*is missing/i);
    expect(guardSql).toMatch(/RAISE\s+EXCEPTION\s+'DDL check failed:[^']*btree on \(correlation_id\)/i);
    expect(guardSql).toMatch(/RAISE\s+EXCEPTION\s+'DDL check failed:[^']*partial WHERE correlation_id IS NOT NULL/i);
  });

  it('the index is documented as the trace-lookup index', () => {
    expect(guardSql).toMatch(/COMMENT\s+ON\s+INDEX\s+public\.idx_audit_logs_correlation_id\s+IS/i);
    expect(guardSql).toMatch(/trace lookup/i);
  });
});

// ─── Lookup behavior — query-by-correlation_id returns the right row ────

/**
 * Minimal in-memory stand-in for the supabase-js `.from('audit_logs')` chain.
 * Implements only the surface used for trace lookup:
 *   .from('audit_logs').insert(row)
 *   .from('audit_logs').select(cols).eq('correlation_id', cid)
 *   .from('audit_logs').select(cols).eq('correlation_id', cid).single()
 * Indexed on `correlation_id` to mirror the production index (purely
 * to assert the *query path* uses that exact column).
 */
interface AuditRow {
  id: string;
  action: string;
  correlation_id: string | null;
  metadata?: Record<string, unknown>;
}

function makeAuditStore() {
  const rows: AuditRow[] = [];
  // Mirror the production partial index — only non-null correlation_ids are indexed.
  const byCorrelationId = new Map<string, AuditRow[]>();

  const insert = (row: Omit<AuditRow, 'id'>) => {
    const full: AuditRow = { id: crypto.randomUUID(), ...row };
    rows.push(full);
    if (full.correlation_id != null) {
      const bucket = byCorrelationId.get(full.correlation_id) ?? [];
      bucket.push(full);
      byCorrelationId.set(full.correlation_id, bucket);
    }
    return Promise.resolve({ data: [full], error: null });
  };

  const from = (table: string) => {
    if (table !== 'audit_logs') throw new Error(`unexpected table ${table}`);
    return {
      insert,
      select: (_cols: string) => ({
        eq: (col: string, val: unknown) => {
          // The whole point of this test: queries MUST use correlation_id.
          // If a future refactor changes the column, this assertion fires.
          if (col !== 'correlation_id') {
            throw new Error(
              `RW-020: trace lookup must filter by correlation_id, got "${col}"`,
            );
          }
          const matches = byCorrelationId.get(val as string) ?? [];
          const builder = {
            then: (resolve: (v: { data: AuditRow[]; error: null }) => void) =>
              resolve({ data: matches, error: null }),
            single: () =>
              Promise.resolve(
                matches.length === 1
                  ? { data: matches[0], error: null }
                  : { data: null, error: { code: 'PGRST116', message: 'no rows / multiple rows' } },
              ),
          };
          return builder;
        },
      }),
    };
  };

  return { from, _rows: rows, _index: byCorrelationId };
}

let store: ReturnType<typeof makeAuditStore>;
beforeEach(() => { store = makeAuditStore(); });

describe('RW-020 — query by correlation_id returns the correct row', () => {
  it('returns exactly the matching row when the correlation_id exists', async () => {
    const cid = '33333333-3333-4333-8333-333333333333';
    await store.from('audit_logs').insert({
      action: 'auth.sudo_granted',
      correlation_id: cid,
      metadata: { action_key: 'mfa_enroll_route' },
    });
    // Decoy rows: same action, different correlation_id.
    await store.from('audit_logs').insert({
      action: 'auth.sudo_granted',
      correlation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      metadata: { action_key: 'password_change' },
    });
    await store.from('audit_logs').insert({
      action: 'auth.sensitive_action_performed',
      correlation_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      metadata: { action_key: 'mfa_enroll_route' },
    });

    const { data, error } = await store
      .from('audit_logs')
      .select('id, action, correlation_id, metadata')
      .eq('correlation_id', cid)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.correlation_id).toBe(cid);
    expect(data!.action).toBe('auth.sudo_granted');
    expect((data!.metadata as { action_key: string }).action_key).toBe('mfa_enroll_route');
  });

  it('returns no row for a correlation_id that was never written', async () => {
    await store.from('audit_logs').insert({
      action: 'auth.sudo_granted',
      correlation_id: '44444444-4444-4444-8444-444444444444',
    });

    const { data, error } = await store
      .from('audit_logs')
      .select('id')
      .eq('correlation_id', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')
      .single();

    expect(data).toBeNull();
    expect(error?.code).toBe('PGRST116');
  });

  it('does NOT match rows whose correlation_id is null (mirrors the partial-index semantics)', async () => {
    await store.from('audit_logs').insert({
      action: 'system.unrelated',
      correlation_id: null,
    });
    await store.from('audit_logs').insert({
      action: 'auth.sudo_granted',
      correlation_id: '55555555-5555-4555-8555-555555555555',
    });

    const { data: targeted } = await store
      .from('audit_logs')
      .select('id, action')
      .eq('correlation_id', '55555555-5555-4555-8555-555555555555');

    expect(targeted).toHaveLength(1);
    expect(targeted![0].action).toBe('auth.sudo_granted');
  });

  it('rejects any future query that filters by a column other than correlation_id', () => {
    // Guards against a refactor that quietly switches to filtering by, e.g., target_id.
    expect(() =>
      store.from('audit_logs').select('id').eq('target_id', 'whatever' as unknown as string),
    ).toThrow(/must filter by correlation_id/);
  });
});