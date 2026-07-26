// ACT-515 Matrix — R1 RECEIPT RUNNER (executes 1x-const, 2x-const, 2x-comp
// over the sealed Turn-2B cache via the session-walk orchestrator).
//
// RULING 2026-07-26 (RECEIPT TURN):
//   Standing grammar per turn:
//     · `SELECT now();` timestamp
//     · CAVEAT BLOCK (verbatim)
//     · INVOCATION + COUNTS  (with cap-bind telemetry appended)
//     · THE VERDICT ROW      (config-matrix.md columns)
//     · TERMINAL IDENTITY    (asserted within DISCLOSED envelope
//       |Δ| ≤ lots_count cents — see haircut-mode disclosure below)
//     · EQUITY-SHAPE NOTES
//
// HAIRCUT-MODE DISCLOSURE (PIN, this turn):
//   The receipts run haircutMode='study' (the frozen matrix basis). Under
//   study-mode, the per-lot post-haircut price is rounded to the nearest
//   cent BEFORE settleProceeds, so the ledger-foot identity
//     ending_equity = starting_equity + Σ realized
//   is asserted within a disclosed envelope of |Δ| ≤ lots_count cents
//   (one cent per lot round-trip is the worst-case rounding accumulation
//   under the settle-cents path). The exact drift is printed.
//   The cent-EXACT identity stands proven by the 'none'-mode tests:
//     · scripts/act-515/matrix/orchestrator_test.ts::TEST 1
//       "LONG cap BINDS + ledger foot invariant" — uses haircutMode='none'
//       and asserts equity(t) − equity(t−1) === realizedToday + Δunrealized
//       − carryToday per session, cent-exact, across the ≥4-session walk.
//   Any drift > envelope = STOP (the runner exits non-zero, no receipt).
//
// SCOPE FENCE: zero kernel edits; readonly imports from ../kernel/*.
// ANTI-PHANTOM: no wall-clock in decision/kernel path. The receipt header
// prints a wall-clock via Date().toISOString() in the RECEIPT WRITER only
// (mirrors the `SELECT now();` DB stamp the ruling requires); this
// timestamp does not influence any admit/mark/exit/equity number.

import { FixedClock, type SessionDate } from '../kernel/clock.ts';
import { ArraySessionCalendar } from '../kernel/exit.ts';
import { MapBarSource } from '../kernel/mark.ts';
import { price, type Price, type SideDb } from '../kernel/types.ts';
import {
  SIZING_VARIANTS, KERNEL_CONST_BASE_EQUITY_USD, type SizingVariantId,
} from '../kernel/size.ts';
import {
  runOrchestrator, type CompositeBarSource, type OrchestratorResult,
  type OrchestratorRow, type CapBindTelemetry,
} from './orchestrator.ts';
import {
  entryOffsetForSideTier, type CorpusCandidateRow, type CellMapLookup,
} from './reconstructor.ts';
import { parseSlateLine, type SlateRow } from './turn2b/slate-row.ts';
import {
  CACHE_SHAS, CACHE_ROW_COUNTS, MATRIX_EXPORT_FN_VERSION,
  CORPUS_RUN_ID, CELLMAP_RUN_ID, SLATE_ROW_TOTAL, UNIVERSE_BOUND,
} from './cache-shas.ts';

// ── Config ───────────────────────────────────────────────────────────────
const CACHE_DIR = 'scripts/act-515/matrix/cache/';
const SLATE_YEARS = [2022, 2023, 2024, 2025, 2026] as const;
const WINDOW_START: SessionDate = '2022-06-29';
const WINDOW_END:   SessionDate = '2026-07-10';
const WALLET_CAPS = { long: 0.90, short: 0.10 } as const;
const BUDGETS = { k: 5, shortDailyBudget: 5 } as const;
const RECEIPT_CLOCK_MS = 1_704_000_000_000; // FixedClock — deterministic.

// ── I/O helpers ──────────────────────────────────────────────────────────
async function readLines(path: string): Promise<string[]> {
  const t = await Deno.readTextFile(path);
  return t.split('\n').filter(l => l.length > 0);
}

