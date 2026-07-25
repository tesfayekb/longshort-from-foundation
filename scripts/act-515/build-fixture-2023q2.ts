// ACT-515 Gate Half-2 — Fixture-II Builder.
//
// Deterministically emits the four fixture files under
// `fixtures/overshoot-backtest/` for the 2023-Q2 replay:
//   · 2023-Q2-hand-truth.jsonl   (14 lots, hand-computed per row)
//   · 2023-Q2-bars.jsonl         (sparse ticker×date → close grid)
//   · 2023-Q2-calendar.jsonl     (SPY full + sparse equity-walk sessions)
//   · 2023-Q2-checkpoints.jsonl  (3 mid-path equity checkpoints,
//                                 with verbatim arithmetic in comments)
//
// ZERO KERNEL IMPORTS. Enforced by
// `scripts/act-515/tests/lint-builder-imports_test.ts` (Turn-2 pin).
//
// Source of data:
//   · Lot picks: sampled from `public.overshoot_study_candidate_events`
//     via the ratified pre-screen v2 SPY-ordinal chain (see the fixture
//     header for the SQL cite). Sourcing was performed on 2026-07-25 at
//     gate_turn2_open_ts=2026-07-25T22:42:06.261333+00 via
//     supabase--read_query. This builder inlines the resulting picks so
//     the fixture is fully reproducible in the sandbox without a DB
//     round-trip. Independence witness: the builder's per-lot arithmetic
//     below uses only Math.floor / Math.round on the raw entry_open /
//     exit_close prices — the same primitive operations a human uses.
//   · Bars: `public.overshoot_daily_bars` (adjusted per ingestion) — the
//     raw close numbers below match the DB verbatim on the query day.
//
// PIN — NO WALL CLOCK. This script consumes no Date.now, no
// new Date(...), no time.time. Its output is a pure function of the
// inlined DATA block.
//
// USAGE (from repo root):
//   deno run --allow-write=fixtures/overshoot-backtest \
//     scripts/act-515/build-fixture-2023q2.ts

/* eslint-disable no-console */

interface LotPick {
  readonly lot_id: string;
  readonly ticker: string;
  readonly side: 'long' | 'short';
  readonly tier: 'T1' | 'T2';
  readonly event_date: string;
  readonly entry_date: string;
  readonly exit_date: string;
  readonly entry_open: number;
  readonly exit_close: number;
}

