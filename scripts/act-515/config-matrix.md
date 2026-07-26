# ACT-515 Config Matrix — FROZEN

**Frozen:** 2026-07-25T05:27:07Z · **Governing charter:** `docs/08-planning/artifacts/ACT-515-CHARTER-capped-stateful-sim-leverage-comparison.md`

## 1. The five primary rows (§2 charter)

Rows = config × sizing variant. All five run on the same corpus/window/haircuts.

| # | Row ID | Leverage | Sizing variant | Charter § |
|---|---|---|---|---|
| R1 | `1x-const` | 1.0× | Constant-notional ($2,500/slot, sizingBase frozen at $100k) | §1(a) + §1 sizing |
| R2 | `1x-comp`  | 1.0× | Compounding (slot = equity_t × 0.025 × 1.0, daily recompute) | §1(a) + §1 sizing |
| R3 | `2x-const` | 2.0× | Constant-notional ($5,000/slot, sizingBase frozen at $100k × 2) | §1(b) + §1 sizing |
| R4 | `2x-comp`  | 2.0× | Compounding (slot = equity_t × 0.025 × 2.0, daily recompute) | §1(b) + §1 sizing |
| R5 | `spy-bh`   | n/a  | $100k → SPY at close 2022-06-29 → mark daily → sell 2026-07-10 | §1(c) |

**Primary Phase-L input:** R4 (`2x-comp`). Diagnostic-comparability rows: R1/R3 constant.
SPY benchmark: R5.

## 2. Common corpus / window / mechanics (FROZEN)

> **STALE-PROSE ANNOTATION (2026-07-25, GAP-1(c) ruling).** Any per-tier
> entry-offset or exit-horizon numbers written in prose in this §2 are
> **stale** and non-authoritative. The AUTHORITATIVE dispatch is
> `EXIT_ANCHOR_BY_SIDE_TIER` in `scripts/act-515/kernel/exit.ts`
> (LONG T1: entry+10, LONG T2: entry+5, SHORT T1/T2: entry+4). Any
> discrepancy → the kernel constant wins; docs are updated in a follow-up
> turn, never the code.


| Element | Value | Provenance |
|---|---|---|
| Window | 2022-06-29 → 2026-07-10 (~1,011 trading days, 4.03 yr) | ACT-514 basis |
| Event corpus | study run `1888e113` | ACT-514 §preamble |
| Selection cells | live-ratified run `045d2dfc`, exclusion_width=5 | ACT-514 §preamble |
| Horizons | T1: T+2 entry / T+6 exit · T2: T+1 / T+11 · SHORT: T+1 / T+6 | ACT-514 §preamble |
| Haircuts | 5 bps long / 15 bps short each side (study-ratified) | ACT-514 §preamble |
| Starting equity | $100,000 | ACT-514 basis |
| Per-day admission cap | K=5 | `overshoot-entry-run` prod config |
| Concurrent cap | 40 slots total (36 long + 4 short), hard against OPEN BOOK | Charter §1(a) |
| Wallet cap | `evaluateAllocationCap` semantics: 0.90 long / 0.10 short of `sizingBase`, side-scoped | INC-96 / charter §1(a) |
| Rank-order | Best `rank_score` first, refusals typed `allocation_cap_reached` | Charter §1(a) |
| Regime governor | SPY-drawdown bands per `_shared/overshoot/regime.ts` (ACT-478) | Charter §1 |
| Short-side threshold | signed excess ≤ −0.08 (ACT-575-ratified) | detector.ts:801 |
| SHORT pacing | Matrix replay runs `shortDailyBudget = K` (NON-BINDING); the 4-slot book cap + 0.10 wallet cap are the binding SHORT constraints. Live operation currently paces shorts 1/day (DEC-084) as a **live-era operational ramp**, absent from ACT-515 charter §1(a) and from the studied basis. The matrix replays chartered geometry WITHOUT ramp pacing — configs compare steady-state strategy, not rollout schedule. | RULING 2026-07-26 (G-1 batch); reconstructor.ts header "PACING DISCLOSURE" |
| SHORT tier convention | Recorded as `'T2'` by the reconstructor. Production emits `tier=null` per detector.ts:288-296/:506-511; both short map slots resolve identically to `entry+4/H=5` per kernel/exit.ts:175-176. G-2 rejected (post-gate map surgery). | RULING 2026-07-26 (G-1); reconstructor.ts `SHORT_TIER_CONVENTION` |
| SHORT entry offset | T+1 open. Anchored to (i) certified fixture-ii SHORT rows (TSLA 2023-04-03 → 2023-04-04, byte-exact); (ii) live entry-run cadence (22:00Z detect → next-session 13:35Z entry = T+1). The §2 prose above agreeing is coincidence, not authority (STALE-PROSE-annotated per GAP-1(c)). | RULING 2026-07-26 (H-1); reconstructor.ts `SHORT_ENTRY_OFFSET_SESSIONS` |

## 3. Columns (12) — FROZEN TABLE SHAPE

Applies to every row R1..R5. Column IDs are the header slugs used in
`verdict-table-template.md`.