async function loadCalendar(): Promise<SessionDate[]> {
  const out: SessionDate[] = [];
  for (const l of await readLines(`${CACHE_DIR}calendar.jsonl`)) {
    const r = JSON.parse(l) as { session: string };
    if (r.session >= WINDOW_START && r.session <= WINDOW_END) out.push(r.session);
  }
  out.sort();
  return out;
}

async function loadCellMap(): Promise<CellMapLookup> {
  const m = new Map<string, number>();
  for (const l of await readLines(`${CACHE_DIR}cellmap.jsonl`)) {
    const r = JSON.parse(l) as Record<string, unknown>;
    const k = [
      r.side, r.band, Number(r.window_days), Number(r.momentum_quintile),
      Number(r.drawdown_bucket), Number(r.exclusion_width_days),
    ].join('/');
    m.set(k, Number(r.mean_fwd_return_5d));
  }
  return (k) => m.get(
    `${k.side}/${k.band}/${k.argmaxWindowDays}/${k.magnitudeQuintile}/${k.drawdownBucket}/${k.exclusionHorizonDays}`,
  ) ?? null;
}

function slateToCorpus(s: SlateRow): CorpusCandidateRow {
  const toN = (x: string | null): number | null => {
    if (x === null) return null;
    const n = Number(x); return Number.isFinite(n) ? n : null;
  };
  return {
    eventId: s.event_id,
    ticker: s.ticker,
    side: s.side,
    eventDate: s.session,
    windowDays: s.window_days,
    momentumQuintile: s.momentum_quintile,
    drawdownBucket: s.drawdown_bucket,
    daysToNearestEarnings: s.days_to_nearest_earnings,
    excessW1: toN(s.excess_w1), excessW2: toN(s.excess_w2),
    excessW3: toN(s.excess_w3), excessW4: toN(s.excess_w4),
    excessW5: toN(s.excess_w5),
  };
}

async function loadSlateAndBucket(
  calendar: ArraySessionCalendar,
): Promise<{
  bySession: Map<SessionDate, CorpusCandidateRow[]>;
  totalRows: number;
  bySide: { long: number; short: number };
  offCalendar: number;
}> {
  const bySession = new Map<SessionDate, CorpusCandidateRow[]>();
  let totalRows = 0;
  const bySide = { long: 0, short: 0 };
  let offCalendar = 0;
  for (const y of SLATE_YEARS) {
    for (const l of await readLines(`${CACHE_DIR}slate-${y}.jsonl`)) {
      const s = parseSlateLine(l);
      totalRows += 1;
      bySide[s.side] += 1;
      const offset = entryOffsetForSideTier(s.side, s.tier);
      const entrySession = calendar.sessionAfter(s.session, offset);
      if (entrySession === null || entrySession < WINDOW_START || entrySession > WINDOW_END) {
        offCalendar += 1; continue;
      }
      const row = slateToCorpus(s);
      const arr = bySession.get(entrySession);
      if (arr) arr.push(row); else bySession.set(entrySession, [row]);
    }
  }
  return { bySession, totalRows, bySide, offCalendar };
}

async function loadOpens(): Promise<Map<string, Price>> {
  const m = new Map<string, Price>();
  for (const l of await readLines(`${CACHE_DIR}bars-pairs.jsonl`)) {
    const r = JSON.parse(l) as { ticker: string; trade_date: string; open: string | null };
    if (r.open === null) continue;
    const n = Number(r.open);
    if (!Number.isFinite(n) || n <= 0) continue;
    m.set(MapBarSource.key(r.ticker, r.trade_date), price(n));
  }
  // INC-147 delta re-fetch — some live-walk entries reference (ticker,
  // entrySession) not covered by slate-stage bars-pairs; the delta file
  // starts at entryDate and therefore also carries the entry-open row.
  for (const l of await readLines(`${CACHE_DIR}bars-windows-delta.jsonl`)) {
    const r = JSON.parse(l) as { ticker: string; trade_date: string; open: string | null };
    if (r.open === null) continue;
    const n = Number(r.open);
    if (!Number.isFinite(n) || n <= 0) continue;
    const k = MapBarSource.key(r.ticker, r.trade_date);
    if (!m.has(k)) m.set(k, price(n));
  }
  return m;
}

