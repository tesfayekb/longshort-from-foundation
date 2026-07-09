// @ts-nocheck — Deno offline parity harness.
//
// FP-069 W3.8 T2.2 (ACT-479) — SELECTION-SURFACE parity gate under
// RATIFIED_DETECTOR_VERSION b7cdfcd8.
//
// FULLY OFFLINE by construction (per operator T2.2 STOP adjudication):
//   * runDetector() is pure (W3.4 ratified design).
//   * kernel fixtures ARE the per-date candidate inputs.
//   * study cells + SI snapshots are committed as INPUT fixtures under
//     fixtures/overshoot-detector-selection/inputs/<date>/.
//   * Detector params are the current runtime constants; a runtime drift
//     changes the constants → changes selection output → sha256 diverges
//     → this test fails byte-exact. That is the whole point.
//
// No env gate. Runs on every `deno test` invocation. Regeneration mode
// (`OVERSHOOT_REGEN_SELECTION_FIXTURES=1`) writes fixture bytes to disk
// instead of asserting — used ONCE at capture, then never in CI.
//
// SI DISPOSITION per date (physical evidence, recorded verbatim in each
// si-input.jsonl header — see honesty note there):
//   2022-05-24 → EMPTY map (commons began 2026-03-13; 0 rows ≤ date).
//   2024-05-02 → EMPTY map (same).
//   2026-04-15 → 839 rows, freshness=0d, 7 typed-null si_pct_float.

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  runDetector,
  RATIFIED_DETECTOR_VERSION,
  type DetectorInput,
  type DetectorParams,
  type KernelCandidateRow,
  type ShortInterestRow,
  type Side,
  type StudyCellKey,
  type StudyCellStats,
} from './detector.ts';
import { bandLabelFor } from './band-label.ts';

const FIXTURE_DIR = new URL('../../../../../fixtures/overshoot-detector-selection/', import.meta.url);
const KERNEL_FIXTURE_DIR = new URL('../../../../../fixtures/overshoot-detector/', import.meta.url);
const DATES = ['2022-05-24', '2024-05-02', '2026-04-15'] as const;

// Ratified live-runtime params (verbatim mirror of overshoot-detection-run
// constants — a drift here relative to that handler is caught by the
// separation guard + a future T2.3 shared-constants extraction).
// ACT-490 note: the parity domain intentionally preserves the SYMMETRIC
// cap `capacityLong=20 / capacityShort=20` (NOT the ratified deployment
// values 36/4). Rationale: these fixtures prove the detector's SELECTION
// FUNCTION is byte-identical across HEADs on a fixed snapshot; they are
// NOT deployment-behaviour proofs. The deployment shape (asymmetric 36/4)
// is exercised by the asymmetric-cap regression test in `detector_test.ts`.
// Keeping the parity cap at 20/20 lets the fixture bodies + sha256s stay
// byte-unchanged across the ACT-490 landing.
const RATIFIED_PARAMS = {
  runId: '00000000-0000-0000-0000-000000000000', // capture-only; selection output does NOT include run_id
  capacityLong: 20,
  capacityShort: 20,
  squeezeSiPctFloatMin: 0.20,
  siStalenessMaxDays: 20,
  exclusionWidthDays: 5,
  longExcessThreshold: 0.10,
  shortExcessThreshold: 0.08,
  longWindowSet: [1, 2, 3] as const,
  shortWindowSet: [1, 2, 3, 4, 5] as const,
  longMomentumSet: [4, 5] as const,
  shortMomentumSet: [1, 5] as const,
  longDrawdownSet: [1, 2, 3] as const,
  shortDrawdownSet: [4, 5] as const,
} as const;

function stripHeader(text: string): string[] {
  const lines = text.split('\n');
  const idx = lines.findIndex((l) => l === '# ---');
  if (idx < 0) throw new Error('missing_body_marker');
  const body = lines.slice(idx + 1);
  if (body.length > 0 && body[body.length - 1] === '') body.pop();
  return body;
}

