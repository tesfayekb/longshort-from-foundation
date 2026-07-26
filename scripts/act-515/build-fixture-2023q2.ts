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

// ────────────────────────────────────────────────────────────────────────────
// TURN-2 FULL RE-PICK (2026-07-25T23:20:13Z, gate_turn2_open) — supersedes ALL
// prior DRAFT-INVALID sha-stamps of this fixture. TWO defects jointly repaired:
//   (a) SHORT exits were LONG-generalized (short/T1 & T2 parked at long-T1/T2
//       exits) — repaired at kernel `scripts/act-515/kernel/exit.ts`
//       EXIT_ANCHOR_BY_SIDE_TIER in TURN-1.
//   (b) LONG exit convention was off-by-one vs. `session-age.ts` — filed as
//       INC-143 instance #3 (fixture-header convention drift). Corrective law:
//       fixture headers MUST state the ENTRY-ANCHORED holdingDayOrdinal form
//       verbatim (matching kernel dispatch keys); event-anchored phrasing is
//       derived-under-T+1 footnote only. Exemplar: fixture-i header at
//       fixtures/overshoot-backtest/2024-05-02-hand-truth.jsonl (already
//       certified in Gate half-1).
// Every one of the 14 lots below is reconciled to kernel EXIT_ANCHOR_BY_SIDE_TIER
// (10 LONGs + 4 SHORTs). All checkpoints rederived. See CHECKPOINT
// HAND-ARITHMETIC block below for the fixII-11/CHK-3 boundary case (flips to
// CLOSED on 06-02, open list drops from three to two).
// ────────────────────────────────────────────────────────────────────────────
const LOTS: ReadonlyArray<LotPick> = [
  // fixII-01 XOM long T2. shares=floor(10000/116.26)=86.
  //   exit = sessionAfter(entryDate=04-04, 9) → 04-05(1),04-06(2),04-10(3),
  //          04-11(4),04-12(5),04-13(6),04-14(7),04-17(8),04-18(9) = 04-18.
  //   Δcash walker = +5848; realized M6 = +5848; no drift.
  { lot_id:'fixII-01', ticker:'XOM',  side:'long',  tier:'T2', event_date:'2023-04-03', entry_date:'2023-04-04', exit_date:'2023-04-18', entry_open:116.26, exit_close:116.94 },
  // fixII-02 TSLA short T2. shares=50.
  //   exit = sessionAfter(entryDate=04-04, 4) → 04-05(1),04-06(2),04-10(3),04-11(4) = 04-11.
  //   NAMED REGRESSION ANCHOR — see scripts/act-515/kernel/exit_test.ts (TSLA short 5-session case).
  //   Δcash walker = +52650; realized M6 = +52650; no drift.
  { lot_id:'fixII-02', ticker:'TSLA', side:'short', tier:'T2', event_date:'2023-04-03', entry_date:'2023-04-04', exit_date:'2023-04-11', entry_open:197.32, exit_close:186.79 },
  // fixII-03 NVDA short T1. shares=376.
  //   exit = sessionAfter(entryDate=04-06, 4) → 04-10(1),04-11(2),04-12(3),04-13(4) = 04-13.
  //   Δcash walker = +4549; realized M6 = +4550; DRIFT −1c (walker LOW).
  //   Source of drift: 3-decimal prices (26.584 → 26.463) → round-per-lot vs
  //   integer-cent-diff arithmetic diverge by one cent. Certified separately.
  { lot_id:'fixII-03', ticker:'NVDA', side:'short', tier:'T1', event_date:'2023-04-05', entry_date:'2023-04-06', exit_date:'2023-04-13', entry_open:26.584, exit_close:26.463 },
  // fixII-04 NFLX short T1. shares=294.
  //   exit = sessionAfter(entryDate=04-13, 4) → 04-14(1),04-17(2),04-18(3),04-19(4) = 04-19.
  //   Δcash walker = +49598; realized M6 = +49598; no drift.
  //   (NB — the prior 1c NFLX drift disappears under the new exit price 32.312;
  //    the surviving cent-drift shifts to fixII-03 NVDA.)
  { lot_id:'fixII-04', ticker:'NFLX', side:'short', tier:'T1', event_date:'2023-04-12', entry_date:'2023-04-13', exit_date:'2023-04-19', entry_open:33.999, exit_close:32.312 },
  // fixII-05 JPM long T2. shares=71.
  //   exit = sessionAfter(entryDate=04-17, 9) → 04-18(1),04-19(2),04-20(3),
  //          04-21(4),04-24(5),04-25(6),04-26(7),04-27(8),04-28(9) = 04-28.
  //   Δcash walker = −12141; realized M6 = −12141; no drift.
  { lot_id:'fixII-05', ticker:'JPM',  side:'long',  tier:'T2', event_date:'2023-04-14', entry_date:'2023-04-17', exit_date:'2023-04-28', entry_open:139.95, exit_close:138.24 },
  // fixII-06 GOOG short T1. shares=93.
  //   exit = sessionAfter(entryDate=04-18, 4) → 04-19(1),04-20(2),04-21(3),04-24(4) = 04-24.
  //   Δcash walker = +2046; realized M6 = +2046; no drift.
  { lot_id:'fixII-06', ticker:'GOOG', side:'short', tier:'T1', event_date:'2023-04-17', entry_date:'2023-04-18', exit_date:'2023-04-24', entry_open:107.00, exit_close:106.78 },
  // fixII-07 MSFT long T2. shares=33.
  //   exit = sessionAfter(entryDate=04-27, 9) → 04-28(1),05-01(2),05-02(3),
  //          05-03(4),05-04(5),05-05(6),05-08(7),05-09(8),05-10(9) = 05-10.
  //   Δcash walker = +53922; realized M6 = +53922; no drift.
  { lot_id:'fixII-07', ticker:'MSFT', side:'long',  tier:'T2', event_date:'2023-04-26', entry_date:'2023-04-27', exit_date:'2023-05-10', entry_open:295.97, exit_close:312.31 },
  // fixII-08 MSFT long T1. shares=32.
  //   exit = sessionAfter(eventDate=04-27, 6) → 04-28(1),05-01(2),05-02(3),
  //          05-03(4),05-04(5),05-05(6) = 05-05.
  //   Δcash walker = +21248; realized M6 = +21248; no drift.
  { lot_id:'fixII-08', ticker:'MSFT', side:'long',  tier:'T1', event_date:'2023-04-27', entry_date:'2023-04-28', exit_date:'2023-05-05', entry_open:304.01, exit_close:310.65 },
  // fixII-09 AAPL long T2. shares=57.
  //   exit = sessionAfter(entryDate=05-08, 9) → 05-09(1),05-10(2),05-11(3),
  //          05-12(4),05-15(5),05-16(6),05-17(7),05-18(8),05-19(9) = 05-19.
  //   Δcash walker = +15276; realized M6 = +15276; no drift.
  { lot_id:'fixII-09', ticker:'AAPL', side:'long',  tier:'T2', event_date:'2023-05-05', entry_date:'2023-05-08', exit_date:'2023-05-19', entry_open:172.48, exit_close:175.16 },
  // fixII-10 AAPL long T1. shares=57.
  //   exit = sessionAfter(eventDate=05-11, 6) → 05-12(1),05-15(2),05-16(3),
  //          05-17(4),05-18(5),05-19(6) = 05-19.
  //   Δcash walker = +8778; realized M6 = +8778; no drift.
  //   (Cohort exit-day parity with fixII-09; both close 05-19 at 175.16.)
  { lot_id:'fixII-10', ticker:'AAPL', side:'long',  tier:'T1', event_date:'2023-05-11', entry_date:'2023-05-12', exit_date:'2023-05-19', entry_open:173.62, exit_close:175.16 },
  // fixII-11 XOM long T1. shares=94.
  //   exit = sessionAfter(eventDate=05-24, 6) → 05-25(1),05-26(2),05-30(3),
  //          05-31(4),06-01(5),06-02(6) = 06-02.
  //   BOUNDARY CASE — exit_date == CHK-3 date. On checkpoint end-of-day the
  //   lot is CLOSED (walker exit fires at close, then checkpoint reads
  //   end-of-day state). Open-list on CHK-3 therefore drops from three lots
  //   to two (fixII-12, fixII-13 only). See CHECKPOINT HAND-ARITHMETIC below.
  //   Δcash walker = −1692; realized M6 = −1692; no drift.
  { lot_id:'fixII-11', ticker:'XOM',  side:'long',  tier:'T1', event_date:'2023-05-24', entry_date:'2023-05-25', exit_date:'2023-06-02', entry_open:105.94, exit_close:105.76 },
  // fixII-12 MSFT long T2. shares=30.
  //   exit = sessionAfter(entryDate=05-31, 9) → 06-01(1),06-02(2),06-05(3),
  //          06-06(4),06-07(5),06-08(6),06-09(7),06-12(8),06-13(9) = 06-13.
  //   Δcash walker = +6000; realized M6 = +6000; no drift.
  { lot_id:'fixII-12', ticker:'MSFT', side:'long',  tier:'T2', event_date:'2023-05-30', entry_date:'2023-05-31', exit_date:'2023-06-13', entry_open:332.29, exit_close:334.29 },
  // fixII-13 MSFT long T1. shares=30.
  //   exit = sessionAfter(eventDate=05-31, 6) → 06-01(1),06-02(2),06-05(3),
  //          06-06(4),06-07(5),06-08(6) = 06-08.
  //   Δcash walker = −2010; realized M6 = −2010; no drift.
  { lot_id:'fixII-13', ticker:'MSFT', side:'long',  tier:'T1', event_date:'2023-05-31', entry_date:'2023-06-01', exit_date:'2023-06-08', entry_open:325.93, exit_close:325.26 },
  // fixII-14 XOM long T2. shares=91.
  //   exit = sessionAfter(entryDate=06-08, 9) → 06-09(1),06-12(2),06-13(3),
  //          06-14(4),06-15(5),06-16(6),06-20(7),06-21(8),06-22(9) = 06-22.
  //   Δcash walker = −49777; realized M6 = −49777; no drift.
  { lot_id:'fixII-14', ticker:'XOM',  side:'long',  tier:'T2', event_date:'2023-06-07', entry_date:'2023-06-08', exit_date:'2023-06-22', entry_open:108.77, exit_close:103.30 },
];

