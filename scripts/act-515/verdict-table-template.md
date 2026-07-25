# ACT-515 Verdict Table — TEMPLATE (numbers PENDING)

**Template frozen:** 2026-07-25T05:27:07Z. Cells marked `PENDING` fill per-config as
chains land. Cells failing n-thresholds (see `config-matrix.md` §5) stamp
`INSUFFICIENT-N` and are NEVER quoted as decision input.

**No column may be added, renamed, or reinterpreted post-numbers without an INC + amendment stamp.**

## 1. Primary five-row table (§C1..C12)

| Row | C1 sep22-mo | C2 max-dd | C3 dd-dates (peak / trough / recovery) | C4 dd-dur-d | C5 dd-rec-d | C6 CAGR | C7 Sharpe | C8 Sortino | C9 days-in-call | C10 mgn-int $ | C11 mean/max lots | C12 % days at cap |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 `1x-const` | PENDING | PENDING | PENDING / PENDING / PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | 0 (by construction) | 0 (by construction) | PENDING | PENDING |
| R2 `1x-comp`  | PENDING | PENDING | PENDING / PENDING / PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | 0 (by construction) | 0 (by construction) | PENDING | PENDING |
| R3 `2x-const` | PENDING | PENDING | PENDING / PENDING / PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| R4 `2x-comp`  | PENDING | PENDING | PENDING / PENDING / PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| R5 `spy-bh`   | PENDING | PENDING | PENDING / PENDING / PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | 0 (by construction) | 0 (by construction) | n/a | n/a |

## 2. Five-deepest-DDs sub-table (per row R1..R5)

Repeat this block once per row.

### R{N} `{row-id}` — five deepest DDs

| Rank | Peak date | Trough date | Recovery date | DD % | Book at peak | Regime peak / trough / recovery | Attrib in-flight bleed % | Attrib cap-refused % |
|---|---|---|---|---|---|---|---|---|
| 1 | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| 2 | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| 3 | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| 4 | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |
| 5 | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING | PENDING |

## 3. 2022-H2 monthly matrix vs SPY

| Month | R1 `1x-const` | R2 `1x-comp` | R3 `2x-const` | R4 `2x-comp` | R5 SPY |
|---|---|---|---|---|---|
| 2022-07 | PENDING | PENDING | PENDING | PENDING | PENDING |
| 2022-08 | PENDING | PENDING | PENDING | PENDING | PENDING |
| 2022-09 | PENDING | PENDING | PENDING | PENDING | PENDING |
| 2022-10 | PENDING | PENDING | PENDING | PENDING | PENDING |
| 2022-11 | PENDING | PENDING | PENDING | PENDING | PENDING |
| 2022-12 | PENDING | PENDING | PENDING | PENDING | PENDING |
| **H2 total** | PENDING | PENDING | PENDING | PENDING | PENDING |

## 4. Regime-exit counterfactual (d1/d2/d3) — per-event

Repeat once per event × mechanism (2 events × 3 mechanisms = 6 blocks). INSUFFICIENT-N
rule: `lots-affected < 5` → signed delta cells stamp `INSUFFICIENT-N`, no adoption
vote.

### Event E1: Sept-2022 BEAR crossing · Mechanism d{k}

| Metric | Value |
|---|---|
| Bleed avoided ($) | PENDING |
| Bounce forgone ($) | PENDING |
| Net P&L delta ($) | PENDING |
| Lots affected | PENDING |
| Remaining-horizon histogram (days: count) | PENDING |
| Realized cost basis vs mark ($) | PENDING |

### Event E2: Apr-2025 2-day BEAR touch · Mechanism d{k}

*(same table)*

## 5. Full-window rows added on adoption-rule pass ONLY

On adoption-rule PASS for a mechanism, insert its full-window row into the primary
matrix (§1 above) with row IDs `1x-const + d1`, `1x-const + d2`, `1x-const + d3`.
Compounding equivalents added ONLY if the constant-notional row warrants further
examination (charter §1(d)). Mechanisms that fail the adoption rule are documented as
REFUSED in the verdict summary but do NOT get a row inserted.

## 6. Verdict summary (per mechanism)

| Mechanism | CAGR criterion (≥ R1) | DD reduction ≥ 5pp | No single-year CAGR loss > 0.5pp | Verdict | Notes |
|---|---|---|---|---|---|
| d1 full-exit | PENDING | PENDING | PENDING | PENDING | |
| d2 tail-only | PENDING | PENDING | PENDING | PENDING | |
| d3 halved | PENDING | PENDING | PENDING | PENDING | |

**Verdict values:** `ADOPT` · `REFUSE` · `INSUFFICIENT-N-DEFER`. On two ADOPTs, pick
higher (DD-reduction / CAGR-cost) ratio; other filed as viable alternative. Ties broken
d3 > d2 > d1.

## 7. Operator read-per-config paragraphs (charter deliverable §4 of user instruction)

One paragraph per row R1..R5, plus one per adopted d-mechanism. Plain-language
description of what the config does to drawdown / return / risk exposure. NO paragraph
written until numbers land — placeholder shown below.

### R1 `1x-const` — operator read

> PENDING.

### R2 `1x-comp` — operator read

> PENDING.

### R3 `2x-const` — operator read (plain: what 2× does to drawdown)

> PENDING.

### R4 `2x-comp` — operator read (primary Phase-L input)

> PENDING.

### R5 `spy-bh` — operator read (benchmark)

> PENDING.

### Regime-exit mechanism operator reads

> PENDING per mechanism as verdicts land (plain: what the sector cap costs/buys, etc.
> — note: sector-cap is NOT part of this charter's tri-config; if operator's ruling
> "sector-cap variants (state the cap levels from the charter)" refers to a companion
> ACT-515 sub-charter, it must be surfaced — see `compute-plan.md` §Blockers B2).

**END TEMPLATE.**