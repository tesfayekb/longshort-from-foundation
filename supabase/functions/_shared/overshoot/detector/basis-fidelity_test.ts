// @ts-nocheck — Deno integration test.
//
// FP-069 W3.4.b (ACT-461.b) — basis-fidelity parity gate.
//
// Contract (record verbatim):
//   (1) REUSE the runner's exact pipeline: import EVENT_DETECTION_SQL
//       unmodified from `_shared/overshoot/study/event-detection.sql.ts`,
//       apply `stripStatementBody(...)` then `bindNamed(..., DETECTION_PARAM_ORDER)`
//       with the runner's `$N` positional shape (byte-identical to
//       overshoot-study-run/index.ts:323 / :404 / :461, minus the INSERT verb).
//       Bind values come from the ORIGINAL run's persisted provenance
//       (`overshoot_study_runs` row for `1888e113-…`) — replay determinism,
//       NOT current-state reads.
//
//   (2) IDENTICAL canonical serializer: column order = fixture header
//       `column_order`; row order = fixture header `row_ordering`
//       (ticker ASC, side ASC, window_days ASC, alias_used ASC NULLS FIRST,
//       move_pct ASC); NULL rendering = JSON `null` (from Postgres
//       `row_to_json`); numeric verbatim. sha256(body) is asserted equal
//       to the fixture header `sha256_body`. NO TOLERANCE anywhere;
//       mismatch dumps the per-row diff and hard-fails the test.
//
//   (3) CI-safety: the DB-executing tests are ENV-GATED per the sibling
//       precedent in
//       `supabase/functions/_shared/longshort-signals/insider-transactions/insider-r2-concurrent-claim_test.ts`
//       line 87 (`ignore: !ENV_READY`) — an explicit `OVERSHOOT_PARITY_LIVE=1`
//       opt-in plus `SUPABASE_DB_URL` presence. The file also carries
//       NON-gated pure tests exercising harness logic so CI still
//       validates the serializer determinism and header-parse contract.
//
//   (4) Run+hash immutability pre-check (boot-assertion landing early):
//       BEFORE parity, assert `overshoot_study_runs` still holds run
//       `1888e113-f9b3-43f5-856c-d91666a3c121` with `param_grid_hash`
//       prefix `a37e4b96…`. Typed hard-fail with reason if not — a run
//       row that has been mutated invalidates the fixture provenance
//       and the gate MUST refuse before running.
//
// STOP rule (executed by the operator, not the test): any MISMATCH → paste
// per-row diff + halt; NO fixture edits, NO tolerance widening.

import 'https://deno.land/std@0.224.0/dotenv/load.ts';
import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

// Kernel imported UNMODIFIED — single source of truth for query text.
import EVENT_DETECTION_SQL from '../study/event-detection.sql.ts';

// ─── Runner-parity pipeline (byte-identical mirror of the runner) ─────
// These two helpers are structural copies of
// overshoot-study-run/index.ts:89 (stripStatementBody) and :116 (bindNamed).
// They are copied — not imported — because the runner file binds
// `Deno.serve(...)` at module top level, which leaks an unclosed listener
// under Gate 11's full-execution shape. Any drift between these copies
// and the runner's originals is caught by the runner's own
// `index_test.ts` invariants (assertions on the stripStatementBody /
// bindNamed regex shapes).
function stripStatementBody(sql: string): string {
  let s = sql;
  for (;;) {
    const before = s;
    s = s.replace(/\s+$/, '');
    s = s.replace(/(^|\n)[ \t]*--[^\n]*$/, '');
    s = s.replace(/;\s*$/, '');
    if (s === before) return s;
  }
}
function bindNamed(sql: string, names: readonly string[]): string {
  let out = sql;
  names.forEach((n, i) => {
    const re = new RegExp(`:${n}\\b`, 'g');
    out = out.replace(re, `$${i + 1}`);
  });
  return out;
}
const DETECTION_PARAM_ORDER = [
  'run_id',
  'bars_snapshot_max_date',
  'earnings_snapshot_max_date',
  'min_band_bps',
  'lookback_min_date',
  'event_date_min',
  'event_date_max',
] as const;

