// ACT-515 Matrix — R1 ENUMERATION MODE (Option-1 pre-receipt turn).
//
// RULING 2026-07-26 (OPTION 1 — DELTA RE-FETCH, step 1):
//   The Turn-2B Stage-B `bars-windows-*.jsonl` set was sized from the
//   SLATE-STAGE admit list (turn-2b-lots.jsonl). The R1 receipt turn walks
//   the calendar with LIVE book-cap state, so its admitted lot set is
//   NOT the same object as the slate-stage set — the R1 walk exhibits
//   cap-driven displacement (5/day × ~11-session hold ≈ 55 open lots vs
//   36-slot LONG cap ⇒ caps must bind). This driver enumerates the
//   LIVE-WALK lot superset without touching any exit-window price data,
//   producing `enumerated-lots.jsonl` + `enumerated-diff.json` so the
//   Stage-B delta re-fetch can be scoped to the truly-needed windows.
//
// CONTRACT:
//   · Entry prices ← bars-pairs.jsonl ONLY (full coverage by construction).
//   · Exit dates   ← CALENDAR-PURE dispatch via EXIT_ANCHOR_BY_SIDE_TIER
//                    (Module 6 constants). NO close-price lookups here —
//                    the maxCarry defer is a RECEIPT-turn concern.
//   · Marks / equity / carry SUPPRESSED.
//   · Sizing = '1x-const' (the count-cap geometry). Per the SUPERSET
//     ASSERTION below, this enumeration is a lot superset for the
//     2x-const and 2x-comp receipt configs as well.
//
// SUPERSET ASSERTION (in-file, per ruling):
//   The book count-caps (LONG 36 / SHORT 4) are SIZING-PROPORTIONAL across
//   the three matrix variants because:
//     · KERNEL_SLOT_CONCENTRATION = 0.025 of sizingBase → notional per
//       slot scales 1:1 with sizingBase (see kernel/size.ts).
//     · wallet cap USD = sizingBase × {0.90, 0.10} — also 1:1 in sizingBase.
//     · effective count cap = floor(walletCapUsd / slotNotional) — the
//       sizingBase factor cancels; count caps are invariant under variant.
//   Therefore the ADMIT decisions produced by the 1x-const walk over the
//   same slate + open-book history are a SUPERSET of the admit sets
//   produced by 2x-const and 2x-comp (the -comp equity path can differ
//   only in per-lot NOTIONAL, not in the admit gate; the -comp path
//   never admits a lot the -const walk would refuse). Each receipt run
//   MUST assert its admits ⊆ this enumeration; a violation = STOP with
//   the named delta printed.
//
// SCOPE FENCE: readonly imports from ../kernel/*; no edge-function calls;
//   no network. ANTI-PHANTOM: no wall-clock, no Date-in-decision-path.

import { FixedClock, type SessionDate } from '../kernel/clock.ts';
import { ArraySessionCalendar, EXIT_ANCHOR_BY_SIDE_TIER } from '../kernel/exit.ts';
import { MapBarSource } from '../kernel/mark.ts';
import { price, type Price, type SideDb, type Tier } from '../kernel/types.ts';
import { KERNEL_CONST_BASE_EQUITY_USD } from '../kernel/size.ts';
import {
  reconstructSessionAdmits, deriveLongTier, SHORT_TIER_CONVENTION,
  entryOffsetForSideTier, type CorpusCandidateRow, type CellMapLookup,
} from './reconstructor.ts';
import { parseSlateLine } from './turn2b/slate-row.ts';

const CACHE = 'scripts/act-515/matrix/cache/';
const YEARS = [2022, 2023, 2024, 2025, 2026] as const;
const WINDOW_START: SessionDate = '2022-06-29';
const WINDOW_END:   SessionDate = '2026-07-10';
const WALLET_CAPS = { long: 0.90, short: 0.10 } as const;
const BUDGETS = { k: 5, shortDailyBudget: 5 } as const;
const CLOCK = new FixedClock(1_704_000_000_000);

async function readLines(p: string): Promise<string[]> {
  const t = await Deno.readTextFile(p); return t.split('\n').filter(l => l.length > 0);
}

async function loadCalendar(): Promise<SessionDate[]> {
  const out: SessionDate[] = [];
  for (const l of await readLines(`${CACHE}calendar.jsonl`)) {
    const r = JSON.parse(l) as { session: string };
    if (r.session >= WINDOW_START && r.session <= WINDOW_END) out.push(r.session);
  }
  return out.sort();
}