interface Bar { readonly ticker: string; readonly trade_date: string; readonly close: number; }

const BARS: ReadonlyArray<Bar> = [
  { ticker:'XOM',  trade_date:'2023-04-04', close:115.02 },
  { ticker:'TSLA', trade_date:'2023-04-04', close:192.58 },
  { ticker:'XOM',  trade_date:'2023-04-06', close:115.05 },
  { ticker:'TSLA', trade_date:'2023-04-06', close:185.06 },
  { ticker:'NVDA', trade_date:'2023-04-06', close:27.037 },
  // TURN-2 additions — new exit-day and mid-flight closes under corrected kernel
  // (queried from public.overshoot_daily_bars 2026-07-25T23:20:13Z, same source).
  { ticker:'XOM',  trade_date:'2023-04-11', close:115.35 },
  { ticker:'TSLA', trade_date:'2023-04-11', close:186.79 },
  { ticker:'NVDA', trade_date:'2023-04-11', close:27.169 },
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
  { ticker:'JPM',  trade_date:'2023-04-24', close:140.73 },
  { ticker:'GOOG', trade_date:'2023-04-24', close:106.78 },
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
  { ticker:'MSFT', trade_date:'2023-05-05', close:310.65 },
  { ticker:'MSFT', trade_date:'2023-05-08', close:308.65 },
  { ticker:'AAPL', trade_date:'2023-05-08', close:173.50 },
  { ticker:'AAPL', trade_date:'2023-05-10', close:173.555 },
  { ticker:'MSFT', trade_date:'2023-05-10', close:312.31 },
  { ticker:'MSFT', trade_date:'2023-05-11', close:310.11 },
  { ticker:'AAPL', trade_date:'2023-05-11', close:173.75 },
  { ticker:'AAPL', trade_date:'2023-05-12', close:172.57 },
  { ticker:'AAPL', trade_date:'2023-05-16', close:172.07 },
  { ticker:'AAPL', trade_date:'2023-05-19', close:175.16 },
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
  { ticker:'XOM',  trade_date:'2023-06-13', close:106.44 },
  { ticker:'MSFT', trade_date:'2023-06-13', close:334.29 },
  { ticker:'MSFT', trade_date:'2023-06-14', close:337.34 },
  { ticker:'XOM',  trade_date:'2023-06-14', close:105.16 },
  { ticker:'XOM',  trade_date:'2023-06-22', close:103.30 },
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
// TURN-2 FULL RE-PICK under EXIT_ANCHOR_BY_SIDE_TIER. Per-lot walker deltas:
//   01 +5848  02 +52650  03 +4549  04 +49598  05 -12141  06 +2046  07 +53922
//   08 +21248 09 +15276  10 +8778  11 -1692   12 +6000   13 -2010   14 -49777
//
// CHK-1  2023-05-04:
//   Closed by 05-04: 01..06 (all exits ≤ 04-28).
//     Σ walker closed = 5848+52650+4549+49598−12141+2046 = 102_550
//   Open on 05-04: 07 (33sh MSFT long, entry 976_701), 08 (32sh MSFT long, entry 972_832)
//     Σ open entry_cost = 1_949_533
//   Cash = 10_000_000 + 102_550 − 1_949_533 = 8_153_017
//   Marks (MSFT close 305.41): 33×305.41 = 10_078.53 → +1_007_853;
//                              32×305.41 =  9_773.12 → +977_312
//                              Σ longMv = 1_985_165
//   equity = 10_138_182 cents
//
// CHK-2  2023-05-16:
//   Closed 01..08 (07 exit 05-10, 08 exit 05-05).
//     Σ walker closed = 102_550 + 53_922 + 21_248 = 177_720
//   Open on 05-16: 09 (57sh AAPL, entry 983_136), 10 (57sh AAPL, entry 989_634)
//     Σ open entry_cost = 1_972_770
//   Cash = 10_000_000 + 177_720 − 1_972_770 = 8_204_950
//   Marks (AAPL close 172.07): 2 × 57×172.07 = 2 × 9_807.99 → 2 × +980_799 = +1_961_598
//   equity = 10_166_548 cents
//
// CHK-3  2023-06-02:
//   Closed 01..11 (09,10 exit 05-19; 11 exit 06-02 — BOUNDARY, closes ON checkpoint).
//     Σ walker closed = 177_720 + 15_276 + 8_778 + (−1_692) = 200_082
//   Open on 06-02 (end-of-day): 12 (30sh MSFT, entry 996_870),
//                               13 (30sh MSFT, entry 977_790)
//     Σ open entry_cost = 1_974_660  (fixII-11's 995_836 has been recycled to cash)
//   Cash = 10_000_000 + 200_082 − 1_974_660 = 8_225_422
//   Marks (MSFT close 335.40): 2 × 30×335.40 = 2 × 10_062.00 → 2 × +1_006_200 = +2_012_400
//   equity = 10_237_822 cents
//   BOUNDARY-CASE NOTE: fixII-11 XOM long/T1 kernel exit resolves to 06-02
//   via sessionAfter(eventDate=2023-05-24, 6) — the SAME session as CHK-3.
//   The walker executes the exit at 06-02 close, then the checkpoint snapshots
//   end-of-day state, so fixII-11 sits in the CLOSED set at CHK-3 (contributes
//   to cash, NOT to longMv). Open-list therefore drops from {11,12,13} (the
//   pre-TURN-2 DRAFT-INVALID expectation) to {12,13}.
//
// TERMINAL 2023-06-23:
//   All 14 closed by 06-22 (last exit fixII-14).
//   Σ walker = 200_082 + 6_000 + (−2_010) + (−49_777) = 154_295
//   terminal_cash = 10_000_000 + 154_295 = 10_154_295 cents
//   Σ realizedCents (Module 6) = 154_296 cents (drift +1c: fixII-03 NVDA
//     26.584→26.463 with 376 shares — walker LOW by 1c, M6 HIGH by 1c).
// ============================================================================

function serializeHandTruth(lots: ReadonlyArray<LotPick>): string {
  const header = {
    epoch: 'ACT-515-gate-half-2-fixture-ii',
    source: 'public.overshoot_study_candidate_events (ratified study corpus) + public.overshoot_daily_bars',
    source_chain_cite: 'docs/08-planning/artifacts/ACT-509-STAGE2-PRESCREEN-final-day-forfeit-v2.md:22-52 (pre-screen v2 SPY-ordinal FROM/WHERE chain)',
    window: '2023-Q2 (event_dates 2023-04-03 → 2023-06-07)',
    entry_convention: 'T+1 open (SPY-ordinal +1 from event_date)',
    exit_convention_map: {
      'long/T1':  'sessionAfter(eventDate, 6)  ⇔ holdingDayOrdinal>=7  (session-age.ts:57-70)',
      'long/T2':  'sessionAfter(entryDate, 9)  ⇔ holdingDayOrdinal>=10 (session-age.ts:88-93)',
      'short/T1': 'sessionAfter(entryDate, 4)  ⇔ holdingDayOrdinal>=5  (session-age.ts:142-147, 266-274)',
      'short/T2': 'sessionAfter(entryDate, 4)  ⇔ holdingDayOrdinal>=5  (session-age.ts:142-147, 266-274)',
    },
    exit_convention_note: 'DEFINED per kernel dispatch keys verbatim (EXIT_ANCHOR_BY_SIDE_TIER in scripts/act-515/kernel/exit.ts). The prior fixture-header phrasing "T1 = SPY-ordinal event+7 close; T2 = SPY-ordinal event+11 close" is a derived-under-T+1 footnote only, and was off-by-one for long/T2 (event+11 = entry+10 = kernel entry+9 + 1). Rewritten per INC-143 instance #3 corrective law — exemplar: fixture-i header at fixtures/overshoot-backtest/2024-05-02-hand-truth.jsonl.',
    sizing_rule: 'floor($10,000 / entry_open); no fractional shares',
    pnl_rule: 'LONG pnl_usd = shares * (exit_close - entry_open); SHORT pnl_usd = shares * (entry_open - exit_close); pnl_cents = round(pnl_usd * 100)',
    cash_rule: 'long entry cash-out = +round(shares*entry*100); long exit cash-in = +round(shares*exit*100); short entry cash-out = -round(shares*entry*100); short exit cash-in = -round(shares*exit*100)',
    bars_source: 'public.overshoot_daily_bars (adjusted per ingestion)',
    haircut_mode: 'none (hand arithmetic haircut-free)',
    cent_drift_note: '3-decimal prices cause 1-cent drift between Σ realizedCents (Module 6, round-per-lot) and cash-walker terminal cash (Module 7, integer-cent-diff). Under TURN-2 exits the surviving drift shifts from fixII-04 NFLX to fixII-03 NVDA (M6 = +154_296; walker = +154_295; delta = +1c HIGH on M6). Fixture certifies BOTH separately.',
    starting_equity_usd: 100_000,
    lots: lots.length,
    sides: { long: lots.filter(l => l.side === 'long').length, short: lots.filter(l => l.side === 'short').length },
    tiers: { T1: lots.filter(l => l.tier === 'T1').length, T2: lots.filter(l => l.tier === 'T2').length },
    tickers: [...new Set(lots.map(l => l.ticker))].sort(),
    authored_ts: '2026-07-25T23:20:13Z (SELECT now() gate_turn2_open — SUPERSEDES pre-TURN-2 DRAFT-INVALID stamps)',
    supersedes_sha_note: 'TURN-2 FULL RE-PICK supersedes all prior DRAFT-INVALID sha-stamps of the four fixture-ii jsonl files. Two jointly-repaired defects: (a) SHORT exits were LONG-generalized — repaired at kernel exit.ts EXIT_ANCHOR_BY_SIDE_TIER in TURN-1 (2026-07-25 earlier); (b) LONG exit-convention was off-by-one vs session-age.ts — filed as INC-143 instance #3, corrected in this same emit per the corrective-law reading of the fixture-i header exemplar.',
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
    { checkpoint: 'CHK-1',    sessionDate: '2023-05-04', cashCents:  8_153_017, longMvCents: 1_985_165, shortMvCents: 0, equityCents: 10_138_182, openLotIds: ['fixII-07','fixII-08'] },
    { checkpoint: 'CHK-2',    sessionDate: '2023-05-16', cashCents:  8_204_950, longMvCents: 1_961_598, shortMvCents: 0, equityCents: 10_166_548, openLotIds: ['fixII-09','fixII-10'] },
    { checkpoint: 'CHK-3',    sessionDate: '2023-06-02', cashCents:  8_225_422, longMvCents: 2_012_400, shortMvCents: 0, equityCents: 10_237_822, openLotIds: ['fixII-12','fixII-13'] },
  ];
  const terminal = {
    checkpoint: 'TERMINAL', sessionDate: '2023-06-23',
    cashCents: 10_154_295, longMvCents: 0, shortMvCents: 0, equityCents: 10_154_295,
    sumRealizedCents_module6: 154_296,
    cashWalker_delta_cents: 154_295,
    cent_drift_cents: 1,
    cent_drift_source: 'fixII-03 NVDA: cash-walker Δ = round(376*26.584*100)−round(376*26.463*100) = 999558−995009 = 4549 vs realized round(376*(26.584−26.463)*100) = 4550 (walker LOW by 1c under TURN-2 exits; prior NFLX drift eliminated by new 32.312 exit close).',
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