// ─── Provenance (frozen from the ratified run row) ────────────────────
// Read (once, ACT-461.a) from overshoot_study_runs where
// run_id = '1888e113-f9b3-43f5-856c-d91666a3c121':
//   bars_snapshot_max_date        = 2026-07-02
//   earnings_snapshot_max_date    = 2026-07-02
//   param_grid_hash               = a37e4b963c0ff13f0962e231b6322d11f1210df44812cdd24dcf06e66f354e80
// Runner defaults hashed into param_grid_hash:
//   min_band_bps                  = 300
// Derived (immutable modulo overshoot_daily_bars historical shrinkage,
// which is architecturally forbidden — MIN(trade_date) is stable):
//   lookback_min_date             = MIN(trade_date) + 252 = 2022-03-08
//
// If bars retention or the run row is mutated, the boot-assertion below
// hard-fails BEFORE parity runs.
const PROVENANCE = {
  run_id: '1888e113-f9b3-43f5-856c-d91666a3c121',
  bars_snapshot_max_date: '2026-07-02',
  earnings_snapshot_max_date: '2026-07-02',
  min_band_bps: 300,
  lookback_min_date: '2022-03-08',
  param_grid_hash_prefix: 'a37e4b96',
} as const;

// Fixture files (frozen — FP-069 W3.4.a, rule β).
const FIXTURE_DIR = new URL('./fixtures/', import.meta.url);
const FIXTURE_DAYS = ['2022-05-24', '2024-05-02', '2026-04-15'] as const;

// ─── Env gate (sibling precedent: insider-r2-concurrent-claim_test.ts:87) ─
const DB_URL = Deno.env.get('SUPABASE_DB_URL') ?? '';
const LIVE_OPT_IN = Deno.env.get('OVERSHOOT_PARITY_LIVE') === '1';
const ENV_READY = LIVE_OPT_IN && DB_URL.length > 0;

// ─── Header parser (pure — no DB) ─────────────────────────────────────
interface FixtureHeader {
  run_id: string;
  capture_head_sha: string | null;
  column_order: string[];
  rows: number;
  sha256_body: string;
}
export function parseFixtureHeader(text: string): { header: FixtureHeader; bodyStart: number } {
  const lines = text.split('\n');
  const h: Partial<FixtureHeader> = { capture_head_sha: null };
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l === '# ---') { bodyStart = i + 1; break; }
    if (!l.startsWith('# ')) continue;
    const body = l.slice(2);
    const kv = body.match(/^(\w[\w_]*):\s*(.+?)\s*(?:\((.*)\))?$/);
    if (!kv) continue;
    const [, k, v] = kv;
    if (k === 'run_id') h.run_id = v.trim();
    else if (k === 'capture_head_sha') h.capture_head_sha = v.trim();
    else if (k === 'column_order') h.column_order = v.trim().split(',');
    else if (k === 'rows') h.rows = Number(v.trim());
    else if (k === 'sha256_body') h.sha256_body = v.trim();
  }
  if (!h.run_id || !h.column_order || h.rows === undefined || !h.sha256_body) {
    throw new Error('fixture_header_incomplete');
  }
  return { header: h as FixtureHeader, bodyStart };
}

// ─── Canonical serializer (pure) ──────────────────────────────────────
// Rows arrive as {r: string} where r is the Postgres row_to_json text
// (numeric verbatim, JSON null). Body = join('\n') + '\n'. sha256(UTF-8).
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function canonicalBody(rowTexts: readonly string[]): string {
  return rowTexts.join('\n') + '\n';
}

// ═══════════════════════════════════════════════════════════════════════
// Pure (non-gated) tests — CI runs these ALWAYS.
// ═══════════════════════════════════════════════════════════════════════

Deno.test('bindNamed/stripStatementBody produce the runner-shaped detection core', () => {
  const core = bindNamed(stripStatementBody(EVENT_DETECTION_SQL), DETECTION_PARAM_ORDER);
  // $1..$7 present, :name markers gone, ::date/::numeric preserved.
  for (let i = 1; i <= DETECTION_PARAM_ORDER.length; i++) assertStringIncludes(core, `$${i}`);
  assert(!/:run_id\b/.test(core), 'run_id placeholder must be substituted');
  assert(!/:event_date_max\b/.test(core), 'event_date_max placeholder must be substituted');
  assertStringIncludes(core, '::date');
  assertStringIncludes(core, '::numeric');
});