const LOTS: ReadonlyArray<LotPick> = [
  // fixII-01 XOM long T2. shares=floor(10000/116.26)=86; realized=+2666
  { lot_id:'fixII-01', ticker:'XOM',  side:'long',  tier:'T2', event_date:'2023-04-03', entry_date:'2023-04-04', exit_date:'2023-04-19', entry_open:116.26, exit_close:116.57 },
  // fixII-02 TSLA short T2. shares=50; realized=+83650
  { lot_id:'fixII-02', ticker:'TSLA', side:'short', tier:'T2', event_date:'2023-04-03', entry_date:'2023-04-04', exit_date:'2023-04-19', entry_open:197.32, exit_close:180.59 },
  // fixII-03 NVDA short T1. shares=376; realized=-15717
  { lot_id:'fixII-03', ticker:'NVDA', side:'short', tier:'T1', event_date:'2023-04-05', entry_date:'2023-04-06', exit_date:'2023-04-17', entry_open:26.584, exit_close:27.002 },
  // fixII-04 NFLX short T1. shares=294; realized=+35309 (cash-walker Δ=35310; 1c drift)
  { lot_id:'fixII-04', ticker:'NFLX', side:'short', tier:'T1', event_date:'2023-04-12', entry_date:'2023-04-13', exit_date:'2023-04-21', entry_open:33.999, exit_close:32.798 },
  // fixII-05 JPM long T2. shares=71; realized=+8875
  { lot_id:'fixII-05', ticker:'JPM',  side:'long',  tier:'T2', event_date:'2023-04-14', entry_date:'2023-04-17', exit_date:'2023-05-01', entry_open:139.95, exit_close:141.20 },
  // fixII-06 GOOG short T1. shares=93; realized=+23715
  { lot_id:'fixII-06', ticker:'GOOG', side:'short', tier:'T1', event_date:'2023-04-17', entry_date:'2023-04-18', exit_date:'2023-04-26', entry_open:107.00, exit_close:104.45 },
  // fixII-07 MSFT long T2. shares=33; realized=+46662
  { lot_id:'fixII-07', ticker:'MSFT', side:'long',  tier:'T2', event_date:'2023-04-26', entry_date:'2023-04-27', exit_date:'2023-05-11', entry_open:295.97, exit_close:310.11 },
  // fixII-08 MSFT long T1. shares=32; realized=+14848
  { lot_id:'fixII-08', ticker:'MSFT', side:'long',  tier:'T1', event_date:'2023-04-27', entry_date:'2023-04-28', exit_date:'2023-05-08', entry_open:304.01, exit_close:308.65 },
  // fixII-09 AAPL long T2. shares=57; realized=+9804
  { lot_id:'fixII-09', ticker:'AAPL', side:'long',  tier:'T2', event_date:'2023-05-05', entry_date:'2023-05-08', exit_date:'2023-05-22', entry_open:172.48, exit_close:174.20 },
  // fixII-10 AAPL long T1. shares=57; realized=+3306
  { lot_id:'fixII-10', ticker:'AAPL', side:'long',  tier:'T1', event_date:'2023-05-11', entry_date:'2023-05-12', exit_date:'2023-05-22', entry_open:173.62, exit_close:174.20 },
  // fixII-11 XOM long T1. shares=94; realized=-6110
  { lot_id:'fixII-11', ticker:'XOM',  side:'long',  tier:'T1', event_date:'2023-05-24', entry_date:'2023-05-25', exit_date:'2023-06-05', entry_open:105.94, exit_close:105.29 },
  // fixII-12 MSFT long T2. shares=30; realized=+15150
  { lot_id:'fixII-12', ticker:'MSFT', side:'long',  tier:'T2', event_date:'2023-05-30', entry_date:'2023-05-31', exit_date:'2023-06-14', entry_open:332.29, exit_close:337.34 },
  // fixII-13 MSFT long T1. shares=30; realized=+2580
  { lot_id:'fixII-13', ticker:'MSFT', side:'long',  tier:'T1', event_date:'2023-05-31', entry_date:'2023-06-01', exit_date:'2023-06-09', entry_open:325.93, exit_close:326.79 },
  // fixII-14 XOM long T2. shares=91; realized=-57967
  { lot_id:'fixII-14', ticker:'XOM',  side:'long',  tier:'T2', event_date:'2023-06-07', entry_date:'2023-06-08', exit_date:'2023-06-23', entry_open:108.77, exit_close:102.40 },
];

interface Bar { readonly ticker: string; readonly trade_date: string; readonly close: number; }

