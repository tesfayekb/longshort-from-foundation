// ACT-515 Kernel — Module 1: Types.
//
// SCOPE: pure TypeScript vocabulary consumed by all subsequent kernel modules
// (clock → admit → size → mark → exit → equity/DD). Zero Deno/edge coupling;
// no I/O; no wall-clock; no RNG; no defaults. Every optional field is typed
// `T | null` (anti-phantom defaults rule — no silent sentinels in money paths).
//
// FOUR PINS (per ruling 2026-07-25):
//
//   (a) VOCABULARY PARITY — literals grep-anchored to their source of truth:
//         · `CellKey.side` is LOWERCASE 'long'|'short'  — DB convention
//           (INC-138 invariant). Grep-anchor:
//             supabase/functions/overshoot-entry-run/index.ts:878-879
//             ("s.side === 'long'" / "s.side === 'short'").
//         · `CellKey.band` values are byte-identical to
//           `overshoot_study_cell_results.band` and to the classifier in
//             supabase/functions/_shared/overshoot/detector/band-label.ts:48-63
//             ('L_10_INF','L_08_10','L_06_08','L_05_06','L_04_05','L_03_04',
//              'S_10_INF','S_08_10','S_06_08','S_05_06','S_04_05','S_03_04').
//         · Detector uses UPPERCASE 'LONG'|'SHORT' at a DIFFERENT layer
//             (supabase/functions/_shared/overshoot/detector/detector.ts:119
//              "export type Side = 'LONG' | 'SHORT'").
//           Any mapping between the two is done by an explicit function with
//           a test — NEVER by implicit case-blur. `sideDbToDetector` below
//           is the ONE mapping function; its inverse lives in the detector
//           layer.
//
//   (b) FIXTURE ROW TYPE — the exact shape of
//         fixtures/overshoot-backtest/2024-05-02-hand-truth.jsonl
//       (header comment line + '---' separator + data lines). See
//       `HandTruthFixtureHeader` and `HandTruthFixtureRow` below. Fixture
//       preserves the ORIGINAL uppercase 'LONG'|'SHORT' as written on disk
//       (grep-anchor: fixtures/overshoot-backtest/2024-05-02-hand-truth.jsonl:3
//        '"side":"LONG"'). Callers convert to CellKey.side via
//       `sideDetectorToDb` when keying study cells.
//
//   (c) REFUSAL ENUM — only literals actually emitted by
//         supabase/functions/overshoot-entry-run/index.ts
//       Grep-anchored top-level tally categories (index.ts:294-334) plus the
//       terminal no-op `reason` strings (index.ts:533,619,653,719,741,1003).
//       No phantom strings (FLAG-A/B lesson). Nested sub-refusals
//       (`i5_refusal.*`, `price_refusal.*`, `sizing_refusal.*`, etc.) are
//       modelled as free-form `subReason: string | null` — the kernel does
//       not reason on them; only counts.
//
//   (d) BRANDED numerics + injected Clock/RngSource + typed-absence. A
//       companion lint test (`types_test.ts`) asserts this module contains
//       no `Date.now` / `new Date(` / `Math.random` tokens — anti-phantom
//       rule enforced as a test, not a comment.

// -----------------------------------------------------------------------------
// Branded numeric types
// -----------------------------------------------------------------------------

declare const MoneyBrand: unique symbol;
/** USD amount. Use `money(n)` constructor; never coerce a raw number. */
export type Money = number & { readonly [MoneyBrand]: 'Money' };

declare const BpsBrand: unique symbol;
/** Basis points (1 bps = 0.0001). Use `bps(n)` constructor. */
export type Bps = number & { readonly [BpsBrand]: 'Bps' };

declare const SharesBrand: unique symbol;
/** Integer share count. Use `shares(n)` constructor; fractional shares REJECTED. */
export type Shares = number & { readonly [SharesBrand]: 'Shares' };

declare const PriceBrand: unique symbol;
/** Positive USD-per-share price. Use `price(n)` constructor. */
export type Price = number & { readonly [PriceBrand]: 'Price' };