Deno.test('canonicalBody serializer — deterministic on synthetic rows with NULL and negative-numeric', async () => {
  // Mirrors Postgres row_to_json output shape: numeric verbatim, JSON null.
  const rows = [
    '{"ticker":"AAA","move_pct":-0.09485086739037888463,"alias_used":null,"momentum_quintile":null}',
    '{"ticker":"BBB","move_pct":0.04614590931758833950,"alias_used":"BRK.A","momentum_quintile":3}',
  ];
  const body = canonicalBody(rows);
  assertEquals(body.endsWith('\n'), true, 'trailing LF required');
  assertEquals(body.split('\n').length, 3, 'two rows + trailing empty split');
  // Bit-stable across two invocations.
  const a = await sha256Hex(new TextEncoder().encode(body));
  const b = await sha256Hex(new TextEncoder().encode(canonicalBody(rows)));
  assertEquals(a, b);
  // Sensitive to negative-sign preservation.
  const alt = rows.map((r) => r.replace('-0.09485086739037888463', '0.09485086739037888463'));
  const c = await sha256Hex(new TextEncoder().encode(canonicalBody(alt)));
  assert(a !== c, 'sign flip MUST change the digest — no tolerance');
  // Sensitive to NULL → 0 substitution.
  const zeroed = rows.map((r) => r.replace('"momentum_quintile":null', '"momentum_quintile":0'));
  const d = await sha256Hex(new TextEncoder().encode(canonicalBody(zeroed)));
  assert(a !== d, 'NULL→0 substitution MUST change the digest');
});

Deno.test('parseFixtureHeader — extracts run_id / column_order / rows / sha256_body from each fixture', async () => {
  for (const day of FIXTURE_DAYS) {
    const path = new URL(`${day}.jsonl`, FIXTURE_DIR);
    const text = await Deno.readTextFile(path);
    const { header } = parseFixtureHeader(text);
    assertEquals(header.run_id, PROVENANCE.run_id, `${day}: run_id must match provenance`);
    assertEquals(header.column_order.length, 18, `${day}: 18 kernel columns`);
    assertEquals(header.column_order[0], 'run_id');
    assertEquals(header.column_order[17], 'fwd_return_20d');
    assert(/^[0-9a-f]{64}$/.test(header.sha256_body), `${day}: sha256 hex`);
    assert(header.rows > 0);
  }
});