const BARS: ReadonlyArray<Bar> = [
  { ticker:'XOM',  trade_date:'2023-04-04', close:115.02 },
  { ticker:'TSLA', trade_date:'2023-04-04', close:192.58 },
  { ticker:'XOM',  trade_date:'2023-04-06', close:115.05 },
  { ticker:'TSLA', trade_date:'2023-04-06', close:185.06 },
  { ticker:'NVDA', trade_date:'2023-04-06', close:27.037 },
  { ticker:'XOM',  trade_date:'2023-04-13', close:115.77 },
  { ticker:'TSLA', trade_date:'2023-04-13', close:185.90 },
  { ticker:'NVDA', trade_date:'2023-04-13', close:26.463 },
  { ticker:'NFLX', trade_date:'2023-04-13', close:34.619 },
  { ticker:'XOM',  trade_date:'2023-04-17', close:114.70 },
  { ticker:'TSLA', trade_date:'2023-04-17', close:187.04 },
  { ticker:'NFLX', trade_date:'2023-04-17', close:33.272 },
  { ticker:'JPM',  trade_date:'2023-04-17', close:139.83 },
  { ticker:'NVDA', trade_date:'2023-04-17', close:27.002 },
  { ticker:'XOM',  trade_date:'2023-04-18', close:116.94 },
  { ticker:'TSLA', trade_date:'2023-04-18', close:184.31 },
  { ticker:'NFLX', trade_date:'2023-04-18', close:33.37 },
  { ticker:'JPM',  trade_date:'2023-04-18', close:141.40 },
  { ticker:'GOOG', trade_date:'2023-04-18', close:105.12 },
  { ticker:'XOM',  trade_date:'2023-04-19', close:116.57 },
  { ticker:'TSLA', trade_date:'2023-04-19', close:180.59 },
  { ticker:'NFLX', trade_date:'2023-04-19', close:32.312 },
  { ticker:'JPM',  trade_date:'2023-04-19', close:141.22 },
  { ticker:'GOOG', trade_date:'2023-04-19', close:105.02 },
  { ticker:'NFLX', trade_date:'2023-04-21', close:32.798 },
  { ticker:'JPM',  trade_date:'2023-04-21', close:140.54 },
  { ticker:'GOOG', trade_date:'2023-04-21', close:105.91 },
  { ticker:'GOOG', trade_date:'2023-04-26', close:104.45 },
  { ticker:'JPM',  trade_date:'2023-04-26', close:135.23 },
  { ticker:'JPM',  trade_date:'2023-04-27', close:137.05 },
  { ticker:'MSFT', trade_date:'2023-04-27', close:304.83 },
  { ticker:'JPM',  trade_date:'2023-04-28', close:138.24 },
  { ticker:'MSFT', trade_date:'2023-04-28', close:307.26 },
  { ticker:'JPM',  trade_date:'2023-05-01', close:141.20 },
  { ticker:'MSFT', trade_date:'2023-05-01', close:305.56 },
  { ticker:'MSFT', trade_date:'2023-05-04', close:305.41 },
  { ticker:'MSFT', trade_date:'2023-05-08', close:308.65 },
  { ticker:'AAPL', trade_date:'2023-05-08', close:173.50 },
  { ticker:'MSFT', trade_date:'2023-05-11', close:310.11 },
  { ticker:'AAPL', trade_date:'2023-05-11', close:173.75 },
  { ticker:'AAPL', trade_date:'2023-05-12', close:172.57 },
  { ticker:'AAPL', trade_date:'2023-05-16', close:172.07 },
  { ticker:'AAPL', trade_date:'2023-05-22', close:174.20 },
  { ticker:'XOM',  trade_date:'2023-05-25', close:105.66 },
  { ticker:'XOM',  trade_date:'2023-05-31', close:102.18 },
  { ticker:'MSFT', trade_date:'2023-05-31', close:328.39 },
  { ticker:'XOM',  trade_date:'2023-06-01', close:103.36 },
  { ticker:'MSFT', trade_date:'2023-06-01', close:332.58 },
  { ticker:'XOM',  trade_date:'2023-06-02', close:105.76 },
  { ticker:'MSFT', trade_date:'2023-06-02', close:335.40 },
  { ticker:'XOM',  trade_date:'2023-06-05', close:105.29 },
  { ticker:'MSFT', trade_date:'2023-06-05', close:335.94 },
  { ticker:'MSFT', trade_date:'2023-06-08', close:325.26 },
  { ticker:'XOM',  trade_date:'2023-06-08', close:108.19 },
  { ticker:'MSFT', trade_date:'2023-06-09', close:326.79 },
  { ticker:'XOM',  trade_date:'2023-06-09', close:107.39 },
  { ticker:'MSFT', trade_date:'2023-06-14', close:337.34 },
  { ticker:'XOM',  trade_date:'2023-06-14', close:105.16 },
  { ticker:'XOM',  trade_date:'2023-06-23', close:102.40 },
];

