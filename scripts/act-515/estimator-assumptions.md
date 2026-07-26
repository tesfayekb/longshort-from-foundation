# ACT-515 Estimator & Assumptions Block — FROZEN

**Frozen:** 2026-07-25T05:27:07Z. Every numeric constant, rate citation, and
definitional choice below is locked pre-compute. Any change requires an INC + amendment
stamp (see `config-matrix.md` §7).

## 1. Leverage cost model (charter §1(b), C10 `margin-interest`)

**Rate used at 2×:** **50 bps/month flat** on the debit balance. Charter §1(b) states
this explicitly and §3 caveat 5 flags it as a **first-order modeling assumption, not a
broker P&L**.

**Cited-broker reference (ACT-565 §1 evidence anchor):** IBKR Pro tiered rates
**4.63%–5.13% annual** as of ACT-565 filing (2026-07-25). Alpaca default **6.25% annual**.
50 bps/month = **6.00% annual**, which sits between the two cited broker rates and is
deliberately conservative-ish vs IBKR (the migration target) and slightly-below Alpaca
(the current lane). This is a **charter-frozen rate**, not a broker quote — do NOT
substitute either broker's actual schedule mid-run.

**Accrual mechanics (charter §1(b) verbatim):** charged daily as
`(debit_balance / 30) × 0.0050 / 30` prorated (charter's stated formula). Aggregated to
a monthly line for the readout. `debit_balance = max(0, gross_market_value − equity)`
per side, applied to the long side; short-side interest treated per broker convention
(short proceeds credit-offset), and given the 90/10 side allocation, short debit
contribution is materially negligible — reported as `0` in C10 unless the accrual is > $1
cumulative.

**Reg-T maintenance flag (C9):** day flagged if `equity < 0.25 × gross_market_value`
(long) or short-side equivalent maintenance ratio would fire. **FLAG ONLY — no forced
liquidation** (charter §1(b) verbatim). Reported: count of call-days · largest
single-day call magnitude · cumulative days in call.

## 2. Fill / haircut assumptions

| Element | Value | Provenance |
|---|---|---|
| Entry fill proxy | T+N open (per horizon: T+2 for T1, T+1 for T2/SHORT) | ACT-514 basis + charter §1 |
| Exit fill proxy | T+M open (per horizon: T+6/T+11/T+6) | ACT-514 basis |
| Long-side haircut | **5 bps per side** (entry + exit) | Study-ratified (charter §3 caveat 4) |
| Short-side haircut | **15 bps per side** (entry + exit) | Study-ratified (charter §3 caveat 4) |
| Live slippage delta | TBD — ACT-506 open. Charter §3 caveat 4 pre-commits to a re-run + diff when landed. | ACT-506 |
| Borrow economics (short) | **NOT MODELED.** ACT-565 §2 standing caveat: Alpaca paper is blind to borrow fees; the shadow lane (ACT-572) will measure. R5 (SPY) and R1/R2/R3/R4 short legs ignore borrow cost. | ACT-565 §2 |
| Corporate actions | Applied via `corporate_actions` corpus at study-ratified precision (no re-derivation this charter) | ACT-514 basis |

## 3. Drawdown definition (C2, C3, C4, C5)

**Peak-to-trough on the equity path, MTM basis.** Compounding convention:

- Equity is marked daily at CLOSE against then-open lots at close-price + realized cash.
- **Peak** = running max of the daily equity series over the window.
- **Trough** = daily equity minimum reached AFTER the running peak, BEFORE recovery.
- **Recovery** = first day the equity series meets-or-exceeds the running peak that
  preceded the trough. If none by 2026-07-10, C3 recovery date = `UNRECOVERED`, C5 =
  `N/A-UNRECOVERED`.
- **MTM** includes: realized P&L + open-lot mark-to-close − haircuts already deducted at
  entry + (2× rows only) accrued margin interest through that day.

**Compounding convention:** the equity path IS compounded — realized gains/losses feed
the next day's equity, and (for `-comp` sizing variants) feed the next day's slot size.
For `-const` sizing variants, slot notional stays flat at $2,500 / $5,000 × 1.0 / × 2.0
regardless of equity path (this is the ACT-514 basis, preserved for direct comparability).

**Five-deepest-DDs** (§4a of matrix): ordered by MAGNITUDE of each distinct
peak-to-trough excursion — a new excursion begins after each recovery-to-prior-peak
event. Un-recovered final excursion counts if it exceeds the fifth-place magnitude.

## 4. Regime governor + counterfactuals

- **Regime bands:** per `_shared/overshoot/regime.ts` (ACT-478). SPY drawdown thresholds
  live in code, NOT re-parameterized by this charter.
- **Baseline (R1..R5):** governor throttles NEW T2 admissions in BEAR band (SPY dd <
  −15%). Governor does NOT liquidate the existing book — this is the intentional
  "stop-new-entries, ride-through" policy (ACT-514 §2 finding).
- **d1/d2/d3:** operate on the OPEN BOOK at BEAR-crossing close (see matrix §4c).
  Re-entry resumes when governor permits per existing thresholds; d1/d2/d3 do NOT
  change the governor's entry policy — they only add a book-liquidation / horizon-shortening
  step at the crossing day.

## 5. Layer-1 validity fixture — **VERIFIED PRESENT (INC-144 correction)**

**Operator instruction cited:** "the 2024-05-02 hand-truth fixture (sha `d06bd24c`)".

**Repo state (re-verified 2026-07-25 per operator ruling B1):**

| Check | Result |
|---|---|
| `git ls-tree -r HEAD -- fixtures/overshoot-backtest/` | `100644 c98d3d31... 2024-05-02-hand-truth.jsonl` |
| Add commit | `ff4b4aac2` (2026-07-23 18:07:05Z, gpt-engineer-app[bot]) |
| Delete commits touching `fixtures/**` (all refs) | **none** |
| `sha256sum fixtures/overshoot-backtest/2024-05-02-hand-truth.jsonl` | `d06bd24cadcb608c2525b042ec40a1db112fa6f363ac3ae288d3f4ac7ecff1a2` — **byte-exact match** |
| Content shape (line 1) | ACT-515 hand-truth-v1 header: `as_of_event_date:2024-05-02`, `entry_convention:T+1 open`, `exit_convention:ordinal-10 close`, `selection_source:fixtures/overshoot-detector-selection/2024-05-02.jsonl (N=20)` |
| Row count | 22 lines (1 header + 1 separator + 20 hand-computed T2 LONG rows: ANF..) |

**Prior-turn error (self-inflicted).** The earlier "sha does not appear
anywhere in the repo" claim was a string-grep for `d06bd24c` — a sha256
is a *content hash*, not a literal in the fixture file. Filed as
**INC-144** with the never-delete-class extension lesson.

**Layer-1 validity gate (RE-COMMITTED, pre-kernel):**

1. Selection-parity replay for 2024-05-02 (existing test) → **must be
   GREEN**.
2. Hand-truth replay against
   `fixtures/overshoot-backtest/2024-05-02-hand-truth.jsonl` — engine
   must reproduce every `entry_open / exit_close / shares / pnl_usd`
   for each of the 20 rows byte-exact. Sha of fixture read at test
   time = `d06bd24c...`; mismatch = TEST FAIL.
3. **Fixture #2 (built during kernel bring-up).** The engine
   README's 2023-Q2 window becomes the second hand-truth fixture,
   hand-computed during the `mark`/`equity` module turns. Two eras
   beats one — a quiet-regime three-month path exercises the
   equity/DD kernel where the single-event 2024-05-02 fixture only
   exercises the T+1 → T+10 pnl path.

**Compute-plan blocker B1:** CLOSED (see `compute-plan.md`). Matrix
compute proceeds after kernel + BOTH fixtures green.

## 6. What is NOT re-derived by this charter

To keep scope tight and reproducible:

- Selection cells (`045d2dfc`, ew=5) — read as-is from ratified study output.
- Regime band thresholds — read from `regime.ts` as-coded.
- Corpus event stream (`1888e113`) — read as-is.
- Detector predicate — read as-is (v2, ACT-575-ratified).
- Corporate-actions corpus — read as-is.

If any of these five inputs change mid-window during the run, the run is INVALIDATED
and re-started against a fresh frozen snapshot.

**END ESTIMATOR.**

## 7. Kernel abstractions (ACT-515 Module 3 — Admit)

The kernel deliberately does NOT model the following gates. This block is
duplicated verbatim in `scripts/act-515/kernel/admit.ts` header (PIN (e))
and a test asserts both copies stay in sync.

- **I5 snapshot gates** — corpus events are pre-filtered to include only
  fresh-i5 rows; the matrix does not re-simulate the I5 layer.
- **Shortability** — Alpaca ETB/HTB state at admit time is inherited from
  the ratified corpus filter; not re-evaluated.
- **Earnings / analyst-downgrade / M&A proximity** (DEC-080/081/082) —
  encoded in the corpus events stream; the kernel does not re-check.
- **Fill mechanics** — entry_price / buying_power / submit_failed live in
  Module 6 (exit / fill). Admit stops at "would this order be sent?".

Gates the kernel DOES model (byte-anchored to
`supabase/functions/overshoot-entry-run/index.ts`):
1. `position_already_open` (SYMBOL-scoped dedup; pyramiding=NO) — :930-935 + :1121-1132.
2. `allocation_cap`  — :1246-1268.
3. `short_daily_budget` (DEC-084; SHORT-only; non-K-consuming) — :1286-1311.
4. `daily_budget` (ACT-501 K=5) — :1313-1332.

## 8. Kernel seams (ACT-515 Module 4 — Size)

The SIZE module computes TARGET slot-notional + integer share count only.
Two side-effects are deliberately NOT handled here; both are named in the
`scripts/act-515/kernel/size.ts` header (PIN (c)) and asserted in sync by a
test in `size_test.ts` (docs-as-code pattern, matches Module 3 §7).

- **Margin carry cost** — 50 bps/month flat on debit balance (charter §1(b),
  see §1 of this file). Accrual is per-day, applied to the equity path.
  **OWNED BY MODULE 7 (equity/DD).** The SIZE module MUST NOT deduct
  interest from slot notional at sizing time; doing so would double-count
  once the equity-path accrual lands.
- **Buying-power / cash-sufficiency** — the R-γ guardrail
  (`assertBuyingPowerCoversNotional`,
  `supabase/functions/_shared/overshoot-execution/sizing.ts:330`) in
  production runs AFTER `computeTargetSizing` and BEFORE order submission.
  **OWNED BY MODULE 6 (fill).** The SIZE module treats the target as
  aspirational; Module 6 refuses (`insufficient_buying_power`) or trims
  by side per production semantics.

**Variant IDs (docs-as-code pin):** the four sizing variants in
`scripts/act-515/kernel/size.ts` (`SIZING_VARIANTS`) MUST match the Row IDs
in `config-matrix.md` §1 byte-for-byte (`1x-const`, `1x-comp`, `2x-const`,
`2x-comp`). R5 (`spy-bh`) is a benchmark, not a sizing variant.

## 9. Missing-bar policy (ACT-515 Module 5 — Mark)

The MARK module (`scripts/act-515/kernel/mark.ts`) prices open lots at daily
close via an INJECTED `BarSource`. Missing bars are handled by an explicit,
declared policy — never a silent zero (anti-phantom, DEC-034 clause 5):

- **Carry-forward-last-close is allowed** up to `maxCarryDays` (default `5`).
  Every carried mark stamps `stalenessDays >= 1` on the lot-day and the
  aggregate reports `staleLots > 0`. `stalenessDays = 0` iff the bar was
  fresh for the requested `sessionDate`.
- **Beyond `maxCarryDays`**, the lot-day propagates a typed
  `mark_unavailable` refusal (see `MarkRefusalCode` in `types.ts`). The DD
  curve consumer MUST NOT silently substitute a zero mark; the halt/delisting
  honesty rule (a DD curve over silent stale marks is fiction) is enforced
  by tests, not comments — see `mark_test.ts::PIN (c) carry-forward staleness
  ladder`.
- **Entry-day missing bar** yields `mark_unavailable` even for a brand-new
  lot: the kernel MUST NOT echo `entryPrice` as a mark. Entry price and
  mark price are semantically distinct (entry is a fill anchor; mark is a
  daily-close observation), and echoing them collapses that distinction.
- **Sign convention** (PIN (b), grep-anchored to production):
  - `unrealized_long  = (mark − entry) × shares`
  - `unrealized_short = (entry − mark) × shares`
  - `market_value_long`  is reported **POSITIVE**; `market_value_short` is
    reported **NEGATIVE** — matching
    `overshoot-equity-snapshot/index.ts:83-89` where `if (mv >= 0) longMv +=
    mv; else shortMv += mv;`. `gross_exposure = long_mv + |short_mv|`.

**Docs-as-code pin:** a test in `mark_test.ts` asserts this section exists
in this file AND the same policy summary line appears verbatim in the
`mark.ts` header (same pattern as §7 Module 3 and §8 Module 4).

## 10. Exit basis + cash seam (ACT-515 Module 6 — Exit)

The EXIT module (`scripts/act-515/kernel/exit.ts`) prices the round-trip on
the STUDIED close basis and exposes the cash seam consumed by Module 7.

- **Exit anchor (SIDE×TIER-DISPATCHED, post-2026-07-25 TIER-A repair).**
  Byte-anchored to production
  `supabase/functions/_shared/overshoot-execution/session-age.ts:57-70/88-93/142-147/266-274`
  and re-scoped from the previous LONG-only phrasing (which incorrectly
  suggested a uniform `T1=ord-6/T2=ord-10` for all sides). The full
  four-way ratified map is:

  | side  | tier | mode          | anchor date              | threshold                            | production cite                     |
  |-------|------|---------------|--------------------------|--------------------------------------|-------------------------------------|
  | long  | T1   | event         | `eventDate`              | `sessionAfter(eventDate, 6)`         | session-age.ts:57-70, :88-93        |
  | long  | T2   | entry (T+1)   | `entryDate`              | `sessionAfter(entryDate, 9)` ⇔ H=10  | session-age.ts:69-73, :142-147      |
  | short | T1   | entry (T+1)   | `entryDate`              | `sessionAfter(entryDate, 4)` ⇔ H=5   | session-age.ts:142-147 (ACT-472 HARD)|
  | short | T2   | entry (T+1)   | `entryDate`              | `sessionAfter(entryDate, 4)` ⇔ H=5   | session-age.ts:142-147 (ACT-472 HARD)|

  **⇔ conversion:** `holdingDayOrdinal ≥ H  ⇔  sessionAfter(entryDate, H − 1)`
  because `holdingDayOrdinal = sessionsSinceEntry + 1` (session-age.ts
  :133-141). Ordinals are resolved by an INJECTED `SessionCalendar` —
  the kernel never reads a calendar globally.

  **OPTION-3 GUARD:** any `(side, tier)` pair absent from the
  `EXIT_ANCHOR_BY_SIDE_TIER` map raises a typed `exit_spec_unmapped`
  refusal. The kernel MUST NEVER silently generalize a LONG anchor to a
  SHORT lot again (the root cause of the pre-TURN-1 Fixture-II
  divergence — see ACT-575 register entry).

  **Fixture-i corroboration (scope-corrected):** the hand-truth fixture
  header (`fixtures/overshoot-backtest/2024-05-02-hand-truth.jsonl:1`)
  corroborates the **LONG T2** leg ONLY (`exit_convention:"ordinal-10
  close (LONG T2, holdingDayOrdinal>=10, session-age.ts:145)"`). The
  SHORT leg is corroborated by the production trace, not fixture-i.
- **Exit price:** the ordinal session's CLOSE from `BarSource`. Haircuts per
  §2 rows "Long-side haircut" (5 bps/side) and "Short-side haircut"
  (15 bps/side) applied under `haircutMode:'study'` (default). `haircutMode:'none'`
  disables both sides — used by the LAYER-1 fixture matcher because the
  hand-truth fixture's `pnl_rule` is `shares × (exit_close − entry_open)`
  with **no haircut** (fixture header, verbatim).
- **Exit-day mark_unavailable interaction (PIN (b)):** if the exit-day
  bar is absent, exit DEFERS to the next priced session, stamping
  `stalenessDays >= 1`. Beyond `maxCarryDays` (default 5, matching Mark),
  a typed `exit_price_unavailable` propagates — never a fabricated exit
  price from the prior mark, never an entry-price echo.
- **DEC-083 09:45-exit is NOT modeled** in the kernel. The kernel prices
  the STUDIED close basis; the morning-exit delta is priced separately by
  the R-007 study (adopted 07-23). Wiring DEC-083 into a kernel run
  requires a new module + charter — the kernel MUST NOT silently pull the
  09:45 mark into the ordinal exit.
- **No partial fills** (all-or-none per fixture); **no early-exit paths**
  by default. Drawdown-stop variants are matrix rows expressed via the
  optional `exitOverride` hook (default OFF).

**Cash seam (consumed by Module 7):**

- `cashRequired(side, slotNotional)` — cash needed at entry.
  Long: `+slotNotional` (buy); Short: `−slotNotional` (short proceeds
  credit; the broker collateral requirement is a Reg-T maintenance issue
  addressed under §1 C9, not a cash outlay).
- `settleProceeds(side, shares, exitClosePostHaircut)` — cash at exit.
  Long: `+shares × exit`; Short: `−shares × exit` (cover cost).
- Round-trip `realized = settleProceeds − cashRequired` — the sign-symmetry
  identity is property-tested in `exit_test.ts` (mirror positions ⇒
  negated realized).

**Docs-as-code pin:** a test in `exit_test.ts` asserts this section exists
in this file AND the exit-basis summary line appears verbatim in the
`exit.ts` header (same pattern as §7 Module 3, §8 Module 4, §9 Module 5).

## 11. LAYER-1 END-TO-END integration gate (D-SCHEDULED after Module 7)

Before ANY matrix cell runs, the assembled kernel pipeline
(types → clock → admit → size → mark → exit → equity/DD) MUST replay
two hand-truth fixtures BYTE-EXACT:

- (i) `fixtures/overshoot-backtest/2024-05-02-hand-truth.jsonl` — every
  row's `shares`, `notional_usd`, `pnl_usd`, `pnl_bps`, plus final
  epoch equity, matched byte-exact under `haircutMode:'none'`.
- (ii) A 2023-Q2 window fixture (per operator B1 ruling) built and
  matched the same way — two eras, one truth standard.
- (iii) The selection-parity replay green.

Any mismatch → STOP, module-level diff hunt, no numbers reported.
This gate carries its own COMPLETE-flag and register row (D-SCHEDULED).

## 12. Equity path + drawdown (ACT-515 Module 7 — Equity/DD)

The EQUITY module (`scripts/act-515/kernel/equity.ts`) walks the per-session
equity path over the assembled book and produces `EquityRow[]` + an
`EquitySummary` matching the frozen matrix columns.

- **Equity definition (PIN (a)):** `equity(t) = cash(t) + longMv(t) + shortMv(t)`
  where `shortMv` is NEGATIVE per Module 5 (§9). Haircuts are already inside
  realized / entry math at the Module-6 cash seam; EQUITY MUST NOT re-apply.
- **Compounding convention (PIN (a)):** verbatim from §3 —
  "the equity path IS compounded — realized gains/losses feed the next day's
  equity, and (for `-comp` sizing variants) feed the next day's slot size."
  EQUITY does not re-size lots — sizing is Module 4's job at entry time.
- **Margin carry (PIN (b)):** 50 bps/month flat on the debit balance
  (`cash < 0`), applied per-session as
  `carry(t) = max(0, -cash_end_of_day) × (0.0050 × 12 / 252)`.
  Policy summary line (docs-as-code anchor — do not edit without also editing
  `equity.ts` PIN (b)):
    carry(t) = max(0, -cash_end_of_day) × (0.0050 × 12 / 252).
  1×-const paths accrue ZERO carry by construction (starting equity covers
  40 slots × $2.5k = $100k of aspirational notional).
- **Drawdown (PIN (c)):** running peak; `dd(t) = (peak − equity(t)) / peak`;
  report `maxDd` with (peakDate, troughDate, recoveryDate | 'UNRECOVERED')
  and worst-calendar-year return. Column IDs (`max-p2t-dd`, `dd-dates`,
  `dd-duration-days`, `dd-recovery-days`, `cagr`, `margin-interest`) are
  byte-matched to `config-matrix.md §3` via a docs-as-code test.
- **Ledger foot property (PIN (e)):** for every t,
  `equity(t) − equity(t−1) = realizedToday + Δunrealized − carryToday`,
  asserted to the cent across a multi-lot synthetic path (no-leak invariant).

**Docs-as-code pin:** a test in `equity_test.ts` asserts this section exists
in this file AND the carry-formula summary line + column-ID list appear in
both `equity.ts` and this file (same pattern as §7/§8/§9/§10).
## §7-survivorship — Universe basis honesty (ACT-515 R1, ratified 2026-07-25)

**Section number note:** §7 in this file already carries "Kernel abstractions
Module 3" (landed 2026-06-XX). The R1-receipt survivorship block is filed
here as **§7-survivorship** to preserve prior anchors — do not renumber the
older §7 without a docs-as-code migration turn.

**Universe basis for R1 (`1x-const` baseline) and all downstream matrix
configs:** per-session universe membership is resolved as

    active_at(session) := (added_as_of ≤ session) ∧ (active = TRUE)

as observed AT REPLAY TIME on `public.overshoot_universe`. This is
**survivorship-biased**: tickers that were once in the universe but were
later removed (`active = FALSE`) are **excluded even from sessions where
they were legitimately live**. R1 therefore over-represents tickers that
survived to the replay date.

**Bound reporting (mandatory in every matrix receipt):** the R1 receipt
MUST report:
1. `corpus_rows_total` — count of rows in
   `overshoot_study_candidate_events` for `run_id = 1888e113` within the
   window.
2. `corpus_rows_excluded_by_universe` — count of the above whose
   `(ticker, event_date)` does NOT satisfy `active_at(event_date)`.
3. `corpus_rows_consumed` — count actually reconstructed into the
   `SessionPlan` stream. Identity: `consumed = total − excluded`.

**Compensating controls (not fixes):** (a) all matrix configs share the
same universe basis, so ranking (variant vs. variant) is unbiased even if
absolute returns are; (b) the ACT-515 charter explicitly deprioritized
point-in-time universe rebuild (DW-XXX) pending the R1-receipt
quantification of the bias size.

**Docs-as-code pin (deferred to R1-receipt turn):** a test in
`matrix/run-r1-const_test.ts` will assert this block exists in this file
AND that the three bound-report field names above appear verbatim in
`run-r1-const.ts` receipt-writer once landed.

### §7-survivorship addendum (RULING 2026-07-26 · DEV-R R-1)

**Engine gate REMOVED.** The `isActiveAt(ticker, event_date)` filter is no
longer applied in `run-r1-const.ts` step 2. The corpus inherits its
universe from the study run (M-1 law, RULING 2026-07-26): filtering rows
at replay-time against the as-of-today `overshoot_universe` snapshot would
drop rows the study already accepted, biasing the receipt in the exact
direction §7-survivorship warns against.

**Bound reporting is now snapshot-based**, not engine-based. R1 receipts
report the bound from the `universe.jsonl` trailer produced by
`overshoot-matrix-export?mode=universe`:

- `active_count` — currently-active roster size (905 at Turn-1 seal).
- `corpus_ticker_count` — distinct tickers in corpus `1888e113` (839).
- `intersection_count` — tickers in both (824).
- `corpus_only_count` — in-corpus but no longer active (**15** = the
  measured survivorship exposure). This is the §7 bound.
- `active_only_count` — active today but never in corpus (81).

Consequence for the receipt fields defined above:
`corpus_rows_excluded_by_universe = 0` under R-1 (no engine gate applied).
`corpus_rows_consumed = corpus_rows_total`. The bound is quantified out-of-band
via the trailer values above and printed in the receipt's caveat block.

**R-2 rejected:** fabricating a replay-time `added_as_of` value is the
INC-141 defect class (silent temporal drift). Do not reintroduce.