| # | Col ID | Definition | Applies to | n-threshold |
|---|---|---|---|---|
| C1  | `sep22-month-return` | Full-month P&L in Sept-2022, the max-DD event month | all | n/a (single-month) |
| C2  | `max-p2t-dd`         | Peak-to-trough drawdown over full window, MTM basis, compounding on the equity path (see estimator §3) | all | n/a |
| C3  | `dd-dates`           | Peak date / trough date / recovery date (recovery = first day back to prior peak; `UNRECOVERED` if none) | all | n/a |
| C4  | `dd-duration-days`   | Business days peak→trough | all | n/a |
| C5  | `dd-recovery-days`   | Business days trough→recovery; `N/A-UNRECOVERED` if none | all | n/a |
| C6  | `cagr`               | Full-window annualized total return, geometric | all | n/a |
| C7  | `sharpe`             | Annualized, daily log-returns, rf=0 | all | n/a |
| C8  | `sortino`            | Annualized, daily log-returns, MAR=0 | all | n/a |
| C9  | `days-in-call`       | Days where equity < 0.25 × gross_market_value (long) or short-side equivalent | R3/R4 only | 0 for R1/R2/R5 by construction |
| C10 | `margin-interest`    | Cumulative $ margin interest on debit balance (see estimator §1) | R3/R4 only | 0 for R1/R2/R5 by construction |
| C11 | `mean-max-open-lots` | Mean / max concurrent open lots across the window | all | n/a |
| C12 | `pct-days-at-cap`    | % of days where open-lot count == 40 (or wallet cap saturated) | all | n/a |

## 4. Sub-matrices required per config

### 4a. Five-deepest-DDs table (per row R1..R5)

Columns: `rank (1..5) · peak-date · trough-date · recovery-date · dd-pct · book-at-peak · regime-at-peak · regime-at-trough · regime-at-recovery · attribution-inflight-bleed-pct · attribution-cap-refused-pct`.

### 4b. 2022-H2 monthly matrix vs SPY

Rows: months 2022-07 through 2022-12. Columns: R1..R5 monthly return · SPY monthly return.

### 4c. Regime-exit counterfactuals (charter §1(d))

Run inside R1 (`1x-const` primary) and optionally R2 (`1x-comp`) if the constant-notional
row shows a mechanism warrants further examination (do NOT proliferate compounding rows
for mechanisms already refused by the adoption rule — charter §1(d) rows note).

**Variants:** d1 (FULL EXIT AT CROSSING) · d2 (TAIL-ONLY EXIT, >5d remaining horizon) · d3 (HORIZON-HALVING).

**Trigger events:** Sept-2022 BEAR crossing (deep, N=1) · Apr-2025 2-day BEAR touch (shallow flash, N=1). **Combined statistics NOT aggregated** — samples structurally different.

**Per-event columns (each of d1/d2/d3 × each of 2 events):**
`bleed-avoided-usd · bounce-forgone-usd · net-pnl-delta-usd · lots-affected · remaining-horizon-histogram · realized-cost-basis-vs-mark`.

**Full-window rows added to the primary matrix on adoption-rule pass ONLY:** `1x-const + d1`, `1x-const + d2`, `1x-const + d3` (+ compounding equivalents only if constant row warrants).

## 5. Pre-committed n-thresholds and INSUFFICIENT-N rule

| Cell class | n-threshold | Rule on failure |
|---|---|---|
| Per-config full-window metric (C1..C12) | n = 1,011 trading days (window fixed) — always sufficient by construction | n/a |
| Regime-exit per-event delta (d1/d2/d3) | `lots-affected` ≥ 5 to quote a signed net-PnL delta | Cell stamped `INSUFFICIENT-N`, no adoption vote possible for that (mechanism, event) pair |
| Regime-exit adoption vote | BOTH events must return non-INSUFFICIENT-N per mechanism | Otherwise mechanism verdict = `INSUFFICIENT-N-DEFER`, not `REFUSE` and not `ADOPT` |
| Five-deepest-DDs attribution split | `book-at-peak` ≥ 10 lots to attribute in-flight vs cap-refused | Otherwise both attribution cells = `INSUFFICIENT-N`; DD entry still reported |

**INSUFFICIENT-N cells are NEVER quoted as decision input.** They are surfaced in the
deliverable exactly to prevent silent under-N inference — the anti-completion-theater
contract from INC-135/136.

## 6. Pre-committed adoption rule for (d) — verbatim from charter §1(d) "PRE-COMMITTED ADOPTION RULE"

A regime-exit mechanism ships as an operator recommendation **ONLY IF ALL** hold on
MEASURED curves:

1. **Full-window CAGR ≥ baseline R1 (`1x-const`) CAGR** — mechanism does not cost aggregate return.
2. **Max-DD reduction ≥ 5 pp** vs baseline R1 — meaningful risk attenuation, not a rounding-band change.
3. **No single calendar year has CAGR reduction > 0.5 pp** vs baseline R1 — no hidden year-scale ROI transfer.

ANY criterion fails → mechanism `REFUSED`, finding filed as "the bear-onset bleed is
paid-for risk, structural feature not policy-patchable" (charter §1(d)).

Per-mechanism BINARY: d1/d2/d3 evaluated independently. Two pass → pick higher
(DD-reduction-pp / CAGR-cost-pp) ratio; the other filed as viable alternative. Ties
broken toward softer: d3 > d2 > d1.

## 7. Change control on this matrix

No column definition, n-threshold, or adoption rule may be edited post-numbers except
via a filed INC + amendment stamp. Additions (new diagnostic columns) are allowed if
clearly marked `POST-COMMIT-ADD` in the deliverable and do NOT displace or reinterpret
any pre-committed cell.

**END MATRIX.**