async function loadCellMap(): Promise<CellMapLookup> {
  const m = new Map<string, number>();
  for (const l of await readLines(`${CACHE}cellmap.jsonl`)) {
    const r = JSON.parse(l) as Record<string, unknown>;
    const k = [r.side, r.band, Number(r.window_days), Number(r.momentum_quintile),
               Number(r.drawdown_bucket), Number(r.exclusion_width_days)].join('/');
    m.set(k, Number(r.mean_fwd_return_5d));
  }
  return (k) => m.get(
    `${k.side}/${k.band}/${k.argmaxWindowDays}/${k.magnitudeQuintile}/${k.drawdownBucket}/${k.exclusionHorizonDays}`,
  ) ?? null;
}

async function loadOpens(): Promise<Map<string, Price>> {
  const m = new Map<string, Price>();
  for (const l of await readLines(`${CACHE}bars-pairs.jsonl`)) {
    const r = JSON.parse(l) as { ticker: string; trade_date: string; open: string | null };
    if (r.open === null) continue;
    const n = Number(r.open); if (!Number.isFinite(n) || n <= 0) continue;
    m.set(MapBarSource.key(r.ticker, r.trade_date), price(n));
  }
  return m;
}

function slateToCorpus(s: ReturnType<typeof parseSlateLine>): CorpusCandidateRow {
  const toN = (x: string | null) => {
    if (x === null) return null;
    const n = Number(x); return Number.isFinite(n) ? n : null;
  };
  return {
    eventId: s.event_id, ticker: s.ticker, side: s.side, eventDate: s.session,
    windowDays: s.window_days, momentumQuintile: s.momentum_quintile,
    drawdownBucket: s.drawdown_bucket, daysToNearestEarnings: s.days_to_nearest_earnings,
    excessW1: toN(s.excess_w1), excessW2: toN(s.excess_w2), excessW3: toN(s.excess_w3),
    excessW4: toN(s.excess_w4), excessW5: toN(s.excess_w5),
  };
}

async function loadSlateByEntrySession(cal: ArraySessionCalendar): Promise<{
  bySession: Map<SessionDate, CorpusCandidateRow[]>;
  total: number; bySide: { long: number; short: number };
  offCalendar: number;
}> {
  const bySession = new Map<SessionDate, CorpusCandidateRow[]>();
  let total = 0; const bySide = { long: 0, short: 0 }; let offCalendar = 0;
  for (const y of YEARS) {
    for (const l of await readLines(`${CACHE}slate-${y}.jsonl`)) {
      const s = parseSlateLine(l); total += 1; bySide[s.side] += 1;
      const off = entryOffsetForSideTier(s.side, s.tier);
      const entry = cal.sessionAfter(s.session, off);
      if (entry === null || entry < WINDOW_START || entry > WINDOW_END) { offCalendar += 1; continue; }
      const row = slateToCorpus(s);
      const arr = bySession.get(entry); if (arr) arr.push(row); else bySession.set(entry, [row]);
    }
  }
  return { bySession, total, bySide, offCalendar };
}

/** Calendar-pure exit date per (side, tier) — no price lookup. */
function resolveExitDateDateOnly(
  side: SideDb, tier: Tier, entryDate: SessionDate, eventDate: SessionDate,
  cal: ArraySessionCalendar,
): SessionDate | null {
  const spec = EXIT_ANCHOR_BY_SIDE_TIER[`${side}/${tier}`];
  const anchor = spec.mode === 'event' ? eventDate : entryDate;
  return cal.sessionAfter(anchor, spec.n);
}

interface EnumeratedLot {
  lotId: string; ticker: string; side: SideDb; tier: Tier;
  eventId: number; eventDate: SessionDate; entryDate: SessionDate;
  scheduledExitDate: SessionDate;
  shares: number; entryOpen: number; slotNotionalUsd: number;
}