async function readJsonl<T>(url: URL): Promise<T[]> {
  const text = await Deno.readTextFile(url);
  return stripHeader(text).map((l) => JSON.parse(l) as T);
}

function toUpperSide(s: string): Side {
  const u = s.toUpperCase();
  if (u !== 'LONG' && u !== 'SHORT') throw new Error(`bad_side:${s}`);
  return u;
}

interface KernelFixtureRow {
  run_id: string; ticker: string; event_date: string; side: string;
  move_pct: number; window_days: number;
  excess_w1: number | null; excess_w2: number | null; excess_w3: number | null;
  excess_w4: number | null; excess_w5: number | null;
  momentum_quintile: number | null; drawdown_bucket: number | null;
  days_to_nearest_earnings: number | null; alias_used: string | null;
  fwd_return_1d: number | null; fwd_return_5d: number | null; fwd_return_20d: number | null;
}
interface CellInputRow {
  side: string; band: string; window_days: number;
  momentum_quintile: number; drawdown_bucket: number; exclusion_width_days: number;
  mean_fwd_return_5d: number | null; arrival_count: number;
}
interface SiInputRow {
  ticker: string; as_of_date: string; si_pct_float: number | null; dtc: number | null;
}

async function loadInputsFor(day: string): Promise<{
  candidates: KernelCandidateRow[];
  cells: Map<string, StudyCellStats>;
  si: Map<string, ShortInterestRow>;
}> {
  const kernel = await readJsonl<KernelFixtureRow>(new URL(`${day}.jsonl`, KERNEL_FIXTURE_DIR));
  const cellsRaw = await readJsonl<CellInputRow>(new URL(`inputs/${day}/cells-input.jsonl`, FIXTURE_DIR));
  const siRaw = await readJsonl<SiInputRow>(new URL(`inputs/${day}/si-input.jsonl`, FIXTURE_DIR));

  const candidates: KernelCandidateRow[] = kernel.map((r) => ({
    run_id: r.run_id, ticker: r.ticker, event_date: r.event_date,
    side: toUpperSide(r.side),
    move_pct: r.move_pct, window_days: r.window_days,
    excess_w1: r.excess_w1, excess_w2: r.excess_w2, excess_w3: r.excess_w3,
    excess_w4: r.excess_w4, excess_w5: r.excess_w5,
    momentum_quintile: r.momentum_quintile, drawdown_bucket: r.drawdown_bucket,
    days_to_nearest_earnings: r.days_to_nearest_earnings, alias_used: r.alias_used,
  }));

  const cells = new Map<string, StudyCellStats>();
  for (const c of cellsRaw) {
    const key = `${c.side.toUpperCase()}|${c.band}|${c.window_days}|${c.momentum_quintile}|${c.drawdown_bucket}|${c.exclusion_width_days}`;
    cells.set(key, { mean_fwd_return_5d: c.mean_fwd_return_5d, arrival_count: c.arrival_count });
  }

  const si = new Map<string, ShortInterestRow>();
  for (const s of siRaw) {
    si.set(s.ticker, { ticker: s.ticker, as_of_date: s.as_of_date, si_pct_float: s.si_pct_float, dtc: s.dtc });
  }
  return { candidates, cells, si };
}

function buildParams(asOf: string, cells: Map<string, StudyCellStats>): DetectorParams {
  return {
    runId: RATIFIED_PARAMS.runId,
    asOf,
    capacityLong: RATIFIED_PARAMS.capacityLong,
    capacityShort: RATIFIED_PARAMS.capacityShort,
    squeezeSiPctFloatMin: RATIFIED_PARAMS.squeezeSiPctFloatMin,
    siStalenessMaxDays: RATIFIED_PARAMS.siStalenessMaxDays,
    exclusionWidthDays: RATIFIED_PARAMS.exclusionWidthDays,
    longExcessThreshold: RATIFIED_PARAMS.longExcessThreshold,
    shortExcessThreshold: RATIFIED_PARAMS.shortExcessThreshold,
    longWindowSet: RATIFIED_PARAMS.longWindowSet,
    shortWindowSet: RATIFIED_PARAMS.shortWindowSet,
    longMomentumSet: RATIFIED_PARAMS.longMomentumSet,
    shortMomentumSet: RATIFIED_PARAMS.shortMomentumSet,
    longDrawdownSet: RATIFIED_PARAMS.longDrawdownSet,
    shortDrawdownSet: RATIFIED_PARAMS.shortDrawdownSet,
    bandLabelFor,
    studyCellLookup: (k: StudyCellKey) => {
      const key = `${k.side}|${k.band}|${k.window_days}|${k.momentum_quintile}|${k.drawdown_bucket}|${k.exclusion_width_days}`;
      return cells.get(key) ?? null;
    },
  };
}