Deno.test('fixture body byte-integrity — recomputed sha256 equals header sha256_body', async () => {
  for (const day of FIXTURE_DAYS) {
    const path = new URL(`${day}.jsonl`, FIXTURE_DIR);
    const text = await Deno.readTextFile(path);
    const { header, bodyStart } = parseFixtureHeader(text);
    const bodyLines = text.split('\n').slice(bodyStart);
    // Drop the trailing empty element from the final LF split.
    if (bodyLines[bodyLines.length - 1] === '') bodyLines.pop();
    assertEquals(bodyLines.length, header.rows, `${day}: body line count = header.rows`);
    const computed = await sha256Hex(new TextEncoder().encode(canonicalBody(bodyLines)));
    assertEquals(computed, header.sha256_body, `${day}: fixture on-disk bytes must hash to header sha256_body`);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// LIVE parity tests — env-gated (sibling: insider-r2-concurrent-claim_test.ts:87).
// ═══════════════════════════════════════════════════════════════════════

async function runLiveParity(day: string): Promise<{ n: number; sha256: string; ms: number }> {
  const sql = postgres(DB_URL, { max: 1, prepare: false, connect_timeout: 10 });
  try {
    const detectionCore = bindNamed(stripStatementBody(EVENT_DETECTION_SQL), DETECTION_PARAM_ORDER);
    // Wrap-shape mirrors runner :404/:461 minus the INSERT verb:
    //   runner:      INSERT INTO overshoot_study_candidate_events (cols) ${detectionCore}
    //   parity:      WITH detection AS (${detectionCore}) SELECT row_to_json(t)::text AS r
    //                FROM (SELECT <cols> FROM detection) t ORDER BY <fixture row_ordering>
    // Column list = fixture header column_order verbatim.
    const wrapped = `
      WITH detection AS (${detectionCore}),
      src AS (
        SELECT (row_to_json(t))::text AS r,
          row_number() OVER (ORDER BY t.ticker ASC, t.side ASC, t.window_days ASC, t.alias_used ASC NULLS FIRST, t.move_pct ASC) AS rn
        FROM (
          SELECT run_id, ticker, event_date, side, move_pct, window_days,
                 excess_w1, excess_w2, excess_w3, excess_w4, excess_w5,
                 momentum_quintile, drawdown_bucket, days_to_nearest_earnings,
                 alias_used, fwd_return_1d, fwd_return_5d, fwd_return_20d
          FROM detection
        ) t
      )
      SELECT count(*)::int AS n,
             string_agg(r, chr(10) ORDER BY rn) || chr(10) AS body_text
      FROM src
    `;
    const t0 = performance.now();
    const [row] = await sql.unsafe(wrapped, [
      PROVENANCE.run_id,
      PROVENANCE.bars_snapshot_max_date,
      PROVENANCE.earnings_snapshot_max_date,
      PROVENANCE.min_band_bps,
      PROVENANCE.lookback_min_date,
      day,
      day,
    ]);
    const ms = Math.round(performance.now() - t0);
    const sha256 = await sha256Hex(new TextEncoder().encode(row.body_text));
    return { n: row.n, sha256, ms };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

Deno.test({
  name: 'LIVE — run+hash immutability pre-check (boot assertion)',
  ignore: !ENV_READY,
  fn: async () => {
    const sql = postgres(DB_URL, { max: 1, prepare: false, connect_timeout: 10 });
    try {
      const [row] = await sql`
        SELECT run_id::text AS run_id, param_grid_hash
          FROM overshoot_study_runs
         WHERE run_id = ${PROVENANCE.run_id}::uuid
      `;
      if (!row) throw new Error(`immutability_precheck_failed: run ${PROVENANCE.run_id} not found`);
      if (!row.param_grid_hash.startsWith(PROVENANCE.param_grid_hash_prefix)) {
        throw new Error(
          `immutability_precheck_failed: param_grid_hash mismatch (` +
            `got=${row.param_grid_hash} expected_prefix=${PROVENANCE.param_grid_hash_prefix}…)`,
        );
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  },
});

for (const day of FIXTURE_DAYS) {
  Deno.test({
    name: `LIVE — basis-fidelity parity for ${day} (byte-exact vs fixture, NO tolerance)`,
    ignore: !ENV_READY,
    fn: async () => {
      const path = new URL(`${day}.jsonl`, FIXTURE_DIR);
      const text = await Deno.readTextFile(path);
      const { header } = parseFixtureHeader(text);
      const live = await runLiveParity(day);
      console.log(
        `  parity ${day}: rows=${live.n} sha256=${live.sha256} wall=${live.ms}ms ` +
          `expected_rows=${header.rows} expected_sha256=${header.sha256_body} ` +
          `${live.sha256 === header.sha256_body && live.n === header.rows ? 'MATCH' : 'MISMATCH'}`,
      );
      // Row-count parity (a cheaper first-cut assertion).
      assertEquals(live.n, header.rows, `${day}: row count mismatch — fixture=${header.rows} live=${live.n}`);
      // Byte-exact sha256 parity — the gate. No tolerance, no widening.
      if (live.sha256 !== header.sha256_body) {
        // Per-row diff dump for the STOP report (fixture vs live body).
        const wanted = text.split('\n').slice(text.split('\n').findIndex((l) => l === '# ---') + 1).filter(Boolean);
        // Re-fetch body_text for diff — bounded to the first few divergences.
        const sql = postgres(DB_URL, { max: 1, prepare: false, connect_timeout: 10 });
        try {
          const detectionCore = bindNamed(stripStatementBody(EVENT_DETECTION_SQL), DETECTION_PARAM_ORDER);
          const [row] = await sql.unsafe(
            `WITH detection AS (${detectionCore}),
             src AS (SELECT (row_to_json(t))::text AS r, row_number() OVER (ORDER BY t.ticker, t.side, t.window_days, t.alias_used NULLS FIRST, t.move_pct) AS rn
                     FROM (SELECT run_id, ticker, event_date, side, move_pct, window_days, excess_w1, excess_w2, excess_w3, excess_w4, excess_w5, momentum_quintile, drawdown_bucket, days_to_nearest_earnings, alias_used, fwd_return_1d, fwd_return_5d, fwd_return_20d FROM detection) t)
             SELECT string_agg(r, chr(10) ORDER BY rn) || chr(10) AS body_text FROM src`,
            [PROVENANCE.run_id, PROVENANCE.bars_snapshot_max_date, PROVENANCE.earnings_snapshot_max_date, PROVENANCE.min_band_bps, PROVENANCE.lookback_min_date, day, day],
          );
          const got = row.body_text.split('\n').filter(Boolean);
          const maxDiffs = 5;
          const diffs: string[] = [];
          const nMax = Math.max(wanted.length, got.length);
          for (let i = 0; i < nMax && diffs.length < maxDiffs; i++) {
            if (wanted[i] !== got[i]) diffs.push(`  #${i + 1}\n    - fixture: ${wanted[i] ?? '(none)'}\n    + live   : ${got[i] ?? '(none)'}`);
          }
          throw new Error(
            `basis_fidelity_MISMATCH ${day}: sha256 fixture=${header.sha256_body} live=${live.sha256}\n` +
              `first-${diffs.length} diffs:\n${diffs.join('\n')}\n` +
              `STOP: root-cause turn required; no fixture edit, no tolerance widening.`,
          );
        } finally {
          await sql.end({ timeout: 5 });
        }
      }
    },
  });
}