export async function runEnumeration(): Promise<{
  ok: boolean;
  lots: EnumeratedLot[];
  telemetry: {
    totalAdmits: number; totalAdmitsLong: number; totalAdmitsShort: number;
    allocationCapRefusalsTotal: number; positionAlreadyOpenTotal: number;
    shortDailyBudgetReachedTotal: number; dailyBudgetReachedTotal: number;
    maxConcurrentLongLots: number; maxConcurrentShortLots: number;
    exit_off_calendar: number; sessionsWalked: number;
  };
  diff: { newlyNeeded: number; sealedOrphans: number; matched: number };
}> {
  console.log('── ACT-515 R1 ENUMERATION MODE ─────────────────────────────────────');
  console.log(`variant=1x-const (count-cap geometry; superset for 2x-const/2x-comp)`);
  const sessions = await loadCalendar();
  const cal = new ArraySessionCalendar(sessions);
  const cellMap = await loadCellMap();
  const bucket = await loadSlateByEntrySession(cal);
  const opens = await loadOpens();
  console.log(`sessions=${sessions.length}  slate_rows=${bucket.total}  entry_carriers=${bucket.bySession.size}  opens=${opens.size}`);

  const openLots = new Map<string, EnumeratedLot>();
  const emitted: EnumeratedLot[] = [];
  let allocRefs = 0, posOpen = 0, shortBudget = 0, dailyBudget = 0;
  let admits = 0, admitsL = 0, admitsS = 0, exitOff = 0;
  let maxL = 0, maxS = 0;

  for (const session of sessions) {
    // (a) EXIT FOLD — date-only.
    for (const [id, lot] of [...openLots.entries()]) {
      if (lot.scheduledExitDate === session) openLots.delete(id);
    }

    const rowsToday = bucket.bySession.get(session) ?? [];

    // openBook: per-lot signed notional using entry-open × shares (constant
    // through the lot's life under -const; enumeration ignores mark).
    const openBook = [] as Array<{ ticker: string; side: SideDb; marketValueUsd: number }>;
    for (const l of openLots.values()) {
      openBook.push({ ticker: l.ticker, side: l.side,
        marketValueUsd: l.shares * l.entryOpen * (l.side === 'short' ? -1 : 1) });
    }

    // 1x-const sizing rail — constant equity, count-cap geometry.
    const equity = KERNEL_CONST_BASE_EQUITY_USD;
    const sizingBase = equity; // 1x
    const longCap = sizingBase * WALLET_CAPS.long;
    const shortCap = sizingBase * WALLET_CAPS.short;

    // Reconstructor uses POSITIVE marketValueUsd sums per side against caps
    // in production; feed positive notional for the cap check.
    const openBookForAdmit = openBook.map(r => ({ ...r, marketValueUsd: Math.abs(r.marketValueUsd) }));

    const admitRes = reconstructSessionAdmits({
      sessionDate: session,
      corpusRows: rowsToday,
      cellMap,
      openBook: openBookForAdmit,
      equityUsd: equity,
      variantId: '1x-const',
      budgets: BUDGETS,
      caps: { sideCapUsd: { long: longCap, short: shortCap } },
      referencePrice: (t, s) => opens.get(MapBarSource.key(t, s)) ?? null,
      sessionOffset: (s, n) => cal.sessionAfter(s, n),
      clock: CLOCK,
    });

    // Resolve exit dates DATE-ONLY per admit.
    const rowByEventId = new Map<number, CorpusCandidateRow>();
    for (const r of rowsToday) rowByEventId.set(r.eventId, r);

    for (const e of admitRes.entries) {
      const eventId = Number(e.lotId.slice(e.lotId.indexOf('#') + 1));
      const cr = rowByEventId.get(eventId);
      if (!cr) throw new Error(`enumeration: no corpus row for event ${eventId}`);
      const tier: Tier = e.side === 'long'
        ? (deriveLongTier(cr) as Tier) : SHORT_TIER_CONVENTION;
      const xDate = resolveExitDateDateOnly(e.side, tier, session, cr.eventDate, cal);
      if (xDate === null) { exitOff += 1; continue; }
      const lot: EnumeratedLot = {
        lotId: `${session}:${e.side}:${tier}:${e.ticker}:${eventId}`,
        ticker: e.ticker, side: e.side, tier, eventId,
        eventDate: cr.eventDate, entryDate: session,
        scheduledExitDate: xDate,
        shares: e.shares as unknown as number,
        entryOpen: e.entryPrice as unknown as number,
        slotNotionalUsd: e.slotNotional as unknown as number,
      };
      openLots.set(lot.lotId, lot);
      emitted.push(lot);
      admits += 1; if (e.side === 'long') admitsL += 1; else admitsS += 1;
    }

    allocRefs += admitRes.tally.allocation_cap_reached;
    posOpen += admitRes.tally.position_already_open;
    shortBudget += admitRes.tally.short_daily_budget_reached;
    dailyBudget += admitRes.tally.daily_budget_reached;

    let ol = 0, os = 0;
    for (const l of openLots.values()) { if (l.side === 'long') ol += 1; else os += 1; }
    if (ol > maxL) maxL = ol; if (os > maxS) maxS = os;
  }

  // Write NDJSON.
  const out = emitted.map(l => JSON.stringify(l)).join('\n') + '\n';
  await Deno.writeTextFile(`${CACHE}enumerated-lots.jsonl`, out);

  // Diff vs turn-2b-lots.jsonl by (side, ticker, eventDate).
  const key = (s: string, t: string, ed: string) => `${s}\u0000${t}\u0000${ed}`;
  const enumKeys = new Set<string>();
  for (const l of emitted) enumKeys.add(key(l.side, l.ticker, l.eventDate));
  const sealedKeys = new Set<string>();
  for (const l of await readLines(`${CACHE}turn-2b-lots.jsonl`)) {
    const r = JSON.parse(l) as { side: string; ticker: string; eventDate: string };
    sealedKeys.add(key(r.side, r.ticker, r.eventDate));
  }
  let matched = 0, newlyNeeded = 0, sealedOrphans = 0;
  for (const k of enumKeys) if (sealedKeys.has(k)) matched += 1; else newlyNeeded += 1;
  for (const k of sealedKeys) if (!enumKeys.has(k)) sealedOrphans += 1;

  const telemetry = {
    totalAdmits: admits, totalAdmitsLong: admitsL, totalAdmitsShort: admitsS,
    allocationCapRefusalsTotal: allocRefs, positionAlreadyOpenTotal: posOpen,
    shortDailyBudgetReachedTotal: shortBudget, dailyBudgetReachedTotal: dailyBudget,
    maxConcurrentLongLots: maxL, maxConcurrentShortLots: maxS,
    exit_off_calendar: exitOff, sessionsWalked: sessions.length,
  };
  const diff = { newlyNeeded, sealedOrphans, matched };

  console.log('');
  console.log('── ENUMERATED-LOTS ────────────────────────────────────────────────');
  console.log(`  emitted=${emitted.length}  LONG=${admitsL}  SHORT=${admitsS}`);
  console.log(`  peak_concurrent — LONG=${maxL}  SHORT=${maxS}   exit_off_calendar=${exitOff}`);
  console.log('  cap-bind telemetry (LIVE walk):');
  console.log(`    allocation_cap_reached      = ${allocRefs}`);
  console.log(`    position_already_open       = ${posOpen}`);
  console.log(`    short_daily_budget_reached  = ${shortBudget}`);
  console.log(`    daily_budget_reached        = ${dailyBudget}`);
  console.log('');
  console.log('── DIFF vs turn-2b-lots.jsonl ─────────────────────────────────────');
  console.log(`  sealed_lots       = ${sealedKeys.size}`);
  console.log(`  enumerated_lots   = ${enumKeys.size}`);
  console.log(`  matched           = ${matched}`);
  console.log(`  newly_needed      = ${newlyNeeded}   (LIVE-walk admits with no Stage-B coverage)`);
  console.log(`  sealed_orphaned   = ${sealedOrphans}  (Stage-B windows fetched but never admitted live)`);

  // Also write a compact delta manifest for the fetch step.
  const enumBySkey = new Map(emitted.map(l => [key(l.side, l.ticker, l.eventDate), l]));
  const delta: Array<{ ticker: string; side: SideDb; entryDate: SessionDate; scheduledExitDate: SessionDate; eventId: number }> = [];
  for (const k of enumKeys) if (!sealedKeys.has(k)) {
    const l = enumBySkey.get(k)!;
    delta.push({ ticker: l.ticker, side: l.side, entryDate: l.entryDate,
      scheduledExitDate: l.scheduledExitDate, eventId: l.eventId });
  }
  await Deno.writeTextFile(`${CACHE}enumerated-diff.json`, JSON.stringify({
    generated_from: 'run-enumeration.ts (1x-const, calendar-pure exits)',
    superset_assertion: 'count caps invariant across 1x-const/2x-const/2x-comp; enumeration ⊇ receipt admits',
    telemetry, diff,
    delta_windows: delta,
  }, null, 2) + '\n');

  return { ok: true, lots: emitted, telemetry, diff };
}

if (import.meta.main) {
  const { ok } = await runEnumeration();
  if (!ok) Deno.exit(1);
}