const SPY_FULL_CALENDAR: ReadonlyArray<string> = [
  '2023-04-03','2023-04-04','2023-04-05','2023-04-06','2023-04-10','2023-04-11',
  '2023-04-12','2023-04-13','2023-04-14','2023-04-17','2023-04-18','2023-04-19',
  '2023-04-20','2023-04-21','2023-04-24','2023-04-25','2023-04-26','2023-04-27',
  '2023-04-28','2023-05-01','2023-05-02','2023-05-03','2023-05-04','2023-05-05',
  '2023-05-08','2023-05-09','2023-05-10','2023-05-11','2023-05-12','2023-05-15',
  '2023-05-16','2023-05-17','2023-05-18','2023-05-19','2023-05-22','2023-05-23',
  '2023-05-24','2023-05-25','2023-05-26','2023-05-30','2023-05-31','2023-06-01',
  '2023-06-02','2023-06-05','2023-06-06','2023-06-07','2023-06-08','2023-06-09',
  '2023-06-12','2023-06-13','2023-06-14','2023-06-15','2023-06-16','2023-06-20',
  '2023-06-21','2023-06-22','2023-06-23','2023-06-26','2023-06-27','2023-06-28',
  '2023-06-29','2023-06-30',
];

const CHECKPOINTS: ReadonlyArray<string> = ['2023-05-04','2023-05-16','2023-06-02'];

// ============================================================================
// CHECKPOINT HAND-ARITHMETIC (VERBATIM — every number derivable from LOTS+BARS)
//
// CHK-1  2023-05-04:
//   Closed lots: 01..06. Σ Δcash = 2666+83650-15717+35310+8875+23715 = 138499
//   Open on 5/4: 07 (33sh MSFT long, entry 976701), 08 (32sh MSFT long, entry 972832)
//   Cash = 10_000_000 + 138499 − 1_949_533 = 8_188_966
//   Marks (MSFT close 305.41): +1_007_853 + +977_312 = +1_985_165
//   equity = 10_174_131 cents
//
// CHK-2  2023-05-16:
//   Closed 01..08 (07 exit 5/11, 08 exit 5/8). Σ = 200_009
//   Open: 09 (57sh AAPL, entry 983136), 10 (57sh AAPL, entry 989634)
//   Cash = 10_000_000 + 200_009 − 1_972_770 = 8_227_239
//   Marks (AAPL close 172.07): 2 × +980_799 = +1_961_598
//   equity = 10_188_837 cents
//
// CHK-3  2023-06-02:
//   Closed 01..10 (09,10 exit 5/22). Σ = 213_119
//   Open: 11 (94sh XOM, 995836), 12 (30sh MSFT, 996870), 13 (30sh MSFT, 977790)
//   Cash = 10_000_000 + 213_119 − 2_970_496 = 7_242_623
//   Marks: XOM +994_144, MSFT 2 × +1_006_200 = +3_006_544
//   equity = 10_249_167 cents
//
// TERMINAL 2023-06-23:
//   Σ Δcash (cash-walker) = 166_772  →  terminal_cash = 10_166_772 cents
//   Σ realizedCents (Module 6) = 166_771 cents (1c drift, NFLX 33.999→32.798)
// ============================================================================