export function money(n: number): Money {
  if (!Number.isFinite(n)) throw new Error(`money: non-finite (${n})`);
  return n as Money;
}
export function bps(n: number): Bps {
  if (!Number.isFinite(n)) throw new Error(`bps: non-finite (${n})`);
  return n as Bps;
}
export function shares(n: number): Shares {
  if (!Number.isInteger(n)) throw new Error(`shares: non-integer (${n})`);
  if (n < 0) throw new Error(`shares: negative (${n})`);
  return n as Shares;
}
export function price(n: number): Price {
  if (!Number.isFinite(n)) throw new Error(`price: non-finite (${n})`);
  if (n <= 0) throw new Error(`price: non-positive (${n})`);
  return n as Price;
}

// -----------------------------------------------------------------------------
// Side + CellKey vocabulary (grep-anchored per PIN (a))
// -----------------------------------------------------------------------------

/** DB-layer side literal (LOWERCASE). Matches `overshoot_events.side`
 *  and the entry-run selection filter (index.ts:878-879). */
export type SideDb = 'long' | 'short';

/** Detector-layer side literal (UPPERCASE). Matches
 *  `_shared/overshoot/detector/detector.ts:119`. Kept as a NAMED separate
 *  type — never mixed with SideDb by implicit case-blur (INC-138). */
export type SideDetector = 'LONG' | 'SHORT';

/** Band label literal set. Byte-identical to
 *  `overshoot_study_cell_results.band` and to the classifier at
 *  `_shared/overshoot/detector/band-label.ts:48-63`. */
export type BandLabel =
  | 'L_03_04' | 'L_04_05' | 'L_05_06' | 'L_06_08' | 'L_08_10' | 'L_10_INF'
  | 'S_03_04' | 'S_04_05' | 'S_05_06' | 'S_06_08' | 'S_08_10' | 'S_10_INF';

export const LONG_BAND_LABELS: ReadonlyArray<BandLabel> =
  ['L_03_04','L_04_05','L_05_06','L_06_08','L_08_10','L_10_INF'];
export const SHORT_BAND_LABELS: ReadonlyArray<BandLabel> =
  ['S_03_04','S_04_05','S_05_06','S_06_08','S_08_10','S_10_INF'];

/** Study-cell composite key. Matches the natural key of
 *  `overshoot_study_cell_results`: (side, band, argmax_window_days,
 *   magnitude_quintile, drawdown_bucket, exclusion_horizon_days). */
export interface CellKey {
  readonly side: SideDb;               // lowercase per DB
  readonly band: BandLabel;            // grep-anchored to band-label.ts
  readonly argmaxWindowDays: number;   // integer 1..5 in current substrate
  readonly magnitudeQuintile: number;  // integer 1..5
  readonly drawdownBucket: number;     // integer bucket id
  readonly exclusionHorizonDays: number; // typically 5
}

/** ONE mapping function db→detector. Inverse (`sideDetectorToDb`) below. */
export function sideDbToDetector(s: SideDb): SideDetector {
  return s === 'long' ? 'LONG' : 'SHORT';
}
export function sideDetectorToDb(s: SideDetector): SideDb {
  return s === 'LONG' ? 'long' : 'short';
}

// -----------------------------------------------------------------------------
// Refusal enum (grep-anchored per PIN (c))
// -----------------------------------------------------------------------------

/** Top-level tally categories emitted by overshoot-entry-run.
 *  Grep-anchor: supabase/functions/overshoot-entry-run/index.ts:292-334
 *  (includes `position_already_open` at :292 + :323 + :1126). */
export type RefusalTallyKey =
  | 'i5_refusals'
  | 'sizing_refusals'
  | 'buying_power_refusals'
  | 'shortability_refusals'
  | 'position_already_open'
  | 'allocation_cap_reached'
  | 'daily_budget_reached'
  | 'short_daily_budget_reached';

/** Terminal no-op reasons emitted at outcome:'no_op'.
 *  Grep-anchor: index.ts:533,619,653,719,741,1003. */
