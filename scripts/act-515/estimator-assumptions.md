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