function serializeHandTruth(lots: ReadonlyArray<LotPick>): string {
  const header = {
    epoch: 'ACT-515-gate-half-2-fixture-ii',
    source: 'public.overshoot_study_candidate_events (ratified study corpus) + public.overshoot_daily_bars',
    source_chain_cite: 'docs/08-planning/artifacts/ACT-509-STAGE2-PRESCREEN-final-day-forfeit-v2.md:22-52 (pre-screen v2 SPY-ordinal FROM/WHERE chain)',
    window: '2023-Q2 (event_dates 2023-04-03 → 2023-06-07)',
    entry_convention: 'T+1 open (SPY-ordinal +1 from event_date)',
    exit_convention: 'T1 = SPY-ordinal event+7 close; T2 = SPY-ordinal event+11 close (= study convention +6/+10 sessions after entry)',
    sizing_rule: 'floor($10,000 / entry_open); no fractional shares',
    pnl_rule: 'LONG pnl_usd = shares * (exit_close - entry_open); SHORT pnl_usd = shares * (entry_open - exit_close); pnl_cents = round(pnl_usd * 100)',
    cash_rule: 'long entry cash-out = +round(shares*entry*100); long exit cash-in = +round(shares*exit*100); short entry cash-out = -round(shares*entry*100); short exit cash-in = -round(shares*exit*100)',
    bars_source: 'public.overshoot_daily_bars (adjusted per ingestion)',
    haircut_mode: 'none (hand arithmetic haircut-free)',
    cent_drift_note: '3-decimal prices cause 1-cent drift between Σ realizedCents (Module 6, round-per-lot) and cash-walker terminal cash (Module 7, integer-cent-diff). Fixture certifies BOTH separately.',
    starting_equity_usd: 100_000,
    lots: lots.length,
    sides: { long: lots.filter(l => l.side === 'long').length, short: lots.filter(l => l.side === 'short').length },
    tiers: { T1: lots.filter(l => l.tier === 'T1').length, T2: lots.filter(l => l.tier === 'T2').length },
    tickers: [...new Set(lots.map(l => l.ticker))].sort(),
    authored_ts: '2026-07-25T22:42:06Z (SELECT now() gate_turn2_open)',
    independence: 'builder + this file authored WITHOUT any kernel import; per-lot arithmetic via floor/round only; asserted by scripts/act-515/tests/lint-builder-imports_test.ts',
  };
  const out: string[] = ['# ' + JSON.stringify(header), '# ---'];
  for (const l of lots) {
    const shares = Math.floor(10_000 / l.entry_open);
    const grossEntry = Math.round(shares * l.entry_open * 100);
    const grossExit = Math.round(shares * l.exit_close * 100);
    const entry_cash_out_cents = l.side === 'long' ? grossEntry : -grossEntry;
    const exit_cash_in_cents = l.side === 'long' ? grossExit : -grossExit;
    const pnlUsd = l.side === 'long'
      ? shares * (l.exit_close - l.entry_open)
      : shares * (l.entry_open - l.exit_close);
    const realized_cents = Math.round(pnlUsd * 100);
    out.push(JSON.stringify({
      lot_id: l.lot_id, ticker: l.ticker, side: l.side, tier: l.tier,
      event_date: l.event_date, entry_date: l.entry_date, exit_date: l.exit_date,
      entry_open: l.entry_open, exit_close: l.exit_close, shares,
      entry_cash_out_cents, exit_cash_in_cents, realized_cents,
    }));
  }
  return out.join('\n') + '\n';
}

function serializeBars(bars: ReadonlyArray<Bar>): string {
  const header = {
    file: '2023-Q2-bars.jsonl',
    purpose: 'ticker × trade_date → close for every (open-lot × equity-walk-session) cell plus every exit-day close. Sourced verbatim from public.overshoot_daily_bars via supabase read_query on 2026-07-25 (gate_turn2_open_ts). Adjusted per ingestion. No synthesis, no interpolation.',
  };
  const out: string[] = ['# ' + JSON.stringify(header), '# ---'];
  for (const b of bars) out.push(JSON.stringify(b));
  return out.join('\n') + '\n';
}