export type NoOpReason =
  | 'job_disarmed'
  | 'market_closed'
  | 'run_already_exists'
  | 'strategy_config_absent'
  | 'equity_snapshot_unavailable'
  | 'budget_exhausted_pre_loop';

// -----------------------------------------------------------------------------
// Sizing refusal vocabulary (Module 4 — SIZE)
// -----------------------------------------------------------------------------

/** Typed refusals emitted by the SIZE module (`size.ts`).
 *  Each literal is either grep-anchored to production or explicitly
 *  LABELED `kernel-only` per PIN (d) of the SIZE ruling (2026-07-25).
 *  No phantom production strings.
 *
 *  · `below_min_share` — KERNEL-ONLY. Rounded share count is <1 after
 *      `Math.floor(slotNotional / price)`. Production's nearest analogue
 *      is `reference_price_exceeds_slot_notional`
 *      (supabase/functions/_shared/overshoot-execution/sizing.ts:290) but
 *      the kernel names the OUTCOME (shares<1) rather than the CAUSE
 *      (price>slot), because the kernel's slot may derive from either the
 *      constant $2,500/$5,000 rail OR from a compounding equity path —
 *      cause-phrasing would be ambiguous. Labeled kernel-only to prevent
 *      grep-collision with the production audit stream.
 *  · `zero_price_guard` — KERNEL-ONLY. Data-absent Price (null / not
 *      supplied). The `price()` brand constructor already rejects ≤ 0
 *      and non-finite at construction time; this refusal covers the
 *      DATA-LAYER absence (no bar / no reference) that would prevent a
 *      Price from ever being constructed. Explicitly kernel-only —
 *      production keys this off `entry_reference_price_null` upstream
 *      of sizing (index.ts:1180-1194) and never reaches the sizing call.
 *  · `notional_overflow` — KERNEL-ONLY. Product `shares × price` in
 *      integer-cents overflows `Number.MAX_SAFE_INTEGER`. Cannot occur
 *      at realistic $100k-scale equity but is asserted as a guard so a
 *      pathological property-test input yields a typed refusal, not a
 *      silent precision loss. */
export type SizingRefusalCode =
  | 'below_min_share'
  | 'zero_price_guard'
  | 'notional_overflow';

// -----------------------------------------------------------------------------
// Mark refusal vocabulary (Module 5 — MARK)
// -----------------------------------------------------------------------------

/** Typed refusal emitted by the MARK module (`mark.ts`).
 *  KERNEL-ONLY per PIN (c) of the MARK ruling (2026-07-25): the missing-bar
 *  policy is a kernel modeling choice — production's equity snapshot writer
 *  omits the mark entirely when a bar is absent (see
 *  `supabase/functions/overshoot-equity-snapshot/index.ts:84-89` — rows with
 *  no `market_value` are simply not summed). The kernel instead PROPAGATES a
 *  typed absence so the DD curve can flag stale-mark days rather than
 *  silently priced them.
 *
 *  · `mark_unavailable` — no fresh bar AND either (i) no prior mark to carry
 *      forward, or (ii) carry-forward would exceed `maxCarryDays`. Emitted
 *      per-lot-day; the aggregate carries `unavailableLots > 0` and the DD
 *      curve consumer is expected to widen its confidence band or halt. */
export type MarkRefusalCode = 'mark_unavailable';

// -----------------------------------------------------------------------------
// Exit vocabulary + refusals (Module 6 — EXIT)
// -----------------------------------------------------------------------------

/** Tier literal consumed by the exit-ordinal lookup. Matches the study
 *  substrate: T1 (long-tail) exits at ord-6; T2 (short-tail) at ord-10.
 *  Grep-anchor for exit ordinals: operator PIN (a) of the EXIT ruling
 *  (2026-07-25), corroborated by the hand-truth fixture header
 *  (`exit_convention:"ordinal-10 close (LONG T2 …)"`) at
 *    fixtures/overshoot-backtest/2024-05-02-hand-truth.jsonl:1. */
export type Tier = 'T1' | 'T2';