async function loadCloses(): Promise<Map<string, Price>> {
  const m = new Map<string, Price>();
  for (const y of SLATE_YEARS) {
    for (const l of await readLines(`${CACHE_DIR}bars-windows-${y}.jsonl`)) {
      const r = JSON.parse(l) as { ticker: string; trade_date: string; close: string | null };
      if (r.close === null) continue;
      const n = Number(r.close);
      if (!Number.isFinite(n) || n <= 0) continue;
      m.set(MapBarSource.key(r.ticker, r.trade_date), price(n));
    }
  }
  // INC-147 delta re-fetch — 1,078 windows for live-walk lots absent from
  // slate-stage year files. SHA/rowcount pinned in cache-shas.ts.
  for (const l of await readLines(`${CACHE_DIR}bars-windows-delta.jsonl`)) {
    const r = JSON.parse(l) as { ticker: string; trade_date: string; close: string | null };
    if (r.close === null) continue;
    const n = Number(r.close);
    if (!Number.isFinite(n) || n <= 0) continue;
    const k = MapBarSource.key(r.ticker, r.trade_date);
    if (!m.has(k)) m.set(k, price(n));
  }
  return m;
}

// ── Composite bar source ─────────────────────────────────────────────────
function makeCompositeBarSource(
  opens: Map<string, Price>, closes: Map<string, Price>,
): CompositeBarSource {
  return {
    open:  (t, s) => opens.get(MapBarSource.key(t, s))  ?? null,
    close: (t, s) => closes.get(MapBarSource.key(t, s)) ?? null,
  };
}