function serializeCalendar(full: ReadonlyArray<string>, walk: ReadonlyArray<string>): string {
  const header = {
    file: '2023-Q2-calendar.jsonl',
    purpose: "Two session lists: (1) full_calendar = every SPY trading session 2023-04-03..2023-06-30 for T1/T2 ordinal exit resolution (SessionCalendar); (2) equity_walk_sessions = the sparse date grid the equity walker touches — entry_date + exit_date + checkpoint_date union, sorted. Bars are provisioned only at these dates + open-lot tickers (see 2023-Q2-bars.jsonl). Source: public.overshoot_daily_bars WHERE ticker='SPY'.",
  };
  return [
    '# ' + JSON.stringify(header),
    '# ---',
    JSON.stringify({ kind: 'full_calendar', dates: full }),
    JSON.stringify({ kind: 'equity_walk_sessions', dates: walk }),
    '',
  ].join('\n');
}

function serializeCheckpoints(): string {
  const header = {
    file: '2023-Q2-checkpoints.jsonl',
    purpose: 'Mid-path equity checkpoints for gate-fixture-ii. Each row states the hand-computed cashCents, longMvCents, shortMvCents, and equityCents that the kernel must reproduce byte-exactly on the given sessionDate. Every number in the arithmetic is witnessed by the header block in build-fixture-2023q2.ts (search for "CHECKPOINT HAND-ARITHMETIC").',
  };
  const rows = [
    { checkpoint: 'CHK-1',    sessionDate: '2023-05-04', cashCents:  8_188_966, longMvCents: 1_985_165, shortMvCents: 0, equityCents: 10_174_131, openLotIds: ['fixII-07','fixII-08'] },
    { checkpoint: 'CHK-2',    sessionDate: '2023-05-16', cashCents:  8_227_239, longMvCents: 1_961_598, shortMvCents: 0, equityCents: 10_188_837, openLotIds: ['fixII-09','fixII-10'] },
    { checkpoint: 'CHK-3',    sessionDate: '2023-06-02', cashCents:  7_242_623, longMvCents: 3_006_544, shortMvCents: 0, equityCents: 10_249_167, openLotIds: ['fixII-11','fixII-12','fixII-13'] },
  ];
  const terminal = {
    checkpoint: 'TERMINAL', sessionDate: '2023-06-23',
    cashCents: 10_166_772, longMvCents: 0, shortMvCents: 0, equityCents: 10_166_772,
    sumRealizedCents_module6: 166_771,
    cashWalker_delta_cents: 166_772,
    cent_drift_cents: 1,
    cent_drift_source: 'fixII-04 NFLX: |entry_cash|−|exit_cash| = 999571−964261 = 35310 vs realized round(294*(33.999−32.798)*100) = 35309',
  };
  return [
    '# ' + JSON.stringify(header),
    '# ---',
    ...rows.map(r => JSON.stringify(r)),
    JSON.stringify(terminal),
    '',
  ].join('\n');
}

export function buildAll(): { handTruth: string; bars: string; calendar: string; checkpoints: string } {
  return {
    handTruth: serializeHandTruth(LOTS),
    bars: serializeBars(BARS),
    calendar: serializeCalendar(SPY_FULL_CALENDAR, [
      ...new Set([
        ...LOTS.map(l => l.entry_date),
        ...LOTS.map(l => l.exit_date),
        ...CHECKPOINTS,
      ]),
    ].sort()),
    checkpoints: serializeCheckpoints(),
  };
}

if (import.meta.main) {
  const out = buildAll();
  const base = 'fixtures/overshoot-backtest';
  await Deno.writeTextFile(base + '/2023-Q2-hand-truth.jsonl', out.handTruth);
  await Deno.writeTextFile(base + '/2023-Q2-bars.jsonl', out.bars);
  await Deno.writeTextFile(base + '/2023-Q2-calendar.jsonl', out.calendar);
  await Deno.writeTextFile(base + '/2023-Q2-checkpoints.jsonl', out.checkpoints);
  console.log('wrote fixture-ii: ' + LOTS.length + ' lots, ' + BARS.length + ' bars');
}