/** Typed refusals emitted by the EXIT module (`exit.ts`).
 *  KERNEL-ONLY per PIN (b) of the EXIT ruling (2026-07-25). No phantom
 *  production strings.
 *
 *  · `exit_calendar_exhausted` — the injected `SessionCalendar` returned
 *      `null` for the tier's ordinal; the study horizon does not reach far
 *      enough forward from `eventDate`. Emitted rather than clamping to
 *      the last known session — clamping would silently redefine the exit
 *      basis.
 *  · `exit_price_unavailable` — the exit-day close (and any carry-forward
 *      up to `maxCarryDays`) is absent. Mirror of `mark_unavailable` at
 *      the exit fill; a typed refusal rather than fabricating an exit price
 *      from the prior mark. */
export type ExitRefusalCode =
  | 'exit_calendar_exhausted'
  | 'exit_price_unavailable';

/** Per-selection refusal record. `subReason` carries the nested class
 *  (`i5_refusal.<x>`, `price_refusal.<y>`, etc.) verbatim from the audit
 *  action string; the kernel does not enumerate those — it only counts. */
export interface RefusalRecord {
  readonly ticker: string;
  readonly side: SideDb;
  readonly category: RefusalTallyKey;
  readonly subReason: string | null;
}

// -----------------------------------------------------------------------------
// Injected Clock + RngSource (PIN (d))
// -----------------------------------------------------------------------------

/** Injected clock. Kernel NEVER reads wall-clock; caller supplies `nowMs`
 *  or `replayAsOf` per the anti-phantom rule. */
export interface Clock {
  /** UTC epoch milliseconds at the moment the kernel is evaluating. */
  nowMs(): number;
}

/** Injected RNG. Deterministic FNV-1a (or equivalent) — session-matched
 *  per L-01 pattern. Kernel NEVER calls Math.random. */
export interface RngSource {
  /** Returns a float in [0,1). Implementation is caller's responsibility. */
  next(): number;
}

// -----------------------------------------------------------------------------
// Fixture row type (PIN (b))
// -----------------------------------------------------------------------------

/** Header of fixtures/overshoot-backtest/2024-05-02-hand-truth.jsonl.
 *  The file's first line is `# {json}` (comment-prefixed JSON metadata),
 *  followed by a `# ---` separator, then data lines. See the fixture:
 *    fixtures/overshoot-backtest/2024-05-02-hand-truth.jsonl:1-2 */
export interface HandTruthFixtureHeader {
  readonly epoch: string;                    // e.g. "ACT-515-hand-truth-v1"
  readonly as_of_event_date: string;         // ISO date "YYYY-MM-DD"
  readonly entry_convention: string;
  readonly exit_convention: string;
  readonly entry_date: string;               // ISO date
  readonly exit_date: string;                // ISO date
  readonly sizing_usd: number;               // e.g. 2500.0
  readonly shares_rule: string;
  readonly pnl_rule: string;
  readonly bars_source: string;
  readonly selection_source: string;
  readonly sides_note: string;
  readonly generated_at_utc: string;         // ISO timestamp
}

/** One data row from the hand-truth fixture (post-header, non-comment line).
 *  Fixture preserves detector-layer UPPERCASE side (`"side":"LONG"`).
 *  Grep-anchor: fixtures/overshoot-backtest/2024-05-02-hand-truth.jsonl:3 */
export interface HandTruthFixtureRow {
  readonly ticker: string;
  readonly side: SideDetector;               // 'LONG' | 'SHORT' as on disk
  readonly tier: string;                     // e.g. "T2"
  readonly entry_date: string;               // ISO date
  readonly entry_open: number;               // USD/share
  readonly exit_date: string;                // ISO date
  readonly exit_close: number;               // USD/share
  readonly shares: number;                   // integer
  readonly notional_usd: number;
  readonly pnl_usd: number;
  readonly pnl_bps: number;
}

/** Result of parsing the whole fixture file. */
export interface HandTruthFixture {
  readonly header: HandTruthFixtureHeader;
  readonly rows: ReadonlyArray<HandTruthFixtureRow>;
}