// Canonical selection row — columns in operator-ratified order.
function serializeEvent(e: ReturnType<typeof runDetector>[number]): string {
  const argmax = e.argmax_window_days;
  let argmax_excess: number | null = null;
  if (argmax === 1) argmax_excess = e.excess_w1;
  else if (argmax === 2) argmax_excess = e.excess_w2;
  else if (argmax === 3) argmax_excess = e.excess_w3;
  else if (argmax === 4) argmax_excess = e.excess_w4;
  else if (argmax === 5) argmax_excess = e.excess_w5;
  return JSON.stringify({
    ticker: e.ticker,
    side: e.side,
    tier: e.tier,
    rank_score: e.rank_score,
    study_cell_ref: e.study_cell_ref,
    selected_for_entry: e.selected_for_entry,
    filter_refusal_reason: e.filter_refusal_reason,
    argmax_window_days: argmax,
    argmax_excess,
  });
}

// Row ordering: side ASC, tier ASC NULLS LAST, rank_score DESC (NULLS LAST), ticker ASC.
function sortEvents(a: any, b: any): number {
  if (a.side !== b.side) return a.side < b.side ? -1 : 1;
  const tierRank = (t: 'T1' | 'T2' | null): number => (t === 'T1' ? 0 : t === 'T2' ? 1 : 2);
  const tr = tierRank(a.tier) - tierRank(b.tier);
  if (tr !== 0) return tr;
  const ar = a.rank_score === null ? -Infinity : a.rank_score;
  const br = b.rank_score === null ? -Infinity : b.rank_score;
  if (ar !== br) return br - ar;
  return a.ticker < b.ticker ? -1 : 1;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEnv(k: string): string | undefined {
  try { return Deno.env.get(k); } catch { return undefined; }
}

async function readCaptureHeadSha(): Promise<string> {
  // Read from the cells-input header — every fixture in this tranche was
  // captured off the same HEAD. Falls back to a placeholder if absent.
  const p = new URL('inputs/2026-04-15/cells-input.jsonl', FIXTURE_DIR);
  const t = await Deno.readTextFile(p);
  const m = t.match(/# capture_head_sha:\s*([0-9a-f]{40})/);
  return m ? m[1] : 'unknown';
}

// Predicate v2 sha256 — captured constant (recomputed at boot in T2.4).
const PREDICATE_SPEC_V2_SHA256 = '766c996d88e439f370f5ff34356505818f6b6671d590e2f99d32418ebca7a573';

for (const day of DATES) {
  Deno.test(`selection-parity — ${day} (OFFLINE, byte-exact, no tolerance)`, async () => {
    const { candidates, cells, si } = await loadInputsFor(day);
    const params = buildParams(day, cells);
    const events = runDetector({ candidates, shortInterest: si, params });
    events.sort(sortEvents);
    const body = events.map(serializeEvent).join('\n') + '\n';
    const sha = await sha256Hex(new TextEncoder().encode(body));

    const nLongT1 = events.filter((e) => e.side === 'LONG' && e.tier === 'T1').length;
    const nLongT2 = events.filter((e) => e.side === 'LONG' && e.tier === 'T2').length;
    const nShort = events.filter((e) => e.side === 'SHORT').length;
    const nSelected = events.filter((e) => e.selected_for_entry).length;

    const regen = safeEnv('OVERSHOOT_REGEN_SELECTION_FIXTURES') === '1';
    const outPath = new URL(`${day}.jsonl`, FIXTURE_DIR);

    if (regen) {
      const headSha = await readCaptureHeadSha();
      const siHdr =
        day === '2026-04-15'
          ? 'live_snapshot (839 rows @ as_of=2026-04-15, freshness=0d)'
          : 'empty_map (commons began 2026-03-13; 0 rows ≤ date)';
      const header =
        `# FP-069 W3.8 T2.2 (ACT-479) — selection-surface parity fixture — ${day}\n` +
        `# detector_version_prefix: ${RATIFIED_DETECTOR_VERSION}\n` +
        `# predicate_spec_v2_sha256: ${PREDICATE_SPEC_V2_SHA256}\n` +
        `# capture_head_sha: ${headSha}\n` +
        `# si_disposition: ${siHdr}\n` +
        `# input_provenance:\n` +
        `#   kernel_fixture: fixtures/overshoot-detector/${day}.jsonl\n` +
        `#   cells_input: fixtures/overshoot-detector-selection/inputs/${day}/cells-input.jsonl\n` +
        `#   si_input: fixtures/overshoot-detector-selection/inputs/${day}/si-input.jsonl\n` +
        `# detector_params_verbatim: capacityLong=20, capacityShort=20, squeezeSiPctFloatMin=0.20, ` +
        `siStalenessMaxDays=20, exclusionWidthDays=5, longExcessThreshold=0.10, ` +
        `shortExcessThreshold=0.08, longWindowSet=[1,2,3], shortWindowSet=[1,2,3,4,5], ` +
        `longMomentumSet=[4,5], shortMomentumSet=[1,5], longDrawdownSet=[1,2,3], shortDrawdownSet=[4,5]\n` +
        `# column_order: ticker,side,tier,rank_score,study_cell_ref,selected_for_entry,filter_refusal_reason,argmax_window_days,argmax_excess\n` +
        `# null_representation: JSON null\n` +
        `# row_ordering: (side ASC, tier ASC NULLS LAST, rank_score DESC NULLS LAST, ticker ASC)\n` +
        `# tier_counts: LONG_T1=${nLongT1} LONG_T2=${nLongT2} SHORT=${nShort} selected=${nSelected}\n` +
        `# rows: ${events.length}\n` +
        `# sha256_body: ${sha}\n` +
        `# ---\n`;
      await Deno.writeTextFile(outPath, header + body);
      console.log(`  [regen] ${day}: rows=${events.length} sha256=${sha} T1=${nLongT1} T2=${nLongT2} SHORT=${nShort} selected=${nSelected}`);
      return;
    }

    const text = await Deno.readTextFile(outPath);
    const lines = text.split('\n');
    const bodyStart = lines.findIndex((l) => l === '# ---') + 1;
    const bodyLines = lines.slice(bodyStart);
    if (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === '') bodyLines.pop();
    const fixtureBody = bodyLines.join('\n') + '\n';
    const fixtureSha = await sha256Hex(new TextEncoder().encode(fixtureBody));
    const hdrShaMatch = text.match(/# sha256_body:\s*([0-9a-f]{64})/);
    assert(hdrShaMatch, `${day}: fixture header missing sha256_body`);
    assertEquals(fixtureSha, hdrShaMatch![1], `${day}: fixture bytes vs header sha256`);
    assertEquals(sha, fixtureSha, `${day}: recomputed selection sha256 vs fixture bytes`);
    console.log(`  ${day}: rows=${events.length} sha256=${sha} T1=${nLongT1} T2=${nLongT2} SHORT=${nShort} selected=${nSelected} MATCH`);
  });
}

Deno.test('selection-parity — RATIFIED_DETECTOR_VERSION frozen at b7cdfcd8', () => {
  assertEquals(RATIFIED_DETECTOR_VERSION, 'b7cdfcd8');
});