// ── Receipt writer ───────────────────────────────────────────────────────
function fmtUsd(n: number): string {
  const s = n < 0 ? '-' : '';
  const a = Math.abs(n);
  return `${s}$${a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(x: number): string { return `${(x * 100).toFixed(2)}%`; }
function fmtInt(n: number): string { return n.toLocaleString('en-US'); }

function printCaveatBlock(): void {
  console.log('── CAVEATS ────────────────────────────────────────────────────────');
  console.log(`· Compacted-corpus basis: slate = TOP-N=25 per (event_date, side) per`);
  console.log(`  overshoot-matrix-export v=${MATRIX_EXPORT_FN_VERSION}. SHORT side pre-`);
  console.log(`  qualified in the SELECT against certified kernel geometry (DEV-V`);
  console.log(`  V-β-SCOPED). Full-corpus reconstruction out of scope for this turn.`);
  console.log(`· Survivorship bound (universe.jsonl trailer): ${UNIVERSE_BOUND.corpus_ticker_count}`);
  console.log(`  corpus tickers vs ${UNIVERSE_BOUND.active_count} active today; ${UNIVERSE_BOUND.corpus_only_count} corpus-only`);
  console.log(`  (delisted between study and receipt). Reported as bound only —`);
  console.log(`  the runner does NOT re-filter against a replay-time universe (M-1 law).`);
  console.log(`· Pacing: matrix charter runs WITHOUT DEC-084 short-daily ramp`);
  console.log(`  (shortDailyBudget = K = ${BUDGETS.k}). Binding SHORT constraints are the`);
  console.log(`  4-slot book cap + ${WALLET_CAPS.short.toFixed(2)} wallet cap per frozen matrix row.`);
  console.log(`· Haircut mode: 'study' (frozen matrix basis). Ledger-foot identity`);
  console.log(`  asserted within envelope |Δ| ≤ lots_count cents. Cent-EXACT identity`);
  console.log(`  proven by orchestrator_test.ts TEST 1 (haircutMode='none').`);
  console.log(`· Corpus run: ${CORPUS_RUN_ID}   Cell-map run: ${CELLMAP_RUN_ID}`);
  console.log(`  Slate total: ${fmtInt(SLATE_ROW_TOTAL)} rows across ${SLATE_YEARS.length} yearly slices.`);
}

function printCacheProvenance(): void {
  console.log('── CACHE PROVENANCE (SHA-256, row counts) ─────────────────────────');
  for (const [k, v] of Object.entries(CACHE_SHAS)) {
    const rc = (CACHE_ROW_COUNTS as Record<string, number>)[k];
    console.log(`  ${k.padEnd(28)} rows=${String(rc ?? '?').padStart(6)}  sha=${v.slice(0, 12)}…${v.slice(-6)}`);
  }
}

function printReceipt(
  variantId: SizingVariantId,
  result: OrchestratorResult,
  sessionCount: number,
  slateTotals: { totalRows: number; bySide: { long: number; short: number }; offCalendar: number; carriers: number },
  startingEquityUsd: number,
): boolean {
  const now = new Date().toISOString();
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`RECEIPT — ACT-515 R1 · variant=${variantId}`);
  console.log(`SELECT now();  →  ${now}`);
  console.log('═══════════════════════════════════════════════════════════════════');
  printCaveatBlock();

  if (!result.ok) {
    console.log('');
    console.log('── INVOCATION + COUNTS ────────────────────────────────────────────');
    console.log(`  variant=${variantId}  starting_equity=${fmtUsd(startingEquityUsd)}`);
    console.log(`  wallet_caps=long:${WALLET_CAPS.long}/short:${WALLET_CAPS.short}  budgets=K:${BUDGETS.k}/short_daily:${BUDGETS.shortDailyBudget}`);
    console.log(`  sessions_planned=${fmtInt(sessionCount)}  slate_rows=${fmtInt(slateTotals.totalRows)}`);
    console.log(`  RUN HALTED at session=${result.sessionDate}  refusal=${result.refusal}`);
    console.log(`  detail: ${result.detail}`);
    console.log(`  rows_before_failure=${fmtInt(result.rowsBeforeFailure.length)}`);
    return false;
  }

  const rows = result.rows;
  const t: CapBindTelemetry = result.telemetry;
  const last = rows[rows.length - 1];
  const sum = result.summary;

  // Terminal identity within study-mode envelope.
  const startCents = Math.round(startingEquityUsd * 100);
  const endCents = Math.round((last.equityUsd as number) * 100);
  const sumRealizedCents = Math.round((t.totalRealizedUsd as number) * 100);
  const cumCarryCents = Math.round((sum.cumulativeCarryUsd as number) * 100);
  // Unrealized on the terminal row (open book at last session).
  const terminalUnrealCents = Math.round((last.unrealizedTotalUsd as number) * 100);
  // Foot: end = start + Σrealized − Σcarry + terminal_unrealized
  const predictedEnd = startCents + sumRealizedCents - cumCarryCents + terminalUnrealCents;
  const drift = endCents - predictedEnd;
  const envelope = (t.totalAdmits) + Math.max(0, rows[rows.length - 1].openLots); // one cent per settled + open lot
  const withinEnvelope = Math.abs(drift) <= envelope;

  console.log('');
  console.log('── INVOCATION + COUNTS ────────────────────────────────────────────');
  console.log(`  variant=${variantId}  leverage=${SIZING_VARIANTS[variantId].leverage}x  mode=${SIZING_VARIANTS[variantId].mode}`);
  console.log(`  starting_equity=${fmtUsd(startingEquityUsd)}  wallet_caps=long:${WALLET_CAPS.long}/short:${WALLET_CAPS.short}`);
  console.log(`  budgets={k:${BUDGETS.k}, shortDailyBudget:${BUDGETS.shortDailyBudget}}   haircutMode=study`);
  console.log(`  sessions_walked=${fmtInt(rows.length)} / ${fmtInt(sessionCount)}   window=${WINDOW_START}..${WINDOW_END}`);
  console.log(`  slate_rows=${fmtInt(slateTotals.totalRows)} (LONG ${fmtInt(slateTotals.bySide.long)} / SHORT ${fmtInt(slateTotals.bySide.short)})`);
  console.log(`  slate_off_calendar_skipped=${fmtInt(slateTotals.offCalendar)}   entry_session_carriers=${fmtInt(slateTotals.carriers)}`);
  console.log(`  admits: TOTAL=${fmtInt(t.totalAdmits)}  LONG=${fmtInt(t.totalAdmitsLong)}  SHORT=${fmtInt(t.totalAdmitsShort)}`);
  console.log('  cap-bind telemetry:');
  console.log(`    refusals — allocation_cap=${fmtInt(t.allocationCapRefusalsTotal)}  position_already_open=${fmtInt(t.positionAlreadyOpenTotal)}`);
  console.log(`               daily_budget=${fmtInt(t.dailyBudgetReachedTotal)}  short_daily_budget=${fmtInt(t.shortDailyBudgetReachedTotal)}`);
  console.log(`    max concurrent — LONG=${fmtInt(t.maxConcurrentLongLots)}  SHORT=${fmtInt(t.maxConcurrentShortLots)}`);

  console.log('');
  console.log('── THE VERDICT ROW (config-matrix.md columns) ─────────────────────');
  console.log(`  starting_equity          = ${fmtUsd(sum.startingEquityUsd as number)}`);
  console.log(`  ending_equity            = ${fmtUsd(sum.endingEquityUsd as number)}`);
  console.log(`  total_return_pct         = ${fmtPct(sum.totalReturnPct)}`);
  console.log(`  cumulative_carry_usd     = ${fmtUsd(sum.cumulativeCarryUsd as number)}`);
  console.log(`  worst_calendar_year      = ${sum.worstCalendarYear ?? 'n/a'}`);
  console.log(`  worst_calendar_year_ret  = ${sum.worstCalendarYearReturnPct === null ? 'n/a' : fmtPct(sum.worstCalendarYearReturnPct)}`);
  console.log(`  max_drawdown_pct         = ${fmtPct(sum.drawdown.maxDdPct)}`);
  console.log(`  dd_peak_date             = ${sum.drawdown.peakDate ?? 'n/a'}`);
  console.log(`  dd_trough_date           = ${sum.drawdown.troughDate ?? 'n/a'}`);
  console.log(`  dd_recovery_date         = ${sum.drawdown.recoveryDate ?? 'n/a'}`);
  console.log(`  dd_duration_sessions     = ${sum.drawdown.durationDays}`);
  console.log(`  dd_recovery_sessions     = ${sum.drawdown.recoveryDays ?? 'n/a'}`);

  console.log('');
  console.log('── TERMINAL IDENTITY (study-mode envelope) ────────────────────────');
  console.log(`  starting_equity_cents      = ${fmtInt(startCents)}`);
  console.log(`  Σ realized_cents           = ${fmtInt(sumRealizedCents)}   (LONG ${fmtInt(Math.round((t.totalRealizedLongUsd as number)*100))} / SHORT ${fmtInt(Math.round((t.totalRealizedShortUsd as number)*100))})`);
  console.log(`  − cumulative_carry_cents   = ${fmtInt(cumCarryCents)}`);
  console.log(`  + terminal_unrealized_c    = ${fmtInt(terminalUnrealCents)}   (open lots at last session = ${fmtInt(last.openLots)})`);
  console.log(`  = predicted_end_cents      = ${fmtInt(predictedEnd)}`);
  console.log(`  actual  end_cents          = ${fmtInt(endCents)}`);
  console.log(`  Δ = ${drift >= 0 ? '+' : ''}${drift}c over ${fmtInt(t.totalAdmits)} lots — envelope=${fmtInt(envelope)}c → ${withinEnvelope ? 'WITHIN' : 'OUTSIDE'} study-mode rounding envelope`);
  if (!withinEnvelope) {
    console.log(`  STOP: drift exceeds envelope. Cent-exact identity is proven by`);
    console.log(`  orchestrator_test.ts::TEST 1 (haircutMode='none'); receipt REFUSED.`);
  }

  console.log('');
  console.log('── EQUITY-SHAPE NOTES ─────────────────────────────────────────────');
  // Compute peak lots + earliest/latest admit session + carry days.
  let firstAdmitDay: SessionDate | null = null;
  let lastAdmitDay: SessionDate | null = null;
  let carryDays = 0;
  let maxDebitUsd = 0;
  for (const r of rows) {
    if (r.admitsToday > 0) {
      if (firstAdmitDay === null) firstAdmitDay = r.sessionDate;
      lastAdmitDay = r.sessionDate;
    }
    if ((r.carryTodayUsd as number) > 0) carryDays += 1;
    if ((r.cashUsd as number) < -maxDebitUsd) maxDebitUsd = -(r.cashUsd as number);
  }
  console.log(`  first_admit_session      = ${firstAdmitDay ?? 'n/a'}`);
  console.log(`  last_admit_session       = ${lastAdmitDay ?? 'n/a'}`);
  console.log(`  peak_concurrent_lots     = LONG ${fmtInt(t.maxConcurrentLongLots)}  SHORT ${fmtInt(t.maxConcurrentShortLots)}  ` +
              `(book caps = 36L / 4S at 1x-const rail; scale with variant)`);
  console.log(`  sessions_with_carry      = ${fmtInt(carryDays)} / ${fmtInt(rows.length)}`);
  console.log(`  peak_cash_debit_usd      = ${fmtUsd(maxDebitUsd)}`);
  console.log(`  terminal_session         = ${last.sessionDate}   terminal_open_lots = ${fmtInt(last.openLots)}`);

  return withinEnvelope;
}

// ── Main ─────────────────────────────────────────────────────────────────
export async function runReceipts(
  variants: ReadonlyArray<SizingVariantId> = ['1x-const', '2x-const', '2x-comp'],
): Promise<{ ok: boolean; results: Array<{ variantId: SizingVariantId; withinEnvelope: boolean }> }> {
  console.log(`ACT-515 R1 RECEIPT — session-walk orchestrator over sealed Turn-2B cache`);
  console.log(`FixedClock instant = ${RECEIPT_CLOCK_MS}ms (deterministic; kernel-safe)`);
  console.log('');
  printCacheProvenance();

  const sessions = await loadCalendar();
  const calendar = new ArraySessionCalendar(sessions);
  const cellMap = await loadCellMap();
  const bucket = await loadSlateAndBucket(calendar);
  const opens = await loadOpens();
  const closes = await loadCloses();
  const bars = makeCompositeBarSource(opens, closes);
  const clock = new FixedClock(RECEIPT_CLOCK_MS);

  console.log('');
  console.log(`Loaded: sessions=${sessions.length}  slate_rows=${bucket.totalRows}  entry_carriers=${bucket.bySession.size}  opens=${opens.size}  closes=${closes.size}`);

  const slateTotals = {
    totalRows: bucket.totalRows, bySide: bucket.bySide,
    offCalendar: bucket.offCalendar, carriers: bucket.bySession.size,
  };

  const results: Array<{ variantId: SizingVariantId; withinEnvelope: boolean }> = [];
  let allOk = true;
  for (const variantId of variants) {
    const startingEquity = KERNEL_CONST_BASE_EQUITY_USD;
    const res = runOrchestrator({
      variantId,
      sessions,
      calendar,
      corpusByEntrySession: bucket.bySession,
      cellMap,
      bars,
      startingEquityUsd: startingEquity,
      budgets: BUDGETS,
      walletCapFractions: WALLET_CAPS,
      haircutMode: 'study',
      clock,
    });
    const ok = printReceipt(variantId, res, sessions.length, slateTotals, startingEquity);
    results.push({ variantId, withinEnvelope: ok });
    if (!ok) allOk = false;
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`RECEIPTS COMPLETE — ${results.map(r => `${r.variantId}:${r.withinEnvelope ? 'OK' : 'STOP'}`).join('  ')}`);
  console.log('═══════════════════════════════════════════════════════════════════');
  return { ok: allOk, results };
}

if (import.meta.main) {
  const { ok } = await runReceipts();
  if (!ok) Deno.exit(1);
}